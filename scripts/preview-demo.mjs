import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
const root=resolve('dist'),port=Number(process.env.PORT||3141);
http.createServer(async(req,res)=>{try{let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(path.startsWith('/AIAC/'))path=path.slice(5);if(path==='/'||path==='')path='/index.html';const file=resolve(root,'.'+path);if(!file.startsWith(root+sep))throw Error('Not found');const body=await readFile(file);res.writeHead(200,{'Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404);res.end('Not found');}}).listen(port,'127.0.0.1',()=>console.log(`Browser demo: http://127.0.0.1:${port}/AIAC/`));
