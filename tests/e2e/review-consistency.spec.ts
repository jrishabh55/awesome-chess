import { expect, test } from '@playwright/test';
import { parsePgn } from '../../src/chess/tree';
import { ENGINE_BUILD_ID } from '../../src/engine/build';
import { classify } from '../../src/review/classify';
import type { EngineLine } from '../../src/engine/types';

test('real Stockfish replaces the saved false blunder on 29.f4', async ({ page }) => {
  const study = parsePgn(
    '[SetUp "1"]\n[FEN "3r4/p4p1p/1p3k2/1P2RP2/3p2P1/3P4/P4P1P/6K1 w - - 1 29"]\n\n29. f4 *',
  )[0];
  study.selectedId = study.mainline[0];
  const line = (value: number, pv: string[]): EngineLine => ({
    rank: 1,
    depth: 16,
    score: { kind: 'cp', value },
    pv,
    bound: 'exact',
  });
  const assessment = classify({
    nodeId: study.selectedId,
    mover: 'w',
    playedUci: 'f2f4',
    book: false,
    legalCount: 20,
    best: line(557, ['e5e4', 'a7a6']),
    played: line(139, ['f2f4', 'd8g8']),
    evidence: [],
  });
  expect(assessment.primary).toBe('Blunder');
  await page.goto('./');
  await page.getByRole('switch', { name: 'Engine analysis' }).click();
  await page.evaluate(
    async ({ study, assessment, build }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('chess-room', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction(['studies', 'preferences', 'analysis'], 'readwrite');
      tx.objectStore('studies').put(study);
      tx.objectStore('preferences').put(study.id, 'activeStudy');
      tx.objectStore('preferences').put(
        { flavor: 'full', depth: 16, orientation: 'w' },
        'settings',
      );
      tx.objectStore('analysis').put(
        { flavor: 'full', engineBuild: build, records: { [study.selectedId]: assessment } },
        study.id,
      );
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { study, assessment, build: ENGINE_BUILD_ID },
  );
  await page.reload();
  const move = page.locator('.move-cell[aria-label="f4"]');
  await expect(move).toHaveAttribute('title', /^(Best|Excellent|Good) · depth (2\d|[3-9]\d)/, {
    timeout: 110000,
  });
  await expect(page.getByRole('status', { name: 'Move thought' })).not.toContainText('Blunder');
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
  await expect(page.locator('.move-feedback')).not.toContainText('blunder');
  await expect(page.locator('.engine-line').first()).toContainText('29…');
});
