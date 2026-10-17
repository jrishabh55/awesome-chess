import { expect, test } from '@playwright/test';

test('review explains a blunder inline and keeps its best alternative through pause and flip', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Engine build' }).selectOption('lite');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await page.getByRole('textbox', { name: 'PGN or FEN' }).fill('1. f3 e5 2. g4 Qh4# 0-1');
  await page.getByRole('button', { name: 'Import & explore' }).click();
  await page.getByRole('button', { name: 'Game Review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review again', exact: true })).toBeVisible({
    timeout: 110000,
  });
  await page.locator('.move-cell[aria-label="g4"]').click();
  const insight = page.getByRole('region', { name: 'Move explanation' });
  await expect(insight).toContainText('Qh4#');
  await expect(insight).toContainText('checkmate');
  const remnant = page.locator('[data-overlay="previous-best"]');
  await expect(remnant).toHaveCount(1);
  const best = await remnant.getAttribute('data-move');
  expect(best).not.toBe('g2g4');
  await page.getByRole('switch', { name: 'Engine analysis' }).click();
  await expect(remnant).toHaveAttribute('data-move', best!);
  await page.getByRole('button', { name: 'Flip board', exact: true }).click();
  await expect(remnant).toHaveAttribute('data-move', best!);
  await insight.getByRole('tab', { name: /^Threats/ }).click();
  await expect(insight).toContainText('Qh4#');
  await insight.getByRole('button', { name: 'Full explanation' }).click();
  await expect(page.locator('.coach-card')).toContainText('Position');
  await page.getByRole('button', { name: 'Retry move', exact: true }).click();
  await expect(remnant).toHaveCount(0);
  await expect(page.locator('[data-overlay="threat"]')).toHaveCount(0);
  await expect(insight).toHaveCount(0);
  await page.getByRole('button', { name: 'Exit retry' }).click();
  await expect(remnant).toHaveCount(1);
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 667 },
    { width: 812, height: 375 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(insight.getByRole('button', { name: 'Full explanation' })).toBeInViewport({
      ratio: 1,
    });
    await expect(page.locator('.move-cell.active')).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'Next move', exact: true })).toBeInViewport({
      ratio: 1,
    });
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      viewport.height + 1,
    );
    await page.screenshot({ path: `test-results/move-explanation-${viewport.width}.png` });
  }
  await page.locator('.move-cell[aria-label="Qh4#"]').click();
  await insight.getByRole('tab', { name: /^Threats/ }).click();
  await expect(insight).toContainText('Checkmate. Black wins.');
  await expect(insight).not.toContainText('No specific tactical threat');
  await page.getByRole('button', { name: 'Go to start', exact: true }).click();
  await expect(remnant).toHaveCount(0);
  await expect(page.locator('[data-overlay="threat"]')).toHaveCount(0);
});

test('continuous analysis still assesses a move and shows its pin on the actual board', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Engine build' }).selectOption('lite');
  await page.getByRole('checkbox', { name: 'Continuous analysis', exact: true }).check();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'PGN or FEN' })
    .fill('[SetUp "1"]\n[FEN "4k3/8/2n5/8/8/8/P7/4KB2 w - - 0 1"]\n\n1. Bb5 *');
  await page.getByRole('button', { name: 'Import & explore' }).click();
  await page.locator('.move-cell[aria-label="Bb5"]').click();
  const insight = page.getByRole('region', { name: 'Move explanation' });
  await expect(insight).toBeVisible();
  await insight.getByRole('tab', { name: /^Threats/ }).click();
  await expect(insight).toContainText('pins the knight on c6');
  await expect(page.locator('[data-overlay="threat"][data-move="b5e8"]')).toHaveAttribute(
    'stroke',
    '#f65c54',
  );
  await insight.getByRole('button', { name: 'Full explanation' }).click();
  await page.getByRole('button', { name: 'Show pin', exact: true }).click();
  await expect(page.getByRole('gridcell', { name: 'b5 white bishop', exact: true })).toBeVisible();
  await expect(page.locator('[data-overlay="coach"][data-move="b5e8"]')).toHaveAttribute(
    'stroke',
    '#f65c54',
  );
  await page.getByRole('button', { name: 'Return to game', exact: true }).click();
  await page.getByRole('gridcell', { name: 'e8 black king', exact: true }).click();
  await page.getByRole('gridcell', { name: 'd8 empty', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Review', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(insight).toContainText('Kd8');
  await expect(page.locator('[data-overlay="threat"][data-move="b5e8"]')).toHaveCount(0);
});
