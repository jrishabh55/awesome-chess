import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

test.skip(!process.env.TEST_URL, 'Updates require a production build');
let server: Server;
let address: string;
let release = 'one';
let ignoreFirstActivation = false;
const base = new URL(process.env.TEST_URL || 'http://localhost/').pathname.replace(/\/?$/, '/');
const mime: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
};

test.beforeAll(async () => {
  const html = await readFile('dist/index.html', 'utf8');
  const sw = await readFile('public/sw.js', 'utf8');
  const assets = JSON.parse(await readFile('dist/shell-assets.json', 'utf8')) as string[];
  server = createServer(async (req, res) => {
    const pathname = new URL(req.url!, 'http://localhost').pathname;
    if (!pathname.startsWith(base)) {
      res.writeHead(404).end();
      return;
    }
    const file = pathname.slice(base.length) || 'index.html';
    try {
      if (file === 'sw.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
        const delay =
          ignoreFirstActivation && release === 'two'
            ? `let ignored = false; self.addEventListener('message', event => { if (event.data === 'ACTIVATE' && !ignored) { ignored = true; event.stopImmediatePropagation(); } });`
            : '';
        res.end(delay + sw.replaceAll('__BUILD_ID__', release));
      } else if (/^shell-assets(?:-[\w-]+)?\.json$/.test(file)) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(
          JSON.stringify(
            assets.filter((a) => !a.startsWith('app-') && !a.startsWith('shell-assets-')),
          ),
        );
      } else if (file === 'index.html' || /^app-[\w-]+\.html$/.test(file)) {
        const version = file.startsWith('app-') ? file.slice(4, -5) : release;
        // GitHub Pages caches HTML. The update must not copy old HTTP-cached HTML into a new shell.
        res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=600' });
        res.end(html.replace('<head>', `<head><meta name="test-release" content="${version}">`));
      } else {
        const path = resolve('dist', file);
        if (!path.startsWith(resolve('dist') + '/')) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, {
          'Content-Type': mime[extname(file)] || 'application/octet-stream',
          'Cache-Control': 'public, max-age=600',
        });
        res.end(await readFile(path));
      }
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  address = `http://127.0.0.1:${port}${base}`;
});
test.afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('Save & update loads the new release despite cached HTML and preserves the study', async ({
  page,
}) => {
  release = 'one';
  ignoreFirstActivation = false;
  await page.goto(address);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'PGN or FEN' })
    .fill('[White "Update survivor"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
  await page.getByRole('button', { name: 'Import & explore' }).click();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', 'one');
  release = 'two';
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())!.update();
  });
  await page.getByRole('button', { name: 'Save & update', exact: true }).click();
  await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', 'two', {
    timeout: 15000,
  });
  await expect(page.getByText('Update survivor', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save & update', exact: true })).toHaveCount(0);
});

test('a stalled activation shows progress, then offers a working retry', async ({ page }) => {
  release = 'one';
  ignoreFirstActivation = true;
  await page.goto(address);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  release = 'two';
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())!.update();
  });
  await page.getByRole('button', { name: 'Save & update', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Updating…', exact: true })).toBeDisabled();
  await expect(
    page.getByText('Applying update… The app will reload.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry update', exact: true })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByRole('alert')).toContainText('Your game is saved');
  await page.getByRole('button', { name: 'Retry update', exact: true }).click();
  await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', 'two');
});

test('another tab can finish the update and the stale banner still works offline', async ({
  page,
  context,
}) => {
  release = 'one';
  ignoreFirstActivation = false;
  await page.goto(address);
  await page.evaluate(() => navigator.serviceWorker.ready);
  const other = await context.newPage();
  await other.goto(address);
  await expect(other.getByText('Saved on this device', { exact: true })).toBeVisible();
  release = 'two';
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())!.update();
  });
  await expect(other.getByRole('button', { name: 'Save & update', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save & update', exact: true }).click();
  await expect(page.locator('meta[name="test-release"]')).toHaveAttribute('content', 'two');
  await expect(other.locator('meta[name="test-release"]')).toHaveAttribute('content', 'one');
  await context.setOffline(true);
  await other.getByRole('button', { name: 'Save & update', exact: true }).click();
  await expect(other.locator('meta[name="test-release"]')).toHaveAttribute('content', 'two');
  await expect(other.getByRole('grid', { name: 'Chessboard' })).toBeVisible();
});
