import {it,expect} from 'vitest';
import {squareToPoint} from './coordinates';
it('rotates board coordinates without changing chess squares',()=>{expect(squareToPoint('a1','w')).toEqual({x:.5,y:7.5});expect(squareToPoint('a1','b')).toEqual({x:7.5,y:.5});});
