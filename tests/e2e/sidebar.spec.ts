import { test, expect } from '@playwright/test';

test('live analysis keeps all three lines and navigation visible on a small phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Engine build' }).selectOption('lite');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
  await expect(page.locator('.engine-line')).toHaveCount(3, { timeout: 90000 });
  await expect(page.locator('.engine-line').last()).toBeInViewport({ ratio: 1 });
  await expect(page.locator('.move-cell.active')).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button', { name: 'Next move', exact: true })).toBeInViewport({
    ratio: 1,
  });
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(668);
});

test('report lives in Settings while move pages keep navigation visible', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Go to start', exact: true }).click();
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Book move', exact: true })).toBeVisible({
    timeout: 90000,
  });
  await page.getByRole('button', { name: 'Accuracy & full report', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.locator('.classification-table')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Go to end', exact: true }).click();
  await expect(page.locator('.move-cell.active')).toBeInViewport({ ratio: 1 });
  const selected = await page.locator('.move-cell.active').getAttribute('aria-label');
  const pageNumber = await page.locator('.move-pagination span').textContent();
  await page.getByRole('button', { name: 'Previous moves page', exact: true }).click();
  await expect(page.locator('.move-pagination span')).not.toHaveText(pageNumber!);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.move-cell.active')).toHaveAttribute('aria-label', selected!);
  await expect(page.locator('.move-cell.active')).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 390, height: 667 },
  { width: 812, height: 375 },
]) {
  test(`review fits ${viewport.width}×${viewport.height} without scrolling or clipped moves`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('./');
    await page.getByRole('switch', { name: 'Engine analysis' }).click();
    for (const tab of ['Review', 'Analysis', 'Openings']) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await page.getByRole('button', { name: 'Go to end', exact: true }).click();
      await expect(page.locator('.move-cell.active')).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole('button', { name: 'Next move', exact: true })).toBeInViewport({
        ratio: 1,
      });
      await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeInViewport({
        ratio: 1,
      });
      const size = await page.evaluate(() => ({
        height: document.documentElement.scrollHeight,
        width: document.documentElement.scrollWidth,
        scrollers: [...document.querySelectorAll('main *')]
          .filter(
            (el) =>
              el.scrollHeight > el.clientHeight + 2 &&
              ['auto', 'scroll'].includes(getComputedStyle(el).overflowY),
          )
          .map((el) => el.className),
      }));
      expect(size.height).toBeLessThanOrEqual(viewport.height + 1);
      expect(size.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(size.scrollers).toEqual([]);
    }
  });
}
