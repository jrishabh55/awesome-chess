import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 812, height: 375 },
]) {
  test(`all modes keep the same board frame and accessible controls at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('./');
    await page.getByRole('switch', { name: 'Engine analysis' }).click();
    const original = await page.locator('.chessboard').boundingBox();
    const menu = page.getByRole('navigation', { name: 'Workspace' });
    for (const mode of ['Game review', 'Opening teacher', 'Play Stockfish']) {
      await menu.getByRole('button', { name: mode, exact: true }).click();
      if (mode === 'Opening teacher')
        await page.getByRole('button', { name: 'Start course', exact: true }).click();
      if (mode === 'Play Stockfish') {
        await page.getByRole('button', { name: 'Start game', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible();
        await page.getByRole('gridcell', { name: 'e2 white pawn', exact: true }).click();
        await page.getByRole('gridcell', { name: 'e4 empty', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible();
        await expect(page.locator('.move-cell.active')).toBeInViewport({ ratio: 1 });
        await page.keyboard.press('ArrowLeft');
        await expect(page.locator('.move-cell.active')).toBeInViewport({ ratio: 1 });
        await expect(
          page.getByRole('button', { name: 'Return to live game', exact: true }),
        ).toBeInViewport({ ratio: 1 });
      }
      const board = await page.locator('.chessboard').boundingBox();
      for (const key of ['x', 'y', 'width', 'height'] as const)
        expect(board![key]).toBeCloseTo(original![key], 0);
      await expect(menu.getByRole('button', { name: mode, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
      for (const name of [
        'Flip board',
        'Draw arrows',
        'Highlight squares',
        'Clear annotations',
        'Next move',
      ])
        await expect(page.getByRole('button', { name, exact: true })).toBeInViewport({ ratio: 1 });
      const panel = await page.locator('.analysis-column,.ot-panel,.play-panel').boundingBox();
      expect(panel!.width).toBeLessThanOrEqual(361);
      const overflow = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        scrollers: [...document.querySelectorAll('.workspace-content *')]
          .filter(
            (el) =>
              el.getBoundingClientRect().height > 0 &&
              el.scrollHeight > el.clientHeight + 2 &&
              ['auto', 'scroll'].includes(getComputedStyle(el).overflowY),
          )
          .map((el) => el.className),
      }));
      expect(overflow.width).toBeLessThanOrEqual(viewport.width);
      expect(overflow.height).toBeLessThanOrEqual(viewport.height);
      expect(overflow.scrollers).toEqual([]);
    }
  });
}

test('switching modes preserves the current review position and its drawings', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await page.getByRole('textbox', { name: 'PGN or FEN' }).fill('1. e4 e5 2. Nf3 Nc6 *');
  await page.getByRole('button', { name: 'Import & explore', exact: true }).click();
  await page.getByRole('button', { name: 'Go to start', exact: true }).click();
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await page.getByRole('gridcell', { name: 'd4 empty', exact: true }).click({ button: 'right' });
  await expect(page.locator('.board-overlay > rect')).toHaveCount(1);
  const menu = page.getByRole('navigation', { name: 'Workspace' });
  await menu.getByRole('button', { name: 'Opening teacher', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Opening Teacher', exact: true })).toBeVisible();
  await menu.getByRole('button', { name: 'Game review', exact: true }).click();
  await expect(page.locator('.move-cell.active')).toHaveAttribute('aria-label', 'e4');
  await expect(page.locator('.board-overlay > rect')).toHaveCount(1);
  await expect(page.getByRole('gridcell', { name: 'e4 white pawn', exact: true })).toBeVisible();
});

test('reopening a played game creates an independent review and keeps new drawings after reload', async ({
  page,
}) => {
  await page.goto('./');
  const menu = page.getByRole('navigation', { name: 'Workspace' });
  const play = () => menu.getByRole('button', { name: 'Play Stockfish', exact: true }).click();
  const mark = (square: string) =>
    page.getByRole('gridcell', { name: `${square} empty`, exact: true }).click({ button: 'right' });
  await play();
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your move', exact: true })).toBeVisible();
  await mark('e4');
  await page.getByRole('button', { name: 'Resign', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm resignation', exact: true }).click();
  await page.getByRole('button', { name: 'Review this game', exact: true }).click();
  await expect(page.locator('.board-overlay > rect')).toHaveCount(1);
  await mark('c4');
  await expect(page.locator('.board-overlay > rect')).toHaveCount(2);
  await play();
  await expect(page.locator('.board-overlay > rect')).toHaveCount(1);
  await mark('d4');
  await page.reload();
  await play();
  await expect(page.locator('.board-overlay > rect')).toHaveCount(2);
  await page.getByRole('button', { name: 'Review this game', exact: true }).click();
  await expect(page.locator('.board-overlay > rect')).toHaveCount(2);
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.board-overlay > rect')).toHaveCount(2);
  const reviews = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chess-room');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise<string[][]>((resolve, reject) => {
      const request = db.transaction('studies').objectStore('studies').getAll();
      request.onsuccess = () => {
        resolve(
          request.result
            .filter((s) => s.headers.Event === 'Casual game vs Stockfish')
            .map((s) => s.nodes[s.rootId].marks.map((m: { square: string }) => m.square).sort()),
        );
        db.close();
      };
      request.onerror = () => {
        reject(request.error);
        db.close();
      };
    });
  });
  expect(reviews).toEqual(
    expect.arrayContaining([
      ['c4', 'e4'],
      ['d4', 'e4'],
    ]),
  );
});
