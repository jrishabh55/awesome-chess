import { expect, test, type Page } from '@playwright/test';
import { Chess } from 'chess.js';

const key = 'chess-room.opening-curriculum.v1';
async function snapshot(page: Page) {
  return page.evaluate((key) => {
    const library = JSON.parse(localStorage.getItem(key)!);
    return library.courses[library.activeCourseId];
  }, key);
}
async function enterTeacher(page: Page) {
  await page.goto('./');
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Opening teacher', exact: true })
    .click();
  await page.getByRole('button', { name: 'Resume course', exact: true }).click();
}
async function seed(page: Page) {
  await page.addInitScript(() => {
    if (localStorage.getItem('chess-room.opening-curriculum.v1')) return;
    Math.random = () => 0;
    const shared = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5';
    const course = {
      id: 'course:Grouped practice',
      name: 'Grouped practice',
      side: 'w',
      structure: 'responses-v1',
      sourceCount: 9,
      variations: [
        ...['Nf6', 'd6', 'Qe7', 'a6', 'Bb6', 'h6', 'b6'].map((reply, index) => ({
          id: `main-${index}`,
          name: `Grouped practice: Main line, Reply ${index}`,
          eco: 'C50',
          pgn: `${shared} 4. c3 ${reply}`,
        })),
        ...['Nf6', 'd6'].map((reply, index) => ({
          id: `other-${index}`,
          name: `Grouped practice: Other line, Reply ${index}`,
          eco: 'C50',
          pgn: `${shared} 4. d3 ${reply}`,
        })),
      ],
      sections: [
        {
          id: 'main',
          name: 'Main line',
          commonPgn: `${shared} 4. c3`,
          variationIndices: [0, 1, 2, 3, 4, 5, 6],
        },
        { id: 'other', name: 'Other line', commonPgn: `${shared} 4. d3`, variationIndices: [7, 8] },
      ],
    };
    const session = {
      lesson: 0,
      phase: 'guide',
      ply: 0,
      round: [],
      roundIndex: 0,
      mistakes: 0,
      hints: 0,
      scores: {},
      practice: 'batches',
      drill: 'batch',
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
  });
  await enterTeacher(page);
  await page.clock.install();
}
async function move(page: Page, uci: string) {
  await page.getByRole('gridcell', { name: new RegExp(`^${uci.slice(0, 2)} `) }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('gridcell', { name: new RegExp(`^${uci.slice(2, 4)} `) }).focus();
  await page.keyboard.press('Enter');
}
async function finishLine(page: Page) {
  await page.getByRole('button', { name: 'Go to end', exact: true }).click();
  await expect(page.getByText('Line complete', { exact: true })).toBeVisible();
  await page
    .getByRole('button', {
      name: /^(Next full line|Practice these \d+ variations|Practice this variation)$/,
    })
    .click();
}
async function finishDrill(page: Page) {
  for (let guard = 0; guard < 40; guard++) {
    const { course, session } = await snapshot(page);
    if (session.phase !== 'drill') break;
    const chess = new Chess();
    chess.loadPgn(course.variations[session.round[session.roundIndex]].pgn);
    const expected = chess.history({ verbose: true })[session.ply];
    if (expected.color === course.side)
      await move(page, expected.from + expected.to + (expected.promotion || ''));
    await page.clock.runFor(600);
  }
  await expect(page.getByRole('button', { name: 'Retry drill', exact: true })).toBeVisible();
}
async function finishRound(page: Page, lastButton: string) {
  const queue = (await snapshot(page)).session.round;
  const seen: number[] = [];
  for (let index = 0; index < queue.length; index++) {
    const session = (await snapshot(page)).session;
    seen.push(session.round[session.roundIndex]);
    await finishDrill(page);
    await page
      .getByRole('button', {
        name: index + 1 === queue.length ? lastButton : 'Next drill',
        exact: true,
      })
      .click();
  }
  expect(seen).toEqual(queue);
  expect(new Set(seen).size).toBe(queue.length);
  return queue;
}

test('finishes full lessons, drills only each batch, then re-shuffles all section lines', async ({
  page,
}) => {
  await seed(page);
  // Both manually played sides stay in this same full-line lesson.
  await move(page, 'e2e4');
  await page.clock.runFor(600);
  expect((await snapshot(page)).session).toMatchObject({ lesson: 0, ply: 1, phase: 'guide' });
  await move(page, 'e7e5');
  expect((await snapshot(page)).session).toMatchObject({ lesson: 0, ply: 2, phase: 'guide' });
  await expect(page.getByRole('button', { name: 'Next full line', exact: true })).toHaveCount(0);
  for (let lesson = 0; lesson < 5; lesson++) {
    expect((await snapshot(page)).session.lesson).toBe(lesson);
    await finishLine(page);
    if (lesson < 4) expect((await snapshot(page)).session.phase).toBe('guide');
  }
  await expect(page.getByText('Batch drill', { exact: true })).toBeVisible();
  expect([...(await snapshot(page)).session.round].sort()).toEqual([0, 1, 2, 3, 4]);
  await finishRound(page, 'Next learning batch');
  expect((await snapshot(page)).session.lesson).toBe(5);
  await finishLine(page);
  await finishLine(page);
  expect([...(await snapshot(page)).session.round].sort()).toEqual([5, 6]);
  await finishRound(page, 'Start section drill');
  await expect(page.getByText('Section drill', { exact: true })).toBeVisible();
  const section = (await snapshot(page)).session;
  expect([...section.round].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(section.round).not.toEqual([0, 1, 2, 3, 4, 5, 6]);
  await page.screenshot({ path: '/tmp/chess-section-drill.png' });
  await finishRound(page, 'Next section');
  expect((await snapshot(page)).session.lesson).toBe(7);
  await finishLine(page);
  await finishLine(page);
  expect([...(await snapshot(page)).session.round].sort()).toEqual([7, 8]);
  await finishRound(page, 'Start section drill');
  await finishRound(page, 'Finish course');
  await expect(page.getByText('Course complete', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Course score: 180 points', exact: true }),
  ).toBeVisible();
});

test('resumes a partly learned batch and a partly completed section queue without duplicating awards', async ({
  page,
}) => {
  await seed(page);
  await finishLine(page);
  await finishLine(page);
  const learned = (await snapshot(page)).session;
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Opening teacher', exact: true })
    .click();
  await page.getByRole('button', { name: 'Resume course', exact: true }).click();
  expect((await snapshot(page)).session).toEqual(learned);
  for (let lesson = 2; lesson < 5; lesson++) await finishLine(page);
  await finishRound(page, 'Next learning batch');
  await finishLine(page);
  await finishLine(page);
  await finishRound(page, 'Start section drill');
  await finishDrill(page);
  await page.getByRole('button', { name: 'Next drill', exact: true }).click();
  const saved = (await snapshot(page)).session;
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Opening teacher', exact: true })
    .click();
  await page.getByRole('button', { name: 'Resume course', exact: true }).click();
  expect((await snapshot(page)).session).toEqual(saved);
  await finishDrill(page);
  const points = Object.values((await snapshot(page)).session.scores).reduce<number>(
    (sum, score: any) => sum + score.best,
    0,
  );
  await page.getByRole('button', { name: 'Retry drill', exact: true }).click();
  await finishDrill(page);
  expect(
    Object.values((await snapshot(page)).session.scores).reduce<number>(
      (sum, score: any) => sum + score.best,
      0,
    ),
  ).toBe(points);
});

test('upgrades a deployed-style short Caro-Kann syllabus without losing earlier points', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('chess-room.opening-curriculum.v1')) return;
    const course = {
      id: 'course:Caro-Kann Defense',
      name: 'Caro-Kann Defense',
      side: 'b',
      sourceCount: 2,
      variations: [
        { id: 'old-foundation', eco: 'B10', name: 'Caro-Kann Defense', pgn: '1. e4 c6' },
        { id: 'old-next', eco: 'B12', name: 'Caro-Kann Defense', pgn: '1. e4 c6 2. d4' },
      ],
      sections: [
        { id: 'foundation', name: 'Foundation', commonPgn: '1. e4 c6', variationIndices: [0] },
        { id: 'next', name: 'After 2.d4', commonPgn: '1. e4 c6 2. d4', variationIndices: [1] },
      ],
    };
    const session = {
      lesson: 1,
      phase: 'guide',
      ply: 0,
      round: [],
      roundIndex: 0,
      mistakes: 0,
      hints: 0,
      scores: { '0:0': { best: 10, attempts: 1 } },
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
  });
  await page.goto('./');
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Opening teacher', exact: true })
    .click();
  await expect.poll(async () => (await snapshot(page)).course.structure).toBe('responses-v1');
  const updated = await snapshot(page);
  expect(updated.session.history.points).toBe(10);
  const chess = new Chess();
  chess.loadPgn(updated.course.variations[0].pgn);
  expect(chess.history().length).toBeGreaterThanOrEqual(20);
  expect(updated.course.sections[0].name).toBe('Classical Variation');
  await expect(
    page.getByRole('button', { name: 'Course score: 10 points', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Your syllabus now follows full opening lines/)).toBeVisible();
  await page.getByRole('button', { name: 'Resume course', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Classical Variation/ })).toBeVisible();
});
