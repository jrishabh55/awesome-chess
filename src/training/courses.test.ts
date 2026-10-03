import { expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import type { CatalogOpening } from '../openings/catalog';
import { courseVariationLabel, openingCourses, searchCourses } from './courses';
const entry = (id: string, name: string, pgn: string, eco = 'D02'): CatalogOpening => ({
  id,
  name,
  pgn,
  eco,
});
it('unifies actual London System families without absorbing unrelated London defenses', () => {
  const entries = [
    entry('queen', "Queen's Pawn Game: London System", '1. d4 d5 2. Nf3 Nf6 3. Bf4'),
    entry('indian', 'Indian Defense: London System', '1. d4 Nf6 2. Nf3 e6 3. Bf4'),
    entry(
      'poison',
      'London System: Poisoned Pawn Variation',
      '1. d4 Nf6 2. Nf3 d5 3. Bf4 c5 4. e3 Qb6 5. Nc3',
    ),
    entry('scotch', 'Scotch Game: London Defense', '1. e4 e5 2. Nf3 Nc6 3. d4 exd4'),
    entry('reti', 'Réti Opening: London Defensive System', '1. Nf3 d5 2. c4'),
  ];
  const courses = openingCourses(entries);
  const london = courses.find((course) => course.name === 'London System')!;
  expect(london.side).toBe('w');
  expect(london.sourceCount).toBe(3);
  expect(london.variations.map((variation) => variation.id).sort()).toEqual([
    'indian',
    'poison',
    'queen',
  ]);
  expect(searchCourses(courses, 'london').items).toContain(london);
  expect(courses).toHaveLength(3);
});
it('removes every repeated/prefix line including the foundation and retains divergent leaves', () => {
  const entries = [
    entry('base', 'Sicilian Defense', '1. e4 c5', 'B20'),
    entry('prefix', 'Sicilian Defense: Open', '1. e4 c5 2. Nf3 d6', 'B50'),
    entry('a', 'Sicilian Defense: A', '1. e4 c5 2. Nf3 d6 3. d4', 'B50'),
    entry('alias', 'Sicilian Defense: Alias', '1. e4 {center} c5 2. Nf3 d6 3. d4', 'B50'),
    entry('b', 'Sicilian Defense: B', '1. e4 c5 2. Nf3 d6 3. Bb5+', 'B51'),
  ];
  const course = openingCourses(entries)[0];
  expect(course.side).toBe('b');
  expect(course.sourceCount).toBe(5);
  expect(course.variations.map((v) => v.id)).toEqual(['a', 'b']);
  expect(openingCourses([...entries].reverse())).toEqual([course]);
});
it('keeps only the deepest line across a chain of one-move extensions', () => {
  const entries = [
    entry('root', 'Italian Game', '1. e4 e5 2. Nf3 Nc6 3. Bc4', 'C50'),
    entry('reply', 'Italian Game: Classical', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5', 'C50'),
    entry('longest', 'Italian Game: Classical', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3', 'C50'),
  ];
  const course = openingCourses(entries)[0];
  expect(course.variations.map((line) => line.id)).toEqual(['longest']);
  expect(course.sourceCount).toBe(3);
  expect(course.sections.flatMap((section) => section.variationIndices)).toEqual([0]);
});
it('finishes full lines and their nearby variations within the same opening branch', () => {
  const course = openingCourses([
    entry('root', 'Italian Game', '1. e4 e5 2. Nf3 Nc6 3. Bc4', 'C50'),
    entry(
      'main',
      'Italian Game: Classical Variation, Main line',
      '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6',
      'C50',
    ),
    entry(
      'reply',
      'Italian Game: Classical Variation, Other reply',
      '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 Bc5',
      'C50',
    ),
    entry(
      'choice',
      'Italian Game: Classical Variation, Different plan',
      '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 Nf6',
      'C50',
    ),
  ])[0];
  expect(course.variations[0].id).toBe('main');
  expect(course.sections[0].variationIndices.map((i) => course.variations[i].id)).toEqual([
    'main',
    'choice',
    'reply',
  ]);
  expect(course.sections).toHaveLength(1);
  expect(course.sections.every((s) => !s.name.startsWith('After '))).toBe(true);
  expect(course.sections.flatMap((s) => s.variationIndices)).toEqual([0, 1, 2]);
});
it('labels similarly named rows by ending moves and searches course names, ECO, and branches', () => {
  const a = entry('a', "Queen's Pawn Game: London System", '1. d4 d5 2. Nf3 Nf6 3. Bf4');
  const b = entry('b', "Queen's Pawn Game: London System", '1. d4 d5 2. Nf3 Nf6 3. Bf4 c5 4. e3');
  expect(courseVariationLabel(a, 'London System')).not.toBe(
    courseVariationLabel(b, 'London System'),
  );
  const courses = openingCourses([a, b]);
  expect(searchCourses(courses, 'd02').total).toBe(1);
  expect(searchCourses(courses, 'not present').items).toEqual([]);
});
// Replays the entire bundled database, not a small unit fixture. Shared CI
// runners need more than the default five seconds for this integration check.
it(
  'retains large real database courses and every London source across canonical families',
  { timeout: 30_000 },
  async () => {
    const { readFileSync } = await import('node:fs');
    const { parseOpeningCatalog } = await import('../openings/catalog');
    const entries = ['a', 'b', 'c', 'd', 'e'].flatMap((file) =>
      parseOpeningCatalog(readFileSync(`public/data/${file}.tsv`, 'utf8')),
    );
    const courses = openingCourses(entries);
    const london = courses.find((course) => course.name === 'London System')!;
    const sicilian = courses.find((course) => course.name === 'Sicilian Defense')!;
    expect(london.sourceCount).toBe(
      entries.filter((entry) => /\bLondon System\b/.test(entry.name)).length,
    );
    expect(sicilian.variations.length).toBeGreaterThan(40);
    expect(sicilian.sections.flatMap((section) => section.variationIndices)).toEqual(
      sicilian.variations.map((_, index) => index),
    );
  },
);
it('reuses course groups and parsed labels without mutating immutable database inputs', () => {
  const entries = [
    Object.freeze(entry('cache-a', 'Sicilian Defense', '1. e4 c5', 'B20')),
    Object.freeze(entry('cache-b', 'Sicilian Defense: Open', '1. e4 c5 2. Nf3 d6', 'B50')),
  ];
  Object.freeze(entries);
  const before = JSON.stringify(entries);
  const parser = vi.spyOn(Chess.prototype, 'loadPgn');
  try {
    const first = openingCourses(entries);
    expect(parser).toHaveBeenCalledTimes(2);
    expect(openingCourses(entries)).toBe(first);
    courseVariationLabel(entries[1], 'Sicilian Defense');
    courseVariationLabel(entries[1], 'Sicilian Defense');
    expect(openingCourses([...entries])).toEqual(first);
    expect(parser).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(entries)).toBe(before);
  } finally {
    parser.mockRestore();
  }
});
it('normalizes apostrophes and ranks course names ahead of incidental variation matches', () => {
  const courses = openingCourses([
    entry('gambit', "Queen's Gambit", '1. d4 d5 2. c4'),
    entry('london', "Queen's Pawn Game: London System", '1. d4 d5 2. Nf3 Nf6 3. Bf4'),
    entry('scotch', 'Scotch Game: London Defense', '1. e4 e5 2. Nf3 Nc6 3. d4 exd4'),
    entry('grob', 'Grob Opening: London Defense', '1. g4 d5'),
  ]);
  for (const query of ['queens gambit', 'queen’s gambit', 'queenʼs gambit'])
    expect(searchCourses(courses, query).items[0].name).toBe("Queen's Gambit");
  expect(searchCourses(courses, 'London').items[0].name).toBe('London System');
  expect(searchCourses(courses, 'London System').items[0].name).toBe('London System');
});
it('keeps both players’ alternative responses together in a named line section', () => {
  const course = openingCourses([
    entry(
      'a',
      'Sicilian Defense: Open, Main response',
      '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3',
      'B50',
    ),
    entry(
      'b',
      'Sicilian Defense: Open, Other response',
      '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. f3',
      'B50',
    ),
    entry(
      'c',
      'Sicilian Defense: Open, Alternative choice',
      '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 a6',
      'B50',
    ),
    entry('d', 'Sicilian Defense: Closed', '1. e4 c5 2. Nc3 Nc6 3. g3', 'B23'),
  ])[0];
  expect(course.sections).toHaveLength(2);
  expect(course.sections[0].name).toBe('Open');
  expect(course.sections[0].commonPgn).toBe('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4');
  expect(course.sections[0].variationIndices).toEqual([0, 1, 2]);
  expect(course.sections[1].name).toBe('Closed');
});
it('starts real Caro-Kann study with a full continuation and finishes named branches together', async () => {
  const { readFileSync } = await import('node:fs');
  const { parseOpeningCatalog } = await import('../openings/catalog');
  const entries = parseOpeningCatalog(readFileSync('public/data/b.tsv', 'utf8'));
  const course = openingCourses(entries).find((c) => c.name === 'Caro-Kann Defense')!;
  const first = new Chess();
  first.loadPgn(course.variations[0].pgn);
  expect(first.history().length).toBeGreaterThanOrEqual(20);
  expect(course.sections[0].name).toBe('Classical Variation');
  expect(course.sections[0].variationIndices.length).toBeGreaterThan(2);
  for (const index of course.sections[0].variationIndices)
    expect(course.variations[index].name).toMatch(/^Caro-Kann Defense: Classical Variation/);
  expect(course.sections.every((section) => !section.name.startsWith('After '))).toBe(true);
});
