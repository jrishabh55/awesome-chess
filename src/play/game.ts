import type { Color, Mark, Study } from '../chess/types';
import { chessAt, createStudy, playMove, positionAt, toggleMark } from '../chess/tree';
import type { Strength } from './engine';

// Stockfish documents Elo 1320–3190 and Skill Level 0–20. Its calibration
// uses 120s+1s; these short, lite-engine games are approximate targets only.
// https://official-stockfish.github.io/docs/stockfish-wiki/UCI-Protocol-and-Stockfish-Commands.html
export const strengths: { id: string; label: string; detail: string; value: Strength }[] = [
  {
    id: 'skill-0',
    label: 'Skill 0',
    detail: 'Easiest Stockfish setting',
    value: { kind: 'skill', value: 0 },
  },
  {
    id: 'elo-1320',
    label: '≈1320 Elo',
    detail: 'A gentle challenge',
    value: { kind: 'elo', value: 1320 },
  },
  {
    id: 'elo-1600',
    label: '≈1600 Elo',
    detail: 'Build your confidence',
    value: { kind: 'elo', value: 1600 },
  },
  {
    id: 'elo-2000',
    label: '≈2000 Elo',
    detail: 'A stronger opponent',
    value: { kind: 'elo', value: 2000 },
  },
  {
    id: 'elo-2400',
    label: '≈2400 Elo',
    detail: 'A serious challenge',
    value: { kind: 'elo', value: 2400 },
  },
  { id: 'full', label: 'Full strength', detail: 'No strength limit', value: { kind: 'full' } },
];
export interface PlaySettings {
  side: Color | 'random';
  strengthId: string;
}
export interface PlayGame {
  study: Study;
  humanColor: Color;
  strengthId: string;
  startedAt: number;
}
export interface PlaySession {
  game: PlayGame | null;
  settings: PlaySettings;
  orientation: Color;
  /** Null follows the live game; a ply number pins an already played position. */
  viewPly?: number | null;
}
export const defaultSettings: PlaySettings = { side: 'w', strengthId: 'skill-0' };
export const strengthFor = (id: string) => strengths.find((s) => s.id === id) || strengths[0];

export function createGame(settings: PlaySettings): PlayGame {
  const humanColor = settings.side === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : settings.side;
  const strength = strengthFor(settings.strengthId);
  const study = createStudy();
  const startedAt = Date.now();
  study.headers = {
    Event: 'Casual game vs Stockfish',
    Site: 'Chess Room',
    Date: new Date(startedAt).toISOString().slice(0, 10).replaceAll('-', '.'),
    White: humanColor === 'w' ? 'You' : `Stockfish 19 · ${strength.label}`,
    Black: humanColor === 'b' ? 'You' : `Stockfish 19 · ${strength.label}`,
    Result: '*',
  };
  return { study, humanColor, strengthId: strength.id, startedAt };
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
    version: 1,
    settings: session.settings,
    orientation: session.orientation,
    viewPly: session.viewPly ?? null,
    game: game
      ? {
          id: game.study.id,
          revision: game.study.revision,
          humanColor: game.humanColor,
          strengthId: game.strengthId,
          startedAt: game.startedAt,
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
      saved.version !== 1 ||
      !['w', 'b'].includes(saved.orientation) ||
      !['w', 'b', 'random'].includes(saved.settings?.side) ||
      !strengths.some((s) => s.id === saved.settings?.strengthId)
    )
      return null;
    let game: PlayGame | null = null;
    if (saved.game) {
      const g = saved.game;
      if (
        typeof g.id !== 'string' ||
        !g.id ||
        (g.revision !== undefined && (!Number.isSafeInteger(g.revision) || g.revision < 0)) ||
        !['w', 'b'].includes(g.humanColor) ||
        !strengths.some((s) => s.id === g.strengthId) ||
        !Number.isFinite(g.startedAt) ||
        !Array.isArray(g.moves) ||
        g.moves.length > 2000 ||
        typeof g.resigned !== 'boolean'
      )
        return null;
      game = createGame({ side: g.humanColor, strengthId: g.strengthId });
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
      settings: { side: saved.settings.side, strengthId: saved.settings.strengthId },
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
