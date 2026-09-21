import {it,expect} from 'vitest';
import {explainMove} from './explain';
import {classify} from '../review/classify';
it('never fabricates a tactic without evidence',()=>{const l={rank:1,depth:12,score:{kind:'cp' as const,value:20},pv:['e2e4'],bound:'exact' as const};const a=classify({nodeId:'a',mover:'w',playedUci:'e2e4',legalCount:20,book:false,best:l,played:l,evidence:[]});const result=explainMove(a);expect(result.actions).toHaveLength(0);expect(result.text).not.toMatch(/fork|pin|sacrific/i);});
