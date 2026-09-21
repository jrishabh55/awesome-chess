import { it, expect } from 'vitest';
import { baseLabel, expected, primaryLabel, performance } from './policy';
it.each([
  [0.01, 'Excellent'],
  [0.03, 'Good'],
  [0.08, 'Inaccuracy'],
  [0.18, 'Mistake'],
  [0.181, 'Blunder'],
])('classifies quality loss %s', (loss, label) =>
  expect(baseLabel(Number(loss), false)).toBe(label),
);
it('does not let book conceal an error', () =>
  expect(primaryLabel('Blunder', true, { brilliant: false, great: false, miss: false })).toBe(
    'Blunder',
  ));
it('best is distinct and extreme scores stay finite', () => {
  expect(baseLabel(0, true)).toBe('Best');
  expect(expected(0)).toBe(0.5);
  expect(expected(-100000)).toBeCloseTo(0, 10);
});
it('refuses ratings from too few decisions', () =>
  expect(performance([{ accuracy: 100, gap: 0.2 }])).toBeNull());
it('uses all special categories with one primary label', () => {
  expect(primaryLabel('Best', true, { brilliant: true, great: true, miss: false })).toBe(
    'Brilliant',
  );
  expect(primaryLabel('Best', false, { brilliant: false, great: true, miss: false })).toBe('Great');
  expect(primaryLabel('Mistake', false, { brilliant: false, great: false, miss: true })).toBe(
    'Miss',
  );
  expect(primaryLabel('Best', true, { brilliant: false, great: false, miss: false })).toBe('Book');
});
