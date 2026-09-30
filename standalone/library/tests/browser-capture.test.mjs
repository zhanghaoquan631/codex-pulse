import test from 'node:test';
import assert from 'node:assert/strict';
import {browserCaptureStatus,readRenderedCapture,renderDouyin,collectRenderedPost} from '../worker/browser-capture.js';
import vm from 'node:vm';
import {preview} from '../worker/preview.js';

const url='https://www.douyin.com/video/12345';
const marker='lingan-capture-'+'a'.repeat(32);
const env={CLOUDFLARE_BROWSER_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_BROWSER_API_TOKEN:'secret-for-rendering-only-1234567890'};
const caption='#小丑 完整原文\n'.repeat(300)+'END';
const capture={id:'12345',url,caption,coverUrl:'https://p3-pc-sign.douyinpic.com/poster.jpeg',coverEvidence:'bound_video_poster'};
const markup=(value=capture,key=marker)=>`<script type="application/json" id="${key}">${JSON.stringify(value)}</script>`;

test('DOM collector preserves literal HTML-looking original captions in serialized page output',()=>{
  const original='原文包含 </script> <b>内容</b> 和 < 符号';
  const nodes=new Map();
  const document={querySelector:()=>({querySelector:()=>({getAttribute:()=>capture.coverUrl})}),
    querySelectorAll:()=>[{getBoundingClientRect:()=>({height:20}),innerText:original}],
    documentElement:{},getElementById:id=>nodes.get(id),createElement:()=>({textContent:''}),body:{appendChild:e=>nodes.set(e.id,e)}};
  vm.runInNewContext('('+collectRenderedPost.toString()+')('+JSON.stringify('12345')+','+JSON.stringify(marker)+')',
    {document,location:{href:url},URL,MutationObserver:class {observe(){} disconnect(){}},setTimeout:()=>1,clearTimeout:()=>{}});
  const output=nodes.get(marker);assert.ok(output);assert.ok(!output.textContent.includes('</script>'));
  assert.equal(readRenderedCapture(`<script id="${marker}">${output.textContent}</script>`,marker,url).description,original);
});

test('rendered caption/poster must belong to the exact requested post and cannot use unrelated detail assets',()=>{
  const result=readRenderedCapture(markup(),marker,url);
  assert.equal(result.description,caption);assert.equal(result.coverKind,'video_cover');
  for(const value of [{...capture,id:'999'},{...capture,url:'https://www.douyin.com/video/999'},{...capture,caption:''}])assert.equal(readRenderedCapture(markup(value),marker,url),null);
  assert.equal(readRenderedCapture(markup()+markup(),marker,url),null);
  assert.equal(readRenderedCapture(markup(),marker.replace(/a$/,'b'),url),null);
  for(const coverUrl of ['https://evil.example/a.jpg','https://douyinpic.com.evil.example/a.jpg','http://p3.douyinpic.com/a.jpg','https://p3.douyinpic.com/movie.mp4'])assert.equal(readRenderedCapture(markup({...capture,coverUrl}),marker,url).coverUrl,'');
  const unrelated={...capture,coverEvidence:'unique_detail_asset',coverUrl:'https://p3.douyinpic.com/recommendation.jpg?s=PackSourceEnum_AWEME_DETAIL&sc=cover'};
  assert.equal(readRenderedCapture(markup(unrelated),marker,url).coverUrl,'');
});

test('unconfigured and unsupported targets never spend browser credits',async t=>{
  t.mock.method(globalThis,'fetch',()=>{throw Error('must not fetch');});
  assert.equal(browserCaptureStatus({}).configured,false);
  assert.equal((await renderDouyin({},url)).status,'not_configured');
  for(const target of ['http://127.0.0.1/','https://evil.example/video/12345','https://www.douyin.com@evil.example/video/12345']){
    assert.equal((await renderDouyin(env,target)).status,'unsupported');
  }
});

test('partial rendered caption survives a missing poster without being declared a complete preview',()=>{
  const result=readRenderedCapture(markup({...capture,coverUrl:'',coverEvidence:'missing'}),marker,url);
  assert.equal(result.description,caption);assert.equal(result.coverUrl,'');assert.equal(result.coverKind,'unknown');
});

