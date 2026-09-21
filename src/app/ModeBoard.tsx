import type { ComponentProps, ReactNode } from 'react';
import { Board } from '../board/Board';
import { assetUrl } from './asset-url';
import type { Color } from '../chess/types';
export function ModeBoard({
  board,
  tools,
  top,
  bottom,
  caption,
  evaluation,
  children,
}: {
  board: ComponentProps<typeof Board>;
  tools: ReactNode;
  top?: ReactNode;
  bottom?: ReactNode;
  caption?: ReactNode;
  evaluation?: ReactNode;
  children?: ReactNode;
}) {
  const player = (color: Color) => (
    <div className="player-row">
      <div className={`player-avatar ${color}`}>
        <img src={assetUrl(`assets/pieces/${color}K.svg`)} alt="" />
      </div>
      <div className="player-info">
        <strong>{color === 'w' ? 'White' : 'Black'}</strong>
      </div>
      <span className="player-result">{board.fen.split(' ')[1] === color ? 'To move' : ' '}</span>
    </div>
  );
  return (
    <section className="board-column shared-board-column" aria-label="Chess board workspace">
      {top ?? player(board.orientation === 'w' ? 'b' : 'w')}
      <div className="board-with-eval">
        {evaluation ?? <div className="board-eval-spacer" aria-hidden="true" />}
        <Board {...board} />
      </div>
      {bottom ?? player(board.orientation)}
      {tools}
      <div className="board-caption">
        <span>Right-click / drag: red · Ctrl: orange · Shift: green</span>
        <span>{caption ?? 'On this device'}</span>
      </div>
      {children}
    </section>
  );
}
