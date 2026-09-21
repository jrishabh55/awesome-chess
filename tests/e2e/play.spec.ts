import { test, expect } from '@playwright/test';

test('plays a legal game, resumes it, flips with X, resigns and opens review', async ({ page }) => {
  await page.goto('');
  await page.getByRole('combobox', { name: 'Workspace' }).selectOption('play');
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible({ timeout: 120000 });
  await page.getByRole('gridcell', { name: /^e2 / }).click();
  await page.getByRole('gridcell', { name: /^e4 / }).click();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.play-moves')).toContainText('e4');
  await page.keyboard.press('x');
  await expect(page.locator('.play-stockfish')).toHaveAttribute('data-orientation', 'b');
  await page.getByRole('button', { name: 'Back to review', exact: true }).click();
  await page.getByRole('combobox', { name: 'Workspace' }).selectOption('play');
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
  await page.getByRole('combobox', { name: 'Workspace' }).selectOption('play');
  await page.getByRole('radio', { name: 'Black', exact: true }).click();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible({ timeout: 120000 });
  await expect(page.locator('.play-stockfish')).toHaveAttribute('data-orientation', 'b');
  await expect(page.locator('.play-move-pair')).toHaveCount(1);
  await page.getByRole('gridcell', { name: /^e7 / }).click();
  await page.getByRole('gridcell', { name: /^e5 / }).click();
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByRole('radio', { name: 'White', exact: true }).click();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
  // Span the previous engine search: its eventual reply must not enter this game.
  await page.waitForTimeout(1800);
  await expect(page.locator('.play-move-pair')).toHaveCount(0);
  await expect(page.getByRole('gridcell', { name: 'e2 white pawn', exact: true })).toBeVisible();
});

test('keeps board and core controls inside desktop, phone and landscape viewports', async ({
  page,
}) => {
  await page.goto('');
  await page.getByRole('combobox', { name: 'Workspace' }).selectOption('play');
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
