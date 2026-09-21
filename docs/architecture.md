# Architecture

`src/chess` owns serializable studies and legal history. Nodes have stable IDs, parent/children links, FEN snapshots, comments, and annotations. The explicit original mainline remains separate from selected branches. chess.js validates/replays moves; @mliebelt/pgn-parser parses recursive PGN syntax.

`src/engine` owns UCI parsing and a serialized worker queue. Requests carry root FEN plus complete history. Abort drains the old job or recreates an unresponsive worker; completion uses a consistent-depth set of exact principal variations. Scores normalize to White's perspective once. Full and Lite builds are explicitly selected and engine identity is checked. Asset URLs include an immutable checksum-derived build identifier.

`src/review` compares best and played moves from the same root, creates classifications, records legal tactical evidence, and computes original-mainline reports. `src/coach` maps this evidence to text/actions. `src/retry` creates isolated attempts; saving a branch is explicit. No report reads retry or sideline moves into original-game accuracy.

`src/board` renders positions and square-based overlays; it knows nothing about review scheduling. User, engine, and coach layers remain distinct. Board orientation affects rendering rather than stored coordinates.

`src/storage` stores studies, preferences, and disposable analysis records in IndexedDB. Saves are transactional and stale revisions cannot overwrite newer ones. Backup validation replays every branch before import. Restoring ID collisions creates copies rather than silently discarding either version.

`src/offline` verifies engine assets by SHA-256 before committing an offline-ready set. The production service worker precaches the application and opening data, and routes engine requests to an explicitly matching build. User studies are never stored in, or removed with, asset caches. App updates wait for user action after a successful save.

`src/app` coordinates UI state and feature controllers. Temporary demonstrations and retries own their positions without changing the study cursor. Displayed engine results must match the selected root/history even when engine analysis is paused.

Future teaching can store authored lesson trees and node-level overlays alongside separate drill progress. Future opponent play can use the same board and UCI adapter with an independent strength profile; full-strength review remains separate. Neither requires adding a remote dependency.
