import { Chess } from 'chess.js';
import type { PositionInput } from '../../chess/types';
import type { EngineLoadState } from '../../engine/prepare-worker';
import { prepareMaiaWorker, type MaiaWorkerResources } from './assets';
import { encodePosition, sampleMove } from './policy';

const canceled = () => new DOMException('Maia engine canceled', 'AbortError');
type Pending = {
  resolve(value?: ArrayBuffer): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
};
export class MaiaEngine {
  private worker: Worker | null = null;
  private lifetime = new AbortController();
  private initialization: Promise<void> | null = null;
  private ready: Pending | null = null;
  private requests = new Map<number, Pending>();
  private nextId = 0;
  private busy = false;
  constructor(
    private rating: number,
    private progress: (state: EngineLoadState) => void,
    private factory: (
      signal: AbortSignal,
      progress: (state: EngineLoadState) => void,
    ) => Promise<MaiaWorkerResources> = prepareMaiaWorker,
  ) {
    if (!Number.isInteger(rating) || rating < 600 || rating > 2600)
      throw Error('Maia ratings must be whole numbers from 600 to 2600.');
  }
  private receive(data: { type: string; id?: number; logits?: ArrayBuffer; message?: string }) {
    if (this.lifetime.signal.aborted) return;
    const pending =
      data.type === 'ready' || data.id === undefined ? this.ready : this.requests.get(data.id);
    if (!pending) return;
    if (data.type === 'error') pending.reject(Error(data.message || 'Maia stopped unexpectedly.'));
    else if (data.type === 'ready') pending.resolve();
    else if (data.type === 'result') {
      if (!(data.logits instanceof ArrayBuffer) || data.logits.byteLength !== 4352 * 4)
        pending.reject(Error('Maia returned an invalid move policy. Retry the engine.'));
      else pending.resolve(data.logits);
    } else return;
    clearTimeout(pending.timer);
    if (pending === this.ready) this.ready = null;
    else this.requests.delete(data.id!);
  }
  start(): Promise<void> {
    if (this.lifetime.signal.aborted) return Promise.reject(canceled());
    if (this.initialization) return this.initialization;
    this.initialization = (async () => {
      const { worker, init } = await this.factory(this.lifetime.signal, this.progress);
      if (this.lifetime.signal.aborted) {
        worker.terminate();
        throw canceled();
      }
      this.worker = worker;
      worker.onmessage = (event) => this.receive(event.data);
      worker.onerror = () => this.fail(Error('Maia stopped unexpectedly. Retry the engine.'));
      await new Promise<void>((resolve, reject) => {
        this.ready = {
          resolve: () => resolve(),
          reject,
          timer: setTimeout(
            () => reject(Error('Maia took too long to start. Retry the engine.')),
            120000,
          ),
        };
        worker.postMessage(init, [init.model]);
      });
      if (this.lifetime.signal.aborted) throw canceled();
      this.progress({ phase: 'ready', loaded: 0, total: 0 });
    })().catch((error) => {
      this.dispose();
      throw error;
    });
    return this.initialization;
  }
  async bestMove(position: PositionInput, signal: AbortSignal): Promise<string> {
    if (signal.aborted || this.lifetime.signal.aborted) throw canceled();
    if (this.busy) throw Error('Maia is already thinking.');
    this.busy = true;
    const abort = () => this.dispose();
    signal.addEventListener('abort', abort, { once: true });
    try {
      await this.start();
      if (signal.aborted) throw canceled();
      const chess = new Chess(position.rootFen);
      for (const move of position.moves) chess.move(move);
      if (chess.isGameOver()) throw Error('This game is already over.');
      const tokens = encodePosition(chess.fen());
      const id = ++this.nextId;
      const logits = await new Promise<ArrayBuffer>((resolve, reject) => {
        this.requests.set(id, {
          resolve: (buffer) => resolve(buffer!),
          reject,
          timer: setTimeout(
            () => reject(Error('Maia took too long to respond. Retry the engine.')),
            30000,
          ),
        });
        this.worker!.postMessage(
          { type: 'inference', id, tokens: tokens.buffer, rating: this.rating },
          [tokens.buffer],
        );
      });
      if (signal.aborted || this.lifetime.signal.aborted) throw canceled();
      const move = sampleMove(chess.fen(), new Float32Array(logits));
      chess.move(move);
      return move;
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      signal.removeEventListener('abort', abort);
      this.busy = false;
    }
  }
  private fail(error: Error) {
    if (this.ready) {
      clearTimeout(this.ready.timer);
      this.ready.reject(error);
      this.ready = null;
    }
    for (const pending of this.requests.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.requests.clear();
  }
  dispose() {
    if (this.lifetime.signal.aborted) return;
    this.lifetime.abort();
    this.fail(canceled());
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
      this.worker = null;
    }
  }
}
