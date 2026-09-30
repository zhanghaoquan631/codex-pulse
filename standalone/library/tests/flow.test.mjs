import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../worker/main.js';
import {load,mutate,emptyState} from '../worker/state.js';
import {putFile} from '../worker/files.js';
import {exportBundle,readBundle} from '../worker/bundle.js';
import {extract,publicURL} from '../worker/preview.js';

function environment(){
  const sql=new DatabaseSync(':memory:');
  for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')))sql.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
  const objects=new Map();
  return {OWNER_EMAIL:'owner@example.com',SYNC_TOKEN:'a'.repeat(40),DB:{
    prepare(query){
      const stmt=sql.prepare(query);
      return {bind(...values){return {
        async first(){return stmt.get(...values)||null;},
        async run(){const r=stmt.run(...values);return {meta:{changes:r.changes}};}
      };}};
    }
  },BUCKET:{
    async head(key){const x=objects.get(key);return x?{size:x.bytes.length,...x.options}:null},
    async put(key,bytes,options){objects.set(key,{bytes:Uint8Array.from(bytes),options});},
    async get(key,opts){const x=objects.get(key);if(!x)return null;let bytes=x.bytes;if(opts?.range)bytes=bytes.slice(opts.range.offset,opts.range.offset+opts.range.length);return {size:bytes.length,...x.options,body:new Response(bytes).body,async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}}}
  },close(){sql.close()}};
}
async function call(env,path,{auth='owner',method='GET',body,headers={}}={}){
  const h={...headers};if(auth==='owner'){h['oai-authenticated-user-id']='user-1';h['oai-authenticated-user-email']='owner@example.com';h.origin='https://example.com';}if(auth==='other'){h['oai-authenticated-user-id']='other';h['oai-authenticated-user-email']='other@example.com';}if(auth==='sync')h.authorization='Bearer '+env.SYNC_TOKEN;
  if(body&&!(body instanceof Uint8Array)){body=JSON.stringify(body);h['content-type']='application/json';}
  return worker.fetch(new Request('https://example.com'+path,{method,headers:h,body}),env);
}
const image=new Uint8Array([137,80,78,71,13,10,26,10,1,2,3]);

