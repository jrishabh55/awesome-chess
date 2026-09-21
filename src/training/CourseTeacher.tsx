import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, Layers3, RotateCcw, Trophy, X } from 'lucide-react';
import { ModeBoard } from '../app/ModeBoard';
import { BoardTools, type DrawingMode } from '../board/BoardTools';
import { BoardNavigation } from '../board/BoardNavigation';
import type { Color, DrawingColor, Mark, Square } from '../chess/types';
import { OpeningLibrary } from './OpeningLibrary';
import { databasePack } from './database';
import { courseVariationLabel, type OpeningCourse } from './courses';
import {
  activeVariationIndex,
  CurriculumConflictError,
  continueCurriculum,
  createCurriculum,
  guideStep,
  playDrillMove,
  recordHint,
  retryDrill,
  saveCurriculum,
  startRound,
  type CurriculumSession,
} from './curriculum';
import { explainOpeningMove, openingPlans } from './explanations';
import type { OpeningPack } from './packs';
import './training.css';
import './course.css';

const sideName = (side: Color) => (side === 'w' ? 'White' : 'Black');
export function CourseTeacher({
  course,
  initialSession,
  initialActive,
  onChooseCourse,
  onChoosePack,
}: {
  course: OpeningCourse;
  initialSession: CurriculumSession;
  initialActive: boolean;
  onChooseCourse: (course: OpeningCourse) => void;
  onChoosePack: (pack: OpeningPack) => void;
}) {
  const [session, setSession] = useState(initialSession);
  const lastSavedSession = useRef(initialSession);
  const [conflict, setConflict] = useState(false);
  const [active, setActive] = useState(initialActive);
  const [orientation, setOrientation] = useState<Color>(course.side);
  const [drawingMode, setDrawingMode] = useState<DrawingMode>('move');
  const [drawingColor, setDrawingColor] = useState<DrawingColor>('red');
  const [annotations, setAnnotations] = useState<Record<string, Mark[]>>({});
  const [hint, setHint] = useState(false);
  const [notice, setNotice] = useState('');
  const [storageError, setStorageError] = useState('');
  const [dialog, setDialog] = useState<
    'catalog' | 'explanation' | 'plans' | 'sections' | 'restart' | null
  >(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const index = activeVariationIndex(session);
  const entry = course.variations[index];
  const line = useMemo(() => databasePack(entry, course.side).lines[0], [entry, course.side]);
  const move = line.moves[session.ply];
  const previousMove = line.moves[session.ply - 1];
  const fen = previousMove?.after || line.rootFen;
  const guided = session.phase === 'guide';
  const plansVisible = session.phase === 'plans';
  const drilling = session.phase === 'drill';
  const finished = session.phase === 'complete';
  const sectionIndex = course.sections.findIndex((section) =>
    section.variationIndices.includes(index),
  );
  const section = course.sections[sectionIndex];
  const explanation = useMemo(
    () => explainOpeningMove(course.name, line, Math.min(session.ply, line.moves.length - 1)),
    [course.name, line, session.ply],
  );
  const plans = useMemo(
    () => openingPlans(course.name, line, course.side),
    [course.name, line, course.side],
  );
  const score = Object.values(session.scores).reduce((total, item) => total + item.best, 0);
  const drillDone = session.phase === 'feedback';
  const roundDone = session.roundIndex + 1 >= session.round.length;
  const nextLabel = roundDone
    ? session.lesson + 1 >= course.variations.length
      ? 'Finish course'
      : 'Next variation'
    : 'Next drill';
  const annotationKey = fen.split(' ').slice(0, 4).join(' ');
  const flip = () => setOrientation((value) => (value === 'w' ? 'b' : 'w'));

  function update(next: CurriculumSession) {
    if (conflict) return;
    setSession(next);
    setNotice('');
  }
  function navigate(delta: number) {
    const asGuide = { ...session, phase: 'guide' as const };
    const next = guideStep(asGuide, line.moves.length, delta);
    update(next.ply === line.moves.length ? { ...next, phase: 'plans' } : next);
  }
  function play(uci: string) {
    if (!active || dialog || conflict || (!guided && !drilling) || !move) return;
    if (guided) {
      if (uci === move.uci) navigate(1);
      else
        setNotice(
          'Follow the lesson move shown by the arrow. This guided attempt does not affect your points.',
        );
      return;
    }
    const result = playDrillMove(course, session, line, uci);
    setSession(result.session);
    setNotice(
      result.correct
        ? ''
        : 'Incorrect move. Try again from this position. This attempt is worth 5 points; a clean retry can earn 10.',
    );
  }
  function advance() {
    let next = continueCurriculum(course, session);
    if (next.phase === 'round-complete') next = continueCurriculum(course, next);
    update(next);
  }
  function toggleMark(mark: Mark) {
    const key = (item: Mark) =>
      item.kind === 'arrow'
        ? `${item.kind}:${item.color}:${item.from}:${item.to}`
        : `${item.kind}:${item.color}:${item.square}`;
    setAnnotations((current) => {
      const marks = current[annotationKey] || [];
      return {
        ...current,
        [annotationKey]: marks.some((item) => key(item) === key(mark))
          ? marks.filter((item) => key(item) !== key(mark))
          : [...marks, mark],
      };
    });
  }
  useEffect(() => {
    if (!active) return;
    try {
      saveCurriculum(course, session, lastSavedSession.current);
      lastSavedSession.current = session;
      setConflict(false);
      setStorageError('');
    } catch (error) {
      if (error instanceof CurriculumConflictError) setConflict(true);
      setStorageError(error instanceof Error ? error.message : 'Progress could not be saved.');
    }
  }, [course, session, active]);
  useEffect(() => {
    setHint(false);
    setNotice('');
  }, [session.ply, session.phase, session.roundIndex, session.lesson]);
  useEffect(() => {
    if (dialog && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
    if (!dialog && dialogRef.current?.open) dialogRef.current.close();
  }, [dialog]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (
        dialog ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (event.target instanceof Element &&
          event.target.closest('input,textarea,select,[contenteditable="true"]'))
      )
        return;
      if (event.key.toLowerCase() === 'x' && !event.repeat) {
        event.preventDefault();
        flip();
      }
      if (active && (guided || plansVisible) && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        navigate(event.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [active, dialog, guided, plansVisible, session, line]);
  const coachMarks: Mark[] =
    active && move && (guided || (drilling && hint))
      ? [
          {
            kind: 'arrow',
            color: 'green',
            from: move.uci.slice(0, 2) as Square,
            to: move.uci.slice(2, 4) as Square,
          },
          ...(guided ? move.marks : []),
        ]
      : [];

  return (
    <section className="opening-teacher curriculum-teacher" aria-label="Opening Teacher">
      <header className="ot-header">
        <BookOpen size={21} className="ot-accent" />
        <div className="ot-heading">
          <h1>Opening Teacher</h1>
          <span>{course.name}</span>
        </div>
      </header>
      <div className="ot-workspace">
        <ModeBoard
          board={{
            fen,
            orientation,
            lastMove: previousMove?.uci,
            marks: annotations[annotationKey] || [],
            coachMarks,
            onMove: play,
            onToggleMark: toggleMark,
            drawingMode,
            drawingColor,
            disabled: !active || !!dialog || conflict || (!guided && !drilling),
          }}
          tools={
            <BoardTools
              mode={drawingMode}
              color={drawingColor}
              onMode={setDrawingMode}
              onColor={setDrawingColor}
              onClear={() => setAnnotations((current) => ({ ...current, [annotationKey]: [] }))}
              onFlip={flip}
            />
          }
          caption={
            active && (guided || plansVisible)
              ? '← / → Guided lesson · X Flip'
              : 'Recall your moves · X Flip'
          }
        />
        <aside className="ot-panel ct-panel" aria-label="Opening lesson">
          <div className="ot-panel-controls">
            <button className="ot-button" onClick={() => setDialog('catalog')}>
              Openings
            </button>
            <button
              className="ct-points"
              onClick={() => setDialog('sections')}
              aria-label={`Course score: ${score} points`}
            >
              <Trophy size={15} />
              <strong>{score}</strong>
              <span>pts</span>
            </button>
            <button
              className="ot-icon"
              aria-label="Course sections"
              title="Course sections"
              onClick={() => setDialog('sections')}
            >
              <Layers3 size={17} />
            </button>
            <button
              className="ot-icon"
              aria-label="Restart course"
              title="Restart course"
              onClick={() => setDialog('restart')}
            >
              <RotateCcw size={16} />
            </button>
          </div>
          <div className="ct-progress">
            <span>
              Section {finished ? course.sections.length : sectionIndex + 1} /{' '}
              {course.sections.length}
            </span>
            <span>
              {Math.min(session.lesson + 1, course.variations.length)} / {course.variations.length}{' '}
              variations
            </span>
            <progress
              max={course.variations.length}
              value={finished ? course.variations.length : session.lesson}
            />
          </div>
          {!active ? (
            <>
              <div className="ot-eyebrow">Saved on this device</div>
              <h2>{course.name}</h2>
              <p className="ot-description">
                Continue your guided lessons, opening plans, and cumulative recall drills.
              </p>
              <div className="ot-detail">
                {course.sections.length} sections · Play {sideName(course.side)}
              </div>
              <div className="ot-actions">
                <button className="ot-primary" onClick={() => setActive(true)}>
                  Resume course
                  <ArrowRight size={16} />
                </button>
              </div>
            </>
          ) : finished ? (
            <>
              <div className="ot-eyebrow">
                <Check size={15} />
                Course complete
              </div>
              <h2>Every variation practiced.</h2>
              <p className="ot-description">
                You have worked through every section and recalled all {course.variations.length}{' '}
                variations.
              </p>
              <div className="ct-finish-score">
                <Trophy size={23} />
                {score} points
              </div>
              <p className="ot-detail">
                Redo the course to upgrade 5-point drills. Your best scores are kept.
              </p>
              <div className="ot-actions">
                <button className="ot-primary" onClick={() => setDialog('restart')}>
                  Practice again
                </button>
                <button className="ot-button" onClick={() => setDialog('catalog')}>
                  Choose another opening
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="ot-eyebrow">
                <span className="ct-phase">
                  {guided
                    ? 'Guided lesson'
                    : plansVisible
                      ? 'Into the middlegame'
                      : 'Recall practice'}
                </span>
                <span>Play {sideName(course.side)}</span>
              </div>
              <h2 title={courseVariationLabel(entry, course.name)}>
                {courseVariationLabel(entry, course.name)}
              </h2>
              <div className="ot-detail ct-section-label" title={section?.commonPgn}>
                {section?.name}
                {drilling || drillDone
                  ? ` · Drill ${session.roundIndex + 1} of ${session.round.length}`
                  : ''}
              </div>
              {guided ? (
                <div className="ot-teaching-copy ct-copy">
                  <h3>{explanation.title}</h3>
                  <p>{explanation.summary}</p>
                  {explanation.ideas[0] && <p className="ct-secondary">{explanation.ideas[0]}</p>}
                  {notice && (
                    <p className="ot-feedback" role="status">
                      {notice}
                    </p>
                  )}
                </div>
              ) : plansVisible ? (
                <div className="ot-teaching-copy ct-copy">
                  <h3>{plans.title}</h3>
                  <ul className="ct-plan-list">
                    {plans.ideas.map((idea) => (
                      <li key={idea}>{idea}</li>
                    ))}
                  </ul>
                </div>
              ) : drillDone ? (
                <div className="ot-teaching-copy ct-copy" aria-live="polite">
                  <h3>{session.mistakes ? 'Completed with a mistake' : 'Clean recall!'}</h3>
                  <div className="ct-earned">
                    <Trophy size={22} />
                    <strong>{session.mistakes ? 5 : 10} points</strong>
                  </div>
                  <p>
                    {session.mistakes
                      ? 'Retry this drill without mistakes to upgrade it to 10 points.'
                      : 'You recalled the complete variation. Your best score for this drill is saved.'}
                  </p>
                  <p className="ct-secondary">
                    {roundDone
                      ? `All ${session.round.length} learned variations practiced. ${session.lesson + 1 < course.variations.length ? 'Your next lesson is ready.' : 'You have reached the end of this course.'}`
                      : 'Continue to the next randomly selected variation.'}
                  </p>
                </div>
              ) : (
                <div className="ot-teaching-copy ct-copy" aria-live="polite">
                  <h3>Your move as {sideName(course.side)}</h3>
                  <p className={notice ? 'ot-feedback' : ''} role={notice ? 'status' : undefined}>
                    {notice ||
                      (hint
                        ? 'Follow the green arrow, then continue from memory.'
                        : 'Recall this variation from memory. Your opponent replies automatically.')}
                  </p>
                  <div className="ct-attempt-status">
                    {session.mistakes} {session.mistakes === 1 ? 'mistake' : 'mistakes'} ·{' '}
                    {session.mistakes ? '5 points available' : '10 points available'}
                  </div>
                </div>
              )}
              <div className="ot-actions">
                {guided || plansVisible ? (
                  <>
                    <button
                      className="ot-text ct-read-more"
                      onClick={() => setDialog(plansVisible ? 'plans' : 'explanation')}
                    >
                      {plansVisible ? 'Read full plan' : 'Why this move'}
                    </button>
                    <BoardNavigation
                      onStart={() => navigate(-session.ply)}
                      onPrevious={() => navigate(-1)}
                      onNext={() => navigate(1)}
                      onEnd={() => navigate(line.moves.length)}
                      canPrevious={session.ply > 0}
                      canNext={!plansVisible}
                    />
                    {plansVisible && (
                      <button
                        className="ot-primary"
                        onClick={() => update(startRound(course, session))}
                      >
                        Practice{' '}
                        {session.lesson + 1 === 1
                          ? 'this variation'
                          : `all ${session.lesson + 1} variations`}
                        <ArrowRight size={16} />
                      </button>
                    )}
                  </>
                ) : drillDone ? (
                  <>
                    <button className="ot-primary" onClick={advance}>
                      {nextLabel}
                      <ArrowRight size={16} />
                    </button>
                    <button
                      className="ot-button"
                      onClick={() => update(retryDrill(course, session, line))}
                    >
                      Retry drill
                    </button>
                  </>
                ) : (
                  <button
                    className="ot-button"
                    disabled={hint || conflict}
                    onClick={() => {
                      setHint(true);
                      setSession(recordHint(session));
                    }}
                  >
                    Hint
                  </button>
                )}
              </div>
            </>
          )}
          <div
            className={`ot-status${storageError ? ' ot-feedback' : ''}`}
            role={storageError ? 'alert' : undefined}
          >
            {storageError || 'Progress saved on this device'}
            {conflict && (
              <button
                className="ot-text"
                onClick={() => {
                  try {
                    onChooseCourse(course);
                  } catch (error) {
                    setStorageError(
                      error instanceof Error
                        ? error.message
                        : 'Saved progress could not be loaded.',
                    );
                  }
                }}
              >
                Load saved progress
              </button>
            )}
          </div>
        </aside>
      </div>
      <dialog
        ref={dialogRef}
        className="ot-dialog"
        onCancel={() => setDialog(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setDialog(null);
        }}
      >
        <div className="ot-dialog-header">
          <h2>
            {dialog === 'catalog'
              ? 'Choose your opening'
              : dialog === 'plans'
                ? 'Middlegame plans'
                : dialog === 'sections'
                  ? 'Course sections'
                  : dialog === 'restart'
                    ? 'Repeat this course?'
                    : 'Why this move'}
          </h2>
          <button
            className="ot-icon"
            aria-label="Close opening dialog"
            onClick={() => setDialog(null)}
          >
            <X size={20} />
          </button>
        </div>
        {dialog === 'catalog' ? (
          <div className="ot-dialog-content ol-dialog-content">
            <OpeningLibrary onChoose={onChoosePack} onChooseCourse={onChooseCourse} />
          </div>
        ) : (
          <div className="ot-dialog-content">
            {dialog === 'explanation' && (
              <>
                <h3>{explanation.title}</h3>
                <p>{explanation.summary}</p>
                <ul className="ct-full-ideas">
                  {explanation.ideas.map((idea) => (
                    <li key={idea}>{idea}</li>
                  ))}
                </ul>
              </>
            )}
            {dialog === 'plans' && (
              <>
                <h3>{plans.title}</h3>
                <ul className="ct-full-ideas">
                  {plans.ideas.map((idea) => (
                    <li key={idea}>{idea}</li>
                  ))}
                </ul>
              </>
            )}
            {dialog === 'sections' && (
              <>
                <p>
                  {course.name} · {score} points. Each clean drill earns 10 points, or 5 after a
                  mistake. Retrying keeps your best score.
                </p>
                <ol className="ct-section-progress">
                  {course.sections.map((item) => (
                    <li key={item.id}>
                      <strong>{item.name}</strong>
                      {item.commonPgn && <p className="course-prefix">{item.commonPgn}</p>}
                      <span>
                        {
                          item.variationIndices.filter(
                            (value) => value < session.lesson || finished,
                          ).length
                        }{' '}
                        / {item.variationIndices.length} variations learned
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            )}
            {dialog === 'restart' && (
              <>
                <p>
                  Start {course.name} again from the first lesson. Your best drill scores stay
                  saved, so clean retries can upgrade earlier mistakes.
                </p>
                <div className="ot-navigation">
                  <button className="ot-button" onClick={() => setDialog(null)}>
                    Keep progress
                  </button>
                  <button
                    className="ot-primary"
                    onClick={() => {
                      update({ ...createCurriculum(course), scores: session.scores });
                      setActive(true);
                      setDialog(null);
                    }}
                  >
                    Restart lessons
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </dialog>
    </section>
  );
}
