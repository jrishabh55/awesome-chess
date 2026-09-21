import { expect, test, type Page } from '@playwright/test';

async function openPicker(page: Page) {
  await page.goto('./');
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Opening teacher', exact: true })
    .click();
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  return page.getByRole('combobox', { name: 'Opening name, variation, or ECO', exact: true });
}

test('Escape closes suggestions first and then allows the parent dialog to close', async ({
  page,
}) => {
  const input = await openPicker(page);
  await expect(input).toBeEnabled();
  await input.fill('B90');
  await expect(page.getByRole('listbox')).toBeVisible();
  await input.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toBeVisible();
  await input.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('opening results exist only in the open combobox dropdown and support keyboard selection', async ({
  page,
}) => {
  const input = await openPicker(page);
  await expect(input).toBeEnabled();
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await input.fill('Sicilian Dragon');
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(page.getByRole('listbox').getByRole('option').first()).toContainText('Dragon');
  await input.press('ArrowDown');
  const active = await input.getAttribute('aria-activedescendant');
  const label = await page.locator(`[id="${active}"]`).getAttribute('aria-label');
  await input.press('Enter');
  await expect(input).toHaveValue(label!);
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(input).toBeFocused();
  await input.fill('London');
  await expect(input).toHaveValue('London');
  await expect(page.getByRole('listbox').getByRole('option').first()).toContainText('London');
});

test('the dropdown stays inside short dialogs and scrolls highlighted results without adding layout space', async ({
  page,
}) => {
  const input = await openPicker(page);
  await expect(input).toBeEnabled();
  for (const viewport of [
    { width: 1100, height: 800 },
    { width: 812, height: 375 },
    { width: 390, height: 667 },
  ]) {
    await page.setViewportSize(viewport);
    await input.press('Escape');
    const closedHeight = await page
      .locator('.opening-combobox')
      .evaluate((element) => element.getBoundingClientRect().height);
    await input.fill('');
    await input.click();
    await expect(page.getByRole('listbox')).toBeVisible();
    for (let i = 0; i < 15; i++) await input.press('ArrowDown');
    const bounds = await page.locator('.opening-combobox').evaluate((element) => {
      const input = element.querySelector('input')!;
      const popup = element.querySelector('.oc-popover')!.getBoundingClientRect();
      const list = element.querySelector('.oc-listbox')!;
      const listRect = list.getBoundingClientRect();
      const selected = document
        .getElementById(input.getAttribute('aria-activedescendant')!)!
        .getBoundingClientRect();
      const dialog = element.closest('dialog')!.getBoundingClientRect();
      return {
        height: element.getBoundingClientRect().height,
        popupTop: popup.top,
        popupBottom: popup.bottom,
        dialogTop: dialog.top,
        dialogBottom: dialog.bottom,
        listTop: listRect.top,
        listBottom: listRect.bottom,
        selectedTop: selected.top,
        selectedBottom: selected.bottom,
        scrollHeight: list.scrollHeight,
        clientHeight: list.clientHeight,
      };
    });
    expect(bounds.height).toBe(closedHeight);
    expect(bounds.popupTop).toBeGreaterThanOrEqual(Math.max(0, bounds.dialogTop));
    expect(bounds.popupBottom).toBeLessThanOrEqual(Math.min(viewport.height, bounds.dialogBottom));
    expect(bounds.selectedTop).toBeGreaterThanOrEqual(bounds.listTop - 1);
    expect(bounds.selectedBottom).toBeLessThanOrEqual(bounds.listBottom + 1);
    expect(bounds.scrollHeight).toBeGreaterThan(bounds.clientHeight);
    await page.screenshot({
      path: `/tmp/chess-opening-combobox-${viewport.width}x${viewport.height}.png`,
    });
  }
});

test('Escape, outside focus, clear, and text editing behave like a compact combobox', async ({
  page,
}) => {
  const input = await openPicker(page);
  await expect(input).toBeEnabled();
  await input.fill('B90');
  await input.press('ArrowLeft');
  expect(await input.evaluate((element: HTMLInputElement) => element.selectionStart)).toBe(2);
  await input.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toBeVisible();
  await input.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  await input.press('Enter');
  await page.getByRole('button', { name: 'Clear opening', exact: true }).click();
  await expect(input).toHaveValue('');
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(40);
  await expect(page.getByText(/Refine your search/)).toBeVisible();
  await input.fill('no such opening xyzzy');
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(0);
  await expect(
    page.getByText('No matching openings. Try a shorter name or an ECO code.'),
  ).toBeVisible();
  await input.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toBeVisible();
});
