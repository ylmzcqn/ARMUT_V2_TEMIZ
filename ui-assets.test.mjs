import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
const root=new URL('.',import.meta.url);
test('tarayıcı giriş noktası ve tüm yerel modül bağımlılıkları aynı sürüm kimliğini kullanır',()=>{
 const html=readFileSync(new URL('index.html',root),'utf8');const version=html.match(/app\.mjs\?v=([^"\s]+)/)[1];
 assert.ok(html.includes(`style.css?v=${version}`));
 for(const file of readdirSync(root).filter(name=>name.endsWith('.mjs')&&!name.endsWith('.test.mjs'))){
  const text=readFileSync(new URL(file,root),'utf8');
  for(const match of text.matchAll(/from\s+['"](\.\/[^'"]+\.mjs)(?:\?v=([^'"]+))?['"]/g)){
   assert.ok(existsSync(new URL(match[1],root)),`${file}: ${match[1]} yok`);assert.equal(match[2],version,`${file}: eski önbellek sürümü`);
  }
 }
});
