import { useEffect, useState } from 'react';
import { LegacyOpeningTeacher } from './LegacyOpeningTeacher';
import { CourseTeacher } from './CourseTeacher';
import { CourseWelcome } from './CourseWelcome';
import {
  createCurriculum,
  loadCurriculum,
  saveCurriculum,
  upgradeCurriculum,
  type CurriculumSession,
} from './curriculum';
import { openingCourses, type OpeningCourse } from './courses';
import { loadOpeningCatalog } from '../openings/catalog';
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
  useEffect(() => {
    if (view.kind !== 'course' || view.course.structure === 'responses-v1') return;
    let alive = true;
    loadOpeningCatalog()
      .then((entries) => {
        if (!alive) return;
        const current = openingCourses(entries).find((course) => course.id === view.course.id);
        if (!current) return;
        const saved = loadCurriculum(current.id);
        if (!saved || saved.course.structure === 'responses-v1') return;
        const upgraded = upgradeCurriculum(saved, current);
        saveCurriculum(current, upgraded.session, saved.session, saved.course);
        setView((previous) =>
          previous.kind === 'course' && previous.course.id === current.id
            ? { kind: 'course', ...upgraded, active: previous.active }
            : previous,
        );
        setRevision((value) => value + 1);
      })
      .catch(() => {
        /* Keep the saved course usable when its catalog is unavailable. */
      });
    return () => {
      alive = false;
    };
  }, [
    view.kind === 'course' ? view.course.id : '',
    view.kind === 'course' ? view.course.structure : undefined,
  ]);
  function chooseCourse(course: OpeningCourse) {
    const saved = loadCurriculum(course.id);
    const selected = saved
      ? upgradeCurriculum(saved, course)
      : { course, session: createCurriculum(course) };
    course = selected.course;
    const session = selected.session;
    saveCurriculum(course, session, saved?.session || null, saved?.course || course);
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
