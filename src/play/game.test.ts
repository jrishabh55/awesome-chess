import { expect, it } from 'vitest';
import { outcomeAt } from '../chess/outcome';
import { exportPgn, positionAt } from '../chess/tree';
import {
  advanceGame,
  createGame,
  resignGame,
  restoreSession,
  serializeSession,
  type PlaySession,
} from './game';

it('builds a proper review mainline and marks checkmate', () => {
  let game = createGame({ side: 'w', strengthId: 'skill-0' });
  for (const move of ['f2f3', 'e7e5', 'g2g4', 'd8h4']) game = advanceGame(game, move);
  expect(game.study.mainline).toHaveLength(4);
  expect(game.study.explorationOrigin).toBeNull();
  expect(game.study.headers.Result).toBe('0-1');
  expect(outcomeAt(game.study)).toEqual({ kind: 'win', winner: 'b', reason: 'checkmate' });
  expect(exportPgn(game.study)).toContain('Qh4#');
  expect(() => advanceGame(game, 'e2e4')).toThrow(/over/i);
});

it('records resignation for the human side and restores a completed game', () => {
  const game = resignGame(createGame({ side: 'b', strengthId: 'elo-1600' }));
  const session: PlaySession = {
    game,
    settings: { side: 'b', strengthId: 'elo-1600' },
    orientation: 'b',
  };
  const restored = restoreSession(serializeSession(session))!;
  expect(restored.game?.study.id).toBe(game.study.id);
  expect(restored.game?.study.headers.Result).toBe('1-0');
  expect(outcomeAt(restored.game!.study)).toEqual({
    kind: 'win',
    winner: 'w',
    reason: 'resignation',
  });
});

it('resumes legal move history, settings and orientation without trusting saved nodes', () => {
  const game = advanceGame(createGame({ side: 'w', strengthId: 'elo-2000' }), 'e2e4');
  const session: PlaySession = {
    game,
    settings: { side: 'random', strengthId: 'elo-2000' },
    orientation: 'b',
  };
  const restored = restoreSession(serializeSession(session))!;
  expect(positionAt(restored.game!.study, restored.game!.study.selectedId).moves).toEqual(['e2e4']);
  expect(restored.orientation).toBe('b');
  expect(restored.settings.side).toBe('random');
  expect(restoreSession('{broken')).toBeNull();
  const invalid = JSON.parse(serializeSession(session));
  invalid.game.moves = ['e2e5'];
  expect(restoreSession(JSON.stringify(invalid))).toBeNull();
});

it('ends a game after threefold repetition with its full history intact', () => {
  let game = createGame({ side: 'w', strengthId: 'skill-0' });
  for (const move of ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'])
    game = advanceGame(game, move);
  expect(game.study.headers.Result).toBe('1/2-1/2');
  expect(outcomeAt(game.study)).toEqual({ kind: 'draw' });
});
