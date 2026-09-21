import {describe,it,expect} from 'vitest';
import {parsePgn,exportPgn,createStudy,playMove,positionAt,chessAt} from './tree';
describe('studies',()=>{
 it('preserves recursive variations and comments through PGN',()=>{const [s]=parsePgn('[White "Rishabh"]\n\n1. e4 {hello ♞} (1. d4 d5 (1... Nf6)) e5 *');expect(s.nodes[s.rootId].children).toHaveLength(2);expect(exportPgn(parsePgn(exportPgn(s))[0])).toBe(exportPgn(s));});
 it('deduplicates branches and preserves mainline',()=>{const [s]=parsePgn('1. e4 e5 *');const a=playMove(s,s.rootId,'d2d4');const b=playMove(a,a.rootId,'d2d4');expect(Object.keys(b.nodes)).toHaveLength(Object.keys(a.nodes).length);expect(b.mainline).toEqual(s.mainline);expect(positionAt(b,b.selectedId).moves).toEqual(['d2d4']);});
 it('rejects invalid input without a partial game',()=>{expect(()=>parsePgn('1. e4 e5 2. Ke7 *')).toThrow();expect(()=>parsePgn('[Variant "Atomic"]\n1. e4 *')).toThrow(/variant/i);expect(()=>parsePgn('garbage')).toThrow();});
 it('loads multiple games',()=>expect(parsePgn('[White "A"]\n1. e4 *\n\n[White "B"]\n1. d4 *')).toHaveLength(2));
 it('retains repetition history',()=>{const [s]=parsePgn('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 *');expect(chessAt(s,s.mainline.at(-1)!).isThreefoldRepetition()).toBe(true);});
 it('supports underpromotion and rejects illegal moves',()=>{const s=createStudy('7k/P7/8/8/8/8/8/7K w - - 0 1');const a=playMove(s,s.rootId,'a7a8n');expect(chessAt(a,a.selectedId).get('a8')?.type).toBe('n');expect(()=>playMove(s,s.rootId,'a7b8q')).toThrow();});
 it('recognizes checkmate in legal history',()=>{const [s]=parsePgn('1. f3 e5 2. g4 Qh4# 0-1');expect(chessAt(s,s.mainline.at(-1)!).isCheckmate()).toBe(true);});
});
