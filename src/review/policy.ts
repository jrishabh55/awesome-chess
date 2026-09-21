import type { Color, Mark, PositionInput } from '../chess/types';
import type { Score } from '../engine/types';
export type Label =
  | 'Brilliant'
  | 'Great'
  | 'Best'
  | 'Excellent'
  | 'Good'
  | 'Book'
  | 'Inaccuracy'
  | 'Mistake'
  | 'Blunder'
  | 'Miss';
export const labels: Label[] = [
  'Brilliant',
  'Great',
  'Best',
  'Excellent',
  'Good',
  'Book',
  'Inaccuracy',
  'Mistake',
  'Blunder',
  'Miss',
];
export const labelInfo: Record<Label, { symbol: string; color: string }> = {
  Brilliant: { symbol: '!!', color: '#1bada6' },
  Great: { symbol: '!', color: '#1bada6' },
  Best: { symbol: '★', color: '#96bc4b' },
  Excellent: { symbol: '✓', color: '#96bc4b' },
  Good: { symbol: '•', color: '#96af8b' },
  Book: { symbol: '▤', color: '#b9a387' },
  Inaccuracy: { symbol: '?!', color: '#f7c045' },
  Mistake: { symbol: '?', color: '#e58f2a' },
  Blunder: { symbol: '??', color: '#f4776f' },
  Miss: { symbol: '↗', color: '#dbac16' },
};
export interface Evidence {
  kind: 'fork' | 'pin' | 'material' | 'mate' | 'sacrifice' | 'unique' | 'miss';
  root: PositionInput;
  line: string[];
  frames: { ply: number; marks: Mark[] }[];
  verifiedDepth: number;
  facts: Record<string, string | number | boolean>;
}
export interface MoveAssessment {
  nodeId: string;
  primary: Label;
  base: Label;
  book: boolean;
  mover: Color;
  loss: number;
  moveAccuracy: number;
  bestUci: string;
  evidence: Evidence[];
  depth: number;
  policyVersion: 1;
  reviewProfile?: string;
  meaningful: boolean;
  criticalGap: number;
  before: Score;
  after: Score;
  bestLine: string[];
  playedLine: string[];
  forced: boolean;
}
export const isError = (label: Label) =>
  ['Inaccuracy', 'Mistake', 'Blunder', 'Miss'].includes(label);
export function baseLabel(loss: number, isBest: boolean): Label {
  return isBest
    ? 'Best'
    : loss <= 0.01
      ? 'Excellent'
      : loss <= 0.03
        ? 'Good'
        : loss <= 0.08
          ? 'Inaccuracy'
          : loss <= 0.18
            ? 'Mistake'
            : 'Blunder';
}
export function expected(cp: number): number {
  return 1 / (1 + Math.exp(-cp / 250));
}
export function scoreExpected(score: Score, mover: Color): number {
  return score.kind === 'mate'
    ? score.winner === mover
      ? 1
      : 0
    : expected(score.value * (mover === 'w' ? 1 : -1));
}
export function primaryLabel(
  base: Label,
  book: boolean,
  flags: { brilliant: boolean; great: boolean; miss: boolean },
): Label {
  if (isError(base)) return flags.miss ? 'Miss' : base;
  return flags.brilliant ? 'Brilliant' : flags.great ? 'Great' : book ? 'Book' : base;
}
export function performance(moves: { accuracy: number; gap: number }[]): number | null {
  if (moves.length < 6) return null;
  const a = moves.reduce((v, m) => v + m.accuracy, 0) / moves.length;
  const c =
    moves.reduce((v, m) => v + (m.accuracy >= 86 ? Math.min(0.25, m.gap) / 0.25 : 0), 0) /
    moves.length;
  return Math.round(Math.min(3200, Math.max(400, 400 + 2600 * (a / 100) ** 4 + 100 * c)) / 50) * 50;
}
