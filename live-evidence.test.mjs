import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionIsActive,connectionVerifiedUntil,devicePresence} from './live-evidence.mjs';
test('efekt yalnız güncel cihaz ve iki uç doğrulamasında çalışır; tarihsel/bilinmeyen kabul edilmez',()=>{
 const now=Date.parse('2026-11-06T12:00:00Z');
 const time=new Date(now-1000).toISOString();
 const device={presentation:{components:[{},{}]}};
 assert.equal(connectionIsActive(device,0,1,now),false);
 device.liveStatus={online:true,verifiedAt:time};device.presentation.components[0].liveStatus={working:true,verifiedAt:time};
 assert.equal(connectionIsActive(device,0,1,now),false);
 device.presentation.components[1].liveStatus={working:true,verifiedAt:time};
 assert.equal(connectionIsActive(device,0,1,now),true);
 assert.equal(connectionIsActive(device,0,1,now+90000),false);
 assert.equal(connectionVerifiedUntil(device,0,1),now+89000);
 device.liveStatus.online=false;assert.equal(connectionIsActive(device,0,1,now),false);
});

test('cihaz kartı güncel çevrimiçi/çevrimdışı bilgisi ile bilinmeyen ve tarihsel kaydı ayırır',()=>{
 const now=Date.parse('2026-11-06T12:00:00Z');
 assert.equal(devicePresence({},now).state,'unknown');
 assert.equal(devicePresence({id:'uno-history'},now).state,'historical');
 const device={liveStatus:{online:true,verifiedAt:new Date(now).toISOString()}};
 assert.equal(devicePresence(device,now).state,'online');
 device.liveStatus.online=false;assert.equal(devicePresence(device,now).state,'offline');
 assert.equal(devicePresence(device,now+90001).state,'unknown');
});
