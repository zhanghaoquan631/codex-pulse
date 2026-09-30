import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const samples=[];
// Reverse the second pair to reduce warm-cache/order bias without changing the live map.
for(const enabled of [false,true,true,false]){
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/service-life.mjs*',async route=>{
   const response=await route.fetch(),body=await response.text();
   assert.ok(body.includes('export function chooseServiceResidents('));
   await route.fulfill({response,body:enabled?body:body.replace('const choices=parcels.filter','return [];const choices=parcels.filter')});
  });
  const start=Date.now();await page.goto('http://127.0.0.1:5242/');
  await page.waitForFunction(()=>window.chaoshanAtlas?.getState().ready,null,{timeout:240000});
  await page.locator('#loading').waitFor({state:'hidden'});
  const loadMs=Date.now()-start,state=await page.evaluate(()=>window.chaoshanAtlas.getState());
  await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),state.places.find(p=>p.id==='nanao-nature-gate').index);
  await page.waitForTimeout(3000);
  const frames=await page.evaluate(()=>new Promise(resolve=>{
   const times=[];let previous=performance.now(),start=previous;
   function tick(now){times.push(now-previous);previous=now;if(now-start<6000)requestAnimationFrame(tick);else{
    times.sort((a,b)=>a-b);resolve({count:times.length,p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],fps:times.length/((now-start)/1000)});
   }}requestAnimationFrame(tick);
  }));
  const residents=await page.evaluate(async()=>(await import('/community-actors.mjs')).communityActors.filter(a=>a.root.userData.serviceResident).length);
  assert.equal(residents>0,enabled);assert.deepEqual(errors,[]);
  const row={enabled,loadMs,residents,frames,startup:state.startup,errors};samples.push(row);console.log(JSON.stringify(row));
 }finally{await browser.close();}
}
const average=enabled=>{
 const rows=samples.filter(s=>s.enabled===enabled);
 return {loadMs:rows.reduce((n,s)=>n+s.loadMs,0)/rows.length,fps:rows.reduce((n,s)=>n+s.frames.fps,0)/rows.length};
};
const report={at:new Date().toISOString(),samples,baseline:average(false),current:average(true)};
await fs.mkdir('RECON/service-life',{recursive:true});
await fs.writeFile('RECON/service-life/performance.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({baseline:report.baseline,current:report.current}));
