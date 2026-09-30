import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const samples=[],out='RECON/map-performance';await fs.mkdir(out,{recursive:true});
// Both orders are measured, with the same content and no sampling profiler attached.
for(const enabled of [false,true,true,false]){
 const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  if(!enabled){
   await page.route('**/app.js*',async route=>{const response=await route.fetch(),body=await response.text();assert.ok(body.includes('createStaticVisibility(scene)'));await route.fulfill({response,body:body.replace('createStaticVisibility(scene)','({update(){},dispose(){},stats:{disabled:true}})')});});
   await page.route('**/pedestrian-occupancy.mjs*',async route=>{await route.fulfill({contentType:'text/javascript',body:`export function createPedestrianOccupancy(){
const cell=.05,grid=new Map(),keys=new WeakMap(),key=p=>Math.floor(p.x/cell)+','+Math.floor(p.z/cell);
return {add(w){const prior=keys.get(w);if(prior!==undefined)grid.get(prior).delete(w);const k=key(w.pos);if(!grid.has(k))grid.set(k,new Set());grid.get(k).add(w);keys.set(w,k);},free(pos,self){const x=Math.floor(pos.x/cell),z=Math.floor(pos.z/cell);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const w of grid.get((x+dx)+','+(z+dz))||[]){if(w===self||Math.abs(pos.y-w.pos.y)>.04)continue;if(Math.hypot(pos.x-w.pos.x,pos.z-w.pos.z)<(w.stationary?.030:.019))return false;}return true;}};}`});});
  }
  const start=Date.now();await page.goto('http://127.0.0.1:5242/');await page.waitForFunction(()=>window.chaoshanAtlas?.getState().ready,null,{timeout:240000});await page.locator('#loading').waitFor({state:'hidden'});
  const loadMs=Date.now()-start,initial=await page.evaluate(()=>window.chaoshanAtlas.getState()),frames=[];
  for(const id of ['nanao-nature-gate','raoping-haishan']){
   await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),initial.places.find(p=>p.id===id).index);await page.waitForTimeout(2500);
   const timing=await page.evaluate(()=>new Promise(resolve=>{const times=[];let previous=performance.now(),start=previous;function tick(now){times.push(now-previous);previous=now;if(now-start<6000)requestAnimationFrame(tick);else{times.sort((a,b)=>a-b);resolve({fps:times.length/((now-start)/1000),p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)]});}}requestAnimationFrame(tick);}));
   frames.push({id,...timing});
  }
  const preserved={places:initial.places.length,homes:initial.tourContext.services.home,premises:initial.tourContext.buildings,plants:initial.tourContext.surroundings.understory,urbanBuildings:initial.life.urbanInfill,people:initial.life.people};
  if(samples.length)assert.deepEqual(preserved,samples[0].preserved);assert.deepEqual(errors,[]);
  const row={enabled,loadMs,frames,startup:initial.startup,preserved,errors};samples.push(row);console.log(JSON.stringify(row));
 }finally{await browser.close();}
}
const average=enabled=>({loadMs:samples.filter(s=>s.enabled===enabled).reduce((n,s)=>n+s.loadMs,0)/2,scenes:Object.fromEntries(['nanao-nature-gate','raoping-haishan'].map(id=>[id,samples.filter(s=>s.enabled===enabled).reduce((n,s)=>n+s.frames.find(f=>f.id===id).fps,0)/2]))});
const report={at:new Date().toISOString(),samples,baseline:average(false),current:average(true)};await fs.writeFile(`${out}/results.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({baseline:report.baseline,current:report.current}));
