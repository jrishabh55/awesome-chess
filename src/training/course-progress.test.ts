import { expect, it } from 'vitest';
import { openingCourses } from './courses';
import { createCurriculum } from './curriculum';
import { courseProgress } from './course-progress';

const course = openingCourses([
  { id: 'a', eco: 'B20', name: 'Sicilian Defense', pgn: '1. e4 c5' },
  { id: 'b', eco: 'B50', name: 'Sicilian Defense: Open', pgn: '1. e4 c5 2. Nf3 d6 3. d4' },
  { id: 'c', eco: 'B23', name: 'Sicilian Defense: Closed', pgn: '1. e4 c5 2. Nc3 Nc6 3. g3' },
])[0];

it('counts completed recall variations, not guide visits or repeated cumulative drills', () => {
  const session = createCurriculum(course);
  expect(courseProgress(course).started).toBe(false);
  expect(courseProgress(course, { ...session, ply: 1 })).toMatchObject({
    started: true,
    learned: 0,
    completed: false,
  });
  const progress = courseProgress(course, {
    ...session,
    lesson: 2,
    scores: {
      '0:0': { best: 5, attempts: 1 },
      '1:0': { best: 10, attempts: 2 },
      '1:1': { best: 5, attempts: 1 },
    },
  });
  expect(progress).toMatchObject({ learned: 2, clean: 1, total: 3, points: 20, completed: false });
  expect(progress.variations).toEqual([
    { best: 10, attempts: 3, status: 'learned' },
    { best: 5, attempts: 1, status: 'learned' },
    { best: 0, attempts: 0, status: 'learning' },
  ]);
});

it('keeps completed course and variation history when restarting lessons', () => {
  const session = createCurriculum(course);
  session.scores = {
    '0:0': { best: 10, attempts: 1 },
    '1:0': { best: 10, attempts: 1 },
    '1:1': { best: 10, attempts: 1 },
    '2:0': { best: 5, attempts: 1 },
    '2:1': { best: 10, attempts: 1 },
    '2:2': { best: 5, attempts: 1 },
  };
  expect(courseProgress(course, session)).toMatchObject({
    completed: true,
    learned: 3,
    clean: 2,
    points: 50,
  });
  delete session.scores['2:0'];
  expect(courseProgress(course, session)).toMatchObject({ completed: false, learned: 3 });
});
