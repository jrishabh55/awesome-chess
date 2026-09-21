# Chess review application — proposed design

## Intended outcome

Build a polished chess review web app inspired by the supplied Chess.com screenshot. A player can import a game, replay it, understand which side is ahead, inspect Stockfish's best continuations, identify the opening, and find their mistakes. The workspace is currently empty.

The request explicitly includes the board, analysis panel, latest open-source Stockfish, best moves, White/Black ratings, signed position evaluations, opening identification, and attractive presentation. Ratings now explicitly include per-player accuracy and an estimated single-game performance rating, clearly distinguished from an actual player Elo rating.

The user additionally requires playable sidelines during analysis, manual square highlights and arrows, and a local-first architecture. Include installable PWA support in the initial release. Opening teaching with cumulative randomized drills and human-versus-Stockfish games at multiple strengths are potential follow-ups; provide reusable foundations now, and implement those feature flows separately later.

The full initial review release also includes all ten requested move classifications directly in Analysis and Review, local virtual-coach explanations with visual demonstrations, interactive mistake retries, and a per-player report card covering opening, middlegame, and endgame. Reviews, retries, imports, and deeper re-analysis have no daily quota, credits, subscription tier, or artificial game-count limit. Everything runs locally after assets are downloaded; no game data or coaching request is sent to a service.

## Approach

Recommended: React and TypeScript installable PWA with Vite, legal chess state managed by chess.js, and Stockfish 19 WebAssembly running in a dedicated worker. Bundle opening data locally. Store user-owned games and studies in IndexedDB behind a storage interface. No account or server is needed for the primary workflow.

Alternatives considered:

- Native Stockfish behind a local server: offers stronger control over CPU and memory, but requires another process and complicates deployment.
- Remote analysis service: enables centralized compute and saved accounts, but introduces hosting costs and network dependence without helping the requested initial workflow.

Use the full single-threaded Stockfish 19 build by default for analysis strength, with explicit loading progress and a selectable lightweight build for constrained devices. Engine assets are lazy-loaded and served locally. Check the actual package version and engine UCI identity during implementation rather than trusting a UI label. Avoid silent downgrade to an older engine.

## Interface

Dark charcoal application shell with restrained green accents, clear typography, rounded panels, and comfortable spacing. Use original branding and appropriately licensed chess pieces.

Desktop layout: a large square green-and-cream board on the left, player details above and below it, and a narrow evaluation bar beside it. The right panel contains Review, Analysis, and Openings tabs. Smaller screens stack the board above the panel.

Board interactions include click or drag moves, legal destination indicators, last-move highlights, check indication, promotion selection, flip board, best-move arrow toggle, and keyboard-accessible controls. Exploring a continuation preserves the imported game and provides a return-to-game action.

Manual annotations use right-click to toggle a square highlight and right-drag to toggle an arrow between squares. Provide a visible color selector with green, red, blue, and yellow, and a clear-annotations action. A touch-friendly drawing mode supports tapping a square to highlight it or choosing an arrow's start and destination; the same controls support keyboard input. Suppress the context menu only on the board. Store coordinates as chess squares so annotations remain correct after board rotation. User drawings, engine arrows, and future teaching overlays have independent layers and visibility controls. User annotations belong to their move-tree node: navigating restores that node's drawings and does not carry them to another position.

Move navigation includes start, previous, next, end, autoplay, arrow-key shortcuts, and a clickable scrollable move list. Shortcuts must not interfere with text entry.

Review opens with separate White/Black accuracy and estimated game-performance scores, counts of all move classifications, a clickable evaluation graph, and phase report cards. Start Review enters a guided sequence of key moments with coach explanations, Retry, Hint, Show Best Move, and Show Continuation controls. Include review-as-White/Black/both filters and independent display toggles for coach, classification badges, best-move arrows, and continuation autoplay. Analyzed positions update progressively; unavailable analysis is shown as pending rather than fabricated.

Every analyzed move displays its classification color, symbol, and readable name in the move list and selected-move card, with an optional badge on the destination square. Clicking a classification count filters or navigates to matching moves. Color is not the only way to convey quality. Analysis provides this same feedback on imported moves and newly played sideline moves without requiring a full-game review first. A new move initially shows Analyzing; a completed classification is attached only to that move's analysis evidence and never borrowed from another branch.

