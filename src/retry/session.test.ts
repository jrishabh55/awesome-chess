import { it, expect } from 'vitest';
import { startRetry } from './session';
import { parsePgn } from '../chess/tree';
it('starts before the error and leaves the imported study intact', () => {
  const [s] = parsePgn('1. f3 e5 2. g4 Qh4# 0-1');
  const snapshot = JSON.stringify(s);
  const retry = startRetry(s, s.mainline[2]);
  expect(retry.position.moves).toEqual(['f2f3', 'e7e5']);
  expect(JSON.stringify(s)).toBe(snapshot);
});
