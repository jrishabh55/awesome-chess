import { Chess, DEFAULT_POSITION } from 'chess.js';
import { parseGames } from '@mliebelt/pgn-parser';
import type { Study, GameNode, PositionInput, Mark, DrawingColor, Square } from './types';
export function createStudy(fen = DEFAULT_POSITION): Study {
  const c = new Chess(fen);
  const root: GameNode = {
    id: 'root',
    parentId: null,
    children: [],
    san: null,
    uci: null,
    fen: c.fen(),
    comments: [],
    marks: [],
    nags: [],
  };
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    revision: 0,
    headers: { Result: '*' },
    rootId: 'root',
    rootFen: c.fen(),
    nodes: { root },
    mainline: [],
    selectedId: 'root',
    selectedChildren: {},
    explorationOrigin: null,
    updatedAt: Date.now(),
  };
}
export function pathTo(s: Study, id: string): string[] {
  const path: string[] = [];
  const seen = new Set<string>();
  while (id !== s.rootId) {
    if (seen.has(id) || !s.nodes[id]) throw Error('Invalid study path');
    seen.add(id);
    path.unshift(id);
    id = s.nodes[id].parentId!;
  }
  return path;
}
export function positionAt(s: Study, id: string): PositionInput {
  return { rootFen: s.rootFen, moves: pathTo(s, id).map((n) => s.nodes[n].uci!) };
}
export function chessAt(s: Study, id: string): Chess {
  const p = positionAt(s, id);
  const c = new Chess(p.rootFen);
  p.moves.forEach((m) => c.move(m));
  return c;
}
function append(s: Study, parentId: string, move: string): string {
  const p = s.nodes[parentId];
  if (!p) throw Error('Position no longer exists');
  const c = chessAt(s, parentId);
  const m = c.move(move);
  const uci = m.from + m.to + (m.promotion || '');
  const existing = p.children.find((id) => s.nodes[id].uci === uci);
  if (existing) return existing;
  const id = crypto.randomUUID();
  s.nodes[id] = {
    id,
    parentId,
    children: [],
    san: m.san,
    uci,
    fen: c.fen(),
    comments: [],
    marks: [],
    nags: [],
  };
  p.children.push(id);
  return id;
}
export function playMove(study: Study, parentId: string, move: string): Study {
  const s = structuredClone(study);
  const id = append(s, parentId, move);
  s.selectedChildren[parentId] = id;
  s.selectedId = id;
  if (!s.mainline.includes(id) && s.explorationOrigin === null) s.explorationOrigin = parentId;
  s.revision++;
  s.updatedAt = Date.now();
  return s;
}
export function selectNode(study: Study, id: string): Study {
  if (!study.nodes[id]) return study;
  const s = {
    ...study,
    selectedId: id,
    selectedChildren: { ...study.selectedChildren },
    revision: study.revision + 1,
    updatedAt: Date.now(),
  };
  for (const n of pathTo(s, id)) s.selectedChildren[s.nodes[n].parentId!] = n;
  return s;
}
export function toggleMark(study: Study, id: string, mark: Mark): Study {
  const s = structuredClone(study);
  const node = s.nodes[id];
  const keyOf = (m: Mark) =>
    m.kind === 'arrow'
      ? `${m.kind}:${m.color}:${m.from}:${m.to}`
      : `${m.kind}:${m.color}:${m.square}`;
  const key = keyOf(mark);
  node.marks = node.marks.some((m) => keyOf(m) === key)
    ? node.marks.filter((m) => keyOf(m) !== key)
    : [...node.marks, mark];
  s.revision++;
  s.updatedAt = Date.now();
  return s;
}
const colors: Record<string, DrawingColor> = { G: 'green', R: 'red', B: 'blue', Y: 'yellow' };
function marksFrom(text: string): Mark[] {
  const out: Mark[] = [];
  for (const match of text.matchAll(/\[%c(al|sl)\s+([^\]]+)\]/g)) {
    for (const v of match[2].split(',')) {
      const code = v.trim();
      if (!colors[code[0]]) continue;
      if (match[1] === 'al' && /^[GRBY][a-h][1-8][a-h][1-8]$/.test(code))
        out.push({
          kind: 'arrow',
          color: colors[code[0]],
          from: code.slice(1, 3) as Square,
          to: code.slice(3, 5) as Square,
        });
      if (match[1] === 'sl' && /^[GRBY][a-h][1-8]$/.test(code))
        out.push({ kind: 'square', color: colors[code[0]], square: code.slice(1) as Square });
    }
  }
  return out;
}
export function parsePgn(text: string): Study[] {
  if (!text.trim()) throw Error('Paste a PGN game or FEN position first.');
  if (/^[prnbqkPRNBQK1-8/]+\s+[wb]\s/.test(text.trim())) return [createStudy(text.trim())];
  const games = parseGames(text);
  if (!games.length) throw Error('No games found.');
  return games.map((game) => {
    const tags = game.tags as Record<string, unknown> | undefined;
    if (tags?.Variant && !['Standard', 'Chess'].includes(String(tags.Variant)))
      throw Error(`Unsupported variant: ${tags.Variant}`);
    const s = createStudy(typeof tags?.FEN === 'string' ? tags.FEN : undefined);
    const rootComment = game.gameComment as
      { comment?: string; colorArrows?: string[]; colorFields?: string[] } | undefined;
    if (rootComment?.comment) s.nodes[s.rootId].comments = [rootComment.comment];
    if (rootComment?.colorArrows)
      s.nodes[s.rootId].marks.push(...marksFrom(`[%cal ${rootComment.colorArrows.join(',')}]`));
    if (rootComment?.colorFields)
      s.nodes[s.rootId].marks.push(...marksFrom(`[%csl ${rootComment.colorFields.join(',')}]`));
    for (const [k, v] of Object.entries(tags || {})) if (typeof v === 'string') s.headers[k] = v;
    const walk = (moves: typeof game.moves, parent: string, main: boolean) => {
      let current = parent;
      for (const m of moves) {
        const before = current;
        try {
          current = append(s, before, m.notation.notation);
        } catch {
          throw Error(
            `Illegal move ${m.moveNumber || ''}${m.turn === 'b' ? '...' : '.'} ${m.notation.notation}`,
          );
        }
        const n = s.nodes[current];
        const raw = [m.commentAfter].filter(Boolean).join(' ');
        n.comments = [...new Set([...n.comments, ...(raw ? [raw] : [])])];
        n.nags = [...new Set([...n.nags, ...(m.nag || []).map(String)])];
        n.marks = [...n.marks, ...marksFrom(raw)];
        const diag = m.commentDiag as unknown as {
          colorArrows?: string[];
          colorFields?: string[];
        } | null;
        if (diag?.colorArrows) n.marks.push(...marksFrom(`[%cal ${diag.colorArrows.join(',')}]`));
        if (diag?.colorFields) n.marks.push(...marksFrom(`[%csl ${diag.colorFields.join(',')}]`));
        if (main) s.mainline.push(current);
        for (const variation of m.variations || []) walk(variation, before, false);
      }
    };
    walk(game.moves, s.rootId, true);
    for (const id of s.mainline) {
      const parent = s.nodes[s.nodes[id].parentId!];
      parent.children = [id, ...parent.children.filter((child) => child !== id)];
    }
    if (!game.moves.length && !tags?.FEN) throw Error('This PGN contains no moves.');
    s.selectedId = s.rootId;
    return s;
  });
}
export function exportPgn(s: Study): string {
  const headers = { ...s.headers };
  if (s.rootFen !== DEFAULT_POSITION) {
    headers.SetUp = '1';
    headers.FEN = s.rootFen;
  }
  headers.Result = headers.Result || '*';
  const escape = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const tags = Object.entries(headers)
    .map(([k, v]) => `[${k} "${escape(v)}"]`)
    .join('\n');
  const colorCode: Record<DrawingColor, string> = { green: 'G', red: 'R', blue: 'B', yellow: 'Y' };
  const annotations = (n: GameNode) => {
    const comments = n.comments
      .map((c) =>
        c
          .replace(/[{}]/g, '')
          .replace(/\[%c(?:al|sl)[^\]]*\]/g, '')
          .trim(),
      )
      .filter(Boolean);
    const arrows = n.marks
      .filter((m) => m.kind === 'arrow')
      .map((m) => (m.kind === 'arrow' ? colorCode[m.color] + m.from + m.to : ''));
    const squares = n.marks
      .filter((m) => m.kind === 'square')
      .map((m) => (m.kind === 'square' ? colorCode[m.color] + m.square : ''));
    if (arrows.length) comments.push(`[%cal ${arrows.join(',')}]`);
    if (squares.length) comments.push(`[%csl ${squares.join(',')}]`);
    return comments.length ? `{${comments.join(' ')}}` : '';
  };
  const token = (id: string) => {
    const n = s.nodes[id],
      p = s.nodes[n.parentId!];
    const f = p.fen.split(' ');
    let t = `${f[5]}${f[1] === 'w' ? '.' : '...'} ${n.san}`;
    if (n.nags.length) t += ' ' + n.nags.map((x) => (x.startsWith('$') ? x : '$' + x)).join(' ');
    const comment = annotations(n);
    return t + (comment ? ' ' + comment : '');
  };
  const line = (first: string): string => {
    let id: string | undefined = first;
    const out: string[] = [];
    while (id) {
      out.push(token(id));
      const n: GameNode = s.nodes[id];
      const parent = s.nodes[n.parentId!];
      if (parent.children[0] === id)
        for (const alt of parent.children.slice(1)) out.push(`(${line(alt)})`);
      id = n.children[0];
    }
    return out.join(' ');
  };
  return (
    tags +
    '\n\n' +
    (annotations(s.nodes[s.rootId]) ? annotations(s.nodes[s.rootId]) + ' ' : '') +
    (s.nodes[s.rootId].children[0] ? line(s.nodes[s.rootId].children[0]) + ' ' : '') +
    headers.Result
  );
}
