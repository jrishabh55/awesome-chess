import { useId, useState } from 'react';
import { Check, ChevronDown, BookOpen } from 'lucide-react';
import { courseVariationLabel, type OpeningCourse } from './courses';
import type { CourseProgress } from './course-progress';

export function CourseProgressBadge({ progress }: { progress: CourseProgress }) {
  if (!progress.started) return null;
  return (
    <span className={`course-progress-badge${progress.completed ? ' is-complete' : ''}`}>
      {progress.completed && <Check size={12} aria-hidden="true" />}
      {progress.completed ? 'Completed' : `${progress.learned}/${progress.total} learned`}
    </span>
  );
}

export function CourseSyllabus({
  course,
  progress,
  heading = true,
}: {
  course: OpeningCourse;
  progress: CourseProgress;
  heading?: boolean;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="course-syllabus">
      {heading && <h4>Course sections</h4>}
      <p className="ot-muted">Expand a section to see its variations and your progress.</p>
      <ol>
        {course.sections.map((section, index) => {
          const count = section.variationIndices.filter(
            (value) => progress.variations[value].status === 'learned',
          ).length;
          const complete = count === section.variationIndices.length;
          const open = expanded === section.id;
          return (
            <li key={section.id} className={`course-section${complete ? ' is-learned' : ''}`}>
              <button
                className="course-section-toggle"
                aria-expanded={open}
                aria-controls={`${id}-${index}`}
                onClick={() => setExpanded(open ? null : section.id)}
              >
                <span className="course-section-number">
                  {complete ? <Check size={14} /> : index + 1}
                </span>
                <span className="course-section-copy">
                  <strong>{section.name}</strong>
                  {section.commonPgn && <span className="course-prefix">{section.commonPgn}</span>}
                </span>
                <small>
                  {count}/{section.variationIndices.length} learned
                </small>
                <ChevronDown size={14} className="course-chevron" aria-hidden="true" />
              </button>
              <div id={`${id}-${index}`} hidden={!open}>
                {open &&
                  section.variationIndices.map((value) => {
                    const variation = progress.variations[value];
                    return (
                      <div
                        className={`course-variation is-${variation.status}`}
                        key={course.variations[value].id}
                      >
                        {variation.status === 'learned' ? (
                          <Check size={14} />
                        ) : (
                          <BookOpen size={14} />
                        )}
                        <div>
                          <strong>
                            {courseVariationLabel(course.variations[value], course.name)}
                          </strong>
                          <small>
                            {variation.status === 'learned'
                              ? variation.best === 10
                                ? 'Learned · clean recall'
                                : 'Learned · practice again for a clean recall'
                              : variation.status === 'learning'
                                ? 'Current lesson · not yet practiced'
                                : 'Not learned yet'}
                          </small>
                        </div>
                        {variation.best > 0 && <span>{variation.best} pts</span>}
                      </div>
                    );
                  })}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
