import { expect, test } from '@playwright/test';
import { parsePgn, selectNode } from '../../src/chess/tree';
import { ENGINE_BUILD_ID } from '../../src/engine/build';
import type { MoveAssessment } from '../../src/review/policy';

test('guided playback passes ordinary moves and pauses at each important move in the banner', async ({
  page,
}) => {
  const study = parsePgn('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *')[0];
  const records: Record<string, MoveAssessment> = {};
  for (const [i, id] of study.mainline.entries()) {
    const node = study.nodes[id];
    records[id] = {
      nodeId: id,
      primary: i === 2 ? 'Mistake' : i === 4 ? 'Blunder' : 'Good',
      base: 'Good',
      book: false,
      mover: i % 2 ? 'b' : 'w',
      loss: 0,
      moveAccuracy: 95,
      bestUci: node.uci!,
      evidence: [],
      depth: 12,
      policyVersion: 1,
      meaningful: false,
      criticalGap: 0,
      before: { kind: 'cp', value: 20 },
      after: { kind: 'cp', value: 20 },
      bestLine: [node.uci!],
      playedLine: [node.uci!],
      forced: false,
    };
  }
  await page.goto('./');
  await page.getByRole('switch', { name: 'Engine analysis' }).click();
  await page.evaluate(
    async ({ study, records, build }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('chess-room', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction(['studies', 'preferences', 'analysis'], 'readwrite');
      tx.objectStore('studies').put(study);
      tx.objectStore('preferences').put(study.id, 'activeStudy');
      tx.objectStore('analysis').put({ flavor: 'full', engineBuild: build, records }, study.id);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { study: selectNode(study, study.rootId), records, build: ENGINE_BUILD_ID },
  );
  await page.reload();
  await page.getByRole('switch', { name: 'Engine analysis' }).click();
  await page.getByRole('button', { name: 'Start guided review', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const banner = page.getByRole('status', { name: 'Move thought' });
  await expect(banner).toHaveAttribute('data-square', 'f3', { timeout: 15000 });
  await expect(banner).toContainText('Mistake');
  await expect(banner.getByRole('button', { name: 'Continue review', exact: true })).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(banner).toHaveAttribute('data-square', 'f3');
  await banner.getByRole('button', { name: 'Continue review', exact: true }).click();
  await expect(banner).toHaveAttribute('data-square', 'b5', { timeout: 10000 });
  await expect(banner).toContainText('Blunder');
  await expect(banner.getByRole('button', { name: 'Continue review', exact: true })).toBeVisible();
});

test('guided review replaces continuous analysis with bounded move assessments', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Review settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Engine build' }).selectOption('lite');
  await page.getByRole('spinbutton', { name: 'Analysis depth', exact: true }).fill('8');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await page.getByRole('textbox', { name: 'PGN or FEN' }).fill('1. e4 e5 2. Nf3 Nc6 *');
  await page.getByRole('button', { name: 'Import & explore' }).click();
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start guided review', exact: true })).toBeVisible({
    timeout: 90000,
  });
  await page.getByRole('button', { name: 'Review settings', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Continuous analysis', exact: true }).check();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Start guided review', exact: true }).click();
  await page.getByRole('button', { name: 'Review settings', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Continuous analysis', exact: true }),
  ).not.toBeChecked();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Move thought' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Move thought' })).not.toContainText(
    'Analyzing this move…',
    { timeout: 90000 },
  );
});
