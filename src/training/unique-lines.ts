/** Keep complete branches; a shorter prefix is already taught by its extension. */
export function longestLines<T extends { root: string; moves: readonly string[] }>(
  lines: T[],
): T[] {
  return lines.filter(
    (line, index) =>
      !lines.some(
        (other, otherIndex) =>
          other.root === line.root &&
          (other.moves.length > line.moves.length ||
            (other.moves.length === line.moves.length && otherIndex < index)) &&
          line.moves.every((move, ply) => other.moves[ply] === move),
      ),
  );
}
