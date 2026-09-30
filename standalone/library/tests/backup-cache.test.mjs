// Copy this unchanged to outputs/cloud/tests/backup-cache.test.mjs.
// Real Worker routes, in-memory SQLite, immutable fixture bucket, no live data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync,crc32} from 'node:zlib';
import worker from '../worker/main.js';
import {environment,call} from './fixtures.mjs';
import {emptyState,load,mutate} from '../worker/state.js';
import {putFile} from '../worker/files.js';
import {readBundle,exportBundle} from '../worker/bundle.js';
import {pngSize} from '../worker/backup-cache.js';

// Both images were encoded by native Canvas; every PNG chunk has a real CRC.
const PNG=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAABHNCSVQICAgIfAhkiAAAAAFzUkdCAK7OHOkAAAANSURBVAiZY2BgYPgPAAEEAQB9ssjfAAAAAElFTkSuQmCC','base64'));
const COVER=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAABHNCSVQICAgIfAhkiAAAAAFzUkdCAK7OHOkAAAANSURBVAiZY3hnHPofAAX/AnbmpH/LAAAAAElFTkSuQmCC','base64'));

async function jsonResponse(response,status=200){
  const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return value;
}
async function seeded(t){
  const env=environment();t.after(()=>env.close());
  const cover=await putFile(env,COVER,'selected-cover.png');
  const privateFile=await putFile(env,new TextEncoder().encode('unrelated private material bytes'),'private.txt');
  const selected={id:'selected-item',title:'所选条目',caption:'完整原文\n第二行',body:'自己的备注',url:'https://example.org/post',coverUrl:cover.url,tags:['相关'],rating:4,sequence:1,status:'ready'};
  const unrelated={id:'unrelated-item',title:'不应进入单期 ZIP 的内容',caption:'unrelated private caption',body:'unrelated private note',coverUrl:'',tags:['私人'],sequence:2};
  await mutate(env,state=>Object.assign(state,{
    content:[selected,unrelated],
    newsletters:[
      {id:'issue-selected',token:'selected-token-123456789',title:'所选周刊',date:'2026-09-30',intro:'所选导语',items:[structuredClone(selected)],coverUrl:cover.url},
      {id:'issue-unrelated',token:'unrelated-token-12345678',title:'其他私人周刊',date:'2026-09-29',intro:'unrelated private intro',items:[structuredClone(unrelated)]},
    ],
    materials:[{id:'private-material',title:'其他素材',fileUrl:privateFile.url}],
    materialBoxes:[{id:'private-box',name:'私人素材箱'}],tags:[{name:'相关'},{name:'私人'}],
    profile:{displayName:'private profile should not leak',bio:'private bio'},
  }));
  const path='backups/mezip-x-activity/'+ 'a'.repeat(64)+'.json';
  await env.BUCKET.put(path,new TextEncoder().encode('{"private":"raw unrelated event"}'));
  await env.BUCKET.put('backups/index.json',new TextEncoder().encode(JSON.stringify([path])));
  return {env,cover,privateFile};
}
async function source(env,issueId='issue-selected'){
  return jsonResponse(await call(env,'/api/backup-cache/source',{method:'POST',body:{sourceType:'newsletter',sourceId:issueId}}));
}
async function upload(env,bytes=PNG){
  return jsonResponse(await call(env,'/api/files',{method:'POST',body:bytes,headers:{'x-file-name':'long-image.png'}}),201);
}
function pngPayload(selected,file,submissionId='png-once-12345678'){
  return {sourceType:selected.sourceType,sourceId:selected.sourceId,sourceHash:selected.sourceHash,fileUrl:file.url,submissionId};
}
function zipPayload(selected,submissionId='zip-once-12345678'){
  return {sourceType:selected.sourceType,sourceId:selected.sourceId,sourceHash:selected.sourceHash,submissionId};
}
async function savePng(env,submissionId){
  const selected=await source(env),file=await upload(env);
  const payload=pngPayload(selected,file,submissionId);
  const result=await jsonResponse(await call(env,'/api/backup-cache/register',{method:'POST',body:payload}),201);
  return {...result,payload,file};
}

