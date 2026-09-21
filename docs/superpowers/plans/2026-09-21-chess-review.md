# Local Chess Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an attractive, unlimited, local-only chess review PWA with real Stockfish analysis, branching sidelines, annotations, ten move classifications, coaching, retries, and reports.

**Architecture:** A history-aware chess domain is shared by the board, review, and import/export modules. A serialized worker service runs Stockfish; pure evidence/scoring modules generate feedback, while IndexedDB holds studies and a service worker holds offline assets. Future opening lessons and opponent play reuse these foundations without being implemented in this release.

**Tech Stack:** React, TypeScript, Vite, chess.js, Stockfish 19 WebAssembly, IndexedDB through idb, Vitest, Testing Library, fake-indexeddb, Playwright. Use a dedicated recursive PGN adapter; chess.js supplies legal moves rather than owning the variation tree. Use Lucide icons and locally served licensed SVG pieces.

**Spec:** [Approved design](../specs/2026-09-21-chess-review-design.md)

## Global Constraints

- “Reviews, retries, imports, and deeper re-analysis have no daily quota, credits, subscription tier, or artificial game-count limit.”
- “Everything runs locally after assets are downloaded; no game data or coaching request is sent to a service.”
- “Use the full single-threaded Stockfish 19 build by default for analysis strength, with explicit loading progress and a selectable lightweight build for constrained devices.”
- “Avoid silent downgrade to an older engine.”
- “Sidelines and retry attempts never alter original-game accuracy.”
- “No hosted language model, API key, or remote coaching dependency is required.”
- “A fresh install still needs its initial download; installing the PWA alone does not imply the engine is ready offline.”
- “These are locally computed classifications with documented rules; matching the feature set does not imply bit-for-bit agreement with Chess.com's scores.”
- Standard chess; retain castling, en passant, promotion, repetition, and halfmove history. Reject unsupported variants explicitly.
- All dependencies and engine/opening sources must be pinned in a lockfile and asset manifest during implementation. Verify actual UCI engine identity and source correspondence.
- Training curricula and adjustable-strength opponent screens remain follow-ups; ship reusable interfaces without placeholder navigation to nonexistent features.

## Review Focus

1. PGN containing recursive variations, Unicode comments, escaped header quotes, and multiple games must not silently flatten or replace an unrelated study. Task 1 owns these tests.
2. Rapid branch navigation, import, cancellation, and worker failure must never attach old analysis to the newly selected game. Task 4 owns these tests.
3. Repetition or fifty-move context can differ for identical boards; terminal handling and analysis-cache identity must preserve that difference. Tasks 1 and 4 own these tests.
4. Touch/pointer cancellation and board rotation during drawing must not create an unintended chess move or corrupt square coordinates. Task 3 owns these tests.
5. Interrupted engine downloads, storage exhaustion, and a waiting service-worker update must preserve studies and report truthful save/offline status. Tasks 2 and 10 own these tests.

## Delivery and file map

The twelve tasks form one integrated review product and run in dependency order. Each ends with a usable, independently verifiable capability. The UI becomes playable in Task 3, gains real analysis in Task 4, then gains progressively richer review behavior. Do not declare the requested application complete until Task 12 passes.

| Area | Files and responsibilities |
| --- | --- |
| Application | `src/app/App.tsx`, `src/app/store.ts`, `src/app/styles.css`: shell, feature coordination, responsive layout |
| Domain | `src/chess/types.ts`, `tree.ts`, `position.ts`, `pgn.ts`: serializable history-aware tree, legal edits, PGN adapter |
| Persistence | `src/storage/database.ts`, `studies.ts`, `backup.ts`: schema, transactional saves, validated backups |
| Board | `src/board/Board.tsx`, `coordinates.ts`, `AnnotationLayer.tsx`, `board.css`: board and reusable visual layers |
| Engine | `src/engine/types.ts`, `uci.ts`, `worker-client.ts`, `scheduler.ts`, `assets.ts`: typed protocol, lifecycle, job scheduling |
| Opening names | `scripts/build-openings.ts`, `src/openings/lookup.ts`, `public/data/openings.json`: pinned A–E index |
| Scoring | `src/review/policy.ts`, `classify.ts`, `evidence.ts`, `report.ts`: transparent policy, legal tactical evidence, summaries |
| Review UI | `src/review/ReviewPanel.tsx`, `AnalysisPanel.tsx`, `MoveList.tsx`, `EvaluationGraph.tsx`, `controller.ts`: presentation and jobs |
| Coaching | `src/coach/explain.ts`, `demonstration.ts`, `CoachCard.tsx`: factual commentary, stepwise overlays |
| Retry | `src/retry/session.ts`, `RetryPanel.tsx`: isolated recall attempt lifecycle |
| Offline | `src/offline/register.ts`, `src/offline/download.ts`, `public/sw.js`, `public/manifest.webmanifest`: install/cache/update behavior |
| Assets/build | `scripts/prepare-engine.ts`, `public/assets/`, `public/engine/`, `public/licenses/`, `public/assets-manifest.json` |
| Verification | `src/**/*.test.ts`, `src/**/*.test.tsx`, `tests/e2e/*.spec.ts`, `tests/fixtures/`: unit, integration, real browser fixtures |
| Documentation | `README.md`, `docs/scoring.md`, `docs/architecture.md`, `THIRD_PARTY_NOTICES.md` |

