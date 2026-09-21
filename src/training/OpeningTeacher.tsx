import { useState } from 'react';
import { LegacyOpeningTeacher } from './LegacyOpeningTeacher';
import { CourseTeacher } from './CourseTeacher';
import { CourseWelcome } from './CourseWelcome';
import {
  createCurriculum,
  loadCurriculum,
  saveCurriculum,
  type CurriculumSession,
} from './curriculum';
import type { OpeningCourse } from './courses';
import type { OpeningPack } from './packs';
import { createSession, PROGRESS_KEY, serializeProgress } from './session';

const MODE_KEY = 'chess-room.opening-mode.v1';
type View =
  | { kind: 'welcome'; error?: string }
  | { kind: 'legacy'; pack?: OpeningPack }
  | { kind: 'course'; course: OpeningCourse; session: CurriculumSession; active: boolean };
function initialView(): View {
  try {
    if (localStorage.getItem(MODE_KEY) === 'course') {
      const saved = loadCurriculum();
      if (saved) return { kind: 'course', ...saved, active: false };
    }
    if (localStorage.getItem(PROGRESS_KEY)) return { kind: 'legacy' };
  } catch (error) {
    return {
      kind: 'welcome',
      error: error instanceof Error ? error.message : 'Saved courses could not be loaded.',
    };
  }
  return { kind: 'welcome' };
}
export function OpeningTeacher(_props: { onBack?: () => void } = {}) {
  const [view, setView] = useState<View>(initialView);
  const [revision, setRevision] = useState(0);
  function chooseCourse(course: OpeningCourse) {
    const saved = loadCurriculum(course.id);
    if (saved) course = saved.course;
    const session = saved?.session || createCurriculum(course);
    saveCurriculum(course, session, saved?.session || null);
    localStorage.setItem(MODE_KEY, 'course');
    setView({ kind: 'course', course, session, active: true });
    setRevision((value) => value + 1);
  }
  function choosePack(pack: OpeningPack) {
    localStorage.setItem(PROGRESS_KEY, serializeProgress(pack, createSession(pack)));
    localStorage.setItem(MODE_KEY, 'legacy');
    setView({ kind: 'legacy', pack });
    setRevision((value) => value + 1);
  }
  if (view.kind === 'welcome')
    return (
      <CourseWelcome onChooseCourse={chooseCourse} onChoosePack={choosePack} error={view.error} />
    );
  return view.kind === 'course' ? (
    <CourseTeacher
      key={revision}
      course={view.course}
      initialSession={view.session}
      initialActive={view.active}
      onChooseCourse={chooseCourse}
      onChoosePack={choosePack}
    />
  ) : (
    <LegacyOpeningTeacher key={revision} initialPack={view.pack} onChooseCourse={chooseCourse} />
  );
}