test('provider call is fixed-origin, bounded, cookie-free and never returns its secret',async t=>{
  t.mock.method(globalThis,'fetch',async (endpoint,options)=>{
    assert.equal(endpoint,'https://api.cloudflare.com/client/v4/accounts/'+'a'.repeat(32)+'/browser-run/content?cacheTTL=0');
    assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,'Bearer '+env.CLOUDFLARE_BROWSER_API_TOKEN);
    const request=JSON.parse(options.body);assert.equal(request.url,url);assert.ok(!request.cookies&&!request.authenticate);
    assert.ok(!options.body.includes(env.CLOUDFLARE_BROWSER_API_TOKEN));
    assert.deepEqual(request.rejectResourceTypes,['media','font']);
    const key=request.addScriptTag[0].content.match(/lingan-capture-[a-f0-9]{32}/)[0];
    return Response.json({success:true,result:markup(capture,key),meta:{finalUrl:url}});
  });
  const result=await renderDouyin(env,url+'?previous_page=app_code_link');
  assert.equal(result.status,'ready');assert.equal(result.capture.description,caption);
  assert.ok(!JSON.stringify(result).includes(env.CLOUDFLARE_BROWSER_API_TOKEN));
});

test('quota, denied access, redirects and provider errors stay explicit and redact provider messages',async t=>{
  for(const [code,status] of [[429,'limited'],[401,'configuration_error'],[403,'configuration_error'],[503,'unavailable']]){
    const mock=t.mock.method(globalThis,'fetch',async()=>new Response(env.CLOUDFLARE_BROWSER_API_TOKEN,{status:code}));
    const result=await renderDouyin(env,url);assert.equal(result.status,status);assert.ok(!JSON.stringify(result).includes(env.CLOUDFLARE_BROWSER_API_TOKEN));mock.mock.restore();
  }
  let mock=t.mock.method(globalThis,'fetch',async()=>Response.json({success:true,result:markup(),meta:{finalUrl:'https://www.douyin.com/video/999'}}));
  assert.equal((await renderDouyin(env,url)).status,'mismatch');mock.mock.restore();
  mock=t.mock.method(globalThis,'fetch',async()=>{throw Error(env.CLOUDFLARE_BROWSER_API_TOKEN);});
  const result=await renderDouyin(env,url);assert.equal(result.status,'unavailable');assert.ok(!JSON.stringify(result).includes(env.CLOUDFLARE_BROWSER_API_TOKEN));
});

test('provider redirects stop after one call without forwarding credentials or exposing Location',async t=>{
  const logs=[];t.mock.method(console,'warn',value=>logs.push(JSON.parse(value)));
  for(const status of [301,302,303,307,308]) {
    let calls=0;
    const mock=t.mock.method(globalThis,'fetch',async(endpoint,options)=>{
      calls++;assert.equal(options.redirect,'manual');
      return new Response('sensitive body',{status,headers:{Location:'https://untrusted.example/'+env.CLOUDFLARE_BROWSER_API_TOKEN}});
    });
    const result=await renderDouyin(env,url);mock.mock.restore();
    assert.equal(calls,1);assert.equal(result.status,'configuration_error');
    assert.equal(logs.at(-1).providerClass,'redirect');
    assert.equal(logs.at(-1).providerHTTPStatus,status);
    assert.ok(!JSON.stringify({result,logs}).includes(env.CLOUDFLARE_BROWSER_API_TOKEN));
    assert.ok(!JSON.stringify({result,logs}).includes('untrusted.example'));
  }
});

