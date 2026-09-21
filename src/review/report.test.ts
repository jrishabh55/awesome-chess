import { it, expect } from 'vitest';
import { buildReport } from './report';
import { createStudy, parsePgn } from '../chess/tree';
it('does not invent empty accuracy or rating', () => {
  const r = buildReport(createStudy(), {});
  expect(r.w.accuracy).toBeNull();
  expect(r.b.performance).toBeNull();
});
it('does not claim an endgame occurred in a short opening', () => {
  const [s] = parsePgn('1. e4 e5 2. Nf3 Nc6 *');
  expect(buildReport(s, {}).w.phases.endgame.reached).toBe(false);
});
