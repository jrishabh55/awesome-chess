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
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(thought).toHaveAttribute('data-square', 'e5');
  await expect(thought).toContainText(/Black.*e5/);
  const before = await thought.boundingBox();
  await page.keyboard.press('x');
  const after = await thought.boundingBox();
  expect(Math.abs(after!.y - before!.y)).toBeGreaterThan(30);
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(thought).toHaveAttribute('data-square', 'f3');
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
  await expect(page.locator('.board-overlay rect')).toHaveCount(0);
});

test('square highlights stay underneath the pieces', async ({ page }) => {
  await teacher(page);
  await page.keyboard.press('Tab');
  const square = page.getByRole('gridcell', { name: 'd5 empty', exact: true });
  await square.focus();
  await expect(square).toBeFocused();
  const layers = await page.locator('.chessboard').evaluate((board) => {
    const square = board.querySelector('.board-overlay rect')!;
    return {
      squares: Number(getComputedStyle(square.closest('svg')!).zIndex),
      pieces: Number(getComputedStyle(board.querySelector('.piece-layer')!).zIndex),
      focusedSquare:
        Number(getComputedStyle(board.querySelector('[aria-label="d5 empty"]')!).zIndex) || 0,
    };
  });
  expect(layers.squares).toBeLessThan(layers.pieces);
  expect(layers.focusedSquare).toBeLessThan(layers.squares);
});

test('closing a thought leaves the position alone and the next move shows a new thought', async ({
  page,
}) => {
  await teacher(page);
  await page
    .getByRole('button', { name: 'Close move thought', exact: true })
    .click({ timeout: 1500 });
  await expect(page.getByRole('status', { name: 'Move thought' })).toHaveCount(0);
  await expect(page.getByRole('gridcell', { name: 'e2 white pawn', exact: true })).toBeVisible();
  await page.keyboard.press('x');
  await expect(page.getByRole('status', { name: 'Move thought' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Move thought' })).toHaveAttribute(
    'data-square',
    'e4',
  );
});

test('opening preferences persist and control bubbles, highlights, and animation', async ({
  page,
}) => {
  await teacher(page);
  await page.getByRole('button', { name: 'Board settings', exact: true }).click({ timeout: 1500 });
  await page.getByRole('slider', { name: 'Bubble opacity', exact: true }).fill('70');
  await page.getByRole('checkbox', { name: 'Glass effect', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Close opening dialog', exact: true }).click();
  const thought = page.getByRole('status', { name: 'Move thought' });
  await expect(thought).toHaveCSS('backdrop-filter', 'none');
  const background = await thought.evaluate((bubble) => getComputedStyle(bubble).backgroundImage);
  expect(background).toContain('0.7');
  await page.getByRole('button', { name: 'Board settings', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Show thought bubbles', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Highlight explained squares', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Animate pieces', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Close opening dialog', exact: true }).click();
  await expect(thought).toHaveCount(0);
  await expect(page.locator('.board-overlay rect')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(page.locator('.board-piece[data-piece="e4"]')).toHaveCSS(
    'transition-duration',
    '0s',
  );
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Opening teacher', exact: true })
    .click();
  await page.getByRole('button', { name: 'Board settings', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Show thought bubbles', exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Highlight explained squares', exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Animate pieces', exact: true }),
  ).not.toBeChecked();
  await expect(page.getByRole('slider', { name: 'Bubble opacity', exact: true })).toHaveValue('70');
  await page.getByRole('button', { name: 'Close opening dialog', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Game review', exact: true })
    .click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Show thought bubbles', exact: true }),
  ).not.toBeChecked();
  await expect(page.getByRole('slider', { name: 'Bubble opacity', exact: true })).toHaveValue('70');
});

test('failed preference writes retain the previous setting and saved lesson', async ({ page }) => {
  await teacher(page);
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'chess-room.opening-preferences.v1')
        throw new DOMException('Storage full', 'QuotaExceededError');
      setItem.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'Board settings', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Show thought bubbles', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('settings could not be saved');
  await expect(
    page.getByRole('checkbox', { name: 'Show thought bubbles', exact: true }),
  ).toBeChecked();
  await page.getByRole('button', { name: 'Close opening dialog', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Move thought' })).toBeVisible();
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(page.getByRole('gridcell', { name: 'e4 white pawn', exact: true })).toBeVisible();
});

test('bubble squares use the existing highlight design and follow each explanation', async ({
  page,
}) => {
  await teacher(page);
  const mark = (x: number, y: number, color: string) =>
    page.locator(`.board-overlay rect[x="${x}"][y="${y}"][fill="${color}"]`);
  await expect(mark(4, 4, '#8fbb55')).toHaveAttribute('opacity', '.65');
  await expect(mark(3, 3, '#57a1de')).toHaveAttribute('opacity', '.65');
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Move thought' })).toHaveAttribute(
    'data-square',
    'e5',
  );
  await expect(mark(4, 3, '#8fbb55')).toBeVisible();
  await expect(mark(3, 4, '#57a1de')).toBeVisible();
  await expect(mark(3, 3, '#57a1de')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Move thought' })).toHaveAttribute(
    'data-square',
    'f3',
  );
  await expect(mark(5, 5, '#8fbb55')).toBeVisible();
  await expect(mark(4, 3, '#f65c54')).toBeVisible();
  await page.keyboard.press('x');
  await expect(mark(2, 2, '#8fbb55')).toBeVisible();
  await expect(mark(3, 4, '#f65c54')).toBeVisible();
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Move thought' })).toHaveAttribute(
    'data-square',
    'c6',
  );
  await expect(mark(5, 5, '#8fbb55')).toBeVisible();
  await expect(mark(3, 4, '#57a1de')).toBeVisible();
  await expect(mark(3, 4, '#f65c54')).toHaveCount(0);
});

test('mobile thoughts stay inside the board and do not intercept piece input', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await teacher(page);
  const thought = page.getByRole('status', { name: 'Move thought' });
  await page.screenshot({ path: test.info().outputPath('mobile-thought.png') });
  await page.getByRole('gridcell', { name: 'e2 white pawn', exact: true }).click();
  await page.getByRole('gridcell', { name: 'e4 empty', exact: true }).click();
  await page.getByRole('gridcell', { name: 'e7 black pawn', exact: true }).click();
  await page.getByRole('gridcell', { name: 'e5 empty', exact: true }).click();
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