## Shared contracts

Task 1 defines domain types; Task 4 defines engine types; Task 6 defines review types. Other tasks import these exact contracts instead of duplicating them.

```ts
type Color = 'w' | 'b';
type NodeId = string;
type DrawingColor = 'green' | 'red' | 'blue' | 'yellow';
type Mark = { kind: 'square'; square: Square; color: DrawingColor }
  | { kind: 'arrow'; from: Square; to: Square; color: DrawingColor };
interface GameNode {
  id: NodeId; parentId: NodeId | null; children: NodeId[];
  san: string | null; uci: string | null; fen: string;
  comments: string[]; marks: Mark[];
}
interface Study {
  schemaVersion: 1; id: string; revision: number; headers: Record<string, string>;
  rootId: NodeId; rootFen: string; nodes: Record<NodeId, GameNode>;
  mainline: NodeId[]; selectedId: NodeId; selectedChildren: Record<NodeId, NodeId>;
  explorationOrigin: NodeId | null;
}
interface PositionInput { rootFen: string; moves: string[] }
type Score = { kind: 'cp'; value: number }
  | { kind: 'mate'; plies: number; winner: Color };
interface EngineLine {
  rank: number; score: Score; depth: number; pv: string[];
  bound: 'exact' | 'lower' | 'upper';
}
type SearchBudget = { kind: 'depth'; depth: number }
  | { kind: 'time'; milliseconds: number } | { kind: 'infinite' };
interface AnalyzeRequest {
  id: string; position: PositionInput; budget: SearchBudget;
  multiPv: number; rootMoves?: string[];
}
interface AnalysisResult {
  requestId: string; engineId: string; profileId: string;
  positionKey: string; lines: EngineLine[]; completed: boolean;
}
type Label = 'Brilliant' | 'Great' | 'Best' | 'Excellent' | 'Good'
  | 'Book' | 'Inaccuracy' | 'Mistake' | 'Blunder' | 'Miss';
interface MoveAssessment {
  nodeId: NodeId; primary: Label; base: Label; book: boolean;
  mover: Color; loss: number; moveAccuracy: number; bestUci: string;
  evidence: Evidence[]; depth: number; policyVersion: 1;
  meaningful: boolean; criticalGap: number;
}
type EvidenceKind = 'fork' | 'pin' | 'material' | 'mate' | 'sacrifice' | 'unique' | 'miss';
interface Evidence {
  kind: EvidenceKind; root: PositionInput; line: string[];
  frames: { ply: number; marks: Mark[] }[]; verifiedDepth: number;
  facts: Record<string, string | number | boolean>;
}
```

`Square` is imported from chess.js and runtime-validated at external boundaries. Internal code may use the library's `Chess` class; persisted data never stores mutable class instances. Store mate distance as plies: positive UCI mate n converts to `2*n-1` with side-to-move winning; negative n converts to `2*abs(n)` with the opponent winning. Zero is terminal and uses board state to identify the winner. Display M-number through a dedicated formatter rather than showing plies. All `cp` values in these contracts are White-relative.

## Scoring policy v1

This is an explicit initial application heuristic, not a reconstruction of Chess.com's algorithm or a calibrated prediction of human strength.

```ts
export const policy = {
  version: 1,
  cpScale: 250,
  excellentLoss: 0.01, goodLoss: 0.03,
  inaccuracyLoss: 0.08, mistakeLoss: 0.18,
  retryLoss: 0.01, uniqueGap: 0.12,
  meaningfulFloor: 0.10, meaningfulCeiling: 0.90,
  verificationDepth: 18, minimumRatingDecisions: 6,
} as const;
// scoreCp is already normalized to the mover's perspective here.
const expected = (scoreCp: number) => 1 / (1 + Math.exp(-scoreCp / policy.cpScale));
const loss = Math.max(0, bestExpected - playedExpected);
const moveAccuracy = 100 * Math.exp(-5 * loss);
```

