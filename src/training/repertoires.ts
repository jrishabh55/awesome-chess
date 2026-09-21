import type { Color } from '../chess/types';
import type { CatalogOpening } from '../openings/catalog';
import { databasePack } from './database';
import { MAX_PROGRESS_CHARS, OVERSIZED_COURSE_MESSAGE, SESSION_RESERVE_CHARS } from './limits';
import type { OpeningPack, TeachingLine } from './packs';

export interface Repertoire {
  id: string;
  name: string;
  readonly side: Color;
  openings: CatalogOpening[];
  createdAt: number;
  updatedAt: number;
}
export const REPERTOIRES_KEY = 'chess-room.opening-repertoires.v1';
export class RepertoireConflictError extends Error {
  constructor() {
    super(
      'The saved repertoires changed in another tab. Reload saved repertoires before saving again. Your changes have not overwritten the newer library.',
    );
    this.name = 'RepertoireConflictError';
  }
}
const MAX_REPERTOIRES = 100;
const MAX_OPENINGS = 40;
const corrupted = () =>
  Error(
    'The saved repertoire library is damaged or unsupported. It has not been overwritten. Recover or explicitly clear that library before saving new repertoires.',
  );
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
function validName(name: string): string {
  if (typeof name !== 'string' || !name.trim()) throw Error('Give this repertoire a name.');
  if (name.trim().length > 80) throw Error('Keep repertoire names within 80 characters.');
  return name.trim();
}
function assertMetadata(rep: Repertoire) {
  if (
    !record(rep) ||
    typeof rep.id !== 'string' ||
    !rep.id ||
    rep.id.length > 200 ||
    !['w', 'b'].includes(rep.side)
  )
    throw Error('Invalid repertoire identity or training side.');
  validName(rep.name);
  if (
    !Number.isSafeInteger(rep.createdAt) ||
    !Number.isSafeInteger(rep.updatedAt) ||
    rep.createdAt < 0 ||
    rep.updatedAt < rep.createdAt
  )
    throw Error('Invalid repertoire dates.');
  if (!Array.isArray(rep.openings) || rep.openings.length > MAX_OPENINGS)
    throw Error('Keep each repertoire within 40 opening variations.');
}
function entryLine(entry: CatalogOpening, side: Color): TeachingLine {
  if (
    !record(entry) ||
    typeof entry.id !== 'string' ||
    !entry.id ||
    entry.id.length > 4000 ||
    typeof entry.name !== 'string' ||
    !entry.name.trim() ||
    entry.name.length > 512 ||
    typeof entry.eco !== 'string' ||
    !/^[A-E]\d{2}$/.test(entry.eco) ||
    typeof entry.pgn !== 'string' ||
    !entry.pgn.trim()
  )
    throw Error('Invalid opening name, ECO code, or move line.');
  const pack = databasePack(entry, side);
  if (pack.lines.length !== 1)
    throw Error('Each database opening must contain one named move line.');
  return pack.lines[0];
}
const lineKey = (line: TeachingLine) =>
  `${line.rootFen}|${line.moves.map((move) => move.uci).join(' ')}`;
const touched = (rep: Repertoire) => Math.max(Date.now(), rep.updatedAt + 1);

