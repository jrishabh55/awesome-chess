import { databasePack } from './database';
import type { OpeningCourse } from './courses';
import type { TeachingLine } from './packs';
import { MAX_PROGRESS_CHARS } from './limits';

export interface CurriculumSession {
  lesson: number;
  phase: 'guide' | 'plans' | 'drill' | 'feedback' | 'round-complete' | 'complete';
  ply: number;
  round: number[];
  roundIndex: number;
  mistakes: number;
  hints: number;
  scores: Record<string, { best: number; attempts: number }>;
}
export const CURRICULUM_KEY = 'chess-room.opening-curriculum.v1';
export class CurriculumConflictError extends Error {
  constructor() {
    super(
      'This course changed in another tab. Reload the saved course before continuing so its newer progress and scores are preserved.',
    );
    this.name = 'CurriculumConflictError';
  }
}
export function createCurriculum(course: OpeningCourse): CurriculumSession {
  if (!course.variations.length) throw Error('This course has no variations.');
  return {
    lesson: 0,
    phase: 'guide',
    ply: 0,
    round: [],
    roundIndex: 0,
    mistakes: 0,
    hints: 0,
    scores: {},
  };
}
export function activeVariationIndex(session: CurriculumSession): number {
  return session.phase === 'guide' || session.phase === 'plans'
    ? session.lesson
    : (session.round[session.roundIndex] ?? session.lesson);
}
const compile = (course: OpeningCourse, index: number) => {
  const pack = databasePack(course.variations[index], course.side);
  if (pack.lines.length !== 1) throw Error('A course variation must contain one legal move line.');
  return pack.lines[0];
};
function initialPly(course: OpeningCourse, line: TeachingLine, from = 0): number {
  let ply = from;
  while (ply < line.moves.length && line.moves[ply].before.split(' ')[1] !== course.side) ply++;
  return ply;
}
export function guideStep(
  session: CurriculumSession,
  lineLength: number,
  delta: number,
): CurriculumSession {
  if (session.phase !== 'guide') return session;
  return { ...session, ply: Math.max(0, Math.min(lineLength, session.ply + delta)) };
}
export function startRound(
  course: OpeningCourse,
  session: CurriculumSession,
  random = Math.random,
): CurriculumSession {
  if (session.phase !== 'plans') return session;
  const round = Array.from({ length: session.lesson + 1 }, (_, index) => index);
  for (let i = round.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [round[i], round[j]] = [round[j], round[i]];
  }
  return {
    ...session,
    phase: 'drill',
    round,
    roundIndex: 0,
    ply: initialPly(course, compile(course, round[0])),
    mistakes: 0,
    hints: 0,
  };
}
export function playDrillMove(
  course: OpeningCourse,
  session: CurriculumSession,
  line: TeachingLine,
  uci: string,
): { correct: boolean; session: CurriculumSession } {
  const expected = line.moves[session.ply];
  if (session.phase !== 'drill' || !expected) return { correct: false, session };
  if (expected.uci !== uci)
    return { correct: false, session: { ...session, mistakes: session.mistakes + 1 } };
  const ply = initialPly(course, line, session.ply + 1);
  if (ply < line.moves.length) return { correct: true, session: { ...session, ply } };
  const key = `${session.lesson}:${activeVariationIndex(session)}`;
  const previous = session.scores[key];
  return {
    correct: true,
    session: {
      ...session,
      ply,
      phase: 'feedback',
      scores: {
        ...session.scores,
        [key]: {
          best: Math.max(previous?.best || 0, session.mistakes ? 5 : 10),
          attempts: (previous?.attempts || 0) + 1,
        },
      },
    },
  };
}
export function recordHint(session: CurriculumSession): CurriculumSession {
  return session.phase === 'drill' ? { ...session, hints: session.hints + 1 } : session;
}
export function retryDrill(
  course: OpeningCourse,
  session: CurriculumSession,
  line: TeachingLine,
): CurriculumSession {
  if (session.phase !== 'feedback') return session;
  return { ...session, phase: 'drill', ply: initialPly(course, line), mistakes: 0, hints: 0 };
}
export function continueCurriculum(
  course: OpeningCourse,
  session: CurriculumSession,
): CurriculumSession {
  if (session.phase === 'feedback') {
    const roundIndex = session.roundIndex + 1;
    if (roundIndex >= session.round.length) return { ...session, phase: 'round-complete' };
    return {
      ...session,
      phase: 'drill',
      roundIndex,
      ply: initialPly(course, compile(course, session.round[roundIndex])),
      mistakes: 0,
      hints: 0,
    };
  }
  if (session.phase === 'round-complete') {
    if (session.lesson + 1 >= course.variations.length) return { ...session, phase: 'complete' };
    return {
      ...session,
      phase: 'guide',
      lesson: session.lesson + 1,
      ply: 0,
      round: [],
      roundIndex: 0,
      mistakes: 0,
      hints: 0,
    };
  }
  return session;
}

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const integer = (value: number) => Number.isSafeInteger(value) && value >= 0;
const text = (value: unknown, max: number) =>
  typeof value === 'string' && value.length > 0 && value.length <= max;
