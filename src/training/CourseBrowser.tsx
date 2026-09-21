import { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Check, Layers3 } from 'lucide-react';
import type { CatalogOpening } from '../openings/catalog';
import { openingCourses, searchCourses, type OpeningCourse } from './courses';
import { PickerCombobox } from './OpeningCombobox';
import { builtInPacks, type OpeningPack } from './packs';
import { loadCurriculum } from './curriculum';
import './course.css';

export function CourseBrowser({
  entries,
  onChoose,
  onChoosePack,
}: {
  entries: CatalogOpening[];
  onChoose: (course: OpeningCourse) => void;
  onChoosePack: (pack: OpeningPack) => void;
}) {
  const courses = useMemo(() => openingCourses(entries), [entries]);
  const [selected, setSelected] = useState<OpeningCourse | null>(null);
  const [error, setError] = useState('');
  const saved = useMemo(() => {
    try {
      return selected ? loadCurriculum(selected.id) : null;
    } catch {
      return null;
    }
  }, [selected]);
  const featured = [
    'London System',
    'Sicilian Defense',
    'Italian Game',
    'Caro-Kann Defense',
    'French Defense',
    "Queen's Gambit Declined",
  ];
  const choose = (course: OpeningCourse | null) => {
    setSelected(course);
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
  return (
    <div className="course-browser">
      <PickerCombobox
        value={selected}
        onChange={choose}
        label="Opening course"
        placeholder="London, Sicilian, Caro-Kann…"
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
          </>
        )}
      />
      {error && (
        <p className="ol-error" role="alert">
          {error}
        </p>
      )}
      {selected ? (
        <section className="course-overview" aria-label="Course overview">
          <div className="course-overview-heading">
            <div>
              <span className="ot-eyebrow">Complete opening course</span>
              <h3>{selected.name}</h3>
            </div>
            <span className="course-side">Play {selected.side === 'w' ? 'White' : 'Black'}</span>
          </div>
          <p>
            Learn related variations together, understand the plans, and practice everything you
            have learned from memory.
          </p>
          <div className="course-facts">
            <span>
              <Layers3 size={14} />
              {selected.sections.length} sections
            </span>
            <span>{selected.variations.length} variations</span>
            <span>{selected.sourceCount} database lines organized</span>
          </div>
          <button className="ot-primary course-start" onClick={start}>
            {saved ? 'Resume' : 'Start'} {selected.name}
            <ArrowRight size={16} />
          </button>
          <div className="course-flow">
            <span>Guided moves</span>
            <ArrowRight size={12} />
            <span>Middlegame plans</span>
            <ArrowRight size={12} />
            <span>Shuffled recall</span>
          </div>
          <div className="course-syllabus">
            <h4>Course sections</h4>
            <p className="ot-muted">
              The next variation opens automatically. Each practice round includes all variations
              learned so far.
            </p>
            <ol>
              {selected.sections.map((section, index) => (
                <li key={section.id}>
                  <span className="course-section-number">{index + 1}</span>
                  <div>
                    <strong>{section.name}</strong>
                    {section.commonPgn && <p className="course-prefix">{section.commonPgn}</p>}
                    <small>
                      {section.variationIndices.length}{' '}
                      {section.variationIndices.length === 1 ? 'variation' : 'variations'}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <p className="course-scoring">
            <Check size={14} />
            10 points per clean drill · 5 after a mistake · retry to improve.
          </p>
        </section>
      ) : (
        <>
          <div className="course-intro">
            <h3>One opening. A complete learning path.</h3>
            <p>
              Start with the foundation, learn related variations in sections, then recall them in
              shuffled drills. No setup required.
            </p>
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
