import { assetUrl } from './asset-url';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Upload,
  Settings2,
  RotateCcw,
  ArrowUpRight,
  ArrowDownUp,
  MousePointer2,
  Square,
  Trash2,
  Pause,
  Play,
  X,
  FolderOpen,
  WifiOff,
  Check,
  ArrowLeft,
  GraduationCap,
  Activity,
  ChartNoAxesCombined,
  ScanLine,
  Eraser,
  PanelLeftClose,
  Flag,
  CheckCircle2,
  Copy,
  Info,
  LoaderCircle,
} from 'lucide-react';
import type { Study, Color, DrawingColor, PositionInput, Mark } from '../chess/types';
import {
  parsePgn,
  exportPgn,
  playMove,
  selectNode,
  toggleMark,
  positionAt,
  pathTo,
} from '../chess/tree';
import { Board } from '../board/Board';
import { useStableEngineMove } from '../board/use-stable-engine-move';
import { samplePgn } from './sample';
import { prepareWorker, type EngineLoadState } from '../engine/prepare-worker';
import { ENGINE_BUILD_ID } from '../engine/build';
import { EngineClient, positionKey } from '../engine/worker-client';
import type { AnalysisResult, EngineFlavor } from '../engine/types';
import { scoreText } from '../engine/uci';
import { assessMove, sanLine } from '../review/classify';
import type { MoveAssessment, Evidence } from '../review/policy';
import { MoveList } from '../review/MoveList';
import { AnalysisPanel } from '../review/AnalysisPanel';
import { ReviewPanel } from '../review/ReviewPanel';
import { CoachCard } from '../coach/CoachCard';
import { keyMoments } from '../coach/explain';
import { startRetry, submitRetry, type RetrySession } from '../retry/session';
import { loadOpenings, identifyOpening } from '../openings/lookup';
import {
  saveStudy,
  listStudies,
  exportBackup,
  parseBackup,
  restoreStudies,
  getPreference,
  setPreference,
  loadAnalysis,
  saveAnalysis,
} from '../storage/studies';
import {
  registerOffline,
  downloadAssetSet,
  isAssetSetReady,
  engineSize,
  activateUpdate,
} from '../offline/download';
import './styles.css';
import './review-sidebar.css';
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
const saveFile = (name: string, text: string, type = 'text/plain') => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
interface Demo {
  position: PositionInput;
  line: string[];
  index: number;
  frames: Evidence['frames'];
}
export default function App() {
  const [study, setStudy] = useState<Study>(() => {
    const s = parsePgn(samplePgn)[0];
    return selectNode(s, s.mainline[17]);
  });
  const [booted, setBooted] = useState(false),
    [library, setLibrary] = useState<Study[]>([]),
    [modal, setModal] = useState<'import' | 'library' | 'settings' | 'scoring' | null>(null),
    [input, setInput] = useState(''),
    [importGames, setImportGames] = useState<Study[]>([]);
  const [tab, setTab] = useState<'review' | 'analysis' | 'openings'>('review'),
    [orientation, setOrientation] = useState<Color>('w'),
    [mode, setMode] = useState<'move' | 'arrow' | 'square'>('move'),
    [drawingColor, setDrawingColor] = useState<DrawingColor>('red');
  const [flavor, setFlavor] = useState<EngineFlavor>('full'),
    [depth, setDepth] = useState(12),
    [infinite, setInfinite] = useState(false),
    [engineOn, setEngineOn] = useState(true),
    [showArrow, setShowArrow] = useState(true),
    [showBadge, setShowBadge] = useState(true),
    [showCoach, setShowCoach] = useState(true),
    [reviewAs, setReviewAs] = useState<'w' | 'b' | 'both'>('both');
  const [result, setResult] = useState<AnalysisResult | null>(null),
    [engineStatus, setEngineStatus] = useState('Loading engine'),
    [assessments, setAssessments] = useState<Record<string, MoveAssessment>>({}),
    [reviewing, setReviewing] = useState(false),
    [reviewCompleted, setReviewCompleted] = useState(0),
    [reviewSpeed, setReviewSpeed] = useState<'quick' | 'deep'>('quick'),
    [engineGeneration, setEngineGeneration] = useState(0),
    [engineLoad, setEngineLoad] = useState<EngineLoadState>({
      phase: 'checking',
      loaded: 0,
      total: 0,
    }),
    [error, setError] = useState(''),
    [savedRevision, setSaved] = useState(''),
    [toast, setToast] = useState('');
  const [openingReady, setOpeningReady] = useState(false),
    [openingError, setOpeningError] = useState(''),
    [demo, setDemo] = useState<Demo | null>(null),
    [retry, setRetry] = useState<RetrySession | null>(null),
    [retryBusy, setRetryBusy] = useState(false),
    [retryAccepted, setRetryAccepted] = useState<boolean | null>(null),
    [autoplay, setAutoplay] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false),
    [downloadProgress, setDownloadProgress] = useState<number | null>(null),
    [downloadSize, setDownloadSize] = useState(0),
    [updateAvailable, setUpdateAvailable] = useState(false),
    [updateStatus, setUpdateStatus] = useState<'idle' | 'saving' | 'activating'>('idle'),
    [updateError, setUpdateError] = useState('');
  const saved =
    savedRevision === `${study.id}:${study.revision}`
      ? 'Saved on this device'
      : savedRevision === 'error'
        ? 'Not saved'
        : 'Saving…';
  const engine = useMemo(
    () =>
      new EngineClient(flavor, async (_url, signal) => {
        return prepareWorker(flavor, signal, (state) => {
          if (!signal.aborted) setEngineLoad(state);
        });
      }),
    [flavor, engineGeneration],
  );
  const engineAbort = useRef<AbortController | null>(null),
    reviewAbort = useRef<AbortController | null>(null),
    retryAbort = useRef<AbortController | null>(null),
    downloadAbort = useRef<AbortController | null>(null);
  const currentStudy = useRef(study);
  currentStudy.current = study;
  const assessmentRef = useRef(assessments);
  assessmentRef.current = assessments;
  const analysisLoaded = useRef(false);
  useEffect(() => () => engine.dispose(), [engine]);
  useEffect(() => {
    let active = true;
    void Promise.all([
      listStudies(),
      getPreference<string>('activeStudy'),
      getPreference<{ flavor: EngineFlavor; depth: number; orientation: Color }>('settings'),
    ])
      .then(([all, id, settings]) => {
        if (!active) return;
        setLibrary(all);
        const s = all.find((x) => x.id === id) || all[0];
        if (s) setStudy(s);
        if (settings) {
          setFlavor(settings.flavor);
          setDepth(settings.depth);
          setOrientation(settings.orientation);
        }
      })
      .catch((e) => setError(`Local storage: ${errorMessage(e)}`))
      .finally(() => {
        if (active) setBooted(true);
      });
    void loadOpenings()
      .then(() => setOpeningReady(true))
      .catch((e) => setOpeningError(errorMessage(e)));
    registerOffline(() => setUpdateAvailable(true));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!booted) return;
    setSaved('');
    const id = study.id,
      revision = study.revision;
    void saveStudy(study)
      .then(() => setPreference('activeStudy', id))
      .then(() => {
        if (currentStudy.current.id === id && currentStudy.current.revision === revision)
          setSaved(`${id}:${revision}`);
      })
      .catch((e) => {
        if (currentStudy.current.id === id) {
          setSaved('error');
          setError(`Could not save: ${errorMessage(e)}. Export a backup or retry.`);
        }
      });
  }, [study, booted]);
  useEffect(() => {
    let active = true;
    if (booted) void setPreference('settings', { flavor, depth, orientation }).catch(() => {});
    setOfflineReady(false);
    void isAssetSetReady(flavor).then((ready) => {
      if (active) setOfflineReady(ready);
    });
    void engineSize(flavor)
      .then((size) => {
        if (active) setDownloadSize(size);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [flavor, depth, orientation, booted, engineLoad.phase === 'ready']);
  useEffect(() => {
    analysisLoaded.current = false;
    setAssessments({});
    const id = study.id;
    void loadAnalysis<{
      flavor: EngineFlavor;
      engineBuild: string;
      records: Record<string, MoveAssessment>;
    }>(id)
      .then((value) => {
        if (
          currentStudy.current.id === id &&
          value?.flavor === flavor &&
          value.engineBuild === ENGINE_BUILD_ID
        )
          setAssessments(value.records);
      })
      .catch(() => {})
      .finally(() => {
        analysisLoaded.current = true;
      });
  }, [study.id, flavor]);
  useEffect(() => {
    if (booted && analysisLoaded.current && Object.keys(assessments).length)
      void saveAnalysis(study.id, {
        flavor,
        engineBuild: ENGINE_BUILD_ID,
        records: assessments,
      }).catch(() => {});
  }, [assessments, booted, study.id, flavor]);
  const storeAssessment = (a: MoveAssessment, id: string) => {
    if (currentStudy.current.id === id) setAssessments((old) => ({ ...old, [a.nodeId]: a }));
  };
  useEffect(() => {
    if (!booted || !openingReady || !engineOn || retry || demo || reviewing) return;
    const abort = new AbortController();
    engineAbort.current = abort;
    const s = study,
      node = s.selectedId;
    setResult(null);
    setEngineStatus('Analyzing');
    void (async () => {
      try {
        const r = await engine.analyze(
          {
            id: `interactive:${s.id}:${node}`,
            position: positionAt(s, node),
            budget: infinite ? { kind: 'infinite' } : { kind: 'depth', depth },
            multiPv: 3,
          },
          abort.signal,
          (partial) => {
            if (!abort.signal.aborted) {
              setResult(partial);
              setEngineLoad({ phase: 'ready', loaded: 0, total: 0 });
            }
          },
        );
        if (abort.signal.aborted) return;
        setResult(r);
        setEngineStatus('Ready');
        setEngineLoad({ phase: 'ready', loaded: 0, total: 0 });
        const existing = assessmentRef.current[node];
        if (
          node !== s.rootId &&
          (!existing || (existing.depth < depth && existing.reviewProfile !== `quick:${depth}`)) &&
          !reviewing
        ) {
          const a = await assessMove(s, node, engine, abort.signal, depth, 'interactive', 'quick');
          if (!abort.signal.aborted) storeAssessment(a, s.id);
        }
      } catch (e) {
        if (!abort.signal.aborted) {
          setEngineStatus('Unavailable');
          setEngineLoad({ phase: 'error', loaded: 0, total: 0, error: errorMessage(e) });
          setError(errorMessage(e));
        }
      }
    })();
    return () => abort.abort();
  }, [
    study.id,
    study.selectedId,
    engine,
    depth,
    booted,
    openingReady,
    engineOn,
    infinite,
    retry !== null,
    demo !== null,
    reviewing,
  ]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(timer);
  }, [toast]);
  const navigate = (id: string) => {
    setAutoplay(false);
    setDemo(null);
    retryAbort.current?.abort();
    setRetry(null);
    setStudy((s) => selectNode(s, id));
  };
  const step = (direction: number) => {
    if (demo) {
      setDemo((d) =>
        d ? { ...d, index: Math.max(0, Math.min(d.line.length, d.index + direction)) } : null,
      );
      return;
    }
    const s = currentStudy.current;
    const id =
      direction < 0
        ? s.nodes[s.selectedId].parentId
        : s.selectedChildren[s.selectedId] || s.nodes[s.selectedId].children[0];
    if (id) setStudy(selectNode(s, id));
    else setAutoplay(false);
  };
  useEffect(() => {
    if (!autoplay) return;
    const timer = setInterval(() => step(1), 900);
    return () => clearInterval(timer);
  }, [autoplay, demo]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (
        (e.target instanceof HTMLElement &&
          (e.target.closest('input,textarea') || e.target.isContentEditable)) ||
        modal ||
        retry
      )
        return;
      e.preventDefault();
      setAutoplay(false);
      step(e.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [modal, retry, demo]);
  const loadStudy = (s: Study) => {
    engineAbort.current?.abort();
    reviewAbort.current?.abort();
    retryAbort.current?.abort();
    setReviewing(false);
    setDemo(null);
    setRetry(null);
    setAutoplay(false);
    setStudy(s);
    setModal(null);
    setError('');
    setInput('');
    setImportGames([]);
  };
  const importInput = async (text = input) => {
    try {
      if (text.trim().startsWith('{')) {
        const games = await restoreStudies(parseBackup(text));
        if (!games.length) throw Error('This backup contains no studies.');
        loadStudy(games[0]);
        setLibrary(await listStudies());
        setToast(`Restored ${games.length} studies. Existing games were preserved.`);
      } else {
        const games = parsePgn(text);
        if (games.length === 1) loadStudy(games[0]);
        else setImportGames(games);
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const runReview = async () => {
    reviewAbort.current?.abort();
    engineAbort.current?.abort();
    setInfinite(false);
    setRetry(null);
    setDemo(null);
    setError('');
    const abort = new AbortController();
    reviewAbort.current = abort;
    const s = currentStudy.current;
    setReviewing(true);
    setReviewCompleted(0);
    const profile = `${reviewSpeed}:${depth}`;
    const force = s.mainline.every((id) => assessmentRef.current[id]?.reviewProfile === profile);
    try {
      await loadOpenings();
      for (const [index, id] of s.mainline.entries()) {
        if (abort.signal.aborted) break;
        if (!force && assessmentRef.current[id]?.reviewProfile === profile) {
          setReviewCompleted(index + 1);
          continue;
        }
        const a = await assessMove(s, id, engine, abort.signal, depth, 'review', reviewSpeed);
        a.reviewProfile = profile;
        if (!abort.signal.aborted) setEngineLoad({ phase: 'ready', loaded: 0, total: 0 });
        if (!abort.signal.aborted) {
          storeAssessment(a, s.id);
          setReviewCompleted(index + 1);
        }
      }
    } catch (e) {
      if (!abort.signal.aborted) {
        setError(errorMessage(e));
        setEngineStatus('Unavailable');
        setEngineLoad({ phase: 'error', loaded: 0, total: 0, error: errorMessage(e) });
      }
    } finally {
      if (reviewAbort.current === abort) setReviewing(false);
    }
  };
  const onMove = async (uci: string) => {
    setError('');
    if (retry) {
      if (retryBusy) return;
      const abort = new AbortController();
      retryAbort.current?.abort();
      retryAbort.current = abort;
      setRetryBusy(true);
      try {
        const feedback = await submitRetry(retry, uci, engine, abort.signal, depth);
        if (!abort.signal.aborted) {
          setRetry((r) =>
            r ? { ...r, attempt: feedback.attempt, feedback: feedback.feedback } : null,
          );
          setRetryAccepted(feedback.accepted);
        }
      } catch (e) {
        if (!abort.signal.aborted) setError(errorMessage(e));
      } finally {
        if (retryAbort.current === abort) setRetryBusy(false);
      }
      return;
    }
    if (demo) {
      setToast('Return to the game to play your own continuation.');
      return;
    }
    try {
      setStudy((s) => playMove(s, s.selectedId, uci));
      setTab('analysis');
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const retryReply = async () => {
    if (!retry?.attempt || retryBusy) return;
    const attempt = retry.attempt;
    const abort = new AbortController();
    retryAbort.current?.abort();
    retryAbort.current = abort;
    setRetryBusy(true);
    try {
      const reply = await engine.analyze(
        {
          id: `interactive-reply:${attempt.id}`,
          position: positionAt(attempt, attempt.selectedId),
          budget: { kind: 'depth', depth },
          multiPv: 1,
        },
        abort.signal,
      );
      const move = reply.lines[0]?.pv[0];
      if (move && !abort.signal.aborted)
        setRetry((r) =>
          r ? { ...r, attempt: playMove(attempt, attempt.selectedId, move) } : null,
        );
      else if (!move) setToast('This continuation has reached a terminal position.');
    } catch (e) {
      if (!abort.signal.aborted) setError(errorMessage(e));
    } finally {
      if (retryAbort.current === abort) setRetryBusy(false);
    }
  };
  const insertLine = (line: string[]) => {
    try {
      let s = currentStudy.current;
      for (const uci of line) s = playMove(s, s.selectedId, uci);
      setStudy(s);
      setTab('analysis');
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const selectedAssessment = assessments[study.selectedId];
  const opening = openingReady ? identifyOpening(study, study.selectedId) : null;
  const showDemo = (e?: Evidence) => {
    if (!selectedAssessment) return;
    const root = e?.root || positionAt(study, study.nodes[study.selectedId].parentId!);
    setDemo({
      position: root,
      line: e?.line || selectedAssessment.bestLine,
      index: 0,
      frames: e?.frames || [],
    });
    setAutoplay(false);
  };
  const beginRetry = () => {
    setAutoplay(false);
    setDemo(null);
    setRetry(startRetry(study, study.selectedId));
    setRetryAccepted(null);
    engineAbort.current?.abort();
  };
  const jumpMoment = (delta: number) => {
    const moments = keyMoments(study, assessments, reviewAs);
    if (!moments.length) {
      setToast('Run a review to find the key moments.');
      return;
    }
    const index = moments.indexOf(study.selectedId);
    navigate(moments[(index + delta + moments.length) % moments.length]);
  };
  let displayFen = study.nodes[study.selectedId].fen;
  let lastMove = study.nodes[study.selectedId].uci;
  let coachMarks: Mark[] = [];
  if (retry) {
    displayFen = retry.attempt
      ? retry.attempt.nodes[retry.attempt.selectedId].fen
      : retry.study.nodes[retry.parentId].fen;
    lastMove = retry.attempt?.nodes[retry.attempt.selectedId].uci || null;
    if (retry.revealed && !retry.attempt) {
      const best = assessments[retry.originId]?.bestUci;
      if (best)
        coachMarks = [
          {
            kind: 'arrow',
            from: best.slice(0, 2) as any,
            to: best.slice(2, 4) as any,
            color: 'green',
          },
        ];
    }
  }
  if (demo) {
    const c = new Chess(demo.position.rootFen);
    for (const m of [...demo.position.moves, ...demo.line.slice(0, demo.index)])
      try {
        c.move(m);
      } catch {
        break;
      }
    displayFen = c.fen();
    lastMove = demo.index ? demo.line[demo.index - 1] : null;
    coachMarks = demo.frames.find((f) => f.ply === demo.index)?.marks || [];
  }
  const currentPositionKey = positionKey(
    positionAt(study, study.selectedId),
    engine.engineId,
    `${flavor}:full-strength`,
  );
  const displayResult = result?.positionKey === currentPositionKey ? result : null;
  const hideHints = Boolean(retry && !retry.revealed);
  const bestMove = useStableEngineMove(
    JSON.stringify([
      study.id,
      study.selectedId,
      currentPositionKey,
      depth,
      engineGeneration,
      infinite,
    ]),
    displayResult?.lines[0]?.pv[0],
    engineOn && showArrow && !retry && !demo && !reviewing && engineLoad.phase !== 'error',
  );
  const engineMarks: Mark[] =
    showArrow && bestMove && !retry && !demo
      ? [
          {
            kind: 'arrow',
            from: bestMove.slice(0, 2) as any,
            to: bestMove.slice(2, 4) as any,
            color: 'green',
          },
        ]
      : [];
  const evalScore = displayResult?.lines[0]?.score;
  const evalCp =
    evalScore?.kind === 'mate' ? (evalScore.winner === 'w' ? 1800 : -1800) : evalScore?.value || 0;
  const whitePercent = 50 + 45 * Math.tanh(evalCp / 550);
  const bottom = orientation,
    top = orientation === 'w' ? 'b' : 'w';
  const player = (color: Color) => (
    <div className="player-row">
      <div className={`player-avatar ${color}`}>
        <img src={assetUrl(`assets/pieces/${color}K.svg`)} alt="" />
      </div>
      <div className="player-info">
        <strong>
          {study.headers[color === 'w' ? 'White' : 'Black'] ||
            `${color === 'w' ? 'White' : 'Black'} player`}
        </strong>
        <span>
          {study.headers[color === 'w' ? 'WhiteElo' : 'BlackElo'] || 'Unrated'} <i />{' '}
          {color === 'w' ? 'White pieces' : 'Black pieces'}
        </span>
      </div>
      <span className="player-result">
        {study.headers.Result && study.headers.Result !== '*'
          ? study.headers.Result
          : displayFen.split(' ')[1] === color
            ? 'To move'
            : 'Analysis'}
      </span>
    </div>
  );
  const saveAndUpdate = async () => {
    if (updateStatus !== 'idle') return;
    setUpdateError('');
    setUpdateStatus('saving');
    const snapshot = currentStudy.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all([
          saveStudy(snapshot),
          setPreference('activeStudy', snapshot.id),
          ...(analysisLoaded.current && Object.keys(assessmentRef.current).length > 0
            ? [
                saveAnalysis(snapshot.id, {
                  flavor,
                  engineBuild: ENGINE_BUILD_ID,
                  records: assessmentRef.current,
                }),
              ]
            : []),
        ]),
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                Error('Saving is taking too long. Please retry; the update has not been applied.'),
              ),
            10000,
          );
        }),
      ]);
      clearTimeout(timer);
      setUpdateStatus('activating');
      await activateUpdate();
    } catch (error) {
      setUpdateError(errorMessage(error));
      setUpdateStatus('idle');
    } finally {
      clearTimeout(timer);
    }
  };
  const clearMarks = () =>
    setStudy((s) => {
      if (demo || retry || !s.nodes[s.selectedId].marks.length) return s;
      const copy = structuredClone(s);
      copy.nodes[copy.selectedId].marks = [];
      copy.revision++;
      return copy;
    });
  const retryEngine = () => {
    reviewAbort.current?.abort();
    setReviewing(false);
    setError('');
    setEngineStatus('Loading engine');
    setEngineLoad({ phase: 'checking', loaded: 0, total: 0 });
    setEngineOn(true);
    setEngineGeneration((n) => n + 1);
  };
  const downloadOffline = async () => {
    const abort = new AbortController();
    downloadAbort.current = abort;
    setDownloadProgress(0);
    setError('');
    try {
      await downloadAssetSet(flavor, abort.signal, (n, total) =>
        setDownloadProgress((n / total) * 100),
      );
      setOfflineReady(true);
      setToast('Engine verified and ready offline.');
    } catch (e) {
      if (!abort.signal.aborted) setError(errorMessage(e));
    } finally {
      setDownloadProgress(null);
    }
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand-mark" href="#" aria-label="Chess Room home">
          <img src={assetUrl('assets/icon.svg')} alt="" />
        </a>
        <div className="nav-items">
          <button
            className="nav-item selected"
            title="Game review"
            aria-label="Game review"
            onClick={() => setTab('review')}
          >
            <ChartNoAxesCombined size={23} />
            <span>Review</span>
          </button>
          <button className="nav-item" title="Analysis" onClick={() => setTab('analysis')}>
            <MousePointer2 size={22} />
            <span>Analyze</span>
          </button>
          <button className="nav-item" title="Openings" onClick={() => setTab('openings')}>
            <BookOpen size={22} />
            <span>Openings</span>
          </button>
          <button
            className="nav-item"
            title="Saved games"
            onClick={() => {
              void listStudies().then(setLibrary);
              setModal('library');
            }}
          >
            <FolderOpen size={22} />
            <span>Library</span>
          </button>
        </div>
        <div className="sidebar-bottom">
          <button className="nav-item" title="Settings" onClick={() => setModal('settings')}>
            <Settings2 size={21} />
            <span>Settings</span>
          </button>
          <div className="local-avatar">YOU</div>
        </div>
      </aside>
      <main>
        <header className="page-header">
          <div>
            <div className="breadcrumb">
              CHESS ROOM <span>/</span> YOUR PERSONAL ANALYSIS SPACE
            </div>
            <h1>
              Game review<span className="beta-tag">LOCAL FIRST</span>
            </h1>
          </div>
          <button
            className="import-button"
            onClick={() => {
              setModal('import');
              setError('');
            }}
          >
            <Upload size={17} />
            Import game
          </button>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button aria-label="Dismiss error" onClick={() => setError('')}>
              <X size={17} />
            </button>
          </div>
        )}
        {updateAvailable && (
          <div className="update-banner" role="status" aria-live="polite">
            <div>
              <span>
                {updateStatus === 'saving'
                  ? 'Saving your game…'
                  : updateStatus === 'activating'
                    ? 'Applying update… The app will reload.'
                    : 'An update is ready.'}
              </span>
              {updateError && (
                <p className="update-error" role="alert">
                  {updateError}
                </p>
              )}
            </div>
            <button onClick={saveAndUpdate} disabled={updateStatus !== 'idle'}>
              {updateStatus !== 'idle' && <LoaderCircle size={15} className="spin" />}
              {updateStatus === 'saving'
                ? 'Saving…'
                : updateStatus === 'activating'
                  ? 'Updating…'
                  : updateError
                    ? 'Retry update'
                    : 'Save & update'}
            </button>
          </div>
        )}
        <div className="workspace">
          <section className="board-column">
            <div className="game-context">
              <span>
                <span className="live-dot" />
                {study.headers.Event || 'Personal study'}
              </span>
              <span>
                {study.headers.Site || 'Local game'}
                {study.headers.Date ? ' · ' + study.headers.Date.slice(0, 4) : ''}
              </span>
            </div>
            {player(top)}
            <div className="board-with-eval">
              <div
                className="evaluation-bar"
                aria-label={hideHints ? 'Evaluation hidden' : `Evaluation ${scoreText(evalScore)}`}
              >
                <div
                  className="eval-white"
                  style={{
                    height: `${hideHints ? 50 : whitePercent}%`,
                    ...(orientation === 'b' ? { top: 0, bottom: 'auto' } : {}),
                  }}
                />
                <span className={evalCp >= 0 ? 'positive' : 'negative'}>
                  {hideHints ? '?' : scoreText(evalScore)}
                </span>
              </div>
              <Board
                fen={displayFen}
                orientation={orientation}
                lastMove={lastMove}
                marks={demo || retry ? [] : study.nodes[study.selectedId].marks}
                engineMarks={engineMarks}
                coachMarks={coachMarks}
                onMove={onMove}
                onToggleMark={(m) => {
                  if (!demo && !retry) setStudy((s) => toggleMark(s, s.selectedId, m));
                }}
                drawingMode={mode}
                drawingColor={drawingColor}
                disabled={retryBusy || Boolean(demo)}
                badge={showBadge && !demo && !retry ? selectedAssessment?.primary : undefined}
                hideHints={hideHints}
              />
            </div>
            {player(bottom)}
            <div className="board-controls">
              <div className="annotation-tools">
                <button
                  title="Move pieces"
                  aria-label="Move pieces"
                  className={mode === 'move' ? 'active' : ''}
                  onClick={() => setMode('move')}
                >
                  <MousePointer2 size={18} />
                </button>
                <button
                  title="Draw arrows"
                  aria-label="Draw arrows"
                  className={mode === 'arrow' ? 'active' : ''}
                  onClick={() => setMode('arrow')}
                >
                  <ArrowUpRight size={21} />
                </button>
                <button
                  title="Highlight squares"
                  aria-label="Highlight squares"
                  className={mode === 'square' ? 'active' : ''}
                  onClick={() => setMode('square')}
                >
                  <Square size={17} />
                </button>
                <div className="tool-divider" />
                {(['red', 'orange', 'green', 'blue'] as DrawingColor[]).map((c) => (
                  <button
                    className={`color-dot ${c} ${drawingColor === c ? 'chosen' : ''}`}
                    key={c}
                    aria-label={`${c} annotations`}
                    onClick={() => setDrawingColor(c)}
                  />
                ))}
                <button
                  title="Clear annotations"
                  aria-label="Clear annotations"
                  onClick={clearMarks}
                >
                  <Eraser size={18} />
                </button>
              </div>
              <div className="board-utility">
                <button
                  title="Flip board"
                  aria-label="Flip board"
                  onClick={() => setOrientation((c) => (c === 'w' ? 'b' : 'w'))}
                >
                  <ArrowDownUp size={18} />
                </button>
                <button
                  title="Board settings"
                  aria-label="Board settings"
                  onClick={() => setModal('settings')}
                >
                  <Settings2 size={18} />
                </button>
              </div>
            </div>
            <div className="board-caption">
              <span>Right-click / drag: red · Ctrl: orange · Shift: green</span>
              <span>
                <Check size={12} />
                {saved}
              </span>
            </div>
            {demo && (
              <div className="exploration-banner">
                <div>
                  <strong>Explore the idea</strong>
                  <span>
                    {demo.index}/{demo.line.length} moves · {sanLine(demo.position, demo.line, 8)}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setDemo(null);
                    setAutoplay(false);
                  }}
                >
                  <ArrowLeft size={15} />
                  Return to game
                </button>
              </div>
            )}
            {!demo &&
              !retry &&
              !study.mainline.includes(study.selectedId) &&
              study.selectedId !== study.rootId && (
                <div className="exploration-banner">
                  <div>
                    <strong>Sideline</strong>
                    <span>Your original game is preserved.</span>
                  </div>
                  <button onClick={() => navigate(study.explorationOrigin || study.rootId)}>
                    <ArrowLeft size={15} />
                    Return to game
                  </button>
                </div>
              )}
            {retry && (
              <div className="retry-card">
                <div className="section-heading">
                  <span>TRY AGAIN</span>
                  <button
                    className="text-button"
                    onClick={() => {
                      retryAbort.current?.abort();
                      setRetry(null);
                      setRetryBusy(false);
                    }}
                  >
                    Exit retry
                    <X size={14} />
                  </button>
                </div>
                <h3>
                  {retryBusy
                    ? 'Checking your move…'
                    : retryAccepted === true
                      ? 'That’s a strong continuation!'
                      : retryAccepted === false
                        ? 'There’s a better move here.'
                        : 'Can you find a better move?'}
                </h3>
                <p>
                  {retry.feedback
                    ? `${retry.feedback.primary} · ${retry.hints || retry.revealed ? 'Assisted attempt' : 'Unaided attempt'}`
                    : 'Play your choice on the board. The engine’s answer is hidden.'}
                </p>
                <div className="coach-actions">
                  <button
                    className="secondary"
                    onClick={() => {
                      setRetry((r) => (r ? { ...r, attempt: null, feedback: null } : null));
                      setRetryAccepted(null);
                    }}
                  >
                    Try again
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      setRetry((r) => (r ? { ...r, hints: r.hints + 1 } : null));
                      const best = assessments[retry.originId]?.bestUci;
                      setToast(
                        best
                          ? `Look for a move with the piece on ${best.slice(0, 2)}.`
                          : 'Look for forcing moves: checks, captures, and threats.',
                      );
                    }}
                  >
                    Hint
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setRetry((r) => (r ? { ...r, revealed: true } : null))}
                  >
                    Reveal best move
                  </button>
                  {retry.attempt && (
                    <button className="text-button" disabled={retryBusy} onClick={retryReply}>
                      Play engine reply
                    </button>
                  )}
                  {retry.attempt && (
                    <button
                      className="text-button"
                      onClick={() => {
                        setStudy(retry.attempt!);
                        setRetry(null);
                        setTab('analysis');
                      }}
                    >
                      Save as sideline
                      <ArrowUpRight size={15} />
                    </button>
                  )}
                </div>
              </div>
            )}
            {!retry && !demo && showCoach && selectedAssessment && (
              <CoachCard
                assessment={selectedAssessment}
                san={study.nodes[study.selectedId].san || ''}
                onRetry={beginRetry}
                onShow={showDemo}
                onNext={() => jumpMoment(1)}
                onPrevious={() => jumpMoment(-1)}
              />
            )}
          </section>
          <section className="analysis-column">
            <div className="panel-tabs" role="tablist">
              {(['review', 'analysis', 'openings'] as const).map((t) => (
                <button
                  role="tab"
                  aria-selected={tab === t}
                  className={tab === t ? 'active' : ''}
                  key={t}
                  onClick={() => setTab(t)}
                >
                  {t === 'review' ? (
                    <ChartNoAxesCombined size={17} />
                  ) : t === 'analysis' ? (
                    <ScanLine size={17} />
                  ) : (
                    <BookOpen size={17} />
                  )}{' '}
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <div className="engine-status">
              <button
                className={`switch ${engineOn ? 'on' : ''}`}
                role="switch"
                aria-checked={engineOn}
                aria-label="Engine analysis"
                onClick={() => setEngineOn((v) => !v)}
              >
                <span />
              </button>
              <span>
                Stockfish 19 <small>{flavor === 'lite' ? 'Lite' : 'NNUE'}</small>
              </span>
              <div className="engine-health">
                <span className={engineStatus === 'Unavailable' ? 'bad-dot' : 'live-dot'} />
                {reviewing
                  ? 'Reviewing'
                  : engineOn
                    ? engineLoad.phase === 'downloading'
                      ? 'Downloading'
                      : engineLoad.phase === 'starting'
                        ? 'Starting'
                        : engineStatus
                    : 'Paused'}
              </div>
              <button
                className="icon-button"
                title="Engine settings"
                aria-label="Engine settings"
                onClick={() => setModal('settings')}
              >
                <Settings2 size={16} />
              </button>
            </div>
            {engineLoad.phase !== 'ready' && (engineOn || reviewing) && (
              <div className={`engine-loader ${engineLoad.phase}`} role="status" aria-live="polite">
                <div className="engine-loader-title">
                  {engineLoad.phase === 'error' ? (
                    <Info size={18} />
                  ) : (
                    <LoaderCircle className="spin" size={18} />
                  )}
                  <strong>
                    {engineLoad.phase === 'error'
                      ? 'Engine could not start'
                      : engineLoad.phase === 'downloading'
                        ? engineLoad.loaded === engineLoad.total
                          ? 'Verifying engine…'
                          : 'Downloading Stockfish…'
                        : engineLoad.phase === 'starting'
                          ? 'Starting Stockfish…'
                          : 'Preparing Stockfish…'}
                  </strong>
                  {engineLoad.total > 0 && (
                    <span>{Math.round((engineLoad.loaded / engineLoad.total) * 100)}%</span>
                  )}
                </div>
                {engineLoad.total > 0 && (
                  <>
                    <progress
                      aria-label="Engine download progress"
                      value={engineLoad.loaded}
                      max={engineLoad.total}
                    />
                    <small>
                      {(engineLoad.loaded / 1048576).toFixed(1)} /{' '}
                      {(engineLoad.total / 1048576).toFixed(1)} MB · Saved for future visits
                    </small>
                  </>
                )}
                {engineLoad.phase === 'error' ? (
                  <>
                    <p>{engineLoad.error}</p>
                    <button className="secondary" onClick={retryEngine}>
                      <RotateCcw size={15} /> Retry engine
                    </button>
                  </>
                ) : (
                  <p>You can explore the board while the engine loads.</p>
                )}
                {flavor === 'full' && engineLoad.phase !== 'starting' && (
                  <button
                    className="text-button"
                    onClick={() => {
                      reviewAbort.current?.abort();
                      setReviewing(false);
                      setError('');
                      setFlavor('lite');
                    }}
                  >
                    Use Lite · smaller download
                  </button>
                )}
              </div>
            )}
            <div className="moves-heading">
              <span className="current-opening">
                <BookOpen size={18} />
                {opening?.name ||
                  (study.selectedId === study.rootId ? 'Starting position' : 'Game moves')}
              </span>
              <span>
                {study.mainline.length
                  ? `${Math.ceil(study.mainline.length / 2)} moves`
                  : 'New position'}
                {opening && <b>{opening.eco}</b>}
              </span>
            </div>
            <MoveList
              study={study}
              assessments={assessments}
              onSelect={navigate}
              hidden={Boolean(retry)}
            />
            <div className="panel-body">
              {tab === 'review' && !retry ? (
                <ReviewPanel
                  study={study}
                  assessments={assessments}
                  reviewing={reviewing}
                  completed={reviewCompleted}
                  speed={reviewSpeed}
                  onSpeed={setReviewSpeed}
                  onReview={runReview}
                  onStop={() => {
                    reviewAbort.current?.abort();
                    setReviewing(false);
                  }}
                  onSelect={navigate}
                  onGuide={() => {
                    setShowCoach(true);
                    const id = keyMoments(study, assessments, reviewAs)[0];
                    if (id) navigate(id);
                  }}
                />
              ) : tab === 'openings' && !retry ? (
                <div className="opening-panel">
                  <div className="opening-icon">
                    <BookOpen size={30} />
                  </div>
                  <span className="eyebrow">KNOW YOUR OPENING</span>
                  <h2>{opening?.name.split(':')[0] || 'Every game begins with an idea.'}</h2>
                  {opening?.name.includes(':') && (
                    <p className="opening-variation">
                      {opening.name.split(':').slice(1).join(':').trim()}
                    </p>
                  )}
                  <div className="opening-tags">
                    {opening && <span>{opening.eco}</span>}
                    <span>Local opening database</span>
                  </div>
                  <p>
                    {opening
                      ? `Recognized ${opening.exact ? 'at this position' : 'earlier in this line'}. Explore the moves on the board to see how the opening develops.`
                      : openingError ||
                        'Play opening moves or import a game to discover its opening and variation.'}
                  </p>
                  {opening && (
                    <button className="secondary wide" onClick={() => navigate(opening.nodeId)}>
                      Jump to recognized position
                      <ChevronRight size={16} />
                    </button>
                  )}
                  <div className="opening-note">
                    <GraduationCap size={22} />
                    <div>
                      <strong>Build understanding, move by move.</strong>
                      <p>
                        Explore a different response on the board. Opening recognition follows your
                        sideline too.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <AnalysisPanel
                  result={displayResult}
                  position={positionAt(study, study.selectedId)}
                  assessment={selectedAssessment}
                  study={study}
                  onInsert={insertLine}
                  hidden={Boolean(retry)}
                />
              )}
            </div>
            <div className="transport">
              <button
                aria-label="Go to start"
                onClick={() => (demo ? setDemo({ ...demo, index: 0 }) : navigate(study.rootId))}
                disabled={Boolean(retry)}
              >
                <ChevronsLeft size={23} />
              </button>
              <button aria-label="Previous move" onClick={() => step(-1)} disabled={Boolean(retry)}>
                <ChevronLeft size={25} />
              </button>
              <button
                aria-label={autoplay ? 'Pause playback' : 'Play moves'}
                className="play-button"
                onClick={() => setAutoplay((v) => !v)}
                disabled={Boolean(retry)}
              >
                {autoplay ? <Pause size={21} /> : <Play size={21} fill="currentColor" />}
              </button>
              <button aria-label="Next move" onClick={() => step(1)} disabled={Boolean(retry)}>
                <ChevronRight size={25} />
              </button>
              <button
                aria-label="Go to end"
                onClick={() =>
                  demo
                    ? setDemo({ ...demo, index: demo.line.length })
                    : navigate(study.mainline.at(-1) || study.rootId)
                }
                disabled={Boolean(retry)}
              >
                <ChevronsRight size={23} />
              </button>
            </div>
            <div className="panel-footer">
              <button onClick={() => saveFile('chess-room.pgn', exportPgn(study))}>
                <Download size={14} />
                Export PGN
              </button>
              <button onClick={() => setModal('scoring')}>
                <Info size={14} />
                How we score
              </button>
            </div>
          </section>
        </div>
        <footer className="page-footer">
          <span>
            <span className="live-dot" />
            Your games stay yours.
          </span>
          <span>Stockfish 19 · Open-source engine · No review limits</span>
        </footer>
      </main>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {toast}
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === 'import'
                ? 'Import game'
                : modal === 'settings'
                  ? 'Settings'
                  : modal === 'library'
                    ? 'Game library'
                    : 'Scoring details'
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>
                {modal === 'import'
                  ? 'Bring your game.'
                  : modal === 'settings'
                    ? 'Make it your room.'
                    : modal === 'library'
                      ? 'Your game library'
                      : 'Transparent by design.'}
              </h2>
              <button aria-label="Close dialog" onClick={() => setModal(null)}>
                <X size={22} />
              </button>
            </div>
            {modal === 'import' && (
              <>
                <p>Paste a PGN game or FEN position. Your analysis stays on this device.</p>
                <textarea
                  aria-label="PGN or FEN"
                  placeholder={'[White "You"]\n[Black "Opponent"]\n\n1. e4 e5 2. Nf3 Nc6…'}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
                <div className="modal-actions">
                  <label className="secondary file-button">
                    <Upload size={16} />
                    Choose file
                    <input
                      type="file"
                      accept=".pgn,.txt,.json"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file)
                          void file
                            .text()
                            .then((text) => {
                              setInput(text);
                              importInput(text);
                            })
                            .catch((e) => setError(errorMessage(e)));
                      }}
                    />
                  </label>
                  <button className="primary" onClick={() => importInput()}>
                    Import & explore
                    <ChevronRight size={17} />
                  </button>
                </div>
                {importGames.map((s, i) => (
                  <button className="library-item" key={s.id} onClick={() => loadStudy(s)}>
                    {i + 1}. {s.headers.White || 'White'} vs {s.headers.Black || 'Black'}
                    <ChevronRight size={17} />
                  </button>
                ))}
              </>
            )}
            {modal === 'library' && (
              <>
                <p>Saved automatically, available only on this device.</p>
                {library.map((s) => (
                  <button className="library-item" key={s.id} onClick={() => loadStudy(s)}>
                    <div>
                      <strong>
                        {s.headers.White || 'White'} vs {s.headers.Black || 'Black'}
                      </strong>
                      <small>
                        {s.headers.Event || 'Personal study'} · {s.mainline.length} plies
                      </small>
                    </div>
                    <ChevronRight size={17} />
                  </button>
                ))}
                {!library.length && <p>No saved games yet.</p>}
                <div className="modal-actions">
                  <button
                    className="secondary"
                    onClick={() => {
                      void listStudies().then((all) =>
                        saveFile('chess-room-backup.json', exportBackup(all), 'application/json'),
                      );
                    }}
                  >
                    <Download size={16} />
                    Backup all games
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      const s = parsePgn(samplePgn)[0];
                      s.selectedId = s.mainline[17];
                      loadStudy(s);
                    }}
                  >
                    Open sample game
                  </button>
                </div>
              </>
            )}
            {modal === 'settings' && (
              <>
                <div className="setting-row">
                  <div>
                    <strong>Engine</strong>
                    <small>Full strength or a smaller, faster download</small>
                  </div>
                  <select
                    aria-label="Engine build"
                    disabled={downloadProgress !== null}
                    value={flavor}
                    onChange={(e) => {
                      reviewAbort.current?.abort();
                      setReviewing(false);
                      setFlavor(e.target.value as EngineFlavor);
                    }}
                  >
                    <option value="full">Stockfish 19 · Full</option>
                    <option value="lite">Stockfish 19 · Lite</option>
                  </select>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Analysis depth</strong>
                    <small>Higher depth takes longer on your device</small>
                  </div>
                  <input
                    type="number"
                    aria-label="Analysis depth"
                    min="1"
                    max="50"
                    value={depth}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isInteger(n) && n >= 1 && n <= 50) setDepth(n);
                    }}
                  />
                </div>
                <div className="depth-presets">
                  {[12, 16, 20].map((d) => (
                    <button
                      className={depth === d ? 'selected' : ''}
                      key={d}
                      onClick={() => setDepth(d)}
                    >
                      {d === 12 ? 'Quick' : d === 16 ? 'Balanced' : 'Deep'}
                      <small>Depth {d}</small>
                    </button>
                  ))}
                </div>
                {[
                  ['Continuous analysis', infinite, () => setInfinite((v) => !v)],
                  ['Show best-move arrow', showArrow, () => setShowArrow((v) => !v)],
                  ['Show move badges', showBadge, () => setShowBadge((v) => !v)],
                  ['Show review coach', showCoach, () => setShowCoach((v) => !v)],
                ].map(([label, value, fn]) => (
                  <label className="setting-row" key={String(label)}>
                    <strong>{String(label)}</strong>
                    <input type="checkbox" checked={Boolean(value)} onChange={fn as () => void} />
                  </label>
                ))}
                <div className="setting-row">
                  <strong>Review perspective</strong>
                  <select value={reviewAs} onChange={(e) => setReviewAs(e.target.value as any)}>
                    <option value="both">Both players</option>
                    <option value="w">White</option>
                    <option value="b">Black</option>
                  </select>
                </div>
                <div className="offline-card">
                  <WifiOff size={22} />
                  <div>
                    <strong>
                      {offlineReady ? 'Engine ready offline' : 'Take your analysis offline'}
                    </strong>
                    <p>
                      {(downloadSize / 1024 / 1024).toFixed(1)} MB ·{' '}
                      {flavor === 'full' ? 'Full NNUE' : 'Lightweight'} engine. The installed app
                      also caches the board and opening data.
                    </p>
                  </div>
                </div>
                <button
                  className="primary wide"
                  disabled={
                    downloadProgress !== null ||
                    ['checking', 'downloading', 'starting'].includes(engineLoad.phase)
                  }
                  onClick={downloadOffline}
                >
                  {downloadProgress !== null ? (
                    <>
                      <LoaderCircle size={17} className="spin" />
                      Downloading {downloadProgress.toFixed(0)}%
                    </>
                  ) : offlineReady ? (
                    <>
                      <Check size={17} />
                      Verify offline download
                    </>
                  ) : (
                    <>
                      <Download size={17} />
                      Make available offline
                    </>
                  )}
                </button>
                <div className="modal-actions">
                  <button
                    className="text-button"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(displayFen)
                        .then(() => setToast('FEN copied.'))
                        .catch(() => saveFile('position.fen', displayFen));
                    }}
                  >
                    <Copy size={15} />
                    Copy FEN
                  </button>
                  <button
                    className="text-button"
                    onClick={() =>
                      saveFile('chess-room-backup.json', exportBackup([study]), 'application/json')
                    }
                  >
                    <Download size={15} />
                    Backup study
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      void saveStudy(study)
                        .then(() => setSaved(`${study.id}:${study.revision}`))
                        .catch((e) => setError(errorMessage(e)));
                    }}
                  >
                    Retry save
                  </button>
                </div>
              </>
            )}
            {modal === 'scoring' && (
              <div className="scoring-copy">
                <p>
                  Stockfish evaluates the position. Chess Room turns that evidence into move
                  feedback using its own open, versioned rules.
                </p>
                <h3>Evaluation</h3>
                <p>
                  Positive scores favor White, negative scores favor Black. +1.00 is approximately
                  one pawn. M3 indicates a forced mate in three moves.
                </p>
                <h3>Move quality & accuracy</h3>
                <p>
                  We compare your move with the strongest continuation from the same position.
                  Expected-result loss uses 1 / (1 + exp(−centipawns / 250)). Excellent ≤ 1%, Good ≤
                  3%, Inaccuracy ≤ 8%, Mistake ≤ 18%; larger losses are Blunders. Best matches the
                  engine’s top choice. Mate transitions receive additional checks.
                </p>
                <p>
                  Accuracy averages 100 × exp(−5 × loss) across non-forced moves. Brilliant, Great,
                  and Miss need deeper tactical evidence. Book means the exact move follows a known
                  opening. Scores may change with deeper analysis.
                </p>
                <h3>Game rating</h3>
                <p>
                  A transparent, uncalibrated estimate based on accuracy and critical decisions. It
                  needs six meaningful decisions. It is not a Chess.com rating or a prediction of
                  your overall strength.
                </p>
                <h3>Your device, your games</h3>
                <p>
                  No accounts, uploads, subscriptions, or review quotas. Offline use requires the
                  initial app and engine download. Browser storage can be cleared, so export backups
                  for games you want to keep.
                </p>
                <p className="fine-print">
                  Engine: Stockfish 19 (GPLv3). Openings: Lichess CC0. Pieces: Cburnett CC BY-SA
                  3.0. See the project’s third-party notices for source and license details.
                </p>
              </div>
            )}
            {error && modal === 'import' && (
              <p className="modal-error" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
