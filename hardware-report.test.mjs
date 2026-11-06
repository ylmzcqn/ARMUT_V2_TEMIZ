import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {analyzeHardware} from './hardware-map.mjs';
const cwd=new URL('.',import.meta.url);
test('CLI aynı analiz ve kaynakları döndürür; olmayan cihaz/pin başarı gibi sunulmaz',()=>{
 const data=JSON.parse(readFileSync(new URL('./inventory.json',import.meta.url),'utf8'));
 const run=spawnSync(process.execPath,['hardware-report.mjs','--device','hub'],{cwd,encoding:'utf8'});assert.equal(run.status,0);assert.deepEqual(JSON.parse(run.stdout),analyzeHardware(data,'hub'));
 for(const args of [['--device','missing'],['--device','hub','--pin','GPIO22']]){const result=spawnSync(process.execPath,['hardware-report.mjs',...args],{cwd,encoding:'utf8'});assert.equal(result.status,1);assert.ok(result.stderr.trim());}
});