- Use finite mate scores as expected result 1 for a mating mover and 0 for a mated mover; exact draws are 0.5. A verified transition from avoidable mate to being mated is Blunder. Losing a verified forced mate to a non-mate continuation receives at least Inaccuracy, even if the heuristic saturates; record this override separately from numeric loss. A shorter mate is not automatically better move quality when both lines force mate.
- Best requires equality to the top engine move with completed exact root analysis; forced legal moves receive Best but are excluded from meaningful-decision accuracy/rating samples. For other moves: loss ≤ .01 Excellent, ≤ .03 Good, ≤ .08 Inaccuracy, ≤ .18 Mistake, otherwise Blunder. Honor the special mate overrides.
- Primary-label precedence: Miss when verified and base is an error; otherwise base error; otherwise Brilliant, Great, Book, base. Count only the primary label; retain all flags and base scores in details.
- Great requires at least two legal alternatives, selected best move, verified gap ≥ .12 expected-result units to the best remaining alternative, and either avoidance of losing (`best ≥ .40`, `second ≤ .25`) or retention of winning (`best ≥ .75`, `second ≤ .55`). Verify alternatives using `searchmoves` excluding the played move, rather than assuming a shallow MultiPV runner-up is definitive.
- Brilliant requires base Best/Excellent, best and played expected result ≥ .40, and a verified voluntary sacrifice of at least two material points persisting through the next four plies of an accepted line. Values: pawn 1, knight/bishop 3, rook 5, queen 9; ignore kings. Analyze every legal immediate acceptance capture of the offered piece to verification depth with consistent root settings; none may refute the soundness threshold. Ordinary equal exchanges, recaptures recovering material inside four plies, and positions with no voluntary choice fail the criterion. This intentionally conservative detector can miss human-brilliant moves; it must not invent evidence.
- Miss requires an error plus a verified mate or net-material-winning continuation (gain ≥ 2 points retained through four plies) that the actual move forfeits; for opponent-error framing, also require previous-ply loss ≥ .08. Describe a missed tactical opportunity without the opponent-error claim when that previous evidence is absent.
- Review presets target depth 12/16/20. Custom depth and time settings remain available; no tier is gated. Time-bounded live analysis reports reached depth. Classifications comparing root alternatives use a common reached depth, replaying comparison searches if needed; partial comparisons remain pending. Special labels require at least depth 18 and deeper than the base search when necessary.
- Player accuracy is the arithmetic mean of move accuracies for eligible non-forced mainline moves. Zero eligible moves → unavailable. Provisional results show analyzed/eligible counts. Book moves retain their actual engine loss in scoring.
- A meaningful decision has at least two legal moves and best expected result between .10 and .90, or qualifies as a verified critical-gap position. Rating requires ≥ 6 such analyzed decisions. Let A be accuracy over meaningful decisions and C be mean clamped critical-gap contribution `min(.25, gap) / .25` for moves with loss ≤ .03, zero otherwise. Approximate performance is `roundTo50(clamp(400 + 2600 * (A / 100)^4 + 100 * C, 400, 3200))`. Display `≈` and Uncalibrated estimate. Six–eleven decisions or >50% forced moves → Low confidence; otherwise Heuristic estimate. Do not imply a statistical confidence interval.
- Retry accepts loss ≤ .01 at the comparison depth and no mate override, including equivalent alternatives. A reference best move passes once its completed exact analysis is available.
- Phase policy proceeds monotonically. Start in opening for a standard starting root. Exit opening after ply 8 when both sides have at most one minor piece on its original back-rank square and both have castled or lost castling rights, or after the last named opening node plus two plies once ply ≥ 12, or by ply 24. Endgame starts when total non-pawn/non-king material ≤ 13 points, or both queens are absent and that total ≤ 20. Endgame takes priority. FEN roots use material for endgame, otherwise opening only if the exact root is recognized, otherwise middlegame. Promotion never moves the phase backward.

### Task 1: Importable, history-aware studies

**Files:** Create `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/chess/{types,tree,position,pgn}.ts`, `src/chess/tree.test.ts`, `src/chess/pgn.test.ts`.

**Interfaces:** Produce `createStudy(fen?: string): Study`, `playMove(study: Study, parentId: NodeId, uci: string): Study`, `positionAt(study: Study, id: NodeId): PositionInput`, `parsePgn(text: string): Study[]`, `exportPgn(study: Study): string`. Mutations return new values and increment revision. Existing identical child moves are selected without duplication. The root is excluded from `mainline`.

- [ ] Create project/tool configuration, pin compatible dependency versions, and wire `test`, `typecheck`, `build`, `dev`, and `test:e2e` scripts. If git is absent, initialize it for this new project; preserve existing documents. Verify Node/package manager versions before choosing dependency versions.
- [ ] Write the failing behavior tests, including:

