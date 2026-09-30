import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {terrainTriangle,terrainPaving} from '../terrain-paving.mjs';

const terrain={bounds:[[0,0],[1,1]],nx:1,nz:1};
const heightAt=(x,z)=>x+z<=1?x+.3*z:2+(1-2)*(1-z)+(.3-2)*(1-x);
const vertices=terrainTriangle(terrain,heightAt,[[.05,.05],[.95,.05],[.95,.95]],{offset:.002});
assert.ok(vertices.length>9,'A patch must split at the terrain diagonal');
for(let i=0;i<vertices.length;i+=9){
  const x=(vertices[i]+vertices[i+3]+vertices[i+6])/3,z=(vertices[i+2]+vertices[i+5]+vertices[i+8])/3,y=(vertices[i+1]+vertices[i+4]+vertices[i+7])/3;
  assert.ok(Math.abs(y-heightAt(x,z)-.002)<1e-8,'Ground cover must conform to the terrain, without z-fighting');
}
const pavement=[];terrainPaving(terrain,heightAt)(pavement,[.1,.2],[.9,.8],.03);assert.ok(pavement.length>0);
const out='qa/island-detail';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[],report={};
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
  const start=Date.now();await page.goto('http://127.0.0.1:5243/');await page.waitForFunction(()=>window.xiamenAtlas?.getState().ready);report.readyMs=Date.now()-start;
  await page.locator('#travel-open').click();
  for(const id of ['bagua','trinity','catholic','haitiantang','palace','beach','haoyue','sunlight','plant-garden','guanhai-beach','junru','neicuo']){
    await page.locator('[data-tab="island"]').click();await page.locator(`[data-place="${id}"]`).click();await page.waitForTimeout(1100);
    const state=await page.evaluate(()=>window.xiamenAtlas.getState().world.island);
    assert.equal(state.invalidPeople,0);assert.equal(state.overlaps,0);
    await page.screenshot({path:`${out}/${id}.png`});
  }
  const initial=await page.evaluate(()=>window.xiamenAtlas.getState().world.island);
  assert.ok(initial.paths>300&&initial.houses>70&&initial.landmarks.length>25);
  assert.ok(initial.forms.length>=9&&initial.landcoverPatches>20&&initial.people>100);
  for(const id of ['bagua','trinity','catholic','haitiantang','huangrongyuan'])assert.ok(initial.landmarks.some(p=>p.id===id));
  assert.deepEqual(initial.sculptures,['haoyue','sunlight']);
  await page.waitForTimeout(2200);
  assert.notDeepEqual(initial.motion,(await page.evaluate(()=>window.xiamenAtlas.getState().world.island)).motion);
  await page.locator('#scene-pause').click();await page.waitForTimeout(150);
  const paused=await page.evaluate(()=>window.xiamenAtlas.getState().world.island.motion);await page.waitForTimeout(700);
  assert.deepEqual(paused,await page.evaluate(()=>window.xiamenAtlas.getState().world.island.motion));await page.locator('#scene-pause').click();
  report.frames=await page.evaluate(()=>new Promise(resolve=>{const values=[];let previous=performance.now();const frame=now=>{values.push(now-previous);previous=now;if(values.length<90)requestAnimationFrame(frame);else{const sorted=values.slice(2).sort((a,b)=>a-b);resolve({medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)]});}};requestAnimationFrame(frame);}));
  for(const [width,height] of [[390,844],[844,390]]){
    await page.setViewportSize({width,height});await page.locator('[data-tab="island"]').click();await page.locator('[data-place="bagua"]').click();await page.waitForTimeout(1300);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
    const png=PNG.sync.read(await page.locator('#viewport canvas').screenshot()),colors=new Set();for(let i=0;i<png.data.length;i+=24)colors.add(`${png.data[i]>>3},${png.data[i+1]>>3},${png.data[i+2]>>3}`);assert.ok(colors.size>100);
    await page.screenshot({path:`${out}/mobile-${width}.png`});
  }
  await page.setViewportSize({width:1440,height:960});await page.locator('[data-time-choice="night"]').click();await page.waitForFunction(()=>window.xiamenAtlas.getState().sky.transitioning===false,{},{timeout:30000});await page.screenshot({path:`${out}/night.png`});
  report.island=await page.evaluate(()=>window.xiamenAtlas.getState().world.island);report.errors=errors;
  assert.equal(report.island.invalidPeople,0);assert.equal(report.island.overlaps,0);assert.equal(errors.length,0);
}finally{
  await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({readyMs:report.readyMs,frames:report.frames,paths:report.island?.paths,landmarks:report.island?.landmarks.length,houses:report.island?.houses,people:report.island?.people,trees:report.island?.trees,errors},null,2));await browser.close();
}
