import test from 'node:test';
import assert from 'node:assert/strict';
import {environment,call,image} from './fixtures.mjs';
import {load,mutate} from '../worker/state.js';
import {putFile} from '../worker/files.js';
import {currentLink} from '../worker/mobile-capture.js';
async function grant(env){const response=await call(env,'/api/mobile-link',{method:'POST'});assert.equal(response.status,201);const data=await response.json();return {...data,token:new URLSearchParams(new URL(data.url).hash.slice(1)).get('token')};}
function drop(env,token,path,options={}){return call(env,'/api/drop/'+path,{auth:'anonymous',...options,headers:{origin:'https://example.com','x-lingan-capture-token':token,...options.headers}});}
const note=()=>({submissionId:crypto.randomUUID(),title:'手机随手记',body:'从手机保存到电脑'});

test('random upload grants are hashed and owner-managed; holders cannot read or mutate private APIs',async()=>{
 const env=environment();try{assert.equal((await call(env,'/api/mobile-link',{auth:'anonymous',method:'POST'})).status,401);assert.equal((await call(env,'/api/mobile-link',{auth:'sync',method:'POST'})).status,403);
 const a=await grant(env);assert.match(a.token,/^[a-f0-9]{64}$/);assert.match(a.qr,/<svg/);assert.notEqual((await currentLink(env)).token_hash,a.token);
 for(const path of ['/api/state','/api/backup','/api/mobile-link','/api/sync/state','/app.js'])assert.equal((await call(env,path,{auth:'anonymous',headers:{'x-lingan-capture-token':a.token}})).status,401,path);
 assert.equal((await drop(env,a.token,'submit',{method:'POST',body:note(),headers:{origin:'https://evil.example'}})).status,403);
 const login=await (await call(env,'/?view=newsletters',{auth:'anonymous'})).text();assert.match(login,/return_to=%2F%3Fview%3Dnewsletters/);
 }finally{env.close();}
});
test('rotation, expiry, revocation and forged grants fail while owner private state remains intact',async()=>{
 const env=environment();try{const a=await grant(env);assert.equal((await drop(env,a.token,'status')).status,200);const b=await grant(env);assert.notEqual(a.token,b.token);assert.equal((await drop(env,a.token,'submit',{method:'POST',body:note()})).status,401);assert.equal((await drop(env,'f'.repeat(64),'status')).status,401);
 await env.DB.prepare('UPDATE capture_links SET expires_at = ? WHERE id = ?').bind(Date.now()-1,'current').run();assert.equal((await drop(env,b.token,'status')).status,401);
 const c=await grant(env);await call(env,'/api/mobile-link',{method:'DELETE'});assert.equal((await drop(env,c.token,'status')).status,401);assert.equal((await load(env)).state.content.length,0);
 }finally{env.close();}
});
test('append-only capture deduplicates concurrent retries and rejects changed retry payload without losing edits',async()=>{
 const env=environment();try{await mutate(env,s=>s.content.push({id:'private-existing',title:'private',body:'keep'}));const g=await grant(env),payload={...note(),id:'private-existing',rating:5,newsletters:[],status:'ready',token:'must-not-save'};
 const responses=await Promise.all([drop(env,g.token,'submit',{method:'POST',body:payload}),drop(env,g.token,'submit',{method:'POST',body:payload})]);for(const r of responses){assert.equal(r.status,201);assert.deepEqual(Object.keys(await r.json()).sort(),['duplicate','id','saved']);}
 let state=(await load(env)).state;assert.equal(state.content.length,2);assert.equal(state.content[0].body,'keep');assert.equal(state.content[1].rating,0);assert.equal(state.content[1].status,'pending');assert.equal(state.content[1].token,undefined);
 const changed=await drop(env,g.token,'submit',{method:'POST',body:{...payload,body:'new edit after lost response'}});assert.equal(changed.status,409);assert.equal((await changed.json()).code,'submission_changed');state=(await load(env)).state;assert.equal(state.content.length,2);assert.equal(state.content[1].body,payload.body);
 const sync=await (await call(env,'/api/sync/state',{auth:'sync'})).json();assert.equal(sync.content[1].captureVia,'mobile-link');assert.equal(JSON.stringify(sync).includes(g.token),false);
 }finally{env.close();}
});
test('phone images are scoped to the grant, referenced in saved content and available to desktop sync',async()=>{
 const env=environment();try{const secret=await putFile(env,new Uint8Array([...image,23]),'private.png'),g=await grant(env);
 assert.equal((await drop(env,g.token,'files/'+secret.id)).status,404);assert.equal((await drop(env,g.token,'submit',{method:'POST',body:{...note(),coverUrl:secret.url}})).status,400);
 const up=await drop(env,g.token,'files',{method:'POST',body:image});assert.equal(up.status,201);const {url}=await up.json(),id=url.split('/').pop();assert.equal((await drop(env,g.token,'files/'+id)).status,200);
 assert.equal((await drop(env,g.token,'submit',{method:'POST',body:{...note(),coverUrl:url}})).status,201);assert.equal((await call(env,url,{auth:'sync'})).status,200);
 const next=await grant(env);assert.equal((await drop(env,next.token,'files/'+id)).status,404);assert.equal((await drop(env,g.token,'files/'+id)).status,401);
 }finally{env.close();}
});
test('revocation between validation and final SQLite write prevents the append atomically',async()=>{
 for(const populated of [false,true]){const env=environment();try{if(populated)await mutate(env,s=>s.content.push({id:'keep',title:'existing'}));const g=await grant(env),prepare=env.DB.prepare.bind(env.DB);let revoked=false;
 env.DB.prepare=query=>{const statement=prepare(query);if(!/^(INSERT INTO library|UPDATE library SET)/.test(query))return statement;return {bind(...args){const bound=statement.bind(...args);return {...bound,async run(){if(!revoked){revoked=true;await prepare('UPDATE capture_links SET expires_at = ? WHERE id = ?').bind(0,'current').run();}return bound.run();}};}};};
 assert.equal((await drop(env,g.token,'submit',{method:'POST',body:note()})).status,401);assert.equal(revoked,true);assert.equal((await load(env)).state.content.length,populated?1:0);
 }finally{env.close();}}
});
test('quota and oversized input reject explicitly; general links do not initiate network capture',async()=>{
 const env=environment(),originalFetch=globalThis.fetch;try{const g=await grant(env);let fetched=false;globalThis.fetch=async()=>{fetched=true;throw Error('unexpected network')};
 assert.equal((await drop(env,g.token,'preview',{method:'POST',body:{url:'https://example.org/article'}})).status,200);assert.equal(fetched,false);
 assert.equal((await drop(env,g.token,'submit',{method:'POST',body:{...note(),body:'x'.repeat(50001)}})).status,400);assert.equal((await load(env)).state.content.length,0);
 await env.DB.prepare('UPDATE capture_links SET quota_window = ?, preview_count = ? WHERE id = ?').bind(Math.floor(Date.now()/3600000),30,'current').run();assert.equal((await drop(env,g.token,'preview',{method:'POST',body:{url:'https://x.com/hello/status/1234'}})).status,429);assert.equal(fetched,false);
 }finally{globalThis.fetch=originalFetch;env.close();}
});
test('preview exposes only its own image and checks revocation after a slow network request',async()=>{
 const env=environment(),originalFetch=globalThis.fetch;try{const g=await grant(env);let revoke=false;
 globalThis.fetch=async value=>{if(String(value).includes('twimg.com'))return new Response(image,{headers:{'Content-Type':'image/png'}});if(revoke)await call(env,'/api/mobile-link',{method:'DELETE'});return new Response('<meta property="og:url" content="https://x.com/a/status/1234"><meta property="og:description" content="exact caption"><meta property="og:image" content="https://pbs.twimg.com/ext_tw_video_thumb/1234/a.jpg">',{headers:{'Content-Type':'text/html'}});};
 const response=await drop(env,g.token,'preview',{method:'POST',body:{url:'https://x.com/a/status/1234'}});assert.equal(response.status,200);const data=await response.json();assert.equal(data.description,'exact caption');assert.match(data.coverUrl,/^\/api\/files\//);assert.equal((await drop(env,g.token,'files/'+data.coverUrl.split('/').pop())).status,200);
 revoke=true;assert.equal((await drop(env,g.token,'preview',{method:'POST',body:{url:'https://x.com/a/status/1234'}})).status,401);
 }finally{globalThis.fetch=originalFetch;env.close();}
});
