# Delivery record

The local-only review application is implemented on `feat/local-review`. Production preview: http://127.0.0.1:5174 . Development server: http://127.0.0.1:5173 . Both serve only the loopback interface.

## Verification

- `npm test`: 40 tests passed.
- `npm run build`: TypeScript and production build passed.
- `npm run test:production`: 7 browser tests passed, including actual full/Lite Stockfish, PGN import and review, playable sidelines, saved annotations, mobile layout, paused-engine isolation, forced-mate sacrifice classification, offline reload, repeated offline reviews, and failed-download readiness.
- Additional repeated desktop/mobile/tactics runs passed 10/10 before the final production run.
- Desktop and mobile screenshots were visually inspected.
- `git diff --check`: passed.

An independent reviewer found eight important issues. The fix pass addressed full backup validation and restoration, preserved mainline/comment order in repeated PGN branches, stale paused-engine results, mixed-depth PV output, immutable engine cache routing, offline build readiness, and illegal pinned-piece tactical targets. Regression tests cover the affected behavior. Browser testing additionally fixed save acknowledgment timing and a static asset cache-header mismatch.

## Implementation decisions and departures

1. Used the supplied empty workspace on a new feature branch rather than an additional worktree; there was no existing checkout to protect. Cost if this preference changes: move the branch into another workspace.
2. Used the maintained `@mliebelt/pgn-parser` for recursive PGN syntax and a custom legal tree adapter instead of a handwritten tokenizer. Cost if unsuitable: replace the adapter's parser dependency.
3. Kept UCI mate distance in moves with an explicit winning side, rather than converting it to plies. Cost if another consumer needs plies: add a formatter/conversion adapter.
4. While the large Stockfish package downloaded, independent domain/policy work proceeded; initial Node assertions were followed by the complete Vitest suite. Cost: verification order differed from the planned task order.
5. Used coherent integrated Git checkpoints instead of one commit per task while shared UI modules were assembled. Cost: larger review ranges.
6. A sound sacrifice ending in a verified mate before four plies can qualify as Brilliant, because no additional replies exist. Cost: this conservative rule may still classify differently from other review services. Morphy's Qb8+ mate is verified end to end.
7. Kept the local feature branch and did not merge or publish: this new repository has no pre-existing base branch or remote. Integration can be chosen when a destination exists.

There are no deferred minor findings from the independent reviewer. Performance ratings and special move labels remain documented heuristics, not Chess.com-identical or calibrated Elo. Opening teacher/drill and adjustable-strength opponent modes are the explicitly planned follow-ups, not part of this release.