```ts
it('preserves and round-trips variations', () => {
  const [study] = parsePgn('1. e4 (1. d4 d5 (1... Nf6)) e5 *');
  expect(study.nodes[study.rootId].children).toHaveLength(2);
  const [copy] = parsePgn(exportPgn(study));
  expect(exportPgn(copy)).toBe(exportPgn(study));
});
it('reuses a branch without altering the mainline', () => {
  const [s] = parsePgn('1. e4 e5 *');
  const a = playMove(s, s.rootId, 'd2d4');
  const b = playMove(a, a.rootId, 'd2d4');
  expect(Object.keys(a.nodes)).toHaveLength(Object.keys(b.nodes).length);
  expect(b.mainline).toEqual(s.mainline);
});
```

- [ ] Run `npm test -- src/chess` and confirm assertions fail because the domain behavior is absent.
- [ ] Implement tree updates using legal chess.js moves. Implement a PGN token stream for escaped tag pairs, brace/semicolon comments, NAGs, results, SAN, and recursive parentheses; on `(` branch from the parent of the preceding move, restore the saved cursor on `)`. Validate each SAN through chess.js, preserve comments/marks, support FEN/SetUp, and report line/token context on errors. Parse the complete input before committing any imported study.
- [ ] Add fixtures for escaped quotes/Unicode, two-game input, unsupported Variant, illegal SAN, castling, en passant, underpromotion, checkmate, stalemate, insufficient material, threefold repetition, and fifty-move conditions. `positionAt` replays root and ancestor UCI moves. Confirm mainline result and variation results remain distinct.
- [ ] Run domain tests and typecheck; commit the domain/import capability with `git add` of the explicit files and `git commit -m 'feat: add history-aware chess studies and PGN import'`.

### Task 2: Durable local study library

**Files:** Create `src/storage/{database,studies,backup}.ts`, `src/storage/studies.test.ts`, `src/app/store.ts`, `src/app/ImportDialog.tsx`, `src/app/Library.tsx`.

**Interfaces:** Consume `Study`, `parsePgn`, `exportPgn`. Produce `saveStudy(study: Study): Promise<void>`, `loadStudy(id: string): Promise<Study | undefined>`, `listStudies(): Promise<Study[]>`, `exportBackup(studies: Study[]): string`, `parseBackup(text: string): Study[]`. Database stores `studies`, `preferences`, and disposable `analysis`; migrations run transactionally.

- [ ] Test newest-revision persistence, selected branch and annotation restoration, corrupted backup rejection, and write failure without false Saved status.

```ts
it('round-trips all study nodes in backups', () => {
  const [s] = parsePgn('1. e4 (1. d4) *');
  expect(parseBackup(exportBackup([s]))[0]).toEqual(s);
});
```

- [ ] Run `npm test -- src/storage` and confirm missing storage behavior fails.
- [ ] Implement idb repositories and a serialized save queue: debounce ordinary edits 250ms, flush on explicit navigation/import, reject stale revisions, and keep unsaved state visibly dirty on failure. Validate backup version, parent/child consistency, square values, and legal paths. Multi-game imports show a selectable list instead of silently choosing one.
- [ ] Add PGN/FEN paste, file import, local library, PGN/FEN export, and JSON backup UI. Keep existing study selected on any validation/storage failure. Render imported text as text, never HTML.
- [ ] Verify failure/retry using fake-indexeddb unit tests and a browser storage-error fixture; run `npm test -- src/storage` and typecheck, then commit `feat: persist local studies and validated backups`.

### Task 3: Polished board and branch navigation

**Files:** Create `src/app/{App.tsx,styles.css}`, `src/board/{Board.tsx,coordinates.ts,AnnotationLayer.tsx,board.css}`, `src/review/MoveList.tsx`, `src/board/coordinates.test.ts`, `tests/e2e/board.spec.ts`, `public/assets/pieces/`.

**Interfaces:** `Board` receives `{fen, orientation, lastMove, marks, onMove, onToggleMark, disabled, hideHints}`; `onMove` emits a legal UCI proposal, including promotion choice. Marks are layered by user/engine/coach IDs. Produce `squareToPoint(square: Square, orientation: Color): {x: number; y: number}` with an 8×8 SVG viewBox.

- [ ] Add coordinate tests and browser assertions for click/drag moves, nested variation navigation, return-to-game, and drawing cancellation.

```ts
it('rotates square coordinates', () => {
  expect(squareToPoint('a1', 'w')).toEqual({ x: .5, y: 7.5 });
  expect(squareToPoint('a1', 'b')).toEqual({ x: 7.5, y: .5 });
});
```

