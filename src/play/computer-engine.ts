import type { PositionInput } from '../chess/types';
import type { EngineLoadState } from '../engine/prepare-worker';
import { PlayEngine } from './engine';
import { MaiaEngine } from './maia/client';
import { strengthFor, type Opponent } from './opponents';

export interface ComputerEngine {
  start(): Promise<void>;
  bestMove(position: PositionInput, signal: AbortSignal): Promise<string>;
  dispose(): void;
}
export function createComputerEngine(
  opponent: Opponent,
  progress: (state: EngineLoadState) => void,
): ComputerEngine {
  if (opponent.kind === 'maia') return new MaiaEngine(opponent.rating, progress);
  const stockfish = new PlayEngine(progress);
  return {
    start: () => stockfish.start(),
    bestMove: (position, signal) =>
      stockfish.bestMove(position, strengthFor(opponent.strengthId).value, signal),
    dispose: () => stockfish.dispose(),
  };
}
