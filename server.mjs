import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {createApplication} from './src/application.mjs';
import {localFitStore} from './src/local-fit-store.mjs';
import {openStore} from './src/store.mjs';
import {openVault} from './src/vault.mjs';

const dataDir = process.env.DATA_DIR || 'data';
const port = Number(process.env.PORT || 3140);
const base = `http://127.0.0.1:${port}`;
const store = await openStore(dataDir);
const vault = await openVault(dataDir);
const app = createApplication({origin:base, allowedOrigins:[base,`http://localhost:${port}`], store, vault, fitStore:localFitStore(dataDir)});
const send = (res, status, data) => {
 res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'});
 res.end(JSON.stringify(data));
};
 const files={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css'],'/route-map.js':['route-map.js','text/javascript'],'/intervals-activity-ui.js':['intervals-activity-ui.js','text/javascript'],'/kettlebell-core.js':['kettlebell-core.js','text/javascript'],'/kettlebell-ui.js':['kettlebell-ui.js','text/javascript'],'/kettlebell-guidance.js':['kettlebell-guidance.js','text/javascript'],'/kettlebell-demo.js':['kettlebell-demo.js','text/javascript'],'/kettlebell-motion.js':['kettlebell-motion.js','text/javascript'],'/training-research.js':['training-research.js','text/javascript'],'/vendor/three.module.js':['../node_modules/three/build/three.module.js','text/javascript'],'/vendor/three.core.js':['../node_modules/three/build/three.core.js','text/javascript'],'/vendor/leaflet.js':['../node_modules/leaflet/dist/leaflet.js','text/javascript'],'/vendor/leaflet.css':['../node_modules/leaflet/dist/leaflet.css','text/css'],'/assets/author-mark.svg':['assets/author-mark.svg','image/svg+xml'],'/assets/fonts/archivo-latin.woff2':['assets/fonts/archivo-latin.woff2','font/woff2']};

async function handle(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
 res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' https://tile.openstreetmap.org; frame-ancestors 'none'; base-uri 'none'");
 if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host))return send(res,403,{error:'不允許的 Host'});
 const url=new URL(req.url,base);
 if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/auth/'))return app.handleRequest(req,res,url);
 if(req.method==='GET'&&Object.hasOwn(files,req.url)){
  const [file,type]=files[req.url];
  try{const contents=await readFile(new URL('./public/'+file,import.meta.url));res.writeHead(200,{'Content-Type':type.startsWith('font/')?type:type+'; charset=utf-8'});res.end(contents);}
  catch{send(res,404,{error:'找不到本機資源。若剛更新 AIAC，請重新安裝依賴。'});}
 }else send(res,404,{error:'Not found'});
}

http.createServer((req,res)=>{
 handle(req,res).catch(()=>{
  if(!res.headersSent)send(res,500,{error:'本機服務暫時無法完成請求。'});
  else if(!res.writableEnded)res.end();
 });
}).listen(port,'127.0.0.1',()=>console.log(`AIAC running at ${base} · ${store.get().connections.llm.mode} · local data only`));

function poll(){
 app.backgroundSync().catch(()=>console.error('AIAC 無法保存背景同步結果。'));
}
setTimeout(poll,0).unref();
setInterval(poll,30_000).unref();
