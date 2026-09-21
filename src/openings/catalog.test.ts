import { afterEach, expect, it, vi } from 'vitest';
import { parseOpeningCatalog, searchOpeningCatalog } from './catalog';
import { databasePack } from '../training/database';

const tsv =
  'eco\tname\tpgn\nB20\tSicilian Defense\t1. e4 c5\nB70\tSicilian Defense: Dragon Variation\t1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6\nC50\tItalian Game\t1. e4 e5 2. Nf3 Nc6 3. Bc4\n';
afterEach(() => vi.unstubAllGlobals());
it('searches names, variation words, and ECO without case sensitivity and paginates', () => {
  const entries = parseOpeningCatalog(tsv);
  expect(searchOpeningCatalog(entries, 'DRAGON sicilian', 0, 2).items.map((e) => e.eco)).toEqual([
    'B70',
  ]);
  expect(searchOpeningCatalog(entries, 'b20').items[0].name).toBe('Sicilian Defense');
  expect(searchOpeningCatalog(entries, 'sicilian', 1, 1)).toMatchObject({
    total: 2,
    page: 1,
    pages: 2,
    items: [entries[1]],
  });
  expect(searchOpeningCatalog(entries, 'does not exist').items).toEqual([]);
});
it('rejects malformed catalog rows instead of displaying unusable choices', () => {
  expect(() => parseOpeningCatalog('eco\tname\tpgn\nB20\tMissing moves')).toThrow(/database/i);
});
it('rejects an empty catalog with a recoverable database error', () => {
  expect(() => parseOpeningCatalog('eco\tname\tpgn\n')).toThrow(/database.*no.*lines/i);
});
it('turns the selected database line into a legal course for either side', () => {
  const entry = parseOpeningCatalog(tsv)[1];
  for (const side of ['w', 'b'] as const) {
    const pack = databasePack(entry, side);
    expect(pack.side).toBe(side);
    expect(pack.lines).toHaveLength(1);
    expect(pack.lines[0].name).toBe(entry.name);
    expect(pack.lines[0].moves.map((m) => m.san)).toEqual([
      'e4',
      'c5',
      'Nf3',
      'd6',
      'd4',
      'cxd4',
      'Nxd4',
      'Nf6',
      'Nc3',
      'g6',
    ]);
  }
});
it('retries a failed bundled database load and does not keep partial results', async () => {
  vi.resetModules();
  let unavailable = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.endsWith('.json')
        ? new Response(JSON.stringify({ revision: 'test', names: {}, book: [] }), { status: 200 })
        : unavailable
          ? new Response('unavailable', { status: 503 })
          : new Response(tsv, { status: 200 }),
    ),
  );
  const { loadOpeningCatalog } = await import('./catalog');
  await expect(loadOpeningCatalog()).rejects.toThrow(/database/i);
  unavailable = false;
  const entries = await loadOpeningCatalog();
  expect(entries).toHaveLength(3);
  expect(entries.map((e) => e.eco)).toEqual(['B20', 'B70', 'C50']);
});

it('matches common apostrophe spellings of opening names', () => {
  const entries = parseOpeningCatalog(
    "eco\tname\tpgn\nD06\tQueen's Gambit\t1. d4 d5 2. c4\nE60\tKing's Indian Defense\t1. d4 Nf6 2. c4 g6\n",
  );
  for (const query of ['queens gambit', "queen's gambit", 'queen’s gambit'])
    expect(searchOpeningCatalog(entries, query).items[0]?.eco).toBe('D06');
  expect(searchOpeningCatalog(entries, 'kings indian').items[0]?.eco).toBe('E60');
});

it('puts the named opening ahead of incidental matches and longer variations', () => {
  const entries = parseOpeningCatalog(
    "eco\tname\tpgn\nA04\tZukertort Opening: Queen's Gambit Invitation\t1. Nf3 d5\nD37\tQueen's Gambit Declined\t1. d4 d5 2. c4 e6\nD06\tQueen's Gambit\t1. d4 d5 2. c4\nA43\tQueen's Pawn Game: Liedmann Gambit\t1. d4 c5 2. c4\n",
  );
  expect(searchOpeningCatalog(entries, 'queens gambit').items.map((entry) => entry.eco)).toEqual([
    'D06',
    'D37',
    'A04',
    'A43',
  ]);
});
