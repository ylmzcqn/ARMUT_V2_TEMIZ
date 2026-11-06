import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {validateInventory,verifySourceSnapshots} from './inventory-core.mjs?v=cloud20261106-1';
try{
 const data=validateInventory(JSON.parse(await readFile(new URL('./inventory.json',import.meta.url),'utf8')));await verifySourceSnapshots(data);
 const args=process.argv.slice(2),index=args.indexOf('--root'),root=index>=0?path.resolve(args[index+1]||''):null,files=new Map();
 for(const source of Object.values(data.sources)){
  if(!source.snapshot)throw Error('Taşınabilir kaynak özeti eksik: '+source.path);
  if(!root)continue;
  const file=path.resolve(root,source.path),relative=path.relative(root,file);if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Kaynak yolu kök dışında.');
  if(!files.has(file))files.set(file,await readFile(file));const bytes=files.get(file);
  if(createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw Error('Özgün kaynak değişmiş: '+source.path);
  const excerpt=bytes.toString('utf8').split(/\r?\n/).slice(source.start-1,source.end).join('\n')+'\n';
  if(excerpt!==source.snapshot.text)throw Error('Özgün satırlarla özet farklı: '+source.path);
 }
 console.log(root?'Kaynak özetleri ve özgün dosya/satır hashleri doğrulandı.':'Taşınabilir kaynak özetlerinin bütünlüğü doğrulandı; özgün dosyalara erişilmedi.');
}catch(error){console.error(error.message);process.exitCode=1;}
