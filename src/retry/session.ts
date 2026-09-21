import type { Study, PositionInput } from '../chess/types';
import { positionAt, playMove } from '../chess/tree';
import type { MoveAssessment } from '../review/policy';
import { assessMove } from '../review/classify';
import { EngineClient } from '../engine/worker-client';
export interface RetrySession {
  originId: string;
  position: PositionInput;
  parentId: string;
  study: Study;
  hints: number;
  revealed: boolean;
  attempt: Study | null;
  feedback: MoveAssessment | null;
}
export function startRetry(study: Study, nodeId: string): RetrySession {
  const node = study.nodes[nodeId];
  if (!node?.parentId) throw Error('Choose a move to retry');
  return {
    originId: nodeId,
    position: positionAt(study, node.parentId),
    parentId: node.parentId,
    study: structuredClone(study),
    hints: 0,
    revealed: false,
    attempt: null,
    feedback: null,
  };
}
export async function submitRetry(
  session: RetrySession,
  uci: string,
  engine: EngineClient,
  signal: AbortSignal,
  depth: number,
) {
  const attempt = playMove(session.study, session.parentId, uci);
  const feedback = await assessMove(
    attempt,
    attempt.selectedId,
    engine,
    signal,
    depth,
    'interactive-retry',
  );
  return {
    attempt,
    feedback,
    accepted:
      feedback.loss <= 0.01 &&
      !['Blunder', 'Mistake', 'Inaccuracy', 'Miss'].includes(feedback.base),
  };
}
