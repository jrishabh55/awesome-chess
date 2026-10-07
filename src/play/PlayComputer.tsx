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
  Settings,
  AlertTriangle,
} from 'lucide-react';
import { BoardTools } from '../board/BoardTools';
import { BoardNavigation } from '../board/BoardNavigation';
import { useMoveKeyPacing } from '../board/useMoveKeyPacing';
import { ModeBoard } from '../app/ModeBoard';
import { MoveBanner } from '../board/MoveBanner';
import { Chess, type Square } from 'chess.js';
import { OpeningCombobox } from '../training/OpeningCombobox';
import { loadOpeningCatalog, type CatalogOpening } from '../openings/catalog';
import { MoveList } from '../review/MoveList';
import { chessAt, positionAt, createStudy } from '../chess/tree';
import { outcomeAt } from '../chess/outcome';
import type { Color, DrawingColor, Mark, Study } from '../chess/types';
import type { EngineLoadState } from '../engine/prepare-worker';
import { GameOutcomeBadge } from '../ui/GameOutcomeBadge';
import { createComputerEngine, type ComputerEngine } from './computer-engine';
import { opponentFor, opponentKey, opponentLabel, opponentName, readOpponent } from './opponents';
import {
  advanceGame,
  annotateGame,
  createGame,
  changeGameOpponent,
  nextOpeningMove,
  defaultSettings,
  navigateHistory,
  resignGame,
  replayOpening,
  restoreSession,
  serializeSession,
  snapshotForReview,
  strengthFor,
  strengths,
  viewedStudy,
  type PlaySession,
  type PlaySettings,
} from './game';
import { compileOpening, openingPractice } from './openings';
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

