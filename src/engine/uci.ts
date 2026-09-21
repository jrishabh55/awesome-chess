import type { Color } from '../chess/types';
import type { EngineLine, Score } from './types';
export function parseInfo(text: string, turn: Color): EngineLine | null {
  const depth = text.match(/\bdepth (\d+)/),
    score = text.match(/\bscore (cp|mate) (-?\d+)/),
    pv = text.match(/\bpv (.+)$/);
  if (!text.startsWith('info ') || !depth || !score || !pv) return null;
  const n = Number(score[2]);
  const value: Score =
    score[1] === 'cp'
      ? { kind: 'cp', value: n * (turn === 'w' ? 1 : -1) }
      : { kind: 'mate', moves: Math.abs(n), winner: n > 0 ? turn : turn === 'w' ? 'b' : 'w' };
  return {
    rank: Number(text.match(/\bmultipv (\d+)/)?.[1] || 1),
    depth: Number(depth[1]),
    score: value,
    pv: pv[1].trim().split(/\s+/),
    bound: text.includes('lowerbound') ? 'lower' : text.includes('upperbound') ? 'upper' : 'exact',
  };
}
export function scoreText(score: Score | undefined): string {
  if (!score) return '—';
  return score.kind === 'mate'
    ? `${score.winner === 'w' ? '+' : '−'}M${score.moves}`
    : `${score.value >= 0 ? '+' : '−'}${(Math.abs(score.value) / 100).toFixed(2)}`;
}
