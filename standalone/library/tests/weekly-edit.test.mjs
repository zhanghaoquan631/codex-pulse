import test from 'node:test';
import assert from 'node:assert/strict';
import {environment,call} from './fixtures.mjs';
import {mutate,load} from '../worker/state.js';
import {issueDraft} from '../worker/weekly-edit.js';
async function seed(env){await mutate(env,s=>{s.content.push({id:'original',title:'原库标题',body:'原库笔记'});s.newsletters.push({id:'weekly-test',token:'a'.repeat(32),title:'原刊',date:'2026-09-28',intro:'导语',items:[{id:'original',title:'旧快照',caption:'原文',body:'本期笔记',rating:3,sequence:1,url:'https://x.com/example/status/123',coverUrl:'https://example.com/image.png',source:'x',privateExtra:'retained'}]});});return issueDraft((await load(env)).state.newsletters[0]);}
test('owner edits the existing weekly snapshot while preserving source records, token and media',async()=>{
 const env=environment();try{const base=await seed(env),body={base,...structuredClone(base),title:'手机修改的周刊',intro:'新的导语'};body.items[0]={...body.items[0],title:'手机修改标题',body:'新笔记',rating:5,sequence:8,url:'https://evil.example',source:'manual'};
 const response=await call(env,'/api/newsletters/weekly-test/edit',{method:'POST',body});assert.equal(response.status,200);const {newsletter}=await response.json();assert.equal(newsletter.title,body.title);assert.equal(newsletter.items[0].body,'新笔记');assert.equal(newsletter.items[0].url,base.items[0].url);assert.equal(newsletter.items[0].coverUrl,base.items[0].coverUrl);assert.equal(newsletter.items[0].source,'x');assert.equal(newsletter.items[0].privateExtra,'retained');assert.equal(newsletter.token,'a'.repeat(32));assert.equal((await load(env)).state.content[0].title,'原库标题');assert.equal((await call(env,'/api/sync/state',{auth:'sync'})).status,200);assert.match(await (await call(env,'/share/'+'a'.repeat(32),{auth:'anonymous'})).text(),/手机修改标题/);
 }finally{env.close();}
});
test('stale weekly edits are rejected without losing concurrent changes and base key order is irrelevant',async()=>{
 const env=environment();try{const base=await seed(env),body={base:{items:base.items,intro:base.intro,date:base.date,title:base.title},...structuredClone(base),title:'第一次编辑'};body.base={items:base.items,intro:base.intro,date:base.date,title:base.title};assert.equal((await call(env,'/api/newsletters/weekly-test/edit',{method:'POST',body})).status,200);body.title='过期覆盖';assert.equal((await call(env,'/api/newsletters/weekly-test/edit',{method:'POST',body})).status,409);assert.equal((await load(env)).state.newsletters[0].title,'第一次编辑');
 }finally{env.close();}
});
test('weekly editing rejects other identities, CSRF, changed IDs, blank captions and oversized fields',async()=>{
 const env=environment();try{const base=await seed(env),valid={base,...structuredClone(base)};for(const auth of ['anonymous','other','sync'])assert.notEqual((await call(env,'/api/newsletters/weekly-test/edit',{auth,method:'POST',body:valid})).status,200);assert.equal((await call(env,'/api/newsletters/weekly-test/edit',{method:'POST',body:valid,headers:{'sec-fetch-site':'cross-site'}})).status,403);
 for(const change of [{title:' '.repeat(3)},{title:'x'.repeat(121)},{items:[]},{items:[{...base.items[0],id:'injected'}]},{items:[{...base.items[0],caption:''}]},{items:[{...base.items[0],body:'x'.repeat(50001)}]},{items:[{...base.items[0],rating:6}]}])assert.equal((await call(env,'/api/newsletters/weekly-test/edit',{method:'POST',body:{...valid,...change}})).status,400);assert.equal((await load(env)).state.newsletters[0].title,'原刊');
 }finally{env.close();}
});
