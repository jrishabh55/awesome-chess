import { assetUrl } from '../app/asset-url';
import type { GameOutcome } from '../chess/outcome';
import type { Color } from '../chess/types';

export function GameOutcomeBadge({ outcome, color }: { outcome: GameOutcome; color: Color }) {
  const side = color === 'w' ? 'white' : 'black';
  const player = color === 'w' ? 'White' : 'Black';
  const won = outcome.kind === 'win' && outcome.winner === color;
  const icon =
    outcome.kind === 'draw'
      ? `draw_${side}`
      : won
        ? 'winner'
        : outcome.reason === 'checkmate'
          ? 'mate'
          : outcome.reason === 'timeout'
            ? `unnamed_clock_${side}`
            : `resign_${side}`;
  const label =
    outcome.kind === 'draw'
      ? `${player} drew`
      : won
        ? `${player} won`
        : `${player} lost${outcome.reason === 'checkmate' ? ' by checkmate' : outcome.reason === 'timeout' ? ' on time' : outcome.reason === 'resignation' ? ' by resignation' : ''}`;
  return (
    <span className="board-badge outcome-badge" role="img" aria-label={label} title={label}>
      <img
        className="move-quality-icon"
        src={assetUrl(`assets/quality/${icon}.svg`)}
        width={24}
        height={24}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
    </span>
  );
}
