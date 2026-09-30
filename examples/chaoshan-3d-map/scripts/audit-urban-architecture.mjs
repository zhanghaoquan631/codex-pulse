import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='RECON/urban-architecture';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[],samples=[];
function changed(a,b){let n=0;for(let i=0;i<a.data.length;i+=4)if(Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+Math.abs(a.data[i+2]-b.data[i+2])>30)n++;return n;}
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:5242/scripts/urban-architecture-fixture.html');await page.waitForFunction(()=>window.urbanAudit?.ready);
 for(const rear of [false,true]){
  await page.evaluate(v=>window.urbanAudit.view(v),rear);assert.equal(await page.evaluate(()=>window.urbanAudit.framed()),true);
  const decorated=PNG.sync.read(await page.screenshot({path:`${out}/${rear?'rear':'front'}.png`}));
  await page.evaluate(()=>window.urbanAudit.plain(true));const plain=PNG.sync.read(await page.screenshot());await page.evaluate(()=>window.urbanAudit.plain(false));
  const pixels=changed(decorated,plain);assert.ok(pixels>2000,'facades must draw actual visible windows');samples.push({rear,facadePixels:pixels});
 }
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>window.urbanAudit.framed()),true);
 const mobile=PNG.sync.read(await page.screenshot({path:`${out}/mobile.png`})),colors=new Set();for(let i=0;i<mobile.data.length;i+=4)colors.add(mobile.data.subarray(i,i+3).toString('hex'));assert.ok(colors.size>500);
 if(!process.argv.includes('--fixture-only')){
  await page.setViewportSize({width:1440,height:1000});const start=Date.now();await page.goto('http://127.0.0.1:5242/');await page.waitForFunction(()=>window.chaoshanAtlas?.getState().ready,null,{timeout:240000});await page.locator('#loading').waitFor({state:'hidden'});
  const state=await page.evaluate(()=>window.chaoshanAtlas.getState()),architecture=state.environment.urbanArchitecture;
  assert.equal(architecture.total,state.life.urbanInfill);assert.ok(Object.values(architecture.counts).every(n=>n>0));assert.ok(architecture.detailTriangles<architecture.total*72);
  const scenes=[];for(const id of ['small-park','nanao-nature-gate','huilai-lighthouse','raoping-haishan','jieyang-jinxian']){
   const place=state.places.find(p=>p.id===id);assert.ok(place,id);await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),place.index);await page.waitForTimeout(2500);
   await page.screenshot({path:`${out}/map-${id}.png`,timeout:60000});scenes.push(id);
  }
  samples.push({architecture,elapsedMs:Date.now()-start,scenes});
 }
 assert.deepEqual(errors,[]);const result={pass:true,samples,mobileColors:colors.size,errors};await fs.writeFile(`${out}/results.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
