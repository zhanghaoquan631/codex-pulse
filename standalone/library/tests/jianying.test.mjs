import test from 'node:test';
import assert from 'node:assert/strict';
import {environment,call,image} from './fixtures.mjs';
import {load,mutate} from '../worker/state.js';
import {putFile} from '../worker/files.js';
import {hash} from '../worker/files.js';
import worker from '../worker/main.js';
const video=new Uint8Array([0,0,0,24,102,116,121,112,105,115,111,109,0,0,0,0,105,115,111,109,109,112,52,49,1,2,3]);
async function paired(env){const response=await call(env,'/api/jianying/connect',{method:'POST',body:{name:'电脑'}});assert.equal(response.status,201);const invitation=await response.json();const pair=await call(env,'/api/jianying/pair',{auth:'anonymous',method:'POST',body:{code:invitation.code}});assert.equal(pair.status,200);return {...await pair.json(),invitation};}
const native=(env,path,token,options={})=>call(env,'/api/jianying/native/'+path,{auth:'anonymous',...options,headers:{...options.headers,authorization:'Bearer '+token}});
test('pairing is owner-only, CSRF protected, hashed, single-use, expiring and revocable',async t=>{
  const env=environment();t.after(()=>env.close());
  for(const auth of ['anonymous','other','sync'])assert.notEqual((await call(env,'/api/jianying/connect',{auth,method:'POST',body:{}})).status,201);
  assert.equal((await worker.fetch(new Request('https://example.com/api/jianying/connect',{method:'POST',body:'{}',headers:{'oai-authenticated-user-id':'user-1','oai-authenticated-user-email':'owner@example.com',origin:'https://evil.example'}}),env)).status,403);
  assert.equal((await call(env,'/api/jianying/connect',{method:'POST',body:null,headers:{'Content-Type':'application/json'}})).status,400);
  const {token,deviceId,invitation}=await paired(env);
  const row=await env.DB.prepare('SELECT * FROM jianying_devices WHERE id = ?').bind(deviceId).first();
  assert.equal(row.pair_hash,null);assert.notEqual(row.token_hash,token);assert.equal(row.token_hash,await hash(new TextEncoder().encode(token)));
  assert.equal((await call(env,'/api/jianying/pair',{auth:'anonymous',method:'POST',body:{code:invitation.code}})).status,403);
  assert.equal((await native(env,'status',token)).status,200);
  assert.equal((await native(env,'status','0'.repeat(64))).status,401);
  const listing=await (await call(env,'/api/jianying/devices')).json();assert.equal(listing.devices[0].connected,1);assert.ok(!JSON.stringify(listing).includes(token));assert.ok(!JSON.stringify(listing).includes(row.token_hash));
  await call(env,'/api/jianying/devices/'+deviceId+'/revoke',{method:'POST',body:{}});assert.equal((await native(env,'status',token)).status,401);
  const pending=await (await call(env,'/api/jianying/connect',{method:'POST',body:{}})).json();await env.DB.prepare('UPDATE jianying_devices SET pair_expires = 0 WHERE id = ?').bind(pending.id).run();
  assert.equal((await call(env,'/api/jianying/pair',{auth:'anonymous',method:'POST',body:{code:pending.code}})).status,403);
});
test('native connection can read only videos and append deduplicated pending results without losing other edits',async t=>{
  const env=environment();t.after(()=>env.close());const {token}=await paired(env),source=await putFile(env,video,'source.mp4'),cover=await putFile(env,image,'private.png');
  assert.equal((await native(env,'files/'+source.id,token)).status,200);assert.equal((await native(env,'files/'+cover.id,token)).status,403);assert.equal((await native(env,'state',token)).status,403);
  await mutate(env,state=>state.content.push({id:'keep',title:'已有笔记',body:'保留',tags:[]}));
  let response=await native(env,'returns',token,{method:'POST',body:video,headers:{'x-file-name':encodeURIComponent('剪辑.mp4')}});assert.equal(response.status,201);const first=await response.json();
  assert.equal(first.item.status,'pending');assert.equal(first.item.videoUrl,source.url);assert.equal(first.duplicate,false);
  await mutate(env,state=>{const saved=state.content.find(x=>x.id===first.item.id);saved.status='ready';saved.title='我修改了标题';saved.body='保留整理结果';});
  response=await native(env,'returns',token,{method:'POST',body:video});const duplicate=await response.json();assert.equal(duplicate.duplicate,true);assert.equal(duplicate.item.status,'ready');assert.equal(duplicate.item.title,'我修改了标题');
  const state=(await load(env)).state;assert.equal(state.content.length,2);assert.equal(state.content.find(x=>x.id==='keep').body,'保留');
  assert.equal((await native(env,'returns',token,{method:'POST',body:image})).status,400);
  assert.equal((await native(env,'returns',token,{method:'POST',body:video,headers:{'content-length':String(25*1024*1024+1)}})).status,413);
});
test('disconnect during attachment storage prevents the final pending-record commit',async t=>{
  const env=environment();t.after(()=>env.close());const {token,deviceId}=await paired(env),original=env.BUCKET.put;
  env.BUCKET.put=async(...args)=>{await original(...args);await env.DB.prepare('UPDATE jianying_devices SET revoked = 1 WHERE id = ?').bind(deviceId).run();};
  assert.equal((await native(env,'returns',token,{method:'POST',body:video})).status,401);assert.equal((await load(env)).state.content.length,0);
});
test('materials remain separate from pending results and duplicate uploads do not create extra material',async t=>{
  const env=environment();t.after(()=>env.close());
  for(let i=0;i<2;i++)assert.equal((await call(env,'/api/jianying/materials',{method:'POST',body:video,headers:{'x-file-name':'source.mp4'}})).status,201);
  const state=(await load(env)).state;assert.equal(state.materials.length,1);assert.equal(state.content.length,0);assert.equal(state.materials[0].type,'video');
  assert.equal((await call(env,'/api/jianying/returns',{method:'POST',body:video})).status,201);assert.equal((await load(env)).state.content[0].status,'pending');
});
