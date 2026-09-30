import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import {campusLocations} from '../campus-detail.mjs';
import {inRectangle} from '../coast-layout.mjs';
import {prepareWaterContains} from '../water-query.mjs';

const detail=JSON.parse(await readFile('public/data/campus-detail.json','utf8')),coast=JSON.parse(await readFile('public/data/coast-detail.json','utf8')),data=JSON.parse(await readFile('public/data/xiamen.json','utf8'));
const world=([lon,lat])=>[(lon-data.meta.origin[0])*data.meta.sx,(data.meta.origin[1]-lat)*data.meta.sz];
assert.equal(detail.bounds[0],coast.bounds[2],'Adjacent districts must share one grid boundary');
assert.ok(detail.buildings.length>=180);assert.ok(detail.paths.length>=180);assert.ok(detail.paths.filter(p=>p.kind==='steps').length>=7);
assert.ok(detail.buildings.some(b=>b.rings[0].length>20),'Preserve complex building outlines');
for(const ll of Object.values(campusLocations))assert.ok(inRectangle(...world(ll),detail.bounds));
const furong=detail.pois.find(p=>p.name==='芙蓉湖');assert.ok(furong);
assert.ok(detail.water.some(w=>prepareWaterContains(w.rings)(...furong.point)),'Lake must match source POI');
const out='qa/campus-detail',report={},errors=[];await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:960}});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const start=Date.now();await page.goto('http://127.0.0.1:5243/');await page.waitForFunction(()=>window.xiamenAtlas?.getState().ready);report.readyMs=Date.now()-start;
  const state=await page.evaluate(()=>window.xiamenAtlas.getState().world.campus);report.initial=state;
  assert.ok(state.people>150&&state.trees>600&&state.fixtures>20&&state.courts>0);assert.ok(state.forms.length>=4);assert.ok(state.stairs>0);
  async function capture(name){const image=PNG.sync.read(await page.locator('#viewport canvas').screenshot());const colors=new Set();for(let i=0;i<image.data.length;i+=28)colors.add(`${image.data[i]>>3},${image.data[i+1]>>3},${image.data[i+2]>>3}`);assert.ok(colors.size>100);await page.screenshot({path:out+'/'+name+'.png'});return colors.size;}
  async function select(i){if(!await page.locator('#district').isVisible())await page.locator('#open-explore').click();await page.locator('#district').selectOption(String(i));await page.waitForTimeout(1800);}
  for(const i of [4,5]){await select(i);report['colors'+i]=await capture('place-'+i);}
  const moving=await page.evaluate(()=>window.xiamenAtlas.getState().world.campus);assert.notDeepEqual(moving.motion,state.motion);assert.equal(moving.overlaps,0);assert.equal(moving.invalidPeople,0);
  await page.locator('#scene-pause').click();const paused=await page.evaluate(()=>window.xiamenAtlas.getState().world.campus.seconds);await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.xiamenAtlas.getState().world.campus.seconds),paused);await page.locator('#scene-pause').click();
  await page.locator('[data-time-choice="night"]').click();await page.waitForFunction(()=>!window.xiamenAtlas.getState().sky.transitioning);await capture('night');
  await page.locator('[data-time-choice="day"]').click();await page.waitForFunction(()=>!window.xiamenAtlas.getState().sky.transitioning);
  for(const [width,height] of [[390,844],[844,390]]){await page.setViewportSize({width,height});for(const i of [4,5]){await select(i);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);await capture('mobile-'+width+'-'+i);}}
  report.final=await page.evaluate(()=>window.xiamenAtlas.getState());assert.equal(report.final.world.overlaps,0);assert.equal(report.final.world.invalidPeople,0);assert.ok(report.final.world.coast.buildings>=25);assert.ok(report.final.world.island.paths>400);assert.equal(errors.length,0);
}finally{report.errors=errors;await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({readyMs:report.readyMs,campus:report.initial,errors},null,2));await browser.close();}