Analysis presents the current signed evaluation, engine identity, search depth, status, and up to three principal variations in readable chess notation. Scores use White's perspective consistently: +2.00 favors White by approximately two pawns; -2.00 favors Black. Mate scores are displayed separately, such as M3, with the favored side clear. Checkmate and drawn terminal positions are handled without asking the engine for nonexistent moves.

Openings presents the opening name, variation, and ECO code for the deepest recognized position along the current line. Unknown positions retain the last recognized opening with the matching move identified. Opening identification does not imply a database of master-game frequencies or win percentages.

## Game workflow

Open with a clearly labeled sample game and a prominent Import game action. Support PGN paste and .pgn upload, plus FEN paste for position analysis. Extract player names, ratings, result, and time control when supplied by PGN headers. Do not invent missing metadata or clocks.

Validate an import before replacing the active game. Display actionable input errors. Support standard chess initially and explicitly reject unsupported variants. Support export of PGN with variations and comments, conventional arrow/square annotation comments where supported, and copying the current FEN. Provide a versioned JSON backup/import for lossless local studies and annotations. Persist games, analysis branches, annotations, and display preferences locally.

### Playable sidelines

Represent a game as a rooted move tree, with stable node IDs, parent/child relationships, an explicit imported mainline, legal move data, comments, and annotations. From any move, playing an alternative creates or selects a child variation; further moves can branch again. Replaying an existing move selects its node instead of duplicating it. Show nested variations in the move list with a clear active-line indicator, return-to-parent control, and one-click return to the imported game position where exploration began. Previous/next and autoplay follow the selected branch. Engine continuations can be inserted as a variation for replay and further exploration.

Analysis and opening identification follow the active branch. Full-game accuracy and the review graph continue to describe the imported mainline, so a hypothetical sideline does not change the review of the played game. Preserve complete move history for repetition and draw handling; FEN alone is insufficient. PGN import/export must round-trip recursive annotation variations rather than flattening them, using an appropriate parser in addition to chess.js if needed.

Game review analyzes positions before and after each move in a consistent review mode. Users can cancel review, restart with a different analysis budget, and navigate while it runs. A new import invalidates stale analysis. Changing the board cancels obsolete interactive searches. Full-game jobs and interactive analysis coordinate worker access to avoid interleaved UCI output being assigned to the wrong position.

## Analysis and ratings

Keep worker/UCI transport, position analysis, review scoring, opening lookup, and UI state in separate modules with explicit interfaces.

### Shared foundations and feature boundaries

- Chess domain: legal moves, history-aware game tree, branch navigation, and PGN/FEN conversion. It has no dependency on React, the engine, or storage.
- Board presentation: renders a position and layered annotations; emits move and drawing intents. Review, teaching, drills, and playing can each control permissions and supply overlays without duplicating the board.
- Engine service: typed analysis and move-choice requests with cancellation and progress, backed by a UCI worker adapter. Analysis settings and future opponent-strength settings are separate profiles; every job applies its complete profile so reduced playing strength cannot leak into review.
- Local repositories: versioned studies and preferences now; lesson definitions and training progress can be added as separate records through explicit migrations. Cache entries are disposable and separate from user-owned data.
- Feature modules: review owns its orchestration now. Future training owns lesson scheduling and attempts; future play owns turns, opponent configuration, and game outcomes. They reuse the domain, board, engine, and repositories through direct typed interfaces. No generic plugin framework is required.
- Review submodules: move-quality classification, tactical evidence detection, coach text/visual generation, retry sessions, and report-card aggregation are independently testable. Store structured evidence and scoring-version metadata alongside results so explanations, badges, and summaries agree. The opening teacher can reuse demonstration and exercise primitives later without depending on the review screen.

Analysis results include engine build identity, settings, search budget, position and relevant history, and completion status. Do not identify game-tree nodes by FEN: the same position reached along different paths can have different annotations and repetition context.

Normalize Stockfish scores from side-to-move perspective to White perspective exactly once. Track search depth, principal variations, bound flags, mate scores, position identity, and request identity. Do not use lower/upper-bound intermediate scores as final exact evaluations.

### Move classifications

Implement all requested labels with familiar symbols and colors. Brilliant uses !!, Great !, Best a star, Inaccuracy ?!, Mistake ?, Blunder ??, and Miss a missed-opportunity icon. These are locally computed classifications with documented rules; matching the feature set does not imply bit-for-bit agreement with Chess.com's scores.

