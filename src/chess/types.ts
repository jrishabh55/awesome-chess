import type {Square} from 'chess.js';
export type {Square};
export type Color='w'|'b';
export type DrawingColor='green'|'red'|'blue'|'yellow';
export type Mark={kind:'square';square:Square;color:DrawingColor}|{kind:'arrow';from:Square;to:Square;color:DrawingColor};
export interface GameNode{id:string;parentId:string|null;children:string[];san:string|null;uci:string|null;fen:string;comments:string[];marks:Mark[];nags:string[]}
export interface Study{schemaVersion:1;id:string;revision:number;headers:Record<string,string>;rootId:string;rootFen:string;nodes:Record<string,GameNode>;mainline:string[];selectedId:string;selectedChildren:Record<string,string>;explorationOrigin:string|null;updatedAt:number}
export interface PositionInput{rootFen:string;moves:string[]}
