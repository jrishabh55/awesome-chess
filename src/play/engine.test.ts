import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_POSITION } from 'chess.js';
import { PlayEngine } from './engine';

class UciWorker {
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  commands: string[] = [];
  terminated = false;
  autoMove = true;
  emit(data: string) {
    this.onmessage?.({ data });
  }
  terminate() {
    this.terminated = true;
  }
  postMessage(command: string) {
    this.commands.push(command);
    queueMicrotask(() => {
      if (command === 'uci')
        this.emit(
          'id name Stockfish 19\noption name Skill Level type spin default 20 min 0 max 20\noption name UCI_LimitStrength type check default false\noption name UCI_Elo type spin default 1320 min 1320 max 3190\nuciok',
        );
      if (command === 'isready') this.emit('readyok');
      if (command.startsWith('go ') && this.autoMove) {
        this.emit('info depth 12 multipv 1 score cp 30 pv e2e4 e7e5');
        this.emit('bestmove d2d4 ponder d7d5');
      }
    });
  }
}
const position = { rootFen: DEFAULT_POSITION, moves: [] };
const clients: PlayEngine[] = [];
function setup() {
  const worker = new UciWorker();
  const client = new PlayEngine(
    () => {},
    async () => worker as unknown as Worker,
  );
  clients.push(client);
  return { worker, client };
}
afterEach(() => {
  clients.splice(0).forEach((c) => c.dispose());
  vi.useRealTimers();
});

it('uses the weakened bestmove, not the strongest PV, and enables requested Elo', async () => {
  const { worker, client } = setup();
  expect(
    await client.bestMove(position, { kind: 'elo', value: 1600 }, new AbortController().signal),
  ).toBe('d2d4');
  expect(worker.commands).toContain('setoption name UCI_LimitStrength value true');
  expect(worker.commands).toContain('setoption name UCI_Elo value 1600');
  expect(worker.commands).toContain('ucinewgame');
});

it('turns off Elo limiting for skill and full strength searches', async () => {
  const { worker, client } = setup();
  await client.bestMove(position, { kind: 'skill', value: 0 }, new AbortController().signal);
  expect(worker.commands).toContain('setoption name UCI_LimitStrength value false');
  expect(worker.commands).toContain('setoption name Skill Level value 0');
  await client.bestMove(position, { kind: 'full' }, new AbortController().signal);
  expect(worker.commands).toContain('setoption name Skill Level value 20');
});

it('rejects unsupported ratings instead of quietly running at a clamped strength', async () => {
  const { client, worker } = setup();
  await expect(
    client.bestMove(position, { kind: 'elo', value: 800 }, new AbortController().signal),
  ).rejects.toThrow(/range|supported/i);
  expect(worker.commands.some((c) => c.startsWith('go '))).toBe(false);
});

it('aborts an active search immediately and ignores its late bestmove', async () => {
  const { client, worker } = setup();
  worker.autoMove = false;
  const abort = new AbortController();
  const result = client.bestMove(position, { kind: 'skill', value: 0 }, abort.signal);
  const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(worker.commands.some((c) => c.startsWith('go '))).toBe(true));
  const oldHandler = worker.onmessage;
  abort.abort();
  oldHandler?.({ data: 'bestmove e2e4' });
  await rejected;
  expect(worker.terminated).toBe(true);
  await expect(
    client.bestMove(position, { kind: 'full' }, new AbortController().signal),
  ).rejects.toMatchObject({ name: 'AbortError' });
});

it('terminates a worker that finishes loading after disposal', async () => {
  const worker = new UciWorker();
  let finish!: (worker: Worker) => void;
  const client = new PlayEngine(
    () => {},
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  clients.push(client);
  const result = client.start();
  const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
  client.dispose();
  finish(worker as unknown as Worker);
  await rejected;
  expect(worker.terminated).toBe(true);
});

it('rejects an illegal bestmove instead of corrupting the game', async () => {
  const { client, worker } = setup();
  worker.autoMove = false;
  const result = client.bestMove(position, { kind: 'full' }, new AbortController().signal);
  const rejected = expect(result).rejects.toThrow(/legal/i);
  await vi.waitFor(() => expect(worker.commands.some((c) => c.startsWith('go '))).toBe(true));
  worker.emit('bestmove e2e5');
  await rejected;
});
