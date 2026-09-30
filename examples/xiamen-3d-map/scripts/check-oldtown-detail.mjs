import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import {createStreetLayout,footprintsOverlap,oldTownCenter,clipSegmentToBounds} from '../oldtown-layout.mjs';
import {createTravelRouter} from '../travel-routing.mjs';
import {travelPlaces} from '../travel-data.mjs';
import {distanceMeters} from '../geo-utils.mjs';

const flat=createStreetLayout([{points:[[-1,0],[1,0]],kind:'pedestrian'}],{land:()=>true,heightAt:()=>0});
assert.deepEqual(clipSegmentToBounds([-1,.5],[2,.5],[0,0,1,1]),[1/3,2/3]);
assert.deepEqual(clipSegmentToBounds([.2,.5],[.8,.5],[0,0,1,1]),[0,1]);
assert.equal(clipSegmentToBounds([-1,2],[2,2],[0,0,1,1]),null);
assert.deepEqual(clipSegmentToBounds([.5,-1],[.5,2],[0,0,1,1]),[1/3,2/3]);
assert.equal(flat.footprintFits({x:0,z:0,w:.02,d:.04,angle:Math.PI/4}),false);
const block={x:0,z:.06,w:.04,d:.04,angle:Math.PI/4};assert.equal(flat.footprintFits(block),true);flat.reserve(block);
assert.equal(flat.footprintFits({...block,x:.01}),false);
assert.equal(footprintsOverlap(block,{...block,x:.12}),false);
assert.equal(footprintsOverlap(block,{...block,x:.018,angle:0}),true);
const network=JSON.parse(await readFile('public/data/travel-network.json','utf8')),router=createTravelRouter(network),nodes=new Map(network.nodes.map(([id,...ll])=>[id,ll]));
for(const [id,name] of [['zhongshan','中山路'],['zhenbang','镇邦路']]){
  const p=travelPlaces.find(p=>p.id===id),matches=network.ways.filter(w=>w.name===name).flatMap(w=>w.nodes.map(n=>nodes.get(n)));
  assert.ok(Math.min(...matches.map(ll=>distanceMeters(ll,p.ll)))<1,`${name} reference must be on its named mapped street`);
}
assert.deepEqual(travelPlaces.find(p=>p.id==='zhongshan').ll,oldTownCenter);
const walk=router.walk(oldTownCenter,travelPlaces.find(p=>p.id==='zhenbang').ll);assert.ok(!walk.error&&walk.meters>100&&walk.meters<1200);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']}),page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[],out='qa/oldtown-detail',report={routeMeters:walk.meters};
await mkdir(out,{recursive:true});page.on('pageerror',e=>errors.push(e.message));
async function capture(name){
  const buffer=await page.locator('#viewport canvas').screenshot(),png=PNG.sync.read(buffer),colors=new Set();
  for(let i=0;i<png.data.length;i+=28)colors.add(`${png.data[i]>>3},${png.data[i+1]>>3},${png.data[i+2]>>3}`);
  assert.ok(colors.size>100);await page.screenshot({path:out+'/'+name+'.png'});return colors.size;
}
try{
  const start=Date.now();await page.goto('http://127.0.0.1:5243/');await page.waitForFunction(()=>window.xiamenAtlas?.getState().ready);report.readyMs=Date.now()-start;
  await page.locator('#district').selectOption('1');await page.waitForTimeout(2000);report.colors=await capture('district');
  const state=await page.evaluate(()=>window.xiamenAtlas.getState().world.oldTown);report.oldTown=state;
  assert.ok(state.buildings>150&&state.paths>100&&state.people>100&&state.forms.length>=5);
  assert.equal(state.invalidPeople,0);assert.equal(state.overlaps,0);
  await page.waitForTimeout(2600);const after=await page.evaluate(()=>window.xiamenAtlas.getState().world.oldTown);
  assert.notDeepEqual(state.motion,after.motion);assert.equal(after.invalidPeople,0);assert.equal(after.overlaps,0);
  await page.locator('#scene-pause').click();const paused=await page.evaluate(()=>window.xiamenAtlas.getState().world.oldTown.seconds);await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>window.xiamenAtlas.getState().world.oldTown.seconds),paused);await page.locator('#scene-pause').click();
  await page.locator('#travel-open').click();await page.locator('[data-tab="oldtown"]').click();
  await page.getByRole('button',{name:'中山路骑楼步行街',exact:false}).first().click();await page.waitForTimeout(1300);await capture('zhongshan-closeup');
  await page.locator('[data-tab="oldtown"]').click();await page.getByRole('button',{name:'镇邦路街区',exact:false}).first().click();await page.waitForTimeout(1300);await capture('zhenbang-closeup');
  for(const [width,height] of [[390,844],[844,390]]){await page.setViewportSize({width,height});await page.waitForTimeout(700);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);await capture('mobile-'+width);}
  await page.setViewportSize({width:1440,height:960});await page.locator('[data-time-choice="night"]').click();await page.waitForFunction(()=>!window.xiamenAtlas.getState().sky.transitioning,{},{timeout:30000});await capture('night');
  const final=await page.evaluate(()=>window.xiamenAtlas.getState());report.finalPeople=final.world.oldTown;assert.equal(final.world.oldTown.invalidPeople,0);assert.equal(final.world.oldTown.overlaps,0);assert.equal(errors.length,0);
}finally{report.errors=errors;await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}
