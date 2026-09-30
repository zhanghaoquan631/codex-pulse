import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';

const out='qa/coastal-life';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const report={},errors=[];
const crowdRegions=s=>Object.fromEntries([...['island','oldTown','coast','campus','garden','eastshore'].map(key=>[key,s.world[key]]),...s.world.northshore.regions.map(r=>[r.id,r])]);
const changed=(a,b)=>{let pixels=0,water=0;for(let i=0;i<a.data.length;i+=4){const [r,g,blue]=a.data.subarray(i,i+3);if(g>r*1.2&&blue>r*1.05){water++;if(Math.abs(r-b.data[i])+Math.abs(g-b.data[i+1])+Math.abs(blue-b.data[i+2])>3)pixels++;}}return {pixels,water};};
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const start=Date.now();await page.goto('http://127.0.0.1:5243/');await page.waitForFunction(()=>window.xiamenAtlas?.getState().ready,null,{timeout:60000});report.readyMs=Date.now()-start;
 await page.locator('[data-time-choice="day"]').click();
 await page.getByLabel('云朵',{exact:true}).uncheck();
 await page.locator('#travel-open').click();await page.locator('[data-tab="island"]').click();await page.locator('[data-place="beach"]').click();await page.waitForTimeout(2500);
 const before=await page.evaluate(()=>window.xiamenAtlas.getState()),first=PNG.sync.read(await page.locator('#viewport canvas').screenshot());
 await page.waitForTimeout(4000);
 const after=await page.evaluate(()=>window.xiamenAtlas.getState()),second=PNG.sync.read(await page.locator('#viewport canvas').screenshot());
 report.crowds={};
 for(const [name,state] of Object.entries(crowdRegions(after))){
   const previous=crowdRegions(before)[name];
   assert.ok(state.people>100,name+' has a crowd');assert.equal(state.invalidPeople,0,name+' valid surface');assert.equal(state.overlaps,0,name+' no overlapping people');
   assert.ok(state.travelled>previous.travelled,name+' people translate');assert.notDeepEqual(state.motion,previous.motion,name+' visible samples translate');
   assert.ok(state.walking>state.people*.25,name+' walking fraction');
   report.crowds[name]={people:state.people,walking:state.walking,travelled:state.travelled,invalidPeople:state.invalidPeople,overlaps:state.overlaps};
 }
 assert.ok(after.world.island.stairFlights>100);assert.ok(after.world.island.railPosts>500);assert.equal(after.world.island.terminals.length,3);assert.ok(after.world.island.seawallSegments>0);assert.ok(after.world.island.beachFurniture>0);assert.ok(after.world.island.beachPaths>0);
 for(const kind of ['pier','beach']){const people=after.world.island.samples.filter(p=>p.kind===kind);assert.ok(people.length>2&&people.some(p=>p.travelled>0),kind+' passengers move');}
 assert.ok(after.marine.boats>=20&&after.marine.sailboats>5&&after.marine.ferries>5&&after.marine.fishingBoats>3);assert.equal(after.marine.invalidBoats,0);assert.notDeepEqual(before.marine.motion,after.marine.motion);assert.ok(after.waves.seconds>before.waves.seconds);
 report.sea={...after.marine,motion:undefined,pixels:changed(first,second)};assert.ok(report.sea.pixels.water>10000&&report.sea.pixels.pixels>1000);
 report.island={stairs:after.world.island.stairFlights,piers:after.world.island.pierSegments,terminals:after.world.island.terminals,beachPaths:after.world.island.beachPaths,seawalls:after.world.island.seawallSegments};
 await page.screenshot({path:out+'/beach.png'});
 for(const id of ['neicuo','sanqiutian','gangqin']){
   await page.locator('[data-tab="ferry"]').click();await page.locator('[data-place="'+id+'"]').click();await page.waitForTimeout(1800);await page.screenshot({path:out+'/'+id+'.png'});
 }
 report.mobileDocks=[];
 for(const [width,height] of [[390,844],[844,390]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(1000);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
   const drawer=await page.locator('.travel-drawer').evaluate(d=>{const r=d.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,overflow:d.scrollWidth-d.clientWidth};});
   assert.ok(drawer.left>=0&&drawer.right<=width&&drawer.top>=0&&drawer.bottom<=height&&drawer.overflow<=1);
   const canvas=PNG.sync.read(await page.locator('#viewport canvas').screenshot()),colors=new Set();
   for(let i=0;i<canvas.data.length;i+=64)colors.add(`${canvas.data[i]>>3},${canvas.data[i+1]>>3},${canvas.data[i+2]>>3}`);
   assert.ok(colors.size>100,'mobile dock canvas is nonblank');
   await page.screenshot({path:out+'/dock-mobile-'+width+'.png'});report.mobileDocks.push({width,height,colors:colors.size,drawer});
 }
 await page.setViewportSize({width:1440,height:960});
 await page.locator('#scene-pause').click();await page.waitForTimeout(200);
 const paused=await page.evaluate(()=>window.xiamenAtlas.getState());await page.waitForTimeout(900);const frozen=await page.evaluate(()=>window.xiamenAtlas.getState());
 assert.deepEqual(paused.marine.motion,frozen.marine.motion);assert.equal(paused.waves.seconds,frozen.waves.seconds);assert.deepEqual(paused.world.island.motion,frozen.world.island.motion);await page.locator('#scene-pause').click();
 await page.locator('#travel-close').click();await page.locator('.guide-open').click();await page.locator('[data-food="shacha"]').waitFor();
 for(const id of ['shacha','tusun','oyster','peanut']){
   await page.locator('[data-food="'+id+'"]').click();await page.waitForFunction(()=>document.querySelector('.food-photo img')?.naturalWidth>100);assert.ok(await page.locator('.food-photo figcaption a').count()>=2);await page.screenshot({path:out+'/food-'+id+'.png'});
   if(await page.locator('.food-detail summary').count()){await page.locator('.food-detail summary').click();await page.waitForFunction(()=>[...document.querySelectorAll('.food-photo img')].every(i=>i.naturalWidth>100));}
   await page.locator('.food-back').click();
 }
 await page.getByRole('button',{name:'交通入口',exact:true}).click();assert.equal(await page.locator('.guide-card').count(),3);await page.getByRole('button',{name:'厦门味道',exact:true}).click();
 for(const [width,height] of [[390,844],[844,390]]){
   await page.setViewportSize({width,height});await page.locator('[data-food="shacha"]').click();await page.waitForFunction(()=>document.querySelector('.food-photo img')?.naturalWidth>100);
   const overflow=await page.locator('.guide-dialog').evaluate(d=>({scroll:d.scrollWidth,width:d.clientWidth}));assert.ok(overflow.scroll<=overflow.width+1);await page.screenshot({path:out+'/food-mobile-'+width+'.png'});await page.locator('.food-back').click();
 }
 await page.locator('[aria-label="关闭在地指南"]').click();await page.close();
 const reduced=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});reduced.on('pageerror',e=>errors.push(e.message));
 await reduced.goto('http://127.0.0.1:5243/');await reduced.waitForFunction(()=>window.xiamenAtlas?.getState().ready,null,{timeout:60000});
 const initial=await reduced.evaluate(()=>window.xiamenAtlas.getState());assert.equal(initial.paused,true);
 await reduced.waitForTimeout(700);assert.deepEqual(initial.world.island.motion,await reduced.evaluate(()=>window.xiamenAtlas.getState().world.island.motion));
 await reduced.locator('#scene-pause').click();await reduced.waitForTimeout(2500);const resumed=await reduced.evaluate(()=>window.xiamenAtlas.getState());
 for(const [name,state] of Object.entries(crowdRegions(resumed)))assert.ok(state.travelled>crowdRegions(initial)[name].travelled,name+' explicit resume overrides reduced preference');
 assert.ok(resumed.waves.seconds>initial.waves.seconds);assert.notDeepEqual(resumed.marine.motion,initial.marine.motion);report.reducedMotionResume=true;
 assert.equal(errors.length,0);report.errors=errors;
}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,sea:report.sea&&{...report.sea},errors},null,2));await browser.close();}
