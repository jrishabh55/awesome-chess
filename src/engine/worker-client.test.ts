import { it, expect } from 'vitest';
import { EngineClient } from './worker-client';
class FakeWorker {
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  commands: string[] = [];
  terminate() {}
  postMessage(s: string) {
    this.commands.push(s);
    const emit = (data: string) => queueMicrotask(() => this.onmessage?.({ data }));
    if (s === 'uci') {
      emit('id name Stockfish 19');
      emit('uciok');
    }
    if (s === 'isready') emit('readyok');
    if (s.startsWith('go')) {
      emit('info depth 12 score cp 30 pv e2e4 e7e5');
      emit('bestmove e2e4');
    }
  }
}
it('runs a UCI job and returns its own normalized result', async () => {
  const worker = new FakeWorker();
  const client = new EngineClient('lite', () => worker as unknown as Worker);
  const result = await client.analyze(
    {
      id: 'one',
      position: { rootFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves: [] },
      budget: { kind: 'depth', depth: 12 },
      multiPv: 1,
    },
    new AbortController().signal,
  );
  expect(result.requestId).toBe('one');
  expect(result.completed).toBe(true);
  expect(result.lines[0].score).toEqual({ kind: 'cp', value: 30 });
  client.dispose();
});
class MixedDepthWorker extends FakeWorker {
  postMessage(s: string) {
    if (!s.startsWith('go')) {
      super.postMessage(s);
      return;
    }
    for (const data of [
      'info depth 11 multipv 1 score cp 30 pv e2e4',
      'info depth 11 multipv 2 score cp 20 pv d2d4',
      'info depth 12 multipv 1 score cp 40 pv d2d4',
      'bestmove d2d4',
    ])
      queueMicrotask(() => this.onmessage?.({ data }));
  }
}
it('returns the last complete depth instead of duplicate candidates from mixed depths', async () => {
  const client = new EngineClient('lite', () => new MixedDepthWorker() as unknown as Worker);
  const r = await client.analyze(
    {
      id: 'depth',
      position: { rootFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves: [] },
      budget: { kind: 'time', milliseconds: 100 },
      multiPv: 2,
    },
    new AbortController().signal,
  );
  expect(r.lines.map((l) => [l.depth, l.pv[0]])).toEqual([
    [11, 'e2e4'],
    [11, 'd2d4'],
  ]);
  client.dispose();
});