test('backup cache endpoints remain owner-only and reject cross-site or originless writes',async t=>{
  const {env}=await seeded(t);
  const routes=['/api/backup-cache/source','/api/backup-cache/register','/api/backup-cache/issue','/api/backup-cache/cover','/api/material-image'];
  for(const path of routes)for(const [auth,status] of [['none',401],['other',401],['sync',403]]){
    assert.equal((await call(env,path,{auth,method:'POST',body:{issueId:'issue-selected'}})).status,status,path+' '+auth);
  }
  assert.equal((await call(env,'/api/backup-cache/source',{method:'POST',body:{issueId:'issue-selected'},headers:{'sec-fetch-site':'cross-site'}})).status,403);
  const response=await worker.fetch(new Request('https://example.com/api/backup-cache/source',{method:'POST',headers:{'oai-authenticated-user-id':'user-1','oai-authenticated-user-email':'owner@example.com','content-type':'application/json'},body:JSON.stringify({issueId:'issue-selected'})}),env);
  assert.equal(response.status,403);
  assert.equal((await load(env)).state.backupCaches.length,0);
});

test('source returns only the requested complete issue snapshot and its stable hash',async t=>{
  const {env}=await seeded(t),selected=await source(env);
  assert.match(selected.sourceHash,/^[a-f0-9]{64}$/);
  assert.equal(selected.sourceType,'newsletter');assert.equal(selected.sourceId,'issue-selected');
  assert.equal(selected.source.title,'所选周刊');
  assert.deepEqual(selected.source.items.map(item=>item.id),['selected-item']);
  assert.equal(selected.source.items[0].caption,'完整原文\n第二行');
  assert.equal((await source(env)).sourceHash,selected.sourceHash);
  assert.equal((await call(env,'/api/backup-cache/source',{method:'POST',body:{issueId:'missing'}})).status,404);
});

test('real PNG CRC and dimensions register once and survive fresh state load and file download',async t=>{
  const {env}=await seeded(t);
  assert.deepEqual(pngSize(PNG),{width:1,height:1});
  const {cache,file}=await savePng(env);
  assert.equal(cache.kind,'long-image');assert.equal(cache.fileType,'image/png');
  assert.equal(cache.width,1);assert.equal(cache.height,1);assert.equal(cache.size,PNG.length);
  assert.equal(cache.fileUrl,file.url);assert.equal(cache.sha256,file.sha256);
  const reloaded=await jsonResponse(await call(env,'/api/state'));
  assert.deepEqual(reloaded.backupCaches,[cache]);
  const downloaded=await call(env,cache.fileUrl);
  assert.equal(downloaded.status,200);assert.equal(downloaded.headers.get('content-type'),'image/png');
  assert.deepEqual(new Uint8Array(await downloaded.arrayBuffer()),PNG);
});

test('identical retry returns the original cache even after later source edits; changed retry gets 409',async t=>{
  const {env}=await seeded(t),saved=await savePng(env);
  await mutate(env,state=>{state.newsletters[0].title='随后修改的标题';});
  const retry=await jsonResponse(await call(env,'/api/backup-cache/register',{method:'POST',body:saved.payload}),201);
  assert.deepEqual(retry.cache,saved.cache);assert.equal((await load(env)).state.backupCaches.length,1);
  const changed=await call(env,'/api/backup-cache/register',{method:'POST',body:{...saved.payload,fileUrl:'/api/files/'+'f'.repeat(32)}});
  assert.equal(changed.status,409);assert.equal((await load(env)).state.backupCaches.length,1);
});

test('PNG generation against an edited source gets 409 and never registers a misleading cache',async t=>{
  const {env}=await seeded(t),selected=await source(env),file=await upload(env);
  await mutate(env,state=>{state.newsletters[0].items[0].caption='另一设备修改了原文';});
  const result=await call(env,'/api/backup-cache/register',{method:'POST',body:pngPayload(selected,file)});
  assert.equal(result.status,409);assert.equal((await load(env)).state.backupCaches.length,0);
  assert.equal((await call(env,file.url)).status,200,'the generated image remains downloadable');
});

test('cache creation requires the original source hash, including ZIP retries',async t=>{
  const {env}=await seeded(t),selected=await source(env),file=await upload(env);
  const png=pngPayload(selected,file);delete png.sourceHash;
  assert.equal((await call(env,'/api/backup-cache/register',{method:'POST',body:png})).status,400);
  const zip=zipPayload(selected);delete zip.sourceHash;
  assert.equal((await call(env,'/api/backup-cache/issue',{method:'POST',body:zip})).status,400);
  assert.equal((await load(env)).state.backupCaches.length,0);
});

