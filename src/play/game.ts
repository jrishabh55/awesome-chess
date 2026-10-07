import type { Color, Mark, Study } from '../chess/types';
import { chessAt, createStudy, playMove, positionAt, toggleMark } from '../chess/tree';
import {
  opponentFor,
  opponentName,
  opponentLabel,
  readOpponent,
  strengthFor,
  type Opponent,
} from './opponents';
export { strengths, strengthFor } from './opponents';
import { openingPractice, readOpening, type PlayOpening } from './openings';
export { openingMoves, type PlayOpening } from './openings';
export function nextOpeningMove(game: PlayGame): string | null {
  if (game.study.headers.Result !== '*') return null;
  const practice = openingPractice(game);
  return practice.kind === 'following' ? practice.nextMove : null;
}

export interface PlaySettings {
  side: Color | 'random';
  strengthId: string;
  opponent?: Opponent;
  opening?: PlayOpening;
  followOpeningVariations?: boolean;
}
export interface PlayGame {
  study: Study;
  humanColor: Color;
  strengthId: string;
  opponent: Opponent;
  startedAt: number;
  opening?: PlayOpening;
  followOpeningVariations: boolean;
}
export interface PlaySession {
  game: PlayGame | null;
  settings: PlaySettings;
  orientation: Color;
  /** Null follows the live game; a ply number pins an already played position. */
  viewPly?: number | null;
}
export const defaultSettings: PlaySettings = {
  side: 'w',
  strengthId: 'skill-0',
  followOpeningVariations: true,
};

export function createGame(settings: PlaySettings): PlayGame {
  const humanColor = settings.side === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : settings.side;
  const opponent = opponentFor(settings);
  const strength = strengthFor(
    opponent.kind === 'stockfish' ? opponent.strengthId : settings.strengthId,
  );
  const study = createStudy();
  const startedAt = Date.now();
  const followOpeningVariations = settings.followOpeningVariations !== false;
  const selected = readOpening(settings.opening);
  const opening =
    selected && !followOpeningVariations
      ? { name: selected.name, eco: selected.eco, pgn: selected.pgn }
      : selected;
  study.headers = {
    Event: `Casual game vs ${opponentName(opponent)}`,
    Site: 'Chess Room',
    Date: new Date(startedAt).toISOString().slice(0, 10).replaceAll('-', '.'),
    White: humanColor === 'w' ? 'You' : `${opponentName(opponent)} · ${opponentLabel(opponent)}`,
    Black: humanColor === 'b' ? 'You' : `${opponentName(opponent)} · ${opponentLabel(opponent)}`,
    Result: '*',
    ...(opening ? { Opening: opening.name, ECO: opening.eco } : {}),
  };
  return {
    study,
    humanColor,
    strengthId: strength.id,
    opponent,
    startedAt,
    followOpeningVariations,
    ...(opening ? { opening } : {}),
  };
}

export function replayOpening(game: PlayGame): PlayGame {
  return createGame({
    side: game.humanColor,
    strengthId: game.strengthId,
    opponent:
      game.opponent.kind === 'stockfish'
        ? { kind: 'stockfish', strengthId: game.strengthId }
        : game.opponent,
    opening: game.opening,
    followOpeningVariations: game.followOpeningVariations,
  });
}

export function changeGameOpponent(game: PlayGame, value: Opponent): PlayGame {
  const opponent = readOpponent(value);
  if (!opponent) throw Error('Choose a supported opponent strength.');
  return {
    ...game,
    opponent,
    strengthId: opponent.kind === 'stockfish' ? opponent.strengthId : game.strengthId,
    study: {
      ...game.study,
      revision: game.study.revision + 1,
      updatedAt: Date.now(),
      headers: {
        ...game.study.headers,
        Event: `Casual game vs ${opponentName(opponent)}`,
        [game.humanColor === 'w' ? 'Black' : 'White']:
          `${opponentName(opponent)} · ${opponentLabel(opponent)}`,
      },
    },
  };
}
export function changeGameStrength(game: PlayGame, strengthId: string): PlayGame {
  return changeGameOpponent(game, { kind: 'stockfish', strengthId });
}