- [ ] Run `npm test -- src/board` and the new board browser test; verify the expected missing UI behavior.
- [ ] Build the dark desktop shell, large green/cream board, player rows, slim evaluation placeholder, right tabs, transport bar, and library/import actions. Use charcoal `#242522`, panels `#2e302b`, ivory `#eeeed5`, green `#78965d`, and lime accent `#a9ce68`; use consistent 8px spacing, 12px panel radii, and locally served pieces with license notices. Below 900px stack the layout. Below 480px keep all eight files visible without horizontal overflow.
- [ ] Implement legal destination indicators, last-move/check state, promotion dialog, orientation, arrow-key navigation outside text fields, autoplay cleanup, tree move list, active branch, and return controls. Keep the imported mainline immutable.
- [ ] Implement pointer capture with primary-button move and secondary-button annotation modes; cancel on pointercancel, lost capture, or orientation change. Add visible touch/keyboard drawing tools, four colors, toggles, clear action, and per-node marks. The SVG overlay is pointer-transparent outside drawing tools.
- [ ] Inspect at 1440×900, 1024×768, and 390×844; run board tests and typecheck, then commit `feat: add interactive chess board and analysis branches`.

### Task 4: Real Stockfish worker analysis

**Files:** Create `scripts/prepare-engine.ts`, `src/engine/{types,uci,worker-client,scheduler,assets}.ts`, `src/engine/uci.test.ts`, `src/engine/scheduler.test.ts`, `tests/e2e/engine.spec.ts`, `public/engine/`, `public/licenses/`.

**Interfaces:** Produce `parseInfo(text: string, sideToMove: Color): EngineLine | null`, `EngineClient.analyze(request: AnalyzeRequest, signal: AbortSignal, onUpdate?: (result: AnalysisResult) => void): Promise<AnalysisResult>`, `EngineClient.dispose(): void`, and `positionKey(position: PositionInput, engineId: string, profileId: string): string`. Infinite jobs stream until abort; abort rejects with AbortError. Complete finite jobs resolve only on `bestmove`.

- [ ] Test parser signs, mate conversion, MultiPV rank/depth, lower/upper bounds, and interleaved late messages.

```ts
it('normalizes black-to-move evaluations once', () => {
  const line = parseInfo('info depth 14 multipv 1 score cp 135 pv e7e5', 'b');
  expect(line?.score).toEqual({ kind: 'cp', value: -135 });
});
```

- [ ] Run `npm test -- src/engine` to confirm parser/scheduler failures.
- [ ] Pin the actual available Stockfish 19 package/source; copy full and lite single-thread JS/WASM plus required nets, exact license/source material, and asset sizes/hashes into a generated manifest. Fail asset preparation on a version mismatch. Initialize `uci`, discover options, set complete analysis profile, `isready`, then root FEN + full history and `go`.
- [ ] Serialize jobs: issue `stop`, drain old `bestmove`, wait for `readyok`, then start another position. If a worker fails to stop within 3 seconds, terminate/recreate it and reject the affected request. Namespace job IDs by study and node; background review yields between jobs to interactive requests. Never publish stale generations.
- [ ] Keep one complete-depth set of exact PV scores for final comparisons; stream provisional lines separately. Reset Hash and full-strength settings for comparison fixtures. Cache by root/history, engine build, profile, budget, and completeness. Preserve draw claims in the domain instead of searching a terminal node.
- [ ] Run a real browser smoke test: assert UCI identity contains Stockfish 19, obtain a legal best move and nonempty exact evaluation, cancel and switch branches rapidly, and verify no cross-assigned results. Test offline asset failure as a visible error, never fake an evaluation. Commit `feat: integrate Stockfish 19 worker analysis`.

### Task 5: Opening recognition through transpositions

**Files:** Create `scripts/build-openings.ts`, `src/openings/lookup.ts`, `src/openings/lookup.test.ts`, `src/openings/OpeningsPanel.tsx`, `public/data/openings.json`.

**Interfaces:** Produce `openingKey(fen: string): string`, `identifyOpening(study: Study, nodeId: NodeId): OpeningMatch | null`, with `OpeningMatch = {eco: string; name: string; nodeId: NodeId; exact: boolean}`. Exact matching uses first four FEN fields with legally normalized en passant.

- [ ] Write transposition and retained-name-without-Book tests.

```ts
it('normalizes move counters', () => {
  expect(openingKey('8/8/8/8/8/4k3/8/4K3 w - - 0 1'))
    .toBe(openingKey('8/8/8/8/8/4k3/8/4K3 w - - 7 28'));
});
```

- [ ] Run `npm test -- src/openings` and confirm missing lookup behavior.
- [ ] Pin a lichess-org/chess-openings revision, parse all five TSV files, legally replay every record, and generate a compact position index plus prefix positions for Book detection. Fail the build on malformed records; retain explicit deterministic precedence for aliases. Publish data revision and CC0 attribution.
- [ ] Walk the active branch backward to find the most recent match, showing matched move and current exact status. Check equivalent knight-development move orders and legally relevant en passant. Display loading/error independently from engine readiness.
- [ ] Run lookup tests and asset generation validation; commit `feat: identify openings with local ECO data`.

