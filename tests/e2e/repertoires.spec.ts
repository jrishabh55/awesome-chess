import { expect, test, type Page } from '@playwright/test';

const libraryKey = 'chess-room.opening-repertoires.v1';
const progressKey = 'chess-room.opening-teacher.v1';
async function openLibrary(page: Page) {
  await page.goto('./');
  await page
    .getByRole('navigation', { name: 'Workspace', exact: true })
    .getByRole('button', { name: 'Opening teacher', exact: true })
    .click();
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
}
async function selectOpening(page: Page, name: string) {
  await page.getByRole('tab', { name: 'Single lines', exact: true }).click();
  await page.getByRole('combobox', { name: 'Opening name, variation, or ECO' }).fill(name);
  await page.getByRole('listbox').getByRole('option').first().click();
  await page.getByRole('button', { name: 'Add to repertoire', exact: true }).click();
}
async function createWithLine(page: Page, name = 'My White openings', side = 'w') {
  await selectOpening(page, 'Italian Game');
  await page.getByRole('textbox', { name: 'Repertoire name', exact: true }).fill(name);
  await page.getByRole('combobox', { name: 'Repertoire side', exact: true }).selectOption(side);
  await page.getByRole('button', { name: 'Save variation', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(`Added to ${name}`);
}
async function readLibrary(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).repertoires, libraryKey);
}

test('saved repertoires group families, deduplicate lines, survive reload, and become a multi-line course', async ({
  page,
}) => {
  await openLibrary(page);
  await createWithLine(page);
  await selectOpening(page, 'London System');
  await page.getByRole('button', { name: 'Save variation', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Added to My White openings');
  await selectOpening(page, 'London System');
  await page.getByRole('button', { name: 'Save variation', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('already in My White openings');
  await page.getByRole('button', { name: 'View repertoire', exact: true }).click();
  await expect(page.getByText('Play White · 2 variations · 2 families')).toBeVisible();
  await expect(page.locator('.ol-repertoire-family')).toHaveCount(2);
  const before = await readLibrary(page);
  expect(before[0].openings).toHaveLength(2);
  await openLibrary(page);
  await page.getByRole('tab', { name: 'My repertoires', exact: true }).click();
  await page.getByRole('button', { name: 'My White openings White · 2 variations' }).click();
  expect(await readLibrary(page)).toEqual(before);
  await page.getByRole('button', { name: 'Practice repertoire', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'White plays e4', exact: true })).toBeVisible();
  const progress = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    progressKey,
  );
  expect(progress.pack.id).toBe(`repertoire:${before[0].id}`);
  expect(progress.pack.side).toBe('w');
  expect(progress.pack.lines).toHaveLength(2);
  expect(progress.session.stages).toHaveLength(7);
  expect(
    progress.session.stages.filter((stage: { kind: string }) => stage.kind === 'final'),
  ).toHaveLength(2);
});

test('Black repertoire keeps its side, supports rename and removal, and confirms deletion', async ({
  page,
}) => {
  await openLibrary(page);
  await createWithLine(page, 'Black replies', 'b');
  await page.getByRole('button', { name: 'View repertoire', exact: true }).click();
  await page.getByRole('button', { name: 'Rename repertoire', exact: true }).click();
  await page.getByRole('textbox', { name: 'New repertoire name', exact: true }).fill('My defenses');
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My defenses', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Practice repertoire', exact: true }).click();
  await page.getByRole('button', { name: 'Go to end', exact: true }).click();
  await page.getByRole('button', { name: 'Start practice', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Your move as Black', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('gridcell', { name: 'e4 white pawn', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  await page.getByRole('tab', { name: 'My repertoires', exact: true }).click();
  await page.getByRole('button', { name: 'My defenses Black · 1 variations' }).click();
  await page.getByRole('button', { name: /^Remove Italian Game/ }).click();
  await expect(
    page.getByRole('button', { name: 'Practice repertoire', exact: true }),
  ).toBeDisabled();
  expect((await readLibrary(page))[0]).toMatchObject({
    name: 'My defenses',
    side: 'b',
    openings: [],
  });
  await page.getByRole('button', { name: 'Delete repertoire', exact: true }).click();
  await page.getByRole('button', { name: 'Keep repertoire', exact: true }).click();
  expect(await readLibrary(page)).toHaveLength(1);
  await page.getByRole('button', { name: 'Delete repertoire', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm deletion', exact: true }).click();
  await expect(
    page.getByText('Your opening choices, saved together.', { exact: true }),
  ).toBeVisible();
  expect(await readLibrary(page)).toEqual([]);
});

test('failed library writes preserve stored lines and the visible repertoire', async ({ page }) => {
  await openLibrary(page);
  await createWithLine(page);
  const previous = await readLibrary(page);
  await selectOpening(page, 'London System');
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, libraryKey);
  await page.getByRole('button', { name: 'Save variation', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Your previous library is unchanged');
  expect(await readLibrary(page)).toEqual(previous);
  await page.getByRole('tab', { name: 'My repertoires', exact: true }).click();
  await expect(page.getByText('Play White · 1 variations · 1 families')).toBeVisible();
  await expect(page.locator('.ol-saved-variation')).toHaveCount(1);
});

test('family browsing is paged and damaged local libraries remain untouched', async ({ page }) => {
  await page.goto('./');
  await page.evaluate((key) => localStorage.setItem(key, 'unreadable saved library'), libraryKey);
  await openLibrary(page);
  await expect(page.getByRole('alert')).toContainText('has not been overwritten');
  await page.getByRole('tab', { name: 'Single lines', exact: true }).click();
  const familySelect = page.getByRole('combobox', { name: 'Opening family', exact: true });
  const option = familySelect.locator('option').filter({ hasText: /^Sicilian Defense \(/ });
  await expect(option).toHaveCount(1);
  await familySelect.selectOption((await option.getAttribute('value'))!);
  const rows = page.locator('.ol-variation-list button');
  await expect(rows).toHaveCount(6);
  const firstPage = await rows.allTextContents();
  await page.getByRole('button', { name: 'Next family variations', exact: true }).click();
  expect(await rows.allTextContents()).not.toEqual(firstPage);
  await rows.first().click();
  await expect(page.getByRole('button', { name: 'Add to repertoire', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: 'My repertoires', exact: true }).click();
  await expect(page.getByRole('button', { name: 'New repertoire', exact: true })).toBeDisabled();
  expect(await page.evaluate((key) => localStorage.getItem(key), libraryKey)).toBe(
    'unreadable saved library',
  );
});

test('a stale second tab reloads newer repertoires before saving its own addition', async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await openLibrary(page);
  await openLibrary(other);
  await createWithLine(page, 'First tab openings');
  await selectOpening(other, 'London System');
  await other
    .getByRole('textbox', { name: 'Repertoire name', exact: true })
    .fill('Second tab openings');
  await other.getByRole('button', { name: 'Save variation', exact: true }).click();
  await expect(other.getByRole('alert')).toContainText('changed in another tab');
  expect((await readLibrary(other)).map((item: { name: string }) => item.name)).toEqual([
    'First tab openings',
  ]);
  await other.getByRole('button', { name: 'Retry saved repertoires', exact: true }).click();
  await expect(other.getByRole('alert')).toHaveCount(0);
  await other.getByRole('button', { name: 'Save variation', exact: true }).click();
  await expect(other.getByRole('status')).toContainText('Added to Second tab openings');
  expect((await readLibrary(other)).map((item: { name: string }) => item.name)).toEqual([
    'First tab openings',
    'Second tab openings',
  ]);
  await other.close();
});
