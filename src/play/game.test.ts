import { expect, it } from 'vitest';
import { outcomeAt } from '../chess/outcome';
import { exportPgn, positionAt } from '../chess/tree';
import {
  advanceGame,
  annotateGame,
  createGame,
  defaultSettings,
  navigateHistory,
  resignGame,
  restoreSession,
  serializeSession,
  snapshotForReview,
  viewedStudy,
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

it('keeps a history cursor independent of the live game and incoming engine replies', () => {
  const game = advanceGame(createGame({ side: 'w', strengthId: 'skill-0' }), 'e2e4');
  let session: PlaySession = { game, settings: defaultSettings, orientation: 'w' };
  session = navigateHistory(session, 'previous');
  expect(session.viewPly).toBe(0);
  expect(viewedStudy(session.game!, session.viewPly).selectedId).toBe('root');
  expect(positionAt(session.game!.study, session.game!.study.selectedId).moves).toEqual(['e2e4']);
  session = { ...session, game: advanceGame(session.game!, 'e7e5') };
  expect(viewedStudy(session.game!, session.viewPly).selectedId).toBe('root');
  expect(session.game!.study.mainline).toHaveLength(2);
  session = navigateHistory(session, 'next');
  expect(session.viewPly).toBe(1);
  session = navigateHistory(session, 'next');
  expect(session.viewPly).toBeNull();
  expect(viewedStudy(session.game!, session.viewPly).selectedId).toBe(
    session.game!.study.selectedId,
  );
});

it('persists full live history, a history cursor and per-position drawings together', () => {
  let game = createGame({ side: 'w', strengthId: 'skill-0' });
  for (const move of ['e2e4', 'e7e5', 'g1f3']) game = advanceGame(game, move);
  game = annotateGame(game, 0, { kind: 'arrow', from: 'e2', to: 'e4', color: 'blue' });
  game = annotateGame(game, 1, { kind: 'square', square: 'd5', color: 'red' });
  const session: PlaySession = { game, settings: defaultSettings, orientation: 'w', viewPly: 1 };
  const restored = restoreSession(serializeSession(session))!;
  expect(restored.viewPly).toBe(1);
  expect(positionAt(restored.game!.study, restored.game!.study.selectedId).moves).toEqual([
    'e2e4',
    'e7e5',
    'g1f3',
  ]);
  expect(
    viewedStudy(restored.game!, restored.viewPly).nodes[restored.game!.study.mainline[0]].marks,
  ).toEqual([{ kind: 'square', square: 'd5', color: 'red' }]);
  expect(restored.game!.study.nodes.root.marks).toEqual([
    { kind: 'arrow', from: 'e2', to: 'e4', color: 'blue' },
  ]);
  const cleared = annotateGame(restored.game!, 1);
  expect(cleared.study.nodes[cleared.study.mainline[0]].marks).toEqual([]);
  expect(cleared.study.selectedId).toBe(restored.game!.study.selectedId);
  expect(cleared.study.nodes.root.marks).toHaveLength(1);
});

it('normalizes an invalid restored cursor without dropping a valid saved game', () => {
  const game = advanceGame(createGame(defaultSettings), 'e2e4');
  const raw = JSON.parse(serializeSession({ game, settings: defaultSettings, orientation: 'w' }));
  raw.viewPly = 200;
  const restored = restoreSession(JSON.stringify(raw))!;
  expect(restored.game?.study.mainline).toHaveLength(1);
  expect(restored.viewPly).toBeNull();
});

it('preserves the revision after reload so later drawings remain newer than earlier saves', () => {
  let game = createGame(defaultSettings);
  for (const move of ['f2f3', 'e7e5', 'g2g4', 'd8h4']) game = advanceGame(game, move);
  for (const square of ['e4', 'd4', 'c4'] as const)
    game = annotateGame(game, 4, { kind: 'square', square, color: 'green' });
  expect(game.study.revision).toBe(7);
  const session: PlaySession = { game, settings: defaultSettings, orientation: 'w' };
  const restored = restoreSession(serializeSession(session))!;
  expect(restored.game!.study.revision).toBe(7);
  expect(
    annotateGame(restored.game!, 4, { kind: 'square', square: 'b4', color: 'blue' }).study.revision,
  ).toBe(8);
  const legacy = JSON.parse(serializeSession(session));
  delete legacy.game.revision;
  expect(restoreSession(JSON.stringify(legacy))!.game!.study.revision).toBe(4);
  legacy.game.revision = -1;
  expect(restoreSession(JSON.stringify(legacy))).toBeNull();
});

it('hands review an independent fresh study with all moves and drawings preserved', () => {
  let game = advanceGame(createGame(defaultSettings), 'e2e4');
  game = annotateGame(game, 1, { kind: 'arrow', from: 'e4', to: 'e5', color: 'blue' });
  game = resignGame(game);
  const original = structuredClone(game.study);
  const first = snapshotForReview(game.study);
  const second = snapshotForReview(game.study);
  expect(first.id).not.toBe(game.study.id);
  expect(second.id).not.toBe(first.id);
  expect(first.mainline).toEqual(game.study.mainline);
  expect(first.nodes).toEqual(game.study.nodes);
  expect(first.headers.Result).toBe('0-1');
  expect(first.revision).toBe(game.study.revision);
  first.nodes[first.selectedId].marks.length = 0;
  first.headers.White = 'Changed in review';
  expect(game.study).toEqual(original);
  expect(second.nodes[second.selectedId].marks).toHaveLength(1);
});
