# Scoring policy v1

These transparent heuristics are specific to Chess Room. They are not calibrated Chess.com scores or a population model of human strength. The UI shows completed analysis depth; deeper searches may change labels.

## Engine comparison

Scores are normalized to White's perspective, then converted to the mover's perspective for scoring. For centipawn score c, expected-result proxy is `1 / (1 + exp(-c / 250))`. A forced mate is 1 for its winner and 0 for its loser; exact draws are .5. Loss is `max(0, bestExpected - playedExpected)`, using completed exact root searches. The played move receives its own constrained search when absent from the top variations.

## Labels

Best is the engine's top move. Other moves are Excellent for loss ≤ .01, Good ≤ .03, Inaccuracy ≤ .08, Mistake ≤ .18, otherwise Blunder. Allowing an avoidable forced mate is a Blunder; abandoning a forced mate for a non-mating line is at least an Inaccuracy.

Book requires the resulting position to be in a known opening continuation, not merely to retain an earlier opening name.

Great requires a verified uniquely critical move: an expected-result gap ≥ .12 to the strongest alternative, and either avoiding a loss (best ≥ .40, alternative ≤ .25) or retaining a win (best ≥ .75, alternative ≤ .55). A sole legal move is not Great.

Brilliant requires a sound voluntary material sacrifice of at least two points, Best/Excellent quality, and a defensible position (expected proxy ≥ .40). Every legal immediate acceptance capture is analyzed. The sacrificed material must remain unrecovered for four plies, or until an earlier verified mating finish. Ordinary equal exchanges and forced recaptures do not qualify. This conservative local definition intentionally does not label every sacrifice brilliant.

Miss requires an error that forfeits a verified mating or material-winning continuation. It is distinct from the base error severity, which remains recorded. Special-label candidates use at least depth 18 and deeper analysis than the base search. Geometric attacks alone are not proof of a forced win; targets are filtered for king safety.

Primary display precedence is Miss for a verified error, otherwise the error label, otherwise Brilliant, Great, Book, then ordinary quality. Each move contributes one classification count.

## Accuracy

Per-move accuracy is `100 * exp(-5 * loss)`. Player accuracy is its arithmetic mean over analyzed non-forced original-mainline moves. Book moves keep their real engine loss. Empty samples show unavailable; incomplete reviews show provisional progress. Side branches and retries never affect these numbers.

## Approximate game rating

A meaningful decision offers at least two legal moves and has expected result between .10 and .90, or is a verified critical-gap decision. At least six analyzed meaningful decisions are required.

Let A be accuracy across these decisions and C their average critical-gap contribution: for moves with move accuracy ≥ 86, `min(.25, gap) / .25`, otherwise zero. The estimate is `400 + 2600 * (A/100)^4 + 100*C`, clamped to 400–3200 and rounded to 50. It is explicitly uncalibrated and must not be interpreted as the player's real Elo. Short, highly forced games provide insufficient information.

## Reports and coaching

Phases advance from opening to middlegame to endgame using opening recognition, development, castling rights, and material. Endgame begins with total non-pawn/non-king material ≤ 13, or ≤ 20 with both queens absent. Opening ends by ply 24, or sooner once development or the end of recognized theory warrants it. Phases never move backward after a promotion. A phase not reached is distinguished from one awaiting analysis.

Coach text comes from structured local evidence. Specific fork, pin, material, sacrifice, and mate demonstrations must have a legally replayable continuation. Unknown ideas receive factual move/evaluation feedback rather than invented prose.
