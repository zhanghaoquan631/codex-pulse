import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {environment,image} from './fixtures.mjs';
import {load,mutate} from '../worker/state.js';
import {putFile} from '../worker/files.js';

// Use the real capture markup without deploying or touching a saved library.
globalThis.__ASSETS__={'/capture.html':{body:readFileSync(new URL('../public/capture.html',import.meta.url),'utf8'),type:'text/html; charset=utf-8'}};
const {default:worker}=await import('../worker/main.js?fixed-mobile-entry-tests');
delete globalThis.__ASSETS__;
async function request(env,path,{auth='owner',method='GET',body,headers={}}={}){
  const authHeaders=auth==='owner'?{'oai-authenticated-user-id':'owner-1','oai-authenticated-user-email':'owner@example.com',origin:'https://example.com'}:auth==='other'?{'oai-authenticated-user-id':'other-1','oai-authenticated-user-email':'other@example.com',origin:'https://example.com'}:auth==='sync'?{authorization:'Bearer '+env.SYNC_TOKEN}:{};
  if(body!==undefined&&typeof body!=='string'&&!(body instanceof Uint8Array)){body=JSON.stringify(body);authHeaders['content-type']='application/json';}
  return worker.fetch(new Request('https://example.com'+path,{method,body,headers:{...authHeaders,...headers}}),env);
}
const note=()=>({submissionId:crypto.randomUUID(),title:'手机长期入口',caption:'原始文案',body:'自己的笔记'});
const drop=(env,path,options)=>request(env,'/api/mobile/drop/'+path,options);
async function grant(env){const response=await request(env,'/api/mobile-link',{method:'POST'});assert.equal(response.status,201);const data=await response.json();return {...data,token:new URLSearchParams(new URL(data.url).hash.slice(1)).get('token')};}

test('fixed phone address and QR stay identical across devices, old grant rotation, expiry and revocation',async()=>{
 const env=environment();try{
  const a=await (await request(env,'/api/mobile-entry')).json();assert.deepEqual(Object.keys(a).sort(),['permanent','qr','requiresLogin','url']);assert.equal(a.url,'https://example.com/mobile');assert.equal(a.permanent,true);assert.equal(a.requiresLogin,true);assert.match(a.qr,/<svg/);assert.equal(new URL(a.url).hash,'');
  const g=await grant(env);await grant(env);await env.DB.prepare('UPDATE capture_links SET expires_at = ?, quota_window = ?, file_count = ?, preview_count = ?, submission_count = ? WHERE id = ?').bind(0,Math.floor(Date.now()/3600000),40,30,120,'current').run();
  const secondDevice=await (await request(env,'/api/mobile-entry',{headers:{'oai-authenticated-user-id':'owner-other-device'}})).json();assert.deepEqual(secondDevice,a);
  assert.equal((await request(env,'/api/drop/status',{auth:'anonymous',headers:{'x-lingan-capture-token':g.token}})).status,401);
  await request(env,'/api/mobile-link',{method:'DELETE'});assert.deepEqual(await (await drop(env,'status')).json(),{active:true,permanent:true,requiresLogin:true});
  assert.deepEqual(await (await request(env,'/api/mobile-entry')).json(),a);assert.equal((await load(env)).state.content.length,0);
 }finally{env.close();}
});

