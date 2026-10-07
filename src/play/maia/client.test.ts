import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_POSITION } from 'chess.js';
import { MaiaEngine } from './client';

class MaiaWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  commands: any[] = [];
  terminated = false;
  autoReady = true;
  autoReply = true;
  terminate() {
    this.terminated = true;
  }
  emit(data: unknown) {
    this.onmessage?.({ data });
  }
  postMessage(command: any) {
    this.commands.push(command);
    queueMicrotask(() => {
      if (command.type === 'init' && this.autoReady) this.emit({ type: 'ready' });
      if (command.type === 'inference' && this.autoReply) {
        const logits = new Float32Array(4352).fill(-1000);
        logits[796] = 1000;
        this.emit({ type: 'result', id: command.id, logits: logits.buffer });
      }
    });
  }
}
const clients: MaiaEngine[] = [];
const position = { rootFen: DEFAULT_POSITION, moves: [] };
function setup() {
  const worker = new MaiaWorker();
  const client = new MaiaEngine(
    1320,
    () => {},
    async () => ({
      worker: worker as unknown as Worker,
      init: {
        type: 'init' as const,
        model: new ArrayBuffer(0),
        mjsUrl: 'blob:module',
        wasmUrl: 'blob:wasm',
      },
    }),
  );
  clients.push(client);
  return { client, worker };
}
afterEach(() => clients.splice(0).forEach((client) => client.dispose()));
it('conditions real requests on the selected rating and returns only a legal sampled move', async () => {
  const { client, worker } = setup();
  expect(await client.bestMove(position, new AbortController().signal)).toBe('e2e4');
  const request = worker.commands.find((command) => command.type === 'inference');
  expect(request.rating).toBe(1320);
  expect(request.tokens).toBeInstanceOf(ArrayBuffer);
});
it.each(['init', 'inference'])('cancels pending %s and ignores late messages', async (phase) => {
  const { client, worker } = setup();
  worker.autoReady = phase !== 'init';
  worker.autoReply = false;
  const abort = new AbortController();
  const result = client.bestMove(position, abort.signal);
  const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() =>
    expect(worker.commands.some((command) => command.type === phase)).toBe(true),
  );
  const handler = worker.onmessage;
  abort.abort();
  handler?.({ data: { type: 'ready' } });
  handler?.({ data: { type: 'result', id: 1, logits: new Float32Array(4352).buffer } });
  await rejection;
  expect(worker.terminated).toBe(true);
});
it('ignores responses for another request and surfaces invalid policy output', async () => {
  const { client, worker } = setup();
  worker.autoReply = false;
  const result = client.bestMove(position, new AbortController().signal);
  const rejection = expect(result).rejects.toThrow(/policy/i);
  await vi.waitFor(() =>
    expect(worker.commands.some((command) => command.type === 'inference')).toBe(true),
  );
  const request = worker.commands.find((command) => command.type === 'inference');
  worker.emit({ type: 'result', id: request.id + 1, logits: new Float32Array(4352).buffer });
  worker.emit({ type: 'result', id: request.id, logits: new ArrayBuffer(0) });
  await rejection;
  expect(worker.terminated).toBe(true);
});
it('rejects an outstanding search when its worker crashes', async () => {
  const { client, worker } = setup();
  worker.autoReply = false;
  const result = client.bestMove(position, new AbortController().signal);
  const rejection = expect(result).rejects.toThrow(/stopped|unexpected/i);
  await vi.waitFor(() =>
    expect(worker.commands.some((command) => command.type === 'inference')).toBe(true),
  );
  worker.onerror?.();
  await rejection;
});
it('terminates a worker that finishes loading after cancellation', async () => {
  const worker = new MaiaWorker();
  let finish!: (resource: any) => void;
  const client = new MaiaEngine(
    1600,
    () => {},
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  clients.push(client);
  const result = client.start();
  const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' });
  client.dispose();
  finish({ worker, init: { type: 'init', model: new ArrayBuffer(0), mjsUrl: '', wasmUrl: '' } });
  await rejection;
  expect(worker.terminated).toBe(true);
});
