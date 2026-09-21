import { expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { arrowPath } from './geometry';
import { reconcilePieces } from './pieces';
it('draws knight arrows with an orthogonal longer first leg in either orientation', () => {
  expect(arrowPath({ x: 1.5, y: 7.5 }, { x: 2.5, y: 5.5 })).toBe('M 1.5 7.5 L 1.5 5.5 L 2.5 5.5');
  expect(arrowPath({ x: 6.5, y: 0.5 }, { x: 5.5, y: 2.5 })).toBe('M 6.5 0.5 L 6.5 2.5 L 5.5 2.5');
  expect(arrowPath({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe('M 0 0 L 3 3');
});
it('keeps the moving piece identity through moves and reverse navigation', () => {
  const c = new Chess();
  const before = reconcilePieces([], c.fen());
  c.move('e4');
  const after = reconcilePieces(before, c.fen());
  expect(after.find((p) => p.square === 'e4')?.id).toBe(before.find((p) => p.square === 'e2')?.id);
  c.undo();
  const back = reconcilePieces(after, c.fen());
  expect(back.find((p) => p.square === 'e2')?.id).toBe(before.find((p) => p.square === 'e2')?.id);
});
it('animates both castling pieces without changing their identities', () => {
  const c = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const before = reconcilePieces([], c.fen());
  c.move('O-O');
  const after = reconcilePieces(before, c.fen());
  expect(after.find((p) => p.square === 'g1')?.id).toBe(before.find((p) => p.square === 'e1')?.id);
  expect(after.find((p) => p.square === 'f1')?.id).toBe(before.find((p) => p.square === 'h1')?.id);
});
it('keeps piece rendering order stable when a long move crosses other pieces', () => {
  const c = new Chess('8/8/7k/8/8/8/7K/R7 w - - 0 1');
  const before = reconcilePieces([], c.fen());
  c.move('Ra8');
  const after = reconcilePieces(before, c.fen());
  expect(after.map((p) => p.id)).toEqual(before.map((p) => p.id));
  c.undo();
  expect(reconcilePieces(after, c.fen()).map((p) => p.id)).toEqual(before.map((p) => p.id));
});
