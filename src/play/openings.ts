import { Chess } from 'chess.js';
import { positionAt } from '../chess/tree';
import { longestLines } from '../training/unique-lines';
import type { PlayGame } from './game';

export interface PlayOpeningLine {
  name: string;
  eco: string;
  pgn: string;
}
export interface PlayOpening extends PlayOpeningLine {
  continuations?: PlayOpeningLine[];
}
const movesByPgn = new Map<string, string[]>();
export function openingMoves(opening: PlayOpeningLine): string[] {
  const cached = movesByPgn.get(opening.pgn);
  if (cached) return cached;
  const chess = new Chess();
  chess.loadPgn(opening.pgn);
  if (chess.getHeaders().FEN || !chess.history().length || chess.history().length > 200)
    throw Error('Opening must begin at the standard starting position.');
  const moves = chess
    .history({ verbose: true })
    .map((move) => move.from + move.to + (move.promotion || ''));
  if (movesByPgn.size >= 10000) movesByPgn.clear();
  movesByPgn.set(opening.pgn, moves);
  return moves;
}
function readLine(value: unknown): PlayOpeningLine | undefined {
  if (!value || typeof value !== 'object') return;
  const entry = value as PlayOpeningLine;
  if (
    typeof entry.name !== 'string' ||
    !entry.name.trim() ||
    entry.name.length > 300 ||
    !/^[A-E]\d{2}$/.test(entry.eco) ||
    typeof entry.pgn !== 'string' ||
    entry.pgn.length > 8000
  )
    return;
  try {
    openingMoves(entry);
    return { name: entry.name, eco: entry.eco, pgn: entry.pgn };
  } catch {
    return;
  }
}
const prefixMatches = (prefix: readonly string[], line: readonly string[]) =>
  prefix.length <= line.length && prefix.every((move, ply) => move === line[ply]);

export function readOpening(value: unknown): PlayOpening | undefined {
  const base = readLine(value);
  if (!base) return;
  const continuations = (value as PlayOpening).continuations;
  if (continuations === undefined) return base;
  if (!Array.isArray(continuations) || !continuations.length || continuations.length > 4096) return;
  const prefix = openingMoves(base);
  const lines: PlayOpeningLine[] = [];
  for (const entry of continuations) {
    const line = readLine(entry);
    if (!line || !prefixMatches(prefix, openingMoves(line))) return;
    lines.push(line);
  }
  return { ...base, continuations: lines };
}

/** Keep the selected prefix and all legal catalog branches beneath it. */
export function compileOpening(
  selected: PlayOpeningLine,
  catalog: readonly PlayOpeningLine[],
): PlayOpening | undefined {
  const base = readLine(selected);
  if (!base) return;
  const prefix = openingMoves(base);
  // Catalog PGNs share canonical SAN formatting; filter cheaply before replaying
  // only this opening's candidates, then confirm their complete legal UCI prefix.
  const tokens = (pgn: string) =>
    pgn
      .replace(/\d+\.(?:\.\.)?/g, ' ')
      .trim()
      .split(/\s+/);
  const san = tokens(base.pgn);
  const entries = [base, ...catalog.filter((entry) => prefixMatches(san, tokens(entry.pgn)))];
  const unique = new Map<string, PlayOpeningLine>();
  for (const entry of entries) {
    const line = readLine(entry);
    if (line && prefixMatches(prefix, openingMoves(line)))
      unique.set(`${line.name}:${line.pgn}`, line);
  }
  return { ...base, continuations: [...unique.values()] };
}

type CompiledLine = { root: string; moves: string[]; opening: PlayOpeningLine };
const compiled = new WeakMap<PlayOpening, { all: CompiledLine[]; leaves: CompiledLine[] }>();
function linesFor(opening: PlayOpening) {
  let value = compiled.get(opening);
  if (!value) {
    const all = [opening, ...(opening.continuations || [])]
      .map((line) => ({
        root: 'standard',
        moves: openingMoves(line),
        opening: line,
      }))
      .sort(
        (a, b) =>
          b.moves.length - a.moves.length ||
          a.opening.name.localeCompare(b.opening.name) ||
          a.opening.pgn.localeCompare(b.opening.pgn),
      );
    value = { all, leaves: longestLines(all) };
    compiled.set(opening, value);
  }
  return value;
}
export type OpeningPractice =
  | { kind: 'off' }
  | { kind: 'following'; nextMove: string; name: string }
  | { kind: 'complete'; name: string }
  | { kind: 'diverged'; departurePly: number; name: string };

export function openingPractice(game: PlayGame): OpeningPractice {
  if (!game.opening) return { kind: 'off' };
  const played = positionAt(game.study, game.study.selectedId).moves;
  const available = linesFor(game.opening);
  let candidates = game.followOpeningVariations
    ? available.leaves
    : [{ root: 'standard', moves: openingMoves(game.opening), opening: game.opening }];
  const recognizedName = (moves: string[]) =>
    available.all.find((line) => prefixMatches(line.moves, moves))?.opening.name ||
    game.opening!.name;
  for (let ply = 0; ply < played.length; ply++) {
    if (candidates.every((line) => line.moves.length <= ply))
      return { kind: 'complete', name: recognizedName(played.slice(0, ply)) };
    const matching = candidates.filter((line) => line.moves[ply] === played[ply]);
    if (!matching.length)
      return {
        kind: 'diverged',
        departurePly: ply + 1,
        name: recognizedName(played.slice(0, ply)),
      };
    candidates = matching;
  }
  const next = candidates.find((line) => line.moves.length > played.length);
  const name = recognizedName(played);
  return next
    ? { kind: 'following', nextMove: next.moves[played.length], name }
    : { kind: 'complete', name };
}