export function PlayComputer({
  onReview,
}: {
  onBack?: () => void;
  onReview?: (study: Study) => void;
}) {
  const [session, setSession] = useState(initialSession);
  const current = useRef(session);
  const [setup, setSetup] = useState(!session.game);
  const [editingSettings, setEditingSettings] = useState(false);
  const [catalog, setCatalog] = useState<CatalogOpening[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [draft, setDraft] = useState<PlaySettings>(session.settings);
  const draftOpening = draft.opening
    ? catalog.find(
        (entry) => entry.name === draft.opening!.name && entry.pgn === draft.opening!.pgn,
      ) || null
    : null;
  const [confirmResign, setConfirmResign] = useState(false);
  const [drawingMode, setDrawingMode] = useState<'move' | 'arrow' | 'square'>('move');
  const [drawingColor, setDrawingColor] = useState<DrawingColor>('green');
  const [storageError, setStorageError] = useState('');
  const [load, setLoad] = useState<EngineLoadState>({ phase: 'checking', loaded: 0, total: 0 });
  const [engineError, setEngineError] = useState('');
  const [ready, setReady] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [openingHint, setOpeningHint] = useState(false);
  const [retry, setRetry] = useState(0);
  const engine = useRef<ComputerEngine | null>(null);
  const game = session.game;
  const empty = useMemo(() => createStudy(), []);
  const study = game?.study || empty;
  const displayStudy = useMemo(
    () => (game ? viewedStudy(game, session.viewPly) : empty),
    [game, session.viewPly, empty],
  );
  const displayNode = displayStudy.nodes[displayStudy.selectedId];
  const allowMoveKey = useMoveKeyPacing(`${study.id}:${displayStudy.selectedId}`);
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
  const selectedOpponent = game?.opponent || opponentFor(session.settings);
  const selectedKey = opponentKey(selectedOpponent);
  const selectedLabel = opponentLabel(selectedOpponent);
  const shortName = selectedOpponent.kind === 'maia' ? 'Maia 3' : 'Stockfish';
  const draftOpponent = draft.opponent || opponentFor(draft);
  const validDraft = Boolean(readOpponent(draftOpponent));
  const draftStrengths =
    draftOpponent.kind === 'stockfish' &&
    !strengths.some((strength) => strength.id === draftOpponent.strengthId)
      ? [...strengths, strengthFor(draftOpponent.strengthId)]
      : strengths;
  const practice = useMemo(() => (game ? openingPractice(game) : { kind: 'off' as const }), [game]);
  const departure = useMemo(() => {
    if (!game || practice.kind !== 'diverged') return null;
    const node = study.nodes[study.mainline[practice.departurePly - 1]];
    if (!node?.parentId || !node.uci) return null;
    const before = new Chess(study.nodes[node.parentId].fen);
    const piece = before.get(node.uci.slice(0, 2) as Square)!;
    const move = before.move({
      from: node.uci.slice(0, 2),
      to: node.uci.slice(2, 4),
      promotion: node.uci[4],
    });
    return { piece, move, ply: practice.departurePly };
  }, [game, practice, study]);
  const openingMove = game && !viewingHistory ? nextOpeningMove(game) : null;
  const hintedMove = useMemo(() => {
    if (!openingHint || !openingMove) return null;
    const before = new Chess(chess.fen());
    const piece = before.get(openingMove.slice(0, 2) as Square)!;
    const move = before.move({
      from: openingMove.slice(0, 2),
      to: openingMove.slice(2, 4),
      promotion: openingMove[4],
    });
    return { piece, move };
  }, [openingHint, openingMove, chess]);
  useEffect(() => setOpeningHint(false), [game?.study.selectedId]);
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
    if (!setup || editingSettings) return;
    let active = true;
    setCatalogError('');
    void loadOpeningCatalog()
      .then((entries) => {
        if (active) setCatalog(entries);
      })
      .catch((error) => {
        if (active) setCatalogError(errorText(error));
      });
    return () => {
      active = false;
    };
  }, [setup, editingSettings, catalogRetry]);
  const openSettings = () => {
    setDraft({
      ...session.settings,
      strengthId: game?.strengthId || session.settings.strengthId,
      opponent: selectedOpponent,
    });
    setEditingSettings(Boolean(game));
    setSetup(true);
  };

  useEffect(() => {
    setReady(false);
    setThinking(false);
    setEngineError('');
    if (!game || ended || setup) {
      engine.current?.dispose();
      engine.current = null;
      return;
    }
    let active = true;
    const client = createComputerEngine(game.opponent, (state) => {
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
  }, [game?.study.id, selectedKey, ended, retry, setup]);

  useEffect(() => {
    if (!game || ended || setup || !ready || chess.turn() === human || !engine.current) return;
    const controller = new AbortController();
    const id = game.study.id,
      node = game.study.selectedId;
    const requestedOpponent = opponentKey(game.opponent);
    setThinking(true);
    const scripted = nextOpeningMove(game);
    let openingTimer: ReturnType<typeof setTimeout> | undefined;
    const reply = scripted
      ? new Promise<string>((resolve) => {
          openingTimer = setTimeout(() => resolve(scripted), 550);
        })
      : engine.current.bestMove(positionAt(game.study, node), controller.signal);
    void reply
      .then((move) => {
        const latest = current.current;
        if (
          controller.signal.aborted ||
          latest.game?.study.id !== id ||
          latest.game.study.selectedId !== node ||
          latest.game.study.headers.Result !== '*' ||
          opponentKey(latest.game.opponent) !== requestedOpponent
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
    return () => {
      controller.abort();
      clearTimeout(openingTimer);
    };
  }, [game?.study.id, game?.study.selectedId, selectedKey, ended, ready, human, setup]);

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
      else if (allowMoveKey(event))
        commit(navigateHistory(latest, event.key === 'ArrowLeft' ? 'previous' : 'next'));
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
      setup ||
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
    if (!validDraft) return;
    engine.current?.dispose();
    const opening =
      draft.opening && draft.followOpeningVariations !== false
        ? compileOpening(draft.opening, catalog)
        : draft.opening;
    const next = createGame({ ...draft, opening });
    commit({ game: next, settings: draft, orientation: next.humanColor, viewPly: null });
    setDrawingMode('move');
    setReady(false);
    setSetup(false);
  };
  const replay = () => {
    const latest = current.current;
    if (!latest.game?.opening) return;
    engine.current?.dispose();
    const next = replayOpening(latest.game);
    commit({ ...latest, game: next, viewPly: null });
    setOpeningHint(false);
    setDrawingMode('move');
    setReady(false);
  };
  const applySettings = () => {
    const latest = current.current;
    if (!latest.game || !validDraft) return;
    commit({
      ...latest,
      settings: { ...latest.settings, strengthId: draft.strengthId, opponent: draftOpponent },
      game: changeGameOpponent(latest.game, draftOpponent),
    });
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
          : `${shortName} wins`
      : engineError
        ? 'Engine paused'
        : !ready
          ? load.phase === 'downloading'
            ? `Downloading ${shortName}…`
            : `Preparing ${shortName}…`
          : thinking || chess.turn() !== human
            ? `${shortName} is thinking…`
            : 'Your move';
  const title = viewingHistory ? 'Viewing game history' : liveTitle;
  const subtitle = viewingHistory
    ? `Move ${displayPly} of ${study.mainline.length} · ${liveTitle}`
    : outcome
      ? study.headers.Termination || 'Game complete'
      : game
        ? chess.isCheck()
          ? 'Check — protect your king'
          : `${human === 'w' ? 'White' : 'Black'} · No clock · ${selectedLabel}`
        : 'Choose an opponent and your side.';
  const progress = load.total ? Math.min(100, Math.round((load.loaded / load.total) * 100)) : 0;
  const player = (color: Color) => (
    <div className="play-player">
      <span className={`play-avatar ${color === 'w' ? 'is-white' : 'is-black'}`}>
        {color === human ? <User size={19} /> : <Bot size={20} />}
      </span>
      <span>
        <strong>{color === human ? 'You' : opponentName(selectedOpponent)}</strong>
        <small>
          {color === human ? (color === 'w' ? 'White pieces' : 'Black pieces') : selectedLabel}
        </small>
      </span>
      {displayOutcome && <GameOutcomeBadge outcome={displayOutcome} color={color} />}
      {game && !displayOutcome && displayChess.turn() === color && (
        <span className="play-turn-dot" aria-label="Side to move" />
      )}
    </div>
  );

  return (
    <main
      className="play-stockfish"
      data-orientation={session.orientation}
      data-opponent={selectedOpponent.kind}
    >
      <header className="play-header">
        <h1>
          <Bot size={22} /> Play computer
        </h1>
        <span className="play-local">
          <Check size={14} /> On your device
        </span>
        <button
          className="play-settings-icon"
          title="Game settings"
          aria-label="Game settings"
          onClick={openSettings}
        >
          <Settings size={20} />
        </button>
      </header>
      <div className="play-layout">
        <ModeBoard
          key={study.id}
          header={
            departure && !viewingHistory ? (
              <MoveBanner
                positionKey={`${study.id}:opening-departure:${departure.ply}`}
                square={departure.move.to}
                piece={departure.piece}
                from={departure.move.from}
                to={departure.move.to}
                capture={Boolean(departure.move.captured)}
                text="You left this opening."
                label="Opening left"
                labelIcon={<AlertTriangle size={15} />}
                labelColor="#b85c0b"
                action={{ label: 'Replay opening', onClick: replay }}
              />
            ) : (
              hintedMove &&
              game?.opening && (
                <MoveBanner
                  positionKey={`${study.id}:${study.selectedId}:hint`}
                  square={hintedMove.move.from}
                  piece={hintedMove.piece}
                  from={hintedMove.move.from}
                  to={hintedMove.move.to}
                  capture={Boolean(hintedMove.move.captured)}
                  text={`In this opening, play ${hintedMove.move.san}.`}
                  label="Opening hint"
                />
              )
            )
          }
          board={{
            fen: displayNode.fen,
            orientation: session.orientation,
            lastMove: displayNode.uci,
            marks: displayNode.marks,
            engineMarks: hintedMove
              ? [
                  {
                    kind: 'arrow',
                    from: hintedMove.move.from,
                    to: hintedMove.move.to,
                    color: 'green',
                  },
                ]
              : [],
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
              onSettings={openSettings}
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
            {game?.opening && (
              <p className="play-opening-status">
                <strong title={practice.kind === 'off' ? game.opening.name : practice.name}>
                  {practice.kind === 'off' ? game.opening.name : practice.name}
                </strong>{' '}
                ·{' '}
                {practice.kind === 'following'
                  ? 'Opening practice'
                  : practice.kind === 'diverged'
                    ? 'Opening left · Free play'
                    : 'Opening complete · Free play'}
                {practice.kind === 'diverged' && (
                  <button className="play-opening-replay" onClick={replay}>
                    Replay opening
                  </button>
                )}
              </p>
            )}
            {openingMove && chess.turn() === human && (
              <button
                className="play-opening-hint"
                onClick={() => setOpeningHint((value) => !value)}
              >
                {openingHint ? 'Hide opening move' : 'Show opening move'}
              </button>
            )}
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
                setEditingSettings(false);
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
        <PlayDialog
          title={editingSettings ? 'Game settings' : 'New game'}
          onClose={() => setSetup(false)}
        >
          <p className="play-dialog-intro">
            {editingSettings
              ? 'Change your opponent or strength and continue your current game.'
              : 'Choose your opponent, side, and an optional opening to practice.'}
          </p>
          {!editingSettings && (
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
          )}
          {!editingSettings && (
            <fieldset>
              <legend>Opening practice</legend>
              <OpeningCombobox
                entries={catalog}
                value={draftOpening}
                label="Opening to practice"
                showMoves
                disabled={!catalog.length}
                onChange={(opening) =>
                  setDraft((current) => {
                    const { opening: _, ...rest } = current;
                    return opening
                      ? {
                          ...rest,
                          opening: { name: opening.name, eco: opening.eco, pgn: opening.pgn },
                        }
                      : rest;
                  })
                }
              />
              <label className="play-opening-follow">
                <input
                  type="checkbox"
                  checked={draft.followOpeningVariations !== false}
                  disabled={!draft.opening}
                  onChange={(event) =>
                    setDraft({ ...draft, followOpeningVariations: event.target.checked })
                  }
                />
                Follow opening variations
              </label>
              <p className="play-rating-note">
                Follow your chosen branch to its longest available continuation. Turn off to
                practice only the selected line.
              </p>
              <p className="play-rating-note">
                {draft.opening
                  ? `${draft.opening.pgn} · Your opponent follows matching opening moves, then plays freely. If you leave the opening early, a banner offers to replay it.`
                  : 'Leave this empty for a regular game. In opening practice you play your own moves from the starting position.'}
              </p>
              {catalogError && (
                <p role="alert" className="play-error">
                  {catalogError}
                  <button onClick={() => setCatalogRetry((value) => value + 1)}>
                    Retry opening database
                  </button>
                </p>
              )}
            </fieldset>
          )}
          <fieldset>
            <legend>Opponent</legend>
            <div className="play-opponent-options" role="radiogroup" aria-label="Opponent">
              {(['stockfish', 'maia'] as const).map((kind) => (
                <button
                  key={kind}
                  role="radio"
                  aria-checked={draftOpponent.kind === kind}
                  className={draftOpponent.kind === kind ? 'is-selected' : ''}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      opponent:
                        kind === 'maia'
                          ? { kind: 'maia', rating: 1320 }
                          : { kind: 'stockfish', strengthId: draft.strengthId },
                    })
                  }
                >
                  {kind === 'maia' ? 'Maia' : 'Stockfish'}
                </button>
              ))}
            </div>
          </fieldset>
          {draftOpponent.kind === 'stockfish' ? (
            <>
              <fieldset>
                <legend>Opponent strength</legend>
                <div
                  className="play-strength-options"
                  role="radiogroup"
                  aria-label="Opponent strength"
                >
                  {draftStrengths.map((strength) => (
                    <button
                      key={strength.id}
                      role="radio"
                      aria-checked={draftOpponent.strengthId === strength.id}
                      className={draftOpponent.strengthId === strength.id ? 'is-selected' : ''}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          strengthId: strength.id,
                          opponent: { kind: 'stockfish', strengthId: strength.id },
                        })
                      }
                    >
                      <strong>{strength.label}</strong>
                      <small>{strength.detail}</small>
                      {draftOpponent.strengthId === strength.id && <Check size={16} />}
                    </button>
                  ))}
                </div>
              </fieldset>
              <p className="play-rating-note">
                These are engine difficulty settings. They are not calibrated human ratings.
              </p>
            </>
          ) : (
            <fieldset>
              <label className="play-practice-rating">
                Practice rating
                <input
                  type="number"
                  min={600}
                  max={2600}
                  step={1}
                  value={draftOpponent.rating || ''}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      opponent: { kind: 'maia', rating: Number(event.target.value) },
                    })
                  }
                  aria-describedby="maia-rating-note"
                  aria-invalid={!validDraft}
                />
              </label>
              <p id="maia-rating-note" className="play-rating-note">
                Choose a whole number from 600 to 2600. Maia models human move choices at this
                rating; its playing strength may vary. It downloads about 58 MB the first time, then
                runs locally and works offline.
              </p>
            </fieldset>
          )}
          {!editingSettings && game && !ended && (
            <p className="play-rating-note">Starting a new game replaces this unfinished game.</p>
          )}
          <button
            className="play-primary"
            disabled={!validDraft}
            onClick={editingSettings ? applySettings : start}
          >
            {editingSettings ? 'Apply settings' : 'Start game'} <ChevronRight size={18} />
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
