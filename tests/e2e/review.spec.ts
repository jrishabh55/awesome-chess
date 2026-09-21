import { test, expect } from '@playwright/test';
test('real Stockfish analysis, branch editing, and local reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(page.getByRole('grid', { name: 'Chessboard' })).toBeVisible();
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
  await expect(page.locator('.engine-line')).toHaveCount(3, { timeout: 90000 });
  await expect(page.locator('.line-score').first()).not.toHaveText('—');
  await page.getByRole('button', { name: 'Go to start', exact: true }).click();
  await page.getByRole('gridcell', { name: 'd2 white pawn', exact: true }).click();
  await page.getByRole('gridcell', { name: 'd4 empty', exact: true }).click();
  await expect(page.getByText('Sideline', { exact: true })).toBeVisible();
  await expect(page.locator('.move-feedback')).toBeVisible({ timeout: 90000 });
  await page
    .getByRole('gridcell', { name: 'a3 empty', exact: true })
    .click({ button: 'right', modifiers: ['Control'] });
  await expect(page.locator('.board-overlay rect')).toHaveCount(1);
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Sideline', { exact: true })).toBeVisible();
  await expect(page.locator('.board-overlay rect')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('imports a short completed game and reviews both players', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'PGN or FEN' })
    .fill('[White "Learner"]\n[Black "Opponent"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
  await page.getByRole('button', { name: 'Import & explore' }).click();
  await page.getByRole('button', { name: 'Game Review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review again', exact: true })).toBeVisible({
    timeout: 110000,
  });
  await page.getByText('Accuracy & full report', { exact: true }).click();
  await expect(page.locator('.accuracy-card').first()).toBeVisible();
  await expect(page.locator('.accuracy-card strong').first()).not.toHaveText('—');
  await page.getByText('Accuracy & full report', { exact: true }).click();
  await page.getByRole('button', { name: 'Start guided review' }).click();
  await expect(page.locator('.coach-card')).toBeVisible();
  const retry = page.getByRole('button', { name: 'Retry move', exact: true });
  if (await retry.isVisible()) {
    await retry.click();
    await expect(page.getByText('Moves are hidden while you find a better move.')).toBeVisible();
    await expect(page.locator('.engine-line')).toHaveCount(0);
    await page.getByRole('button', { name: 'Exit retry' }).click();
  }
});
test('mobile board fits and touch drawing mode works', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Highlight squares', exact: true }).click();
  await page.getByRole('gridcell', { name: /^a3 / }).click();
  await expect(page.locator('.board-overlay rect')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});
test('paused engine never shows stale lines on another position', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
  await expect(page.locator('.engine-line')).toHaveCount(3);
  await page.getByRole('switch', { name: 'Engine analysis' }).click();
  await page.getByRole('button', { name: 'Go to start', exact: true }).click();
  await expect(page.locator('.engine-line')).toHaveCount(0);
  await expect(page.locator('.board-overlay line')).toHaveCount(0);
});
