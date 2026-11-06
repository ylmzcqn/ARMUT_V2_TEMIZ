import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeHardware,normalizePin,assignmentWarnings} from './hardware-map.mjs';
import {editConnection,addConnection,removeComponent} from './wiring-model.mjs';
import {validateInventory} from './inventory-core.mjs';
const inventory=()=>JSON.parse(readFileSync(new URL('./inventory.json',import.meta.url),'utf8'));
test('S3 haritası 45 GPIO içerir; kayıtsız pin boş veya kullanılabilir sayılmaz',()=>{
 const data=inventory(),map=analyzeHardware(data,'hub');
 assert.equal(map.pins.length,45);assert.ok(!map.pins.some(p=>p.pin==='GPIO22'));assert.equal(map.pins.find(p=>p.pin==='GPIO41').status,'restricted');assert.equal(map.pins.filter(p=>p.status==='available').length,0);
 assert.ok(map.pins.find(p=>p.pin==='GPIO35').constraints.length);assert.ok(map.pins.find(p=>p.pin==='GPIO19').constraints.length);
});
test('pin normalleştirme güç hatlarını, modül uçlarını ve başka cihazın GPIO adını yutmaz',()=>{
 const p=inventory().pinProfiles['esp32-s3'];
 assert.equal(normalizePin('gpio 041',p),'GPIO41');assert.equal(normalizePin('Kamera GPIO14',p),null);assert.equal(normalizePin('3V3',p),null);assert.equal(normalizePin('GPIO22',p),null);
});
test('ses ortak saatleri bilinen paylaşım; hoparlör uçları yanlışlıkla GPIO sayılmaz',()=>{
 const map=analyzeHardware(inventory(),'hub');
 for(const pin of ['GPIO6','GPIO13'])assert.equal(map.pins.find(p=>p.pin===pin).status,'shared');
 assert.equal(map.links.filter(l=>l.targetComponent>=0).length,2);
 assert.equal(map.pins.find(p=>p.pin==='GPIO4').status,'reserved');
});
test('kamera geçmişi güncel kullanım sayılmaz; kaynakta ayrılan hatlar boş görünmez',()=>{
 const map=analyzeHardware(inventory(),'camera-01');
 assert.equal(map.pins.find(p=>p.pin==='GPIO14').status,'historical');assert.equal(map.pins.find(p=>p.pin==='GPIO1').status,'reserved');
 assert.equal(map.pins.find(p=>p.pin==='GPIO11').status,'used');
});
test('Uno yerel uçları diğer cihazın GPIO numarasıyla karışmaz',()=>{
 const map=analyzeHardware(inventory(),'uno-history');
 assert.deepEqual(map.pins.filter(p=>p.assignments.length).map(p=>p.pin),['D2','D3','D9','D10']);assert.ok(map.pins.every(p=>p.status!=='available'));
});
test('manuel atama mevcut hatla çakışır; silme haritayı günceller ama boş onayı üretmez',()=>{
 const data=inventory(),next=editConnection(data,'hub',2,0,{terminal:'OUT',target:'GPIO11',targetComponent:-1,kind:'signal'});
 assert.equal(analyzeHardware(next,'hub').pins.find(p=>p.pin==='GPIO11').status,'conflict');
 assert.ok(assignmentWarnings(next,'hub',2,0).length);
 const removed=removeComponent(data,'hub',0);assert.notEqual(analyzeHardware(removed,'hub').pins.find(p=>p.pin==='GPIO11').status,'available');assert.ok(analyzeHardware(data,'hub').pins.find(p=>p.pin==='GPIO11').assignments.length);
});
test('aynı GND veya 3V3 hattı çakışma değildir; veri/ses saat paylaşımı yalnız açık kayıtla kabul edilir',()=>{
 const next=addConnection(inventory(),'hub',2,{terminal:'Yeni saat',target:'GPIO13',targetComponent:-1,kind:'clock'});
 assert.equal(analyzeHardware(next,'hub').pins.find(p=>p.pin==='GPIO13').status,'conflict');assert.ok(!analyzeHardware(next,'hub').issues.some(i=>i.pin==='GND'||i.pin==='3V3'));
});
test('bozuk profil, kaynak, alan veya tarih sessizce kabul edilmez',()=>{
 const data=inventory();data.devices[0].hardware.reservations[0].sourceIds=['missing'];assert.throws(()=>validateInventory(data));
 const other=inventory();other.pinProfiles['esp32-s3'].pins.push('GPIO41');assert.throws(()=>validateInventory(other));
});

test('geçersiz S3 GPIO ataması reddedilir; uygunluk onayı kart kanıtı olmadan yeşil olmaz',()=>{
 const data=inventory();assert.throws(()=>addConnection(data,'hub',0,{terminal:'Yeni',target:'GPIO22',targetComponent:-1,kind:'signal'}));
 data.devices[0].hardware.availability=[{pin:'GPIO38',state:'available',reason:'Test doğrulaması',sourceIds:['hp'],checkedAt:'2026-11-06'}];
 assert.equal(analyzeHardware(data,'hub').pins.find(p=>p.pin==='GPIO38').status,'unknown');
 data.devices[0].hardware.boardVerification={status:'verified',sourceIds:['hp'],checkedAt:'2026-11-06'};
 validateInventory(data);assert.equal(analyzeHardware(data,'hub').pins.find(p=>p.pin==='GPIO38').status,'available');
 data.devices[0].hardware.reservations.push({pin:'GPIO38',reason:'Başka kullanım ayrıldı',sourceIds:['hp']});assert.equal(analyzeHardware(data,'hub').pins.find(p=>p.pin==='GPIO38').status,'reserved');
});

test('yonga özellikleri pin uygunluğu yerine geçmez; rapor bütün kaynak iddialarını korur',()=>{
 const data=inventory(),map=analyzeHardware(data,'hub');assert.ok(map.pins.find(p=>p.pin==='GPIO1').capabilities.includes('ADC1_CH0'));assert.equal(map.pins.find(p=>p.pin==='GPIO1').status,'unknown');assert.deepEqual(map.claims,data.devices.find(d=>d.id==='hub').claims);
});

test('haritayı açmak veya tekrar analiz etmek envanteri/profili değiştirmez',()=>{
 const data=inventory(),before=JSON.stringify(data);
 const first=analyzeHardware(data,'hub'),second=analyzeHardware(data,'hub');
 assert.equal(JSON.stringify(data),before);assert.deepEqual(first,second);
});

test('kart doğrulamasının tarih ve kaynakları raporda kaybolmaz',()=>{
 const data=inventory();data.sources.boardOnly={...data.sources.hp};data.devices[0].hardware.boardVerification={status:'verified',sourceIds:['boardOnly'],checkedAt:'2026-11-06'};
 const report=analyzeHardware(data,'hub');assert.equal(report.boardVerification.checkedAt,'2026-11-06');assert.deepEqual(report.boardVerification.sourceIds,['boardOnly']);assert.deepEqual(report.sources.boardOnly,data.sources.boardOnly);
});