test('provider diagnostics classify 6002 without logging secrets, HTML, URLs or nonnumeric error codes',async t=>{
  const logs=[];
  t.mock.method(console,'warn',(...values)=>{assert.equal(values.length,1);logs.push(JSON.parse(values[0]));});
  const sensitive=env.CLOUDFLARE_BROWSER_API_TOKEN+' <html>PRIVATE CONTENT</html> https://private.example/secret';
  for (const [message,expected] of [['Waiting for selector failed: '+sensitive,'selector'],
    ['Navigation timeout: '+sensitive,'navigation'],['Browser timed out: '+sensitive,'timeout']]) {
    const mock=t.mock.method(globalThis,'fetch',async()=>Response.json({success:false,errors:[
      {code:6002,message},{code:'6003',message:sensitive},{code:sensitive,message:sensitive}]},{status:422}));
    const result=await renderDouyin(env,url);mock.mock.restore();
    assert.equal(result.status,'unavailable');
    const entry=logs.at(-1);
    assert.deepEqual(Object.keys(entry).sort(),['elapsedMs','errorCodes','event','exceptionClass','phase','providerClass','providerHTTPStatus'].sort());
    assert.equal(entry.phase,'provider_http');assert.equal(entry.providerHTTPStatus,422);
    assert.equal(entry.providerClass,expected);assert.equal(entry.exceptionClass,'none');
    assert.deepEqual(entry.errorCodes,[6002,6003]);assert.ok(Number.isInteger(entry.elapsedMs)&&entry.elapsedMs>=0);
    for (const forbidden of [sensitive,env.CLOUDFLARE_BROWSER_API_TOKEN,'PRIVATE CONTENT','private.example',url])
      assert.ok(!JSON.stringify({entry,result}).includes(forbidden));
  }
});

test('request exceptions log only allowlisted categories and preserve the existing warning',async t=>{
  const logs=[];t.mock.method(console,'warn',value=>logs.push(JSON.parse(value)));
  const sensitive=env.CLOUDFLARE_BROWSER_API_TOKEN+' <html>private</html> '+url;
  for (const [message,expected] of [['timed out','timeout'],['Redirect disallowed','redirect'],
    ['AbortSignal invalid','signal'],['Invalid header value','header'],['Too many subrequests','subrequest'],
    ['fetch failed','network'],['Unexpected failure','unknown']]) {
    const mock=t.mock.method(globalThis,'fetch',async()=>{throw Error(message+' '+sensitive);});
    const result=await renderDouyin(env,url);mock.mock.restore();
    assert.equal(result.status,'unavailable');assert.equal(result.warning,'云端读取超时或暂时不可用；草稿仍保留，请稍后重试。');
    const entry=logs.at(-1);assert.equal(entry.phase,'request');assert.equal(entry.providerHTTPStatus,null);
    assert.equal(entry.exceptionClass,expected);assert.deepEqual(entry.errorCodes,[]);
    assert.ok(!JSON.stringify({entry,result}).includes(env.CLOUDFLARE_BROWSER_API_TOKEN));
    assert.ok(!JSON.stringify(entry).includes(url));assert.ok(!JSON.stringify(entry).includes('<html>'));
  }
});

test('response parsing and error-body limits produce safe diagnostics without changing HTTP failure classification',async t=>{
  const logs=[];t.mock.method(console,'warn',value=>logs.push(JSON.parse(value)));
  let mock=t.mock.method(globalThis,'fetch',async()=>new Response('<html>'+env.CLOUDFLARE_BROWSER_API_TOKEN+'</html>'));
  assert.equal((await renderDouyin(env,url)).status,'unavailable');mock.mock.restore();
  assert.equal(logs.at(-1).phase,'response_json');assert.equal(logs.at(-1).exceptionClass,'json_parse');
  mock=t.mock.method(globalThis,'fetch',async()=>new Response('not read',{status:422,headers:{'Content-Length':'65537'}}));
  assert.equal((await renderDouyin(env,url)).status,'unavailable');mock.mock.restore();
  assert.equal(logs.at(-1).phase,'provider_http');assert.equal(logs.at(-1).exceptionClass,'response_size');
  assert.equal(logs.at(-1).providerHTTPStatus,422);
  mock=t.mock.method(globalThis,'fetch',async()=>Response.json({success:false,errors:[{code:6002,message:'Action timeout '+env.CLOUDFLARE_BROWSER_API_TOKEN}]}));
  assert.equal((await renderDouyin(env,url)).status,'unavailable');mock.mock.restore();
  assert.equal(logs.at(-1).phase,'provider_result');assert.equal(logs.at(-1).providerClass,'timeout');
  assert.deepEqual(logs.at(-1).errorCodes,[6002]);assert.ok(!JSON.stringify(logs).includes(env.CLOUDFLARE_BROWSER_API_TOKEN));
});

