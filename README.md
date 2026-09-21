# Chess Room

[![Deploy to GitHub Pages](https://github.com/jrishabh55/awesome-chess/actions/workflows/pages.yml/badge.svg)](https://github.com/jrishabh55/awesome-chess/actions/workflows/pages.yml)

A local-first chess review PWA with Stockfish 19, a playable analysis board, branching variations, opening recognition, and unlimited reviews. No account, server-side analysis, or AI API key is used.

**[Open Chess Room](https://jrishabh55.github.io/awesome-chess/)** · [Scoring policy](docs/scoring.md) · [Architecture](docs/architecture.md)

## Features

- Stockfish 19 runs locally in a Web Worker, with full and lightweight builds, three best lines, signed evaluations, and mate scores.
- Unlimited game reviews with all ten move classifications, accuracy for both players, approximate performance ratings, and opening/middlegame/endgame reports.
- Playable sidelines, PGN variations, legal move indicators, board flipping, promotion, colored arrows, and square highlights.
- Local coach explanations, guided key moments, retry exercises, and visual tactical explanations.
- Opening names and ECO codes from the Lichess opening database.
- Local study library, PGN/FEN import, PGN export, JSON backups, and an installable offline PWA.

## Run locally

Requires Node.js 22.14 or newer.

```sh
npm ci
npm run prepare:assets
npm run dev
```

Open the URL printed by Vite. Asset preparation downloads the pinned Lichess opening database and prepares the engine from the pinned npm package. Engine startup shows download progress, verifies and caches the files, and offers retry after a failure. The full Stockfish engine is about 95 MB; the optional Lite build is about 1.7 MB. Assets are served from this project, not a runtime CDN.

On the hosted site, the full engine's first download can take several minutes on a slower connection. The loading panel lets you switch to Lite without waiting. Choose **Settings → Engine build → Lite** for a faster start, or use **Make available offline** to download and verify the full engine with visible progress. Once saved offline, it does not need to download again for each visit.

For the installable/offline app:

```sh
npm run build
npm run preview -- --port 5174
```

Open `http://127.0.0.1:5174`, choose **Settings → Make available offline**, and wait for engine verification. Install through your browser's install menu where supported. The service worker runs in the production build, not the development server. First use requires downloading the app and selected engine. Browser storage can be cleared, so keep JSON backups of important studies.

## Use

- **Import game:** paste PGN/FEN or upload PGN/JSON. Multi-game PGNs present a chooser; JSON backups restore every study and preserve conflicting local games as copies.
- **Review game:** analyzes the original mainline. Quick review (the default) uses time-limited searches; Deep review uses the selected depth. Live analysis pauses during a review, and restarting an incomplete review resumes completed moves at the same settings. Both players get accuracy, classification counts, phase reports, and an approximate performance estimate when there are enough meaningful decisions.
- **Analysis:** shows three engine continuations and move-quality feedback. Play a different move from any position to create a sideline. Click a continuation to add it to the tree. Return to game restores the exploration origin.
- **Board drawings:** plain right-click clears existing arrows/highlights, or adds a yellow highlight when none are visible. Ctrl + right-click adds a red highlight. Right-drag draws smooth arrows; knight moves use an L-shaped arrow. Use the visible tools on touch devices or select squares with keyboard focus and Enter. Drawings are stored with the position in the study.
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

## GitHub Pages

GitHub Pages serves this app as static files over HTTPS. Stockfish uses its single-threaded WebAssembly build, so hosting does not require custom cross-origin isolation headers or an analysis server. Games and reviews stay in browser storage; the host only serves app assets. Localhost and the published site have separate browser storage—use JSON export/import to move studies between them.

The [deployment workflow](.github/workflows/pages.yml) runs on pushes to `main` and can also be started manually. It installs pinned dependencies, prepares engine/opening assets, runs unit tests, builds at the repository path, and runs production browser tests (including offline Stockfish) before deploying. Generated engine binaries are deployment artifacts, not committed to Git.

For a fork, enable **Settings → Pages → Build and deployment → Source → GitHub Actions**. The workflow derives its base path from the repository name. For a custom domain or a `username.github.io` repository, change `VITE_BASE_PATH` in the workflow to `/` and adjust `TEST_URL` to match.

Reproduce the project-path deployment locally:

```sh
VITE_BASE_PATH=/awesome-chess/ npm run build
VITE_BASE_PATH=/awesome-chess/ npm run preview -- --port 5174
# In a second terminal:
TEST_URL=http://127.0.0.1:5174/awesome-chess/ npm run test:e2e
```

Offline use requires one successful visit, the app shell to finish caching, and the automatic engine download to finish. **Settings → Make available offline** lets you verify the selected engine again. Reviews have no daily quota. Work remains on your device, including when the app is opened from GitHub Pages.

When an update is offered, **Save & update** saves the current study and review before activating the new app. The button shows saving/updating progress and offers **Retry update** if activation fails. Updates refresh the app shell without clearing your study library or downloaded engines.

## Source and licenses

This application's source is GPL-3.0-or-later; see [LICENSE](LICENSE). Stockfish is GPLv3 and its exact corresponding-source link is recorded in the engine manifest. Opening data is CC0; the Cburnett pieces are CC BY-SA 3.0. See [third-party notices](THIRD_PARTY_NOTICES.md) and `public/licenses/`.
