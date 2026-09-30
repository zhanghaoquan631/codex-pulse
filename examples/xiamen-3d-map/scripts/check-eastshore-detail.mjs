import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import {eastshoreLocations} from '../eastshore-detail.mjs';
import {prepareWaterContains} from '../water-query.mjs';

const detail=JSON.parse(await readFile('public/data/eastshore-detail.json','utf8'));
assert.ok(detail.buildings.length>80&&detail.paths.length>500);
assert.ok(detail.paths.filter(p=>p.kind==='steps').length>=10);
assert.ok(detail.covers.filter(c=>c.kind==='beach').length>=7);
assert.ok(eastshoreLocations.village[0]<118.122,'Village anchor must not use the old road intersection');
const meta=JSON.parse(await readFile('public/data/xiamen.json','utf8')).meta;
const beach=[(eastshoreLocations.beach[0]-meta.origin[0])*meta.sx,(meta.origin[1]-eastshoreLocations.beach[1])*meta.sz];
assert.ok(detail.covers.some(c=>c.kind==='beach'&&prepareWaterContains(c.rings)(...beach)),'Beach view targets mapped sand, not the bus stop');
assert.ok(!detail.water.some(w=>prepareWaterContains(w.rings)(...beach)));
const out='qa/eastshore-detail',report={},errors=[];
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const start=Date.now();await page.goto('http://127.0.0.1:5243/');await page.waitForFunction(()=>window.xiamenAtlas?.getState().ready,null,{timeout:90000});report.readyMs=Date.now()-start;
 report.initial=await page.evaluate(()=>window.xiamenAtlas.getState().world.eastshore);
 assert.ok(report.initial,'Eastshore module is connected');
 assert.ok(report.initial.people>100&&report.initial.trees>500&&report.initial.illustrativeBuildings>50);
 assert.ok(report.initial.cars>0&&report.initial.stairs>0&&report.initial.bridgeSegments>0);
 async function capture(name){
  const png=PNG.sync.read(await page.locator('#viewport canvas').screenshot()),colors=new Set();
  for(let i=0;i<png.data.length;i+=28)colors.add(`${png.data[i]>>3},${png.data[i+1]>>3},${png.data[i+2]>>3}`);
  assert.ok(colors.size>100,'Nonblank canvas');await page.screenshot({path:out+'/'+name+'.png'});return colors.size;
 }
 report.visits=[];
 for(const id of [7,8,9]){
  await page.locator('#district').selectOption(String(id));await page.waitForTimeout(1800);
  report.visits.push({id,colors:await capture('place-'+id),name:await page.locator('#location-card h2').innerText()});
  await page.locator('.detail-open').click();assert.ok(await page.locator('.detail-dialog[open] .intro').innerText());await page.locator('.detail-dialog[open] .dialog-top button').click();
 }
 const moved=await page.evaluate(()=>window.xiamenAtlas.getState().world.eastshore);
 assert.notDeepEqual(moved.motion,report.initial.motion);assert.equal(moved.overlaps,0);assert.equal(moved.invalidPeople,0);
 await page.locator('#scene-pause').click();const paused=await page.evaluate(()=>window.xiamenAtlas.getState().world.eastshore.seconds);await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>window.xiamenAtlas.getState().world.eastshore.seconds),paused);await page.locator('#scene-pause').click();
 await page.locator('[data-time-choice="night"]').click();await page.waitForFunction(()=>!window.xiamenAtlas.getState().sky.transitioning);await capture('night');
 await page.locator('[data-time-choice="day"]').click();await page.waitForFunction(()=>!window.xiamenAtlas.getState().sky.transitioning);
 await page.locator('#render-quality').selectOption('high');await capture('high');
 for(const [width,height] of [[390,844],[320,740],[844,390]]){
  await page.setViewportSize({width,height});
  for(const id of [7,8,9]){
   if(!await page.locator('#district').isVisible())await page.locator('#open-explore').click();
   await page.locator('#district').selectOption(String(id));await page.waitForTimeout(1500);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
   await capture('mobile-'+width+'-'+id);
  }
 }
 report.final=await page.evaluate(()=>window.xiamenAtlas.getState().world);
 assert.equal(report.final.scenes.length,12);assert.equal(report.final.invalidPeople,0);assert.equal(report.final.overlaps,0);assert.ok(report.final.island.paths>400&&report.final.campus.buildings>180&&report.final.garden.paths>90);assert.deepEqual(errors,[]);
}finally{
 report.errors=errors;await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({readyMs:report.readyMs,initial:report.initial,visits:report.visits,errors},null,2));await browser.close();
}
