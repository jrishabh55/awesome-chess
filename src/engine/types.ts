import { assetUrl } from '../app/asset-url';
import { ENGINE_BUILD_ID } from './build';
import type { Color, PositionInput } from '../chess/types';
export type Score = { kind: 'cp'; value: number } | { kind: 'mate'; moves: number; winner: Color };
export interface EngineLine {
  rank: number;
  score: Score;
  depth: number;
  pv: string[];
  bound: 'exact' | 'lower' | 'upper';
}
export type SearchBudget =
  { kind: 'depth'; depth: number } | { kind: 'time'; milliseconds: number } | { kind: 'infinite' };
export interface AnalyzeRequest {
  id: string;
  position: PositionInput;
  budget: SearchBudget;
  multiPv: number;
  rootMoves?: string[];
}
export interface AnalysisResult {
  requestId: string;
  engineId: string;
  profileId: string;
  positionKey: string;
  lines: EngineLine[];
  completed: boolean;
}
export type EngineFlavor = 'full' | 'lite';
export const engineUrl = (flavor: EngineFlavor) => {
  const name = assetUrl(`engine/stockfish-19-${flavor === 'full' ? 'single' : 'lite-single'}`);
  return `${name}.js?build=${ENGINE_BUILD_ID}#${encodeURIComponent(`${name}.wasm?build=${ENGINE_BUILD_ID}`)}`;
};
