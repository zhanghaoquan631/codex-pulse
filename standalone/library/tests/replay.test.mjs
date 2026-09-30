import test from 'node:test';
import assert from 'node:assert/strict';
import {environment,call} from './fixtures.mjs';
import {putFile} from '../worker/files.js';
import {mutate} from '../worker/state.js';

async function seed(env,overrides={}){
  const bytes=new Uint8Array(64);bytes.set(new TextEncoder().encode('....ftypisom'));
  const file=await putFile(env,bytes,'录制.mp4');
  const item={id:'live-replay-'+file.id,kind:'live-replay',title:'私人回放 <img src=x onerror=alert(1)>',status:'pending',fileUrl:file.url,fileType:file.type,fileName:file.name,fileSize:file.size,createdAt:'2026-09-30T01:56:00Z',...overrides};
  await mutate(env,state=>state.content.push(item));
  return {file,item,path:'/replay/'+file.id,bytes};
}
test('replay links preserve their destination across owner login without exposing private metadata',async()=>{
  const env=environment();try{
    const {path}=await seed(env);
    for(const auth of [null,'other']){
      const response=await call(env,path+'?from=phone',{auth});assert.equal(response.status,200);
      const html=await response.text();assert.ok(html.includes((auth?'signout':'signin')+'-with-chatgpt?return_to='+encodeURIComponent(path+'?from=phone')));
      assert.ok(!html.includes('私人回放'));assert.ok(!html.includes('/api/files/'));
      assert.equal(await (await call(env,path,{auth,method:'HEAD'})).text(),'');
    }
    assert.equal((await call(env,path,{auth:'sync'})).status,403);
    assert.equal((await call(env,path,{auth:null,headers:{authorization:'Bearer llive_not-owner'}})).status,200);
  }finally{env.close();}
});
test('owner replay page uses the protected video, escapes metadata and supports HEAD',async()=>{
  const env=environment();try{
    const {path,file}=await seed(env),response=await call(env,path),html=await response.text();
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('referrer-policy'),'no-referrer');
    assert.ok(response.headers.get('content-security-policy').includes("media-src 'self'"));
    assert.ok(html.includes('controls playsinline preload="metadata" src="'+file.url+'"'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));assert.ok(!html.includes('<img src=x'));
    const head=await call(env,path,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
  }finally{env.close();}
});
test('replay pages reject deleted, unrelated, unknown and missing-file records',async()=>{
  for(const override of [{deletedAt:'2026-09-30T02:00:00Z'},{kind:'video'},{}]){
    const env=environment();try{
      const {path,file}=await seed(env,override);if(!Object.keys(override).length)await env.BUCKET.delete('files/'+file.id);
      const response=await call(env,path);assert.equal(response.status,404);assert.ok(!(await response.text()).includes('私人回放'));
      assert.equal((await call(env,'/replay/'+'0'.repeat(32))).status,404);
    }finally{env.close();}
  }
});
test('replay media permits owner initial/suffix seeks while denying anonymous and wrong-account access',async()=>{
  const env=environment();try{
    const {file,bytes}=await seed(env);
    for(const [range,expected] of [['bytes=0-1',bytes.slice(0,2)],['bytes=-5',bytes.slice(-5)]]){
      const response=await call(env,file.url,{headers:{range}});assert.equal(response.status,206);assert.equal(response.headers.get('accept-ranges'),'bytes');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),expected);
      for(const auth of [null,'other'])assert.equal((await call(env,file.url,{auth,headers:{range}})).status,401);
    }
  }finally{env.close();}
});
