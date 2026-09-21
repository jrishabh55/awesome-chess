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
it('keeps a foundation, removes repeated/prefix lines, and retains every divergent leaf', () => {
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
  expect(course.variations.map((v) => v.id)).toEqual(['base', 'a', 'b']);
  expect(openingCourses([...entries].reverse())).toEqual([course]);
});
it('organizes contiguous shared move-prefix sections and covers every variation once', () => {
  const entries = [
    entry('base', 'Sicilian Defense', '1. e4 c5', 'B20'),
    entry('a', 'Sicilian Defense: Branch A', '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6', 'B50'),
    entry('b', 'Sicilian Defense: Branch B', '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Qxd4 Nc6', 'B50'),
    entry('c', 'Sicilian Defense: Other A', '1. e4 c5 2. Nc3 Nc6 3. g3 g6', 'B23'),
    entry('d', 'Sicilian Defense: Other B', '1. e4 c5 2. Nc3 Nc6 3. f4 g6', 'B23'),
    entry('e', 'Sicilian Defense: Independent', '1. e4 c5 2. b3', 'B20'),
  ];
  const course = openingCourses(entries)[0];
  expect(course.sections[0].name).toBe('Foundation');
  expect(course.sections.flatMap((section) => section.variationIndices)).toEqual(
    course.variations.map((_, index) => index),
  );
  expect(
    course.sections
      .filter((section) => section.variationIndices.length >= 2)
      .map((section) => section.commonPgn),
  ).toEqual(expect.arrayContaining(['1. e4 c5 2. Nf3 d6 3. d4 cxd4', '1. e4 c5 2. Nc3 Nc6']));
  expect(course.sections.find((section) => section.name === 'Other replies')?.commonPgn).toBe('');
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
it('groups branches sharing White’s fourth move before Black replies diverge', () => {
  const course = openingCourses([
    entry('base-fourth-white', 'Sicilian Defense', '1. e4 c5', 'B20'),
    entry(
      'fourth-white-a',
      'Sicilian Defense: Fourth move A',
      '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6',
      'B50',
    ),
    entry(
      'fourth-white-b',
      'Sicilian Defense: Fourth move B',
      '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 a6',
      'B50',
    ),
  ])[0];
  const section = course.sections[1];
  expect(section.commonPgn).toBe('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4');
  expect(section.name).toBe('After 4.Nxd4');
  expect(section.variationIndices).toEqual([1, 2]);
});
it('groups branches sharing Black’s fourth move before White replies diverge', () => {
  const entries = [
    entry('base-fourth-black', 'Sicilian Defense', '1. e4 c5', 'B20'),
    entry(
      'fourth-black-a',
      'Sicilian Defense: Fifth move A',
      '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3',
      'B50',
    ),
    entry(
      'fourth-black-b',
      'Sicilian Defense: Fifth move B',
      '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. f3',
      'B50',
    ),
  ];
  const course = openingCourses(entries)[0];
  expect(course.sections[1].commonPgn).toBe('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6');
  expect(course.sections[1].name).toBe('After 4…Nf6');
  expect(openingCourses([...entries].reverse())).toEqual([course]);
  expect(course.sections.flatMap((section) => section.variationIndices)).toEqual([0, 1, 2]);
});
it('retains three-ply shared starts when branches split before the third move', () => {
  const course = openingCourses([
    entry('base-short', 'Sicilian Defense', '1. e4 c5', 'B20'),
    entry('short-a', 'Sicilian Defense: Early A', '1. e4 c5 2. Nf3 d6', 'B50'),
    entry('short-b', 'Sicilian Defense: Early B', '1. e4 c5 2. Nf3 Nc6', 'B30'),
  ])[0];
  expect(course.sections[1].commonPgn).toBe('1. e4 c5 2. Nf3');
  expect(course.sections[1].name).toBe('After 2.Nf3');
  expect(course.sections[1].variationIndices).toEqual([1, 2]);
});
