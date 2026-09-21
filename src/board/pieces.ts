import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
export interface BoardPiece {
  id: string;
  square: Square;
  color: Color;
  type: PieceSymbol;
  durationMs: number;
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
  const reconciled = next.map((p) => {
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
    const distance = old
      ? Math.hypot(old.square.charCodeAt(0) - p.square.charCodeAt(0), +old.square[1] - +p.square[1])
      : 0;
    return {
      ...p,
      id: old?.id || `piece-${++nextId}`,
      // Long moves need visible travel time; cap it to keep navigation responsive.
      durationMs: Math.round(Math.min(420, 220 + Math.max(0, distance - 1) * 35)),
    };
  });
  // React reinserts keyed DOM nodes when array order changes, cancelling CSS transitions.
  // Keep surviving pieces in their original rendering order; append newly restored pieces.
  const order = new Map(previous.map((piece, index) => [piece.id, index]));
  return reconciled.sort(
    (a, b) => (order.get(a.id) ?? previous.length) - (order.get(b.id) ?? previous.length),
  );
}
