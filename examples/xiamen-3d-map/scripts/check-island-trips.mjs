import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {travelPlaces,sources} from '../travel-data.mjs';
import {filterIsland,islandTourOrder,createTravelTour,categoryOf} from '../travel-tour.mjs';
const island=filterIsland(travelPlaces),ids=islandTourOrder(island),output='qa/island-trips';await mkdir(output,{recursive:true});
assert.equal(new Set(travelPlaces.map(p=>p.id)).size,travelPlaces.length);
assert.equal(ids.length,island.length);assert.equal(new Set(ids).size,island.length);
for(const p of travelPlaces){assert.ok(p.ll.every(Number.isFinite));assert.ok(p.intro&&p.tips&&p.highlights.length);for(const s of p.source)assert.ok(sources[s]);}
for(const category of ['coast','garden','heritage','museum'])assert.ok(filterIsland(travelPlaces,category).length>4);
let clock=0,visits=[];const tour=createTravelTour({now:()=>clock,onVisit:id=>visits.push(id)});tour.start(ids);
for(let i=1;i<ids.length;i++){clock+=12001;tour.tick();}
assert.deepEqual(visits,ids);clock+=12001;tour.tick();assert.equal(tour.getState().running,false);
tour.start(ids);tour.pause();clock+=50000;tour.tick();assert.equal(tour.getState().index,0);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),errors=[],report={island:island.length,total:travelPlaces.length,categories:Object.fromEntries(['coast','garden','heritage','museum','ferry'].map(c=>[c,island.filter(p=>categoryOf(p)===c).length]))};
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
 const realNow=Date.now;window.testTime=Date.parse('2026-09-28T09:30:00+08:00');Date.now=()=>window.testTime;
 let callback;Object.defineProperty(navigator,'geolocation',{value:{watchPosition(success){callback=success;return 0;},clearWatch(){callback=null;}}});
 window.pushFix=(seconds,lon=118.063207,lat=24.450138,accuracy=5)=>{window.testTime+=seconds*1000;callback?.({timestamp:window.testTime,coords:{longitude:lon,latitude:lat,accuracy,speed:0,heading:null}});};
 window.realNow=realNow;
});
try{
 await page.goto('http://127.0.0.1:5243/');await page.waitForFunction(()=>window.xiamenAtlas?.getState().ready);
 await page.locator('#travel-open').click();await page.waitForFunction(()=>window.xiamenAtlas.getState().travel.routerReady);
 await page.locator('#island-category').selectOption('coast');report.coastRows=await page.locator('[data-place]').count();assert.equal(report.coastRows,filterIsland(travelPlaces,'coast').length);
 await page.locator('#island-search').fill('观海园');assert.equal(await page.locator('[data-place]').count(),1);await page.locator('#island-search').fill('');
 await page.locator('#island-tour-all').click();report.tour=await page.evaluate(()=>window.xiamenAtlas.getState().travel.tour);assert.equal(report.tour.total,island.length);
 await page.locator('#tour').click();assert.equal((await page.evaluate(()=>window.xiamenAtlas.getState().travel.tour)).running,false);
 await page.locator('#tour').click();assert.equal((await page.evaluate(()=>window.xiamenAtlas.getState().travel.tour)).total,island.length);
 await page.locator('[aria-label="每站巡游停留时间"]').selectOption('8');await page.waitForTimeout(8300);assert.equal((await page.evaluate(()=>window.xiamenAtlas.getState().travel.tour)).index,1);
 await page.locator('#travel-play').click();report.visited=[await page.evaluate(()=>window.xiamenAtlas.getState().travel.selected)];
 for(let i=1;i<island.length;i++){await page.locator('#travel-next').click();report.visited.push(await page.evaluate(()=>window.xiamenAtlas.getState().travel.selected));}
 assert.equal(new Set(report.visited).size,island.length);
 await page.locator('[data-tab="location"]').click();await page.locator('#travel-location-enabled').check();await page.evaluate(()=>pushFix(0));await page.evaluate(()=>pushFix(12));
 await page.locator('[data-tab="history"]').click();assert.equal(await page.locator('[data-type="arrive"]').count(),1);
 await page.locator('#save-trips').check();
 await page.locator('[data-tab="location"]').click();await page.evaluate(()=>pushFix(30));assert.equal(await page.locator('#travel-location-enabled').count(),1);assert.equal(await page.locator('#save-trips').count(),0);
 for(let i=0;i<40;i++)await page.evaluate(()=>pushFix(30));
 await page.locator('[data-tab="history"]').click();report.timeline=await page.locator('.trip-timeline').innerText();assert.match(report.timeline,/2026\/09\/28 09:50:00/);assert.equal(await page.locator('[data-type="stay"]').count(),1);
 await page.screenshot({path:output+'/timeline-desktop.png'});
 const before=(await page.evaluate(()=>window.xiamenAtlas.getState().travel.history)).events;
 await page.evaluate(()=>pushFix(3600));report.gap=await page.locator('[data-type="gap"]').innerText();assert.equal(await page.locator('[data-type="stay"]').count(),1);assert.ok((await page.evaluate(()=>window.xiamenAtlas.getState().travel.history)).events>before);
 await page.locator('[data-tab="location"]').click();await page.locator('#travel-location-enabled').uncheck();
 await page.reload();await page.waitForFunction(()=>window.xiamenAtlas?.getState().ready);await page.locator('#travel-open').click();await page.locator('[data-tab="history"]').click();
 report.restored=await page.evaluate(()=>window.xiamenAtlas.getState().travel.history);assert.equal(report.restored.trips,1);assert.equal(report.restored.savedLocally,true);
 for(const [width,height] of [[390,844],[320,740],[844,390]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
  assert.ok(await page.locator('.travel-body').evaluate(el=>el.clientHeight>140),'Travel body must remain usable in landscape');
  await page.screenshot({path:`${output}/history-${width}.png`});
 }
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'停止定位并删除全部旅行记录',exact:true}).click();assert.equal((await page.evaluate(()=>window.xiamenAtlas.getState().travel.history)).trips,0);
 assert.equal(await page.evaluate(()=>localStorage.getItem('xiamen-trips-v1')),null);
 await page.locator('[data-tab="island"]').click();await page.locator('#island-category').selectOption('all');await page.locator('#island-search').fill('三一堂');await page.locator('[data-place="trinity"]').click();await page.waitForTimeout(1100);await page.screenshot({path:output+'/mobile-island.png'});
 report.errors=errors;assert.equal(errors.length,0);
}finally{await writeFile(output+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}
