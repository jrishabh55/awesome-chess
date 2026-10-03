import { expect, test, type Page } from '@playwright/test';

async function seededCourse(
  page: Page,
  side: 'w' | 'b',
  phase: 'guide' | 'drill',
  manualClock = false,
) {
  await page.addInitScript(
    ({ side, phase }) => {
      const course = {
        id: 'course:Reply practice',
        name: 'Reply practice',
        side,
        sourceCount: 1,
        variations: [
          { id: 'line', eco: 'C20', name: 'Reply practice', pgn: '1. e4 e5 2. Nf3 Nc6' },
        ],
        sections: [{ id: 'foundation', name: 'Foundation', commonPgn: '', variationIndices: [0] }],
      };
      const session = {
        lesson: 0,
        phase,
        ply: 0,
        round: phase === 'drill' ? [0] : [],
        roundIndex: 0,
        mistakes: 0,
        hints: 0,
        scores: {},
      };
      localStorage.setItem('chess-room.opening-mode.v1', 'course');
      localStorage.setItem(
        'chess-room.opening-curriculum.v1',
        JSON.stringify({
          version: 2,
          activeCourseId: course.id,
          courses: { [course.id]: { course, session } },
        }),
      );
    },
    { side, phase },
  );
  await page.goto('./');
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Opening teacher', exact: true })
    .click();
  if (manualClock) await page.clock.install();
  await page.getByRole('button', { name: 'Resume course', exact: true }).click();
  await observeMotion(page);
}
async function move(page: Page, uci: string) {
  await page.getByRole('gridcell', { name: new RegExp(`^${uci.slice(0, 2)} `) }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('gridcell', { name: new RegExp(`^${uci.slice(2, 4)} `) }).focus();
  await page.keyboard.press('Enter');
}
async function observeMotion(page: Page) {
  await page.evaluate(() => {
    const origins: Record<string, string> = { e4: 'e2', e5: 'e7', f3: 'g1', c6: 'b8' };
    (window as any).openingMotion = {};
    document.querySelector('.chessboard')!.addEventListener('transitionrun', async (event) => {
      const piece = event.target as HTMLElement;
      const square = piece.getAttribute('data-piece') || '';
      if (!origins[square]) return;
      const animation = piece.getAnimations()[0];
      if (!animation) return;
      animation.pause();
      animation.currentTime = Number(animation.effect!.getTiming().duration) / 2;
      const target = document
        .querySelector(`[role="gridcell"][aria-label^="${square} "]`)!
        .getBoundingClientRect();
      const start = document
        .querySelector(`[role="gridcell"][aria-label^="${origins[square]} "]`)!
        .getBoundingClientRect();
      const actual = piece.getBoundingClientRect();
      const progress =
        Math.hypot(actual.x - start.x, actual.y - start.y) /
        Math.hypot(target.x - start.x, target.y - start.y);
      animation.play();
      await animation.finished;
      (window as any).openingMotion[square] = progress;
    });
  });
}
async function expectAnimatedPiece(page: Page, square: string) {
  await expect
    .poll(() => page.evaluate((square) => (window as any).openingMotion[square] ?? null, square))
    .not.toBeNull();
  const motion = await page.evaluate((square) => (window as any).openingMotion[square], square);
  expect(motion).toBeGreaterThan(0.25);
  expect(motion).toBeLessThan(0.8);
}

test('guided lessons wait for manual moves from both sides and animate each piece', async ({
  page,
}) => {
  await seededCourse(page, 'w', 'guide');
  await page.clock.install();
  await move(page, 'e2e4');
  await expectAnimatedPiece(page, 'e4');
  await page.clock.runFor(1500);
  await expect(page.getByRole('gridcell', { name: 'e7 black pawn', exact: true })).toBeVisible();
  await move(page, 'e7e6');
  await expect(
    page.getByText('Follow the lesson move shown by the arrow.', { exact: false }),
  ).toBeVisible();
  await move(page, 'e7e5');
  await expectAnimatedPiece(page, 'e5');
  await move(page, 'g1f3');
  await page.clock.runFor(1500);
  await expect(page.getByRole('gridcell', { name: 'b8 black knight', exact: true })).toBeVisible();
  await move(page, 'b8c6');
  await expectAnimatedPiece(page, 'c6');
  await expect(page.getByText('Line complete', { exact: true })).toBeVisible();
});

test('Black lessons wait for White’s first move and accept both colors manually', async ({
  page,
}) => {
  await seededCourse(page, 'b', 'guide', true);
  await page.clock.runFor(1500);
  await expect(page.getByRole('gridcell', { name: 'e2 white pawn', exact: true })).toBeVisible();
  await move(page, 'e2e4');
  await expectAnimatedPiece(page, 'e4');
  await move(page, 'e7e5');
  await page.clock.runFor(1500);
  await expect(page.getByRole('gridcell', { name: 'g1 white knight', exact: true })).toBeVisible();
  await move(page, 'g1f3');
  await expectAnimatedPiece(page, 'f3');
});

test('recall waits for each reply and records completion after the final reply', async ({
  page,
}) => {
  await seededCourse(page, 'w', 'drill');
  await move(page, 'e2e4');
  await expect(page.getByRole('gridcell', { name: 'e7 black pawn', exact: true })).toBeVisible();
  await expect(page.getByRole('gridcell', { name: 'e5 black pawn', exact: true })).toBeVisible();
  await expectAnimatedPiece(page, 'e5');
  await move(page, 'g1f3');
  await expect(page.getByRole('button', { name: 'Retry drill', exact: true })).toHaveCount(0);
  await expect(page.getByRole('gridcell', { name: 'c6 black knight', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Course score: 10 points', exact: true }),
  ).toBeVisible();
});

test('pending replies pause in a dialog and cancel when leaving the teacher', async ({ page }) => {
  await seededCourse(page, 'w', 'drill');
  await page.clock.install();
  await move(page, 'e2e4');
  await page.getByRole('button', { name: 'Course sections', exact: true }).click();
  await page.clock.runFor(1000);
  await expect(page.getByRole('gridcell', { name: 'e7 black pawn', exact: true })).toBeAttached();
  await page.getByRole('button', { name: 'Close opening dialog', exact: true }).click();
  await page.clock.runFor(600);
  await expect(page.getByRole('gridcell', { name: 'e5 black pawn', exact: true })).toBeVisible();
  await move(page, 'g1f3');
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Game review', exact: true })
    .click();
  await page.clock.runFor(1000);
  const ply = await page.evaluate(() => {
    const library = JSON.parse(localStorage.getItem('chess-room.opening-curriculum.v1')!);
    return library.courses[library.activeCourseId].session.ply;
  });
  expect(ply).toBe(3);
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Opening teacher', exact: true })
    .click();
  await page.clock.runFor(1000);
  await expect(page.getByRole('gridcell', { name: 'b8 black knight', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume course', exact: true }).click();
  await page.clock.runFor(600);
  await expect(page.getByRole('gridcell', { name: 'c6 black knight', exact: true })).toBeVisible();
});

test('backtracking and restarting a Black lesson stay at the manually selected position', async ({
  page,
}) => {
  await seededCourse(page, 'b', 'guide');
  await move(page, 'e2e4');
  await page.clock.install();
  await page.getByRole('button', { name: 'Previous move', exact: true }).click();
  await page.clock.runFor(1000);
  await expect(page.getByRole('gridcell', { name: 'e2 white pawn', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restart course', exact: true }).click();
  await page.getByRole('button', { name: 'Restart lessons', exact: true }).click();
  await page.clock.runFor(1500);
  await expect(page.getByRole('gridcell', { name: 'e2 white pawn', exact: true })).toBeVisible();
  await move(page, 'e2e4');
  await expect(page.getByRole('gridcell', { name: 'e4 white pawn', exact: true })).toBeVisible();
});

test('lesson automatic replies respect the configured delay and pause when browsing back', async ({
  page,
}) => {
  await seededCourse(page, 'w', 'guide', true);
  await page.getByRole('button', { name: 'Board settings', exact: true }).click();
  await page
    .getByRole('checkbox', { name: 'Automatic opponent replies in lessons', exact: true })
    .check();
  await page.getByRole('slider', { name: 'Automatic reply delay', exact: true }).fill('2000');
  await page.getByRole('button', { name: 'Close opening dialog', exact: true }).click();
  await move(page, 'e2e4');
  await page.clock.runFor(1500);
  await expect(page.getByRole('gridcell', { name: 'e7 black pawn', exact: true })).toBeVisible();
  await page.clock.runFor(600);
  await expect(page.getByRole('gridcell', { name: 'e5 black pawn', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Previous move', exact: true }).click();
  await page.clock.runFor(2500);
  await expect(page.getByRole('gridcell', { name: 'e7 black pawn', exact: true })).toBeVisible();
});

test('manual drills require both colors and retain mistake scoring through the final reply', async ({
  page,
}) => {
  await seededCourse(page, 'w', 'drill');
  await page.clock.install();
  await page.getByRole('button', { name: 'Board settings', exact: true }).click();
  await page
    .getByRole('checkbox', { name: 'Automatic opponent replies in drills', exact: true })
    .uncheck();
  await page.getByRole('button', { name: 'Close opening dialog', exact: true }).click();
  await move(page, 'e2e4');
  await page.clock.runFor(1500);
  await expect(page.getByRole('gridcell', { name: 'e7 black pawn', exact: true })).toBeVisible();
  await move(page, 'e7e6');
  await expect(page.getByText('Incorrect move.', { exact: false })).toBeVisible();
  await move(page, 'e7e5');
  await move(page, 'g1f3');
  await page.clock.runFor(1500);
  await expect(page.getByRole('button', { name: 'Retry drill', exact: true })).toHaveCount(0);
  await move(page, 'b8c6');
  await expect(
    page.getByRole('button', { name: 'Course score: 5 points', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry drill', exact: true })).toBeVisible();
});
