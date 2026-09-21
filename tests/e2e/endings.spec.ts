import { test, expect, type Page } from '@playwright/test';

async function importGame(page: Page, pgn: string) {
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await page.getByRole('textbox', { name: 'PGN or FEN' }).fill(pgn);
  await page.getByRole('button', { name: 'Import & explore' }).click();
  await page.getByRole('button', { name: 'Go to end', exact: true }).click();
}

test('X flips the board, respects typing and modifier keys, and matches the toolbar control', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('switch', { name: 'Engine analysis' }).click();
  await page.getByRole('button', { name: 'Go to start', exact: true }).click();
  const corner = page.getByRole('gridcell').first();
  await expect(corner).toHaveAttribute('aria-label', /^a8 /);
  await page.keyboard.down('x');
  await expect(corner).toHaveAttribute('aria-label', /^h1 /);
  await page.keyboard.down('x'); // Key repeat must not spin the board repeatedly.
  await expect(corner).toHaveAttribute('aria-label', /^h1 /);
  await page.keyboard.up('x');
  await page.keyboard.press('Control+x');
  await expect(corner).toHaveAttribute('aria-label', /^h1 /);
  await page.getByRole('button', { name: 'Flip board', exact: true }).click();
  await expect(corner).toHaveAttribute('aria-label', /^a8 /);
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await page.getByRole('textbox', { name: 'PGN or FEN' }).fill('x');
  await page.getByRole('textbox', { name: 'PGN or FEN' }).press('x');
  await expect(corner).toHaveAttribute('aria-label', /^a8 /);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.keyboard.press('X');
  await expect(corner).toHaveAttribute('aria-label', /^h1 /);
});

test('result icons follow the kings through flips and disappear in earlier positions and sidelines', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('switch', { name: 'Engine analysis' }).click();
  await importGame(page, '1. f3 e5 2. g4 Qh4# 0-1');
  const loser = page
    .getByRole('gridcell', { name: 'e1 white king', exact: true })
    .getByRole('img', { name: 'White lost by checkmate' });
  const winner = page
    .getByRole('gridcell', { name: 'e8 black king', exact: true })
    .getByRole('img', { name: 'Black won' });
  await expect(loser).toBeVisible();
  await expect(winner).toBeVisible();
  await expect(loser.locator('img')).toHaveAttribute('src', /\/mate.svg$/);
  await expect(winner.locator('img')).toHaveAttribute('src', /\/winner.svg$/);
  await expect
    .poll(() =>
      page
        .locator('.outcome-badge img')
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  await page.keyboard.press('x');
  await expect(loser).toBeVisible();
  await expect(winner).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.outcome-badge')).toHaveCount(0);
  await page.getByRole('gridcell', { name: 'b8 black knight', exact: true }).click();
  await page.getByRole('gridcell', { name: 'c6 empty', exact: true }).click();
  await expect(page.getByText('Sideline', { exact: true })).toBeVisible();
  await expect(page.locator('.outcome-badge')).toHaveCount(0);
  await importGame(page, '[Result "1-0"]\n[Termination "Black resigned"]\n\n1. e4 e5 1-0');
  await expect(page.getByRole('img', { name: 'White won', exact: true })).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Black lost by resignation' }).locator('img'),
  ).toHaveAttribute('src', /\/resign_black.svg$/);
});
