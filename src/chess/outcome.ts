import type { Color, Study } from './types';
import { chessAt } from './tree';

export type GameOutcome =
  | { kind: 'win'; winner: Color; reason: 'checkmate' | 'resignation' | 'timeout' | 'result' }
  | { kind: 'draw' };

export function outcomeAt(study: Study): GameOutcome | undefined {
  const chess = chessAt(study, study.selectedId);
  if (chess.isCheckmate())
    return { kind: 'win', winner: chess.turn() === 'w' ? 'b' : 'w', reason: 'checkmate' };
  // Repetition and the 50-move threshold allow a claim; they don't prove the game ended.
  if (chess.isStalemate() || chess.isInsufficientMaterial()) return { kind: 'draw' };
  // A game's declared result never applies to an earlier position or a different branch.
  if (study.selectedId !== (study.mainline.at(-1) || study.rootId)) return;
  const result = study.headers.Result;
  if (result === '1/2-1/2') return { kind: 'draw' };
  if (result !== '1-0' && result !== '0-1') return;
  const termination = study.headers.Termination || '';
  return {
    kind: 'win',
    winner: result === '1-0' ? 'w' : 'b',
    reason: /time|timeout/i.test(termination)
      ? 'timeout'
      : /resign/i.test(termination)
        ? 'resignation'
        : 'result',
  };
}
