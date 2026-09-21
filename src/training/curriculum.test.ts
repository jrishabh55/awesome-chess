import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { OpeningCourse } from './courses';
import { databasePack } from './database';
import {
  createCurriculum,
  CurriculumConflictError,
  activeVariationIndex,
  guideStep,
  startRound,
  playDrillMove,
  recordHint,
  retryDrill,
  continueCurriculum,
  CURRICULUM_KEY,
  loadCurriculum,
  saveCurriculum,
  type CurriculumSession,
} from './curriculum';

const course: OpeningCourse = {
  id: 'course:test',
  name: 'Test course',
  side: 'w',
  sourceCount: 3,
  variations: [
    { id: 'a', eco: 'B20', name: 'Sicilian', pgn: '1. e4 c5' },
    { id: 'b', eco: 'C20', name: 'Open Game', pgn: '1. e4 e5' },
    { id: 'c', eco: 'D00', name: 'Queen Pawn', pgn: '1. d4 d5' },
  ],
  sections: [
    { id: 'base', name: 'Foundation', commonPgn: '1. e4 c5', variationIndices: [0] },
    { id: 'other', name: 'Other replies', commonPgn: '', variationIndices: [1, 2] },
  ],
};
const lineAt = (session: CurriculumSession, selected = course) =>
  databasePack(selected.variations[activeVariationIndex(session)], selected.side).lines[0];
const plans = (session: CurriculumSession): CurriculumSession => ({
  ...session,
  phase: 'plans',
  ply: lineAt(session).moves.length,
});
const finish = (session: CurriculumSession, selected = course) => {
  let next = session;
  const line = lineAt(next, selected);
  while (next.phase === 'drill')
    next = playDrillMove(selected, next, line, line.moves[next.ply].uci).session;
  return next;
};
let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

