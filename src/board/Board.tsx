import { assetUrl } from '../app/asset-url';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Chess } from 'chess.js';
import type { Color, Square, Mark, DrawingColor } from '../chess/types';
import { pointToSquare, squareToPoint } from './coordinates';
import { MoveQualityIcon } from '../ui/MoveQualityIcon';
import { arrowPath, type Point } from './geometry';
import { reconcilePieces } from './pieces';
import { labelInfo, type Label } from '../review/policy';
const hues: Record<DrawingColor, string> = {
  green: '#8fbb55',
  red: '#f65c54',
  orange: '#ffb547',
  blue: '#57a1de',
  yellow: '#ebbd42',
};
const pieceNames: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};
interface Props {
  fen: string;
  orientation: Color;
  lastMove?: string | null;
  marks: Mark[];
  engineMarks?: Mark[];
  coachMarks?: Mark[];
  onMove: (uci: string) => void;
  onToggleMark: (mark: Mark) => void;
  drawingMode: 'move' | 'arrow' | 'square';
  drawingColor: DrawingColor;
  disabled?: boolean;
  badge?: Label;
  hideHints?: boolean;
  isSideline?: boolean;
}
export function Board({
  fen,
  orientation,
  lastMove,
  marks,
  engineMarks = [],
  coachMarks = [],
  onMove,
  onToggleMark,
  drawingMode,
  drawingColor,
  disabled,
  badge,
  hideHints,
  isSideline = false,
}: Props) {
  const boardRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    from: Square;
    draw: boolean;
    x: number;
    y: number;
    color: DrawingColor;
    right: boolean;
  } | null>(null);
  const frame = useRef<number | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  const [pieces, setPieces] = useState(() => reconcilePieces([], fen));
  useLayoutEffect(() => setPieces((old) => reconcilePieces(old, fen)), [fen]);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  const [selected, setSelected] = useState<Square | null>(null);
  const [preview, setPreview] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const chess = useMemo(() => new Chess(fen), [fen]);
  useEffect(() => {
    setSelected(null);
    setPreview(null);
    setPointer(null);
    setPromotion(null);
    gesture.current = null;
  }, [fen, orientation, drawingMode]);
  const squareAt = (x: number, y: number) => {
    const b = boardRef.current?.getBoundingClientRect();
    return b
      ? pointToSquare(((x - b.left) / b.width) * 8, ((y - b.top) / b.height) * 8, orientation)
      : null;
  };
  const legal = useMemo(
    () => (selected ? chess.moves({ square: selected, verbose: true }) : []),
    [chess, selected],
  );
  const move = (from: Square, to: Square) => {
    if (disabled) return;
    const candidates = chess.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (candidates.length) {
      if (candidates.some((m) => m.promotion)) setPromotion({ from, to });
      else onMove(from + to);
      setSelected(null);
    } else setSelected(chess.get(to)?.color === chess.turn() ? to : null);
  };
  const activate = (square: Square, draw = false) => {
    if (draw || drawingMode !== 'move') {
      if (drawingMode === 'square') onToggleMark({ kind: 'square', square, color: drawingColor });
      else if (selected) {
        onToggleMark(
          selected === square
            ? { kind: 'square', square, color: drawingColor }
            : { kind: 'arrow', from: selected, to: square, color: drawingColor },
        );
        setSelected(null);
      } else setSelected(square);
      return;
    }
    if (selected && selected !== square) move(selected, square);
    else setSelected(chess.get(square)?.color === chess.turn() ? square : null);
  };
  const allMarks = [...(hideHints ? [] : marks), ...(!hideHints ? engineMarks : []), ...coachMarks];
  const finishGesture = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    gesture.current = null;
    setPreview(null);
    setPointer(null);
  };
  return (
    <div className="board-frame">
      <div
        ref={boardRef}
        role="grid"
        aria-label="Chessboard"
        className={`chessboard${isSideline ? ' is-sideline' : ''}`}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.button !== 0 && e.button !== 2) return;
          const from = squareAt(e.clientX, e.clientY);
          if (!from) return;
          gesture.current = {
            from,
            draw: e.button === 2 || e.ctrlKey || drawingMode !== 'move',
            x: e.clientX,
            y: e.clientY,
            color:
              e.button === 2 || e.ctrlKey
                ? e.ctrlKey
                  ? 'orange'
                  : e.shiftKey
                    ? 'green'
                    : 'red'
                : drawingColor,
            right: e.button === 2 || e.ctrlKey,
          };
          if (!gesture.current.draw && chess.get(from)?.color === chess.turn()) setSelected(from);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const g = gesture.current,
            bounds = boardRef.current?.getBoundingClientRect();
          if (!g || !bounds || Math.hypot(e.clientX - g.x, e.clientY - g.y) <= 4) return;
          const point = {
            x: Math.max(0, Math.min(8, ((e.clientX - bounds.left) / bounds.width) * 8)),
            y: Math.max(0, Math.min(8, ((e.clientY - bounds.top) / bounds.height) * 8)),
          };
          const target = squareAt(e.clientX, e.clientY);
          if (frame.current !== null) cancelAnimationFrame(frame.current);
          frame.current = requestAnimationFrame(() => {
            setPointer(point);
            setPreview(target);
            frame.current = null;
          });
        }}
        onPointerCancel={() => {
          finishGesture();
          setSelected(null);
        }}
        onLostPointerCapture={() => {
          if (gesture.current) finishGesture();
        }}
        onPointerUp={(e) => {
          const g = gesture.current;
          if (!g) return;
          const to = squareAt(e.clientX, e.clientY);
          finishGesture();
          if (!to) return;
          const dragged = Math.hypot(e.clientX - g.x, e.clientY - g.y) > 6;
          if (g.draw) {
            if (dragged && g.from !== to) {
              onToggleMark({ kind: 'arrow', from: g.from, to, color: g.color });
              setSelected(null);
            } else if (g.right || drawingMode === 'square') {
              onToggleMark({
                kind: 'square',
                square: to,
                color: g.color,
              });
            } else activate(to, true);
          } else if (dragged && g.from !== to) move(g.from, to);
          else activate(to);
        }}
      >
        {Array.from({ length: 64 }, (_, index) => {
          const row = Math.floor(index / 8),
            col = index % 8,
            square = pointToSquare(col, row, orientation)!;
          const piece = chess.get(square);
          const light = (square.charCodeAt(0) - 97 + Number(square[1])) % 2 === 0;
          const isLast =
            lastMove && (lastMove.slice(0, 2) === square || lastMove.slice(2, 4) === square);
          const check = piece?.type === 'k' && piece.color === chess.turn() && chess.isCheck();
          return (
            <button
              key={square}
              role="gridcell"
              aria-label={`${square}${piece ? ' ' + (piece.color === 'w' ? 'white' : 'black') + ' ' + pieceNames[piece.type] : ' empty'}`}
              tabIndex={0}
              className={`square ${light ? 'light' : 'dark'} ${isLast ? 'last' : ''} ${selected === square ? 'selected' : ''} ${check ? 'in-check' : ''}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  activate(square);
                }
              }}
            >
              {col === 0 && <span className="rank-label">{square[1]}</span>}
              {row === 7 && <span className="file-label">{square[0]}</span>}
              {legal.some((m) => m.to === square) && (
                <span className={piece ? 'legal capture' : 'legal'} />
              )}
              {!hideHints && badge && lastMove?.slice(2, 4) === square && (
                <span
                  className="board-badge"
                  role="img"
                  aria-label={`${badge} move`}
                  title={badge}
                  style={{ color: labelInfo[badge].color }}
                >
                  <MoveQualityIcon label={badge} size={24} />
                </span>
              )}
            </button>
          );
        })}
        <div className="piece-layer" aria-hidden="true">
          {pieces.map((piece) => {
            const position = squareToPoint(piece.square, orientation);
            const dragging =
              pointer &&
              gesture.current &&
              !gesture.current.draw &&
              gesture.current.from === piece.square &&
              piece.color === chess.turn() &&
              !disabled;
            const point = dragging ? pointer : position;
            return (
              <div
                key={piece.id}
                data-piece={piece.square}
                className={`board-piece ${dragging ? 'dragging' : ''}`}
                style={
                  {
                    '--piece-duration': `${piece.durationMs}ms`,
                    transform: `translate(${(point.x - 0.5) * 100}%, ${(point.y - 0.5) * 100}%)`,
                  } as CSSProperties
                }
              >
                <img
                  src={assetUrl(`assets/pieces/${piece.color}${piece.type.toUpperCase()}.svg`)}
                  alt=""
                  draggable={false}
                />
              </div>
            );
          })}
        </div>
        <svg className="board-overlay" viewBox="0 0 8 8" aria-hidden="true">
          <defs>
            {Object.entries(hues).map(([key, color]) => (
              <marker
                key={key}
                id={`arrow-${key}`}
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="3"
                markerHeight="3"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
              </marker>
            ))}
          </defs>
          {allMarks.map((mark, i) => {
            if (mark.kind === 'square') {
              const p = squareToPoint(mark.square, orientation);
              return (
                <rect
                  key={i}
                  x={p.x - 0.5}
                  y={p.y - 0.5}
                  width="1"
                  height="1"
                  fill={hues[mark.color]}
                  opacity=".65"
                />
              );
            }
            const a = squareToPoint(mark.from, orientation),
              b = squareToPoint(mark.to, orientation);
            return (
              <path
                className="annotation-arrow"
                key={i}
                d={arrowPath(a, b)}
                fill="none"
                stroke={hues[mark.color]}
                strokeWidth=".14"
                opacity=".65"
                strokeLinecap="butt"
                strokeLinejoin="round"
                markerEnd={`url(#arrow-${mark.color})`}
              />
            );
          })}
          {gesture.current?.draw && pointer && preview && preview !== gesture.current.from && (
            <path
              className="drawing-preview"
              d={arrowPath(
                squareToPoint(gesture.current.from, orientation),
                pointer,
                squareToPoint(preview, orientation),
              )}
              fill="none"
              stroke={hues[gesture.current.color]}
              strokeWidth=".14"
              strokeLinecap="butt"
              strokeLinejoin="round"
              opacity=".65"
              markerEnd={`url(#arrow-${gesture.current.color})`}
            />
          )}
        </svg>
      </div>
      {promotion && (
        <div className="promotion-backdrop">
          <div className="promotion-dialog">
            <h3>Choose your promotion</h3>
            <div>
              {['q', 'r', 'b', 'n'].map((p) => (
                <button
                  key={p}
                  aria-label={`Promote to ${pieceNames[p]}`}
                  onClick={() => {
                    onMove(promotion.from + promotion.to + p);
                    setPromotion(null);
                  }}
                >
                  <img
                    src={assetUrl(`assets/pieces/${chess.turn()}${p.toUpperCase()}.svg`)}
                    alt={pieceNames[p]}
                  />
                </button>
              ))}
            </div>
            <button className="text-button" onClick={() => setPromotion(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
