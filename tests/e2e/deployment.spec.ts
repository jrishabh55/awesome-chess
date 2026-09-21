import { test, expect } from '@playwright/test';

test('bundled assets and PWA URLs stay within the deployment path', async ({ page, baseURL }) => {
  const outside: string[] = [];
  const base = new URL(baseURL!);
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      url.protocol !== 'blob:' &&
      url.origin === base.origin &&
      !url.pathname.startsWith(base.pathname)
    )
      outside.push(url.pathname);
  });
  await page.goto('./');
  await expect(page.getByRole('grid', { name: 'Chessboard' })).toBeVisible();
  // CI exercises the full build; the live smoke check can use the small build.
  if (process.env.ENGINE_TEST_FLAVOR === 'lite') {
    await page.getByRole('button', { name: 'Engine settings', exact: true }).click();
    await page.getByRole('combobox', { name: 'Engine build' }).selectOption('lite');
    await page.getByRole('button', { name: 'Close dialog' }).click();
  }
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
  await expect(page.locator('.engine-line')).toHaveCount(3, { timeout: 90000 });
  const assets = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!;
    const response = await fetch(link.href);
    const manifest = await response.json();
    return {
      start: new URL(manifest.start_url, link.href).href,
      scope: new URL(manifest.scope, link.href).href,
      icons: manifest.icons.map((icon: { src: string }) => new URL(icon.src, link.href).href),
      imagesLoaded: [...document.images].every((img) => img.complete && img.naturalWidth > 0),
    };
  });
  expect(assets.start).toBe(base.href);
  expect(assets.scope).toBe(base.href);
  expect(assets.imagesLoaded).toBe(true);
  for (const icon of assets.icons) expect(icon).toContain(base.href);
  expect(outside).toEqual([]);
});
