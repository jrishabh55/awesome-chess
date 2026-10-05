import { Chess } from 'chess.js';
import type { Study, Square } from '../chess/types';
import type { MoveAssessment } from '../review/policy';
import { labelInfo } from '../review/policy';
import { MoveQualityIcon } from '../ui/MoveQualityIcon';
import { MoveBanner } from '../board/MoveBanner';
import { explainMove } from './explain';

const names: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export function ReviewMoveBanner({
  study,
  assessment,
  message,
  action,
}: {
  study: Study;
  assessment?: MoveAssessment;
  message?: string;
  action?: { label: string; onClick: () => void };
}) {
  const node = study.nodes[study.selectedId];
  if (!node.uci || !node.parentId) return null;
  const chess = new Chess(study.nodes[node.parentId].fen);
  const move = chess.move({
    from: node.uci.slice(0, 2),
    to: node.uci.slice(2, 4),
    promotion: node.uci[4],
  });
  const piece = chess.get(move.to);
  if (!piece) return null;
  const opponent = move.color === 'w' ? 'Black' : 'White';
  let description =
    move.isKingsideCastle() || move.isQueensideCastle()
      ? `I castle ${move.isKingsideCastle() ? 'kingside' : 'queenside'}, bringing my rook toward the center.`
      : `I ${move.captured ? `capture ${opponent}’s ${names[move.captured]}${move.isEnPassant() ? ' en passant' : ''}` : 'move'} ${move.captured ? 'on' : 'to'} ${move.to}.`;
  if (move.promotion) description += ` I promote to a ${names[move.promotion]}.`;
  if (chess.isCheckmate()) description += ' This is checkmate.';
  else if (chess.isCheck()) description += ' I give check.';
  const text = [
    assessment ? explainMove(assessment).text.split(/(?<=\.) /)[0] : description,
    message,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <MoveBanner
      positionKey={`${study.id}:${node.id}`}
      square={move.to as Square}
      piece={piece}
      from={move.from}
      to={move.to}
      capture={Boolean(move.captured)}
      text={text}
      label={assessment ? `${assessment.primary} move` : 'Played move'}
      action={action}
      labelIcon={assessment ? <MoveQualityIcon label={assessment.primary} size={16} /> : undefined}
      labelColor={assessment ? labelInfo[assessment.primary].color : undefined}
    />
  );
}
