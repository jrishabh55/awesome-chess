# Stockfish difficulty levels and Maia practice opponents

## Intended outcome

Offer both improvements requested after finding that Stockfish's 1320 setting behaves exactly like Skill 0. Players can choose distinct Stockfish difficulty levels or practice against Maia at a chosen human style rating. Games continue to run locally, resume after reload, support opening practice, and transfer to Stockfish review.

The user has selected both approaches. This design makes them available through the existing Play flow. Maia's rating describes the human moves its model targets; it is not a measured Chess.com or Lichess playing rating. Stockfish difficulty names make no human Elo claim. Measuring actual playing ratings against a human player pool is outside this change.

## Opponent chooser

The Play setup and game settings dialogs gain an Opponent choice: Stockfish or Maia. Navigation uses the accessible name Play computer and retains the visible Play label. Player names, loading messages, errors, result messages, PGN headers, and review handoff identify the selected opponent.

Stockfish offers these presets:

| Difficulty    | Engine setting                     |
| ------------- | ---------------------------------- |
| Beginner      | Skill 0                            |
| Easy          | Skill 3                            |
| Medium        | Skill 6                            |
| Hard          | Skill 10                           |
| Very hard     | Skill 15                           |
| Full strength | Skill 20 without strength limiting |

All six use the existing dedicated Lite Stockfish play worker. Retain the current 800 ms budget for limited levels and 1500 ms for Full strength. The levels are explicit engine settings, not calibrated human ratings; these budgets also affect effective strength. An unrestricted skill setting does not imply unlimited search time or the full analysis network.

Maia uses a validated integer input labeled Practice rating, from 600 through 2600, with an initial value of 1320. The same value conditions the model's player and opponent inputs, representing practice against a peer at the selected level. The dialog explains that Maia targets human move style at this rating. Do not add a separate human rating profile or sampling control in this release.

Stockfish remains the default for a new installation. Changing either opponent or strength in game settings retains the board, moves, opening, human side, history position, and drawings. The next free engine move uses the newly selected opponent. Existing opening scripts continue for either opponent until the recorded opening ends or the player departs from it.

## Game state and compatibility

Introduce an opponent configuration with two variants: Stockfish with a strength ID, or Maia with a practice rating. Play settings and the active game each store this configuration. Keep all opponent naming and strength validation in one pure module so setup, headers, persistence, and engine selection agree.

Write version 2 session payloads at the existing localStorage key. Read both version 1 and version 2; a version 1 session implies Stockfish. Preserve game IDs, revisions, moves, resignation, drawings, opening settings, orientation, and history position during conversion. Invalid opponent values reject the session through the existing restore error handling rather than silently choosing a different opponent.

Existing Skill 0 and Full strength IDs retain their settings. The old 1320 ID can normalize to Skill 0 because the engine behavior is identical. Existing 1600, 2000, and 2400 Elo IDs remain supported for restored games at their exact native UCI settings. They appear as Current saved strength in the Stockfish chooser until the player selects a new difficulty; they are not offered for new games. This avoids silently strengthening or weakening an unfinished game during upgrade. Selecting a new level replaces the legacy ID.

## Engine boundary

The play controller owns one opponent client with start, bestMove, and dispose methods. A small factory selects Stockfish or Maia from the active opponent configuration. Stockfish review retains its existing engine client and settings.

Rename the play component to reflect both opponents. Keep board interaction, legal game progression, scripted opening replies, save behavior, and review snapshots in the existing controller rather than duplicating them for Maia. Dispose the active client on opponent change, settings interruption, a new game, navigation away, or game completion. A result may commit only while its game ID, position, and opponent configuration are still current.

Maia requests use IDs and support cancellation. Terminate its worker on cancellation or disposal, reject pending initialization and inference promises, and ignore late responses. Release temporary object URLs when disposing. Loading and inference failures keep the game available and offer retry; they do not substitute Stockfish moves under a Maia label.

## Maia browser inference

