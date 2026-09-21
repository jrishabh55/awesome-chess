import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CatalogOpening } from '../openings/catalog';
import { MAX_PROGRESS_CHARS } from './limits';
import {
  createSession,
  currentLine,
  nextStage,
  playTrainingMove,
  PROGRESS_KEY,
  restoreProgress,
  serializeProgress,
} from './session';
import {
  addRepertoireOpening,
  createRepertoire,
  loadRepertoires,
  removeRepertoireOpening,
  renameRepertoire,
  repertoirePack,
  RepertoireConflictError,
  REPERTOIRES_KEY,
  saveRepertoires,
} from './repertoires';

const sicilian: CatalogOpening = {
  id: 'sicilian',
  eco: 'B20',
  name: 'Sicilian Defense',
  pgn: '1. e4 c5',
};
const italian: CatalogOpening = {
  id: 'italian',
  eco: 'C50',
  name: 'Italian Game',
  pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4',
};
let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
it('creates a named repertoire with a fixed side and immutably adds, renames, and removes lines', () => {
  const empty = createRepertoire('  My Black defenses  ', 'b');
  expect(empty).toMatchObject({ name: 'My Black defenses', side: 'b', openings: [] });
  const withLine = addRepertoireOpening(empty, sicilian);
  const renamed = renameRepertoire(withLine, 'Main defenses');
  expect(empty.openings).toEqual([]);
  expect(renamed.side).toBe('b');
  expect(renamed.name).toBe('Main defenses');
  expect(renamed.updatedAt).toBeGreaterThan(withLine.updatedAt);
  expect(removeRepertoireOpening(renamed, sicilian.id).openings).toEqual([]);
  expect(() => repertoirePack(empty)).toThrow(/add.*opening|empty/i);
});
it('deduplicates both database identity and legal move sequences with different annotations', () => {
  const rep = addRepertoireOpening(createRepertoire('White lines', 'w'), sicilian);
  expect(addRepertoireOpening(rep, sicilian).openings).toHaveLength(1);
  const alias = { ...sicilian, id: 'alias', name: 'Same position', pgn: '1. e4 {center} c5 *' };
  expect(addRepertoireOpening(rep, alias).openings).toHaveLength(1);
});
it('rejects blank names, illegal moves, and lines with no move for the repertoire side', () => {
  expect(() => createRepertoire('  ', 'w')).toThrow(/name/i);
  const rep = createRepertoire('Black', 'b');
  expect(() => renameRepertoire(rep, '')).toThrow(/name/i);
  expect(() => addRepertoireOpening(rep, { ...sicilian, pgn: '1. e5' })).toThrow(/illegal/i);
  expect(() => addRepertoireOpening(rep, { ...sicilian, pgn: '1. e4' })).toThrow(/Black/);
});
it('roundtrips saved repertoires without modifying the existing teacher course', () => {
  const rep = addRepertoireOpening(createRepertoire('My repertoire', 'w'), sicilian);
  store.set(PROGRESS_KEY, 'existing course');
  saveRepertoires([rep]);
  expect(loadRepertoires()).toEqual([rep]);
  expect(store.get(PROGRESS_KEY)).toBe('existing course');
  expect(repertoirePack(rep).id).toBe(repertoirePack(rep).id);
});
it('reports corrupt stored data without overwriting it', () => {
  store.set(REPERTOIRES_KEY, '{damaged');
  expect(() => loadRepertoires()).toThrow(/damaged|corrupt/i);
  expect(() => saveRepertoires([createRepertoire('New', 'w')])).toThrow(/damaged|corrupt/i);
  expect(store.get(REPERTOIRES_KEY)).toBe('{damaged');
});
it('rejects tampered legal history and duplicate IDs in persisted libraries', () => {
  const rep = addRepertoireOpening(createRepertoire('My lines', 'w'), sicilian);
  saveRepertoires([rep]);
  const data = JSON.parse(store.get(REPERTOIRES_KEY)!);
  data.repertoires[0].openings[0].pgn = '1. e5';
  store.set(REPERTOIRES_KEY, JSON.stringify(data));
  expect(() => loadRepertoires()).toThrow(/damaged|corrupt/i);
  store.clear();
  expect(() => saveRepertoires([rep, rep])).toThrow(/duplicate/i);
});
it('leaves the previous library intact when storage quota or expanded course size is exceeded', () => {
  const rep = addRepertoireOpening(createRepertoire('Saved', 'w'), sicilian);
  saveRepertoires([rep]);
  const old = store.get(REPERTOIRES_KEY);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    },
  });
  expect(() => saveRepertoires([renameRepertoire(rep, 'Changed')])).toThrow(/save|storage/i);
  expect(store.get(REPERTOIRES_KEY)).toBe(old);
  const oversized = { ...rep, openings: [{ ...sicilian, name: 'a'.repeat(MAX_PROGRESS_CHARS) }] };
  expect(() => saveRepertoires([oversized])).toThrow(/large|name/i);
  expect(store.get(REPERTOIRES_KEY)).toBe(old);
});
it('builds and finishes a multi-family course with the normal progressive practice scheduler', () => {
  let rep = createRepertoire('Mixed repertoire', 'w');
  rep = addRepertoireOpening(addRepertoireOpening(rep, sicilian), italian);
  const pack = repertoirePack(rep);
  expect(pack.lines.map((line) => line.name)).toEqual([sicilian.name, italian.name]);
  let session = createSession(pack, () => 0);
  expect(session.stages.map((stage) => stage.kind)).toEqual([
    'guide',
    'drill',
    'guide',
    'drill',
    'drill',
    'final',
    'final',
  ]);
  expect(restoreProgress(serializeProgress(pack, session))?.pack).toEqual(pack);
  while (session.stage < session.stages.length) {
    const line = currentLine(pack, session);
    if (session.stages[session.stage].kind === 'guide')
      session = { ...session, ply: line.moves.length };
    else
      while (session.ply < line.moves.length)
        session = playTrainingMove(pack, session, line.moves[session.ply].uci).session;
    session = nextStage(pack, session);
  }
  expect(session.stage).toBe(7);
});

