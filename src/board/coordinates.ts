import type { Color, Square } from '../chess/types';
export function squareToPoint(square: Square, orientation: Color): { x: number; y: number } {
  const x = square.charCodeAt(0) - 97,
    y = 8 - Number(square[1]);
  return orientation === 'w' ? { x: x + 0.5, y: y + 0.5 } : { x: 7.5 - x, y: 7.5 - y };
}
export function pointToSquare(x: number, y: number, orientation: Color): Square | null {
  if (x < 0 || y < 0 || x >= 8 || y >= 8) return null;
  const file = orientation === 'w' ? Math.floor(x) : 7 - Math.floor(x),
    rank = orientation === 'w' ? 8 - Math.floor(y) : Math.floor(y) + 1;
  return `${String.fromCharCode(97 + file)}${rank}` as Square;
}
