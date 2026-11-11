import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
export async function openVault(dir){
 await mkdir(dir,{recursive:true});const keyPath=join(dir,'vault.key'),file=join(dir,'vault.enc');let key;
 try{key=await readFile(keyPath);}catch(e){if(e.code!=='ENOENT')throw e;key=randomBytes(32);await writeFile(keyPath,key,{mode:0o600,flag:'wx'});}
 let value={};try{const stored=JSON.parse(await readFile(file,'utf8'));const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(stored.iv,'base64'));decipher.setAuthTag(Buffer.from(stored.tag,'base64'));value=JSON.parse(Buffer.concat([decipher.update(Buffer.from(stored.data,'base64')),decipher.final()]).toString());}catch(e){if(e.code!=='ENOENT')throw Error('無法讀取憑證保管庫，請保留 vault.key 與 vault.enc 配對');}
 return {get:()=>structuredClone(value),async save(next){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([cipher.update(JSON.stringify(next)),cipher.final()]);const tmp=file+'.tmp';await writeFile(tmp,JSON.stringify({iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')}),{mode:0o600});await rename(tmp,file);value=structuredClone(next);}};
}
