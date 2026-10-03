import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { OpeningCourse } from './courses';
import { databasePack } from './database';
import {
  activeVariationIndex,
  createCurriculum,
  startRound,
  continueCurriculum,
  playDrillMove,
  playCurriculumReply,
  retryDrill,
  saveCurriculum,
  loadCurriculum,
  CURRICULUM_KEY,
  type CurriculumSession,
} from './curriculum';
import { courseProgress } from './course-progress';

const shared = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5';
const course: OpeningCourse = {
  id: 'course:groups',
  name: 'Grouped practice',
  side: 'w',
  sourceCount: 9,
  variations: [
    ...['d3', 'c3', 'O-O', 'Nc3', 'b4', 'a3', 'h3'].map((move, index) => ({
      id: `italian-${index}`,
      name: `Italian branch ${index}`,
      eco: 'C50',
      pgn: `${shared} 4. ${move}`,
    })),
    {
      id: 'queen-a',
      name: 'Queen branch A',
      eco: 'D00',
      pgn: '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5',
    },
    {
      id: 'queen-b',
      name: 'Queen branch B',
      eco: 'D00',
      pgn: '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Nf3',
    },
  ],
  sections: [
    {
      id: 'italian',
      name: 'Italian lines',
      commonPgn: shared,
      variationIndices: [0, 1, 2, 3, 4, 5, 6],
    },
    { id: 'queen', name: 'Queen lines', commonPgn: '', variationIndices: [7, 8] },
  ],
};
const lineAt = (session: CurriculumSession, selected = course) =>
  databasePack(selected.variations[activeVariationIndex(session)], selected.side).lines[0];
const finishLesson = (session: CurriculumSession, selected = course) =>
  startRound(
    selected,
    { ...session, phase: 'plans', ply: lineAt(session, selected).moves.length },
    () => 0,
  );
const finishDrill = (session: CurriculumSession, selected = course) => {
  const line = lineAt(session, selected);
  let next = session;
  while (next.phase === 'drill') {
    const move = line.moves[next.ply];
    next =
      move.before.split(' ')[1] === selected.side
        ? playDrillMove(selected, next, line, move.uci).session
        : playCurriculumReply(selected, next, line);
  }
  return next;
};
let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

it('learns five closely related variations before drilling the immediate batch', () => {
  let session = createCurriculum(course);
  for (let lesson = 0; lesson < 4; lesson++) {
    session = finishLesson(session);
    expect(session.phase).toBe('guide');
    expect(session.lesson).toBe(lesson + 1);
    expect(session.round).toEqual([]);
  }
  session = finishLesson(session);
  expect(session.phase).toBe('drill');
  expect([...session.round].sort()).toEqual([0, 1, 2, 3, 4]);
});

it('uses smaller batches as divergent continuations introduce more moves', () => {
  const wider: OpeningCourse = {
    ...course,
    sourceCount: 3,
    variations: ['4. d3 Nf6 5. O-O', '4. c3 Nf6 5. d3', '4. O-O Nf6 5. d3'].map((tail, index) => ({
      id: `wide-${index}`,
      name: `Wide ${index}`,
      eco: 'C50',
      pgn: `${shared} ${tail}`,
    })),
    sections: [{ ...course.sections[0], variationIndices: [0, 1, 2] }],
  };
  let session = finishLesson(createCurriculum(wider), wider);
  expect(session.phase).toBe('guide');
  session = finishLesson(session, wider);
  expect(session.phase).toBe('drill');
  expect([...session.round].sort()).toEqual([0, 1]);
});

it('does not include earlier batches or other sections in the immediate drill', () => {
  const session = finishLesson({ ...createCurriculum(course), lesson: 6 });
  expect([...session.round].sort()).toEqual([5, 6]);
});

it('re-shuffles the entire section after its final batch, even when it has more than five lines', () => {
  const session = {
    ...createCurriculum(course),
    practice: 'batches' as const,
    drill: 'batch' as const,
    lesson: 6,
    phase: 'round-complete' as const,
    round: [5, 6],
    roundIndex: 1,
    ply: 7,
    scores: {},
  };
  const next = continueCurriculum(course, session, () => 0);
  expect(next.phase).toBe('drill');
  expect(next.lesson).toBe(6);
  expect([...next.round].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect((next as typeof session).drill).toBe('section');
  expect(next.round).not.toEqual([0, 1, 2, 3, 4, 5, 6]);
});

it('completes batch and section drills, resumes every transition, and counts each variation once', () => {
  let session = createCurriculum(course);
  const rounds: number[][] = [];
  for (let guard = 0; session.phase !== 'complete' && guard < 100; guard++) {
    if (session.phase === 'guide') session = finishLesson(session);
    else if (session.phase === 'drill') {
      if (session.roundIndex === 0) rounds.push([...session.round].sort((a, b) => a - b));
      session = finishDrill(session);
    } else session = continueCurriculum(course, session, () => 0);
    saveCurriculum(course, session);
    expect(loadCurriculum()?.session).toEqual(session);
  }
  expect(session.phase).toBe('complete');
  expect(rounds).toEqual([
    [0, 1, 2, 3, 4],
    [5, 6],
    [0, 1, 2, 3, 4, 5, 6],
    [7, 8],
    [7, 8],
  ]);
  expect(courseProgress(course, session)).toMatchObject({
    learned: 9,
    completed: true,
    points: 180,
  });
  const replay = retryDrill(course, { ...session, phase: 'feedback' }, lineAt(session));
  const retried = finishDrill(replay);
  expect(courseProgress(course, retried).points).toBe(180);
});

it('rejects a truncated section queue, missing batch awards, and unsupported drill kinds', () => {
  let session = createCurriculum(course);
  for (
    let guard = 0;
    guard < 80 && !(session.drill === 'section' && session.phase === 'drill');
    guard++
  ) {
    if (session.phase === 'guide') session = finishLesson(session);
    else if (session.phase === 'drill') session = finishDrill(session);
    else session = continueCurriculum(course, session, () => 0);
  }
  saveCurriculum(course, session);
  const original = store.get(CURRICULUM_KEY)!;
  for (const mutate of [
    (saved: any) => {
      saved.session.round = [5, 6];
    },
    (saved: any) => {
      delete saved.session.scores['batch:4:0'];
    },
    (saved: any) => {
      saved.session.drill = 'everything';
    },
    (saved: any) => {
      saved.session.lesson = 7;
      saved.session.phase = 'guide';
      saved.session.round = [];
      saved.session.roundIndex = 0;
      saved.session.ply = 0;
      saved.session.drill = 'batch';
    },
  ]) {
    const data = JSON.parse(original);
    mutate(data.courses[course.id]);
    store.set(CURRICULUM_KEY, JSON.stringify(data));
    expect(() => loadCurriculum()).toThrow(/damaged|unsupported/i);
    expect(store.get(CURRICULUM_KEY)).toBe(JSON.stringify(data));
  }
});
