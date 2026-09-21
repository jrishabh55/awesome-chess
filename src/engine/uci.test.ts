import { it, expect } from 'vitest';
import { parseInfo } from './uci';
it('normalizes black scores once', () =>
  expect(parseInfo('info depth 14 multipv 2 score cp 135 pv e7e5 g1f3', 'b')).toMatchObject({
    rank: 2,
    depth: 14,
    score: { kind: 'cp', value: -135 },
    pv: ['e7e5', 'g1f3'],
  }));
it('keeps mate winner and bounds', () =>
  expect(parseInfo('info depth 18 score mate -3 upperbound pv e8f8', 'b')).toMatchObject({
    score: { kind: 'mate', moves: 3, winner: 'w' },
    bound: 'upper',
  }));
it('ignores incomplete info', () => expect(parseInfo('info nodes 45 nps 32', 'w')).toBeNull());
