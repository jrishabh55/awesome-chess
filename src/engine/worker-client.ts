import { Chess } from 'chess.js';
import type { PositionInput } from '../chess/types';
import type { AnalysisResult, AnalyzeRequest, EngineFlavor, EngineLine } from './types';
import { engineUrl } from './types';
import { parseInfo } from './uci';
const abortError = () => new DOMException('Analysis canceled', 'AbortError');
export const positionKey = (p: PositionInput, engineId: string, profileId: string) =>
  JSON.stringify([p.rootFen, p.moves, engineId, profileId]);
type Job = {
  request: AnalyzeRequest;
  signal: AbortSignal;
  update?: (r: AnalysisResult) => void;
  resolve: (r: AnalysisResult) => void;
  reject: (e: unknown) => void;
};
export class EngineClient {
  private worker: Worker | null = null;
  private listeners = new Set<(s: string) => void>();
  private ready: Promise<void> | null = null;
  private queue: Job[] = [];
  private running = false;
  private dead = false;
  private lifetime = new AbortController();
  private fault: ((error: Error) => void) | null = null;
  engineId = 'Stockfish 19';
  constructor(
    public flavor: EngineFlavor = 'full',
    private factory: (url: string, signal: AbortSignal) => Worker | Promise<Worker> = (url) =>
      new Worker(url),
  ) {}
  private send(s: string) {
    this.worker?.postMessage(s);
  }
  private waitFor(prefix: string, action: () => void, timeout = 30000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(Error('Engine took too long to respond. Retry or select the lightweight engine.'));
      }, timeout);
      const listener = (s: string) => {
        if (s.startsWith(prefix)) {
          cleanup();
          resolve(s);
        }
      };
      const fail = (e: Error) => {
        cleanup();
        reject(e);
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.listeners.delete(listener);
        if (this.fault === fail) this.fault = null;
      };
      this.fault = fail;
      this.listeners.add(listener);
      action();
    });
  }
  private initialize() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      this.worker = await this.factory(engineUrl(this.flavor), this.lifetime.signal);
      if (this.dead) {
        this.worker.terminate();
        throw abortError();
      }
      this.worker.onmessage = (event) => {
        for (const line of String(event.data).split('\n')) {
          if (line.startsWith('id name ')) this.engineId = line.slice(8);
          for (const fn of [...this.listeners]) fn(line);
        }
      };
      this.worker.onerror = () => {
        this.fault?.(
          Error('Stockfish could not load. Download its assets or choose the lightweight engine.'),
        );
      };
      // A cold 95 MB WASM download can exceed two minutes on a hosted connection.
      // Keep the normal search timeouts short; only engine startup gets this budget.
      await this.waitFor('uciok', () => this.send('uci'), this.flavor === 'full' ? 600000 : 120000);
      if (!/Stockfish 19\b/.test(this.engineId)) throw Error(`Unexpected engine: ${this.engineId}`);
      await this.waitFor('readyok', () => {
        this.send('setoption name Hash value 64');
        this.send('setoption name Threads value 1');
        this.send('setoption name UCI_LimitStrength value false');
        this.send('setoption name Skill Level value 20');
        this.send('isready');
      });
    })();
    return this.ready;
  }
  analyze(
    request: AnalyzeRequest,
    signal: AbortSignal,
    update?: (r: AnalysisResult) => void,
  ): Promise<AnalysisResult> {
    if (this.dead || signal.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const job = { request, signal, update, resolve, reject };
      if (request.id.startsWith('interactive')) this.queue.unshift(job);
      else this.queue.push(job);
      void this.pump();
    });
  }
  private async pump() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length && !this.dead) {
      const job = this.queue.shift()!;
      if (job.signal.aborted) {
        job.reject(abortError());
        continue;
      }
      try {
        await this.initialize();
        if (job.signal.aborted) throw abortError();
        job.resolve(await this.run(job));
      } catch (e) {
        job.reject(e);
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          this.worker?.terminate();
          this.worker = null;
          this.ready = null;
          this.listeners.clear();
        }
      }
    }
    this.running = false;
  }
  private async run(job: Job): Promise<AnalysisResult> {
    const { request: r, signal, update } = job;
    const c = new Chess(r.position.rootFen);
    r.position.moves.forEach((m) => c.move(m));
    const turn = c.turn();
    const profileId = `${this.flavor}:full-strength`;
    const result = (lines: EngineLine[], completed: boolean): AnalysisResult => ({
      requestId: r.id,
      engineId: this.engineId,
      profileId,
      positionKey: positionKey(r.position, this.engineId, profileId),
      lines,
      completed,
    });
    if (c.isGameOver()) {
      const score = c.isCheckmate()
        ? {
            kind: 'mate' as const,
            moves: 0,
            winner: turn === 'w' ? ('b' as const) : ('w' as const),
          }
        : { kind: 'cp' as const, value: 0 };
      return result([{ rank: 1, depth: 0, score, pv: [], bound: 'exact' }], true);
    }
    await this.waitFor('readyok', () => {
      this.send(`setoption name MultiPV value ${r.rootMoves?.length === 1 ? 1 : r.multiPv}`);
      this.send('setoption name UCI_LimitStrength value false');
      this.send('setoption name Skill Level value 20');
      this.send('isready');
    });
    if (signal.aborted) throw abortError();
    return new Promise((resolve, reject) => {
      const lines = new Map<number, EngineLine>();
      const depths = new Map<number, Map<number, EngineLine>>();
      let complete: EngineLine[] = [];
      let lastUpdate = 0;
      const required = Math.min(r.multiPv, r.rootMoves?.length || c.moves().length);
      let stopTimer: ReturnType<typeof setTimeout> | undefined;
      const maxWait =
        r.budget.kind === 'infinite'
          ? 0
          : r.budget.kind === 'time'
            ? r.budget.milliseconds + 30000
            : 180000;
      const timer = maxWait
        ? setTimeout(
            () => fail(Error('Analysis timed out; lower the search depth and retry.')),
            maxWait,
          )
        : undefined;
      const finish = () => {
        if (signal.aborted) {
          cleanup();
          reject(abortError());
          return;
        }
        const all = complete;
        cleanup();
        if (!all.length) reject(Error('Engine returned no completed evaluation.'));
        else resolve(result(all, true));
      };
      const listener = (text: string) => {
        if (text.startsWith('bestmove')) {
          finish();
          return;
        }
        const line = parseInfo(text, turn);
        if (line) {
          if (line.bound === 'exact') {
            lines.set(line.rank, line);
            const group = depths.get(line.depth) || new Map<number, EngineLine>();
            group.set(line.rank, line);
            depths.set(line.depth, group);
            const ordered = [...group.values()].sort((a, b) => a.rank - b.rank);
            if (
              ordered.length === required &&
              ordered.every((l, i) => l.rank === i + 1) &&
              new Set(ordered.map((l) => l.pv[0])).size === required &&
              line.depth >= (complete[0]?.depth || 0)
            )
              complete = ordered;
          }
          if (performance.now() - lastUpdate >= 100) {
            lastUpdate = performance.now();
            update?.(
              result(
                complete.length
                  ? complete
                  : [...lines.values()]
                      .filter((l) => l.depth === line.depth)
                      .sort((a, b) => a.rank - b.rank),
                false,
              ),
            );
          }
        }
      };
      const fail = (e: Error) => {
        cleanup();
        this.worker?.terminate();
        this.worker = null;
        this.ready = null;
        reject(e);
      };
      const cleanup = () => {
        clearTimeout(timer);
        clearTimeout(stopTimer);
        this.listeners.delete(listener);
        signal.removeEventListener('abort', stop);
        this.fault = null;
      };
      const stop = () => {
        this.send('stop');
        stopTimer = setTimeout(() => fail(abortError()), 3000);
      };
      this.listeners.add(listener);
      this.fault = fail;
      signal.addEventListener('abort', stop, { once: true });
      this.send(
        `position fen ${r.position.rootFen}${r.position.moves.length ? ' moves ' + r.position.moves.join(' ') : ''}`,
      );
      const budget =
        r.budget.kind === 'depth'
          ? `depth ${r.budget.depth}`
          : r.budget.kind === 'time'
            ? `movetime ${r.budget.milliseconds}`
            : 'infinite';
      this.send(
        `go ${budget}${r.rootMoves?.length ? ' searchmoves ' + r.rootMoves.join(' ') : ''}`,
      );
    });
  }
  dispose() {
    this.dead = true;
    this.lifetime.abort();
    this.fault?.(abortError());
    this.worker?.terminate();
    this.worker = null;
    this.queue.splice(0).forEach((j) => j.reject(abortError()));
    this.listeners.clear();
  }
}
