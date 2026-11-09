// Builds a separate reviewable artifact; never edits the active static manifest or publishes.
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {dirname,join,resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),out=resolve(process.argv[2]||join(root,'build/cloud-prepared'));
if(out===root)throw new Error('Çıktı ayrı bir klasör olmalı.');
const assets={},seen=new Set(),pending=['app.mjs'];
function include(path){const bytes=readFileSync(join(root,path)),types={'.mjs':'text/javascript; charset=utf-8','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2'};assets['/'+path]={type:types[extname(path)]||'application/octet-stream',data:bytes.toString('base64')};return bytes.toString('utf8');}
while(pending.length){const path=pending.pop();if(seen.has(path))continue;seen.add(path);const text=include(path);for(const m of text.matchAll(/from\s+['"]([^'"]+)['"]/g)){if(m[1].startsWith('node:'))throw new Error('Tarayıcı grafiğinde Node bağımlılığı.');const local=m[1].match(/^\.\/([\w-]+\.mjs)(?:\?.*)?$/);if(local)pending.push(local[1]);}}
for(const path of ['index.html','style.css','inventory.json'])include(path);
function directory(path){for(const entry of readdirSync(join(root,path),{withFileTypes:true})){const child=path+'/'+entry.name;if(entry.isDirectory())directory(child);else if(entry.isFile())include(child);}}
directory('assets');
const parser=readFileSync(join(root,'legacy-camera-status.mjs'),'utf8').replace(/export function /g,'function ');
const provider=readFileSync(join(root,'legacy-camera-provider.mjs'),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/^export \{[^\n]+\n/gm,'').replace(/export function /g,'function ');
const worker=readFileSync(join(root,'cloud-presence-worker.mjs'),'utf8').replace(/^import[^\n]+\n/gm,'');
const bundle=`const ARMUT_STATIC_ASSETS=${JSON.stringify(assets)};\nconst createLegacyCameraProvider=(()=>{const createCameraPresenceState=(()=>{${parser}\nreturn createCameraPresenceState;})();\n${provider}\nreturn createLegacyCameraProvider;})();\n${worker}`;
mkdirSync(join(out,'dist/server'),{recursive:true});mkdirSync(join(out,'.openai'),{recursive:true});
writeFileSync(join(out,'dist/server/index.js'),bundle);
const manifest=JSON.parse(readFileSync(join(root,'.openai/hosting.json'),'utf8'));delete manifest.static;
writeFileSync(join(out,'.openai/hosting.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({artifact:out,assets:Object.keys(assets).length,bytes:Buffer.byteLength(bundle),published:false,privateServiceBinding:'not-provisioned'}));
