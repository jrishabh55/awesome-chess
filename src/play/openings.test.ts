import { expect, it } from 'vitest';
import {
  advanceGame,
  createGame,
  defaultSettings,
  replayOpening,
  restoreSession,
  serializeSession,
} from './game';
import { compileOpening, openingPractice, type PlayOpeningLine } from './openings';

const vienna = { name: 'Vienna Game', eco: 'C25', pgn: '1. e4 e5 2. Nc3' };
const gambit = {
  name: 'Vienna Game: Gambit',
  eco: 'C29',
  pgn: '1. e4 e5 2. Nc3 Nf6 3. f4 d5 4. fxe5 Nxe4 5. Nf3 Nc6',
};
const mieses = {
  name: 'Vienna Game: Mieses',
  eco: 'C26',
  pgn: '1. e4 e5 2. Nc3 Nf6 3. g3 d5 4. exd5 Nxd5',
};
const maxLange = {
  name: 'Vienna Game: Max Lange',
  eco: 'C25',
  pgn: '1. e4 e5 2. Nc3 Nc6 3. Bc4 Bc5',
};
const catalog: PlayOpeningLine[] = [
  vienna,
  { ...maxLange, pgn: '1. e4 e5 2. Nc3 Nc6' },
  mieses,
  gambit,
  maxLange,
  { name: 'Scandinavian', eco: 'B01', pgn: '1. e4 d5' },
  { name: 'Broken continuation', eco: 'C25', pgn: '1. e4 e5 2. Nc3 e5' },
];
const opening = () => compileOpening(vienna, catalog);
const play = (moves: string[], followOpeningVariations = true) =>
  moves.reduce(
    advanceGame,
    createGame({ ...defaultSettings, opening: opening(), followOpeningVariations }),
  );

it('continues after the base opening toward its longest available branch', () => {
  const game = play(['e2e4', 'e7e5', 'b1c3']);
  expect(openingPractice(game)).toMatchObject({
    kind: 'following',
    nextMove: 'g8f6',
    name: 'Vienna Game',
  });
  expect(opening()!.continuations).toHaveLength(5);
  expect(
    opening()!.continuations!.some(
      (line) => line.name === 'Scandinavian' || line.name === 'Broken continuation',
    ),
  ).toBe(false);
});

it('accepts another recorded White response and finishes its full continuation', () => {
  let game = play(['e2e4', 'e7e5', 'b1c3', 'g8f6', 'g2g3']);
  expect(openingPractice(game)).toMatchObject({ kind: 'following', nextMove: 'd7d5' });
  for (const move of ['d7d5', 'e4d5', 'f6d5']) game = advanceGame(game, move);
  expect(openingPractice(game)).toMatchObject({ kind: 'complete', name: mieses.name });
  game = advanceGame(game, 'f1g2');
  expect(openingPractice(game).kind).toBe('complete');
});

it('allows Black to choose another available branch', () => {
  const game = play(['e2e4', 'e7e5', 'b1c3', 'b8c6']);
  expect(openingPractice({ ...game, humanColor: 'b' })).toMatchObject({
    kind: 'following',
    nextMove: 'f1c4',
    name: maxLange.name,
  });
});

it('records the first departure and keeps it after subsequent free play', () => {
  let game = play(['e2e4', 'e7e5', 'b1c3', 'g8f6', 'a2a3']);
  expect(openingPractice(game)).toMatchObject({ kind: 'diverged', departurePly: 5 });
  game = advanceGame(game, 'd7d5');
  expect(openingPractice(game)).toMatchObject({ kind: 'diverged', departurePly: 5 });
});

it('can keep exact-line practice without following longer branches', () => {
  const game = play(['e2e4', 'e7e5', 'b1c3'], false);
  expect(openingPractice(game).kind).toBe('complete');
});

it('restores branches and the selected setting without requiring the catalog', () => {
  const game = play(['e2e4', 'e7e5', 'b1c3', 'g8f6', 'g2g3']);
  const settings = { ...defaultSettings, opening: vienna, followOpeningVariations: true };
  const raw = serializeSession({ game, settings, orientation: 'w' });
  const restored = restoreSession(raw)!;
  expect(openingPractice(restored.game!)).toMatchObject({ kind: 'following', nextMove: 'd7d5' });
  expect(restored.settings.followOpeningVariations).toBe(true);
  const tampered = JSON.parse(raw);
  tampered.game.opening.continuations.push({
    name: 'Outside opening',
    eco: 'B01',
    pgn: '1. e4 d5',
  });
  const invalid = restoreSession(JSON.stringify(tampered))!;
  expect(invalid.game!.study.mainline).toHaveLength(5);
  expect(invalid.game!.opening).toBeUndefined();
});

it('replays from move one with the same actual side, strength and opening branches', () => {
  const game = {
    ...play(['e2e4', 'e7e5', 'b1c3', 'g8f6', 'a2a3']),
    humanColor: 'b' as const,
    strengthId: 'elo-1600',
  };
  const replay = replayOpening(game);
  expect(replay.study.id).not.toBe(game.study.id);
  expect(replay.study.mainline).toHaveLength(0);
  expect(replay.humanColor).toBe('b');
  expect(replay.strengthId).toBe('elo-1600');
  expect(replay.opening).toEqual(game.opening);
  expect(openingPractice(replay)).toMatchObject({ kind: 'following', nextMove: 'e2e4' });
  expect(game.study.mainline).toHaveLength(5);
});