### Task 6: Honest move-quality feedback and tactical evidence

**Files:** Create `src/review/{policy,classify,evidence,controller}.ts`, `src/review/classify.test.ts`, `src/review/evidence.test.ts`, `tests/fixtures/tactics.json`, `docs/scoring.md`.

**Interfaces:** Produce `assessMove(study: Study, nodeId: NodeId, engine: EngineClient, signal: AbortSignal): Promise<MoveAssessment>`, `detectEvidence(position: PositionInput, result: AnalysisResult): Evidence[]`, `baseLabel(loss: number, isBest: boolean): Label`, and pure `classify(input: ClassificationInput): MoveAssessment`. Define `ClassificationInput` in `classify.ts` with node/mover/book/legalCount, best/played/runner-up exact lines, verified evidence, and comparison depth. `assessMove` obtains that evidence; `classify` performs no searches.

- [ ] Pin the scoring policy above and write explicit boundary tests for each band and label precedence.

```ts
it.each([[.01, 'Excellent'], [.03, 'Good'], [.08, 'Inaccuracy'], [.18, 'Mistake'], [.181, 'Blunder']])
  ('classifies loss %s', (loss, label) => expect(baseLabel(loss, false)).toBe(label));
```

- [ ] Run `npm test -- src/review/classify src/review/evidence` and confirm failures.
- [ ] Implement same-root candidate/played searches with consistent depth, full legal history, terminal handling, and separate provisional/completed results. If played move is outside top PVs, restrict a search to it. Stream resulting assessments to the exact study/node; full-game queues enumerate only `mainline`. Persist completed reports and evidence in the disposable analysis store keyed by study revision, node, engine profile, and policy version; restore matching results when reopening the library and reanalyze stale entries. Extend lossless backup with optional versioned analysis records while accepting backups containing only studies.
- [ ] Implement legal tactical verification: replay every PV move; record material deltas, mating result, attacker/targets, and absolute king pins. A pin requires collinearity with the king and a legally prohibited off-ray move. A geometric fork without a verified winning continuation is only a double attack, not a forced material win. Analyze acceptance captures and competing defenses for special-label candidates using the pinned policy.
- [ ] Add fixtures covering both colors, mate delivery and mate loss, a sound sacrifice and unsound offered queen, equal exchanges, forced recaptures, unique legal move versus unique saving move, a missed fork, and a Book move with a verified error. Use deterministic evidence fixtures for classification and legal PGN/FEN replay tests for motif detection; real engine tests assert support invariants rather than unstable exact centipawns.
- [ ] Document formula, limitations, precedence, engine budgets, and policy version. Verify one primary label/count per completed move and updated labels after deeper results; run tests/typecheck, then commit `feat: classify moves with verified local evidence`.

### Task 7: Analysis and review dashboards

**Files:** Create `src/review/{AnalysisPanel,ReviewPanel,EvaluationGraph}.tsx`, `src/review/report.ts`, `src/review/report.test.ts`; modify `MoveList.tsx`, `src/app/App.tsx`.

**Interfaces:** Produce `buildReport(study: Study, assessments: Map<NodeId, MoveAssessment>): GameReport`, defined in `report.ts` with per-color accuracy/performance/counts/phase records and progress. Missing values are `null` with reason codes, never 0 by default.

- [ ] Test mainline-only aggregation and empty/partial reports.

```ts
it('does not fabricate empty-player accuracy', () => {
  const report = buildReport(createStudy(), new Map());
  expect(report.white.accuracy).toBeNull();
  expect(report.black.performance).toBeNull();
});
```

- [ ] Run `npm test -- src/review/report` and confirm failures.
- [ ] Implement policy-defined phase and score aggregation; round performance only for presentation. Track per-phase eligible/analyzed counts, Not reached versus pending, classification count filters, strongest supported move, and errors. Show an uncalibrated approximate marker on performance and make scoring documentation accessible in the UI.
- [ ] Wire signed evaluation bar, White-relative mate labels, depth/engine identity, three SAN lines, insert-PV-as-branch, quality/custom controls, continuous analysis, cancel/restart, review progress, two-player cards, phase reports, and click/keyboard-accessible graph points. No fabricated sample metrics: the sample is a real PGN that gets analyzed.
- [ ] Show classification text/icon/color on both imported and sideline moves plus destination badge toggle. Navigating does not auto-run a full review; interactive single-move feedback uses its own prioritized request. Verify FEN-only studies and missing PGN names/ratings render cleanly.
- [ ] Run report tests, typecheck, and browser analysis/review checks; commit `feat: add move feedback and game review reports`.

### Task 8: Local coach and guided demonstrations

