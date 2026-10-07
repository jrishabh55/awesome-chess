import { expect, test, type Page } from '@playwright/test';

// Keep catalog fixtures deterministic even when the production worker precaches data.
test.use({ serviceWorkers: 'block' });

const data =
  'eco\tname\tpgn\n' +
  [
    'C25\tVienna Game\t1. e4 e5 2. Nc3',
    'C29\tVienna Game: Gambit\t1. e4 e5 2. Nc3 Nf6 3. f4 d5 4. fxe5 Nxe4 5. Nf3 Nc6',
    'C26\tVienna Game: Mieses\t1. e4 e5 2. Nc3 Nf6 3. g3 d5 4. exd5 Nxd5',
    'C25\tVienna Game: Max Lange\t1. e4 e5 2. Nc3 Nc6 3. Bc4 Bc5',
  ].join('\n');
async function openPlay(page: Page) {
  await page.route(/\/data\/[a-e]\.tsv$/, (route) =>
    route.fulfill({ contentType: 'text/tab-separated-values', body: data }),
  );
  await page.goto('./');
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Play computer', exact: true })
    .click();
}
async function chooseVienna(page: Page) {
  await page
    .getByRole('combobox', { name: 'Opening to practice', exact: true })
    .fill('Vienna Game');
  await page
    .getByRole('option', { name: 'C25 · Vienna Game · 1. e4 e5 2. Nc3', exact: true })
    .click();
}
async function move(page: Page, from: string, to: string) {
  await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible();
  await page.getByRole('gridcell', { name: new RegExp(`^${from} `) }).click();
  await page.getByRole('gridcell', { name: new RegExp(`^${to} `) }).click();
}

