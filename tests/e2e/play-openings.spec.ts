import { expect, test } from '@playwright/test';

test('Stockfish follows a chosen opening, keeps it after reload, and allows strength changes without restarting', async ({
  page,
}) => {
  await page.goto('./');
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Play Stockfish', exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Opening to practice', exact: true })
    .fill('Scandinavian Defense');
  await page
    .getByRole('option', {
      name: 'B01 · Scandinavian Defense: Mieses-Kotroc Variation · 1. e4 d5 2. exd5 Qxd5',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show opening move', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Move thought' })).toContainText('play e4');
  await expect(page.locator('.annotation-arrow')).toHaveAttribute('stroke', '#8fbb55');
  await page.getByRole('gridcell', { name: 'e2 white pawn', exact: true }).click();
  await page.getByRole('gridcell', { name: 'e4 empty', exact: true }).click();
  await expect(page.getByRole('gridcell', { name: 'd5 black pawn', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible();
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Play Stockfish', exact: true })
    .click();
  await page.getByRole('button', { name: 'Game settings', exact: true }).click();
  await page.getByRole('radio', { name: /≈1600 Elo/ }).click();
  await page.getByRole('button', { name: 'Apply settings', exact: true }).click();
  await expect(page.getByRole('gridcell', { name: 'e4 white pawn', exact: true })).toBeVisible();
  await expect(page.getByRole('gridcell', { name: 'd5 black pawn', exact: true })).toBeVisible();
  await expect(page.locator('.play-player').filter({ hasText: 'Stockfish 19' })).toContainText(
    '≈1600 Elo',
  );
  await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible();
  await page.getByRole('gridcell', { name: 'e4 white pawn', exact: true }).click();
  await page.getByRole('gridcell', { name: 'd5 black pawn', exact: true }).click();
  await expect(page.getByRole('gridcell', { name: 'd5 black queen', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Board settings', exact: true }).click();
  await expect(page.getByRole('radio', { name: /≈1600 Elo/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('a Black opening game starts with its selected White reply', async ({ page }) => {
  await page.goto('./');
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Play Stockfish', exact: true })
    .click();
  await page.getByRole('radio', { name: 'Black', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Opening to practice', exact: true })
    .fill('Scandinavian Defense');
  await page
    .getByRole('option', {
      name: 'B01 · Scandinavian Defense: Mieses-Kotroc Variation · 1. e4 d5 2. exd5 Qxd5',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect(page.getByRole('gridcell', { name: 'e4 white pawn', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible();
  await page.getByRole('gridcell', { name: 'd7 black pawn', exact: true }).click();
  await page.getByRole('gridcell', { name: 'd5 empty', exact: true }).click();
  await expect(page.getByRole('gridcell', { name: 'd5 white pawn', exact: true })).toBeVisible();
});

test('settings can interrupt a live engine search and resume the same game', async ({ page }) => {
  await page.goto('./');
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Play Stockfish', exact: true })
    .click();
  await page.getByRole('radio', { name: /Full strength/ }).click();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible();
  await page.getByRole('gridcell', { name: 'e2 white pawn', exact: true }).click();
  await page.getByRole('gridcell', { name: 'e4 empty', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Stockfish is thinking…', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Game settings', exact: true }).click();
  await page.getByRole('radio', { name: /≈1600 Elo/ }).click();
  await page.getByRole('button', { name: 'Apply settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('gridcell', { name: 'e4 white pawn', exact: true })).toBeVisible();
  await expect(page.locator('.move-cell')).toHaveCount(2);
});

test('long opening names leave a usable board when a phone shows an opening hint', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('./');
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Play Stockfish', exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Opening to practice', exact: true })
    .fill('Morris Countergambit Accepted');
  await page.getByRole('option').first().click();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show opening move', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Move thought' })).toContainText('play d4');
  const board = await page.getByRole('grid', { name: 'Chessboard', exact: true }).boundingBox();
  expect(board!.width).toBeGreaterThan(100);
  const next = await page.getByRole('button', { name: 'Next move', exact: true }).boundingBox();
  expect(next!.y + next!.height).toBeLessThanOrEqual(568);
});
