export interface Point {
  x: number;
  y: number;
}
/** Knight arrows travel along the longer leg first, then turn toward the target. */
export function arrowPath(from: Point, to: Point, knightTarget?: Point): string {
  const target = knightTarget || to;
  const dx = Math.abs(target.x - from.x),
    dy = Math.abs(target.y - from.y);
  const start = `M ${from.x} ${from.y}`;
  if ((dx === 1 && dy === 2) || (dx === 2 && dy === 1))
    return `${start} L ${dx > dy ? to.x : from.x} ${dx > dy ? from.y : to.y} L ${to.x} ${to.y}`;
  return `${start} L ${to.x} ${to.y}`;
}