export function advanceGame(game: PlayGame, move: string): PlayGame {
  if (game.study.headers.Result !== '*') throw Error('This game is already over.');
  const study = playMove(game.study, game.study.selectedId, move);
  study.mainline.push(study.selectedId);
  study.explorationOrigin = null;
  const chess = chessAt(study, study.selectedId);
  if (chess.isCheckmate()) {
    study.headers.Result = chess.turn() === 'w' ? '0-1' : '1-0';
    study.headers.Termination = 'Checkmate';
  } else if (chess.isDraw()) {
    study.headers.Result = '1/2-1/2';
    study.headers.Termination = chess.isStalemate()
      ? 'Stalemate'
      : chess.isInsufficientMaterial()
        ? 'Insufficient material'
        : chess.isThreefoldRepetition()
          ? 'Threefold repetition'
          : 'Fifty-move rule';
  }
  return { ...game, study };
}

export function resignGame(game: PlayGame): PlayGame {
  if (game.study.headers.Result !== '*') return game;
  return {
    ...game,
    study: {
      ...game.study,
      revision: game.study.revision + 1,
      updatedAt: Date.now(),
      headers: {
        ...game.study.headers,
        Result: game.humanColor === 'w' ? '0-1' : '1-0',
        Termination: 'Resignation',
      },
    },
  };
}

export function viewedStudy(game: PlayGame, viewPly?: number | null): Study {
  if (viewPly == null) return game.study;
  const ply = Math.max(0, Math.min(game.study.mainline.length, viewPly));
  return {
    ...game.study,
    selectedId: ply === 0 ? game.study.rootId : game.study.mainline[ply - 1],
  };
}

export function navigateHistory(
  session: PlaySession,
  target: 'start' | 'previous' | 'next' | 'end' | number,
): PlaySession {
  if (!session.game) return session;
  const end = session.game.study.mainline.length;
  const current = session.viewPly ?? end;
  const ply =
    typeof target === 'number'
      ? target
      : target === 'start'
        ? 0
        : target === 'end'
          ? end
          : current + (target === 'previous' ? -1 : 1);
  return { ...session, viewPly: ply >= end ? null : Math.max(0, ply) };
}

export function annotateGame(game: PlayGame, ply: number, mark?: Mark): PlayGame {
  const node = ply === 0 ? game.study.rootId : game.study.mainline[ply - 1];
  if (!node || !game.study.nodes[node]) return game;
  if (mark) return { ...game, study: toggleMark(game.study, node, mark) };
  const study = {
    ...game.study,
    revision: game.study.revision + 1,
    updatedAt: Date.now(),
    nodes: { ...game.study.nodes, [node]: { ...game.study.nodes[node], marks: [] } },
  };
  return { ...game, study };
}

/** Review owns its copy, including any variations added after the handoff. */
export function snapshotForReview(study: Study): Study {
  return { ...structuredClone(study), id: crypto.randomUUID(), updatedAt: Date.now() };
}

function validMark(mark: unknown): mark is Mark {
  if (!mark || typeof mark !== 'object') return false;
  const value = mark as Record<string, unknown>;
  const square = (s: unknown) => typeof s === 'string' && /^[a-h][1-8]$/.test(s);
  if (!['green', 'red', 'orange', 'blue', 'yellow'].includes(value.color as string)) return false;
  return value.kind === 'square'
    ? square(value.square)
    : value.kind === 'arrow' && square(value.from) && square(value.to);
}