test('mobile page serves upload UI only to the owner; login and wrong-account pages return to the fixed URL',async()=>{
 const env=environment();try{
  const owner=await request(env,'/mobile');assert.equal(owner.status,200);assert.match(await owner.text(),/id="capture-form"/);assert.equal(owner.headers.get('cache-control'),'no-store');assert.match(owner.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  for(const auth of ['anonymous','other','sync']){const response=await request(env,'/mobile?token=ignored',{auth});assert.equal(response.status,200);const body=await response.text();assert.match(body,/return_to=%2Fmobile/);assert.doesNotMatch(body,/id="capture-form"/);if(auth==='other')assert.match(body,/signout-with-chatgpt/);else assert.match(body,/signin-with-chatgpt/);}
  for(const auth of ['anonymous','owner','other','sync']){const response=await request(env,'/mobile',{auth,method:'HEAD'});assert.equal(response.status,200);assert.equal(await response.text(),'');}
 }finally{env.close();}
});

test('fixed entry APIs reject anonymous users, wrong accounts and sync tokens, even with a valid legacy grant',async()=>{
 const env=environment();try{
  const g=await grant(env),stored=await putFile(env,image,'private.png');
  for(const auth of ['anonymous','other','sync'])for(const [path,method,body] of [['/api/mobile-entry','GET'],['/api/mobile/drop/status','GET'],['/api/mobile/drop/files/'+stored.id,'GET'],['/api/mobile/drop/files','POST',image],['/api/mobile/drop/preview','POST',{url:'https://example.org'}],['/api/mobile/drop/submit','POST',note()]]){
   const response=await request(env,path,{auth,method,body,headers:{'x-lingan-capture-token':g.token,origin:'https://example.com'}});assert.equal(response.status,auth==='sync'?403:401,path+' '+auth);assert.equal(response.headers.get('access-control-allow-origin'),null);
  }
  assert.equal((await load(env)).state.content.length,0);assert.equal((await request(env,'/api/mobile-entry',{method:'POST'})).status,405);
 }finally{env.close();}
});

test('owner writes retain CSRF checks for uploads, preview and submit without opening private library APIs',async()=>{
 const env=environment();try{
  for(const [path,body] of [['files',image],['preview',{url:'https://example.org/a'}],['submit',note()]])for(const headers of [{origin:'https://evil.example'},{origin:''},{'sec-fetch-site':'cross-site'}])assert.equal((await drop(env,path,{method:'POST',body,headers})).status,403,path);
  assert.equal((await request(env,'/api/state',{auth:'anonymous'})).status,401);assert.equal((await request(env,'/api/backup',{auth:'other'})).status,401);assert.equal((await load(env)).state.content.length,0);
 }finally{env.close();}
});

test('owner phone uploads and existing library images remain available after old links expire, but non-images and remote covers fail',async()=>{
 const env=environment();try{
  const stored=await putFile(env,new Uint8Array([...image,11]),'desktop.png'),pdf=await putFile(env,new TextEncoder().encode('%PDF- fake document'),'document.pdf');await grant(env);await request(env,'/api/mobile-link',{method:'DELETE'});
  const up=await drop(env,'files',{method:'POST',body:image});assert.equal(up.status,201);const uploaded=await up.json();assert.match(uploaded.url,/^\/api\/files\/[a-f0-9]{32}$/);
  for(const entry of [stored,{id:uploaded.url.split('/').pop(),url:uploaded.url}]){for(const method of ['GET','HEAD'])assert.equal((await drop(env,'files/'+entry.id,{method})).status,200);assert.equal((await drop(env,'submit',{method:'POST',body:{...note(),coverUrl:entry.url}})).status,201);}
  assert.equal((await drop(env,'files/'+pdf.id)).status,404);assert.equal((await drop(env,'files/'+'e'.repeat(32))).status,404);
  for(const coverUrl of [pdf.url,'/api/files/'+'f'.repeat(32),'https://example.org/cover.png','/api/mobile/drop/files/'+stored.id])assert.equal((await drop(env,'submit',{method:'POST',body:{...note(),coverUrl}})).status,400);
  assert.equal((await drop(env,'files',{method:'POST',body:new TextEncoder().encode('%PDF-'),headers:{'content-type':'image/png'}})).status,400);
  assert.equal((await drop(env,'files',{method:'POST',body:new Uint8Array()})).status,400);assert.equal((await drop(env,'files',{method:'POST',body:image,headers:{'content-length':String(12*1024*1024+1)}})).status,413);
  assert.equal((await load(env)).state.content.length,2);
 }finally{env.close();}
});

test('owner submissions are append-only, pending and idempotent across concurrent requests and grant changes',async()=>{
 const env=environment();try{
  await mutate(env,state=>{state.content.push({id:'keep',title:'已有资料',body:'不可覆盖'});state.materialBoxes.push({id:'box',name:'素材箱'});});
  const payload={...note(),id:'keep',status:'ready',rating:5,tags:['injected'],token:'do-not-store'};
  const responses=await Promise.all([drop(env,'submit',{method:'POST',body:payload}),drop(env,'submit',{method:'POST',body:payload,headers:{'oai-authenticated-user-id':'owner-other-device'}})]);const results=[];for(const response of responses){assert.equal(response.status,201);results.push(await response.json());}assert.equal(results[0].id,results[1].id);assert.equal(results.filter(x=>x.duplicate).length,1);
  const savedId=results[0].id;await grant(env);await request(env,'/api/mobile-link',{method:'DELETE'});const retry=await drop(env,'submit',{method:'POST',body:payload});assert.equal(retry.status,201);assert.deepEqual(await retry.json(),{id:savedId,saved:true,duplicate:true});
  const changed=await drop(env,'submit',{method:'POST',body:{...payload,caption:'另一份改动'}});assert.equal(changed.status,409);assert.equal((await changed.json()).code,'submission_changed');
  let state=(await load(env)).state;assert.equal(state.content.length,2);assert.equal(state.content[0].body,'不可覆盖');assert.equal(state.materialBoxes[0].name,'素材箱');const saved=state.content[1];assert.equal(saved.body,payload.body);assert.equal(saved.captureVia,'mobile-login');assert.equal(saved.status,'pending');assert.equal(saved.rating,0);assert.deepEqual(saved.tags,[]);assert.equal(saved.token,undefined);
  await mutate(env,state=>{state.content[1].title='电脑已经编辑';state.content[1].deletedAt=new Date().toISOString();});assert.equal((await drop(env,'submit',{method:'POST',body:payload})).status,201);state=(await load(env)).state;assert.equal(state.content[1].title,'电脑已经编辑');assert.ok(state.content[1].deletedAt);assert.equal(state.content.length,2);
  const sync=await (await request(env,'/api/sync/state',{auth:'sync'})).json();assert.equal(sync.content[1].id,savedId);assert.equal(JSON.stringify(sync).includes('do-not-store'),false);
 }finally{env.close();}
});

test('fixed upload validates bounded input and generic URLs without initiating a capture request',async()=>{
 const env=environment(),originalFetch=globalThis.fetch;try{
  let fetched=false;globalThis.fetch=async()=>{fetched=true;throw Error('unexpected fetch');};
  const response=await drop(env,'preview',{method:'POST',body:{url:'https://example.org/article'}});assert.equal(response.status,200);assert.equal((await response.json()).source,'manual');assert.equal(fetched,false);
  for(const body of [{...note(),body:'x'.repeat(50001)},{...note(),submissionId:'short'},{...note(),url:'javascript:alert(1)'},{submissionId:crypto.randomUUID()},'not json'])assert.equal((await drop(env,'submit',{method:'POST',body})).status,400);
  assert.equal((await drop(env,'submit',{method:'POST',body:note(),headers:{'content-length':'180001'}})).status,413);assert.equal((await load(env)).state.content.length,0);
 }finally{globalThis.fetch=originalFetch;env.close();}
});

test('slow owner preview and its saved cover do not depend on a revoked legacy grant',async()=>{
 const env=environment(),originalFetch=globalThis.fetch;try{
  await grant(env);let rotated=false;
  globalThis.fetch=async value=>{if(String(value).includes('twimg.com'))return new Response(image,{headers:{'content-type':'image/png'}});if(!rotated){await request(env,'/api/mobile-link',{method:'DELETE'});rotated=true;}return new Response('<meta property="og:url" content="https://x.com/a/status/1234"><meta property="og:description" content="原始文案保持完整"><meta property="og:image" content="https://pbs.twimg.com/ext_tw_video_thumb/1234/a.jpg">',{headers:{'content-type':'text/html'}});};
  const response=await drop(env,'preview',{method:'POST',body:{url:'https://x.com/a/status/1234'}});assert.equal(response.status,200);const data=await response.json();assert.equal(data.description,'原始文案保持完整');assert.match(data.coverUrl,/^\/api\/files\//);assert.equal((await drop(env,'files/'+data.coverUrl.split('/').pop())).status,200);
  const payload={...note(),url:data.url,caption:data.description,coverUrl:data.coverUrl};for(let i=0;i<2;i++)assert.equal((await drop(env,'submit',{method:'POST',body:payload})).status,201);assert.equal((await load(env)).state.content.length,1);
 }finally{globalThis.fetch=originalFetch;env.close();}
});