const damaged = () =>
  Error(
    'The saved course is damaged or unsupported. Existing data has been kept. Recover the saved course data before saving again.',
  );
function validate(course: OpeningCourse, session: CurriculumSession) {
  if (
    !record(course) ||
    !text(course.id, 1000) ||
    !text(course.name, 512) ||
    !['w', 'b'].includes(course.side) ||
    !Array.isArray(course.variations) ||
    !course.variations.length ||
    course.variations.length > 5000 ||
    !integer(course.sourceCount) ||
    course.sourceCount < course.variations.length ||
    course.sourceCount > 5000
  )
    throw damaged();
  const ids = new Set<string>();
  for (const entry of course.variations) {
    if (
      !record(entry) ||
      !text(entry.id, 5000) ||
      !text(entry.name, 512) ||
      !/^[A-E]\d{2}$/.test(entry.eco) ||
      !text(entry.pgn, 200_000) ||
      ids.has(entry.id)
    )
      throw damaged();
    ids.add(entry.id);
  }
  if (
    !Array.isArray(course.sections) ||
    !course.sections.length ||
    course.sections.length > course.variations.length
  )
    throw damaged();
  const sectionIds = new Set<string>();
  let covered = 0;
  for (const section of course.sections) {
    if (
      !record(section) ||
      !text(section.id, 2000) ||
      !text(section.name, 512) ||
      typeof section.commonPgn !== 'string' ||
      section.commonPgn.length > 10_000 ||
      sectionIds.has(section.id) ||
      !Array.isArray(section.variationIndices) ||
      !section.variationIndices.length
    )
      throw damaged();
    sectionIds.add(section.id);
    for (const index of section.variationIndices) if (index !== covered++) throw damaged();
  }
  if (
    covered !== course.variations.length ||
    !record(session) ||
    ![session.lesson, session.ply, session.roundIndex, session.mistakes, session.hints].every(
      integer,
    ) ||
    session.lesson >= course.variations.length ||
    !['guide', 'plans', 'drill', 'feedback', 'round-complete', 'complete'].includes(
      session.phase,
    ) ||
    !Array.isArray(session.round) ||
    !record(session.scores)
  )
    throw damaged();
  const touring = session.phase === 'guide' || session.phase === 'plans';
  if (
    touring
      ? session.round.length !== 0 || session.roundIndex !== 0
      : session.round.length !== session.lesson + 1 ||
        session.roundIndex >= session.round.length ||
        new Set(session.round).size !== session.round.length ||
        session.round.some((index) => !integer(index) || index > session.lesson)
  )
    throw damaged();
  if (
    (session.phase === 'round-complete' || session.phase === 'complete') &&
    session.roundIndex !== session.round.length - 1
  )
    throw damaged();
  if (session.phase === 'complete' && session.lesson !== course.variations.length - 1)
    throw damaged();
  const completedByRound = Array(course.variations.length).fill(0) as number[];
  for (const [key, score] of Object.entries(session.scores)) {
    const match = key.match(/^(0|[1-9]\d*):(0|[1-9]\d*)$/);
    if (
      !match ||
      !record(score) ||
      ![5, 10].includes(score.best) ||
      !integer(score.attempts) ||
      score.attempts < 1
    )
      throw damaged();
    const round = Number(match[1]);
    const variation = Number(match[2]);
    if (
      !integer(round) ||
      !integer(variation) ||
      round >= course.variations.length ||
      variation > round
    )
      throw damaged();
    completedByRound[round]++;
  }
  for (let index = 0; index < session.lesson; index++)
    if (completedByRound[index] !== index + 1) throw damaged();
  if (!touring) {
    for (const variation of session.round.slice(0, session.roundIndex))
      if (!session.scores[`${session.lesson}:${variation}`]) throw damaged();
    if (
      session.phase !== 'drill' &&
      !session.scores[`${session.lesson}:${activeVariationIndex(session)}`]
    )
      throw damaged();
  }
  const line = compile(course, activeVariationIndex(session));
  if (
    session.ply > line.moves.length ||
    (session.phase === 'plans' && session.ply !== line.moves.length) ||
    (session.phase === 'drill' &&
      (session.ply === line.moves.length ||
        line.moves[session.ply].before.split(' ')[1] !== course.side)) ||
    (['feedback', 'round-complete', 'complete'].includes(session.phase) &&
      session.ply !== line.moves.length)
  )
    throw damaged();
}
interface CurriculumSnapshot {
  course: OpeningCourse;
  session: CurriculumSession;
}
interface CurriculumLibrary {
  version: 2;
  activeCourseId: string;
  courses: Record<string, CurriculumSnapshot>;
}
function readLibrary(): CurriculumLibrary | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(CURRICULUM_KEY);
  } catch {
    throw Error('Browser storage is unavailable. Saved courses could not be loaded.');
  }
  if (raw === null) return null;
  try {
    if (raw.length > MAX_PROGRESS_CHARS) throw damaged();
    const data = JSON.parse(raw);
    if (!record(data)) throw damaged();
    if (data.version === 1) {
      const snapshot = {
        course: data.course as OpeningCourse,
        session: data.session as CurriculumSession,
      };
      validate(snapshot.course, snapshot.session);
      return {
        version: 2,
        activeCourseId: snapshot.course.id,
        courses: { [snapshot.course.id]: snapshot },
      };
    }
    if (
      data.version !== 2 ||
      typeof data.activeCourseId !== 'string' ||
      !record(data.courses) ||
      !Object.hasOwn(data.courses, data.activeCourseId) ||
      Object.keys(data.courses).length > 512
    )
      throw damaged();
    for (const [id, value] of Object.entries(data.courses)) {
      if (!record(value)) throw damaged();
      const snapshot = value as unknown as CurriculumSnapshot;
      if (snapshot.course?.id !== id) throw damaged();
      validate(snapshot.course, snapshot.session);
    }
    return data as unknown as CurriculumLibrary;
  } catch {
    throw damaged();
  }
}
export function loadCurriculum(courseId?: string): CurriculumSnapshot | null {
  const library = readLibrary();
  if (!library) return null;
  const selected = courseId ?? library.activeCourseId;
  return Object.hasOwn(library.courses, selected) ? library.courses[selected] : null;
}
function canonicalSession(session: CurriculumSession): string {
  return JSON.stringify({
    lesson: session.lesson,
    phase: session.phase,
    ply: session.ply,
    round: session.round,
    roundIndex: session.roundIndex,
    mistakes: session.mistakes,
    hints: session.hints,
    scores: Object.fromEntries(
      Object.entries(session.scores)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, score]) => [key, { best: score.best, attempts: score.attempts }]),
    ),
  });
}
function courseIdentity(course: OpeningCourse): string {
  return JSON.stringify({
    id: course.id,
    side: course.side,
    variations: course.variations.map((entry) => [entry.id, entry.pgn]),
  });
}
export function saveCurriculum(
  course: OpeningCourse,
  session: CurriculumSession,
  expectedPrevious?: CurriculumSession | null,
): void {
  validate(course, session);
  const previous = readLibrary();
  if (expectedPrevious !== undefined) {
    const stored =
      previous && Object.hasOwn(previous.courses, course.id) ? previous.courses[course.id] : null;
    if (
      expectedPrevious === null
        ? stored !== null
        : !stored ||
          canonicalSession(stored.session) !== canonicalSession(expectedPrevious) ||
          courseIdentity(stored.course) !== courseIdentity(course)
    )
      throw new CurriculumConflictError();
  }
  const courses = { ...previous?.courses, [course.id]: { course, session } };
  if (Object.keys(courses).length > 512)
    throw Error(
      'The saved course library is full. Remove older saved courses before starting another.',
    );
  const raw = JSON.stringify({ version: 2, activeCourseId: course.id, courses });
  if (raw.length > MAX_PROGRESS_CHARS)
    throw Error(
      'Saved course progress is too large to save on this device. Your previous saved courses are unchanged.',
    );
  try {
    localStorage.setItem(CURRICULUM_KEY, raw);
  } catch {
    throw Error(
      'The course could not be saved. Free browser storage and try again. Your previous saved courses are unchanged.',
    );
  }
}
