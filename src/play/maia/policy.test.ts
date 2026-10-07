import { expect, it } from 'vitest';
import { Chess, DEFAULT_POSITION } from 'chess.js';
import { encodePosition, legalPolicy, sampleMove } from './policy';

const peak = (index: number) => {
  const logits = new Float32Array(4352).fill(-1000);
  logits[index] = 1000;
  return logits;
};
it('encodes piece channels on a1-based squares and mirrors Black into the moving side', () => {
  const white = encodePosition(DEFAULT_POSITION);
  expect(white).toHaveLength(768);
  expect(white[12 * 12]).toBe(1); // White pawn on e2.
  expect(white[60 * 12 + 11]).toBe(1); // Black king on e8.
  const chess = new Chess();
  chess.move('e4');
  const black = encodePosition(chess.fen());
  expect(black[12 * 12]).toBe(1); // Black e7 pawn is own pawn on e2.
  expect(black[36 * 12 + 6]).toBe(1); // White e4 pawn is enemy pawn on e5.
  expect(Array.from(black).reduce((a, b) => a + b)).toBe(32);
});
it('masks illegal model moves and samples the exact original-board UCI move', () => {
  const logits = peak(796); // e2 (12) to e4 (28).
  logits[0] = 10000; // Illegal a1a1 must never dominate.
  expect(sampleMove(DEFAULT_POSITION, logits, () => 0.5)).toBe('e2e4');
  const chess = new Chess();
  chess.move('e4');
  expect(sampleMove(chess.fen(), peak(731), () => 0.5)).toBe('d7d5'); // mirrored d2d4.
});
it('normalizes extreme legal logits without overflow and uses the supplied random draw', () => {
  const policy = legalPolicy(DEFAULT_POSITION, new Float32Array(4352).fill(10000));
  expect(policy).toHaveLength(20);
  expect(policy.reduce((sum, move) => sum + move.probability, 0)).toBeCloseTo(1);
  expect(policy.every((move) => Number.isFinite(move.probability))).toBe(true);
  expect(sampleMove(DEFAULT_POSITION, new Float32Array(4352), () => 0)).toBe('a2a3');
  expect(sampleMove(DEFAULT_POSITION, new Float32Array(4352), () => 0.999)).toBe('g1h3');
});
it.each([
  ['r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 262, 'e1g1'],
  ['r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1', 258, 'e8c8'],
  ['4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', 2347, 'e5d6'],
  ['4k3/8/8/8/3Pp3/8/8/4K3 b - d3 0 1', 2347, 'e4d3'],
])('preserves special move legality for %s', (fen, index, move) => {
  expect(sampleMove(fen, peak(index), () => 0.5)).toBe(move);
});
it.each([
  [4240, 'e7e8q'],
  [4241, 'e7e8r'],
  [4242, 'e7e8b'],
  [4243, 'e7e8n'],
])('keeps promotion vocabulary index %i', (index, move) => {
  expect(sampleMove('k7/4P3/8/8/8/8/8/K7 w - - 0 1', peak(index), () => 0.5)).toBe(move);
});
it('rejects malformed policy output and positions without a legal move', () => {
  expect(() => legalPolicy(DEFAULT_POSITION, new Float32Array(1))).toThrow(/policy/i);
  const logits = new Float32Array(4352);
  logits[796] = NaN;
  expect(() => legalPolicy(DEFAULT_POSITION, logits)).toThrow(/policy/i);
  expect(() => sampleMove('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', new Float32Array(4352))).toThrow(
    /legal move/i,
  );
});
