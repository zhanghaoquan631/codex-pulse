import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,devices} from 'playwright';
import {PNG} from 'pngjs';

const targets=[
 {name:'chaoshan',url:process.argv[2]||'https://chaoshan-3d-map.wozhe0196.chatgpt.site/',api:'chaoshanAtlas'},
 {name:'xiamen',url:process.argv[3]||'https://xiamen-3d-map.wozhe0196.chatgpt.site/',api:'xiamenAtlas'},
];
const out='qa/phone-access',report={profile:'Pixel 7 browser emulation, new unauthenticated contexts',sites:[]};
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const localHost=host=>host==='localhost'||host==='::1'||host==='[::1]'||host==='0.0.0.0'||/^127\./.test(host)||host.endsWith('.localhost');
try{
 for(const target of targets){
  const context=await browser.newContext({...devices['Pixel 7']});
  const result={name:target.name,url:target.url,initialCookies:(await context.cookies()).length,localRequests:[],insecureRequests:[],credentialHeaders:false,errors:[],failedRequests:[],assets:[]};
  report.sites.push(result);
  assert.equal(result.initialCookies,0);
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(localHost(url.hostname)){result.localRequests.push(url.origin);await route.abort();return;}
   if(['http:','ws:'].includes(url.protocol))result.insecureRequests.push(url.origin);
   if(request.headers().authorization)result.credentialHeaders=true;
   await route.continue();
  });
  const page=await context.newPage();page.setDefaultTimeout(30000);
  page.on('pageerror',error=>result.errors.push(error.message));
  page.on('requestfailed',request=>result.failedRequests.push({url:request.url(),reason:request.failure()?.errorText}));
  page.on('response',response=>{if(response.url().includes('/data/')||response.url().includes('/assets/'))result.assets.push({path:new URL(response.url()).pathname,status:response.status()});});
  page.on('websocket',socket=>{const url=new URL(socket.url());if(localHost(url.hostname))result.localRequests.push(url.origin);});
  const start=Date.now(),response=await page.goto(target.url,{waitUntil:'domcontentloaded',timeout:120000});
  assert.equal(response.status(),200,'anonymous entry returns 200');
  console.log(JSON.stringify({name:target.name,phase:'anonymous HTTP entry',status:response.status()}));
  await page.waitForFunction(api=>window[api]?.getState().ready,target.api,{timeout:180000});
  await page.waitForTimeout(2500);
  result.readyMs=Date.now()-start;result.finalUrl=page.url();
  assert.equal(new URL(page.url()).origin,new URL(target.url).origin,'entry cannot redirect to an account sign-in');
  result.state=await page.evaluate(api=>{const s=window[api].getState();return {ready:s.ready,buildingRecords:s.buildings+(api==='xiamenAtlas'?(window.xiamenCoverage?.().records||0):0),touring:s.touring,locationEnabled:s.travel?.location.enabled};},target.api);
  assert.ok(result.state.buildingRecords>0,'mapped building records exist beyond legacy box meshes');
  console.log(JSON.stringify({name:target.name,phase:'map ready',readyMs:result.readyMs,buildingRecords:result.state.buildingRecords}));
  const png=PNG.sync.read(await page.locator('#viewport canvas').screenshot()),colors=new Set();
  for(let i=0;i<png.data.length;i+=40)colors.add(`${png.data[i]>>3},${png.data[i+1]>>3},${png.data[i+2]>>3}`);
  result.colors=colors.size;assert.ok(result.colors>100,'mobile canvas renders actual map content');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),devices['Pixel 7'].viewport.width,'mobile layout does not overflow');
  await page.click('#tour');
  await page.waitForFunction(api=>window[api].getState().touring,target.api,{timeout:30000});
  await page.click('#tour');assert.equal(await page.evaluate(api=>window[api].getState().touring,target.api),false,'tour works without an account');
  await page.screenshot({path:out+'/'+target.name+'.png'});
  assert.deepEqual(result.localRequests,[],'no dependency on local computer');
  assert.deepEqual(result.insecureRequests,[],'secure HTTPS entry and dependencies');
  assert.equal(result.credentialHeaders,false,'no credential supplied to obtain access');
  assert.deepEqual(result.errors,[]);
  assert.deepEqual(result.failedRequests,[],'required assets remain available publicly');
  assert.ok(result.assets.length>3);
  assert.ok(result.assets.every(asset=>asset.status>=200&&asset.status<400),'public asset requests succeed');
  result.passed=true;await context.close();
  console.log(JSON.stringify({name:result.name,passed:true,readyMs:result.readyMs,assets:result.assets.length,localRequests:result.localRequests.length,authenticated:false}));
 }
 report.passed=true;
}finally{
 await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();
}
