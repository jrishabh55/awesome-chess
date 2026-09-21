import {openDB} from 'idb';
import type {Study,Mark} from '../chess/types';
import {chessAt} from '../chess/tree';
const database=()=>openDB('chess-room',1,{upgrade(db){db.createObjectStore('studies',{keyPath:'id'});db.createObjectStore('preferences');db.createObjectStore('analysis');}});
export async function saveStudy(study:Study){const db=await database();const tx=db.transaction('studies','readwrite');const old=await tx.store.get(study.id) as Study|undefined;if(!old||old.revision<=study.revision)await tx.store.put(structuredClone(study));await tx.done;}
export async function loadStudy(id:string):Promise<Study|undefined>{return (await database()).get('studies',id);}
export async function listStudies():Promise<Study[]>{return ((await database()).getAll('studies')).then(items=>items.sort((a,b)=>b.updatedAt-a.updatedAt));}
export async function setPreference(key:string,value:unknown){await (await database()).put('preferences',value,key);}
export async function getPreference<T>(key:string):Promise<T|undefined>{return (await database()).get('preferences',key);}
export async function saveAnalysis(id:string,value:unknown){await (await database()).put('analysis',value,id);}
export async function loadAnalysis<T>(id:string):Promise<T|undefined>{return (await database()).get('analysis',id);}
export function exportBackup(studies:Study[]){return JSON.stringify({version:1,studies},null,2);}
const square=(s:unknown)=>typeof s==='string'&&/^[a-h][1-8]$/.test(s);
function validMark(m:Mark){return ['green','red','blue','yellow'].includes(m.color)&&(m.kind==='square'?square(m.square):m.kind==='arrow'&&square(m.from)&&square(m.to));}
export function parseBackup(text:string):Study[]{const data=JSON.parse(text);if(data.version!==1||!Array.isArray(data.studies))throw Error('Unsupported backup format');for(const s of data.studies as Study[]){if(s.schemaVersion!==1||!s.nodes?.[s.rootId]||!s.nodes[s.selectedId]||!Array.isArray(s.mainline)||!s.id||!Number.isFinite(s.revision))throw Error('Invalid study');for(const [id,node] of Object.entries(s.nodes)){if(node.id!==id||!Array.isArray(node.children)||!Array.isArray(node.marks)||node.marks.some(m=>!validMark(m)))throw Error('Invalid node or annotation');if(node.parentId!==null&&!s.nodes[node.parentId]?.children.includes(id))throw Error('Broken parent link');for(const child of node.children)if(s.nodes[child]?.parentId!==id)throw Error('Broken child link');if(chessAt(s,id).fen()!==node.fen)throw Error('Illegal or inconsistent game path');}let parent=s.rootId;for(const id of s.mainline){if(s.nodes[id]?.parentId!==parent)throw Error('Invalid mainline');parent=id;}}return data.studies;}
