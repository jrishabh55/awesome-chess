import { it, expect } from 'vitest';
import { assessMove, classify, detectEvidence } from './classify';
import { createStudy, playMove } from '../chess/tree';
import type { AnalyzeRequest, EngineLine } from '../engine/types';
import type { EngineClient } from '../engine/worker-client';
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

it.each([12, 20])(
  'quick reviews at depth %i bound search time and do not claim unverified deep labels',
  async (depth) => {
    const { assessMove } = await import('./classify');
    const { parsePgn } = await import('../chess/tree');
    const requests: import('../engine/types').AnalyzeRequest[] = [];
    const fake = {
      analyze: async (request: import('../engine/types').AnalyzeRequest) => {
        requests.push(request);
        return {
          lines: [
            { ...line(400, ['e2e4']), depth: 10 },
            { ...line(-200, ['d2d4']), depth: 10, rank: 2 },
            { ...line(-250, ['g1f3']), depth: 10, rank: 3 },
          ],
        };
      },
    } as unknown as import('../engine/worker-client').EngineClient;
    const study = parsePgn('1. e4 *')[0];
    const result = await assessMove(
      study,
      study.mainline[0],
      fake,
      new AbortController().signal,
      depth,
      'review',
      'quick',
    );
    expect(requests.map((r) => r.budget)).toEqual([
      { kind: 'time', milliseconds: 250 },
      { kind: 'time', milliseconds: 900 },
    ]);
    expect(result.primary).not.toBe('Great');
    expect(result.depth).toBe(10);
    expect(result.evidence.some((e) => e.kind === 'unique')).toBe(false);
  },
);

const f4Study = () => {
  const study = createStudy('3r4/p4p1p/1p3k2/1P2RP2/3p2P1/3P4/P4P1P/6K1 w - - 1 29');
  return playMove(study, study.rootId, 'f4');
};

it.each(['quick', 'deep'] as const)(
  '%s review rechecks a false blunder even without a material or mating opportunity',
  async (speed) => {
    const study = f4Study();
    const requests: AnalyzeRequest[] = [];
    const engine = {
      analyze: async (request: AnalyzeRequest) => {
        requests.push(request);
        const verified =
          request.budget.kind === 'time'
            ? request.budget.milliseconds > 900
            : request.budget.kind === 'depth' && request.budget.depth >= 20;
        const lines = request.rootMoves
          ? [{ ...line(verified ? 583 : 139, ['f2f4', 'd8g8']), depth: verified ? 22 : 16 }]
          : [
              { ...line(verified ? 610 : 557, ['e5e4', 'a7a6']), depth: verified ? 22 : 16 },
              { ...line(400, ['e5e2']), rank: 2, depth: verified ? 22 : 16 },
              { ...line(390, ['e5e1']), rank: 3, depth: verified ? 22 : 16 },
            ];
        return {
          requestId: request.id,
          engineId: 'Stockfish 19',
          profileId: 'full:full-strength',
          positionKey: JSON.stringify(request.position),
          lines,
          completed: true,
        };
      },
    } as unknown as EngineClient;
    const assessment = await assessMove(
      study,
      study.selectedId,
      engine,
      new AbortController().signal,
      16,
      'review',
      speed,
    );
    expect(assessment.base).toBe('Excellent');
    expect(assessment.after).toEqual({ kind: 'cp', value: 583 });
    expect(assessment.depth).toBe(22);
    expect(requests.every((request) => request.position.moves.length === 0)).toBe(true);
  },
);

it('retains a real blunder when the stronger comparison confirms the loss', async () => {
  const study = f4Study();
  const engine = {
    analyze: async (request: AnalyzeRequest) => ({
      requestId: request.id,
      engineId: 'Stockfish 19',
      profileId: 'full:full-strength',
      positionKey: JSON.stringify(request.position),
      completed: true,
      lines: request.rootMoves
        ? [{ ...line(-200, ['f2f4', 'd8g8']), depth: 22 }]
        : [
            { ...line(557, ['e5e4']), depth: 22 },
            { ...line(400, ['e5e2']), rank: 2, depth: 22 },
            { ...line(390, ['e5e1']), rank: 3, depth: 22 },
          ],
    }),
  } as unknown as EngineClient;
  const assessment = await assessMove(
    study,
    study.selectedId,
    engine,
    new AbortController().signal,
    16,
    'review',
    'quick',
  );
  expect(assessment.base).toBe('Blunder');
  expect(assessment.after).toEqual({ kind: 'cp', value: -200 });
});
