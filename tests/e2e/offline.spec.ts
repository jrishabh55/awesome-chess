import { test, expect } from '@playwright/test';
test.skip(!process.env.TEST_URL, 'Offline tests require the production preview URL');
test('PWA reloads and runs real Stockfish plus reviews with networking disabled', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.getByRole('button', { name: 'Engine settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Engine build' }).selectOption('lite');
  await page.getByRole('button', { name: 'Make available offline', exact: true }).click();
  await expect(page.getByText('Engine ready offline', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const active = (await caches.keys()).find(
      (n) => n.startsWith('engine-') && n.endsWith('-lite'),
    )!;
    const cache = await caches.open(active);
    const obsolete = await caches.open('engine-obsolete-lite');
    for (const request of await cache.keys())
      await obsolete.put(request, new Response('obsolete build'));
    await obsolete.put('/offline-ready', new Response('verified'));
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('grid', { name: 'Chessboard' })).toBeVisible();
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
  await expect(page.locator('.engine-line')).toHaveCount(3, { timeout: 90000 });
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await page.getByRole('textbox', { name: 'PGN or FEN' }).fill('1. f3 e5 2. g4 Qh4# 0-1');
  await page.getByRole('button', { name: 'Import & explore' }).click();
  await page.getByRole('tab', { name: 'Review', exact: true }).click();
  await page.getByRole('button', { name: 'Review game', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review again', exact: true })).toBeVisible({
    timeout: 100000,
  });
  await page.getByRole('button', { name: 'Review again', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review again', exact: true })).toBeVisible({
    timeout: 100000,
  });
});
test('failed engine download never reports offline readiness', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.getByRole('button', { name: 'Engine settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Engine build' }).selectOption('lite');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Make available offline', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Make available offline', exact: true }),
  ).toBeEnabled();
  await expect(page.getByText('Engine ready offline', { exact: true })).toHaveCount(0);
});
