import { Chess } from 'chess.js';
import type { Color } from '../chess/types';
import type { CatalogOpening } from '../openings/catalog';
import { familyName } from '../openings/families';

export interface CourseSection {
  id: string;
  name: string;
  commonPgn: string;
  variationIndices: number[];
}
export interface OpeningCourse {
  id: string;
  name: string;
  side: Color;
  variations: CatalogOpening[];
  sourceCount: number;
  sections: CourseSection[];
}
interface Line {
  entry: CatalogOpening;
  moves: string[];
  sans: string[];
  root: string;
}
// Catalog entries and entry arrays are immutable in production. Weak keys do
// not retain discarded database snapshots after a library refresh.
const parsedLines = new WeakMap<CatalogOpening, Line>();
const groupedCourses = new WeakMap<CatalogOpening[], OpeningCourse[]>();
const compare = (a: string, b: string) => a.localeCompare(b, 'en');
function lineOf(entry: CatalogOpening): Line {
  const cached = parsedLines.get(entry);
  if (cached) return cached;
  const chess = new Chess();
  chess.loadPgn(entry.pgn);
  const history = chess.history({ verbose: true });
  if (!history.length) throw Error(`Opening ${entry.name} contains no moves.`);
  const line = {
    entry,
    moves: history.map((move) => move.from + move.to + (move.promotion || '')),
    sans: history.map((move) => move.san),
    root: history[0].before,
  };
  parsedLines.set(entry, line);
  return line;
}
const pgnOf = (sans: string[]) =>
  sans
    .map((san, index) => `${index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : ''}${san}`)
    .join(' ');
const lineOrder = (a: Line, b: Line) =>
  a.moves.length - b.moves.length ||
  compare(a.entry.name, b.entry.name) ||
  compare(a.entry.eco, b.entry.eco) ||
  compare(a.entry.pgn, b.entry.pgn) ||
  compare(a.entry.id, b.entry.id);
const courseName = (entry: CatalogOpening) =>
  /\bLondon System\b/.test(entry.name) ? 'London System' : familyName(entry);
const sideFor = (name: string): Color =>
  /London System|Attack|Gambit/i.test(name) ? 'w' : /Defen[cs]e/i.test(name) ? 'b' : 'w';
const foundationRank = (line: Line, name: string) =>
  line.entry.name === name ||
  (name === 'London System' && /(?:^|: )London System$/.test(line.entry.name))
    ? 0
    : 1;

export function openingCourses(entries: CatalogOpening[]): OpeningCourse[] {
  const cached = groupedCourses.get(entries);
  if (cached) return cached;
  const groups = new Map<string, CatalogOpening[]>();
  for (const entry of entries) {
    const name = courseName(entry);
    groups.set(name, [...(groups.get(name) || []), entry]);
  }
  const courses = [...groups]
    .map(([name, rows]) => {
      const sorted = rows
        .map(lineOf)
        .sort((a, b) => foundationRank(a, name) - foundationRank(b, name) || lineOrder(a, b));
      const unique = [
        ...new Map(
          [...sorted].reverse().map((line) => [`${line.root}|${line.moves.join(' ')}`, line]),
        ).values(),
      ].sort((a, b) => foundationRank(a, name) - foundationRank(b, name) || lineOrder(a, b));
      const foundation = unique[0];
      const leaves = unique
        .filter(
          (line) =>
            line !== foundation &&
            !unique.some(
              (other) =>
                other !== line &&
                other.root === line.root &&
                other.moves.length > line.moves.length &&
                line.moves.every((move, index) => other.moves[index] === move),
            ),
        )
        .sort(lineOrder);
      const sections: CourseSection[] = [
        {
          id: 'foundation',
          name: 'Foundation',
          commonPgn: pgnOf(foundation.sans),
          variationIndices: [0],
        },
      ];
      const variations = [foundation.entry];
      const remaining = new Set(leaves);
      const shared: { lines: Line[]; depth: number; key: string }[] = [];
      for (const depth of [8, 7, 6, 5, 4, 3]) {
        const prefixes = new Map<string, Line[]>();
        for (const line of remaining) {
          if (line.moves.length < depth) continue;
          const key = `${line.root}|${line.moves.slice(0, depth).join(' ')}`;
          prefixes.set(key, [...(prefixes.get(key) || []), line]);
        }
        for (const [key, lines] of prefixes) {
          if (lines.length < 2) continue;
          lines.forEach((line) => remaining.delete(line));
          shared.push({ lines: lines.sort(lineOrder), depth, key });
        }
      }
      shared.sort((a, b) => lineOrder(a.lines[0], b.lines[0]) || compare(a.key, b.key));
      for (const group of shared) {
        const start = variations.length;
        variations.push(...group.lines.map((line) => line.entry));
        const sans = group.lines[0].sans.slice(0, group.depth);
        sections.push({
          id: `prefix:${group.key}`,
          name: `After ${Math.ceil(group.depth / 2)}${group.depth % 2 ? '.' : '…'}${sans.at(-1)}`,
          commonPgn: pgnOf(sans),
          variationIndices: group.lines.map((_, index) => start + index),
        });
      }
      if (remaining.size) {
        const others = [...remaining].sort(lineOrder);
        const start = variations.length;
        variations.push(...others.map((line) => line.entry));
        sections.push({
          id: 'other-replies',
          name: 'Other replies',
          commonPgn: '',
          variationIndices: others.map((_, index) => start + index),
        });
      }
      return {
        id: `course:${name}`,
        name,
        side: sideFor(name),
        variations,
        sourceCount: rows.length,
        sections,
      };
    })
    .sort((a, b) => compare(a.name, b.name));
  groupedCourses.set(entries, courses);
  return courses;
}
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’ʼ]/g, '')
    .toLowerCase();
export function searchCourses(
  courses: OpeningCourse[],
  query: string,
  limit = 40,
): { items: OpeningCourse[]; total: number } {
  const normalizedQuery = normalize(query).trim();
  const words = normalizedQuery.split(/\s+/).filter(Boolean);
  const matches = courses.filter((course) => {
    const text = normalize(
      `${course.name} ${course.variations.map((entry) => `${entry.eco} ${entry.name}`).join(' ')}`,
    );
    return words.every((word) => text.includes(word));
  });
  const relevance = (course: OpeningCourse) => {
    const name = normalize(course.name);
    if (name === normalizedQuery) return 0;
    if (name.startsWith(normalizedQuery)) return 1;
    if (name.includes(normalizedQuery)) return 2;
    if (words.every((word) => name.includes(word))) return 3;
    return 4;
  };
  matches.sort((a, b) => relevance(a) - relevance(b) || compare(a.name, b.name));
  return { items: matches.slice(0, Math.max(0, Math.floor(limit))), total: matches.length };
}
export function courseVariationLabel(entry: CatalogOpening, name: string): string {
  const sans = lineOf(entry).sans;
  let title = entry.name.startsWith(`${name}:`)
    ? entry.name.slice(name.length + 1).trim()
    : entry.name;
  if (name === 'London System')
    title = title.replace(/^(?:Queen's Pawn Game|Indian Defense):\s*/, '');
  const index = sans.length - 1;
  return `${title} · ${Math.floor(index / 2) + 1}${index % 2 ? '…' : '.'}${sans[index]}`;
}
