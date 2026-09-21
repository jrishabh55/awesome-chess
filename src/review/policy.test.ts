import {it,expect} from 'vitest';
import {baseLabel,expected,primaryLabel,performance} from './policy';
it.each([[.01,'Excellent'],[.03,'Good'],[.08,'Inaccuracy'],[.18,'Mistake'],[.181,'Blunder']])('classifies quality loss %s',(loss,label)=>expect(baseLabel(Number(loss),false)).toBe(label));
it('does not let book conceal an error',()=>expect(primaryLabel('Blunder',true,{brilliant:false,great:false,miss:false})).toBe('Blunder'));
it('best is distinct and extreme scores stay finite',()=>{expect(baseLabel(0,true)).toBe('Best');expect(expected(0)).toBe(.5);expect(expected(-100000)).toBeCloseTo(0,10);});
it('refuses ratings from too few decisions',()=>expect(performance([{accuracy:100,gap:.2}])).toBeNull());
