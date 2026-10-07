# Stockfish and Maia Opponents Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox syntax for tracking.

**Goal:** Offer distinct Stockfish difficulties and local Maia practice with opening guidance, saved games, and offline support.

**Architecture:** A shared play controller selects one opponent adapter. Pure opponent configuration and Maia policy modules own validation and encoding; a separate Maia worker owns inference. Versioned verified Maia assets remain independent of Stockfish assets and review.

**Tech Stack:** React, TypeScript, chess.js, Stockfish 19 Lite, ONNX Runtime Web 1.23.0, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-stockfish-and-maia-opponents-design.md`.

## Global Constraints

- Stockfish presets use skills 0, 3, 6, 10, 15, and unlimited skill 20; retain 800/1500 ms budgets.
- Maia accepts integer practice ratings 600–2600, initially 1320; condition both rating inputs equally and sample legal policy with temperature 1.
- Use Maia source revision `a6e52f5c811ee18863cb2f0e81f2433a5b9905de` and ONNX Runtime Web 1.23.0, one thread, no proxy.
- Session payload version 2 reads legacy version 1 at the existing key without losing games or legacy engine strengths.
- All assets remain same origin, resolve the Vite base path, and work offline after verified download.
- Existing unrelated working changes are preserved. Execute in the current checkout on a dedicated feature branch; commit only this feature's own files or changes.

## Review Focus

- Legacy Elo saves retain their actual engine strength and legal history; test migration and invalid configuration.
- Black positions and special moves retain policy legality; test mirrored en passant, castling, and underpromotions.
- Canceled startup or inference cannot insert an old reply; test late worker completion and opponent switches.
- Incomplete or corrupted downloads never report ready; test staging cleanup, integrity checks, and missing offline assets.
- A GitHub Pages subdirectory must load every Maia runtime asset; test production at a non-root base with networking disabled.

### Task 1: Opponent configuration and saved games

**Files:** Create `src/play/opponents.ts`; modify `src/play/game.ts`, `src/play/game.test.ts`.

**Interfaces:** Export `Opponent = {kind: 'stockfish'; strengthId: string} | {kind: 'maia'; rating: number}`, `readOpponent(unknown): Opponent | null`, `opponentFor({strengthId: string; opponent?: Opponent}): Opponent`, `opponentName(Opponent): string`, `opponentLabel(Opponent): string`, `opponentKey(Opponent): string`, and the Stockfish preset lookup. Add `PlayGame.opponent`, optional `PlaySettings.opponent`, and `changeGameOpponent(PlayGame, Opponent): PlayGame`. Preserve the existing strengthId API as a compatibility alias for existing callers; configuration is canonical for new sessions.

- [x] Write tests for Maia game identity, version 2 round trip, invalid ratings, version 1 migration with drawings/history, exact legacy Elo preservation, and opponent changes preserving the board and opening.
- [x] Run `npm test -- src/play/game.test.ts`; expect failures for missing Maia configuration and migration.
- [x] Implement configuration, six presets, legacy strength lookup, versioned persistence, and opponent changes. Keep `changeGameStrength` as the Stockfish compatibility wrapper.
- [x] Run the focused tests and `npm test`; expect all passing.

### Task 2: Maia position encoding and legal policy

**Files:** Create `src/play/maia/policy.ts`, `src/play/maia/policy.test.ts`, and prepared `src/play/maia/moves.json`.

**Interfaces:** Export `encodePosition(fen: string): Float32Array`, `legalPolicy(fen: string, logits: Float32Array): {move: string; probability: number}[]`, and `sampleMove(fen: string, logits: Float32Array, random?: () => number): string`.

- [x] Write literal fixtures for starting-position tensor channels, Black mirroring, legal-only distribution, stable large logits, castling, en passant, all promotion choices, invalid logits, and deterministic sampling.
- [x] Run `npm test -- src/play/maia/policy.test.ts`; expect missing implementation failures.
- [x] Implement the upstream encoding and move vocabulary contract using chess.js for legal moves, with stable softmax and original-position UCI output.
- [x] Run focused tests and the unit suite; expect all passing.

### Task 3: Verified assets and cancelable Maia worker

**Files:** Create `scripts/prepare-maia.mjs`, `src/play/maia/build.ts`, `src/play/maia/assets.ts`, `src/play/maia/assets.test.ts`, `src/play/maia/worker.ts`, `src/play/maia/client.ts`, `src/play/maia/client.test.ts`, `src/play/computer-engine.ts`; modify package dependencies, `.gitignore`, asset preparation, shell preparation, and `public/sw.js`.

**Interfaces:** Export `prepareMaiaWorker(signal: AbortSignal, progress: (EngineLoadState) => void): Promise<MaiaWorkerResources>` and `MaiaEngine(rating, progress, factory?)` with `start(): Promise<void>`, `bestMove(PositionInput, AbortSignal): Promise<string>`, `dispose(): void`. Export `createComputerEngine(Opponent, progress): ComputerEngine` with the same public methods. Worker messages use IDs: init with cached model and runtime URLs, inference with position tokens and rating, ready/result/error responses.

- [x] Write tests for canceled initialization, canceled inference, late responses, invalid result shape, worker errors, and verified/corrupted/missing asset sets.
- [x] Run focused tests; expect missing implementations to fail.
- [x] Prepare pinned model, vocabulary, notices, runtime module, and WASM with independent checksummed manifest/build ID. Exclude binaries from shell precache.
- [x] Implement staged asset download, cached buffers/runtime URLs, one-thread worker inference, legal sampling, cancellation, and the opponent factory.
- [x] Run focused tests, the full unit suite, and typecheck; expect all passing.

### Task 4: Shared opponent UI and opening practice

**Files:** Rename `src/play/PlayStockfish.tsx` to `src/play/PlayComputer.tsx`; modify `src/app/WorkspaceApp.tsx`, play CSS, browser navigation selectors, and opening/strength browser tests; create `tests/e2e/maia.spec.ts`.

**Interfaces:** The existing controller calls `createComputerEngine(game.opponent, progress)` and guards replies by game ID, node, and opponent key. The dialog edits the opponent configuration and Maia practice rating; legacy strengths appear only while currently selected.

- [x] Write browser tests for the Maia chooser, invalid rating, selected rating reaching real inference, a prescribed Scandinavian opening, changing opponent mid-game, preserved moves/drawings, reload, resignation, and review handoff.
- [x] Run the Maia browser test against the current UI; expect missing chooser failure.
- [x] Implement engine selection, opponent-dependent copy/headers, six difficulty choices, validated rating input, and unchanged shared opening scripts/hints/replay.
- [x] Run Maia and existing play/opening browser tests; expect all passing.

### Task 5: Production offline verification and documentation

**Files:** Extend `tests/e2e/maia.spec.ts`; update README, architecture, and third party notices without including unrelated edits in feature commits.

- [x] Add a production-only test for verified Maia download, offline reload and legal reply at a non-root base; add an interrupted/missing download retry test.
- [x] Build with `VITE_BASE_PATH=/awesome-chess/`, serve preview, and run targeted production browser tests. Expect actual Maia inference to complete without network after reload.
- [x] Measure startup/reply latency, inspect desktop/mobile chooser layout, and update documentation and notices with actual asset size and rating meaning.
- [ ] Run unit suite, typecheck, build, relevant browser suite, and a fresh code review; resolve material findings and report evidence.

## Execution

The user's instruction “perfect, make the changes” authorizes implementation of the reviewed design. Execute inline in this session without another approval checkpoint. Keep a progress ledger in `.superpowers/sdd/2026-10-07-stockfish-and-maia-opponents/` and obtain one independent code review after implementation.
