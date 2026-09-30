import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
const out='RECON/population';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});
 await page.route('**/app.js*',async route=>{const response=await route.fetch(),source=await response.text();await route.fulfill({response,body:source+'\nwindow.__populationAudit=()=>({roads:traffic.routeCoverage,walks:regionalLife.routeCoverage,local:tourContext.populationDiagnostics(),urban:urbanEnvironment.corridorCoverage,gardens:urbanEnvironment.gardens,plantings:urbanEnvironment.plantings,places:places.map(p=>({id:p.id,name:p.name,x:p.x,z:p.z,kind:p.kind,span:p.span}))});'});});
 page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE_ERROR',e.stack);});
 const started=Date.now();await page.goto('http://127.0.0.1:5242/');await page.waitForFunction(()=>window.chaoshanAtlas?.getState().ready,null,{timeout:300000});await page.locator('#loading').waitFor({state:'hidden',timeout:300000});
 const loadMs=Date.now()-started,state=await page.evaluate(()=>window.chaoshanAtlas.getState()),coverage=await page.evaluate(()=>window.__populationAudit());
 console.log(JSON.stringify({loadMs:Date.now()-started,people:state.life.people,cars:state.life.vehicles,localPeople:state.tourContext.population.people,localCars:state.tourContext.population.vehicles,urban:state.environment.urbanArchitecture.total}));
 assert.ok(coverage.roads.every(r=>r.cars>0));assert.ok(coverage.local.roads.every(r=>r.cars>0));
 const samples=[];await page.evaluate(()=>window.chaoshanAtlas.setTime('day'));
 const entries=[...state.places.filter(p=>p.kind==='district').map((p,i)=>[p.name,'district-'+i]),['普宁市','puning-city'],['nanao-nature-gate','nature-gate'],['raoping-haishan','haishan'],['huilai-lighthouse','huilai']];
 for(const entry of entries){
  const p=state.places.find(p=>p.id===entry[0]||p.name===entry[0]);assert.ok(p,entry[0]);await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),p.index);await page.waitForTimeout(2300);
  const png=PNG.sync.read(await page.locator('#viewport canvas').screenshot());const colors=new Set();for(let i=0;i<png.data.length;i+=64)colors.add(png.data.slice(i,i+3).join(','));assert.ok(colors.size>500);await page.screenshot({path:out+'/'+entry[1]+'.png'});
  const fps=await page.evaluate(()=>new Promise(resolve=>{let start=performance.now(),frames=0;const tick=t=>{frames++;if(t-start>2500)resolve(frames*1000/(t-start));else requestAnimationFrame(tick);};requestAnimationFrame(tick);}));
  const after=PNG.sync.read(await page.locator('#viewport canvas').screenshot());let changed=0;for(let i=0;i<after.data.length;i+=4)if(Math.abs(after.data[i]-png.data[i])+Math.abs(after.data[i+1]-png.data[i+1])+Math.abs(after.data[i+2]-png.data[i+2])>20)changed++;
  assert.ok(changed>50,'scene must animate: '+p.name);samples.push({id:p.id||p.name,fps,changedPixels:changed,render:(await page.evaluate(()=>window.chaoshanAtlas.getState())).render});console.log('VIEW',entry[1],fps.toFixed(1));
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),state.places.find(p=>p.id==='nanao-nature-gate').index);await page.waitForTimeout(2000);await page.screenshot({path:out+'/mobile.png'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const gaps=coverage.walks.filter(r=>!r.people),localGaps=coverage.local.walkways.filter(r=>!r.people);
 await fs.writeFile(out+'/coverage.json',JSON.stringify(coverage));await fs.writeFile(out+'/results.json',JSON.stringify({loadMs,startup:state.startup,people:state.life.people,vehicles:state.life.vehicles,localPeople:state.tourContext.people,localVehicles:state.tourContext.vehicles,roadCount:coverage.roads.length,walks:coverage.walks.length,walkGaps:gaps.length,localWalkGaps:localGaps.length,gardens:coverage.gardens,plantings:coverage.plantings,urban:state.environment.urbanArchitecture,samples,errors},null,2));assert.deepEqual(errors,[]);console.log('PASS rendered population audit');
}finally{await browser.close();}
