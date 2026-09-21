import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const size of [192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.goto('http://127.0.0.1:5173/assets/icon.svg');
    await page.locator('svg').evaluate((svg, size) => {
      svg.setAttribute('width', String(size));
      svg.setAttribute('height', String(size));
    }, size);
    await page.screenshot({ path: `public/assets/icon-${size}.png`, omitBackground: true });
  }
} finally {
  await browser.close();
}
