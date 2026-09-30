import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fetchPublicEmbed} from '../worker/douyin-embed.js';
import {collectEmbeddedPost,readEmbeddedCapture,renderDouyin} from '../worker/browser-capture.js';
import {preview} from '../worker/preview.js';
const id='12345',url='https://www.douyin.com/video/'+id,playerUrl='https://open.douyin.com/player/video?vid='+id+'&autoplay=0';
const caption='#小丑  #希斯莱杰\n原始文案';
const embed={caption,playerUrl};
const marker='lingan-capture-'+'a'.repeat(32);
const coverUrl='https://p3-pc-sign.douyinpic.com/actual-poster.jpeg';
const bound={id,url:playerUrl,coverUrl,coverEvidence:'bound_embed_poster'};
const markup=(value=bound,key=marker)=>`<script id="${key}">${JSON.stringify(value)}</script>`;
const env={CLOUDFLARE_BROWSER_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_BROWSER_API_TOKEN:'secret-for-rendering-only-1234567890'};
const payload=(src=playerUrl)=>({err_no:0,data:{video_title:caption,iframe_code:`<iframe src="${src.replaceAll('&','&amp;')}"></iframe>`}});

test('official public caption API keeps exact spaces and newline and accepts only its matching player',async t=>{
  let calls=0;
  t.mock.method(globalThis,'fetch',async(endpoint,options)=>{
    calls++;assert.equal(endpoint,'https://open.douyin.com/api/douyin/v1/video/get_iframe_by_video?video_id='+id);
    assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,undefined);
    return Response.json(payload());
  });
  assert.deepEqual(await fetchPublicEmbed(id),embed);assert.equal(await fetchPublicEmbed('../private'),null);assert.equal(calls,1);
});

test('private videos, mismatched ids, duplicate frames, external players and redirected APIs fail closed',async t=>{
  for(const value of [{...payload(),err_no:28003004},payload(playerUrl.replace(id,'999')),
    payload('https://evil.example/player/video?vid='+id),{err_no:0,data:{...payload().data,iframe_code:payload().data.iframe_code.repeat(2)}}]) {
    const mock=t.mock.method(globalThis,'fetch',async()=>Response.json(value));
    assert.equal(await fetchPublicEmbed(id),null);mock.mock.restore();
  }
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response(null,{status:302,headers:{Location:'https://evil.example'}});});
  assert.equal(await fetchPublicEmbed(id),null);assert.equal(calls,1);
});

test('embedded DOM collector selects only the scoped player poster and rejects unrelated or ambiguous images',()=>{
  function run({page=playerUrl,playerCount=1,posters=[{style:{backgroundImage:'url("//p3-pc-sign.douyinpic.com/actual-poster.jpeg")'}}]}={}) {
    const nodes=new Map();
    const player={querySelectorAll:selector=>{assert.equal(selector,':scope > xg-video-container > xg-poster');return posters;}};
    const document={documentElement:{},querySelectorAll:selector=>{assert.equal(selector,'.video-container');return Array(playerCount).fill(player);},
      createElement:()=>({textContent:''}),body:{appendChild:e=>nodes.set(e.id,e)}};
    vm.runInNewContext('('+collectEmbeddedPost.toString()+')('+JSON.stringify(id)+','+JSON.stringify(marker)+')',
      {document,location:{href:page},URL,MutationObserver:class {observe(){} disconnect(){}},setTimeout:()=>1,clearTimeout(){}});
    return nodes.get(marker);
  }
  assert.deepEqual(JSON.parse(run().textContent),bound);
  assert.equal(run({posters:[]}),undefined);assert.equal(run({playerCount:2}),undefined);
  assert.equal(run({page:playerUrl.replace(id,'999')}),undefined);
  assert.equal(run({posters:[{style:{backgroundImage:'url(https://evil.example/cover.jpg)'}}]}),undefined);
});

test('embedded poster requires exact video binding, one unpredictable marker and trusted image host',()=>{
  assert.equal(readEmbeddedCapture(markup(),marker,{id,url},embed).description,caption);
  for(const value of [{...bound,id:'999'},{...bound,url:playerUrl.replace(id,'999')},{...bound,coverEvidence:'recommendation'},
    {...bound,coverUrl:'https://evil.example/cover.jpg'},{...bound,coverUrl:'https://p3.douyinpic.com/movie.mp4'}])
    assert.equal(readEmbeddedCapture(markup(value),marker,{id,url},embed),null);
  assert.equal(readEmbeddedCapture(markup()+markup(),marker,{id,url},embed),null);
});

test('official title survives unavailable browser service without being declared complete',async t=>{
  t.mock.method(globalThis,'fetch',async endpoint=>String(endpoint)===url?new Response('<html></html>'):Response.json(payload()));
  const result=await preview({},url);
  assert.equal(result.description,caption);assert.equal(result.previewStatus,'incomplete');assert.equal(result.metadataSource,'douyin_official_title');
});

test('official embed flow returns caption and bound poster, persists real image bytes and sends no caption or secret to publisher',async t=>{
  const objects=new Map(),png=new Uint8Array([137,80,78,71,13,10,26,10,1,2,3]);
  const storage={...env,BUCKET:{async head(key){return objects.get(key)||null;},async put(key,bytes,options){objects.set(key,{bytes,...options});}}};
  t.mock.method(globalThis,'fetch',async(endpoint,options)=>{
    const address=String(endpoint);
    if(address===url)return new Response('<html></html>');
    if(address.startsWith('https://open.douyin.com/api/')) {assert.equal(options.headers.Authorization,undefined);return Response.json(payload());}
    if(address.startsWith('https://api.cloudflare.com/')) {
      const request=JSON.parse(options.body);assert.equal(request.url,playerUrl);assert.ok(!options.body.includes(caption));
      const key=request.addScriptTag[0].content.match(/lingan-capture-[a-f0-9]{32}/)[0];
      return Response.json({success:true,result:markup(bound,key),meta:{finalUrl:playerUrl}});
    }
    assert.equal(address,coverUrl);assert.equal(options.headers.Authorization,undefined);
    return new Response(png,{headers:{'Content-Type':'image/png'}});
  });
  const result=await preview(storage,url);
  assert.equal(result.previewStatus,'ready');assert.equal(result.description,caption);assert.equal(result.coverKind,'video_cover');
  assert.equal(result.metadataSource,'douyin_official_embed');assert.equal(result.coverStorage,'local');
  assert.deepEqual([...objects.values()][0].bytes,png);assert.ok(!JSON.stringify(result).includes(env.CLOUDFLARE_BROWSER_API_TOKEN));
});

test('embedded browser rejects final redirect to another video even with a valid marker',async t=>{
  t.mock.method(globalThis,'fetch',async(endpoint,options)=>{
    const key=JSON.parse(options.body).addScriptTag[0].content.match(/lingan-capture-[a-f0-9]{32}/)[0];
    return Response.json({success:true,result:markup(bound,key),meta:{finalUrl:playerUrl.replace(id,'999')}});
  });
  assert.equal((await renderDouyin(env,url,embed)).status,'mismatch');
});
