import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
export interface BoardPiece {
  id: string;
  square: Square;
  color: Color;
  type: PieceSymbol;
}
let nextId = 0;
export function reconcilePieces(previous: BoardPiece[], fen: string): BoardPiece[] {
  const next = new Chess(fen)
    .board()
    .flat()
    .filter((p) => p !== null);
  const remaining = new Set(previous);
  const matched = new Map<Square, BoardPiece>();
  for (const p of next) {
    const old = previous.find(
      (q) => q.square === p.square && q.type === p.type && q.color === p.color,
    );
    if (old) {
      matched.set(p.square, old);
      remaining.delete(old);
    }
  }
  return next.map((p) => {
    let old = matched.get(p.square);
    if (!old) {
      const distance = (q: BoardPiece) =>
        Math.abs(q.square.charCodeAt(0) - p.square.charCodeAt(0)) +
        Math.abs(+q.square[1] - +p.square[1]);
      old = [...remaining]
        .filter((q) => q.color === p.color && q.type === p.type)
        .sort((a, b) => distance(a) - distance(b))[0];
      // Promotion (and reverse navigation through it) keeps the moving piece's identity.
      if (!old)
        old = [...remaining].find(
          (q) =>
            q.color === p.color &&
            q.square[0] === p.square[0] &&
            (q.type === 'p' || p.type === 'p') &&
            Math.abs(+q.square[1] - +p.square[1]) === 1,
        );
      if (old) remaining.delete(old);
    }
    return { ...p, id: old?.id || `piece-${++nextId}` };
  });
}
