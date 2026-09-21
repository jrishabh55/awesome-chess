import { expect, test, type Page } from '@playwright/test';
import { Chess } from 'chess.js';

async function openCourses(page: Page) {
  await page.goto('./');
  await page
    .getByRole('navigation', { name: 'Workspace', exact: true })
    .getByRole('button', { name: 'Opening teacher', exact: true })
    .click();
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  return page.getByRole('combobox', { name: 'Opening course', exact: true });
}

test('London search selects one complete course with shared-start sections', async ({ page }) => {
  const search = await openCourses(page);
  await expect(search).toBeVisible();
  await search.fill('London');
  await expect(page.getByRole('option', { name: 'London System', exact: true })).toHaveCount(1);
  await page.getByRole('option', { name: 'London System', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'London System', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Course sections', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Start London System', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Start London System', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByText('Guided lesson', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'White: d4', exact: true })).toBeVisible();
});

const curriculumKey = 'chess-room.opening-curriculum.v1';
async function progress(page: Page) {
  return page.evaluate((key) => {
    const library = JSON.parse(localStorage.getItem(key)!);
    return library.courses[library.activeCourseId];
  }, curriculumKey);
}
async function move(page: Page, uci: string) {
  await page.getByRole('gridcell', { name: new RegExp(`^${uci.slice(0, 2)} `) }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('gridcell', { name: new RegExp(`^${uci.slice(2, 4)} `) }).focus();
  await page.keyboard.press('Enter');
}
async function finishDrill(page: Page) {
  for (let guard = 0; guard < 120; guard++) {
    const { course, session } = await progress(page);
    if (session.phase !== 'drill') break;
    const chess = new Chess();
    chess.loadPgn(course.variations[session.round[session.roundIndex]].pgn);
    const expected = chess.history({ verbose: true })[session.ply];
    await move(page, expected.from + expected.to + (expected.promotion || ''));
  }
  await expect(page.getByRole('button', { name: 'Retry drill', exact: true })).toBeVisible();
}
async function finishLesson(page: Page) {
  await page.getByRole('button', { name: 'Go to end', exact: true }).click();
  await expect(page.getByText('Into the middlegame', { exact: true })).toBeVisible();
  await expect(page.locator('.ct-plan-list li').first()).toBeVisible();
  await page
    .getByRole('button', { name: /^Practice (this variation|all \d+ variations)$/ })
    .click();
  await expect(page.locator('.board-overlay > path')).toHaveCount(0);
}

test('Learned tracks variation recall, preserves catalog entries, and survives reload', async ({
  page,
}) => {
  const search = await openCourses(page);
  await page.getByRole('tab', { name: 'Learned', exact: true }).click();
  await expect(page.getByText('Your learning history starts here.', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Courses', exact: true }).click();
  await search.fill('London');
  await page.getByRole('option', { name: 'London System', exact: true }).click();
  await page.getByRole('button', { name: 'Start London System', exact: true }).click();
  await finishLesson(page);
  await move(page, 'e2e4');
  await finishDrill(page);
  const total = (await progress(page)).course.variations.length;
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  await page.getByRole('tab', { name: 'Learned', exact: true }).click();
  const card = page.getByRole('button', { name: 'View London System progress', exact: true });
  await expect(card).toContainText(`1/${total} learned`);
  await expect(card).toContainText('5 pts');
  await card.click();
  await page.getByRole('button', { name: /Foundation.*1\/1 learned/ }).click();
  await expect(page.locator('.course-variation')).toContainText('Learned · practice again');
  await page.getByRole('tab', { name: 'Courses', exact: true }).click();
  await search.fill('London');
  await expect(page.getByRole('option', { name: 'London System', exact: true })).toContainText(
    `1/${total} learned`,
  );
  await page.getByRole('option', { name: 'London System', exact: true }).click();
  await page.getByRole('button', { name: 'Resume London System', exact: true }).click();
  await page.getByRole('button', { name: 'Retry drill', exact: true }).click();
  await finishDrill(page);
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Workspace', exact: true })
    .getByRole('button', { name: 'Opening teacher', exact: true })
    .click();
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  await page.getByRole('tab', { name: 'Learned', exact: true }).click();
  await expect(card).toContainText(`1/${total} learned`);
  await expect(card).toContainText('10 pts');
  await card.click();
  await page.getByRole('button', { name: /Foundation.*1\/1 learned/ }).click();
  await expect(page.locator('.course-variation')).toContainText('Learned · clean recall');
  await page.screenshot({ path: '/tmp/chess-learned-progress.png' });
});

test('completed history survives a restart, loads without the catalog, and updates from another tab', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    const course = {
      id: 'course:Completed opening',
      name: 'Completed opening',
      side: 'w',
      sourceCount: 1,
      variations: [{ id: 'e4-line', eco: 'C20', name: 'Completed opening', pgn: '1. e4 e5' }],
      sections: [
        { id: 'foundation', name: 'Foundation', commonPgn: '1. e4 e5', variationIndices: [0] },
      ],
    };
    const session = {
      lesson: 0,
      phase: 'complete',
      ply: 2,
      round: [0],
      roundIndex: 0,
      mistakes: 0,
      hints: 0,
      scores: { '0:0': { best: 10, attempts: 1 } },
    };
    localStorage.setItem(
      'chess-room.opening-curriculum.v1',
      JSON.stringify({
        version: 2,
        activeCourseId: course.id,
        courses: { [course.id]: { course, session } },
      }),
    );
    localStorage.setItem('chess-room.opening-mode.v1', 'course');
  });
  await page.route('**/data/*.tsv', (route) => route.abort());
  await openCourses(page);
  await page.getByRole('tab', { name: 'Learned', exact: true }).click();
  const card = page.getByRole('button', { name: 'View Completed opening progress', exact: true });
  await expect(card).toContainText('Completed');
  await expect(card).toContainText('10 pts');
  await card.click();
  await expect(
    page.getByRole('progressbar', { name: 'Variations learned', exact: true }),
  ).toHaveAttribute('value', '1');
  await page.getByRole('button', { name: /Foundation.*1\/1 learned/ }).click();
  await expect(page.locator('.course-variation')).toContainText('Learned · clean recall');
  await page.getByRole('button', { name: 'Close opening dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Resume course', exact: true }).click();
  await page.getByRole('button', { name: 'Restart course', exact: true }).click();
  await page.getByRole('button', { name: 'Restart lessons', exact: true }).click();
  await expect(page.getByText('Guided lesson', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  await page.getByRole('tab', { name: 'Learned', exact: true }).click();
  await expect(card).toContainText('Completed');
  const other = await context.newPage();
  await other.goto('./');
  await other.evaluate(() => {
    const key = 'chess-room.opening-curriculum.v1';
    const library = JSON.parse(localStorage.getItem(key)!);
    const original = library.courses[library.activeCourseId];
    library.courses['course:Another opening'] = {
      course: { ...original.course, id: 'course:Another opening', name: 'Another opening' },
      session: { ...original.session, phase: 'guide', ply: 0, round: [], scores: {} },
    };
    localStorage.setItem(key, JSON.stringify(library));
  });
  await expect(
    page.getByRole('button', { name: 'View Another opening progress', exact: true }),
  ).toContainText('0/1 learned');
  await expect(card).toContainText('Completed');
  await page.screenshot({ path: '/tmp/chess-learned-list.png' });
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 667 },
  { width: 812, height: 375 },
]) {
  test(`opening library remains compact with persistent tabs at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const search = await openCourses(page);
    await search.fill('Sicilian');
    await page.getByRole('option', { name: 'Sicilian Defense', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const bounds = await dialog.boundingBox();
    expect(bounds!.height).toBeLessThanOrEqual(Math.min(640, viewport.height * 0.8) + 1);
    expect(bounds!.width).toBeLessThan(viewport.width);
    await expect(page.locator('.course-variation')).toHaveCount(0);
    await page.locator('.course-section-toggle').last().click();
    await expect(page.getByRole('tab', { name: 'Learned', exact: true })).toBeInViewport({
      ratio: 1,
    });
    await expect(
      page.getByRole('button', { name: 'Close opening dialog', exact: true }),
    ).toBeInViewport({ ratio: 1 });
    const scroll = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      width: document.documentElement.scrollWidth,
    }));
    expect(scroll.height).toBeLessThanOrEqual(viewport.height);
    expect(scroll.width).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({
      path: `/tmp/chess-library-compact-${viewport.width}x${viewport.height}.png`,
    });
  });
}

test('lessons advance automatically through cumulative unhinted rounds and clean retries upgrade points', async ({
  page,
}) => {
  const search = await openCourses(page);
  await search.fill('London');
  await page.getByRole('option', { name: 'London System', exact: true }).click();
  await page.getByRole('button', { name: 'Start London System', exact: true }).click();
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Black: / })).toBeVisible();
  await expect(page.locator('.ct-copy > p').first()).not.toContainText(
    'Follow the arrow and remember',
  );
  await finishLesson(page);
  await move(page, 'e2e4');
  await expect(page.getByText(/Incorrect move\. Try again/)).toBeVisible();
  await finishDrill(page);
  await expect(
    page.getByRole('button', { name: 'Course score: 5 points', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retry drill', exact: true }).click();
  await expect(page.locator('.board-overlay > path')).toHaveCount(0);
  await finishDrill(page);
  await expect(
    page.getByRole('button', { name: 'Course score: 10 points', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Next variation', exact: true }).click();
  for (let lesson = 1; lesson <= 2; lesson++) {
    await expect(page.getByText('Guided lesson', { exact: true })).toBeVisible();
    expect((await progress(page)).session.lesson).toBe(lesson);
    await finishLesson(page);
    const round = (await progress(page)).session.round;
    expect([...round].sort()).toEqual(Array.from({ length: lesson + 1 }, (_, index) => index));
    const seen: number[] = [];
    for (let drill = 0; drill <= lesson; drill++) {
      const current = (await progress(page)).session;
      seen.push(current.round[current.roundIndex]);
      await expect(page.locator('.board-overlay > path')).toHaveCount(0);
      await finishDrill(page);
      await page
        .getByRole('button', {
          name: drill < lesson ? 'Next drill' : 'Next variation',
          exact: true,
        })
        .click();
    }
    expect(new Set(seen).size).toBe(lesson + 1);
  }
  await expect(
    page.getByRole('button', { name: 'Course score: 60 points', exact: true }),
  ).toBeVisible();
  const saved = await progress(page);
  expect(saved.session.scores['0:0']).toEqual({ best: 10, attempts: 2 });
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Workspace', exact: true })
    .getByRole('button', { name: 'Opening teacher', exact: true })
    .click();
  await page.getByRole('button', { name: 'Resume course', exact: true }).click();
  expect((await progress(page)).session).toEqual(saved.session);
  await expect(
    page.getByRole('button', { name: 'Course score: 60 points', exact: true }),
  ).toBeVisible();
});

test('Sicilian includes its full database course and switching openings preserves separate progress', async ({
  page,
}) => {
  const search = await openCourses(page);
  await search.fill('Sicilian');
  await expect(page.getByRole('option', { name: 'Sicilian Defense', exact: true })).toHaveCount(1);
  await page.getByRole('option', { name: 'Sicilian Defense', exact: true }).click();
  await page.getByRole('button', { name: 'Start Sicilian Defense', exact: true }).click();
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  const sicilian = await progress(page);
  expect(sicilian.course.variations.length).toBeGreaterThan(40);
  expect(sicilian.course.side).toBe('b');
  expect(
    sicilian.course.sections.flatMap(
      (section: { variationIndices: number[] }) => section.variationIndices,
    ),
  ).toHaveLength(sicilian.course.variations.length);
  await finishLesson(page);
  await expect(
    page.getByRole('heading', { name: 'Your move as Black', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('gridcell', { name: 'e4 white pawn', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hint', exact: true }).click();
  await expect(page.locator('.board-overlay > path')).toHaveCount(1);
  const saved = await progress(page);
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  await search.fill('London');
  await page.getByRole('option', { name: 'London System', exact: true }).click();
  await page.getByRole('button', { name: 'Start London System', exact: true }).click();
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  await search.fill('Sicilian');
  await page.getByRole('option', { name: 'Sicilian Defense', exact: true }).click();
  await page.getByRole('button', { name: /^(Start|Resume) Sicilian Defense$/ }).click();
  expect((await progress(page)).session).toEqual(saved.session);
  await expect(page.locator('.board-overlay > path')).toHaveCount(0);
});

test('a stale course tab preserves newer progress and can load it without losing scores', async ({
  page,
  context,
}) => {
  const search = await openCourses(page);
  await search.fill('London');
  await page.getByRole('option', { name: 'London System', exact: true }).click();
  await page.getByRole('button', { name: 'Start London System', exact: true }).click();
  const stale = await context.newPage();
  await stale.goto('./');
  await stale
    .getByRole('navigation', { name: 'Workspace', exact: true })
    .getByRole('button', { name: 'Opening teacher', exact: true })
    .click();
  await stale.getByRole('button', { name: 'Resume course', exact: true }).click();
  await finishLesson(page);
  await finishDrill(page);
  const saved = await progress(page);
  await stale.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(stale.getByRole('alert')).toContainText('another tab');
  expect((await progress(stale)).session).toEqual(saved.session);
  await stale.getByRole('button', { name: 'Load saved progress', exact: true }).click();
  await expect(
    stale.getByRole('button', { name: 'Course score: 10 points', exact: true }),
  ).toBeVisible();
  await expect(stale.getByRole('button', { name: 'Retry drill', exact: true })).toBeVisible();
  await expect(stale.getByRole('alert')).toHaveCount(0);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 667 },
  { width: 812, height: 375 },
]) {
  test(`structured lessons and plans fit ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const search = await openCourses(page);
    await search.fill('London');
    await page.getByRole('option', { name: 'London System', exact: true }).click();
    await page.getByRole('button', { name: 'Start London System', exact: true }).click();
    for (const phase of ['guide', 'plans', 'drill']) {
      const metrics = await page.locator('.curriculum-teacher').evaluate((element) => {
        const board = element.querySelector('.chessboard')!.getBoundingClientRect();
        const actions = element.querySelector('.ot-actions')!.getBoundingClientRect();
        return {
          height: document.documentElement.scrollHeight,
          viewport: innerHeight,
          boardBottom: board.bottom,
          boardWidth: board.width,
          actionsTop: actions.top,
          actionsBottom: actions.bottom,
        };
      });
      expect(metrics.height).toBeLessThanOrEqual(metrics.viewport + 1);
      expect(metrics.boardWidth).toBeGreaterThan(150);
      expect(metrics.boardBottom).toBeLessThanOrEqual(metrics.viewport);
      expect(metrics.actionsTop).toBeGreaterThanOrEqual(0);
      expect(metrics.actionsBottom).toBeLessThanOrEqual(metrics.viewport);
      await page.locator('.chessboard').evaluate(async (board) => {
        await Promise.all(
          board
            .getAnimations({ subtree: true })
            .map((animation) => animation.finished.catch(() => {})),
        );
      });
      await page.screenshot({
        path: `/tmp/chess-course-${phase}-${viewport.width}x${viewport.height}.png`,
      });
      if (phase === 'guide')
        await page.getByRole('button', { name: 'Go to end', exact: true }).click();
      if (phase === 'plans') {
        const readPlan = page.getByRole('button', { name: 'Read full plan', exact: true });
        await expect(readPlan).toBeInViewport({ ratio: 1 });
        await readPlan.click();
        await expect(
          page.getByRole('heading', { name: 'Middlegame plans', exact: true }),
        ).toBeVisible();
        expect(await page.locator('.ct-full-ideas li').count()).toBeGreaterThan(1);
        await page.getByRole('button', { name: 'Close opening dialog', exact: true }).click();
        await page.getByRole('button', { name: 'Practice this variation', exact: true }).click();
      }
    }
  });
}
