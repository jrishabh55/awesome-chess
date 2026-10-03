import { useMemo, useSyncExternalStore } from 'react';

export interface OpeningPreferences {
  autoLessonReplies: boolean;
  autoDrillReplies: boolean;
  showThoughts: boolean;
  glassEffect: boolean;
  highlightSquares: boolean;
  animatePieces: boolean;
  bubbleOpacity: number;
  replyDelayMs: number;
}
export const OPENING_PREFERENCES_KEY = 'chess-room.opening-preferences.v1';
const changedEvent = 'chess-room.opening-preferences-changed';
const defaults: OpeningPreferences = {
  autoLessonReplies: false,
  autoDrillReplies: true,
  showThoughts: true,
  glassEffect: true,
  highlightSquares: true,
  animatePieces: true,
  bubbleOpacity: 90,
  replyDelayMs: 500,
};

export function parseOpeningPreferences(raw: string | null): OpeningPreferences {
  const result = { ...defaults };
  try {
    const data = raw ? JSON.parse(raw) : null;
    if (!data || data.version !== 1 || !data.preferences || typeof data.preferences !== 'object')
      return result;
    const values = data.preferences;
    for (const key of [
      'autoLessonReplies',
      'autoDrillReplies',
      'showThoughts',
      'glassEffect',
      'highlightSquares',
      'animatePieces',
    ] as const)
      if (typeof values[key] === 'boolean') result[key] = values[key];
    if (
      Number.isInteger(values.bubbleOpacity) &&
      values.bubbleOpacity >= 40 &&
      values.bubbleOpacity <= 100
    )
      result.bubbleOpacity = values.bubbleOpacity;
    if (
      Number.isInteger(values.replyDelayMs) &&
      values.replyDelayMs >= 500 &&
      values.replyDelayMs <= 3000
    )
      result.replyDelayMs = values.replyDelayMs;
  } catch {
    // A damaged preference must never prevent the opening or saved progress from loading.
  }
  return result;
}
function readRaw() {
  try {
    return localStorage.getItem(OPENING_PREFERENCES_KEY);
  } catch {
    return null;
  }
}
function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === OPENING_PREFERENCES_KEY || event.key === null) notify();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(changedEvent, notify);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(changedEvent, notify);
  };
}
export function useOpeningPreferences() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  return useMemo(() => parseOpeningPreferences(raw), [raw]);
}
export function updateOpeningPreferences(patch: Partial<OpeningPreferences>) {
  const preferences = { ...parseOpeningPreferences(readRaw()), ...patch };
  localStorage.setItem(OPENING_PREFERENCES_KEY, JSON.stringify({ version: 1, preferences }));
  window.dispatchEvent(new Event(changedEvent));
}
