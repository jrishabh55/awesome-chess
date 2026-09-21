# Chess Room

A local-first chess review PWA with Stockfish 19, a playable analysis board, branching variations, opening recognition, and unlimited reviews. No account, server-side analysis, or AI API key is used.

## Run locally

Requires Node.js 22.14 or newer.

```sh
npm ci
npm run prepare:assets
npm run dev
```

Open the URL printed by Vite. Asset preparation downloads the pinned Lichess opening database and prepares the engine from the pinned npm package. The full Stockfish engine is about 95 MB; the optional Lite build is about 1.7 MB. Assets are served from this project, not a runtime CDN.

For the installable/offline app:

```sh
npm run build
npm run preview -- --port 5174
```

Open `http://127.0.0.1:5174`, choose **Settings → Make available offline**, and wait for engine verification. Install through your browser's install menu where supported. The service worker runs in the production build, not the development server. First use requires downloading the app and selected engine. Browser storage can be cleared, so keep JSON backups of important studies.

## Use

- **Import game:** paste PGN/FEN or upload PGN/JSON. Multi-game PGNs present a chooser; JSON backups restore every study and preserve conflicting local games as copies.
- **Review game:** analyzes the original mainline. Both players get accuracy, classification counts, an evaluation graph, phase reports, and an approximate performance estimate when there are enough meaningful decisions.
- **Analysis:** shows three engine continuations and move-quality feedback. Play a different move from any position to create a sideline. Click a continuation to add it to the tree. Return to game restores the exploration origin.
- **Board drawings:** right-click to highlight; right-drag to draw arrows. Use the visible tools on touch devices or select squares with keyboard focus and Enter. Drawings are stored with the position in the study.
- **Coach:** explains verified local evidence, shows continuations and tactical overlays, and navigates key moments.
- **Retry:** hides answers while you try a better move. Hint/reveal are optional. A sound equivalent move can pass. Save an attempt as a sideline explicitly.
- **Library:** reopen local games, export PGN with variations/comments/drawings, or create a lossless JSON backup. Settings also offers FEN copy and per-study backup.

Positive evaluations favor White; negative evaluations favor Black. Mate scores identify the winning color by sign. All move feedback is provisional until its corresponding search finishes and may change with deeper searches.

## Scoring and scope

Read [scoring policy](docs/scoring.md) for formulas and limitations. The familiar move labels are this app's own heuristics, not a reproduction of Chess.com's proprietary implementation. Game rating is an uncalibrated single-game estimate, not your real Elo. Coaching is deterministic and based on engine/board evidence; it does not call a language-model service.

The architecture supports future guided opening courses, randomized recall drills, and adjustable-strength engine opponents. Those follow-ups are not included in this review release. Opening identification currently supplies names and ECO codes rather than master-game statistics.

## Verify

```sh
npm test
npm run typecheck
npm run build
npm run test:e2e
TEST_URL=http://127.0.0.1:5174 npm run test:e2e
```

Browser tests expect a running server (`5173` by default); set `TEST_URL` for production. Chromium must be available to Playwright (`npx playwright install chromium` if needed). Offline tests run only when `TEST_URL` is set and require the production preview.

## Source and licenses

This application's source is GPL-3.0-or-later; see [LICENSE](LICENSE). Stockfish is GPLv3 and its exact corresponding-source link is recorded in the engine manifest. Opening data is CC0; the Cburnett pieces are CC BY-SA 3.0. See [third-party notices](THIRD_PARTY_NOTICES.md) and `public/licenses/`.
