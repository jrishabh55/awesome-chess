import { expect, test, type Page } from '@playwright/test';
import { Chess } from 'chess.js';

async function openPlay(page: Page) {
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: /Play (computer|Stockfish)/, exact: true })
    .click();
}
async function savedGame(page: Page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((key) => key.startsWith('chess-room-play-v1:'))!;
    return JSON.parse(localStorage.getItem(key)!).game;
  });
}
async function move(page: Page, from: string, to: string) {
  await page.getByRole('gridcell', { name: new RegExp(`^${from} `) }).click();
  await page.getByRole('gridcell', { name: new RegExp(`^${to} `) }).click();
}
async function legalHumanMove(page: Page) {
  const saved = await savedGame(page);
  const chess = new Chess();
  for (const uci of saved.moves) chess.move(uci);
  const legal = chess.moves({ verbose: true }).find((move) => !move.promotion)!;
  await move(page, legal.from, legal.to);
  await expect.poll(async () => (await savedGame(page)).moves.length).toBe(saved.moves.length + 2);
}

test('Maia follows the selected opening, uses its rating in free play, reloads and switches opponents', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).maiaRatings = [];
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message: any, ...rest: any[]) {
      if (message?.type === 'inference') (window as any).maiaRatings.push(message.rating);
      return (post as any).call(this, message, ...rest);
    };
  });
  await page.goto('./');
  await openPlay(page);
  await page.getByRole('radio', { name: 'Maia', exact: true }).click();
  const rating = page.getByRole('spinbutton', { name: 'Practice rating', exact: true });
  await expect(rating).toHaveValue('1320');
  await rating.fill('599');
  await expect(page.getByRole('button', { name: 'Start game', exact: true })).toBeDisabled();
  await rating.fill('1320');
  await page
    .getByRole('combobox', { name: 'Opening to practice', exact: true })
    .fill('Scandinavian Defense');
  await page
    .getByRole('option', {
      name: 'B01 · Scandinavian Defense: Mieses-Kotroc Variation · 1. e4 d5 2. exd5 Qxd5',
      exact: true,
    })
    .click();
  await page.getByRole('checkbox', { name: 'Follow opening variations', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible({
    timeout: 120000,
  });
  await page.getByRole('button', { name: 'Show opening move', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Move thought' })).toContainText('play e4');
  await move(page, 'e2', 'e4');
  await expect(page.getByRole('gridcell', { name: 'd5 black pawn', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible();
  await move(page, 'e4', 'd5');
  await expect(page.getByRole('gridcell', { name: 'd5 black queen', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).maiaRatings)).toEqual([]);
  await move(page, 'b1', 'c3');
  await expect.poll(async () => (await savedGame(page)).moves.length).toBe(6);
  expect(await page.evaluate(() => (window as any).maiaRatings)).toEqual([1320]);
  const saved = await savedGame(page);
  await page.reload();
  await openPlay(page);
  await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible();
  expect((await savedGame(page)).moves).toEqual(saved.moves);
  await page.getByRole('button', { name: 'Game settings', exact: true }).click();
  await rating.fill('1600');
  await page.getByRole('button', { name: 'Apply settings', exact: true }).click();
  expect((await savedGame(page)).opponent).toEqual({ kind: 'maia', rating: 1600 });
  await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible();
  await legalHumanMove(page);
  expect(await page.evaluate(() => (window as any).maiaRatings)).toEqual([1600]);
  const beforeSwitch = await savedGame(page);
  await page.getByRole('button', { name: 'Game settings', exact: true }).click();
  await page.getByRole('radio', { name: 'Stockfish', exact: true }).click();
  await page.getByRole('radio', { name: /Medium/ }).click();
  await page.getByRole('button', { name: 'Apply settings', exact: true }).click();
  expect((await savedGame(page)).moves).toEqual(beforeSwitch.moves);
  await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible();
  await legalHumanMove(page);
  await expect(page.locator('.play-player').filter({ hasText: 'Stockfish 19' })).toContainText(
    'Medium',
  );
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('Maia plays White, preserves its identity through resignation and hands the game to review', async ({
  page,
}) => {
  await page.goto('./');
  await openPlay(page);
  await page.getByRole('radio', { name: 'Maia', exact: true }).click();
  await page.getByRole('radio', { name: 'Black', exact: true }).click();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible({
    timeout: 120000,
  });
  expect((await savedGame(page)).moves).toHaveLength(1);
  await legalHumanMove(page);
  await page.getByRole('button', { name: 'Resign', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm resignation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Maia 3 wins', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review this game', exact: true }).click();
  await expect(page.locator('.play-stockfish')).toHaveCount(0);
  await expect(page.locator('.app-shell')).toContainText('Maia 3');
});

test.describe('Download recovery', () => {
  test.use({ serviceWorkers: 'block' });
  test('Maia retries a failed model download without replacing the game', async ({ page }) => {
    await page.route('**/maia/model.onnx?*', (route) => route.fulfill({ body: 'corrupt' }));
    await page.goto('./');
    await openPlay(page);
    await page.getByRole('radio', { name: 'Maia', exact: true }).click();
    await page.getByRole('button', { name: 'Start game', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('verification');
    const saved = await savedGame(page);
    await page.unroute('**/maia/model.onnx?*');
    await page.getByRole('button', { name: 'Retry engine', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible({
      timeout: 120000,
    });
    expect((await savedGame(page)).id).toBe(saved.id);
    await legalHumanMove(page);
  });
});

test('Maia continues offline after production reload', async ({ page, context }) => {
  test.skip(!process.env.TEST_URL, 'Requires the production service worker.');
  await page.goto('./');
  await openPlay(page);
  await page.getByRole('radio', { name: 'Maia', exact: true }).click();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible({
    timeout: 120000,
  });
  await legalHumanMove(page);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const saved = await savedGame(page);
  await context.setOffline(true);
  await page.reload();
  await openPlay(page);
  await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible({
    timeout: 120000,
  });
  expect((await savedGame(page)).moves).toEqual(saved.moves);
  await legalHumanMove(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test.describe('Download cancellation', () => {
  test.use({ serviceWorkers: 'block' });
  test('switching away during Maia download cancels it and continues the same game', async ({
    page,
  }) => {
    let requested!: () => void;
    const download = new Promise<void>((resolve) => {
      requested = resolve;
    });
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/maia/model.onnx?*', async (route) => {
      requested();
      await blocked;
      await route.fulfill({ body: 'canceled old download' }).catch(() => {});
    });
    await page.goto('./');
    await openPlay(page);
    await page.getByRole('radio', { name: 'Maia', exact: true }).click();
    await page.getByRole('radio', { name: 'Black', exact: true }).click();
    await page.getByRole('button', { name: 'Start game', exact: true }).click();
    await download;
    const saved = await savedGame(page);
    await page.getByRole('button', { name: 'Game settings', exact: true }).click();
    await page.getByRole('radio', { name: 'Stockfish', exact: true }).click();
    await page.getByRole('radio', { name: /Easy/ }).click();
    await page.getByRole('button', { name: 'Apply settings', exact: true }).click();
    release();
    await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible();
    expect((await savedGame(page)).id).toBe(saved.id);
    expect((await savedGame(page)).moves).toHaveLength(1);
    expect((await savedGame(page)).opponent).toEqual({ kind: 'stockfish', strengthId: 'skill-3' });
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