test('overlapping requests for the same video share one browser call',async t=>{
  let release, calls=0;
  const gate=new Promise(resolve=>{release=resolve;});
  t.mock.method(globalThis,'fetch',async()=>{calls++;await gate;return Response.json({success:false});});
  const a=renderDouyin(env,url),b=renderDouyin(env,url);release();
  await Promise.all([a,b]);assert.equal(calls,1);
});

test('ordinary incomplete preview can use cloud browser then back up actual image bytes without leaking credentials',async t=>{
  const objects=new Map(),png=new Uint8Array([137,80,78,71,13,10,26,10,1,2,3]);
  const storage={...env,BUCKET:{async head(key){return objects.get(key)||null;},async put(key,bytes,options){objects.set(key,{bytes,...options});}}};
  const calls=[];
  t.mock.method(globalThis,'fetch',async (endpoint,options)=>{
    const address=String(endpoint);calls.push(address);
    if(address===url)return new Response('<html><body></body></html>',{headers:{'Content-Type':'text/html'}});
    if(address.startsWith('https://api.cloudflare.com/')){
      const key=JSON.parse(options.body).addScriptTag[0].content.match(/lingan-capture-[a-f0-9]{32}/)[0];
      return Response.json({success:true,result:markup(capture,key),meta:{finalUrl:url}});
    }
    assert.equal(address,capture.coverUrl);assert.equal(options.headers.Authorization,undefined);
    return new Response(png,{headers:{'Content-Type':'image/png'}});
  });
  const result=await preview(storage,url);
  assert.equal(result.previewStatus,'ready');assert.equal(result.description,caption);
  assert.equal(result.metadataSource,'cloud_browser_dom');assert.equal(result.coverStorage,'local');
  assert.match(result.coverUrl,/^\/api\/files\/[a-f0-9]{32}$/);assert.equal(objects.size,1);assert.equal(calls.length,4);
  const stored=[...objects.values()][0];assert.deepEqual(stored.bytes,png);
  assert.ok(!JSON.stringify(result).includes(env.CLOUDFLARE_BROWSER_API_TOKEN));
});

test('GET preview mode cannot start paid browser work',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async(endpoint)=>{calls++;assert.equal(String(endpoint),url);return new Response('<html></html>');});
  const result=await preview(env,url,{allowBrowser:false});assert.equal(result.previewStatus,'incomplete');assert.equal(calls,1);
});

test('a short link resolved to a blocked video still reaches the cloud browser, and bound structured cover merges with DOM caption',async t=>{
  let browserCalls=0;
  t.mock.method(globalThis,'fetch',async(endpoint,options)=>{
    const address=String(endpoint);
    if(address==='https://v.douyin.com/example/')return new Response(null,{status:302,headers:{Location:url}});
    if(address===url)return new Response('denied',{status:403});
    if(address.startsWith('https://api.cloudflare.com/')){
      browserCalls++;
      const key=JSON.parse(options.body).addScriptTag[0].content.match(/lingan-capture-[a-f0-9]{32}/)[0];
      const structured={'@type':'VideoObject',url,thumbnailUrl:capture.coverUrl};
      return Response.json({success:true,result:markup({...capture,coverUrl:'',coverEvidence:'missing'},key)+'<script type="application/ld+json">'+JSON.stringify(structured)+'</script>',meta:{finalUrl:url}});
    }
    assert.equal(address,capture.coverUrl);return new Response(null,{status:403});
  });
  const result=await preview(env,'https://v.douyin.com/example/');
  assert.equal(browserCalls,1);assert.equal(result.url,url);assert.equal(result.previewStatus,'ready');
  assert.equal(result.coverUrl,capture.coverUrl);assert.equal(result.description,caption);
  assert.equal(result.coverKind,'video_cover');assert.equal(result.metadataSource,'cloud_browser_jsonld_video');
});
