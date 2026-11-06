import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {filterDevices,filterChoices} from './device-filters.mjs';
const {devices}=JSON.parse(await readFile(new URL('./inventory.json',import.meta.url),'utf8'));
test('kayıt türü filtreleri gerçek cihazları ayırır; girdi değişmez',()=>{
 assert.equal(filterDevices(devices).length,4);
 assert.deepEqual(filterDevices(devices,'camera').map(d=>d.id),['camera-01','camera-02']);
 assert.deepEqual(filterDevices(devices,'hub').map(d=>d.id),['hub']);
 assert.deepEqual(filterDevices(devices,'historical').map(d=>d.id),['uno-history']);
 assert.equal(devices.length,4);
});
test('boş sonuç, boş envanter ve tanınmayan kart filtrelenir',()=>{
 assert.equal(filterDevices([],'camera').length,0);
 assert.equal(filterDevices(devices,'other').length,0);
 assert.equal(filterDevices([{id:'new',icon:'board'}],'other').length,1);
 assert.ok(filterChoices([],'camera').some(c=>c.value==='camera'&&c.count===0));
});
