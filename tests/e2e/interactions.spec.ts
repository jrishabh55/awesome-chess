import { test, expect } from '@playwright/test';

async function quietBoard(page: import('@playwright/test').Page) {
  await page.goto('./');
  await page.getByRole('switch', { name: 'Engine analysis' }).click();
  await page.getByRole('button', { name: 'Go to start', exact: true }).click();
}
async function center(page: import('@playwright/test').Page, square: string) {
  const box = await page.getByRole('gridcell', { name: new RegExp(`^${square} `) }).boundingBox();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

test('arrow keys navigate after board clicks, annotations, and focused panel controls', async ({
  page,
}) => {
  await quietBoard(page);
  await page.getByRole('gridcell', { name: 'b1 white knight', exact: true }).click();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('gridcell', { name: 'e4 white pawn', exact: true })).toBeVisible();
  await page.getByRole('gridcell', { name: 'a3 empty', exact: true }).click({ button: 'right' });
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('gridcell', { name: 'e2 white pawn', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Review speed' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('gridcell', { name: 'e4 white pawn', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Review speed' })).toHaveValue('quick');
});

test('keyboard navigation follows a played sideline and preserves text editing', async ({
  page,
}) => {
  await quietBoard(page);
  await page.getByRole('gridcell', { name: 'd2 white pawn', exact: true }).click();
  await page.getByRole('gridcell', { name: 'd4 empty', exact: true }).click();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('gridcell', { name: 'd2 white pawn', exact: true })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('gridcell', { name: 'd4 white pawn', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'PGN or FEN' });
  await input.fill('1. e4');
  await input.press('ArrowLeft');
  await expect(page.getByRole('gridcell', { name: 'd4 white pawn', exact: true })).toBeVisible();
  expect(await input.evaluate((el: HTMLTextAreaElement) => el.selectionStart)).toBe(4);
});

test('pieces keep their identity and animate when moving and rewinding', async ({ page }) => {
  await quietBoard(page);
  const pawn = await page.locator('[data-piece="e2"]').elementHandle();
  expect(await pawn!.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0.19s');
  await page.getByRole('gridcell', { name: 'e2 white pawn', exact: true }).click();
  await page.getByRole('gridcell', { name: 'e4 empty', exact: true }).click();
  expect(await pawn!.getAttribute('data-piece')).toBe('e4');
  expect(await pawn!.evaluate((el) => el.getAnimations().length)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Previous move', exact: true }).click();
  expect(await pawn!.getAttribute('data-piece')).toBe('e2');
});

test('right drawing follows the pointer, makes knight elbows, and clears with a click', async ({
  page,
}) => {
  await quietBoard(page);
  const from = await center(page, 'b1'),
    to = await center(page, 'c3');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(to.x - 9, to.y + 5, { steps: 6 });
  const preview = page.locator('.drawing-preview');
  await expect(preview).toBeVisible();
  const first = await preview.getAttribute('d');
  await page.mouse.move(to.x - 3, to.y + 2);
  await expect(preview).not.toHaveAttribute('d', first!);
  await page.mouse.move(to.x, to.y);
  await page.mouse.up({ button: 'right' });
  await expect(page.locator('.annotation-arrow')).toHaveAttribute(
    'd',
    'M 1.5 7.5 L 1.5 5.5 L 2.5 5.5',
  );
  await page.getByRole('gridcell', { name: 'a3 empty', exact: true }).click({ button: 'right' });
  await expect(page.locator('.annotation-arrow')).toHaveCount(0);
  await expect(page.locator('.board-overlay rect')).toHaveCount(0);
  await page.getByRole('gridcell', { name: 'a3 empty', exact: true }).click({ button: 'right' });
  await expect(page.locator('.board-overlay rect')).toHaveAttribute('fill', '#ebbd42');
  await page
    .getByRole('gridcell', { name: 'a4 empty', exact: true })
    .click({ button: 'right', modifiers: ['Control'] });
  await expect(page.locator('.board-overlay rect[fill="#e56464"]')).toHaveCount(1);
  await page.getByRole('gridcell', { name: 'a5 empty', exact: true }).click({ button: 'right' });
  await expect(page.locator('.board-overlay rect')).toHaveCount(0);
});

test('moves precede the report and move-quality badges use real icons', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Go to start', exact: true }).click();
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Book move', exact: true })).toBeVisible({
    timeout: 90000,
  });
  await expect(page.locator('.board-badge svg')).toHaveCount(1);
  await expect(page.locator('.eval-chart')).toHaveCount(0);
  expect(
    await page
      .locator('.move-list')
      .evaluate((el) =>
        Boolean(
          el.compareDocumentPosition(document.querySelector('.panel-body')!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ),
  ).toBe(true);
});

test('engine download failure offers retry and a successful retry reaches analysis', async ({
  page,
  context,
}) => {
  await context.route('**/engine/stockfish-*', (route) => route.abort('failed'));
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Retry engine', exact: true })).toBeVisible();
  await context.unroute('**/engine/stockfish-*');
  await page.getByRole('button', { name: 'Retry engine', exact: true }).click();
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
  await expect(page.locator('.engine-line')).toHaveCount(3, { timeout: 90000 });
  await expect(page.getByRole('button', { name: 'Retry engine', exact: true })).toHaveCount(0);
});

test('dragged pieces stay under the pointer before snapping to a legal square', async ({
  page,
}) => {
  await quietBoard(page);
  const from = await center(page, 'e2'),
    middle = await center(page, 'e3'),
    to = await center(page, 'e4');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(middle.x + 7, middle.y - 6, { steps: 5 });
  await expect(page.locator('.board-piece.dragging')).toHaveCount(1);
  const box = await page.locator('.board-piece.dragging').boundingBox();
  expect(Math.abs(box!.x + box!.width / 2 - middle.x - 7)).toBeLessThan(2);
  expect(Math.abs(box!.y + box!.height / 2 - middle.y + 6)).toBeLessThan(2);
  await page.mouse.move(to.x, to.y);
  await page.mouse.up();
  await expect(page.getByRole('gridcell', { name: 'e4 white pawn', exact: true })).toBeVisible();
});

test('download progress is visible and switching to Lite cancels the large download', async ({
  page,
  context,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await context.route('**/stockfish-19-single.wasm?*', async (route) => {
    await gate;
    await route.continue().catch(() => {});
  });
  try {
    await page.goto('./');
    await expect(page.getByRole('progressbar', { name: 'Engine download progress' })).toBeVisible();
    await expect(page.getByText(/MB · Saved for future visits/)).toBeVisible();
    await page.getByRole('button', { name: 'Use Lite · smaller download', exact: true }).click();
    release();
    await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
    await expect(page.locator('.engine-line')).toHaveCount(3, { timeout: 90000 });
    await expect(page.locator('.engine-status small')).toHaveText('Lite');
  } finally {
    release();
  }
});
