import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {PNG} from 'pngjs';
import {mappedIslandHotels} from '../island-hotels.mjs';
const out='qa/island-hospitality';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const report={visits:[],layouts:[]},errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5243/');await page.waitForFunction(()=>window.xiamenAtlas?.getState().ready,null,{timeout:90000});
 await page.locator('#island-tour-launch').click();
 assert.equal(await page.locator('#tour').getAttribute('aria-pressed'),'false');
 assert.equal(await page.evaluate(()=>window.xiamenAtlas.getState().travel.tour.total),79+mappedIslandHotels.length);
 await page.getByLabel('每站巡游停留时间').selectOption('20');
 for(const stage of [0,1,2]){
  await page.waitForFunction(s=>document.querySelector('.travel-body').dataset.stage===String(s),stage,{timeout:15000});
  await page.screenshot({path:`${out}/auto-stage-${stage}.png`});
  const text=await page.locator('.island-tour-story').innerText();
  if(stage===1){assert.match(text,/¥/);assert.match(text,/2026-09-28/);assert.match(text,/平台人均/);}
  if(stage===2){assert.match(text,/位置快照/);assert.match(text,/当日房价/);assert.match(await page.evaluate(()=>window.xiamenAtlas.getState().travel.focusedPlace),/^hotel-/);}
  report.visits.push({stage,text});
 }
 await page.locator('#travel-play').click();const held=await page.evaluate(()=>window.xiamenAtlas.getState().travel.tour.elapsed);await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>window.xiamenAtlas.getState().travel.tour.elapsed),held);
 await page.locator('#travel-next').click();assert.equal(await page.evaluate(()=>window.xiamenAtlas.getState().travel.tour.index),1);
 await page.locator('#travel-prev').click();assert.equal(await page.evaluate(()=>window.xiamenAtlas.getState().travel.tour.index),0);
 await page.locator('#tour').click();assert.equal(await page.evaluate(()=>window.xiamenAtlas.getState().travel.tour.running),false);assert.equal(await page.evaluate(()=>window.xiamenAtlas.getState().touring),true);assert.equal(await page.locator('.travel-drawer').isVisible(),false);await page.locator('#tour').click();
 for(const [width,height] of [[390,844],[320,740],[844,390]]){
  await page.setViewportSize({width,height});await page.locator('#travel-open').click();await page.locator('#island-tour-all').click();await page.locator('#travel-play').click();
  for(const stage of [0,1,2]){
   await page.locator(`.island-tour-stages [data-stage="${stage}"]`).click();await page.waitForTimeout(250);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
   const header=await page.locator('.island-tour-heading').boundingBox();assert.ok(header.x>=0&&header.x+header.width<=width);
   const png=PNG.sync.read(await page.locator('#viewport canvas').screenshot()),colors=new Set();for(let i=0;i<png.data.length;i+=64)colors.add(png.data.slice(i,i+3).join(','));assert.ok(colors.size>100);
   await page.screenshot({path:`${out}/mobile-${width}-${stage}.png`});report.layouts.push({width,height,stage,colors:colors.size});
  }
  await page.locator('#travel-close').click();
 }
 assert.deepEqual(errors,[]);
}finally{report.errors=errors;await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}
