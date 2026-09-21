import { test, expect } from '@playwright/test';

test('sidebar keeps playback reachable and expands the report without a nested scroller', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Go to start', exact: true }).click();
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Book move', exact: true })).toBeVisible({
    timeout: 90000,
  });
  await expect(page.getByText('Accuracy & full report', { exact: true })).toBeVisible();
  await expect(page.locator('.classification-table')).not.toBeVisible();
  await page.getByText('Accuracy & full report', { exact: true }).click();
  await expect(page.locator('.classification-table')).toBeVisible();
  await expect(page.locator('.panel-body')).toHaveCSS('overflow-y', 'visible');
  await page.getByText('Accuracy & full report', { exact: true }).click();
  const review = await page.getByRole('button', { name: 'Game Review', exact: true }).boundingBox();
  const transport = await page.locator('.transport').boundingBox();
  expect(transport!.y).toBeGreaterThan(review!.y + review!.height);
  await page.getByRole('button', { name: 'Go to start', exact: true }).click();
  await page.getByRole('button', { name: 'Go to end', exact: true }).click();
  await expect(page.locator('.move-cell.active')).toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.move-cell.active')).toBeInViewport();
  expect(await page.evaluate(() => scrollY)).toBe(0);
});
