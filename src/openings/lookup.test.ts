import {it,expect} from 'vitest';
import {openingKey,identifyOpening,setOpeningData} from './lookup';
import {parsePgn} from '../chess/tree';
it('ignores move counters but preserves side and rights',()=>expect(openingKey('8/8/8/8/8/4k3/8/4K3 w - - 0 1')).toBe(openingKey('8/8/8/8/8/4k3/8/4K3 w - - 8 20')));
it('retains a known name without claiming the next move is book',()=>{const [s]=parsePgn('1. e4 e5 2. Ke2 *');const key=openingKey(s.nodes[s.mainline[1]].fen);setOpeningData({revision:'test',names:{[key]:{eco:'C20',name:'Open Game'}},book:[key]});expect(identifyOpening(s,s.mainline[2])).toMatchObject({name:'Open Game',exact:false});});
