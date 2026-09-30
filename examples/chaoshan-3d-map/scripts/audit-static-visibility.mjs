import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='RECON/static-visibility';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[],samples=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/app.js*',async route=>{
  const response=await route.fetch(),body=await response.text(),marker='// Read-only state for non-browser functional checks and diagnostics.';assert.ok(body.includes(marker));
  await route.fulfill({response,body:body.replace(marker,`window.staticAudit={toggle(enabled){if(!enabled){staticVisibility?.dispose();staticVisibility=null;}else if(!staticVisibility)staticVisibility=createStaticVisibility(scene);},raster(){camera.updateMatrixWorld();frameSun();staticVisibility?.update(camera,[sun]);renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png');}};\n`+marker)});
 });
 const start=Date.now();await page.goto('http://127.0.0.1:5242/');await page.waitForFunction(()=>window.chaoshanAtlas?.getState().ready,null,{timeout:240000});await page.locator('#loading').waitFor({state:'hidden'});
 const initial=await page.evaluate(()=>window.chaoshanAtlas.getState());console.log(JSON.stringify({loadMs:Date.now()-start,startup:initial.startup}));
 for(const id of ['nanao-nature-gate','huilai-lighthouse','raoping-haishan','chaoan-fenghuang','jiexi-falls','small-park']){
  const p=initial.places.find(p=>p.id===id);assert.ok(p,id);await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),p.index);await page.waitForTimeout(150);
  for(const mode of ['day','night']){
   await page.evaluate(m=>window.chaoshanAtlas.setTime(m),mode);await page.evaluate(()=>window.staticAudit.toggle(false));
   const before=PNG.sync.read(Buffer.from((await page.evaluate(()=>window.staticAudit.raster())).split(',')[1],'base64'));
   await page.evaluate(()=>window.staticAudit.toggle(true));const buffer=Buffer.from((await page.evaluate(()=>window.staticAudit.raster())).split(',')[1],'base64'),after=PNG.sync.read(buffer);
   let changed=0,maxDelta=0;for(let i=0;i<before.data.length;i+=4){const d=Math.abs(before.data[i]-after.data[i])+Math.abs(before.data[i+1]-after.data[i+1])+Math.abs(before.data[i+2]-after.data[i+2]);maxDelta=Math.max(maxDelta,d);if(d>12)changed++;}
   const visibility=(await page.evaluate(()=>window.chaoshanAtlas.getState())).staticVisibility;const result={id,mode,changed,maxDelta,visibility};samples.push(result);console.log(JSON.stringify(result));
   await fs.writeFile(`${out}/${id}-${mode}.png`,buffer);assert.ok(changed<before.width*before.height*.0001,'culling must not remove visible scenery or shadows');
  }
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),initial.places.find(p=>p.id==='nanao-nature-gate').index);await page.waitForTimeout(400);await page.screenshot({path:`${out}/mobile.png`});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 const report={pass:true,startup:initial.startup,samples,errors};await fs.writeFile(`${out}/results.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({pass:true,samples:samples.length,errors}));
}finally{await browser.close();}
