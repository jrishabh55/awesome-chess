import { Chess } from 'chess.js';
import type { Study } from '../chess/types';
import { pathTo } from '../chess/tree';
interface OpeningData {
  revision: string;
  names: Record<string, { eco: string; name: string }>;
  book: string[];
}
let data: OpeningData = { revision: '', names: {}, book: [] };
let book = new Set<string>();
let pending: Promise<void> | null = null;
export function setOpeningData(value: OpeningData) {
  data = value;
  book = new Set(value.book);
}
export function loadOpenings(): Promise<void> {
  if (!pending)
    pending = fetch('/data/openings.json')
      .then((r) => {
        if (!r.ok) throw Error('Opening database unavailable');
        return r.json();
      })
      .then(setOpeningData)
      .catch((e) => {
        pending = null;
        throw e;
      });
  return pending;
}
export function openingKey(fen: string): string {
  return new Chess(fen).fen().split(' ').slice(0, 4).join(' ');
}
export function isBook(fen: string): boolean {
  return book.has(openingKey(fen));
}
export function identifyOpening(
  s: Study,
  id: string,
): { eco: string; name: string; nodeId: string; exact: boolean } | null {
  for (const nodeId of [s.rootId, ...pathTo(s, id)].reverse()) {
    const match = data.names[openingKey(s.nodes[nodeId].fen)];
    if (match) return { ...match, nodeId, exact: nodeId === id };
  }
  return null;
}
