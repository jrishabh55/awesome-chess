import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StableSuggestion, type Suggestion } from './stable-suggestion';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const setup = () => {
  let visible: Suggestion | null = null;
  const updates: (Suggestion | null)[] = [];
  const stabilizer = new StableSuggestion((value) => {
    visible = value;
    updates.push(value);
  });
  return { stabilizer, updates, visible: () => visible };
};

it('hides changing initial candidates until one stays stable for 500ms', () => {
  const s = setup();
  s.stabilizer.update('position-a', 'e2e4');
  vi.advanceTimersByTime(200);
  s.stabilizer.update('position-a', 'd2d4');
  vi.advanceTimersByTime(200);
  s.stabilizer.update('position-a', 'g1f3');
  vi.advanceTimersByTime(499);
  expect(s.visible()).toBeNull();
  vi.advanceTimersByTime(1);
  expect(s.visible()).toEqual({ key: 'position-a', move: 'g1f3' });
  expect(s.updates.filter(Boolean)).toHaveLength(1);
});

it('does not postpone a stable move when deeper evaluations arrive', () => {
  const s = setup();
  for (let i = 0; i < 5; i++) {
    s.stabilizer.update('position-a', 'e2e4');
    vi.advanceTimersByTime(100);
  }
  expect(s.visible()).toEqual({ key: 'position-a', move: 'e2e4' });
});

it('keeps the settled arrow visible while its replacement is still changing', () => {
  const s = setup();
  s.stabilizer.update('position-a', 'e2e4');
  vi.advanceTimersByTime(500);
  s.stabilizer.update('position-a', 'd2d4');
  vi.advanceTimersByTime(300);
  expect(s.visible()?.move).toBe('e2e4');
  s.stabilizer.update('position-a', 'g1f3');
  vi.advanceTimersByTime(500);
  expect(s.visible()?.move).toBe('g1f3');
});

it('clears the previous position immediately and cancels skipped-position timers', () => {
  const s = setup();
  s.stabilizer.update('position-a', 'e2e4');
  vi.advanceTimersByTime(500);
  s.stabilizer.update('position-b', 'e7e5');
  expect(s.visible()).toBeNull();
  vi.advanceTimersByTime(200);
  s.stabilizer.update('position-c', 'g1f3');
  vi.advanceTimersByTime(300);
  expect(s.visible()).toBeNull();
  vi.advanceTimersByTime(200);
  expect(s.visible()).toEqual({ key: 'position-c', move: 'g1f3' });
});

it('clears and cancels pending arrows when suggestions are disabled or absent', () => {
  const s = setup();
  s.stabilizer.update('position-a', 'e2e4');
  vi.advanceTimersByTime(500);
  s.stabilizer.update('position-a', undefined);
  expect(s.visible()).toBeNull();
  s.stabilizer.update('position-a', 'd2d4');
  vi.advanceTimersByTime(100);
  s.stabilizer.update(undefined, undefined);
  vi.advanceTimersByTime(1000);
  expect(s.visible()).toBeNull();
});

it('never publishes after disposal', () => {
  const s = setup();
  s.stabilizer.update('position-a', 'e2e4');
  vi.advanceTimersByTime(200);
  s.stabilizer.cancel();
  vi.advanceTimersByTime(1000);
  expect(s.updates.filter(Boolean)).toHaveLength(0);
});
