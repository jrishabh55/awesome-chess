import { expect, test, type Page } from '@playwright/test';

async function teacher(page: Page, phase = 'guide') {
  await page.addInitScript((phase) => {
    const course = {
      id: 'course:Thought practice',
      name: 'Thought practice',
      side: 'w',
      sourceCount: 1,
      variations: [
        { id: 'line', eco: 'C20', name: 'Thought practice', pgn: '1. e4 e5 2. Nf3 Nc6' },
      ],
      sections: [{ id: 'one', name: 'One', commonPgn: '', variationIndices: [0] }],
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
  }, phase);
  await page.goto('./');
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Opening teacher', exact: true })
    .click();
  await page.getByRole('button', { name: 'Resume course', exact: true }).click();
}

test('thought bubbles follow the played piece, flip with the board, and retain the final move', async ({
  page,
}) => {
  await teacher(page);
  const thought = page.getByRole('status', { name: 'Move thought' });
  await expect(thought).toContainText(/White.*e4/);
  await expect(thought).toContainText(/I.*d5/);
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(thought).toHaveAttribute('data-square', 'e4');
  await expect(thought).toHaveAttribute('data-square', 'e5');
  await expect(thought).toContainText(/Black.*e5/);
  const before = await thought.boundingBox();
  await page.keyboard.press('x');
  const after = await thought.boundingBox();
  expect(Math.abs(after!.y - before!.y)).toBeGreaterThan(30);
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(thought).toHaveAttribute('data-square', 'c6');
  await expect(page.getByText('Line complete', { exact: true })).toBeVisible();
  await expect(thought).toContainText(/Black.*Nc6/);
  await page.getByRole('button', { name: 'Previous move', exact: true }).click();
  await expect(thought).toHaveAttribute('data-square', 'f3');
});

test('recall drills do not reveal move thoughts', async ({ page }) => {
  await teacher(page, 'drill');
  await expect(page.getByRole('status', { name: 'Move thought' })).toHaveCount(0);
});

test('mobile thoughts stay inside the board and do not intercept piece input', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await teacher(page);
  const thought = page.getByRole('status', { name: 'Move thought' });
  await page.screenshot({ path: test.info().outputPath('mobile-thought.png') });
  await page.getByRole('gridcell', { name: 'e2 white pawn', exact: true }).click();
  await page.getByRole('gridcell', { name: 'e4 empty', exact: true }).click();
  await expect(thought).toHaveAttribute('data-square', 'e5');
  for (const [width, height] of [
    [390, 844],
    [320, 568],
    [812, 375],
    [1440, 1000],
    [2560, 1440],
  ]) {
    await page.setViewportSize({ width, height });
    await page.keyboard.press('x');
    const bubble = await thought.boundingBox();
    const board = await page.getByRole('grid', { name: 'Chessboard', exact: true }).boundingBox();
    expect(bubble!.x).toBeGreaterThanOrEqual(board!.x);
    expect(bubble!.x + bubble!.width).toBeLessThanOrEqual(board!.x + board!.width);
    expect(bubble!.y).toBeGreaterThanOrEqual(board!.y);
    expect(bubble!.y + bubble!.height).toBeLessThanOrEqual(board!.y + board!.height);
    const anchor = await page.locator('.move-thought-anchor').boundingBox();
    const pieceSquare = await page
      .getByRole('gridcell', { name: 'e5 black pawn', exact: true })
      .boundingBox();
    expect(Math.abs(anchor!.x - pieceSquare!.x - pieceSquare!.width / 2)).toBeLessThan(1);
    expect(Math.abs(anchor!.y - pieceSquare!.y - pieceSquare!.height / 2)).toBeLessThan(1);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(async () => {
    await Promise.all(
      document
        .querySelector('.chessboard')!
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => {})),
    );
    await new Promise(requestAnimationFrame);
  });
  await page.screenshot({ path: test.info().outputPath('desktop-thought.png') });
});

async function repeatBurst(page: Page) {
  await page.keyboard.down('ArrowRight');
  for (let i = 0; i < 12; i++) await page.keyboard.down('ArrowRight');
}

test('holding an arrow in a lesson leaves time for each move to animate', async ({ page }) => {
  await teacher(page);
  await repeatBurst(page);
  await expect(page.getByRole('gridcell', { name: 'g1 white knight', exact: true })).toBeVisible();
  await expect(page.getByText('Line complete', { exact: true })).toHaveCount(0);
  await page.keyboard.up('ArrowRight');
});

test('holding an arrow in game review plays consecutive moves with finished animations', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('switch', { name: 'Engine analysis' }).click();
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await page.getByRole('textbox', { name: 'PGN or FEN' }).fill('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6');
  await page.getByRole('button', { name: 'Import & explore' }).click();
  await page.getByRole('button', { name: 'Go to start', exact: true }).click();
  await page.evaluate(() => {
    (window as any).motionEvents = [];
    for (const type of ['transitionrun', 'transitionend', 'transitioncancel'])
      document.querySelector('.chessboard')!.addEventListener(type, (event) => {
        if (!(event.target as HTMLElement).matches('.board-piece')) return;
        (window as any).motionEvents.push({
          type,
          square: (event.target as HTMLElement).dataset.piece,
          at: performance.now(),
        });
      });
  });
  await repeatBurst(page);
  await expect(page.getByRole('gridcell', { name: 'g1 white knight', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const end = performance.now() + 1600;
    while (performance.now() < end) {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', repeat: true, bubbles: true }),
      );
      await new Promise((resolve) => setTimeout(resolve, 35));
    }
  });
  await page.keyboard.up('ArrowRight');
  const events = await page.evaluate(
    () => (window as any).motionEvents as { type: string; square: string; at: number }[],
  );
  const starts = events.filter((event) => event.type === 'transitionrun');
  expect(starts.map((event) => event.square)).toEqual(['e4', 'e5', 'f3', 'c6']);
  for (const start of starts.slice(0, -1))
    expect(
      events.some((event) => event.type === 'transitionend' && event.square === start.square),
    ).toBe(true);
  expect(events.filter((event) => event.type === 'transitioncancel')).toEqual([]);
});