test('private APIs reject anonymous and other accounts, including source assets and attachments',async()=>{
  const env=environment();try{for(const auth of ['anonymous','other'])for(const path of ['/api/state','/api/backup','/api/capture/status','/app.js','/api/files/'+'a'.repeat(32)])assert.equal((await call(env,path,{auth})).status,401);
    assert.match(await (await call(env,'/',{auth:'anonymous'})).text(),/signin-with-chatgpt/);
    assert.equal((await call(env,'/api/state',{auth:'sync'})).status,403);
    assert.equal((await call(env,'/api/capture/status',{auth:'sync'})).status,403);
    assert.deepEqual(await (await call(env,'/api/capture/status')).json(),{configured:false,provider:'cloudflare',independentOfComputer:true});
    assert.equal((await call(env,'/api/sync/state',{auth:'sync'})).status,200);
    assert.equal((await worker.fetch(new Request('https://example.com/api/changes',{method:'POST',headers:{'oai-authenticated-user-id':'user-1','oai-authenticated-user-email':'owner@example.com','origin':'https://evil.example'},body:'{}'}),env)).status,403);
  }finally{env.close();}
});
test('actual SQLite merge preserves remote additions, conflicts are atomic',async()=>{
  const env=environment();try{const base={id:'x',title:'Video',rating:1,caption:'original',body:'notes',tags:[],sequence:1,status:'pending',desc:'',url:'',coverUrl:''};await mutate(env,s=>s.content.push(base));
    await mutate(env,s=>{s.content[0].body='phone note';s.content.push({...base,id:'phone'});});
    let response=await call(env,'/api/changes',{method:'POST',body:{changes:[{collection:'content',base,item:{...base,rating:5}}]}});assert.equal(response.status,200);let state=await response.json();assert.equal(state.content[0].body,'phone note');assert.equal(state.content.length,2);
    response=await call(env,'/api/changes',{method:'POST',body:{changes:[{collection:'content',base:null,item:{...base,id:'should-not-save'}},{collection:'content',base,item:{...base,rating:2}}]}});assert.equal(response.status,409);assert.equal((await load(env)).state.content.length,2);
  }finally{env.close();}
});
test('manual issue date and star order; visitors only see selected snapshots and images',async()=>{
  const env=environment();try{const cover=await putFile(env,image,'cover.png');const secret=await putFile(env,new Uint8Array([...image,4]),'secret.png');
    await mutate(env,s=>s.content.push({id:'a',title:'<script>bad</script>',caption:'caption A',coverUrl:cover.url,url:'https://x.com/example/status/1',rating:3,sequence:9},{id:'b',title:'Top',caption:'caption B',coverUrl:cover.url,rating:5,sequence:2}));
    const response=await call(env,'/api/newsletters',{method:'POST',body:{itemIds:['a','b'],date:'2026-07-17',title:'周刊'}});assert.equal(response.status,201);const {newsletter:issue}=await response.json();assert.equal(issue.items[0].id,'b');assert.equal(issue.date,'2026-07-17');
    await mutate(env,s=>s.content[0].caption='changed');const page=await call(env,'/share/'+issue.token,{auth:'anonymous'});assert.equal(page.status,200);const text=await page.text();assert.match(text,/caption A/);assert.doesNotMatch(text,/<script>bad/);
    assert.equal((await call(env,'/share/'+issue.token+'/files/'+cover.id,{auth:'anonymous'})).status,200);
    assert.equal((await call(env,'/share/'+issue.token+'/files/'+secret.id,{auth:'anonymous'})).status,404);
    const range=await call(env,cover.url,{headers:{Range:'bytes=2-5'}});assert.equal(range.status,206);assert.deepEqual(new Uint8Array(await range.arrayBuffer()),image.slice(2,6));
    assert.equal((await call(env,cover.url,{headers:{Range:'bytes=100-'}})).status,416);
  }finally{env.close();}
});
test('backup import preserves files, snapshots, and refuses to overwrite an occupied library',async()=>{
  const env=environment(),target=environment();try{const cover=await putFile(env,image,'cover.png');const state=emptyState();state.content.push({id:'x',caption:'caption',rating:5,sequence:4,coverUrl:cover.url});state.newsletters.push({id:'issue',token:'0123456789abcdef012345',items:structuredClone(state.content)});
    const rawName='backups/mezip-private-library/'+'a'.repeat(64)+'.json',rawBytes=new TextEncoder().encode('{"original":true}');
    await env.BUCKET.put(rawName,rawBytes);await env.BUCKET.put('backups/index.json',new TextEncoder().encode(JSON.stringify([rawName])));
    const bundle=await exportBundle(env,state),parsed=await readBundle(bundle.bytes);assert.equal(parsed.attachments.length,1);assert.equal(parsed.state.content[0].sequence,4);
    let response=await call(target,'/api/sync/migrate',{auth:'sync',method:'POST',body:bundle.bytes});assert.equal(response.status,201);assert.equal((await load(target)).state.newsletters[0].token,state.newsletters[0].token);
    assert.equal((await call(target,cover.url,{auth:'sync'})).status,200);
    const fileInfo=await (await call(target,'/api/sync/files/'+cover.id,{auth:'sync'})).json();assert.equal(fileInfo.sha256,cover.sha256);
    const exported=await exportBundle(target,(await load(target)).state);const restored=await readBundle(exported.bytes);assert.equal(restored.sourceBackups.length,1);assert.deepEqual(restored.sourceBackups[0][1],rawBytes);
    response=await call(target,'/api/sync/migrate',{auth:'sync',method:'POST',body:bundle.bytes});assert.equal(response.status,409);
    const local=(await load(target)).state;response=await call(target,'/api/sync/commit',{auth:'sync',method:'POST',body:{state:local,expectedUpdatedAt:'outdated'}});assert.equal(response.status,409);
    await assert.rejects(()=>readBundle(new Uint8Array([1,2,3])));
  }finally{env.close();target.close();}
});
test('concurrent migrations and later sync retain source backups from the committed winner',async()=>{
  const target=environment();let release;
  try{
    async function bundleFor(label){const source=environment();try{
      const state=emptyState();state.content.push({id:label});
      const name='backups/mezip-private-library/'+label.repeat(64)+'.json';
      await source.BUCKET.put(name,new TextEncoder().encode(JSON.stringify({source:label})));
      await source.BUCKET.put('backups/index.json',new TextEncoder().encode(JSON.stringify([name])));
      return (await exportBundle(source,state)).bytes;
    }finally{source.close();}}
    const a=await bundleFor('a'),b=await bundleFor('b');
    let entered;const blocked=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
    const put=target.BUCKET.put.bind(target.BUCKET);let first=true;
    target.BUCKET.put=async(key,bytes,options)=>{if(first&&key.startsWith('backups/mezip-private-library/')){first=false;entered();await gate;}return put(key,bytes,options);};
    const pendingA=call(target,'/api/sync/migrate',{auth:'sync',method:'POST',body:a});await blocked;
    const responseB=await call(target,'/api/sync/migrate',{auth:'sync',method:'POST',body:b});release();
    assert.equal(responseB.status,201);assert.equal((await pendingA).status,409);
    let stored=(await load(target)).state;assert.equal(stored.content[0].id,'b');
    const expectedPaths=structuredClone(stored.sourceBackupPaths);
    for(const mode of ['missing','changed']){
      const incoming=structuredClone(stored);if(mode==='missing')delete incoming.sourceBackupPaths;else incoming.sourceBackupPaths=[];
      const response=await call(target,'/api/sync/commit',{auth:'sync',method:'POST',body:{state:incoming,expectedUpdatedAt:stored.updatedAt}});
      assert.equal(response.status,200);stored=await response.json();assert.deepEqual(stored.sourceBackupPaths,expectedPaths);
    }
    const restored=await readBundle((await exportBundle(target,stored)).bytes);
    assert.equal(restored.sourceBackups.length,1);assert.deepEqual(JSON.parse(new TextDecoder().decode(restored.sourceBackups[0][1])),{source:'b'});
    await put('backups/index.json',new TextEncoder().encode(JSON.stringify(expectedPaths)));
    const withoutSources=await readBundle((await exportBundle(target,{...stored,sourceBackupPaths:[]})).bytes);
    assert.equal(withoutSources.sourceBackups.length,0,'explicit empty index must not fall back to stale R2 metadata');
  }finally{release?.();target.close();}
});