| Label | Required local evidence |
| --- | --- |
| Brilliant | A sound material sacrifice supported by a verified continuation, while retaining a favorable or defensible evaluation. Ordinary exchanges, immediately recovered material, and unsound sacrifices must not qualify automatically. |
| Great | The played move uniquely preserves a critical outcome or advantage, with the strongest alternative demonstrably worse. Positions with only one legal move are not automatically Great. |
| Best | The engine's top recommendation at the completed analysis budget. |
| Excellent | Very small expected-result loss relative to the best move. |
| Good | Modest expected-result loss within the documented good-move band. |
| Book | The move follows a recognized opening continuation from the current branch. Retaining an earlier opening name alone does not qualify a later move as Book. |
| Inaccuracy | Expected-result loss in the small-error band. |
| Mistake | Expected-result loss in the substantial-error band. |
| Blunder | Expected-result loss in the severe-error band or a verified equivalent decisive mate transition. |
| Miss | A verified tactical or opponent-created opportunity existed and the played move failed to realize it. Record the missed tactic and retain the underlying error severity. |

Compare candidate moves from the same root position using consistent engine settings and effort. Evaluate the actual played move explicitly when it is outside the top principal variations. Shallow pre/post-score differences alone are insufficient for sacrifice, unique-move, or missed-tactic claims. Candidate Brilliant, Great, and Miss classifications trigger deeper verification; if evidence remains insufficient, retain the supported base quality label. Labels may change when deeper analysis supplies better evidence; display the associated analysis quality.

Store base quality, opening status, and tactical distinctions separately. Assign one primary display label and one summary count per move using explicit precedence: verified Miss for a move with an underlying error; otherwise the error label; otherwise Brilliant, Great, Book, then the base quality. Additional evidence remains accessible in the move details. This prevents a Book badge from concealing a verified error and avoids double-counting.

Publish expected-result conversion, numeric quality bands, label precedence, sacrifice/uniqueness criteria, and accuracy aggregation in one versioned scoring-policy module and a user-facing explanation. Pin the initial values and test fixtures in the implementation plan before coding the classifier. They are this app's rules, not claimed Chess.com thresholds. Treat forced moves, terminal results, mate transitions, and partial analysis explicitly.

### Accuracy and performance estimates

Compute White and Black accuracy on a 0–100 scale from their analyzed mainline moves using the documented quality-loss formula. Show move counts and provisional status during partial review. A player with no eligible analyzed moves has an unavailable score rather than an invented 100. Sidelines and retry attempts never alter original-game accuracy.

Include an estimated game-performance rating for each player, with a visible approximate marker and explanation that it measures this game only. Keep its heuristic separate from accuracy and from any PGN player rating. Use a documented, versioned local mapping from analyzed move quality and decision difficulty; record its inputs and show low confidence for short or predominantly forced games. Pin the mapping in the implementation plan. Do not claim population calibration or Chess.com equivalence without evidence. When a game has insufficient meaningful decisions, show insufficient data rather than fabricate an Elo figure.

### Local virtual coach and visual demonstrations

Generate concise, deterministic explanations from structured engine and board evidence on the device. No hosted language model, API key, or remote coaching dependency is required. A move card explains its classification, the best alternative, and the practical consequence. Neutral evaluation-and-continuation feedback is always available; more specific tactical language requires verified evidence.

Support explanations and board demonstrations for forks/double attacks, pins, hanging or lost material, and mating sequences. Validate king safety and legal tactical responses rather than treating every geometric attack as a winning tactic. Demonstrations show the relevant continuation with arrows and highlighted pieces at each step. Position-specific actions such as Show Fork, Show Lost Piece, or Show Mate appear only when the evidence supports them. Offer step controls and optional autoplay, plus return to the reviewed position. Preserve user drawings independently.

Build the guided key-moment queue from the end of known opening theory, verified special moves, significant evaluation changes, errors, missed opportunities, and decisive transitions. Provide previous/next key moment and access to every ordinary move. Generate a one-line game summary from actual evaluation events. Coaching must not invent a player's intention or claim a tactical explanation that has not been verified.

### Retry mistakes

Retry starts from the position immediately before the selected Inaccuracy, Mistake, Blunder, or Miss. Hide the original move's answer, candidate lines, evaluation hints, and engine/coach arrows while the learner chooses a move; temporarily hide revealing user drawings without deleting them. Hint and Reveal explicitly disclose increasing help. A local retry session owns its temporary moves and results, preserving the imported mainline and review.

