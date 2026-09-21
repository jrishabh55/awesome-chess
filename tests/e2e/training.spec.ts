import { expect, test, type Page } from '@playwright/test';

async function openTeacher(page: Page) {
  await page.goto('./');
  await page.getByRole('combobox', { name: 'Workspace', exact: true }).selectOption('teacher');
  await expect(page.getByRole('heading', { name: 'Opening Teacher', exact: true })).toBeVisible();
}
async function move(page: Page, from: string, to: string) {
  await page.getByRole('gridcell', { name: new RegExp(`^${from} `) }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('gridcell', { name: new RegExp(`^${to} `) }).focus();
  await page.keyboard.press('Enter');
}
async function finishGuide(page: Page) {
  while (await page.getByRole('button', { name: 'Next move', exact: true }).isVisible()) {
    await page.getByRole('button', { name: 'Next move', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Start practice', exact: true }).click();
}

test('opening teacher guides, validates drills, and resumes locally', async ({ page }) => {
  await openTeacher(page);
  await page.getByRole('button', { name: 'Start course', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'White plays e4' })).toBeVisible();
  await expect(page.locator('.board-overlay')).toBeVisible();
  await expect(page.locator('.board-overlay > path')).toHaveCount(1);
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'White plays e4' })).toBeVisible();
  await finishGuide(page);
  await move(page, 'd2', 'd4');
  await expect(
    page.getByText('That is not the move in this variation.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('gridcell', { name: 'd2 white pawn', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hint', exact: true }).click();
  await page.getByRole('button', { name: 'Reveal move', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Play e4', exact: true })).toBeVisible();
  await move(page, 'e2', 'e4');
  await expect(page.getByRole('gridcell', { name: 'e5 black pawn', exact: true })).toBeVisible();
  await page.reload();
  if (await page.getByRole('combobox', { name: 'Workspace', exact: true }).isVisible()) {
    await page.getByRole('combobox', { name: 'Workspace', exact: true }).selectOption('teacher');
  }
  await page.getByRole('button', { name: 'Resume course', exact: true }).click();
  await expect(page.getByRole('gridcell', { name: 'e4 white pawn', exact: true })).toBeVisible();
  await expect(page.getByText('1 retries', { exact: true })).toBeVisible();
});

test('custom Black repertoire completes every stage with automatic White moves', async ({
  page,
}) => {
  await openTeacher(page);
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Repertoire name', exact: true })
    .fill('Black mini course');
  await page.getByRole('combobox', { name: 'Train as', exact: true }).selectOption('b');
  await page
    .getByRole('textbox', { name: 'PGN variations', exact: true })
    .fill('1. e4 e5 (1... c5) *');
  await page.getByRole('button', { name: 'Import and start', exact: true }).click();
  for (let stage = 0; stage < 7; stage++) {
    if (await page.getByRole('button', { name: 'Next move', exact: true }).isVisible())
      await finishGuide(page);
    await page.getByRole('button', { name: 'Reveal move', exact: true }).click();
    const isE5 = await page.getByRole('heading', { name: 'Play e5', exact: true }).isVisible();
    await move(page, isE5 ? 'e7' : 'c7', isE5 ? 'e5' : 'c5');
    await expect(
      page.getByRole('heading', { name: 'Variation recalled.', exact: true }),
    ).toBeVisible();
    const finish = page.getByRole('button', { name: 'Finish course', exact: true });
    if (await finish.isVisible()) {
      await finish.click();
      break;
    }
    await page
      .getByRole('button', { name: /^(Next variation|Next drill|Start final drill)$/ })
      .click();
  }
  await expect(
    page.getByRole('heading', { name: 'Every variation practiced.', exact: true }),
  ).toBeVisible();
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 667 },
  { width: 812, height: 375 },
]) {
  test(`opening teacher fits ${viewport.width}×${viewport.height} without surface scrolling`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openTeacher(page);
    await page.getByRole('button', { name: 'Start course', exact: true }).click();
    const geometry = await page.locator('.opening-teacher').evaluate((element) => {
      const board = element.querySelector('.chessboard')!.getBoundingClientRect();
      const button = Array.from(element.querySelectorAll('button'))
        .find((b) => b.textContent?.includes('Next move'))!
        .getBoundingClientRect();
      return {
        documentHeight: document.documentElement.scrollHeight,
        viewport: innerHeight,
        boardWidth: board.width,
        boardBottom: board.bottom,
        buttonBottom: button.bottom,
        buttonTop: button.top,
      };
    });
    expect(geometry.documentHeight).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(geometry.boardWidth).toBeGreaterThan(150);
    expect(geometry.boardBottom).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.buttonBottom).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.buttonTop).toBeGreaterThanOrEqual(0);
  });
}

test('an unsavable PGN import preserves the previous course and explains the error', async ({
  page,
}) => {
  await openTeacher(page);
  await page.getByRole('button', { name: 'Start course', exact: true }).click();
  const previous = await page.evaluate(() => localStorage.getItem('chess-room.opening-teacher.v1'));
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  await page.getByRole('textbox', { name: 'PGN variations', exact: true }).fill('1. d4 d5 *');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'chess-room.opening-teacher.v1')
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'Import and start', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'This course could not be saved on this device',
  );
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('chess-room.opening-teacher.v1'))).toBe(
    previous,
  );
  await page.getByRole('button', { name: 'Close opening dialog', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Quiet development', exact: true })).toBeVisible();
});
