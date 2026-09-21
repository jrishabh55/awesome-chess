import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react';
import { ModeBoard } from '../app/ModeBoard';
import { BoardTools, type DrawingMode } from '../board/BoardTools';
import { BoardNavigation } from '../board/BoardNavigation';
import { OpeningDatabasePicker } from './OpeningDatabasePicker';
import type { Color, DrawingColor, Mark, Square } from '../chess/types';
import { builtInPacks, importPack, type OpeningPack } from './packs';
import {
  createSession,
  currentLine,
  guideStep,
  nextStage,
  playTrainingMove,
  position,
  PROGRESS_KEY,
  restoreProgress,
  serializeProgress,
  type Progress,
  type TrainingSession,
} from './session';
import './training.css';

function readSaved(): Progress | null {
  try {
    return restoreProgress(localStorage.getItem(PROGRESS_KEY));
  } catch {
    return null;
  }
}
const colorName = (side: Color) => (side === 'w' ? 'White' : 'Black');

export function OpeningTeacher(_props: { onBack?: () => void } = {}) {
  const [saved] = useState(readSaved);
  const [pack, setPack] = useState<OpeningPack>(saved?.pack || builtInPacks[0]);
  const [session, setSession] = useState<TrainingSession>(
    () => saved?.session || createSession(builtInPacks[0]),
  );
  const [active, setActive] = useState(false);
  const [orientation, setOrientation] = useState<Color>(saved?.pack.side || 'w');
  const [drawingMode, setDrawingMode] = useState<DrawingMode>('move');
  const [drawingColor, setDrawingColor] = useState<DrawingColor>('red');
  const [annotations, setAnnotations] = useState<Record<string, Mark[]>>({});
  const [dialog, setDialog] = useState<'catalog' | 'reset' | 'note' | null>(null);
  const [catalogIndex, setCatalogIndex] = useState(0);
  const [pgn, setPgn] = useState('');
  const [importName, setImportName] = useState('My repertoire');
  const [importSide, setImportSide] = useState<Color>('w');
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [hint, setHint] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const line = currentLine(pack, session);
  const stage = session.stages[session.stage];
  const finished = !stage;
  const guided = stage?.kind === 'guide';
  const lineFinished = session.ply >= line.moves.length;
  const move = line.moves[session.ply];
  const lastMove = line.moves[session.ply - 1];
  const learned = session.stages.slice(0, session.stage).filter((s) => s.kind === 'guide').length;
  const finalStages = session.stages.filter((s) => s.kind === 'final');
  const finalIndex = session.stages
    .slice(0, session.stage)
    .filter((s) => s.kind === 'final').length;
  const catalogPack = builtInPacks[catalogIndex];
  const fen = position(pack, session);
  const annotationKey = fen.split(' ').slice(0, 4).join(' ');
  const flip = () => setOrientation((value) => (value === 'w' ? 'b' : 'w'));
  function toggleAnnotation(mark: Mark) {
    const key = (value: Mark) =>
      value.kind === 'arrow'
        ? `${value.kind}:${value.color}:${value.from}:${value.to}`
        : `${value.kind}:${value.color}:${value.square}`;
    setAnnotations((current) => {
      const existing = current[annotationKey] || [];
      return {
        ...current,
        [annotationKey]: existing.some((value) => key(value) === key(mark))
          ? existing.filter((value) => key(value) !== key(mark))
          : [...existing, mark],
      };
    });
  }
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
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
      if (event.key.toLowerCase() === 'x') {
        if (event.repeat) return;
        event.preventDefault();
        flip();
        return;
      }
      if (!active || !guided || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      setSession((current) => guideStep(pack, current, event.key === 'ArrowLeft' ? -1 : 1));
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [active, guided, dialog, pack]);

  useEffect(() => {
    if (!active) return;
    try {
      localStorage.setItem(PROGRESS_KEY, serializeProgress(pack, session));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [active, pack, session]);
  useEffect(() => {
    const element = dialogRef.current;
    if (dialog && element && !element.open) element.showModal();
    if (!dialog && element?.open) element.close();
  }, [dialog]);
  useEffect(() => {
    setHint(false);
    setRevealed(false);
    setFeedback('');
  }, [session.stage, session.ply]);

  function start(nextPack: OpeningPack, requireSave = false) {
    const nextSession = createSession(nextPack);
    const serialized = serializeProgress(nextPack, nextSession);
    if (requireSave) {
      try {
        localStorage.setItem(PROGRESS_KEY, serialized);
      } catch {
        throw Error(
          'This course could not be saved on this device. Free browser storage, shorten comments, or import fewer variations. Your previous course is unchanged.',
        );
      }
    }
    setPack(nextPack);
    setOrientation(nextPack.side);
    setAnnotations({});
    setDrawingMode('move');
    setSession(nextSession);
    setActive(true);
    setDialog(null);
    setError('');
    setHint(false);
    setRevealed(false);
    setFeedback('');
  }
  function play(uci: string) {
    if (!active || guided || lineFinished || finished || dialog) return;
    const result = playTrainingMove(pack, session, uci);
    setSession(result.session);
    if (!result.correct)
      setFeedback('That is not the move in this variation. Try again; the position is unchanged.');
  }
  function advance() {
    setSession((current) => nextStage(pack, current));
  }
  const marks: Mark[] =
    active && move && (guided || hint || revealed)
      ? [
          {
            kind: 'arrow',
            from: move.uci.slice(0, 2) as Square,
            to: move.uci.slice(2, 4) as Square,
            color: 'green',
          },
          ...(guided ? move.marks : []),
        ]
      : [];
  const nextKind = session.stages[session.stage + 1]?.kind;
  const continueLabel = !nextKind
    ? 'Finish course'
    : nextKind === 'guide'
      ? 'Next variation'
      : nextKind === 'final' && stage?.kind !== 'final'
        ? 'Start final drill'
        : 'Next drill';

  return (
    <section className="opening-teacher" aria-label="Opening Teacher">
      <header className="ot-header">
        <BookOpen size={21} className="ot-accent" />
        <div className="ot-heading">
          <h1>Opening Teacher</h1>
          <span>{active ? pack.name : 'Learn the plans. Remember the moves.'}</span>
        </div>
      </header>
      <div className="ot-workspace">
        <ModeBoard
          board={{
            fen,
            orientation,
            lastMove: lastMove?.uci,
            marks: annotations[annotationKey] || [],
            coachMarks: marks,
            onMove: play,
            onToggleMark: toggleAnnotation,
            drawingMode,
            drawingColor,
            disabled: !active || !!guided || lineFinished || finished || !!dialog,
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
          caption={active && guided ? '← / → Guided tour · X Flip' : 'X Flip board'}
        />
        <aside className="ot-panel" aria-label="Opening lesson">
          <div className="ot-panel-controls">
            <button
              className="ot-button"
              onClick={() => {
                setError('');
                setDialog('catalog');
              }}
            >
              Openings
            </button>
            <div className="ot-course-progress" aria-label="Course progress">
              <span>
                {active
                  ? `${Math.min(learned, pack.lines.length)} / ${pack.lines.length} learned`
                  : 'Tour → practice'}
              </span>
              <progress
                aria-label="Course stages completed"
                value={active ? session.stage : 0}
                max={session.stages.length}
              />
            </div>
            {active && (
              <button
                className="ot-icon"
                aria-label="Restart course"
                title="Restart course"
                onClick={() => setDialog('reset')}
              >
                <RotateCcw size={16} />
              </button>
            )}
          </div>
          {!active ? (
            <>
              <div className="ot-eyebrow">
                {saved ? 'Saved on this device' : 'YOUR FIRST REPERTOIRE'}
              </div>
              <h2>{pack.name}</h2>
              <p className="ot-description">{pack.description}</p>
              <div className="ot-detail">
                Play {colorName(pack.side)} · {pack.lines.length} variations
              </div>
              <p className="ot-welcome-detail">
                Follow each guided tour, then play your moves from memory. Your opponent replies
                automatically.
              </p>
              <div className="ot-actions">
                <button
                  className="ot-primary"
                  onClick={() => (saved ? setActive(true) : start(pack))}
                >
                  {saved ? 'Resume course' : 'Start course'}
                  <ArrowRight size={17} />
                </button>
                <button className="ot-button" onClick={() => setDialog('catalog')}>
                  Choose opening / import PGN
                </button>
              </div>
            </>
          ) : finished ? (
            <>
              <div className="ot-eyebrow">
                <Check size={16} /> Course complete
              </div>
              <h2>Every variation practiced.</h2>
              <p className="ot-description">
                You finished the guided lessons and the final shuffled drill of all{' '}
                {pack.lines.length} variations.
              </p>
              <div className="ot-summary">
                <span>{session.mistakes} retries</span>
                <span>{session.hints} hints</span>
                <span>{session.reveals} reveals</span>
              </div>
              <p className="ot-welcome-detail">
                Repeat the course to strengthen recall, or learn another opening.
              </p>
              <div className="ot-actions">
                <button className="ot-primary" onClick={() => start(pack)}>
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
                {guided
                  ? `Guided tour · variation ${stage.line + 1}`
                  : stage.kind === 'final'
                    ? `Final drill · ${finalIndex + 1} of ${finalStages.length}`
                    : 'Recall practice'}
                <span>Play {colorName(pack.side)}</span>
              </div>
              <h2 title={line.name}>{line.name}</h2>
              <div className="ot-detail">
                {lineFinished
                  ? 'Variation complete'
                  : `Move ${move.before.split(' ')[5]}${move.before.split(' ')[1] === 'w' ? '.' : '…'}`}{' '}
                · {session.ply} / {line.moves.length} half-moves
              </div>
              {guided ? (
                <div className="ot-teaching-copy">
                  <h3>
                    {lineFinished
                      ? 'You have seen the whole line.'
                      : `${move.before.split(' ')[1] === 'w' ? 'White' : 'Black'} plays ${move.san}`}
                  </h3>
                  <p>
                    {lineFinished
                      ? 'Now play your side from memory. The opponent’s moves will be played for you.'
                      : move.note}
                  </p>
                  {!lineFinished && move.note.length > 180 && (
                    <button className="ot-text" onClick={() => setDialog('note')}>
                      Read full explanation
                    </button>
                  )}
                </div>
              ) : (
                <div className="ot-teaching-copy" aria-live="polite">
                  <h3>
                    {lineFinished
                      ? 'Variation recalled.'
                      : revealed
                        ? `Play ${move.san}`
                        : `Your move as ${colorName(pack.side)}`}
                  </h3>
                  <p className={feedback ? 'ot-feedback' : ''}>
                    {lineFinished
                      ? 'Continue when you are ready for the next lesson.'
                      : feedback ||
                        (revealed
                          ? move.note
                          : hint
                            ? 'Follow the green arrow. Play the move on the board.'
                            : 'Play the move from this variation. Select a piece and its destination, or drag it.')}
                  </p>
                  {revealed && !lineFinished && move.note.length > 180 && (
                    <button className="ot-text" onClick={() => setDialog('note')}>
                      Read full explanation
                    </button>
                  )}
                </div>
              )}
              <div className="ot-actions">
                {guided ? (
                  <>
                    <BoardNavigation
                      onStart={() => setSession(guideStep(pack, session, -session.ply))}
                      onPrevious={() => setSession(guideStep(pack, session, -1))}
                      onNext={() => setSession(guideStep(pack, session, 1))}
                      onEnd={() => setSession(guideStep(pack, session, line.moves.length))}
                      canPrevious={session.ply > 0}
                      canNext={!lineFinished}
                    />
                    {lineFinished && (
                      <button className="ot-primary" onClick={advance}>
                        Start practice
                        <ChevronRight size={16} />
                      </button>
                    )}
                  </>
                ) : lineFinished ? (
                  <button className="ot-primary" onClick={advance}>
                    {continueLabel}
                    <ArrowRight size={16} />
                  </button>
                ) : (
                  <div className="ot-navigation">
                    <button
                      className="ot-button"
                      disabled={hint || revealed}
                      onClick={() => {
                        setHint(true);
                        setSession((s) => ({ ...s, hints: s.hints + 1 }));
                      }}
                    >
                      Hint
                    </button>
                    <button
                      className="ot-button"
                      disabled={revealed}
                      onClick={() => {
                        setRevealed(true);
                        setFeedback('');
                        setSession((s) => ({ ...s, reveals: s.reveals + 1 }));
                      }}
                    >
                      Reveal move
                    </button>
                  </div>
                )}
              </div>
              <div className="ot-status">
                {storageError
                  ? 'Progress could not be saved on this device.'
                  : 'Progress saved on this device'}
                {!guided && <span>{session.mistakes} retries</span>}
              </div>
            </>
          )}
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
            {dialog === 'reset'
              ? 'Restart this course?'
              : dialog === 'note'
                ? 'Move explanation'
                : 'Choose your opening'}
          </h2>
          <button
            className="ot-icon"
            aria-label="Close opening dialog"
            onClick={() => setDialog(null)}
          >
            <X size={20} />
          </button>
        </div>
        {dialog === 'reset' ? (
          <div className="ot-dialog-content">
            <p>
              This resets the lesson progress and retry counts for {pack.name}. Your course starts
              again with the first guided tour.
            </p>
            <div className="ot-navigation">
              <button className="ot-button" onClick={() => setDialog(null)}>
                Keep progress
              </button>
              <button className="ot-primary" onClick={() => start(pack)}>
                Restart course
              </button>
            </div>
          </div>
        ) : dialog === 'note' ? (
          <div className="ot-dialog-content">
            <h3>{move?.san}</h3>
            <p>{move?.note}</p>
          </div>
        ) : (
          <div className="ot-dialog-content">
            {dialog === 'catalog' && (
              <OpeningDatabasePicker onChoose={(nextPack) => start(nextPack, true)} />
            )}
            <p className="ot-muted">
              One guided tour and one drill for your first line. Each new line adds a tour and two
              shuffled drills, including that new line. Finish by recalling every variation in
              shuffled order.
            </p>
            <div className="ot-catalog-card">
              <div className="ot-eyebrow">
                Built-in repertoire · {catalogIndex + 1} / {builtInPacks.length}
              </div>
              <h3>{catalogPack.name}</h3>
              <p>{catalogPack.description}</p>
              <span className="ot-detail">
                Play {colorName(catalogPack.side)} · {catalogPack.lines.length} variations
              </span>
              <ul>
                {catalogPack.lines.map((item) => (
                  <li key={item.name}>{item.name}</li>
                ))}
              </ul>
              <div className="ot-navigation">
                <button
                  className="ot-button"
                  aria-label="Previous opening"
                  onClick={() =>
                    setCatalogIndex((catalogIndex + builtInPacks.length - 1) % builtInPacks.length)
                  }
                >
                  <ChevronLeft size={18} />
                </button>
                <button className="ot-primary" onClick={() => start(catalogPack)}>
                  Start {catalogPack.name}
                </button>
                <button
                  className="ot-button"
                  aria-label="Next opening"
                  onClick={() => setCatalogIndex((catalogIndex + 1) % builtInPacks.length)}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
            {(active || saved) && (
              <p className="ot-muted">
                Starting a course replaces the saved course on this device.
              </p>
            )}
            <form
              className="ot-import"
              onSubmit={(event) => {
                event.preventDefault();
                try {
                  start(importPack(pgn, importSide, importName), true);
                } catch (reason) {
                  setError(reason instanceof Error ? reason.message : 'Could not import this PGN.');
                }
              }}
            >
              <h3>Import your repertoire</h3>
              <p className="ot-muted">
                Paste PGN with variations and optional comments. Each complete branch becomes a
                lesson. Up to 40 lines, 120 half-moves per line.
              </p>
              <label>
                Repertoire name
                <input
                  value={importName}
                  maxLength={80}
                  onChange={(event) => setImportName(event.target.value)}
                />
              </label>
              <label>
                Train as
                <select
                  value={importSide}
                  onChange={(event) => setImportSide(event.target.value as Color)}
                >
                  <option value="w">White</option>
                  <option value="b">Black</option>
                </select>
              </label>
              <label>
                PGN variations
                <textarea
                  value={pgn}
                  onChange={(event) => setPgn(event.target.value)}
                  placeholder="1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *"
                  rows={5}
                  required
                  spellCheck={false}
                />
              </label>
              {error && (
                <p className="ot-feedback" role="alert">
                  {error}
                </p>
              )}
              <button className="ot-primary" type="submit">
                Import and start
              </button>
            </form>
          </div>
        )}
      </dialog>
    </section>
  );
}