test('one-issue ZIP excludes other issues, materials, profile and raw capture backups',async t=>{
  const {env,cover,privateFile}=await seeded(t),selected=await source(env),payload=zipPayload(selected);
  const result=await jsonResponse(await call(env,'/api/backup-cache/issue',{method:'POST',body:payload}),201);
  assert.equal(result.cache.kind,'issue-backup');assert.equal(result.cache.fileType,'application/zip');
  const response=await call(env,result.cache.fileUrl);
  const parsed=await readBundle(new Uint8Array(await response.arrayBuffer()));
  assert.deepEqual(parsed.state.newsletters.map(issue=>issue.id),['issue-selected']);
  assert.deepEqual(parsed.state.content.map(item=>item.id),['selected-item']);
  for(const collection of ['materials','materialBoxes','backupCaches'])assert.deepEqual(parsed.state[collection],[]);
  assert.deepEqual(parsed.sourceBackups,[]);assert.deepEqual(parsed.state.sourceBackupPaths,[]);
  assert.equal(parsed.state.profile?.displayName,undefined);
  assert.equal(parsed.attachments.length,1);assert.equal(parsed.attachments[0].id,cover.id);
  assert.ok(!parsed.attachments.some(item=>item.id===privateFile.id));
  const retry=await jsonResponse(await call(env,'/api/backup-cache/issue',{method:'POST',body:payload}),201);
  assert.deepEqual(retry.cache,result.cache);assert.equal((await load(env)).state.backupCaches.length,1);
});

test('remote covers become offline ZIP attachments without modifying the original issue',async t=>{
  const {env}=await seeded(t),originalFetch=globalThis.fetch,remote='https://cdn.example.org/remote-cover.png';
  t.after(()=>{globalThis.fetch=originalFetch;});let requests=0;
  await mutate(env,state=>{state.newsletters[0].coverUrl=remote;state.newsletters[0].items[0].coverUrl=remote;});
  const before=structuredClone((await load(env)).state.newsletters[0]),selected=await source(env);
  globalThis.fetch=async(url,options)=>{assert.equal(String(url),remote);assert.equal(options.redirect,'manual');requests++;return new Response(PNG,{headers:{'content-type':'image/png'}});};
  const result=await jsonResponse(await call(env,'/api/backup-cache/issue',{method:'POST',body:zipPayload(selected,'remote-zip-12345678')}),201);
  const response=await call(env,result.cache.fileUrl),parsed=await readBundle(new Uint8Array(await response.arrayBuffer()));
  assert.equal(requests,1,'a shared issue/card cover is downloaded once');
  assert.equal(parsed.manifest.externalCoverCount,0);assert.equal(parsed.attachments.length,1);
  for(const record of [parsed.state.newsletters[0],parsed.state.newsletters[0].items[0],parsed.state.content[0]]){
    assert.match(record.coverUrl,/^\/api\/files\/[a-f0-9]{32}$/);assert.equal(record.originalCoverUrl,remote);
    assert.equal(record.coverUrl,parsed.attachments[0].info.url);
  }
  assert.deepEqual(parsed.attachments[0].bytes,PNG);
  assert.deepEqual((await load(env)).state.newsletters[0],before,'backup must not rewrite the owner issue');
});

test('a failed remote cover stops ZIP creation instead of claiming a complete offline backup',async t=>{
  const {env}=await seeded(t),originalFetch=globalThis.fetch;
  t.after(()=>{globalThis.fetch=originalFetch;});
  await mutate(env,state=>{state.newsletters[0].coverUrl='https://cdn.example.org/unavailable.png';});
  const before=structuredClone((await load(env)).state.newsletters[0]),selected=await source(env);
  globalThis.fetch=async()=>new Response(null,{status:503});
  const response=await call(env,'/api/backup-cache/issue',{method:'POST',body:zipPayload(selected,'failed-remote-zip-12345678')});
  assert.equal(response.status,400);assert.equal((await load(env)).state.backupCaches.length,0);
  assert.deepEqual((await load(env)).state.newsletters[0],before);
});

test('source change during ZIP assembly yields 409 and no cache registration',async t=>{
  const {env,cover}=await seeded(t),selected=await source(env);
  const get=env.BUCKET.get.bind(env.BUCKET);let changed=false;
  env.BUCKET.get=async(key,options)=>{
    if(!changed&&key==='files/'+cover.id){changed=true;await mutate(env,state=>{state.newsletters[0].intro='changed during file reads';});}
    return get(key,options);
  };
  const result=await call(env,'/api/backup-cache/issue',{method:'POST',body:zipPayload(selected)});
  assert.equal(result.status,409);assert.equal(changed,true);assert.equal((await load(env)).state.backupCaches.length,0);
});

