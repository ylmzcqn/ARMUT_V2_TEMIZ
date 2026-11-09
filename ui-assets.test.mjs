import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const root=new URL('.',import.meta.url);
test('tarayıcı modül grafiği tek sürüm kimliği kullanır ve Node sunucu koduna bağlanmaz',()=>{
 const html=readFileSync(new URL('index.html',root),'utf8'),version=html.match(/app\.mjs\?v=([^"\s]+)/)[1];assert.ok(html.includes(`style.css?v=${version}`));
 const pending=['app.mjs'],seen=new Set();
 while(pending.length){const file=pending.pop();if(seen.has(file))continue;seen.add(file);const text=readFileSync(new URL(file,root),'utf8');
  for(const match of text.matchAll(/from\s+['"]([^'"]+)['"]/g)){
   assert.ok(!match[1].startsWith('node:'),`${file}: tarayıcı Node modülü yükleyemez`);
   const dependency=match[1].match(/^(\.\/[^?]+\.mjs)(?:\?v=(.+))?$/);if(!dependency)continue;
   const url=new URL(dependency[1],new URL(file,root));assert.ok(existsSync(url),`${file}: ${dependency[1]} yok`);assert.equal(dependency[2],version,`${file}: eski önbellek sürümü`);pending.push(url.pathname.slice(root.pathname.length));
  }
 }
 assert.ok(seen.has('remote-home.mjs'));assert.ok(!seen.has('server.mjs'));
});
