import {createHash} from 'node:crypto';
import {decodeFitBytes} from './fit-core.mjs';
export * from './activity-core.mjs';
export function parseFit(buffer,timezone){return decodeFitBytes(buffer,timezone,createHash('sha256').update(buffer).digest('hex'));}
