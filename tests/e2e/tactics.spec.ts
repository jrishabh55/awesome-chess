import { test, expect } from '@playwright/test';
test('recognizes a verified queen sacrifice ending in forced mate', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'PGN or FEN' })
    .fill(
      '[SetUp "1"]\n[FEN "4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 0 16"]\n\n16. Qb8+ Nxb8 17. Rd8# 1-0',
    );
  await page.getByRole('button', { name: 'Import & explore' }).click();
  await page.getByRole('button', { name: 'Review game', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review again', exact: true })).toBeVisible({
    timeout: 100000,
  });
  await page.locator('.move-cell').filter({ hasText: 'Qb8+' }).click();
  await expect(page.locator('.coach-card h3')).toContainText('Brilliant');
});