**Files:** Create `src/coach/{explain,demonstration}.ts`, `src/coach/CoachCard.tsx`, `src/coach/explain.test.ts`; modify `ReviewPanel.tsx`.

**Interfaces:** Produce `explainMove(assessment: MoveAssessment): CoachMessage`, where `CoachMessage = {text: string; actions: {label: string; evidence: Evidence}[]}`, and `keyMoments(study: Study, assessments: Map<NodeId, MoveAssessment>): NodeId[]`. A demonstration replays `Evidence.root` plus its line using the domain and shows `frames` at the active ply.

- [ ] Write tests that unsupported tactics never appear as asserted coaching facts.

```ts
it('has no invented motif buttons without evidence', () => {
  const a = makeAssessment({ evidence: [] });
  expect(explainMove(a).actions).toEqual([]);
});
```

`makeAssessment` is a test-only factory defined in `tests/fixtures/assessment.ts`, returning every required field of `MoveAssessment` with ordinary Good/e4 defaults and supplied overrides.

- [ ] Run `npm test -- src/coach` and confirm failures.
- [ ] Implement templates from assessment fields: identify played quality, strongest alternative, expected-result/evaluation consequence; select motif phrases only from verified evidence. Add factual game summary and ordered key moments with side filters. Every highlight retains its source node.
- [ ] Implement CoachCard, Show Best/Show Idea/Show Fork/Show Lost Piece/Show Mate actions, previous/next key moment, stepwise and autoplay demonstrations, and return to selected review position. Keep demonstration cursor separate from study cursor and preserve user annotation layers. Explain a pin as a pin unless stronger consequences have evidence.
- [ ] Verify all demonstration moves legally replay, overlays agree with each frame, and cancel/unmount clears timers. Run coach tests/browser checks and commit `feat: add local coaching and visual explanations`.

### Task 9: Unlimited retries with fair feedback

**Files:** Create `src/retry/{session.ts,RetryPanel.tsx,session.test.ts}`, `tests/e2e/retry.spec.ts`; modify `CoachCard.tsx`, `src/app/App.tsx`.

**Interfaces:** Produce `startRetry(study: Study, nodeId: NodeId): RetrySession`, `submitRetry(session: RetrySession, uci: string, engine: EngineClient, signal: AbortSignal): Promise<RetryFeedback>`. Define `RetrySession` with origin study/node, isolated root/history, attempted moves, hint count, revealed status, and reference analysis; feedback contains accepted/loss/explanation/evidence. Save-as-branch explicitly calls `playMove` only after user intent.

- [ ] Write original-study isolation, equivalent-move acceptance, and complete answer-concealment tests.

```ts
it('starts before the error without mutating the game', () => {
  const [s] = parsePgn('1. f3 e5 2. g4 Qh4# 0-1');
  const snapshot = JSON.stringify(s);
  const retry = startRetry(s, s.mainline[2]);
  expect(retry.position.moves).toEqual(['f2f3', 'e7e5']);
  expect(JSON.stringify(s)).toBe(snapshot);
});
```

- [ ] Run `npm test -- src/retry` and confirm failures.
- [ ] Implement retry state transitions `choosing → analyzing → feedback`, with hints/reveal and unlimited reset. Apply the policy success tolerance and mate overrides; compare legal submitted alternatives at matching depth. Preserve the error's reference result but allow deeper reference refresh when required for a fair comparison.
- [ ] Hide move-list answer, PVs, graph/evaluation hints, answer badges, and user/engine/coach drawings during choosing; do not delete them. Add optional engine continuation and Save as sideline. Exit/import/cancel invalidates retry results and restores the correct study node.
- [ ] Run retry unit/browser tests including a sound alternative and wrong attempt, verify unchanged report values, then commit `feat: add interactive mistake retries`.

### Task 10: Installable and verifiably offline

**Files:** Create `src/offline/{register,download}.ts`, `public/sw.js`, `public/manifest.webmanifest`, `public/assets/icons/`, `tests/e2e/offline.spec.ts`; modify engine assets loader and app status/settings.

**Interfaces:** Produce `downloadAssetSet(id: string, signal: AbortSignal, onProgress: (loaded: number, total: number) => void): Promise<void>` and `isAssetSetReady(id: string): Promise<boolean>`. Set IDs include engine build/flavor and manifest hashes. Readiness requires a committed verified set, not individual partial cache entries.

- [ ] Write browser tests for offline launch after download and failed-download readiness.

```ts
test('retains studies after offline reload', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Make available offline' }).click();
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('grid', { name: 'Chessboard' })).toBeVisible();
});
```

