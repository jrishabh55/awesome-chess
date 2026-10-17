import { expect, it } from 'vitest';
import { createStudy, playMove } from '../chess/tree';
import type { AnalysisResult, AnalyzeRequest, EngineLine } from '../engine/types';
import type { EngineClient } from '../engine/worker-client';
import { classify } from './classify';
import { analyzeSelectedMove } from './selected-analysis';
import { reviewSearchProfile, type MoveAssessment } from './policy';

const line = (value: number, pv: string[], depth = 16, rank = 1): EngineLine => ({
  score: { kind: 'cp', value },
  pv,
  depth,
  rank,
  bound: 'exact',
});

function fixture(
  playedScore = 139,
  live = line(605, ['d8c8']),
  legacy = false,
  abortDuringRecheck = false,
  missing = false,
) {
  const root = createStudy('3r4/p4p1p/1p3k2/1P2RP2/3p2P1/3P4/P4P1P/6K1 w - - 1 29');
  const study = playMove(root, root.rootId, 'f4');
  let assessment: MoveAssessment = classify({
    nodeId: study.selectedId,
    mover: 'w',
    playedUci: 'f2f4',
    legalCount: 20,
    book: false,
    best: line(557, ['e5e4']),
    played: line(playedScore, ['f2f4', 'd8g8']),
    evidence: [],
  });
  if (legacy) delete assessment.searchVersion;
  const initial = assessment;
  const requests: AnalyzeRequest[] = [];
  const results: AnalysisResult[] = [];
  const controller = new AbortController();
  const engine = {
    analyze: async (
      request: AnalyzeRequest,
      signal: AbortSignal,
      update?: (result: AnalysisResult) => void,
    ): Promise<AnalysisResult> => {
      requests.push(request);
      const livePosition = request.position.moves.length === 1;
      if (!livePosition && abortDuringRecheck) controller.abort();
      const verified = !missing || (request.budget.kind === 'depth' && request.budget.depth >= 20);
      const otherReplies = ['d8c8', 'd8g8', 'f6g7'].filter((move) => move !== live.pv[0]);
      const result: AnalysisResult = {
        requestId: request.id,
        engineId: 'Stockfish 19',
        profileId: 'full:full-strength',
        positionKey: JSON.stringify(request.position),
        completed: true,
        lines: livePosition
          ? [
              live,
              line(
                live.score.kind === 'cp' ? live.score.value + 10 : 615,
                [otherReplies[0]],
                live.depth,
                2,
              ),
              line(
                live.score.kind === 'cp' ? live.score.value + 20 : 625,
                [otherReplies[1]],
                live.depth,
                3,
              ),
            ]
          : request.rootMoves
            ? [line(verified ? 583 : 139, ['f2f4', 'd8c8'], verified ? 22 : 16)]
            : [
                line(verified ? 610 : 557, ['e5e4', 'a7a6'], verified ? 22 : 16),
                line(400, ['e5e2'], verified ? 22 : 16, 2),
                line(390, ['e5e1'], verified ? 22 : 16, 3),
              ],
      };
      if (request.budget.kind === 'infinite') {
        return new Promise((_, reject) => {
          const cancel = () => reject(new DOMException('Analysis canceled', 'AbortError'));
          signal.addEventListener('abort', cancel, { once: true });
          update?.({ ...result, completed: false });
          if (signal.aborted) cancel();
        });
      }
      update?.({ ...result, completed: false });
      if (signal.aborted) throw new DOMException('Analysis canceled', 'AbortError');
      return result;
    },
  } as unknown as EngineClient;
  const run = (infinite = false) =>
    analyzeSelectedMove({
      study,
      engine,
      signal: controller.signal,
      depth: 16,
      infinite,
      getAssessment: () => (missing && assessment === initial ? undefined : assessment),
      onAssessment: (value) => {
        assessment = value;
      },
      onResult: (value) => {
        results.push(value);
        if (infinite && results.length >= 2) controller.abort();
      },
    });
  return { run, requests, results, controller, initial, assessment: () => assessment };
}

it('refreshes a saved blunder contradicted by live analysis at the same depth', async () => {
  const f = fixture();
  await f.run();
  expect(f.assessment().base).toBe('Excellent');
  expect(f.assessment().after).toEqual({ kind: 'cp', value: 583 });
  expect(f.requests.filter((request) => request.position.moves.length === 0)).toHaveLength(2);
  expect(f.results.every((result) => result.lines[0].pv[0] === 'd8c8')).toBe(true);
});

it('checks live evidence against an assessment created during this analysis session', async () => {
  const f = fixture(139, line(605, ['d8c8']), false, false, true);
  await f.run();
  expect(f.assessment().base).toBe('Excellent');
  expect(f.assessment().after).toEqual({ kind: 'cp', value: 583 });
});

it('pauses continuous analysis to refresh a contradiction, then restarts it', async () => {
  const f = fixture();
  const timeout = setTimeout(() => f.controller.abort(), 500);
  try {
    await expect(f.run(true)).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.assessment().base).toBe('Excellent');
    expect(f.requests.filter((request) => request.budget.kind === 'infinite')).toHaveLength(2);
  } finally {
    clearTimeout(timeout);
  }
});

it('recomputes legacy cached assessments even when live analysis agrees with their old score', async () => {
  const f = fixture(139, line(139, ['d8g8']), true);
  await f.run();
  expect(f.assessment().base).toBe('Excellent');
});

it.each([
  line(605, ['d8c8'], 10),
  { ...line(605, ['d8c8']), bound: 'lower' as const },
  line(150, ['d8c8']),
])('keeps a saved assessment without reliable conflicting evidence (%j)', async (live) => {
  const f = fixture(139, live);
  await f.run();
  expect(f.assessment()).toBe(f.initial);
  expect(f.requests).toHaveLength(1);
});

it('keeps a sound cached assessment when live analysis agrees', async () => {
  const f = fixture(583);
  await f.run();
  expect(f.assessment()).toBe(f.initial);
  expect(f.requests).toHaveLength(1);
});

it('rechecks a severe label when a small live score change crosses its policy boundary', async () => {
  const f = fixture(175, line(250, ['d8c8']));
  Object.assign(
    f.initial,
    classify({
      nodeId: f.initial.nodeId,
      mover: 'w',
      playedUci: 'f2f4',
      legalCount: 20,
      book: false,
      best: line(300, ['e5e4']),
      played: line(175, ['f2f4', 'd8g8']),
      evidence: [],
    }),
  );
  expect(f.initial.base).toBe('Mistake');
  await f.run();
  expect(f.assessment().base).toBe('Excellent');
  expect(f.assessment().before).toEqual({ kind: 'cp', value: 610 });
  expect(f.assessment().after).toEqual({ kind: 'cp', value: 583 });
});

it('reuses a verified Quick assessment below the selected depth without repeating its searches', async () => {
  const f = fixture(139, line(139, ['d8g8']));
  f.initial.depth = 10;
  f.initial.reviewProfile = reviewSearchProfile('quick', 16);
  await f.run();
  expect(f.assessment()).toBe(f.initial);
  expect(f.requests).toHaveLength(1);
});

it('does not refresh a move after navigation cancels its live search', async () => {
  const f = fixture();
  f.controller.abort();
  await expect(f.run()).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.assessment()).toBe(f.initial);
  expect(f.results).toHaveLength(0);
});

it('does not store a reassessment canceled while comparing moves', async () => {
  const f = fixture(139, line(605, ['d8c8']), false, true);
  await expect(f.run()).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.assessment()).toBe(f.initial);
  expect(f.results).toHaveLength(1);
});
