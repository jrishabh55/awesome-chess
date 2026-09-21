import { Chess } from 'chess.js';
import type { PositionInput } from '../chess/types';
import { prepareWorker, type EngineLoadState } from '../engine/prepare-worker';

export type Strength = { kind: 'skill' | 'elo'; value: number } | { kind: 'full' };
const canceled = () => new DOMException('Game engine canceled', 'AbortError');
type WorkerFactory = (
  signal: AbortSignal,
  progress: (state: EngineLoadState) => void,
) => Promise<Worker>;

/** Play has its own worker: review always keeps its full-strength settings. */
export class PlayEngine {
  private worker: Worker | null = null;
  private lifetime = new AbortController();
  private initialization: Promise<void> | null = null;
  private listeners = new Set<(line: string) => void>();
  private fail: ((error: Error) => void) | null = null;
  private busy = false;
  private eloRange: [number, number] | null = null;
  private supportsSkill = false;
  private supportsLimit = false;

  constructor(
    private progress: (state: EngineLoadState) => void,
    private factory: WorkerFactory = (signal, progress) => prepareWorker('lite', signal, progress),
  ) {}

  private send(command: string) {
    this.worker?.postMessage(command);
  }

  private waitFor(prefix: string, action: () => void, timeout = 15000): Promise<string> {
    if (this.lifetime.signal.aborted) return Promise.reject(canceled());
    return new Promise((resolve, reject) => {
      const clean = () => {
        clearTimeout(timer);
        this.listeners.delete(receive);
        if (this.fail === fail) this.fail = null;
      };
      const fail = (error: Error) => {
        clean();
        reject(error);
      };
      const receive = (line: string) => {
        if (line === prefix || line.startsWith(prefix + ' ')) {
          clean();
          resolve(line);
        }
      };
      const timer = setTimeout(
        () => fail(Error('Stockfish took too long to respond. Retry the engine.')),
        timeout,
      );
      this.listeners.add(receive);
      this.fail = fail;
      try {
        action();
      } catch (error) {
        fail(error instanceof Error ? error : Error(String(error)));
      }
    });
  }

  start(): Promise<void> {
    if (this.lifetime.signal.aborted) return Promise.reject(canceled());
    if (this.initialization) return this.initialization;
    this.initialization = (async () => {
      const worker = await this.factory(this.lifetime.signal, this.progress);
      if (this.lifetime.signal.aborted) {
        worker.terminate();
        throw canceled();
      }
      this.worker = worker;
      worker.onmessage = (event) => {
        if (this.lifetime.signal.aborted) return;
        for (const raw of String(event.data).split('\n')) {
          const line = raw.trim();
          const range = line.match(/^option name UCI_Elo type spin .* min (\d+) max (\d+)/);
          if (range) this.eloRange = [Number(range[1]), Number(range[2])];
          if (line.startsWith('option name Skill Level type spin ')) this.supportsSkill = true;
          if (line.startsWith('option name UCI_LimitStrength type check '))
            this.supportsLimit = true;
          if (line.includes('CRITICAL ERROR'))
            this.fail?.(Error('Stockfish rejected this position. Retry the engine.'));
          for (const listener of [...this.listeners]) listener(line);
        }
      };
      worker.onerror = () =>
        this.fail?.(Error('Stockfish stopped unexpectedly. Retry the engine.'));
      await this.waitFor('uciok', () => this.send('uci'), 120000);
      await this.waitFor('readyok', () => {
        this.send('setoption name Threads value 1');
        this.send('setoption name Hash value 32');
        this.send('setoption name MultiPV value 1');
        this.send('setoption name Ponder value false');
        this.send('ucinewgame');
        this.send('isready');
      });
      if (this.lifetime.signal.aborted) throw canceled();
      this.progress({ phase: 'ready', loaded: 0, total: 0 });
    })().catch((error) => {
      this.dispose();
      throw error;
    });
    return this.initialization;
  }

  async bestMove(
    position: PositionInput,
    strength: Strength,
    signal: AbortSignal,
  ): Promise<string> {
    if (signal.aborted || this.lifetime.signal.aborted) throw canceled();
    if (this.busy) throw Error('Stockfish is already thinking.');
    this.busy = true;
    // UCI has no request IDs. Destroy an interrupted worker so a late bestmove
    // can never satisfy a request in a new game or after a retry.
    const abort = () => this.dispose();
    signal.addEventListener('abort', abort, { once: true });
    try {
      await this.start();
      if (signal.aborted) throw canceled();
      const chess = new Chess(position.rootFen);
      for (const move of position.moves) chess.move(move);
      if (chess.isGameOver()) throw Error('This game is already over.');
      if (!this.supportsSkill || !this.supportsLimit)
        throw Error('This engine does not support adjustable strength.');
      if (
        strength.kind === 'elo' &&
        (!this.eloRange ||
          !Number.isInteger(strength.value) ||
          strength.value < this.eloRange[0] ||
          strength.value > this.eloRange[1])
      )
        throw Error('That rating is outside the supported engine range.');
      if (
        strength.kind === 'skill' &&
        (!Number.isInteger(strength.value) || strength.value < 0 || strength.value > 20)
      )
        throw Error('That skill is outside the supported engine range.');
      await this.waitFor('readyok', () => {
        this.send(`setoption name UCI_LimitStrength value ${strength.kind === 'elo'}`);
        this.send(
          `setoption name Skill Level value ${strength.kind === 'skill' ? strength.value : 20}`,
        );
        if (strength.kind === 'elo') this.send(`setoption name UCI_Elo value ${strength.value}`);
        this.send('isready');
      });
      if (signal.aborted) throw canceled();
      const response = await this.waitFor(
        'bestmove',
        () => {
          this.send(
            `position fen ${position.rootFen}${position.moves.length ? ' moves ' + position.moves.join(' ') : ''}`,
          );
          this.send(`go movetime ${strength.kind === 'full' ? 1500 : 800}`);
        },
        20000,
      );
      if (signal.aborted) throw canceled();
      const move = response.split(/\s+/)[1];
      if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move || ''))
        throw Error('Stockfish returned no legal move. Retry the engine.');
      try {
        chess.move(move);
      } catch {
        throw Error('Stockfish returned an illegal move. Retry the engine.');
      }
      return move;
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      signal.removeEventListener('abort', abort);
      this.busy = false;
    }
  }

  dispose() {
    if (this.lifetime.signal.aborted) return;
    this.lifetime.abort();
    this.fail?.(canceled());
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
      this.worker = null;
    }
    this.listeners.clear();
  }
}