it('requires plans before drills and clamps guide navigation without revealing drill answers', () => {
  const session = createCurriculum(course);
  expect(startRound(course, session)).toEqual(session);
  expect(guideStep(session, 2, 20).ply).toBe(2);
  expect(guideStep(session, 2, -1).ply).toBe(0);
  const drill = startRound(course, plans(session), () => 0);
  expect(guideStep(drill, 2, 1)).toEqual(drill);
  expect(drill.phase).toBe('drill');
});
it('drills every learned line cumulatively across section boundaries and finishes the course', () => {
  let session = createCurriculum(course);
  for (let lesson = 0; lesson < 3; lesson++) {
    expect(session.lesson).toBe(lesson);
    session = startRound(course, plans(session), () => 0);
    expect([...session.round].sort()).toEqual(
      Array.from({ length: lesson + 1 }, (_, index) => index),
    );
    for (let index = 0; index <= lesson; index++) {
      session = finish(session);
      expect(session.phase).toBe('feedback');
      session = continueCurriculum(course, session);
    }
    expect(session.phase).toBe('round-complete');
    session = continueCurriculum(course, session);
  }
  expect(session.phase).toBe('complete');
  expect(Object.values(session.scores).reduce((sum, score) => sum + score.best, 0)).toBe(60);
});
it('flags mistakes, tracks hints, and upgrades retry best scores without farming points', () => {
  let session = startRound(course, plans(createCurriculum(course)), () => 0);
  const line = lineAt(session);
  const wrong = playDrillMove(course, session, line, 'd2d4');
  expect(wrong.correct).toBe(false);
  expect(wrong.session.ply).toBe(0);
  session = recordHint(wrong.session);
  expect(session.hints).toBe(1);
  session = finish(session);
  expect(session.scores['0:0']).toEqual({ best: 5, attempts: 1 });
  session = retryDrill(course, session, line);
  expect(session.mistakes).toBe(0);
  expect(session.roundIndex).toBe(0);
  session = finish(session);
  expect(session.scores['0:0']).toEqual({ best: 10, attempts: 2 });
  session = finish(retryDrill(course, session, line));
  expect(session.scores['0:0']).toEqual({ best: 10, attempts: 3 });
  expect(Object.values(session.scores)).toHaveLength(1);
});
it('plays the opening White move automatically for a Black course', () => {
  const black = { ...course, side: 'b' as const };
  const session = startRound(black, plans(createCurriculum(black)), () => 0);
  expect(session.ply).toBe(1);
  expect(playDrillMove(black, session, lineAt(session, black), 'c7c5').session.phase).toBe(
    'feedback',
  );
});
it('roundtrips raw courses larger than40lines, preserving queue order and previous teacher data', () => {
  const big = {
    ...course,
    sourceCount: 45,
    variations: Array.from({ length: 45 }, (_, index) => ({
      ...course.variations[index % 3],
      id: `line-${index}`,
    })),
    sections: [
      {
        id: 'all',
        name: 'All lines',
        commonPgn: '',
        variationIndices: Array.from({ length: 45 }, (_, index) => index),
      },
    ],
  };
  const session = createCurriculum(big);
  store.set('chess-room.opening-teacher.v1', 'old teacher');
  saveCurriculum(big, session);
  expect(loadCurriculum()).toEqual({ course: big, session });
  const raw = store.get(CURRICULUM_KEY)!;
  expect(raw).not.toContain('"before"');
  expect(raw).not.toContain('"after"');
  expect(store.get('chess-room.opening-teacher.v1')).toBe('old teacher');
});
it('rejects corrupt queues, impossible scores, and illegal current lines without silent reset', () => {
  const session = startRound(course, plans(createCurriculum(course)), () => 0);
  saveCurriculum(course, session);
  const original = store.get(CURRICULUM_KEY)!;
  for (const change of [
    (data: any) => {
      data.courses[course.id].session.round = [0, 0];
    },
    (data: any) => {
      data.courses[course.id].session.scores = { '0:0': { best: 999, attempts: 1 } };
    },
    (data: any) => {
      data.courses[course.id].course.variations[0].pgn = '1. e5';
    },
  ]) {
    const data = JSON.parse(original);
    change(data);
    store.set(CURRICULUM_KEY, JSON.stringify(data));
    expect(() => loadCurriculum()).toThrow(/saved course|invalid|damaged/i);
  }
});
it('preserves the previous course when a quota write fails', () => {
  saveCurriculum(course, createCurriculum(course));
  const original = store.get(CURRICULUM_KEY);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: () => {
      throw Error('quota');
    },
  });
  expect(() => saveCurriculum(course, guideStep(createCurriculum(course), 2, 1))).toThrow(
    /save|storage/i,
  );
  expect(store.get(CURRICULUM_KEY)).toBe(original);
});
it('preserves each course and selects the latest active one without losing previous scores', () => {
  const first = finish(startRound(course, plans(createCurriculum(course)), () => 0));
  saveCurriculum(course, first);
  const other = { ...course, id: 'course:second', name: 'Second course' };
  const second = createCurriculum(other);
  saveCurriculum(other, second);
  expect(loadCurriculum()).toEqual({ course: other, session: second });
  expect(loadCurriculum(course.id)).toEqual({ course, session: first });
  expect(loadCurriculum('missing')).toBeNull();
});
it('retains best-score ledgers on restart, including scores from later lessons', () => {
  const ledger = {
    '0:0': { best: 10, attempts: 1 },
    '1:0': { best: 10, attempts: 1 },
    '1:1': { best: 5, attempts: 2 },
  };
  const restarted = { ...createCurriculum(course), scores: ledger };
  saveCurriculum(course, restarted);
  expect(loadCurriculum()?.session.scores).toEqual(ledger);
  const completed = finish(startRound(course, plans(restarted), () => 0));
  expect(completed.scores['0:0']).toEqual({ best: 10, attempts: 2 });
  expect(completed.scores['1:1']).toEqual({ best: 5, attempts: 2 });
});
it('migrates the earlier single-course snapshot while preserving its progress', () => {
  const session = finish(startRound(course, plans(createCurriculum(course)), () => 0));
  store.set(CURRICULUM_KEY, JSON.stringify({ version: 1, course, session }));
  expect(loadCurriculum()).toEqual({ course, session });
  const other = { ...course, id: 'course:new', name: 'Another course' };
  saveCurriculum(other, createCurriculum(other));
  expect(loadCurriculum(course.id)).toEqual({ course, session });
  expect(JSON.parse(store.get(CURRICULUM_KEY)!).version).toBe(2);
});
it('refuses to overwrite a corrupt per-course library', () => {
  store.set(CURRICULUM_KEY, '{damaged');
  expect(() => saveCurriculum(course, createCurriculum(course))).toThrow(/saved course.*damaged/i);
  expect(store.get(CURRICULUM_KEY)).toBe('{damaged');
});
it('rejects stale same-course progress and score overwrites while preserving the latest snapshot', () => {
  const initial = createCurriculum(course);
  saveCurriculum(course, initial, null);
  const stale = loadCurriculum(course.id)!.session;
  const newer = finish(startRound(course, plans(initial), () => 0));
  saveCurriculum(course, newer, initial);
  const saved = store.get(CURRICULUM_KEY);
  expect(() => saveCurriculum(course, guideStep(initial, 2, 1), stale)).toThrow(
    CurriculumConflictError,
  );
  expect(store.get(CURRICULUM_KEY)).toBe(saved);
  expect(loadCurriculum(course.id)?.session.scores['0:0'].best).toBe(10);
  expect(() => saveCurriculum(course, initial, null)).toThrow(/reload.*course/i);
});
it('allows independent course saves and compares expected sessions canonically', () => {
  const first = createCurriculum(course);
  saveCurriculum(course, first, null);
  const other = { ...course, id: 'course:independent', name: 'Independent' };
  saveCurriculum(other, createCurriculum(other), null);
  const expected = Object.fromEntries(
    Object.entries(first).reverse(),
  ) as unknown as CurriculumSession;
  const advanced = guideStep(first, 2, 1);
  saveCurriculum(course, advanced, expected);
  expect(loadCurriculum(other.id)?.session).toEqual(createCurriculum(other));
  expect(loadCurriculum(course.id)?.session).toEqual(advanced);
});
it('rejects replacing variation identities underneath an existing score ledger', () => {
  const initial = createCurriculum(course);
  saveCurriculum(course, initial, null);
  const changed = {
    ...course,
    variations: [course.variations[1], course.variations[0], course.variations[2]],
  };
  expect(() => saveCurriculum(changed, initial, initial)).toThrow(CurriculumConflictError);
  expect(loadCurriculum(course.id)?.course).toEqual(course);
});
