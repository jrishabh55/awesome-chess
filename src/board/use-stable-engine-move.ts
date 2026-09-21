import { useEffect, useState } from 'react';
import { StableSuggestion, type Suggestion } from './stable-suggestion';

export function useStableEngineMove(key: string, candidate: string | undefined, enabled: boolean) {
  const [shown, setShown] = useState<Suggestion | null>(null);
  const [stabilizer] = useState(() => new StableSuggestion(setShown));
  useEffect(() => {
    stabilizer.update(enabled ? key : undefined, enabled ? candidate : undefined);
  }, [stabilizer, key, candidate, enabled]);
  useEffect(() => () => stabilizer.cancel(), [stabilizer]);
  // Suppress a previous position synchronously, before effect cleanup runs.
  return enabled && shown?.key === key ? shown.move : undefined;
}
