import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, Layers3, RotateCcw, Trophy, X } from 'lucide-react';
import { ModeBoard } from '../app/ModeBoard';
import { BoardTools, type DrawingMode } from '../board/BoardTools';
import { BoardNavigation } from '../board/BoardNavigation';
import { useMoveKeyPacing } from '../board/useMoveKeyPacing';
import { MoveThought } from './MoveThought';
import { OpeningSettings } from './OpeningSettings';
import { useOpeningPreferences } from './preferences';
import type { Color, DrawingColor, Mark, Square } from '../chess/types';
import { OpeningLibrary } from './OpeningLibrary';
import { databasePack } from './database';
import { courseVariationLabel, type OpeningCourse } from './courses';
import { courseProgress } from './course-progress';
import { learningBatch } from './practice-batches';
import { CourseSyllabus } from './CourseSyllabus';
import {
  activeVariationIndex,
  CurriculumConflictError,
  continueCurriculum,
  createCurriculum,
  guideStep,
  playDrillMove,
  playCurriculumReply,
  recordHint,
  retryDrill,
  saveCurriculum,
  loadCurriculum,
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
  const preferences = useOpeningPreferences();
  const [replyPaused, setReplyPaused] = useState(false);
  const lastSavedSession = useRef(initialSession);
  const [conflict, setConflict] = useState(false);
  const [active, setActive] = useState(initialActive);
  const [orientation, setOrientation] = useState<Color>(course.side);
  const [drawingMode, setDrawingMode] = useState<DrawingMode>('move');
  const [drawingColor, setDrawingColor] = useState<DrawingColor>('green');
  const [annotations, setAnnotations] = useState<Record<string, Mark[]>>({});
  const [hint, setHint] = useState(false);
  const [notice, setNotice] = useState('');
  const [storageError, setStorageError] = useState('');
  const [dialog, setDialog] = useState<
    'catalog' | 'explanation' | 'plans' | 'sections' | 'restart' | 'settings' | null
  >(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const index = activeVariationIndex(session);
  const entry = course.variations[index];
  const line = useMemo(() => databasePack(entry, course.side).lines[0], [entry, course.side]);
  const move = line.moves[session.ply];
  const opponentTurn = !!move && move.before.split(' ')[1] !== course.side;
  const previousMove = line.moves[session.ply - 1];
  const fen = previousMove?.after || line.rootFen;
  const allowMoveKey = useMoveKeyPacing(fen);
  const guided = session.phase === 'guide';
  const plansVisible = session.phase === 'plans';
  const drilling = session.phase === 'drill';
  const automaticReplies =
    guided || plansVisible ? preferences.autoLessonReplies : preferences.autoDrillReplies;
  const waitingForReply = opponentTurn && automaticReplies && (!guided || !replyPaused);
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
  const learningProgress = useMemo(() => courseProgress(course, session), [course, session]);
  const score = learningProgress.points;
  const drillDone = session.phase === 'feedback';
  const roundDone = session.roundIndex + 1 >= session.round.length;
  const batch = learningBatch(course, session.lesson);
  const batchEnd = batch.variationIndices.at(-1)!;
  const lessonSection = course.sections[batch.sectionIndex];
  const sectionEnd = lessonSection.variationIndices.at(-1)!;
  const sectionReviewNext = session.drill !== 'section' && session.lesson === sectionEnd;
  const nextLabel = roundDone
    ? sectionReviewNext
      ? 'Start section drill'
      : session.lesson + 1 >= course.variations.length
        ? 'Finish course'
        : session.lesson === sectionEnd
          ? 'Next section'
          : 'Next learning batch'
    : 'Next drill';
  const annotationKey = fen.split(' ').slice(0, 4).join(' ');
  const flip = () => setOrientation((value) => (value === 'w' ? 'b' : 'w'));

  function update(next: CurriculumSession) {
    if (conflict) return;
    setSession(next);
    setNotice('');
  }
  function navigate(delta: number) {
    setReplyPaused(delta <= 0);
    const asGuide = { ...session, phase: 'guide' as const };
    const next = guideStep(asGuide, line.moves.length, delta);
    update(next.ply === line.moves.length ? { ...next, phase: 'plans' } : next);
  }
  function play(uci: string) {
    if (!active || dialog || conflict || waitingForReply || (!guided && !drilling) || !move) return;
    if (guided) {
      if (uci === move.uci) navigate(1);
      else
        setNotice(
          'Follow the lesson move shown by the arrow. This guided attempt does not affect your points.',
        );
      return;
    }
    const result = playDrillMove(course, session, line, uci, !preferences.autoDrillReplies);
    setSession(result.session);
    setNotice(
      result.correct
        ? ''
        : 'Incorrect move. Try again from this position. This attempt is worth 5 points; a clean retry can earn 10.',
    );
  }
  function advance() {
    setReplyPaused(false);
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
    if (!active || dialog || conflict || !waitingForReply || (!guided && !drilling)) return;
    // Allow the learner's piece to finish travelling before the reply begins.
    const timer = window.setTimeout(() => {
      setSession((current) => playCurriculumReply(course, current, line));
    }, preferences.replyDelayMs);
    return () => window.clearTimeout(timer);
  }, [
    active,
    dialog,
    conflict,
    waitingForReply,
    guided,
    drilling,
    course,
    line,
    session,
    preferences.replyDelayMs,
  ]);
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
        if (!allowMoveKey(event)) return;
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
          ...(guided
            ? move.marks.filter((mark) => mark.kind !== 'square' || preferences.highlightSquares)
            : []),
        ]
      : [];
  if (active && (guided || plansVisible) && preferences.highlightSquares)
    coachMarks.push(
      ...explainOpeningMove(course.name, line, Math.max(0, session.ply - 1)).thoughtMarks,
    );

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
          header={
            active &&
            (guided || plansVisible) &&
            preferences.showThoughts && (
              <MoveThought courseName={course.name} line={line} ply={session.ply} />
            )
          }
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
            animatePieces: preferences.animatePieces,
            disabled: !active || !!dialog || conflict || waitingForReply || (!guided && !drilling),
          }}
          tools={
            <BoardTools
              mode={drawingMode}
              color={drawingColor}
              onMode={setDrawingMode}
              onColor={setDrawingColor}
              onClear={() => setAnnotations((current) => ({ ...current, [annotationKey]: [] }))}
              onFlip={flip}
              onSettings={() => setDialog('settings')}
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
                {session.history
                  ? 'Your syllabus now follows full opening lines. Your earlier points and completed recalls are kept.'
                  : 'Continue your full lines, batch drills, and section reviews.'}
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
                      ? 'Line complete'
                      : session.practice === 'batches'
                        ? session.drill === 'section'
                          ? 'Section drill'
                          : 'Batch drill'
                        : 'Recall practice'}
                </span>
                <span>
                  {automaticReplies ? `Play ${sideName(course.side)}` : 'Play both sides'}
                </span>
              </div>
              <h2 title={courseVariationLabel(entry, course.name)}>
                {courseVariationLabel(entry, course.name)}
              </h2>
              <div className="ot-detail ct-section-label" title={section?.commonPgn}>
                {section?.name}
                {drilling || drillDone
                  ? ` · Drill ${session.roundIndex + 1} of ${session.round.length}`
                  : ` · Learning ${batch.variationIndices.indexOf(session.lesson) + 1} of ${batch.variationIndices.length}`}
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
                      ? sectionReviewNext
                        ? `Batch complete. Now recall all ${lessonSection.variationIndices.length} lines in this section in a fresh random order.`
                        : session.lesson + 1 < course.variations.length
                          ? 'Drill complete. Your next full-line lessons are ready.'
                          : 'You have recalled every section in this course.'
                      : 'Continue to the next randomly selected variation.'}
                  </p>
                </div>
              ) : (
                <div className="ot-teaching-copy ct-copy" aria-live="polite">
                  <h3>
                    {waitingForReply
                      ? 'Opponent replies automatically'
                      : `Your move as ${move?.before.split(' ')[1] === 'b' ? 'Black' : 'White'}`}
                  </h3>
                  <p className={notice ? 'ot-feedback' : ''} role={notice ? 'status' : undefined}>
                    {notice ||
                      (hint
                        ? 'Follow the green arrow, then continue from memory.'
                        : automaticReplies
                          ? 'Recall this variation from memory. Your opponent replies automatically.'
                          : 'Recall this variation from memory and play both colors.')}
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
                        onClick={() => {
                          setReplyPaused(false);
                          update(startRound(course, session));
                        }}
                      >
                        {session.lesson < batchEnd
                          ? 'Next full line'
                          : batch.variationIndices.length === 1
                            ? 'Practice this variation'
                            : `Practice these ${batch.variationIndices.length} variations`}
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
                    disabled={hint || conflict || waitingForReply}
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
                    const saved = loadCurriculum(course.id);
                    onChooseCourse(saved?.course || course);
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
            {dialog === 'settings'
              ? 'Opening settings'
              : dialog === 'catalog'
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
            {dialog === 'settings' && <OpeningSettings />}
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
                <CourseSyllabus course={course} progress={learningProgress} heading={false} />
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
                      update({
                        ...createCurriculum(course),
                        scores: session.scores,
                        history: session.history,
                      });
                      setReplyPaused(false);
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
