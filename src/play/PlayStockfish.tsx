import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Bot,
  Check,
  ChevronRight,
  Download,
  Flag,
  LoaderCircle,
  Plus,
  RotateCcw,
  User,
  X,
} from 'lucide-react';
import { BoardTools } from '../board/BoardTools';
import { BoardNavigation } from '../board/BoardNavigation';
import { ModeBoard } from '../app/ModeBoard';
import { MoveList } from '../review/MoveList';
import { chessAt, positionAt, createStudy } from '../chess/tree';
import { outcomeAt } from '../chess/outcome';
import type { Color, DrawingColor, Mark, Study } from '../chess/types';
import type { EngineLoadState } from '../engine/prepare-worker';
import { GameOutcomeBadge } from '../ui/GameOutcomeBadge';
import { PlayEngine } from './engine';
import {
  advanceGame,
  annotateGame,
  createGame,
  defaultSettings,
  navigateHistory,
  resignGame,
  restoreSession,
  serializeSession,
  snapshotForReview,
  strengthFor,
  strengths,
  viewedStudy,
  type PlaySession,
  type PlaySettings,
} from './game';
import './play.css';

const storageKey = `chess-room-play-v1:${import.meta.env.BASE_URL}`;
const initialSession = (): PlaySession => {
  try {
    const saved = restoreSession(localStorage.getItem(storageKey));
    if (saved) return saved;
  } catch {
    /* The board still works when browser storage is unavailable. */
  }
  return { game: null, settings: defaultSettings, orientation: 'w' };
};
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

function PlayDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="play-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="play-dialog-heading">
        <h2>{title}</h2>
        <button aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function PlayStockfish({
  onReview,
}: {
  onBack?: () => void;
  onReview?: (study: Study) => void;
}) {
  const [session, setSession] = useState(initialSession);
  const current = useRef(session);
  const [setup, setSetup] = useState(!session.game);
  const [draft, setDraft] = useState<PlaySettings>(session.settings);
  const [confirmResign, setConfirmResign] = useState(false);
  const [drawingMode, setDrawingMode] = useState<'move' | 'arrow' | 'square'>('move');
  const [drawingColor, setDrawingColor] = useState<DrawingColor>('green');
  const [storageError, setStorageError] = useState('');
  const [load, setLoad] = useState<EngineLoadState>({ phase: 'checking', loaded: 0, total: 0 });
  const [engineError, setEngineError] = useState('');
  const [ready, setReady] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [retry, setRetry] = useState(0);
  const engine = useRef<PlayEngine | null>(null);
  const game = session.game;
  const empty = useMemo(() => createStudy(), []);
  const study = game?.study || empty;
  const displayStudy = useMemo(
    () => (game ? viewedStudy(game, session.viewPly) : empty),
    [game, session.viewPly, empty],
  );
  const displayNode = displayStudy.nodes[displayStudy.selectedId];
  const displayPly = session.viewPly ?? study.mainline.length;
  const viewingHistory = displayStudy.selectedId !== study.selectedId;
  const displayOutcome = useMemo(() => outcomeAt(displayStudy), [displayStudy]);
  const displayChess = useMemo(
    () => chessAt(displayStudy, displayStudy.selectedId),
    [displayStudy],
  );
  const chess = useMemo(() => chessAt(study, study.selectedId), [study]);
  const outcome = useMemo(() => outcomeAt(study), [study]);
  const ended = Boolean(outcome);
  const human = game?.humanColor || 'w';
  const selectedStrength = strengthFor(game?.strengthId || session.settings.strengthId);
  const commit = (next: PlaySession) => {
    current.current = next;
    setSession(next);
    try {
      localStorage.setItem(storageKey, serializeSession(next));
      setStorageError('');
    } catch {
      setStorageError('Browser storage is unavailable. Keep this tab open to keep your game.');
    }
  };

  useEffect(() => {
    setReady(false);
    setThinking(false);
    setEngineError('');
    if (!game || ended) {
      engine.current?.dispose();
      engine.current = null;
      return;
    }
    let active = true;
    const client = new PlayEngine((state) => {
      if (active) setLoad(state);
    });
    engine.current = client;
    void client
      .start()
      .then(() => {
        if (active) setReady(true);
      })
      .catch((error) => {
        if (active) {
          setEngineError(errorText(error));
          setLoad({ phase: 'error', loaded: 0, total: 0 });
        }
      });
    return () => {
      active = false;
      client.dispose();
      if (engine.current === client) engine.current = null;
    };
  }, [game?.study.id, ended, retry]);

  useEffect(() => {
    if (!game || ended || !ready || chess.turn() === human || !engine.current) return;
    const controller = new AbortController();
    const id = game.study.id,
      node = game.study.selectedId;
    setThinking(true);
    void engine.current
      .bestMove(positionAt(game.study, node), selectedStrength.value, controller.signal)
      .then((move) => {
        const latest = current.current;
        if (
          controller.signal.aborted ||
          latest.game?.study.id !== id ||
          latest.game.study.selectedId !== node ||
          latest.game.study.headers.Result !== '*'
        )
          return;
        commit({ ...latest, game: advanceGame(latest.game, move) });
        setThinking(false);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setThinking(false);
          setEngineError(errorText(error));
          setReady(false);
        }
      });
    return () => controller.abort();
  }, [game?.study.id, game?.study.selectedId, ended, ready, human]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const flip = event.key.toLowerCase() === 'x';
      if (
        (!flip && event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (flip && event.repeat) ||
        setup ||
        confirmResign ||
        (event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]')
      )
        return;
      event.preventDefault();
      const latest = current.current;
      if (flip) commit({ ...latest, orientation: latest.orientation === 'w' ? 'b' : 'w' });
      else commit(navigateHistory(latest, event.key === 'ArrowLeft' ? 'previous' : 'next'));
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [setup, confirmResign]);

  const navigate = (target: Parameters<typeof navigateHistory>[1]) =>
    commit(navigateHistory(current.current, target));
  const selectHistory = (id: string) => {
    const currentStudy = current.current.game?.study;
    if (!currentStudy) return;
    const ply = id === currentStudy.rootId ? 0 : currentStudy.mainline.indexOf(id) + 1;
    if (id === currentStudy.rootId || ply > 0) navigate(ply);
  };
  const annotate = (mark?: Mark) => {
    const latest = current.current;
    if (!latest.game) return;
    commit({
      ...latest,
      game: annotateGame(latest.game, latest.viewPly ?? latest.game.study.mainline.length, mark),
    });
  };

  const move = (uci: string) => {
    const latest = current.current;
    if (
      !latest.game ||
      (latest.viewPly != null && latest.viewPly < latest.game.study.mainline.length) ||
      !ready ||
      engineError ||
      latest.game.study.headers.Result !== '*' ||
      chessAt(latest.game.study, latest.game.study.selectedId).turn() !== latest.game.humanColor
    )
      return;
    try {
      commit({ ...latest, game: advanceGame(latest.game, uci) });
    } catch (error) {
      setEngineError(errorText(error));
    }
  };
  const start = () => {
    engine.current?.dispose();
    const next = createGame(draft);
    commit({ game: next, settings: draft, orientation: next.humanColor, viewPly: null });
    setDrawingMode('move');
    setReady(false);
    setSetup(false);
  };
  const flip = () => {
    const latest = current.current;
    commit({ ...latest, orientation: latest.orientation === 'w' ? 'b' : 'w' });
  };
  const liveTitle = !game
    ? 'Ready when you are'
    : outcome
      ? outcome.kind === 'draw'
        ? 'Draw'
        : outcome.winner === human
          ? 'You win!'
          : 'Stockfish wins'
      : engineError
        ? 'Engine paused'
        : !ready
          ? load.phase === 'downloading'
            ? 'Downloading Stockfish…'
            : 'Preparing Stockfish…'
          : thinking || chess.turn() !== human
            ? 'Stockfish is thinking…'
            : 'Your move';
  const title = viewingHistory ? 'Viewing game history' : liveTitle;
  const subtitle = viewingHistory
    ? `Move ${displayPly} of ${study.mainline.length} · ${liveTitle}`
    : outcome
      ? study.headers.Termination || 'Game complete'
      : game
        ? chess.isCheck()
          ? 'Check — protect your king'
          : `${human === 'w' ? 'White' : 'Black'} · No clock · ${selectedStrength.label}`
        : 'Choose a strength and your side.';
  const progress = load.total ? Math.min(100, Math.round((load.loaded / load.total) * 100)) : 0;
  const player = (color: Color) => (
    <div className="play-player">
      <span className={`play-avatar ${color === 'w' ? 'is-white' : 'is-black'}`}>
        {color === human ? <User size={19} /> : <Bot size={20} />}
      </span>
      <span>
        <strong>{color === human ? 'You' : 'Stockfish 19'}</strong>
        <small>
          {color === human
            ? color === 'w'
              ? 'White pieces'
              : 'Black pieces'
            : selectedStrength.label}
        </small>
      </span>
      {displayOutcome && <GameOutcomeBadge outcome={displayOutcome} color={color} />}
      {game && !displayOutcome && displayChess.turn() === color && (
        <span className="play-turn-dot" aria-label="Side to move" />
      )}
    </div>
  );

  return (
    <main className="play-stockfish" data-orientation={session.orientation}>
      <header className="play-header">
        <h1>
          <Bot size={22} /> Play Stockfish
        </h1>
        <span className="play-local">
          <Check size={14} /> On your device
        </span>
      </header>
      <div className="play-layout">
        <ModeBoard
          key={study.id}
          board={{
            fen: displayNode.fen,
            orientation: session.orientation,
            lastMove: displayNode.uci,
            marks: displayNode.marks,
            drawingMode,
            drawingColor,
            onMove: move,
            onToggleMark: annotate,
            disabled:
              viewingHistory ||
              !game ||
              !ready ||
              ended ||
              Boolean(engineError) ||
              chess.turn() !== human,
            outcome: displayOutcome,
          }}
          top={player(session.orientation === 'w' ? 'b' : 'w')}
          bottom={player(session.orientation)}
          tools={
            <BoardTools
              mode={drawingMode}
              color={drawingColor}
              onMode={setDrawingMode}
              onColor={setDrawingColor}
              onClear={() => annotate()}
              onFlip={flip}
            />
          }
          caption={
            <span className="play-position-caption">
              {viewingHistory
                ? `History · half-move ${displayPly} of ${study.mainline.length}`
                : `Live game · ${study.mainline.length} half-moves`}
            </span>
          }
        />
        <aside className="play-panel">
          <div className="play-status" role="status" aria-live="polite">
            <div className="play-status-icon">
              {thinking || (!ready && game && !ended && !engineError) ? (
                <LoaderCircle className="spin" size={25} />
              ) : outcome ? (
                <Flag size={25} />
              ) : (
                <Bot size={25} />
              )}
            </div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          {game && !ready && !ended && !engineError && (
            <div className="play-download">
              <span>
                <Download size={14} />
                {load.phase === 'downloading'
                  ? `${(load.loaded / 1048576).toFixed(1)} / ${(load.total / 1048576).toFixed(1)} MB`
                  : 'Starting the local engine'}
              </span>
              {load.phase === 'downloading' && (
                <progress value={progress} max={100} aria-label="Engine download" />
              )}
              <small>Saved for offline play after download.</small>
            </div>
          )}
          {engineError && (
            <div className="play-error" role="alert">
              <p>{engineError}</p>
              <button onClick={() => setRetry((n) => n + 1)}>
                <RotateCcw size={15} /> Retry engine
              </button>
            </div>
          )}
          {storageError && (
            <p className="play-error" role="alert">
              {storageError}
            </p>
          )}
          <div className="play-moves-section">
            <div className="play-section-heading">
              <h3>Moves</h3>
            </div>
            <div className="play-moves" aria-label="Game moves">
              <MoveList study={displayStudy} assessments={{}} onSelect={selectHistory} />
            </div>
          </div>
          <div className="play-actions">
            {viewingHistory && (
              <button className="play-primary play-return-live" onClick={() => navigate('end')}>
                Return to live game <ChevronRight size={17} />
              </button>
            )}
            {ended && onReview && (
              <button
                className="play-primary"
                onClick={() => {
                  engine.current?.dispose();
                  onReview(snapshotForReview(study));
                }}
              >
                Review this game <ChevronRight size={17} />
              </button>
            )}
            <button
              className={ended || !game ? 'play-primary' : 'play-secondary'}
              onClick={() => {
                setDraft(session.settings);
                setSetup(true);
              }}
            >
              <Plus size={17} /> New game
            </button>
            <div className="play-secondary-actions">
              <button onClick={() => setConfirmResign(true)} disabled={!game || ended}>
                <Flag size={15} /> Resign
              </button>
            </div>
          </div>
          <p className="play-footnote">Casual play. No clock, no rating changes.</p>
          <BoardNavigation
            onStart={() => navigate('start')}
            onPrevious={() => navigate('previous')}
            onNext={() => navigate('next')}
            onEnd={() => navigate('end')}
            canPrevious={displayPly > 0}
            canNext={viewingHistory}
          >
            <span>
              {displayPly} / {study.mainline.length}
            </span>
          </BoardNavigation>
        </aside>
      </div>
      {setup && (
        <PlayDialog title="New game" onClose={() => setSetup(false)}>
          <p className="play-dialog-intro">
            Your next opponent is ready. Make it a fair fight or a serious challenge.
          </p>
          <fieldset>
            <legend>Choose your side</legend>
            <div className="play-side-options">
              {(
                [
                  { value: 'w', label: 'White' },
                  { value: 'random', label: 'Random' },
                  { value: 'b', label: 'Black' },
                ] as const
              ).map((side) => (
                <button
                  key={side.value}
                  role="radio"
                  aria-checked={draft.side === side.value}
                  className={draft.side === side.value ? 'is-selected' : ''}
                  onClick={() => setDraft({ ...draft, side: side.value })}
                >
                  {side.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Opponent strength</legend>
            <div className="play-strength-options">
              {strengths.map((strength) => (
                <button
                  key={strength.id}
                  role="radio"
                  aria-checked={draft.strengthId === strength.id}
                  className={draft.strengthId === strength.id ? 'is-selected' : ''}
                  onClick={() => setDraft({ ...draft, strengthId: strength.id })}
                >
                  <strong>{strength.label}</strong>
                  <small>{strength.detail}</small>
                  {draft.strengthId === strength.id && <Check size={16} />}
                </button>
              ))}
            </div>
          </fieldset>
          <p className="play-rating-note">
            Elo targets are approximate, not calibrated human ratings. This lightweight engine and
            short thinking time affect playing strength. Skill 0 is Stockfish’s easiest setting.
          </p>
          {game && !ended && (
            <p className="play-rating-note">Starting a new game replaces this unfinished game.</p>
          )}
          <button className="play-primary" onClick={start}>
            Start game <ChevronRight size={18} />
          </button>
        </PlayDialog>
      )}
      {confirmResign && (
        <PlayDialog title="Resign this game?" onClose={() => setConfirmResign(false)}>
          <p>You can review the game after resigning.</p>
          <button
            className="play-primary"
            onClick={() => {
              const latest = current.current;
              if (latest.game) {
                engine.current?.dispose();
                commit({ ...latest, game: resignGame(latest.game) });
              }
              setConfirmResign(false);
            }}
          >
            Confirm resignation
          </button>
          <button className="play-secondary" onClick={() => setConfirmResign(false)}>
            Keep playing
          </button>
        </PlayDialog>
      )}
    </main>
  );
}