- [ ] Run the offline browser test against the production preview and confirm missing SW behavior.
- [ ] Precache shell, icons, local fonts/pieces, and opening index. Download engine assets into a staging cache with progress and SHA-256/size checks; commit an asset-set marker only after all components pass. Worker URLs resolve from that exact set. Cancel leaves no Ready marker. Show selected build size before download and support engine-flavor selection.
- [ ] Add installation support, offline status, safe update action, and explicit asset/storage retry messages. A waiting service worker activates only after saves succeed and user accepts the update; keep the old asset set available until existing clients finish. Never delete IndexedDB studies during cache maintenance.
- [ ] Test interrupted JS/WASM downloads, corrupt asset rejection, offline missing-engine behavior, quota failures, safe update, and actual offline worker analysis. In network-disabled mode run review, coach, retry, and report; repeat review without any gate. Commit `feat: add reliable offline PWA support`.

### Task 11: Cross-feature integration and visual finish

**Files:** Modify `src/app/`, feature components/styles; create `tests/e2e/review.spec.ts`, `tests/e2e/import-export.spec.ts`, `tests/e2e/accessibility.spec.ts`.

**Interfaces:** Consume all prior modules without introducing a new shared state owner. Application state owns active study/mode; feature sessions own their temporary cursors and cancel tokens.

- [ ] Write the complete user-flow browser test using a real PGN fixture: import → review → both summaries → key moment → demonstration → retry → sideline → export → reload.

```ts
test('analysis can branch without replacing the imported game', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
  await page.getByRole('button', { name: 'Go to start' }).click();
  await page.getByRole('gridcell', { name: /^d2 / }).click();
  await page.getByRole('gridcell', { name: /^d4 / }).click();
  await expect(page.getByText('Sideline', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Return to game' }).click();
});
```

- [ ] Run the new tests and use failures to identify integration gaps; fix state ownership rather than bypassing feature assertions.
- [ ] Finish loading/empty/error states, focus management, imported-name wrapping, long variation indentation, bounded panel scrolling, coach/drawing layer controls, and graph mate presentation. Verify orientation/promotion/keyboard actions with both colors. Keep implementation details out of normal flow except scoring and engine/storage choices that help users.
- [ ] Visually inspect 1440×900, 1024×768, and 390×844 screenshots and interact with real Stockfish in-browser. Confirm the screenshot-inspired layout is cohesive, no clipped controls or overflow, and key actions are usable by keyboard and touch.
- [ ] Run complete tests and production build; commit `feat: finish local chess review experience`.

### Task 12: Release verification and handover

**Files:** Create/update `README.md`, `docs/{architecture,scoring}.md`, `THIRD_PARTY_NOTICES.md`, lockfile and asset manifest; update task checkboxes with actual results.

**Interfaces:** Developer entry points are `npm install`, `npm run dev`, `npm test`, `npm run typecheck`, `npm run build`, and `npm run test:e2e`. Document any engine/openings asset-generation command explicitly and make a clean setup reproducible.

- [ ] Run `npm run typecheck`, `npm test`, and `npm run build`; inspect exit codes and resolve actual failures.
- [ ] Run `npm run test:e2e` on the production preview, including the full engine smoke test and offline analysis. Keep fake engine fixtures restricted to deterministic orchestration tests; they cannot satisfy the real engine check.
- [ ] Verify runtime UCI identity, bundled source/license records, pinned opening provenance, manifest hashes, and a clean-checkout asset setup. Document local data/backup behavior, PWA first-download requirements, scoring limitations, supported formats, and future extension boundaries.
- [ ] Inspect the final diff and perform the execution workflow's required review. Resolve actionable findings, rerunning only affected checks plus the production build after changes.
- [ ] Start the application for user inspection, report the local URL, the completed features, exact verification results, and any genuine remaining limitations. Do not claim the app is finished if a required path is unimplemented or only mocked.

## Plan self-review

- Coverage: domain/import/history (1), persistence/library (2), board/drawings/branches (3), latest real engine/cancellation (4), openings (5), all labels/evidence/policy (6), accuracy/performance/phases/graph/analysis feedback (7), coach (8), retry (9), local-only/PWA/unlimited operation (10), complete responsive flow (11), verification/docs/source notices (12).
- Future teaching and opponent modes deliberately consume the shared interfaces but are not exposed as unfinished features in this release.
- Review-focus tests have owners in Tasks 1–4 and 10. External inputs remain validated before changing active data.
- No delegation has been selected. Recommended execution: Native, implementing tasks in this session, because these interfaces are closely coupled and one consistent implementation context reduces integration overhead.

## Approval status

Approved for Native execution by the user (option 1). Implementation completed on `feat/local-review`. Final verification: 40 unit/integration tests, 7 production browser tests, TypeScript and production build passed. See `docs/delivery.md` for execution decisions and the independent-review fixes. The original step checklist is retained as the planning record; the delivered behavior and verification are recorded in the delivery report.
