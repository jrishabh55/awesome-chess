import type { OpeningCourse } from './courses';
import type { CurriculumSession } from './curriculum';

export interface VariationProgress {
  best: number;
  attempts: number;
  status: 'new' | 'learning' | 'learned';
}
/** The score ledger survives course restarts and counts each variation once. */
export function courseProgress(course: OpeningCourse, session?: CurriculumSession) {
  const variations: VariationProgress[] = course.variations.map((_, index) => ({
    best: 0,
    attempts: 0,
    status: session?.lesson === index ? 'learning' : 'new',
  }));
  let points = 0;
  for (const [key, score] of Object.entries(session?.scores || {})) {
    const variation = variations[Number(key.split(':')[1])];
    if (!variation) continue;
    variation.best = Math.max(variation.best, score.best);
    variation.attempts += score.attempts;
    variation.status = 'learned';
    points += score.best;
  }
  const total = variations.length;
  return {
    started: !!session,
    total,
    learned: variations.filter((variation) => variation.status === 'learned').length,
    clean: variations.filter((variation) => variation.best === 10).length,
    completed:
      !!session && variations.every((_, index) => !!session.scores[`${total - 1}:${index}`]),
    points,
    variations,
  };
}
export type CourseProgress = ReturnType<typeof courseProgress>;
