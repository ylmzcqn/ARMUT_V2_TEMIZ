import test from 'node:test';import assert from 'node:assert/strict';
import worker from './cloud-presence-worker.mjs';
const request=(path='/api/presence',method='GET',signed=true)=>new Request('https://fixture-panel.invalid'+path,{method,headers:signed?{'oai-authenticated-user-id':'fixture-owner'}:{}});
const system=()=>({hostname:'fixture-camera',role:'camera',firmware:'fixture',build:'fixture',boot_health:{boot_id:'ab01',elf_sha256:'a'.repeat(64),healthy:true,pending_verification:false},radar:{installed_on:'camera-02',enabled:true,driver_ready:true,online:true,presence:true,sample_age_ms:20},components:[{id:'presence-radar',owner_device_id:'camera-02',online:true,presence:true,value:true}]});
const config={CAMERA02_ORIGIN:'http://camera-fixture.invalid',CAMERA02_TOKEN:'fixture-camera-token',CAMERA02_HOSTNAME:'fixture-camera',CAMERA02_ROLE:'camera'};
test('cloud Worker kimliksiz/yazma isteğini reddeder; kaynak yoksa bilinmiyor döner',async()=>{assert.equal((await worker.fetch(request('/api/presence','GET',false),{})).status,401);assert.equal((await worker.fetch(request('/api/presence','POST'),{})).status,405);const r=await worker.fetch(request(),{});assert.equal(r.status,200);const body=await r.json();assert.equal(body.value,null);assert.equal(body.sourceReady,false);assert.equal(r.headers.get('cache-control'),'no-store');});
test('eski özel servis değişkenleri LAN isteğine yol açmaz; yalnız seçilen push yolu kullanılır',async()=>{let calls=0;const result=await worker.fetch(request(),{...config,CAMERA02_PRIVATE_SERVICE:{fetch:async()=>{calls++;throw Error('no');}}});assert.equal((await result.json()).value,null);assert.equal(calls,0);});
test('yayıncı yetkisi gövde okunmadan doğrulanır; depolama kesintisinde başarı dönmez',async()=>{let touched=0;const env={PRESENCE_PUBLISH_TOKEN:'fixture-key-0000000000000000000000',DB:{prepare(){touched++;throw Error('private database detail');}}};const unauth=new Request('https://fixture.invalid/api/presence/report',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(2048)});assert.equal((await worker.fetch(unauth,env)).status,401);assert.equal(touched,0);const tooLarge=new Request('https://fixture.invalid/api/presence/report',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.PRESENCE_PUBLISH_TOKEN},body:'x'.repeat(2048)});assert.equal((await worker.fetch(tooLarge,env)).status,413);assert.equal(touched,0);const failure=await worker.fetch(request(),env);assert.equal(failure.status,503);assert.ok(!(await failure.text()).includes('private database detail'));});
test('kamera snapshot ve hub display preview yayınlanır, saklanır ve GET ile geri okunur',async()=>{
 const env={PRESENCE_PUBLISH_TOKEN:'fixture-key-0000000000000000000000'};
 const fakeJpeg=new Uint8Array([0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46]);
 const postSnap=new Request('https://fixture.invalid/api/camera/snapshot?deviceId=camera-02',{method:'POST',headers:{'Content-Type':'image/jpeg',Authorization:'Bearer '+env.PRESENCE_PUBLISH_TOKEN},body:fakeJpeg});
 const snapRes=await worker.fetch(postSnap,env);
 assert.equal(snapRes.status,200);
 const snapBody=await snapRes.json();
 assert.equal(snapBody.ok,true);
 assert.equal(snapBody.size,fakeJpeg.byteLength);

 const getSnap=new Request('https://fixture.invalid/api/camera/snapshot?deviceId=camera-02',{method:'GET'});
 const getSnapRes=await worker.fetch(getSnap,env);
 assert.equal(getSnapRes.status,200);
 assert.equal(getSnapRes.headers.get('content-type'),'image/jpeg');
 const readBytes=new Uint8Array(await getSnapRes.arrayBuffer());
 assert.deepEqual(readBytes,fakeJpeg);

 const fakeBmp=new Uint8Array([0x42,0x4d,0x10,0x00,0x00,0x00]);
 const postPrev=new Request('https://fixture.invalid/api/hub/display/preview',{method:'POST',headers:{'Content-Type':'image/bmp',Authorization:'Bearer '+env.PRESENCE_PUBLISH_TOKEN},body:fakeBmp});
 const prevRes=await worker.fetch(postPrev,env);
 assert.equal(prevRes.status,200);

 const getPrev=new Request('https://fixture.invalid/api/hub/display/preview',{method:'GET'});
 const getPrevRes=await worker.fetch(getPrev,env);
 assert.equal(getPrevRes.status,200);
 assert.equal(getPrevRes.headers.get('content-type'),'image/bmp');
});

