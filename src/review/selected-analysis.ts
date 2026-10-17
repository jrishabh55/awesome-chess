import type { Study } from '../chess/types';
import { positionAt } from '../chess/tree';
import type { AnalysisResult } from '../engine/types';
import type { EngineClient } from '../engine/worker-client';
import { assessMove, classify } from './classify';
import {
  ASSESSMENT_SEARCH_VERSION,
  reviewSearchProfile,
  scoreExpected,
  type MoveAssessment,
} from './policy';

interface SelectedAnalysis {
  study: Study;
  engine: EngineClient;
  signal: AbortSignal;
  depth: number;
  infinite: boolean;
  getAssessment: () => MoveAssessment | undefined;
  onAssessment: (assessment: MoveAssessment) => void;
  onResult: (result: AnalysisResult) => void;
}

export async function analyzeSelectedMove({
  study,
  engine,
  signal,
  depth,
  infinite,
  getAssessment,
  onAssessment,
  onResult,
}: SelectedAnalysis): Promise<AnalysisResult> {
  const node = study.selectedId;
  let updated: MoveAssessment | undefined;
  let minimumRecheckDepth = 0;
  const assertActive = () => {
    if (signal.aborted) throw new DOMException('Analysis canceled', 'AbortError');
  };
  assertActive();
  const currentAssessment = () => updated || getAssessment();
  const assessSelected = async (recheckDepth?: number) => {
    const existing = currentAssessment();
    if (
      node !== study.rootId &&
      (recheckDepth !== undefined ||
        !existing ||
        existing.searchVersion !== ASSESSMENT_SEARCH_VERSION ||
        (existing.depth < depth && existing.reviewProfile !== reviewSearchProfile('quick', depth)))
    ) {
      assertActive();
      const selectedDepth = recheckDepth ?? depth;
      const speed = recheckDepth !== undefined ? 'deep' : 'quick';
      const assessment = await assessMove(
        study,
        node,
        engine,
        signal,
        selectedDepth,
        'interactive',
        speed,
      );
      assertActive();
      assessment.reviewProfile = reviewSearchProfile(speed, selectedDepth);
      updated = assessment;
      onAssessment(assessment);
    }
  };
  // Establish the move comparison first, so live evidence can check new as well
  // as cached assessments. An unlimited search would otherwise starve it.
  await assessSelected();
  for (;;) {
    assertActive();
    const liveAbort = new AbortController();
    const cancelLive = () => liveAbort.abort();
    signal.addEventListener('abort', cancelLive, { once: true });
    let recheckDepth: number | undefined;
    let result: AnalysisResult | undefined;
    const receive = (partial: AnalysisResult) => {
      if (signal.aborted || recheckDepth !== undefined) return;
      onResult(partial);
      if (signal.aborted) return;
      const existing = currentAssessment();
      const line = partial.lines[0];
      if (
        !existing ||
        line?.rank !== 1 ||
        line.bound !== 'exact' ||
        line.depth < Math.max(existing.depth, minimumRecheckDepth)
      )
        return;
      const scoreChanged =
        Math.abs(
          scoreExpected(line.score, existing.mover) - scoreExpected(existing.after, existing.mover),
        ) > 0.08;
      const severeLabelChanged =
        ['Mistake', 'Blunder'].includes(existing.base) &&
        classify({
          nodeId: node,
          mover: existing.mover,
          playedUci: study.nodes[node].uci!,
          book: existing.book,
          legalCount: existing.forced ? 1 : 2,
          best: {
            rank: 1,
            score: existing.before,
            depth: existing.depth,
            pv: existing.bestLine,
            bound: 'exact',
          },
          played: { ...line, pv: [study.nodes[node].uci!, ...line.pv] },
          evidence: [],
        }).base !== existing.base;
      if (scoreChanged || severeLabelChanged) {
        // Live lines evaluate the displayed position. Rebuild both move scores
        // from its parent, rather than comparing a new score to an old reference.
        recheckDepth = Math.max(20, depth, existing.depth + 2, line.depth + 1);
        liveAbort.abort();
      }
    };
    try {
      result = await engine.analyze(
        {
          id: `interactive:${study.id}:${node}`,
          position: positionAt(study, node),
          budget: infinite ? { kind: 'infinite' } : { kind: 'depth', depth },
          multiPv: 3,
        },
        liveAbort.signal,
        receive,
      );
      assertActive();
      receive(result);
    } catch (error) {
      if (
        signal.aborted ||
        recheckDepth === undefined ||
        !(error instanceof DOMException && error.name === 'AbortError')
      )
        throw error;
    } finally {
      signal.removeEventListener('abort', cancelLive);
    }
    assertActive();
    if (recheckDepth !== undefined) {
      minimumRecheckDepth = recheckDepth;
      await assessSelected(recheckDepth);
      continue;
    }
    return result!;
  }
}
