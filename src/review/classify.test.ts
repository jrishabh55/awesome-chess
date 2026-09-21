import { it, expect } from 'vitest';
import { classify, detectEvidence } from './classify';
import type { EngineLine } from '../engine/types';
const line = (cp: number, pv: string[]): EngineLine => ({
  rank: 1,
  depth: 16,
  score: { kind: 'cp', value: cp },
  pv,
  bound: 'exact',
});
it('attributes losses to the mover rather than White', () => {
  const a = classify({
    nodeId: 'b',
    mover: 'b',
    playedUci: 'e7e6',
    book: false,
    legalCount: 20,
    best: line(-300, ['e7e5']),
    played: line(300, ['e7e6']),
    second: line(-200, ['d7d5']),
    evidence: [],
  });
  expect(a.primary).toBe('Blunder');
  expect(a.loss).toBeGreaterThan(0.5);
});
it('does not award great to a forced only legal move', () => {
  const a = classify({
    nodeId: 'w',
    mover: 'w',
    playedUci: 'e1e2',
    book: false,
    legalCount: 1,
    best: line(0, ['e1e2']),
    played: line(0, ['e1e2']),
    evidence: [],
  });
  expect(a.primary).toBe('Best');
  expect(a.forced).toBe(true);
});
it('verifies a mating continuation', () => {
  const evidence = detectEvidence(
    { rootFen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', moves: [] },
    line(-300, []),
  );
  expect(evidence).toEqual([]);
});
it('does not coach illegal off-ray captures by a pinned queen', () => {
  const evidence = detectEvidence(
    { rootFen: 'k3r3/8/8/8/8/1q5r/4Q3/4K3 w - - 0 1', moves: [] },
    line(0, ['e2e3']),
  );
  expect(evidence.some((e) => e.kind === 'fork')).toBe(false);
});
it('demonstrates legal mate instead of only trusting the score', () => {
  const e = detectEvidence(
    { rootFen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2', moves: [] },
    line(-1000, ['d8h4']),
  );
  expect(e.find((x) => x.kind === 'mate')?.facts.plies).toBe(1);
});
