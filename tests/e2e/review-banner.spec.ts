import { expect, test } from '@playwright/test';

test('review banner explains the selected capture above the board and closes until navigation', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('switch', { name: 'Engine analysis' }).click();
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await page.getByRole('textbox', { name: 'PGN or FEN' }).fill('1. e4 d5 2. exd5 Qxd5 *');
  await page.getByRole('button', { name: 'Import & explore', exact: true }).click();
  await page.getByRole('button', { name: 'Go to start', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Move thought' })).toHaveCount(0);
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Next move', exact: true }).click();
  const banner = page.getByRole('status', { name: 'Move thought' });
  await expect(banner).toContainText(/capture Black’s pawn on d5/);
  await expect(banner.locator('img')).toHaveAttribute('src', /wP\.svg$/);
  await expect(banner.getByLabel('e4 captures on d5')).toBeVisible();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 667 },
    { width: 320, height: 568 },
    { width: 812, height: 375 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(banner).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.chessboard')).toBeInViewport({ ratio: 1 });
    const bar = await banner.boundingBox(),
      board = await page.locator('.chessboard').boundingBox();
    expect(bar!.y + bar!.height).toBeLessThanOrEqual(board!.y - 4);
    expect(board!.width).toBeGreaterThan(viewport.width <= 320 ? 100 : 140);
    await expect(page.getByRole('button', { name: 'Next move', exact: true })).toBeInViewport({
      ratio: 1,
    });
  }
  await page.getByRole('button', { name: 'Close move thought', exact: true }).click();
  await expect(banner).toHaveCount(0);
  await page.keyboard.press('x');
  await expect(banner).toHaveCount(0);
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(banner).toContainText(/capture White’s pawn on d5/);
  await expect(banner.locator('img')).toHaveAttribute('src', /bQ\.svg$/);
  await page.screenshot({ path: test.info().outputPath('review-banner.png') });
});

test('review banner follows saved visibility and glass preferences', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('switch', { name: 'Engine analysis' }).click();
  const banner = page.getByRole('status', { name: 'Move thought' });
  await expect(banner).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('slider', { name: 'Bubble opacity', exact: true }).fill('75');
  await page.getByRole('checkbox', { name: 'Glass effect', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(banner).toHaveCSS('backdrop-filter', 'none');
  await expect(banner).toHaveCSS('--thought-opacity', '0.75');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Show thought bubbles', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(banner).toHaveCount(0);
});
