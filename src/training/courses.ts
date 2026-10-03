import { Chess } from 'chess.js';
import type { Color } from '../chess/types';
import type { CatalogOpening } from '../openings/catalog';
import { familyName } from '../openings/families';
import { longestLines } from './unique-lines';

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
  structure?: 'responses-v1';
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
export function courseLineKey(entry: CatalogOpening): string {
  const line = lineOf(entry);
  return `${line.root}|${line.moves.join(' ')}`;
}
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
// Walk one complete path before taking a sibling response. Long continuations
// lead each subtree; a named position that prefixes a full line is never a lesson.
interface MoveTree {
  children: Map<string, MoveTree>;
  line?: Line;
  depth: number;
}
function fullLineOrder(lines: Line[]): Line[] {
  const root: MoveTree = { children: new Map(), depth: 0 };
  for (const line of lines) {
    let node = root;
    for (const move of [line.root, ...line.moves]) {
      let child = node.children.get(move);
      if (!child) {
        child = { children: new Map(), depth: 0 };
        node.children.set(move, child);
      }
      child.depth = Math.max(child.depth, line.moves.length);
      node = child;
    }
    node.line = line;
  }
  const result: Line[] = [];
  function visit(node: MoveTree) {
    if (node.line) result.push(node.line);
    for (const [, child] of [...node.children].sort(
      (a, b) => b[1].depth - a[1].depth || compare(a[0], b[0]),
    ))
      visit(child);
  }
  visit(root);
  return result;
}
function responseSections(lines: Line[], name: string) {
  // A section is an opening branch, not an arbitrary depth in its move trie.
  // Teach each complete continuation before visiting the closest sibling line,
  // including alternative choices for either player.
  const groups = new Map<string, Line[]>();
  for (const line of fullLineOrder(lines)) {
    const title = line.entry.name.startsWith(`${name}:`)
      ? line.entry.name
          .slice(name.length + 1)
          .trim()
          .split(',')[0]
      : name;
    groups.set(title, [...(groups.get(title) || []), line]);
  }
  const variations: CatalogOpening[] = [];
  const sections: CourseSection[] = [];
  for (const [title, lines] of groups) {
    const ordered = fullLineOrder(lines);
    const first = ordered[0];
    let depth = first.moves.length;
    for (const line of ordered) {
      if (line.root !== first.root) {
        depth = 0;
        break;
      }
      let shared = 0;
      while (shared < depth && line.moves[shared] === first.moves[shared]) shared++;
      depth = shared;
    }
    const start = variations.length;
    variations.push(...ordered.map((line) => line.entry));
    sections.push({
      id: `responses:${title}`,
      name: title,
      commonPgn: pgnOf(first.sans.slice(0, depth)),
      variationIndices: ordered.map((_, index) => start + index),
    });
  }
  return { variations, sections };
}

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
      const unique = longestLines(rows.map(lineOf).sort(lineOrder));
      const side = sideFor(name);
      const { variations, sections } = responseSections(unique, name);
      return {
        id: `course:${name}`,
        name,
        side,
        structure: 'responses-v1' as const,
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
