// Bound JSON parsing while allowing courses that fit normal localStorage quotas.
// Actual browser capacity is checked before accepting an imported course.
export const MAX_PROGRESS_CHARS = 5_000_000;
// A 40-line course has at most 159 stages. Reserve room for its schedule,
// counters, and JSON wrapper so progress remains serializable as it advances.
export const SESSION_RESERVE_CHARS = 16_384;
export const OVERSIZED_COURSE_MESSAGE =
  'This repertoire is too large to save. Shorten long comments or import fewer variations.';
