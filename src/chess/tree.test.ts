import { describe, it, expect } from 'vitest';
import { parsePgn, exportPgn, createStudy, playMove, positionAt, chessAt } from './tree';
describe('studies', () => {
  it('preserves recursive variations and comments through PGN', () => {
    const [s] = parsePgn('[White "Rishabh"]\n\n1. e4 {hello ♞} (1. d4 d5 (1... Nf6)) e5 *');
    expect(s.nodes[s.rootId].children).toHaveLength(2);
    expect(exportPgn(parsePgn(exportPgn(s))[0])).toBe(exportPgn(s));
  });
  it('deduplicates branches and preserves mainline', () => {
    const [s] = parsePgn('1. e4 e5 *');
    const a = playMove(s, s.rootId, 'd2d4');
    const b = playMove(a, a.rootId, 'd2d4');
    expect(Object.keys(b.nodes)).toHaveLength(Object.keys(a.nodes).length);
    expect(b.mainline).toEqual(s.mainline);
    expect(positionAt(b, b.selectedId).moves).toEqual(['d2d4']);
  });
  it('rejects invalid input without a partial game', () => {
    expect(() => parsePgn('1. e4 e5 2. Ke7 *')).toThrow();
    expect(() => parsePgn('[Variant "Atomic"]\n1. e4 *')).toThrow(/variant/i);
    expect(() => parsePgn('garbage')).toThrow();
  });
  it('loads multiple games', () =>
    expect(parsePgn('[White "A"]\n1. e4 *\n\n[White "B"]\n1. d4 *')).toHaveLength(2));
  it('retains repetition history', () => {
    const [s] = parsePgn('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 *');
    expect(chessAt(s, s.mainline.at(-1)!).isThreefoldRepetition()).toBe(true);
  });
  it('supports underpromotion and rejects illegal moves', () => {
    const s = createStudy('7k/P7/8/8/8/8/8/7K w - - 0 1');
    const a = playMove(s, s.rootId, 'a7a8n');
    expect(chessAt(a, a.selectedId).get('a8')?.type).toBe('n');
    expect(() => playMove(s, s.rootId, 'a7b8q')).toThrow();
  });
  it('recognizes checkmate in legal history', () => {
    const [s] = parsePgn('1. f3 e5 2. g4 Qh4# 0-1');
    expect(chessAt(s, s.mainline.at(-1)!).isCheckmate()).toBe(true);
  });
});
it('preserves the mainline when a variation repeats its first move', () => {
  const [s] = parsePgn('1. e4 {first} (1. e4 {second} e5) c5 *');
  const [again] = parsePgn(exportPgn(s));
  expect(again.mainline.map((id) => again.nodes[id].san)).toEqual(['e4', 'c5']);
  expect(exportPgn(s)).toContain('first');
  expect(exportPgn(s)).toContain('second');
});
it('toggles imported arrows regardless of object field order', async () => {
  const { toggleMark } = await import('./tree');
  const [s] = parsePgn('1. e4 {[%cal Ge2e4]} *');
  const id = s.mainline[0];
  expect(s.nodes[id].marks).toHaveLength(1);
  expect(
    toggleMark(s, id, { kind: 'arrow', from: 'e2', to: 'e4', color: 'green' }).nodes[id].marks,
  ).toHaveLength(0);
});
it('exports drawings and comments from the starting position', async () => {
  const { toggleMark } = await import('./tree');
  const [s] = parsePgn('{Opening ideas} 1. e4 *');
  const a = toggleMark(s, s.rootId, { kind: 'arrow', from: 'g1', to: 'f3', color: 'blue' });
  const [again] = parsePgn(exportPgn(a));
  expect(again.nodes.root.comments.join(' ')).toContain('Opening ideas');
  expect(again.nodes.root.marks).toContainEqual({
    kind: 'arrow',
    from: 'g1',
    to: 'f3',
    color: 'blue',
  });
});

it('round-trips orange with every existing color in root and move annotations', () => {
  const [study] = parsePgn(
    '{[%csl Oa3,Ya4,Ba5,Ra6,Ga7]} 1. e4 {[%cal Ob1c3,Yg1f3,Ba1a3,Ra2a4,Ga7a5]} *',
  );
  const squares = [
    { kind: 'square', square: 'a3', color: 'orange' },
    { kind: 'square', square: 'a4', color: 'yellow' },
    { kind: 'square', square: 'a5', color: 'blue' },
    { kind: 'square', square: 'a6', color: 'red' },
    { kind: 'square', square: 'a7', color: 'green' },
  ];
  const arrows = [
    { kind: 'arrow', from: 'b1', to: 'c3', color: 'orange' },
    { kind: 'arrow', from: 'g1', to: 'f3', color: 'yellow' },
    { kind: 'arrow', from: 'a1', to: 'a3', color: 'blue' },
    { kind: 'arrow', from: 'a2', to: 'a4', color: 'red' },
    { kind: 'arrow', from: 'a7', to: 'a5', color: 'green' },
  ];
  expect(study.nodes.root.marks).toEqual(squares);
  expect(study.nodes[study.mainline[0]].marks).toEqual(arrows);
  const [restored] = parsePgn(exportPgn(study));
  expect(restored.nodes.root.marks).toEqual(squares);
  expect(restored.nodes[restored.mainline[0]].marks).toEqual(arrows);
});
