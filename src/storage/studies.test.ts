import 'fake-indexeddb/auto';
import {it,expect} from 'vitest';
import {parsePgn,playMove} from '../chess/tree';
import {saveStudy,loadStudy,exportBackup,parseBackup} from './studies';
it('restores selected variation and ignores stale saves',async()=>{const [s]=parsePgn('1. e4 e5 *');const a=playMove(s,s.rootId,'d2d4');await saveStudy(a);await saveStudy(s);expect((await loadStudy(s.id))?.selectedId).toBe(a.selectedId);});
it('backup preserves variations and rejects corrupt paths',()=>{const [s]=parsePgn('1. e4 (1. d4) *');expect(parseBackup(exportBackup([s]))[0]).toEqual(s);const bad=structuredClone(s);bad.nodes[bad.mainline[0]].uci='e2e8';expect(()=>parseBackup(JSON.stringify({version:1,studies:[bad]}))).toThrow();});