Analyze the submitted legal move against the same reference position. Accept the best move or a verified near-equivalent alternative within the documented success tolerance; do not reject sound alternatives solely because they differ from a stored principal variation. Give feedback on unsuccessful attempts, allow unlimited retries, and offer engine replies to explore the consequence. Keep hint-assisted and unaided outcomes separate. Exit returns to the exact reviewed node; a learner may explicitly save an attempt as a sideline.

### Report card

For each player, show overall accuracy, approximate performance rating, classification counts, and opening/middlegame/endgame breakdowns. Each phase includes analyzed move count, accuracy, major errors, strongest supported moment, and a short evidence-based improvement suggestion. Define phase transitions deterministically in a shared policy using opening recognition, development, and material; assign each mainline move to exactly one phase. A phase never reached displays Not reached, and a phase with inadequate analysis displays pending or insufficient data.

Summaries can describe observed behavior such as missed forks or failed conversion of an advantage. They must not infer a durable personal playing style from one short game. Every reported highlight links back to the move and its supporting continuation.

## Opening data and distribution

Use the lichess-org/chess-openings dataset, covering ECO volumes A–E. Pin the source revision and generate a position-based lookup so transpositions work. Match board, side to move, castling rights, and legally relevant en-passant state; ignore move counters. Keep source attribution and data update instructions.

Preserve the selected Stockfish distribution's license, notices, exact source revision, and corresponding-source availability in the project. Record licenses for piece assets and other bundled materials.

## Error handling and performance

The board and game navigation work while the engine loads or is unavailable. Show distinct loading, ready, analyzing, canceled, and error states with a retry action. Communicate the full engine download size before loading. Fail visibly when WebAssembly or an engine asset cannot load. Avoid freezing the main thread during game review or opening indexing.

Provide user-controlled review quality settings, custom search budgets, and deeper re-analysis. Finite job budgets keep analysis cancelable and responsive; they are not review quotas. Offer continuous current-position analysis until stopped, within the engine's supported parameters. Users can run or repeat as many reviews and retries as their device resources permit, with every quality setting available locally. Cache results by position/history and relevant engine settings; do not reuse shallow cached analysis as a deeper completed review. Reserve layout space for loading states to keep the board stable.

## Local-first PWA

Include a web manifest, install icons, and a service worker. Cache the application shell, piece assets, fonts, and opening lookup for offline use. Cache the selected engine JavaScript/WASM and any external network files as one versioned asset set. Show engine download progress and an offline-ready indicator only after every required asset has been verified available. A fresh install still needs its initial download; installing the PWA alone does not imply the engine is ready offline.

Save user-owned data transactionally in IndexedDB with schema migrations. Reload restores the current node, branches, and annotations. Show save failures and support retry and backup; never claim unsaved changes are saved. Keep engine/opening caches separate from studies so cache cleanup and service-worker updates cannot delete games. Offer persistent-storage support when available and expose backup/export because browser storage can be evicted or cleared.

Use versioned caches and coordinated updates to avoid mixing engine JavaScript with incompatible WASM. Offer application updates at a safe point after saving, and avoid forcing a reload during analysis or editing. If an asset is absent while offline, preserve board and study access and explain which download is needed. Cross-device synchronization is a later extension behind the storage boundary, not a dependency of local use.

## Potential follow-up: opening teacher

Lesson content is a curated opening repertoire with named variations, learner color, starting position, expected moves, and node-level explanations/arrows/highlights. The opening-name database provides identification; it does not by itself supply teaching explanations or a complete curriculum.

Reuse the move-tree and annotation formats for guided tours. A lesson controller steps through explanatory moves and arrows; a drill controller asks the learner to recall their side's moves and plays the opposing side. Keep lesson definitions separate from progress and attempts.

Capture the requested learning sequence as follows:

1. Variation 1: one guided tour, then one recall drill.
2. Variation 2: one guided tour, then drill variations 1 and 2 once each in shuffled order.
3. Each later variation: one guided tour, then one shuffled pass through all variations learned so far.
4. After all variations: a final full drill covering every variation in shuffled order.

The interpretation of “random” is a shuffled queue without replacement, ensuring coverage instead of allowing random selection to omit a variation. Persist the active queue and attempts so resuming does not silently reshuffle or lose progress. Track mistakes and hints separately from unassisted completion. Accept authored alternative moves at shared positions where the lesson allows them. Retry policy, spaced repetition, lesson authoring UX, and content selection are decisions for the follow-up design; they are not required in the review release.