it('rejects aggregate course expansion before replacing a saved library', async () => {
  const { Chess } = await import('chess.js');
  const rep = addRepertoireOpening(createRepertoire('Saved small course', 'w'), sicilian);
  saveRepertoires([rep]);
  const old = store.get(REPERTOIRES_KEY);
  const root = new Chess();
  root.move('e4');
  const openings = root.moves().flatMap((reply) => {
    const branch = new Chess(root.fen());
    branch.move(reply);
    return branch
      .moves()
      .slice(0, 2)
      .map((white) => ({
        id: `${reply}:${white}`,
        eco: 'B20',
        name: `Long annotated line ${reply} ${white}`,
        pgn: `1. e4 {${'a'.repeat(150_000)}} ${reply} 2. ${white}`,
      }));
  });
  expect(openings).toHaveLength(40);
  expect(openings.every((opening) => opening.pgn.length < 200_000)).toBe(true);
  expect(() => saveRepertoires([{ ...rep, openings }])).toThrow(/too large to save/i);
  expect(store.get(REPERTOIRES_KEY)).toBe(old);
});

it('does not permit an existing saved repertoire to change sides', () => {
  const rep = addRepertoireOpening(createRepertoire('My White lines', 'w'), sicilian);
  saveRepertoires([rep]);
  const old = store.get(REPERTOIRES_KEY);
  expect(() => saveRepertoires([{ ...rep, side: 'b' }])).toThrow(/side cannot be changed/i);
  expect(store.get(REPERTOIRES_KEY)).toBe(old);
});

it('rejects a stale second tab addition and preserves the newest library', () => {
  const firstSnapshot = loadRepertoires();
  const secondSnapshot = loadRepertoires();
  const first = addRepertoireOpening(createRepertoire('First tab', 'w'), sicilian);
  const second = addRepertoireOpening(createRepertoire('Second tab', 'w'), italian);
  saveRepertoires([first], firstSnapshot);
  const newest = store.get(REPERTOIRES_KEY);
  expect(() => saveRepertoires([second], secondSnapshot)).toThrow(/reload saved repertoires/i);
  expect(() => saveRepertoires([second], secondSnapshot)).toThrow(RepertoireConflictError);
  expect(store.get(REPERTOIRES_KEY)).toBe(newest);
  expect(loadRepertoires()).toEqual([first]);
});

it('rejects stale variation changes instead of replacing another tab’s additions', () => {
  const rep = createRepertoire('Shared repertoire', 'w');
  saveRepertoires([rep]);
  const firstSnapshot = loadRepertoires();
  const secondSnapshot = loadRepertoires();
  const newest = addRepertoireOpening(firstSnapshot[0], italian);
  saveRepertoires([newest], firstSnapshot);
  expect(() =>
    saveRepertoires([addRepertoireOpening(secondSnapshot[0], sicilian)], secondSnapshot),
  ).toThrow(RepertoireConflictError);
  expect(loadRepertoires()).toEqual([newest]);
});

it('rejects stale deletion and a stale save after deletion without resurrecting removed data', () => {
  const rep = addRepertoireOpening(createRepertoire('Saved repertoire', 'w'), sicilian);
  saveRepertoires([rep]);
  const stale = loadRepertoires();
  const newest = renameRepertoire(rep, 'New name');
  saveRepertoires([newest], stale);
  expect(() => saveRepertoires([], stale)).toThrow(RepertoireConflictError);
  expect(loadRepertoires()).toEqual([newest]);
  const beforeDeletion = loadRepertoires();
  saveRepertoires([], beforeDeletion);
  expect(() => saveRepertoires([newest], beforeDeletion)).toThrow(RepertoireConflictError);
  expect(loadRepertoires()).toEqual([]);
});

it('compares canonical snapshots rather than serialized property order', () => {
  const rep = addRepertoireOpening(createRepertoire('Saved repertoire', 'w'), sicilian);
  saveRepertoires([rep]);
  const snapshot = loadRepertoires();
  const reversed = Object.fromEntries(Object.entries(snapshot[0]).reverse());
  store.set(REPERTOIRES_KEY, JSON.stringify({ repertoires: [reversed], version: 1 }, null, 2));
  const renamed = renameRepertoire(rep, 'Renamed safely');
  expect(() => saveRepertoires([renamed], snapshot)).not.toThrow();
  expect(loadRepertoires()).toEqual([renamed]);
});
