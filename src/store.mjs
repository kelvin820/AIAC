import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import {defaultConnections} from './providers.mjs';
import {initialState} from './initial-state.mjs';
import {defaultAthlete} from './training-load.mjs';
export {initialState,localDate} from './initial-state.mjs';
export async function openStore(dir='data') {
 await mkdir(dir,{recursive:true}); const file=join(dir,'state.json'); let state;
 try {state=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state=initialState();}
 state.activities??=[];state.athlete??=defaultAthlete();state.goals??=[];state.trainingPlans??=[];state.wellness??=[];state.intervalsFitness??={};state.connections??=defaultConnections();
 return {get:()=>structuredClone(state),async save(next){const tmp=file+'.tmp';await writeFile(tmp,JSON.stringify(next,null,2));await rename(tmp,file);state=structuredClone(next);return this.get();}};
}