for (const opponent of ['Stockfish', 'Maia']) {
  test.describe(`${opponent} opening branches`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((opponent) => {
        const key = 'chess-room-play-v1:' + new URL(document.baseURI).pathname;
        if (localStorage.getItem(key)) return;
        localStorage.setItem(
          key,
          JSON.stringify({
            version: 2,
            orientation: 'w',
            game: null,
            settings: {
              side: 'w',
              strengthId: 'skill-0',
              opponent:
                opponent === 'Maia'
                  ? { kind: 'maia', rating: 1320 }
                  : { kind: 'stockfish', strengthId: 'skill-0' },
            },
          }),
        );
      }, opponent);
    });
    test('follows a different available branch beyond the base and completes its full line', async ({
      page,
    }) => {
      await openPlay(page);
      await chooseVienna(page);
      const setting = page.getByRole('checkbox', {
        name: 'Follow opening variations',
        exact: true,
      });
      await expect(setting).toBeChecked();
      const picker = await page
        .getByRole('combobox', { name: 'Opening to practice' })
        .boundingBox();
      const box = await setting.boundingBox();
      expect(box!.y).toBeGreaterThan(picker!.y + picker!.height);
      await page.getByRole('button', { name: 'Start game', exact: true }).click();
      await move(page, 'e2', 'e4');
      await expect(
        page.getByRole('gridcell', { name: 'e5 black pawn', exact: true }),
      ).toBeVisible();
      await move(page, 'b1', 'c3');
      await expect(
        page.getByRole('gridcell', { name: 'f6 black knight', exact: true }),
      ).toBeVisible();
      await move(page, 'g2', 'g3');
      await expect(
        page.getByRole('gridcell', { name: 'd5 black pawn', exact: true }),
      ).toBeVisible();
      await move(page, 'e4', 'd5');
      await expect(
        page.getByRole('gridcell', { name: 'd5 black knight', exact: true }),
      ).toBeVisible();
      await expect(page.locator('.play-opening-status')).toContainText('Vienna Game: Mieses');
      await expect(page.locator('.play-opening-status')).toContainText('Opening complete');
      await move(page, 'f1', 'g2');
      await expect(page.getByRole('status', { name: 'Move thought' })).toHaveCount(0);
    });

    test('departure offers replay and restores the same opening after reload', async ({ page }) => {
      await openPlay(page);
      await chooseVienna(page);
      await page.getByRole('button', { name: 'Start game', exact: true }).click();
      await move(page, 'e2', 'e4');
      await expect(
        page.getByRole('gridcell', { name: 'e5 black pawn', exact: true }),
      ).toBeVisible();
      await move(page, 'b1', 'c3');
      await expect(
        page.getByRole('gridcell', { name: 'f6 black knight', exact: true }),
      ).toBeVisible();
      await move(page, 'a2', 'a3');
      const banner = page.getByRole('status', { name: 'Move thought' });
      await expect(banner).toContainText('You left this opening');
      await expect(
        banner.getByRole('button', { name: 'Replay opening', exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible();
      await expect(banner).toContainText('You left this opening');
      await banner.getByRole('button', { name: 'Close move thought', exact: true }).click();
      await expect(banner).toHaveCount(0);
      await expect(
        page.locator('.play-status').getByRole('button', { name: 'Replay opening', exact: true }),
      ).toBeVisible();
      await page.reload();
      await page
        .getByRole('navigation', { name: 'Workspace' })
        .getByRole('button', { name: 'Play computer', exact: true })
        .click();
      await expect(banner).toContainText('You left this opening');
      await page.setViewportSize({ width: 320, height: 568 });
      await expect(banner).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole('button', { name: 'Next move', exact: true })).toBeInViewport({
        ratio: 1,
      });
      await banner.getByRole('button', { name: 'Replay opening', exact: true }).click();
      await expect(
        page.getByRole('gridcell', { name: 'e2 white pawn', exact: true }),
      ).toBeVisible();
      await expect(page.locator('.move-cell')).toHaveCount(0);
      await page.reload();
      await page
        .getByRole('navigation', { name: 'Workspace' })
        .getByRole('button', { name: 'Play computer', exact: true })
        .click();
      await move(page, 'e2', 'e4');
      await expect(
        page.getByRole('gridcell', { name: 'e5 black pawn', exact: true }),
      ).toBeVisible();
      await move(page, 'b1', 'c3');
      await expect(
        page.getByRole('gridcell', { name: 'f6 black knight', exact: true }),
      ).toBeVisible();
    });

    test('new game can disable branch following and preserves that preference', async ({
      page,
    }) => {
      await openPlay(page);
      await chooseVienna(page);
      await page
        .getByRole('checkbox', { name: 'Follow opening variations', exact: true })
        .uncheck();
      await page.getByRole('button', { name: 'Start game', exact: true }).click();
      await move(page, 'e2', 'e4');
      await expect(
        page.getByRole('gridcell', { name: 'e5 black pawn', exact: true }),
      ).toBeVisible();
      await move(page, 'b1', 'c3');
      await expect(page.locator('.play-opening-status')).toContainText('Opening complete');
      await page.getByRole('button', { name: 'New game', exact: true }).click();
      await expect(
        page.getByRole('checkbox', { name: 'Follow opening variations', exact: true }),
      ).not.toBeChecked();
    });

    test('hidden move thoughts still provide a departure warning and replay', async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem(
          'chess-room.opening-preferences.v1',
          JSON.stringify({
            version: 1,
            preferences: { showThoughts: false },
          }),
        );
      });
      await openPlay(page);
      await chooseVienna(page);
      await page.getByRole('button', { name: 'Start game', exact: true }).click();
      await move(page, 'a2', 'a3');
      await expect(page.locator('.play-opening-status')).toContainText('Opening left');
      await expect(page.getByRole('status', { name: 'Move thought' })).toHaveCount(0);
      await page
        .locator('.play-status')
        .getByRole('button', { name: 'Replay opening', exact: true })
        .click();
      await expect(
        page.getByRole('gridcell', { name: 'e2 white pawn', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('gridcell', { name: 'a2 white pawn', exact: true }),
      ).toBeVisible();
      await expect(page.locator('.move-cell')).toHaveCount(0);
    });

    test('Black can choose a recorded reply and finish that complete branch', async ({ page }) => {
      await openPlay(page);
      await chooseVienna(page);
      await page.getByRole('radio', { name: 'Black', exact: true }).click();
      await page.getByRole('button', { name: 'Start game', exact: true }).click();
      await expect(
        page.getByRole('gridcell', { name: 'e4 white pawn', exact: true }),
      ).toBeVisible();
      await move(page, 'e7', 'e5');
      await expect(
        page.getByRole('gridcell', { name: 'c3 white knight', exact: true }),
      ).toBeVisible();
      await move(page, 'b8', 'c6');
      await expect(
        page.getByRole('gridcell', { name: 'c4 white bishop', exact: true }),
      ).toBeVisible();
      await move(page, 'f8', 'c5');
      await expect(page.locator('.play-opening-status')).toContainText('Vienna Game: Max Lange');
      await expect(page.locator('.play-opening-status')).toContainText('Opening complete');
      await expect(page.getByRole('status', { name: 'Move thought' })).toHaveCount(0);
    });
  });
}