## Potential follow-up: human versus Stockfish

Reuse the board, legal-move domain, local game persistence, and worker adapter. Add a dedicated play controller with selectable side and strength; completed games can open directly in review. Keep opponent searches separate from interactive review jobs and apply full-strength review settings when entering review.

Use the engine's advertised UCI_LimitStrength/UCI_Elo or Skill Level options to implement supported strength settings. Read actual option ranges from the installed engine rather than hardcoding a claimed rating range. Treat displayed target ratings as approximate engine strength, not equivalent to a Chess.com account rating. Beginner levels below supported engine limits require a separately designed and tested move-selection policy. The follow-up will define supported levels, timing, takebacks, and game controls.

## Verification

- Unit tests for UCI parsing, score normalization for both colors, mate handling, move-quality calculation, and transposed opening recognition.
- Curated classifier fixtures covering every label for both colors, sound/unsound sacrifices, forced recaptures, unique defenses, missed tactics, mate transitions, Book precedence, deeper-result revisions, and exactly one primary count per move.
- Coach checks ensuring each tactical sentence and overlay traces to verified legal board/engine evidence; unknown motifs fall back to factual evaluation feedback.
- Retry checks for answer concealment, acceptable alternative moves, incorrect feedback, unlimited attempts, hints, engine replies, cancellation, and unchanged original-game results.
- Accuracy/performance/report checks for score bounds, provisional and insufficient-data states, missing PGN ratings, forced/short games, phase coverage, absent endgames, and consistent aggregation.
- Integration checks for valid/invalid PGN and FEN, underpromotion, castling, en passant, checkmate, draws, navigation, cancellation, and stale-result isolation.
- Real Stockfish smoke test confirming engine identity, a legal best move, and actual evaluation output.
- Browser checks for import → analyze → navigate → inspect best line → export, plus interactive board moves and responsive layouts.
- Full review acceptance path: import → analyze → view both player summaries → guided key moment → visual explanation → retry → reveal/continue → report card. Independently play a sideline in Analysis and confirm its new move receives feedback without requiring a mainline review.
- Sideline checks for nested branching, selecting existing branches, return-to-game, branch-aware opening analysis, preserved mainline accuracy, history-aware draws, and PGN variation round-trips.
- Annotation checks for right-click/right-drag, touch and keyboard drawing, color/toggle/clear behavior, board flip, separate engine overlays, and per-node persistence across reload.
- PWA checks for initial download, offline launch and actual offline Stockfish analysis, interrupted downloads, asset-version upgrades, storage failures, and backup/import without losing branches or annotations.
- Offline review checks with network disabled: classifications, coach, retries, reports, repeated reviews, and deeper analysis all remain usable after the required assets are present. No account, quota counter, remote inference request, or premium gate exists in these paths.
- Production build and TypeScript validation. Visually inspect the desktop and mobile interface before delivery.

## Sources checked on 2026-09-21

- https://stockfishchess.org/ — lists Stockfish 19, released September 5, 2026.
- https://github.com/nmrugg/stockfish.js/ — browser Stockfish 19 builds and worker integration examples.
- https://github.com/lichess-org/chess-openings/blob/master/README.md — opening fields, transposition guidance, and CC0 dedication.
- https://official-stockfish.github.io/docs/stockfish-wiki/Stockfish-FAQ.html — strength reduction through Skill Level and UCI_LimitStrength/UCI_Elo.
- https://support.chess.com/en/articles/8584089-how-does-game-review-work — public overview of review, classification, coach, retries, and display settings.
- https://www.chess.com/news/view/game-review-design-update — move feedback directly in Analysis and suggested-line insertion.
- https://www.chess.com/terms/game-review — requested feature vocabulary and phase reporting.
- https://support.chess.com/en/articles/10773754-how-is-game-rating-calculated-in-game-review — distinction between single-game performance estimates and player ratings; no exact implementation formula is supplied.

## Review status

Approved by the user with “go” on 2026-09-21. Includes the complete review feature list, unlimited local-only operation, direct Analysis move feedback, sidelines, drawings, PWA support, and extension points for future teaching/play modules. This supersedes the earlier exclusion of Brilliant classification and game-rating estimates. Implementation and verification are complete; see [delivery notes](../../delivery.md) for results and limitations.
