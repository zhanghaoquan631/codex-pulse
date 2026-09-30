import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const out='RECON/roadfront-homes';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[],scenes=[];
const overlaps=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const start=Date.now();await page.goto('http://127.0.0.1:5242/');
 await page.waitForFunction(()=>window.chaoshanAtlas?.getState().ready,null,{timeout:240000});
 await page.locator('#loading').waitFor({state:'hidden'});
 const loadMs=Date.now()-start,state=await page.evaluate(()=>window.chaoshanAtlas.getState()),housing=state.tourContext;
 assert.ok(housing.roadFrontHomes>100,'the actual map must build the new road-front courtyard homes');
 assert.equal(housing.roadFrontHomes+housing.backlotHomes,housing.services.home);
 assert.equal(Object.keys(housing.services).length,16,'all existing types of premises remain present');
 console.log(JSON.stringify({loadMs,roadFrontHomes:housing.roadFrontHomes,backlotHomes:housing.backlotHomes}));
 for(const target of ['nanao-nature-gate','huilai-lighthouse','raoping-haishan','chaoan','chenghai','chaoyang','chaonan','puning','jieyang','jiexi','small-park']){
  const p=state.places.find(p=>p.id===target)||state.places.find(p=>p.kind===target);assert.ok(p,target);
  await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),p.index);await page.waitForTimeout(2400);
  const path=`${out}/${p.id}.png`,png=PNG.sync.read(await page.screenshot({path,timeout:60000}));
  const colors=new Set();for(let i=0;i<png.data.length;i+=32)colors.add(png.data.subarray(i,i+3).toString('hex'));
  assert.ok(colors.size>1000,p.id+' must retain a nonblank rendered scene');
  scenes.push({id:p.id,path,colors:colors.size});console.log(p.id);
 }
 const gate=state.places.find(p=>p.id==='nanao-nature-gate');await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),gate.index);
 const mobile=[];
 for(const [width,height] of [[390,844],[375,667]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(1800);
  assert.equal(await page.locator('.location-more').evaluate(e=>e.open),false);
  const card=await page.locator('#location-card').boundingBox(),controls=await page.locator('.map-controls').boundingBox(),toolbar=await page.locator('.toolbar').boundingBox();
  assert.ok(card.y>height*.5,'collapsed card must leave the main map view clear');
  assert.ok(card.height<240);assert.equal(overlaps(card,controls),false);assert.equal(overlaps(card,toolbar),false);
  assert.ok(await page.locator('.photo-inspect').isVisible());assert.ok(await page.locator('.community-open').isVisible());
  await page.screenshot({path:`${out}/mobile-${width}.png`});
  await page.locator('.location-more>summary').click();assert.equal(await page.locator('.location-more').evaluate(e=>e.open),true);
  assert.ok(await page.locator('.feature-detail summary').isVisible());
  assert.ok((await page.locator('#location-card').boundingBox()).height<=height*.44+1);
  await page.locator('.location-more>summary').click();
  await page.locator('.community-open').click();await page.locator('.community-game').waitFor({state:'visible'});
  await page.keyboard.press('Escape');await page.locator('.community-game').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  mobile.push({width,height,card,controls,toolbar,expanded:true,community:true});
 }
 await page.setViewportSize({width:1440,height:1000});await page.waitForTimeout(600);
 assert.equal(await page.locator('.location-more').evaluate(e=>e.open),true,'desktop keeps the complete place information');
 const residents=await page.evaluate(async()=>(await import('/community-actors.mjs')).communityActors.filter(a=>a.root.userData.serviceResident).length);
 assert.ok(residents>=222);assert.deepEqual(errors,[]);
 const report={pass:true,loadMs,housing:{roadFrontHomes:housing.roadFrontHomes,backlotHomes:housing.backlotHomes,buildings:housing.buildings,services:housing.services},residents,scenes,mobile,errors};
 await fs.writeFile(`${out}/results.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
