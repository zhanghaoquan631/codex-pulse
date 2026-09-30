import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import {gardenStops} from '../garden-detail.mjs';
import {prepareWaterContains} from '../water-query.mjs';

const detail=JSON.parse(await readFile('public/data/garden-detail.json','utf8')),campus=JSON.parse(await readFile('public/data/campus-detail.json','utf8'));
const stops=gardenStops(detail),lake=stops.find(p=>p.name==='万石湖');
assert.equal(detail.bounds[3],campus.bounds[1]);assert.equal(stops.length,14);
assert.ok(detail.paths.length>90&&detail.buildings.length>15);assert.ok(detail.paths.some(p=>p.kind==='steps'));assert.ok(detail.paths.some(p=>p.bridge));
assert.ok(detail.water.some(w=>prepareWaterContains(w.rings)(...lake.point)));
assert.ok(detail.water.every(w=>Number.isFinite(w.height)&&w.heightSource));
const out='qa/garden-detail',report={},errors=[];await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const start=Date.now();await page.goto('http://127.0.0.1:5243/');await page.waitForFunction(()=>window.xiamenAtlas?.getState().ready,null,{timeout:90000});report.readyMs=Date.now()-start;
 report.initial=await page.evaluate(()=>window.xiamenAtlas.getState().world.garden);
 assert.ok(report.initial.people>100&&report.initial.trees>1500);for(const type of ['palm','bamboo','succulent','rainforest','flowers','araucaria','ginger'])assert.ok(report.initial.types[type]>20,type);
 assert.ok(report.initial.understory>100&&report.initial.fixtures>20);assert.ok(report.initial.bridges>0&&report.initial.stairs>0);
 async function capture(name){const png=PNG.sync.read(await page.locator('#viewport canvas').screenshot()),colors=new Set();for(let i=0;i<png.data.length;i+=28)colors.add(`${png.data[i]>>3},${png.data[i+1]>>3},${png.data[i+2]>>3}`);assert.ok(colors.size>100,'Nonblank canvas');await page.screenshot({path:out+'/'+name+'.png'});return colors.size;}
 async function checkLabels(){
  const collisions=await page.evaluate(()=>{
   const boxes=[...document.querySelectorAll('.brand,.top-actions,.scene-settings,.sky-options,.explore,.location-card,.bottom-center,.map-controls,.travel-launch,.travel-drawer,footer')].map(el=>el.getBoundingClientRect()).filter(r=>r.width&&r.height);
   return [...document.querySelectorAll('.garden-label:not([hidden])')].filter(el=>{const r=el.getBoundingClientRect();return boxes.some(o=>r.left<o.right&&r.right>o.left&&r.top<o.bottom&&r.bottom>o.top);}).map(el=>el.textContent);
  });assert.deepEqual(collisions,[],'Garden names must stay clear of controls');
 }
 await page.locator('#district').selectOption('6');await page.waitForTimeout(1800);await capture('overview');
 assert.equal(await page.locator('#garden-stops option').count(),15);report.visits=[];
 for(const [i,stop] of stops.entries()){
  await page.locator('#garden-stops').selectOption(stop.name);await page.waitForTimeout(1300);assert.equal(await page.locator('#location-card h2').innerText(),stop.name);
  const colors=await capture('stop-'+i);await checkLabels();await page.locator('.detail-open').click();assert.equal(await page.locator('.detail-dialog[open] h2').innerText(),stop.name);assert.match(await page.locator('.detail-dialog[open] .intro').innerText(),new RegExp(stop.description.slice(0,4)));await page.locator('.detail-dialog[open] .dialog-top button').click();
  report.visits.push({name:stop.name,colors});
 }
 const moving=await page.evaluate(()=>window.xiamenAtlas.getState().world.garden);assert.notDeepEqual(moving.motion,report.initial.motion);assert.equal(moving.overlaps,0);assert.equal(moving.invalidPeople,0);
 await page.locator('#scene-pause').click();const paused=await page.evaluate(()=>window.xiamenAtlas.getState().world.garden.seconds);await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>window.xiamenAtlas.getState().world.garden.seconds),paused);await page.locator('#scene-pause').click();
 await page.locator('#garden-stops').selectOption('雨林世界');await page.waitForTimeout(1200);await page.locator('[data-time-choice="night"]').click();await page.waitForFunction(()=>!window.xiamenAtlas.getState().sky.transitioning);await capture('night');
 await page.locator('[data-time-choice="day"]').click();await page.waitForFunction(()=>!window.xiamenAtlas.getState().sky.transitioning);
 for(const [width,height] of [[390,844],[320,740],[844,390]]){
  await page.setViewportSize({width,height});for(const stop of ['雨林世界','多肉植物区','万石湖']){await page.locator('#garden-stops').selectOption(stop);await page.waitForTimeout(1300);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);const box=await page.locator('#garden-stops').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width&&box.y+box.height<=height);await capture('mobile-'+width+'-'+stops.findIndex(p=>p.name===stop));await checkLabels();}
 }
 await page.setViewportSize({width:1440,height:960});await page.locator('#district').selectOption('0');assert.equal(await page.locator('#garden-stops').isVisible(),false);await page.waitForTimeout(1200);assert.equal(await page.locator('.garden-label:visible').count(),0);
 report.final=await page.evaluate(()=>window.xiamenAtlas.getState().world);assert.equal(report.final.scenes.length,12);assert.equal(report.final.invalidPeople,0);assert.equal(report.final.overlaps,0);assert.ok(report.final.island.paths>400&&report.final.campus.buildings>180);assert.equal(errors.length,0);
}finally{report.errors=errors;await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({readyMs:report.readyMs,garden:report.initial,visits:report.visits,errors},null,2));await browser.close();}