export function serializeSession(session: PlaySession): string {
  const game = session.game;
  return JSON.stringify({
    version: 2,
    settings: { ...session.settings, opponent: opponentFor(session.settings) },
    orientation: session.orientation,
    viewPly: session.viewPly ?? null,
    game: game
      ? {
          id: game.study.id,
          revision: game.study.revision,
          humanColor: game.humanColor,
          strengthId: game.strengthId,
          opponent: game.opponent,
          startedAt: game.startedAt,
          opening: game.opening,
          followOpeningVariations: game.followOpeningVariations,
          moves: positionAt(game.study, game.study.selectedId).moves,
          resigned: game.study.headers.Termination === 'Resignation',
          marks: [game.study.rootId, ...game.study.mainline].map(
            (id) => game.study.nodes[id].marks,
          ),
        }
      : null,
  });
}

export function restoreSession(raw: string | null): PlaySession | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    if (
      ![1, 2].includes(saved.version) ||
      !['w', 'b'].includes(saved.orientation) ||
      !['w', 'b', 'random'].includes(saved.settings?.side) ||
      !readOpponent({ kind: 'stockfish', strengthId: saved.settings?.strengthId })
    )
      return null;
    const settingsOpponent = readOpponent(
      saved.version === 1
        ? { kind: 'stockfish', strengthId: saved.settings.strengthId }
        : saved.settings.opponent,
    );
    if (!settingsOpponent) return null;
    let game: PlayGame | null = null;
    if (saved.game) {
      const g = saved.game;
      if (
        typeof g.id !== 'string' ||
        !g.id ||
        (g.revision !== undefined && (!Number.isSafeInteger(g.revision) || g.revision < 0)) ||
        !['w', 'b'].includes(g.humanColor) ||
        !readOpponent({ kind: 'stockfish', strengthId: g.strengthId }) ||
        !Number.isFinite(g.startedAt) ||
        !Array.isArray(g.moves) ||
        g.moves.length > 2000 ||
        typeof g.resigned !== 'boolean'
      )
        return null;
      const gameOpponent = readOpponent(
        saved.version === 1 ? { kind: 'stockfish', strengthId: g.strengthId } : g.opponent,
      );
      if (!gameOpponent) return null;
      game = createGame({
        side: g.humanColor,
        strengthId: g.strengthId,
        opponent: gameOpponent,
        opening: readOpening(g.opening),
        followOpeningVariations: g.followOpeningVariations === true,
      });
      game.study.id = g.id;
      game.startedAt = g.startedAt;
      game.study.headers.Date = new Date(g.startedAt)
        .toISOString()
        .slice(0, 10)
        .replaceAll('-', '.');
      for (const move of g.moves) {
        if (typeof move !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) return null;
        game = advanceGame(game, move);
      }
      if (g.resigned) game = resignGame(game);
      if (g.marks !== undefined) {
        if (!Array.isArray(g.marks) || g.marks.length !== game.study.mainline.length + 1)
          return null;
        const ids = [game.study.rootId, ...game.study.mainline];
        for (let i = 0; i < ids.length; i++) {
          if (!Array.isArray(g.marks[i]) || !g.marks[i].every(validMark)) return null;
          game.study.nodes[ids[i]].marks = g.marks[i];
        }
      }
      // Older saves omitted revisions; their replayed move count remains a
      // valid baseline. New saves retain annotation and resignation edits.
      if (g.revision !== undefined) game.study.revision = g.revision;
    }
    return {
      game,
      settings: {
        side: saved.settings.side,
        strengthId:
          settingsOpponent.kind === 'stockfish'
            ? settingsOpponent.strengthId
            : saved.settings.strengthId,
        opponent: settingsOpponent,
        followOpeningVariations: saved.settings.followOpeningVariations !== false,
        ...(readOpening(saved.settings.opening)
          ? { opening: readOpening(saved.settings.opening) }
          : {}),
      },
      orientation: saved.orientation,
      viewPly:
        game &&
        Number.isInteger(saved.viewPly) &&
        saved.viewPly >= 0 &&
        saved.viewPly < game.study.mainline.length
          ? saved.viewPly
          : null,
    };
  } catch {
    return null;
  }
}
