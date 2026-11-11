import {build} from 'esbuild';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
await mkdir('dist/assets',{recursive:true});
const html=(await readFile('public/index.html','utf8')).replaceAll('src="/','src="./').replaceAll('href="/style.css"','href="./style.css"').replaceAll('href="/"','href="./"').replace('LOCAL PROTOTYPE · M1','BROWSER DEMO · PREVIEW');
await writeFile('dist/index.html',html);await writeFile('dist/.nojekyll','');
await copyFile('public/style.css','dist/style.css');await copyFile('public/assets/author-mark.svg','dist/assets/author-mark.svg');
await build({entryPoints:['scripts/demo-entry.mjs'],bundle:true,format:'esm',platform:'browser',target:['es2022'],outfile:'dist/app.js',minify:true,legalComments:'eof'});
console.log('Browser demo ready in dist/ · No server keys, data or LLM calls included.');
