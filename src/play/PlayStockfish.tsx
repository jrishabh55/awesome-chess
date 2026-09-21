import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowDownUp,
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
import { Board } from '../board/Board';
import { chessAt, positionAt, createStudy } from '../chess/tree';
import { outcomeAt } from '../chess/outcome';
import type { Color, Study } from '../chess/types';
import type { EngineLoadState } from '../engine/prepare-worker';
import { GameOutcomeBadge } from '../ui/GameOutcomeBadge';
import { PlayEngine } from './engine';
import {
  advanceGame,
  createGame,
  defaultSettings,
  resignGame,
  restoreSession,
  serializeSession,
  strengthFor,
  strengths,
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
  onBack,
  onReview,
}: {
  onBack: () => void;
  onReview?: (study: Study) => void;
}) {
  const [session, setSession] = useState(initialSession);
  const current = useRef(session);
  const [setup, setSetup] = useState(!session.game);
  const [draft, setDraft] = useState<PlaySettings>(session.settings);
  const [confirmResign, setConfirmResign] = useState(false);
  const [showMoves, setShowMoves] = useState(false);
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
      if (
        event.key.toLowerCase() !== 'x' ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.repeat ||
        setup ||
        confirmResign ||
        showMoves ||
        (event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]')
      )
        return;
      event.preventDefault();
      const latest = current.current;
      commit({ ...latest, orientation: latest.orientation === 'w' ? 'b' : 'w' });
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [setup, confirmResign, showMoves]);

  const move = (uci: string) => {
    const latest = current.current;
    if (
      !latest.game ||
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
    commit({ game: next, settings: draft, orientation: next.humanColor });
    setReady(false);
    setSetup(false);
  };
  const leave = () => {
    engine.current?.dispose();
    onBack();
  };
  const flip = () => {
    const latest = current.current;
    commit({ ...latest, orientation: latest.orientation === 'w' ? 'b' : 'w' });
  };
  const title = !game
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
  const subtitle = outcome
    ? study.headers.Termination || 'Game complete'
    : game
      ? chess.isCheck()
        ? 'Check — protect your king'
        : `${human === 'w' ? 'White' : 'Black'} · No clock · ${selectedStrength.label}`
      : 'Choose a strength and your side.';
  const progress = load.total ? Math.min(100, Math.round((load.loaded / load.total) * 100)) : 0;
  const movePairs = Array.from({ length: Math.ceil(study.mainline.length / 2) }, (_, i) => ({
    number: i + 1,
    white: study.nodes[study.mainline[i * 2]]?.san,
    black: study.nodes[study.mainline[i * 2 + 1]]?.san,
  }));
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
      {outcome && <GameOutcomeBadge outcome={outcome} color={color} />}
      {game && !ended && chess.turn() === color && (
        <span className="play-turn-dot" aria-label="Side to move" />
      )}
    </div>
  );
  const renderMoves = (all: boolean) => (
    <div className="play-moves" aria-label="Game moves">
      {(all ? movePairs : movePairs.slice(-5)).map((pair) => (
        <div className="play-move-pair" key={pair.number}>
          <span>{pair.number}.</span>
          <strong>{pair.white}</strong>
          <strong>{pair.black || '…'}</strong>
        </div>
      ))}
      {!movePairs.length && <p>Your moves will appear here.</p>}
    </div>
  );

  return (
    <main className="play-stockfish" data-orientation={session.orientation}>
      <header className="play-header">
        <button onClick={leave} className="play-back" aria-label="Back to review">
          <ArrowLeft size={19} />
          <span>Review</span>
        </button>
        <h1>
          <Bot size={22} /> Play Stockfish
        </h1>
        <span className="play-local">
          <Check size={14} /> On your device
        </span>
      </header>
      <div className="play-layout">
        <section className="play-board-area" aria-label="Play chess">
          <div className="play-board-stack">
            {player(session.orientation === 'w' ? 'b' : 'w')}
            <Board
              key={study.id}
              fen={study.nodes[study.selectedId].fen}
              orientation={session.orientation}
              lastMove={study.nodes[study.selectedId].uci}
              marks={[]}
              drawingMode="move"
              drawingColor="green"
              onMove={move}
              onToggleMark={() => {}}
              disabled={!game || !ready || ended || Boolean(engineError) || chess.turn() !== human}
              outcome={outcome}
            />
            {player(session.orientation)}
          </div>
        </section>
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
              {movePairs.length > 5 && (
                <button onClick={() => setShowMoves(true)}>
                  All moves <ChevronRight size={13} />
                </button>
              )}
            </div>
            {renderMoves(false)}
          </div>
          <div className="play-actions">
            {ended && onReview && (
              <button
                className="play-primary"
                onClick={() => {
                  engine.current?.dispose();
                  onReview(study);
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
              <button onClick={flip} title="Flip board (X)">
                <ArrowDownUp size={16} /> Flip <kbd>X</kbd>
              </button>
              <button onClick={() => setConfirmResign(true)} disabled={!game || ended}>
                <Flag size={15} /> Resign
              </button>
            </div>
          </div>
          <p className="play-footnote">Casual play. No clock, no rating changes.</p>
        </aside>
      </div>
      {setup && (
        <PlayDialog title="New game" onClose={() => (game ? setSetup(false) : leave())}>
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
      {showMoves && (
        <PlayDialog title="Game moves" onClose={() => setShowMoves(false)}>
          {renderMoves(true)}
        </PlayDialog>
      )}
    </main>
  );
}
