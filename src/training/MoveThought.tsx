import { Chess } from 'chess.js';
import { MoveBanner } from '../board/MoveBanner';
import type { Square } from '../chess/types';
import { explainOpeningMove } from './explanations';
import type { TeachingLine } from './packs';

export function MoveThought({
  courseName,
  line,
  ply,
}: {
  courseName: string;
  line: TeachingLine;
  ply: number;
}) {
  const thoughtKey = `${line.rootFen}:${line.name}:${ply}`;
  const index = Math.max(0, ply - 1);
  const move = line.moves[index];
  if (!move) return null;
  const from = move.uci.slice(0, 2),
    to = move.uci.slice(2, 4);
  const square = (ply ? to : from) as Square;
  const piece = new Chess(ply ? move.after : move.before).get(square);
  if (!piece) return null;
  const explanation = explainOpeningMove(courseName, line, index);
  const text = ply ? explanation.thought : explanation.thought.replace(/\bI /, 'I’ll ');
  return (
    <MoveBanner
      positionKey={thoughtKey}
      square={square}
      piece={piece}
      from={from}
      to={to}
      capture={move.san.includes('x')}
      text={text}
      label={ply ? 'Lesson move' : 'Up next'}
    />
  );
}
