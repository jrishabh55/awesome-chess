import type { Strength } from './engine';

export type Opponent = { kind: 'stockfish'; strengthId: string } | { kind: 'maia'; rating: number };

type Preset = { id: string; label: string; detail: string; value: Strength };
export const strengths: Preset[] = [
  {
    id: 'skill-0',
    label: 'Beginner',
    detail: 'Stockfish skill 0',
    value: { kind: 'skill', value: 0 },
  },
  { id: 'skill-3', label: 'Easy', detail: 'Stockfish skill 3', value: { kind: 'skill', value: 3 } },
  {
    id: 'skill-6',
    label: 'Medium',
    detail: 'Stockfish skill 6',
    value: { kind: 'skill', value: 6 },
  },
  {
    id: 'skill-10',
    label: 'Hard',
    detail: 'Stockfish skill 10',
    value: { kind: 'skill', value: 10 },
  },
  {
    id: 'skill-15',
    label: 'Very hard',
    detail: 'Stockfish skill 15',
    value: { kind: 'skill', value: 15 },
  },
  { id: 'full', label: 'Full strength', detail: 'No skill limit', value: { kind: 'full' } },
];
const legacyStrengths: Preset[] = [1600, 2000, 2400].map((value) => ({
  id: `elo-${value}`,
  label: 'Current saved strength',
  detail: 'Preserves your previous engine setting',
  value: { kind: 'elo', value },
}));
export const strengthFor = (id: string): Preset =>
  [...strengths, ...legacyStrengths].find((preset) => preset.id === id) || strengths[0];

export function readOpponent(value: unknown): Opponent | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === 'maia')
    return typeof candidate.rating === 'number' &&
      Number.isInteger(candidate.rating) &&
      candidate.rating >= 600 &&
      candidate.rating <= 2600
      ? { kind: 'maia', rating: candidate.rating }
      : null;
  if (candidate.kind !== 'stockfish' || typeof candidate.strengthId !== 'string') return null;
  if (candidate.strengthId === 'elo-1320') return { kind: 'stockfish', strengthId: 'skill-0' };
  return [...strengths, ...legacyStrengths].some((preset) => preset.id === candidate.strengthId)
    ? { kind: 'stockfish', strengthId: candidate.strengthId }
    : null;
}

export function opponentFor(settings: { strengthId: string; opponent?: Opponent }): Opponent {
  const opponent =
    settings.opponent === undefined
      ? readOpponent({ kind: 'stockfish', strengthId: settings.strengthId })
      : readOpponent(settings.opponent);
  if (!opponent)
    throw Error(
      'Choose a supported opponent strength. Maia ratings must be whole numbers from 600 to 2600.',
    );
  return opponent;
}
export const opponentName = (opponent: Opponent) =>
  opponent.kind === 'maia' ? 'Maia 3' : 'Stockfish 19';
export const opponentLabel = (opponent: Opponent) =>
  opponent.kind === 'maia' ? `Practice ${opponent.rating}` : strengthFor(opponent.strengthId).label;
export const opponentKey = (opponent: Opponent) =>
  opponent.kind === 'maia' ? `maia:${opponent.rating}` : `stockfish:${opponent.strengthId}`;
