import { Chess } from 'chess.js';
import type { OpeningCourse } from './courses';

export interface PracticeBatch {
  sectionIndex: number;
  variationIndices: number[];
}
// Snapshots are parsed afresh from storage. Cache the small derived schedule by
// content so resuming/saving does not replay a complete course on every move.
const schedules = new Map<string, PracticeBatch[]>();

export function practiceBatches(course: OpeningCourse): PracticeBatch[] {
  const key = JSON.stringify([
    course.variations.map((entry) => entry.pgn),
    course.sections.map((section) => section.variationIndices),
  ]);
  const cached = schedules.get(key);
  if (cached) return cached;
  const lines = course.variations.map((entry) => {
    const chess = new Chess();
    chess.loadPgn(entry.pgn);
    const history = chess.history({ verbose: true });
    return {
      root: history[0].before,
      moves: history.map((move) => move.from + move.to + (move.promotion || '')),
    };
  });
  const difference = (a: number, b: number) => {
    const first = lines[a],
      second = lines[b];
    let shared = 0;
    if (first.root === second.root)
      while (
        shared < Math.min(first.moves.length, second.moves.length) &&
        first.moves[shared] === second.moves[shared]
      )
        shared++;
    return Math.max(first.moves.length, second.moves.length) - shared;
  };
  const batches: PracticeBatch[] = [];
  course.sections.forEach((section, sectionIndex) => {
    let indices: number[] = [];
    let extraMoves = 0;
    for (const index of section.variationIndices) {
      const added = indices.length
        ? Math.min(...indices.map((other) => difference(index, other)))
        : 0;
      // Four extra half-moves allow five one-move branches, three two-move
      // branches, or smaller batches when the continuations diverge further.
      if (indices.length && (indices.length === 5 || extraMoves + added > 4)) {
        batches.push({ sectionIndex, variationIndices: indices });
        indices = [];
        extraMoves = 0;
      }
      if (indices.length) extraMoves += added;
      indices.push(index);
    }
    if (indices.length) batches.push({ sectionIndex, variationIndices: indices });
  });
  if (schedules.size >= 12) schedules.delete(schedules.keys().next().value!);
  schedules.set(key, batches);
  return batches;
}

export function learningBatch(course: OpeningCourse, lesson: number): PracticeBatch {
  const batch = practiceBatches(course).find((batch) => batch.variationIndices.includes(lesson));
  if (!batch) throw Error('This lesson has no practice batch.');
  return batch;
}
