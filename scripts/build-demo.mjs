import {build} from 'esbuild';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
await mkdir('dist/assets',{recursive:true});
await mkdir('dist/vendor',{recursive:true});
for(const asset of ['leaflet.js','leaflet.css'])await copyFile('node_modules/leaflet/dist/'+asset,'dist/vendor/'+asset);
const cloud=process.argv.includes('--cloud');
const html=(await readFile('public/index.html','utf8')).replaceAll('src="/','src="./').replaceAll('href="/style.css"','href="./style.css"').replaceAll('href="/"','href="./"').replace('LOCAL PROTOTYPE · M1',cloud?'CLOUD · PRIVATE PREVIEW':'BROWSER DEMO · PREVIEW');
await writeFile('dist/index.html',html);await writeFile('dist/.nojekyll','');
await copyFile('public/style.css','dist/style.css');await copyFile('public/assets/author-mark.svg','dist/assets/author-mark.svg');await mkdir('dist/assets/fonts',{recursive:true});for(const font of ['archivo-latin.woff2','Archivo-OFL.txt'])await copyFile('public/assets/fonts/'+font,'dist/assets/fonts/'+font);
await build({entryPoints:[cloud?'scripts/cloud-entry.mjs':'scripts/demo-entry.mjs'],bundle:true,format:'esm',platform:'browser',target:['es2022'],outfile:'dist/app.js',minify:true,legalComments:'eof'});
await copyFile('node_modules/three/LICENSE','dist/vendor/three-LICENSE');
// The Three.js viewer is requested only when a movement guide is opened.
await build({entryPoints:['public/kettlebell-demo.js'],bundle:true,format:'esm',platform:'browser',target:['es2022'],outfile:'dist/kettlebell-demo.js',minify:true,legalComments:'eof',plugins:[{
 name:'three-vendor',setup(build){build.onResolve({filter:/^\.\/vendor\/three\.module\.js$/},()=>({path:fileURLToPath(import.meta.resolve('three'))}));}
}]});
console.log(cloud?'Cloud frontend ready in dist/ · Credentials and state stay in the API.':'Browser demo ready in dist/ · No server keys, data or LLM calls included.');
