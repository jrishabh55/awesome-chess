import { useLayoutEffect, useRef } from 'react';

/** Let a held arrow continue only after the current move has finished travelling. */
export function useMoveKeyPacing(position: string) {
  const lastMoveAt = useRef(-Infinity);
  useLayoutEffect(() => {
    lastMoveAt.current = performance.now();
  }, [position]);
  return (event: KeyboardEvent) => {
    const now = performance.now();
    if (event.repeat && now - lastMoveAt.current < 500) return false;
    lastMoveAt.current = now;
    return true;
  };
}