test('full portable backup includes both cache artifacts, reloadable records and all referenced files',async t=>{
  const {env}=await seeded(t),png=await savePng(env);
  const selected=await source(env);
  const zip=await jsonResponse(await call(env,'/api/backup-cache/issue',{method:'POST',body:zipPayload(selected)}),201);
  const response=await call(env,'/api/backup');assert.equal(response.status,200);
  const parsed=await readBundle(new Uint8Array(await response.arrayBuffer()));
  assert.equal(parsed.manifest.counts.backupCaches,2);assert.equal(parsed.manifest.counts.materialBoxes,1);
  assert.equal(parsed.state.backupCaches.length,2);assert.equal(parsed.state.newsletters.length,2);
  for(const cache of [png.cache,zip.cache]){
    const attachment=parsed.attachments.find(item=>item.info.url===cache.fileUrl);
    assert.ok(attachment,'full backup lost '+cache.kind);assert.equal(attachment.info.sha256,cache.sha256);
  }
});

test('legacy JSON import preserves existing immutable backup caches',async t=>{
  const {env}=await seeded(t),saved=await savePng(env),state=await jsonResponse(await call(env,'/api/state'));
  const payload={content:state.content,materials:state.materials,tags:state.tags,expectedUpdatedAt:state.updatedAt};
  const result=await jsonResponse(await call(env,'/api/state',{method:'PUT',body:payload}));
  assert.deepEqual(result.backupCaches,[saved.cache]);
  assert.equal((await call(env,saved.cache.fileUrl)).status,200);
});

test('sync accepts identical cache metadata with reordered JSON keys but refuses real changes',async t=>{
  const {env}=await seeded(t),saved=await savePng(env),state=await jsonResponse(await call(env,'/api/sync/state',{auth:'sync'}));
  state.backupCaches=state.backupCaches.map(cache=>Object.fromEntries(Object.entries(cache).reverse()));
  const result=await jsonResponse(await call(env,'/api/sync/commit',{auth:'sync',method:'POST',body:{state,expectedUpdatedAt:state.updatedAt}}));
  assert.deepEqual(result.backupCaches,[saved.cache]);
  const changed=structuredClone(result);changed.backupCaches[0].title='actually changed immutable metadata';
  assert.equal((await call(env,'/api/sync/commit',{auth:'sync',method:'POST',body:{state:changed,expectedUpdatedAt:result.updatedAt}})).status,409);
  assert.deepEqual((await load(env)).state.backupCaches,[saved.cache]);
});

test('sync from a legacy client omitting backupCaches keeps server cache history',async t=>{
  const {env}=await seeded(t),saved=await savePng(env),state=await jsonResponse(await call(env,'/api/sync/state',{auth:'sync'}));
  delete state.backupCaches;
  const result=await jsonResponse(await call(env,'/api/sync/commit',{auth:'sync',method:'POST',body:{state,expectedUpdatedAt:state.updatedAt}}));
  assert.deepEqual(result.backupCaches,[saved.cache]);
});

test('corrupt CRC and fake PNG headers never become saved cache records',async t=>{
  const {env}=await seeded(t),selected=await source(env),bad=Uint8Array.from(PNG);bad[40]^=1;
  for(const [index,bytes] of [bad,new Uint8Array([137,80,78,71,13,10,26,10,1,2,3])].entries()){
    const file=await upload(env,bytes);
    assert.equal((await call(env,'/api/backup-cache/register',{method:'POST',body:pngPayload(selected,file,'bad-png-request-'+index)})).status,400);
  }
  assert.equal((await load(env)).state.backupCaches.length,0);
});

test('a CRC-valid PNG with an invalid row filter cannot be registered as a decodable image',async t=>{
  const {env}=await seeded(t),selected=await source(env);
  const encoded=deflateSync(Buffer.from([5,0,0,0,255])); // A real zlib stream; filter 5 is invalid.
  const idat=Buffer.alloc(encoded.length+12);idat.writeUInt32BE(encoded.length,0);idat.write('IDAT',4);encoded.copy(idat,8);
  idat.writeUInt32BE(crc32(idat.subarray(4,idat.length-4)),idat.length-4);
  const invalid=Uint8Array.from(Buffer.concat([Buffer.from(PNG.slice(0,33)),idat,Buffer.from(PNG.slice(-12))]));
  const file=await upload(env,invalid);
  const response=await call(env,'/api/backup-cache/register',{method:'POST',body:pngPayload(selected,file,'invalid-filter-png-12345678')});
  assert.equal(response.status,400);assert.equal((await load(env)).state.backupCaches.length,0);
});

