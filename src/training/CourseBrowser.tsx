import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, Layers3, Trophy } from 'lucide-react';
import type { CatalogOpening } from '../openings/catalog';
import { openingCourses, searchCourses, type OpeningCourse } from './courses';
import { PickerCombobox } from './OpeningCombobox';
import { builtInPacks, type OpeningPack } from './packs';
import type { CurriculumSnapshot } from './curriculum';
import { courseProgress } from './course-progress';
import { CourseProgressBadge, CourseSyllabus } from './CourseSyllabus';
import './course.css';

export function CourseBrowser({
  entries,
  onChoose,
  onChoosePack,
  savedCourses,
  view = 'all',
}: {
  entries: CatalogOpening[];
  onChoose: (course: OpeningCourse) => void;
  onChoosePack: (pack: OpeningPack) => void;
  savedCourses: CurriculumSnapshot[];
  view?: 'all' | 'learned';
}) {
  const savedById = useMemo(
    () => new Map(savedCourses.map((item) => [item.course.id, item])),
    [savedCourses],
  );
  const courses = useMemo(
    () =>
      view === 'learned'
        ? savedCourses.map((item) => item.course).sort((a, b) => a.name.localeCompare(b.name))
        : openingCourses(entries).map((course) => savedById.get(course.id)?.course || course),
    [entries, savedById, savedCourses, view],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const selected = courses.find((course) => course.id === selectedId) || null;
  const saved = selected ? savedById.get(selected.id) : undefined;
  const progressOf = (course: OpeningCourse) =>
    courseProgress(course, savedById.get(course.id)?.session);
  const selectedProgress = selected ? progressOf(selected) : null;
  const featured = [
    'London System',
    'Sicilian Defense',
    'Italian Game',
    'Caro-Kann Defense',
    'French Defense',
    "Queen's Gambit Declined",
  ];
  const choose = (course: OpeningCourse | null) => {
    setSelectedId(course?.id || null);
    setError('');
  };
  const start = () => {
    if (!selected) return;
    try {
      onChoose(selected);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The course could not be started.');
    }
  };
  const learnedCount = savedCourses.reduce(
    (total, item) => total + courseProgress(item.course, item.session).learned,
    0,
  );
  const completedCount = savedCourses.filter(
    (item) => courseProgress(item.course, item.session).completed,
  ).length;
  return (
    <div className="course-browser">
      {(view === 'all' || courses.length > 0) && (
        <PickerCombobox
          value={selected}
          onChange={choose}
          label={view === 'learned' ? 'Search learned courses' : 'Opening course'}
          placeholder={
            view === 'learned' ? 'Find a course you have started…' : 'London, Sicilian, Caro-Kann…'
          }
          itemName="course"
          searchItems={(query) => searchCourses(courses, query)}
          getLabel={(course) => course.name}
          getSearchText={(course) => course.name}
          renderOption={(course) => (
            <>
              <BookOpen size={17} className="oc-course-icon" />
              <span className="oc-course-copy">
                <span className="oc-name">{course.name}</span>
                <small>
                  {course.sections.length} sections · {course.variations.length} variations ·{' '}
                  {course.side === 'w' ? 'White' : 'Black'}
                </small>
              </span>
              <CourseProgressBadge progress={progressOf(course)} />
            </>
          )}
        />
      )}
      {error && (
        <p className="ol-error" role="alert">
          {error}
        </p>
      )}
      {selected && selectedProgress ? (
        <section className="course-overview" aria-label="Course overview">
          {view === 'learned' && (
            <button className="ol-back" onClick={() => choose(null)}>
              <ArrowLeft size={14} /> All learned courses
            </button>
          )}
          <div className="course-overview-heading">
            <div>
              <span className="ot-eyebrow">Complete opening course</span>
              <h3>{selected.name}</h3>
            </div>
            <span className="course-side">Play {selected.side === 'w' ? 'White' : 'Black'}</span>
          </div>
          <div className="course-facts">
            <span>
              <Layers3 size={14} />
              {selected.sections.length} sections
            </span>
            <span>{selected.variations.length} variations</span>
            <CourseProgressBadge progress={selectedProgress} />
          </div>
          {selectedProgress.started && (
            <div className="course-progress-summary">
              <progress
                aria-label="Variations learned"
                max={selectedProgress.total}
                value={selectedProgress.learned}
              />
              <span>
                {selectedProgress.learned} of {selectedProgress.total} learned ·{' '}
                {selectedProgress.clean} clean {selectedProgress.clean === 1 ? 'recall' : 'recalls'}
              </span>
              <strong>
                <Trophy size={13} />
                {selectedProgress.points} pts
              </strong>
            </div>
          )}
          <button className="ot-primary course-start" onClick={start}>
            {saved ? 'Resume' : 'Start'} {selected.name}
            <ArrowRight size={16} />
          </button>
          <CourseSyllabus key={selected.id} course={selected} progress={selectedProgress} />
          <p className="course-scoring">
            <Check size={14} />
            10 points clean · 5 after a mistake · retry to improve.
          </p>
        </section>
      ) : view === 'learned' ? (
        <>
          <div className="course-history-heading">
            <h3>Your learning</h3>
            <span>
              {completedCount} complete · {learnedCount}{' '}
              {learnedCount === 1 ? 'variation' : 'variations'} learned
            </span>
          </div>
          {courses.length ? (
            <div className="learned-course-list">
              {courses.map((course) => {
                const progress = progressOf(course);
                return (
                  <button
                    key={course.id}
                    className={`learned-course-card${progress.completed ? ' is-complete' : ''}`}
                    aria-label={`View ${course.name} progress`}
                    onClick={() => choose(course)}
                  >
                    <span className="learned-course-icon">
                      {progress.completed ? <Check size={19} /> : <BookOpen size={19} />}
                    </span>
                    <span className="learned-course-copy">
                      <strong>{course.name}</strong>
                      <small>
                        {progress.completed ? 'Course completed' : 'In progress'} ·{' '}
                        {progress.points} pts
                      </small>
                      <progress
                        aria-label={`${course.name} variations learned`}
                        max={progress.total}
                        value={progress.learned}
                      />
                    </span>
                    <span className="learned-course-meta">
                      <CourseProgressBadge progress={progress} />
                      <ArrowRight size={14} />
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="ol-empty">
              <BookOpen size={27} />
              <p>Your learning history starts here.</p>
              <small>
                Start a course in Courses. Completed recall drills mark variations as learned; your
                history stays here when you practice again.
              </small>
            </div>
          )}
          {courses.length > 0 && (
            <p className="ot-muted">
              A completed recall drill marks a variation as learned. Restarting a course keeps your
              history.
            </p>
          )}
        </>
      ) : (
        <>
          <div className="course-intro">
            <h3>Choose your next opening</h3>
            <p>Guided moves, middlegame plans, then shuffled recall.</p>
          </div>
          <div className="course-featured">
            {featured
              .map((name) => courses.find((course) => course.name === name))
              .filter((course): course is OpeningCourse => !!course)
              .map((course) => (
                <button key={course.id} onClick={() => choose(course)}>
                  <BookOpen size={17} />
                  <span>
                    <strong>{course.name}</strong>
                    <small>
                      {course.sections.length} sections · {course.variations.length} variations
                    </small>
                    <CourseProgressBadge progress={progressOf(course)} />
                  </span>
                  <ArrowRight size={15} />
                </button>
              ))}
          </div>
          <details className="course-short-lessons">
            <summary>Short guided lessons</summary>
            <div className="ol-course-list">
              {builtInPacks.map((pack) => (
                <section key={pack.id}>
                  <h3>{pack.name}</h3>
                  <p>{pack.description}</p>
                  <button className="ot-primary" onClick={() => onChoosePack(pack)}>
                    Start {pack.name}
                  </button>
                </section>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
