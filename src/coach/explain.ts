import type { Study } from '../chess/types';
import type { Evidence, MoveAssessment } from '../review/policy';
import { isError } from '../review/policy';
import { scoreText } from '../engine/uci';
export function explainMove(a: MoveAssessment): {
  text: string;
  actions: { label: string; evidence: Evidence }[];
} {
  const intros = {
    Brilliant: 'A sound sacrifice. Giving up material keeps your position strong.',
    Great:
      'You found the critical move. The strongest alternative gives away a significant advantage.',
    Best: 'You found the engine’s top choice.',
    Excellent: 'An excellent move, very close to the strongest continuation.',
    Good: 'A solid move that keeps most of the value of the position.',
    Book: 'This move follows a recognized opening line.',
    Inaccuracy: 'There was a more precise way to continue.',
    Mistake: 'This move gives your opponent a meaningful opportunity.',
    Blunder: 'This move changes the position significantly in your opponent’s favor.',
    Miss: 'You missed a concrete tactical opportunity.',
  };
  let text = intros[a.primary];
  if (isError(a.primary))
    text += ` The strongest line evaluates to ${scoreText(a.before)}, compared with ${scoreText(a.after)} after your move.`;
  else text += ` The position evaluates to ${scoreText(a.after)}.`;
  const actions = a.evidence
    .filter((e) => ['fork', 'pin', 'material', 'mate', 'miss', 'sacrifice'].includes(e.kind))
    .map((e) => ({
      evidence: e,
      label:
        e.kind === 'fork'
          ? 'Show double attack'
          : e.kind === 'pin'
            ? 'Show pin'
            : e.kind === 'material'
              ? 'Show material gain'
              : e.kind === 'mate'
                ? 'Show mate'
                : e.kind === 'sacrifice'
                  ? 'Show sacrifice'
                  : 'Show missed idea',
    }));
  return { text, actions };
}
export function keyMoments(
  s: Study,
  a: Record<string, MoveAssessment>,
  color: 'w' | 'b' | 'both' = 'both',
): string[] {
  return s.mainline.filter((id, index) => {
    const m = a[id];
    return (
      m &&
      (color === 'both' || m.mover === color) &&
      (isError(m.primary) ||
        ['Brilliant', 'Great'].includes(m.primary) ||
        (m.book && !a[s.mainline[index + 1]]?.book) ||
        index === s.mainline.length - 1)
    );
  });
}
