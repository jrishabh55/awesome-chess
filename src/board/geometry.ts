export interface Point {
  x: number;
  y: number;
}
/** Knight arrows travel along the longer leg first, then turn toward the target. */
export function arrowShape(from: Point, to: Point, knightTarget?: Point) {
  const target = knightTarget || to;
  const dx = Math.abs(target.x - from.x),
    dy = Math.abs(target.y - from.y);
  const knight = (dx === 1 && dy === 2) || (dx === 2 && dy === 1);
  const bend = knight ? { x: dx > dy ? to.x : from.x, y: dx > dy ? from.y : to.y } : to;
  const length = Math.hypot(bend.x - from.x, bend.y - from.y);
  const inset = Math.min(0.38, length / 2);
  const coordinate = (value: number) => Number(value.toFixed(4));
  const start = `M ${coordinate(from.x + (length ? ((bend.x - from.x) * inset) / length : 0))} ${coordinate(from.y + (length ? ((bend.y - from.y) * inset) / length : 0))}`;
  const path = knight
    ? `${start} L ${bend.x} ${bend.y} L ${to.x} ${to.y}`
    : `${start} L ${to.x} ${to.y}`;
  const pathLength = length - inset + (knight ? Math.hypot(to.x - bend.x, to.y - bend.y) : 0);
  // End the shaft inside the arrowhead so its square cap cannot blunt the tip.
  return { path, strokeDasharray: `${Math.max(0, pathLength - 0.3)} 0.3` };
}
export function arrowPath(from: Point, to: Point, knightTarget?: Point): string {
  return arrowShape(from, to, knightTarget).path;
}