test('a library containing only cache history cannot be overwritten by whole-library migration',async t=>{
  const {env}=await seeded(t),saved=await savePng(env);
  await mutate(env,state=>{for(const key of ['content','materials','tags','materialBoxes','newsletters'])state[key]=[];});
  const {bytes}=await exportBundle(env,{...emptyState(),sourceBackupPaths:[]});
  const response=await call(env,'/api/sync/migrate',{auth:'sync',method:'POST',body:bytes});
  assert.equal(response.status,409);assert.deepEqual((await load(env)).state.backupCaches,[saved.cache]);
});

test('remote cover proxy checks each redirect, forwards no credentials, and only reads selected covers',async t=>{
  const {env}=await seeded(t),originalFetch=globalThis.fetch;let requests=[];
  t.after(()=>{globalThis.fetch=originalFetch;});
  await mutate(env,state=>{state.newsletters[0].items[0].coverUrl='https://cdn.example.org/selected.png';});
  const selected=await source(env);
  globalThis.fetch=async(url,options)=>{
    requests.push({url:String(url),options});
    return new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}});
  };
  const response=await call(env,'/api/backup-cache/cover',{method:'POST',body:{sourceType:'newsletter',sourceId:selected.sourceId,sourceHash:selected.sourceHash,index:0}});
  assert.equal(response.status,400);assert.equal(requests.length,1);
  assert.equal(requests[0].options.redirect,'manual');
  assert.ok(!new Headers(requests[0].options.headers).has('authorization'));
  assert.ok(!new Headers(requests[0].options.headers).has('cookie'));
  requests=[];
  assert.equal((await call(env,'/api/material-image',{method:'POST',body:{url:'https://unrelated.example.org/image.png'}})).status,400);
  assert.equal(requests.length,0,'WeChat import must not become an arbitrary URL proxy');
});

test('malformed JSON payloads are validation errors, not transient backend failures',async t=>{
  const {env}=await seeded(t);
  for(const path of ['/api/backup-cache/source','/api/backup-cache/register','/api/backup-cache/issue','/api/backup-cache/cover','/api/material-image']){
    for(const value of ['null','[]']){
      const response=await call(env,path,{method:'POST',body:new TextEncoder().encode(value),headers:{'content-type':'application/json'}});
      assert.equal(response.status,400,path+' '+value);
    }
  }
});

test('Bilibili AVIF thumbnail covers export the same original raster in long images and issue ZIPs',async t=>{
  const {env}=await seeded(t),originalFetch=globalThis.fetch,thumbnail='https://i1.hdslb.com/bfs/archive/actual.jpg@672w_378h_1c_!web-home-common-cover.avif',original='https://i1.hdslb.com/bfs/archive/actual.jpg';
  t.after(()=>{globalThis.fetch=originalFetch;});
  await mutate(env,state=>{state.newsletters[0].coverUrl=thumbnail;state.newsletters[0].items[0].coverUrl=thumbnail;});
  const before=structuredClone((await load(env)).state.newsletters[0]),selected=await source(env),requests=[];
  globalThis.fetch=async(url)=>{requests.push(String(url));assert.equal(String(url),original);return new Response(PNG,{headers:{'content-type':'image/png'}});};
  const cover=await call(env,'/api/backup-cache/cover',{method:'POST',body:{sourceType:'newsletter',sourceId:selected.sourceId,sourceHash:selected.sourceHash,index:0}});
  assert.equal(cover.status,200);assert.deepEqual(new Uint8Array(await cover.arrayBuffer()),PNG);
  const saved=await jsonResponse(await call(env,'/api/backup-cache/issue',{method:'POST',body:{sourceType:'newsletter',sourceId:selected.sourceId,sourceHash:selected.sourceHash,submissionId:'actual-avif-thumb-test'}}),201);
  const file=await call(env,saved.cache.fileUrl),bundle=await readBundle(new Uint8Array(await file.arrayBuffer()));
  assert.equal(bundle.manifest.externalCoverCount,0);assert.deepEqual(bundle.attachments[0].bytes,PNG);assert.deepEqual((await load(env)).state.newsletters[0],before);assert.equal(requests.length,2);
});
