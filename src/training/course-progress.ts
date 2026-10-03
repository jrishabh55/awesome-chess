import { courseLineKey, type OpeningCourse } from './courses';
import type { CurriculumSession } from './curriculum';
import { learningBatch } from './practice-batches';

export interface VariationProgress {
  best: number;
  attempts: number;
  status: 'new' | 'learning' | 'learned';
}
/** The score ledger survives course restarts and counts each variation once. */
export function courseProgress(course: OpeningCourse, session?: CurriculumSession) {
  const batch = session?.practice === 'batches' ? learningBatch(course, session.lesson) : null;
  const variations: VariationProgress[] = course.variations.map((_, index) => ({
    best: 0,
    attempts: 0,
    status:
      session?.lesson === index ||
      (batch?.variationIndices.includes(index) && index <= session!.lesson)
        ? 'learning'
        : 'new',
  }));
  let points = session?.history?.points || 0;
  if (session?.history)
    course.variations.forEach((entry, index) => {
      const recall = session.history!.recalls[courseLineKey(entry)];
      if (recall) variations[index] = { ...recall, status: 'learned' };
    });
  for (const [key, score] of Object.entries(session?.scores || {})) {
    const variation = variations[Number(key.split(':').at(-1))];
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
      !!session &&
      (variations.every((_, index) => !!session.scores[`${total - 1}:${index}`]) ||
        course.sections.every((section) =>
          section.variationIndices.every(
            (index) => !!session.scores[`section:${section.variationIndices.at(-1)}:${index}`],
          ),
        )),
    points,
    variations,
  };
}
export type CourseProgress = ReturnType<typeof courseProgress>;