Use the ONNX model and move vocabulary shipped by the official Maia web platform at revision `a6e52f5c811ee18863cb2f0e81f2433a5b9905de`. Its browser model is `public/maia3/maia3_simplified.onnx`, containing 45,683,686 bytes. The upstream platform has a dedicated inference worker and rating controls from 600 through 2600. [Model and browser source](https://github.com/CSSLab/maia-platform-frontend/tree/a6e52f5c811ee18863cb2f0e81f2433a5b9905de/public), [rating controls](https://github.com/CSSLab/maia-platform-frontend/blob/a6e52f5c811ee18863cb2f0e81f2433a5b9905de/src/constants/common.ts).

Pin ONNX Runtime Web to 1.23.0, matching the upstream browser integration. Run its WASM execution provider inside a dedicated worker, with one WASM thread and proxy execution disabled. Package the matching runtime module and WASM binary locally. ONNX Runtime requires the JavaScript runtime, WASM binary, and model; its documented path overrides allow local deployment. [Deployment documentation](https://onnxruntime.ai/docs/tutorials/web/deploy.html), [thread and path options](https://github.com/microsoft/onnxruntime/blob/v1.23.0/js/common/lib/env.ts).

Follow the upstream model encoding: 64 squares with 12 piece channels, rank mirroring and color reversal when Black moves, continuous rating inputs, and a 4352-entry move vocabulary. Mask the output to the exact legal moves from chess.js, apply numerically stable softmax, sample with temperature 1 and no top-p filtering, then undo Black's mirroring. Validate the chosen UCI move against the original game position before committing it. Preserve castling, en passant, and promotion legality through the legal move mask. [Encoding reference](https://github.com/CSSLab/maia-platform-frontend/blob/a6e52f5c811ee18863cb2f0e81f2433a5b9905de/src/lib/engine/tensor.ts), [output processing reference](https://github.com/CSSLab/maia-platform-frontend/blob/a6e52f5c811ee18863cb2f0e81f2433a5b9905de/src/lib/engine/maia.ts).

Use the policy output for opponent play. Maia's outcome predictions do not replace Stockfish evaluations or game review scores. Sampling naturally allows different responses to the same position; persist actual played moves rather than trying to reproduce the random sequence on reload.

## Assets and offline use

Extend asset preparation to download the model from its pinned revision, retain the move vocabulary and upstream notices, and copy the pinned ONNX runtime assets. Record byte lengths and SHA-256 checksums in a separate Maia manifest and derive its build ID from those assets. Keep the Stockfish build ID independent so a Maia update does not invalidate Stockfish downloads.

The first Maia game downloads and verifies the Maia asset set, with visible progress. Cache it through a staging cache and mark it ready only after every required asset has passed verification. The model and WASM runtime require approximately 58 MB together. Subsequent games reuse the verified set. Pass the cached model buffer and runtime URLs into the worker; transfer buffers where possible to avoid retaining unnecessary copies.

Keep the Maia model and runtime binary outside the automatically downloaded application shell. The shell includes the Maia manifest and app worker code. Update shell preparation and service worker lookup so the complete Maia asset set remains available after a production reload with networking disabled. Resolve every URL against the app base path, including GitHub Pages subdirectory deployments. An uncached Maia selection while offline shows which download is needed and preserves the saved board.

Add ONNX Runtime's MIT notice and Maia platform source and asset attribution to the existing third party notices and prepared license files. Record the exact source revision alongside the model manifest.

## Validation and delivery

Unit coverage verifies distinct Stockfish presets, legacy session migration, opponent configuration validation, correct naming, and preservation of game state on opponent changes. Maia encoding and policy tests cover both colors, castling, en passant, every promotion piece, legal move masking, stable probability calculations, and deterministic sampling through an injected random source. Worker tests cover cancellation during loading and inference, request IDs, late responses, worker failure, and retry.

Browser tests use real Stockfish and the real Maia model. Verify that both can play as White or Black, that Maia receives the selected rating, and that opponent and difficulty changes preserve the game. Verify opening practice, history navigation, reload, resignation, PGN identity, and Stockfish review handoff for Maia games. Include a production test under a non-root base path that downloads Maia, disables networking, reloads, and receives another legal Maia move. Test an interrupted or missing download without claiming offline readiness.

Measure Maia startup and reply latency during real browser verification and keep the board responsive throughout loading and inference. Any unsupported WASM initialization produces a visible error and retry path. A smoke test establishes a working local opponent; it does not establish the model's measured human playing Elo.

Document the new chooser, Stockfish levels, Maia rating meaning, download size, and offline behavior. Deliver the feature through the existing build and production test workflow; deployment is a separate action.
