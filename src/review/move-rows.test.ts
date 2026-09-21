import { expect, it } from 'vitest';
import { parsePgn } from '../chess/tree';
import { moveRows } from './move-rows';

it('includes every move once across white, black, and nested variations', () => {
  const study = parsePgn(
    '1. e4 (1. d4 d5 (1... Nf6) 2. c4) e5 (1... c5 2. Nf3) 2. Nf3 (2. Bc4 Nc6) Nc6 3. Bb5 *',
  )[0];
  const rows = moveRows(study);
  const ids = rows.flatMap((row) => [row.white, row.black].filter((id) => id !== undefined));
  expect(ids).toHaveLength(Object.keys(study.nodes).length - 1);
  expect(new Set(ids)).toEqual(
    new Set(Object.keys(study.nodes).filter((id) => id !== study.rootId)),
  );
  expect(
    rows.slice(0, 3).map((row) => [row.white, row.black].map((id) => id && study.nodes[id].san)),
  ).toEqual([
    ['e4', 'e5'],
    ['Nf3', 'Nc6'],
    ['Bb5', undefined],
  ]);
  expect(rows.some((row) => row.depth === 2)).toBe(true);
});

it('keeps the black column and fullmove number for a black-to-move FEN', () => {
  const study = parsePgn(
    '[SetUp "1"]\n[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 17"]\n\n17... e5 (17... d5) 18. e4 Nc6 *',
  )[0];
  const rows = moveRows(study);
  expect(
    rows.map((row) => ({
      number: row.number,
      white: row.white && study.nodes[row.white].san,
      black: row.black && study.nodes[row.black].san,
      depth: row.depth,
    })),
  ).toEqual([
    { number: 17, white: undefined, black: 'e5', depth: 0 },
    { number: 18, white: 'e4', black: 'Nc6', depth: 0 },
    { number: 17, white: undefined, black: 'd5', depth: 1 },
  ]);
});

it('returns no rows for an untouched starting position', () => {
  const study = parsePgn('8/8/7k/8/8/8/7K/R7 w - - 0 1')[0];
  expect(moveRows(study)).toEqual([]);
});
