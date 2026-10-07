import { Chess } from 'chess.js';
import vocabulary from './moves.json';

const moveIndices = new Map(vocabulary.map((move, index) => [move, index]));
const mirrorSquare = (square: string) => square[0] + (9 - Number(square[1]));
const mirrorMove = (move: string) =>
  mirrorSquare(move.slice(0, 2)) + mirrorSquare(move.slice(2, 4)) + move.slice(4);

/** Maia's square order starts at a1; Black is represented as the moving White side. */
export function encodePosition(fen: string): Float32Array {
  const chess = new Chess(fen);
  const black = chess.turn() === 'b';
  const tokens = new Float32Array(64 * 12);
  for (const [row, rank] of chess.board().entries()) {
    for (const [file, piece] of rank.entries()) {
      if (!piece) continue;
      const square = (black ? row : 7 - row) * 8 + file;
      const channel = 'pnbrqk'.indexOf(piece.type) + (piece.color === (black ? 'b' : 'w') ? 0 : 6);
      tokens[square * 12 + channel] = 1;
    }
  }
  return tokens;
}

export function legalPolicy(
  fen: string,
  logits: Float32Array,
): { move: string; probability: number }[] {
  if (logits.length !== 4352)
    throw Error('Maia returned an invalid move policy. Retry the engine.');
  const chess = new Chess(fen);
  const black = chess.turn() === 'b';
  const candidates = chess.moves({ verbose: true }).map((move) => {
    const uci = move.from + move.to + (move.promotion || '');
    const index = moveIndices.get(black ? mirrorMove(uci) : uci);
    if (index === undefined || !Number.isFinite(logits[index]))
      throw Error('Maia returned an invalid move policy. Retry the engine.');
    return { move: uci, logit: logits[index] };
  });
  if (!candidates.length) throw Error('This position has no legal move.');
  const max = Math.max(...candidates.map((move) => move.logit));
  const weights = candidates.map((move) => Math.exp(move.logit - max));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return candidates.map((move, index) => ({
    move: move.move,
    probability: weights[index] / total,
  }));
}

export function sampleMove(fen: string, logits: Float32Array, random = Math.random): string {
  const policy = legalPolicy(fen, logits);
  const draw = random();
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw Error('Invalid random sample.');
  let cumulative = 0;
  for (const candidate of policy) {
    cumulative += candidate.probability;
    if (draw < cumulative) return candidate.move;
  }
  return policy[policy.length - 1].move;
}
