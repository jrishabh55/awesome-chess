import { test, expect } from '@playwright/test';

test('plays a legal game, resumes it, flips with X, resigns and opens review', async ({ page }) => {
  await page.goto('');
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Play Stockfish', exact: true })
    .click();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible({ timeout: 120000 });
  await page.getByRole('gridcell', { name: /^e2 / }).click();
  await page.getByRole('gridcell', { name: /^e4 / }).click();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.play-moves')).toContainText('e4');
  await page.keyboard.press('x');
  await expect(page.locator('.play-stockfish')).toHaveAttribute('data-orientation', 'b');
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Game review', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Play Stockfish', exact: true })
    .click();
  await expect(page.locator('.play-moves')).toContainText('e4');
  await page.getByRole('button', { name: 'Resign', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm resignation', exact: true }).click();
  await expect(page.getByText('Stockfish wins', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'White lost by resignation' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Review this game', exact: true }).click();
  await expect(page.locator('.play-stockfish')).toHaveCount(0);
});

test('starts as black and cancels an engine turn when starting a new game', async ({ page }) => {
  await page.goto('');
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Play Stockfish', exact: true })
    .click();
  await page.getByRole('radio', { name: 'Black', exact: true }).click();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible({ timeout: 120000 });
  await expect(page.locator('.play-stockfish')).toHaveAttribute('data-orientation', 'b');
  await expect(page.locator('.play-moves .move-row')).toHaveCount(1);
  await page.getByRole('gridcell', { name: /^e7 / }).click();
  await page.getByRole('gridcell', { name: /^e5 / }).click();
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByRole('radio', { name: 'White', exact: true }).click();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
  // Span the previous engine search: its eventual reply must not enter this game.
  await page.waitForTimeout(1800);
  await expect(page.locator('.play-moves .move-row')).toHaveCount(0);
  await expect(page.getByRole('gridcell', { name: 'e2 white pawn', exact: true })).toBeVisible();
});

test('keeps board and core controls inside desktop, phone and landscape viewports', async ({
  page,
}) => {
  await page.goto('');
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Play Stockfish', exact: true })
    .click();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible({ timeout: 120000 });
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 667 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    const geometry = await page.evaluate(() => {
      const bounds = (selector: string) => {
        const r = document.querySelector(selector)!.getBoundingClientRect();
        return {
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
          width: r.width,
          height: r.height,
        };
      };
      return {
        board: bounds('.play-stockfish .chessboard'),
        actions: bounds('.play-actions'),
        scrollHeight: document.documentElement.scrollHeight,
      };
    });
    for (const rect of [geometry.board, geometry.actions]) {
      expect(rect.top).toBeGreaterThanOrEqual(0);
      expect(rect.bottom).toBeLessThanOrEqual(viewport.height);
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.right).toBeLessThanOrEqual(viewport.width);
    }
    expect(geometry.scrollHeight).toBeLessThanOrEqual(viewport.height);
    expect(Math.abs(geometry.board.width - geometry.board.height)).toBeLessThan(1);
    await page.screenshot({ path: `/tmp/chess-play-${viewport.width}x${viewport.height}.png` });
  }
});

test('browses history during an engine reply and resumes without truncating the live game', async ({
  page,
}) => {
  await page.goto('');
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Play Stockfish', exact: true })
    .click();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible({ timeout: 120000 });
  await page.getByRole('gridcell', { name: 'e2 white pawn', exact: true }).click();
  await page.getByRole('gridcell', { name: 'e4 empty', exact: true }).click();
  await page.keyboard.press('ArrowLeft');
  await expect(
    page.getByRole('heading', { name: 'Viewing game history', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('gridcell', { name: 'e2 white pawn', exact: true })).toBeVisible();
  await expect(page.locator('.play-position-caption')).toContainText('half-move 0 of 2', {
    timeout: 30000,
  });
  await page.getByRole('gridcell', { name: 'd2 white pawn', exact: true }).click();
  await page.getByRole('gridcell', { name: 'd4 empty', exact: true }).click();
  await expect(page.getByRole('gridcell', { name: 'd2 white pawn', exact: true })).toBeVisible();
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Play Stockfish', exact: true })
    .click();
  await expect(page.locator('.play-position-caption')).toContainText('half-move 0 of 2');
  const saved = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('chess-room-play-v1:'))!;
    return JSON.parse(localStorage.getItem(key)!);
  });
  expect(saved.game.moves).toHaveLength(2);
  expect(saved.game.moves[0]).toBe('e2e4');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.play-position-caption')).toContainText('half-move 1 of 2');
  await page.getByRole('button', { name: 'Return to live game', exact: true }).click();
  await expect(page.locator('.play-position-caption')).toHaveText('Live game · 2 half-moves');
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Previous move', exact: true }).click();
  await expect(page.locator('.play-position-caption')).toContainText('half-move 1 of 2');
  await page.getByRole('button', { name: 'Go to start', exact: true }).click();
  await expect(page.getByRole('gridcell', { name: 'e2 white pawn', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Go to end', exact: true }).click();
  await expect(page.locator('.play-position-caption')).toHaveText('Live game · 2 half-moves');
});

test('draws with touch controls, keeps drawings per position and clears the viewed position', async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 1100, height: 800 },
  });
  const page = await context.newPage();
  try {
    await page.goto((process.env.TEST_URL || 'http://127.0.0.1:5173').replace(/\/?$/, '/'));
    await page
      .getByRole('navigation', { name: 'Workspace' })
      .getByRole('button', { name: 'Play Stockfish', exact: true })
      .click();
    await page.getByRole('button', { name: 'Start game', exact: true }).tap();
    await expect(page.getByText('Your move', { exact: true })).toBeVisible({ timeout: 120000 });
    await page.getByRole('button', { name: 'Draw arrows', exact: true }).tap();
    await page.getByRole('button', { name: 'blue annotations', exact: true }).tap();
    await page.getByRole('gridcell', { name: 'e2 white pawn', exact: true }).tap();
    await page.getByRole('gridcell', { name: 'e4 empty', exact: true }).tap();
    await expect(page.locator('.annotation-arrow')).toHaveCount(1);
    await page.getByRole('button', { name: 'Highlight squares', exact: true }).tap();
    await page.getByRole('gridcell', { name: 'd4 empty', exact: true }).tap();
    await expect(page.locator('.board-overlay > rect')).toHaveCount(1);
    await page.getByRole('button', { name: 'Move pieces', exact: true }).tap();
    await page.getByRole('gridcell', { name: 'e2 white pawn', exact: true }).tap();
    await page.getByRole('gridcell', { name: 'e4 empty', exact: true }).tap();
    await expect(page.getByText('Your move', { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.annotation-arrow')).toHaveCount(0);
    await page.getByRole('button', { name: 'Go to start', exact: true }).tap();
    await expect(page.locator('.annotation-arrow')).toHaveCount(1);
    await page.reload();
    await page
      .getByRole('navigation', { name: 'Workspace' })
      .getByRole('button', { name: 'Play Stockfish', exact: true })
      .click();
    await expect(page.locator('.annotation-arrow')).toHaveCount(1);
    await expect(page.locator('.board-overlay > rect')).toHaveCount(1);
    await page.getByRole('button', { name: 'Clear annotations', exact: true }).tap();
    await expect(page.locator('.annotation-arrow')).toHaveCount(0);
    await expect(page.locator('.board-overlay > rect')).toHaveCount(0);
    await expect(page.locator('.play-position-caption')).toContainText('half-move 0 of 2');
  } finally {
    await context.close();
  }
});