test('X video image binds to this post; private URL inputs are rejected',()=>{
  const url='https://x.com/insporadesign/status/2102012194057511070';
  const html='<meta property="og:url" content="'+url+'"><meta property="og:image" content="https://pbs.twimg.com/amplify_video_thumb/2102012056719261696/img/test.webp"><meta property="og:description" content="original &amp; exact">';
  const result=extract(html,url);assert.equal(result.coverKind,'video_cover');assert.equal(result.description,'original & exact');
  assert.notEqual(extract(html,url.replace('2102012194057511070','222')).coverKind,'video_cover');
  for(const value of ['http://127.0.0.1','http://2130706433','http://localhost','file:///private','http://service.internal','http://user:pass@example.com'])assert.throws(()=>publicURL(value));
});

test('browser ZIP migration requires owner and same origin; invalid files leave the library empty',async()=>{
  const source=environment(),target=environment();try{
    const state=emptyState();state.content.push({id:'browser-import',title:'Private original',caption:'Original caption',rating:4,sequence:7});
    const {bytes}=await exportBundle(source,state);
    for(const auth of ['anonymous','other'])assert.equal((await call(target,'/api/sync/migrate',{auth,method:'POST',body:bytes})).status,401);
    assert.equal((await worker.fetch(new Request('https://example.com/api/sync/migrate',{method:'POST',headers:{'oai-authenticated-user-id':'user-1','oai-authenticated-user-email':'owner@example.com','origin':'https://evil.example'},body:bytes}),target)).status,403);
    const invalid=await call(target,'/api/sync/migrate',{method:'POST',body:new Uint8Array([1,2,3])});
    assert.equal(invalid.status,400);assert.match((await invalid.json()).message,/有效 ZIP/);
    assert.equal((await load(target)).state.content.length,0);
    const response=await call(target,'/api/sync/migrate',{method:'POST',body:bytes});assert.equal(response.status,201);
    const restored=(await response.json()).state;assert.deepEqual(restored.content,state.content);assert.deepEqual(restored.newsletters,[]);
    assert.equal((await call(target,'/api/sync/migrate',{method:'POST',body:bytes})).status,409);
    assert.deepEqual((await load(target)).state.content,state.content);
  }finally{source.close();target.close();}
});

test('long original captions and notes survive saving, editing, and issue snapshots',async()=>{
  const env=environment();try{
    const caption='原文'.repeat(3600)+'END-CAPTION',body='笔记'.repeat(12000)+'END-NOTES';
    let response=await call(env,'/api/changes',{method:'POST',body:{changes:[{collection:'content',base:null,item:{id:'long',title:'Long',caption,body}}]}});
    assert.equal(response.status,200);let state=await response.json();assert.equal(state.content[0].caption,caption);assert.equal(state.content[0].body,body);
    const base=structuredClone(state.content[0]);response=await call(env,'/api/changes',{method:'POST',body:{changes:[{collection:'content',base,item:{...base,rating:5}}]}});
    assert.equal(response.status,200);state=await response.json();assert.equal(state.content[0].caption,caption);assert.equal(state.content[0].body,body);
    response=await call(env,'/api/newsletters',{method:'POST',body:{itemIds:['long'],title:'Long issue',date:'2026-07-17'}});assert.equal(response.status,201);
    const {newsletter}=await response.json();assert.equal(newsletter.items[0].caption,caption);
    response=await call(env,'/api/cloud/share/'+newsletter.token);assert.equal(response.status,200);assert.equal((await response.json()).url,'https://example.com/share/'+newsletter.token);
    assert.equal((await call(env,'/api/cloud/share/'+newsletter.token,{auth:'anonymous'})).status,401);
    assert.match(await (await call(env,'/share/'+newsletter.token,{auth:'anonymous'})).text(),/END-CAPTION/);
  }finally{env.close();}
});