function validatedLines(rep: Repertoire): TeachingLine[] {
  assertMetadata(rep);
  const ids = new Set<string>();
  const moves = new Set<string>();
  const lines = rep.openings.map((entry) => {
    const line = entryLine(entry, rep.side);
    const key = lineKey(line);
    if (ids.has(entry.id) || moves.has(key))
      throw Error('Duplicate opening variation in repertoire.');
    ids.add(entry.id);
    moves.add(key);
    return line;
  });
  if (lines.length) assertCourseSize(packFrom(rep, lines));
  return lines;
}
function packFrom(rep: Repertoire, lines: TeachingLine[]): OpeningPack {
  return {
    id: `repertoire:${rep.id}`,
    name: rep.name.trim(),
    side: rep.side,
    description:
      'Your saved opening variations. Learn each line, practice earlier lines, then finish with a shuffled drill of the whole repertoire.',
    lines,
  };
}
function assertCourseSize(pack: OpeningPack) {
  if (JSON.stringify(pack).length > MAX_PROGRESS_CHARS - SESSION_RESERVE_CHARS)
    throw Error(OVERSIZED_COURSE_MESSAGE);
}
export function createRepertoire(name: string, side: Color): Repertoire {
  const normalized = validName(name);
  if (side !== 'w' && side !== 'b') throw Error('Choose White or Black for this repertoire.');
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: normalized,
    side,
    openings: [],
    createdAt: now,
    updatedAt: now,
  };
}
export function addRepertoireOpening(rep: Repertoire, entry: CatalogOpening): Repertoire {
  const existingLines = validatedLines(rep);
  const line = entryLine(entry, rep.side);
  if (
    rep.openings.some((opening) => opening.id === entry.id) ||
    existingLines.some((existing) => lineKey(existing) === lineKey(line))
  )
    return rep;
  if (rep.openings.length >= MAX_OPENINGS)
    throw Error('Keep each repertoire within 40 opening variations.');
  const next = { ...rep, openings: [...rep.openings, { ...entry }], updatedAt: touched(rep) };
  assertCourseSize(packFrom(next, [...existingLines, line]));
  return next;
}
export function removeRepertoireOpening(rep: Repertoire, openingId: string): Repertoire {
  validatedLines(rep);
  if (!rep.openings.some((opening) => opening.id === openingId)) return rep;
  return {
    ...rep,
    openings: rep.openings.filter((opening) => opening.id !== openingId),
    updatedAt: touched(rep),
  };
}
export function renameRepertoire(rep: Repertoire, name: string): Repertoire {
  const lines = validatedLines(rep);
  const normalized = validName(name);
  if (rep.name === normalized) return rep;
  const next = { ...rep, name: normalized, updatedAt: touched(rep) };
  if (lines.length) assertCourseSize(packFrom(next, lines));
  return next;
}
export function repertoirePack(rep: Repertoire): OpeningPack {
  const lines = validatedLines(rep);
  if (!lines.length)
    throw Error('Add at least one opening variation before starting this repertoire.');
  return packFrom(rep, lines);
}
function validateLibrary(repertoires: Repertoire[]): Repertoire[] {
  if (!Array.isArray(repertoires) || repertoires.length > MAX_REPERTOIRES)
    throw Error('Keep the library within 100 repertoires.');
  const ids = new Set<string>();
  return repertoires.map((rep) => {
    validatedLines(rep);
    if (ids.has(rep.id)) throw Error('Duplicate repertoire identity in library.');
    ids.add(rep.id);
    return {
      id: rep.id,
      name: validName(rep.name),
      side: rep.side,
      createdAt: rep.createdAt,
      updatedAt: rep.updatedAt,
      openings: rep.openings.map(({ id, eco, name, pgn }) => ({ id, eco, name, pgn })),
    };
  });
}
function parseLibrary(raw: string | null): Repertoire[] {
  if (raw === null) return [];
  try {
    if (raw.length > MAX_PROGRESS_CHARS) throw corrupted();
    const data = JSON.parse(raw);
    if (!record(data) || data.version !== 1 || !Array.isArray(data.repertoires)) throw corrupted();
    return validateLibrary(data.repertoires);
  } catch {
    throw corrupted();
  }
}
function readStored(): string | null {
  try {
    return localStorage.getItem(REPERTOIRES_KEY);
  } catch {
    throw Error('Browser storage is unavailable. The repertoire library could not be loaded.');
  }
}
export function loadRepertoires(): Repertoire[] {
  return parseLibrary(readStored());
}
export function saveRepertoires(repertoires: Repertoire[], expectedPrevious?: Repertoire[]): void {
  // Validate the old value before replacement: a failed read is never an empty library.
  const previous = parseLibrary(readStored());
  if (
    expectedPrevious !== undefined &&
    JSON.stringify(previous) !== JSON.stringify(validateLibrary(expectedPrevious))
  ) {
    throw new RepertoireConflictError();
  }
  const validated = validateLibrary(repertoires);
  const previousById = new Map(previous.map((rep) => [rep.id, rep]));
  for (const rep of validated) {
    if (previousById.get(rep.id)?.side && previousById.get(rep.id)!.side !== rep.side)
      throw Error(
        'A repertoire’s training side cannot be changed. Create a new repertoire for the other side.',
      );
  }
  const raw = JSON.stringify({ version: 1, repertoires: validated });
  if (raw.length > MAX_PROGRESS_CHARS)
    throw Error(
      'This repertoire library is too large to save. Remove some variations or shorten long comments.',
    );
  try {
    localStorage.setItem(REPERTOIRES_KEY, raw);
  } catch {
    throw Error(
      'The repertoire library could not be saved. Free browser storage or save fewer variations. Your previous library is unchanged.',
    );
  }
}
