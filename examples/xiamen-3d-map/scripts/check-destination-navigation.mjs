import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import {campusStops} from '../campus-stops.mjs';
import {travelPlaces} from '../travel-data.mjs';

const data=JSON.parse(await readFile('public/data/xiamen.json','utf8')),terrain=JSON.parse(await readFile('public/data/terrain-refined.json','utf8'));
assert.deepEqual(terrain.bounds,data.terrain.bounds);assert.equal(terrain.heights.length,521*521);assert.ok(terrain.heights.every(Number.isFinite));
const detail=JSON.parse(await readFile('public/data/campus-detail.json','utf8')),stops=campusStops(detail,(lon,lat)=>[(lon-data.meta.origin[0])*data.meta.sx,(data.meta.origin[1]-lat)*data.meta.sz]);
assert.equal(stops.length,7);assert.equal(new Set(stops.map(p=>p.name)).size,7);
const docks=travelPlaces.filter(p=>p.area==='ferry');assert.equal(docks.length,7);
assert.ok(docks.find(p=>p.id==='songyu').walkingUnavailable);
const out='qa/destination-navigation';await mkdir(out,{recursive:true});const report={},errors=[];
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const start=Date.now();await page.goto('http://127.0.0.1:5243/');await page.waitForFunction(()=>window.xiamenAtlas?.getState().ready);report.readyMs=Date.now()-start;
 const select=async index=>{if(!await page.locator('#district').isVisible())await page.locator('#open-explore').click();await page.locator('#district').selectOption(String(index));await page.waitForTimeout(1600);};
 async function capture(name){const png=PNG.sync.read(await page.locator('#viewport canvas').screenshot()),colors=new Set();for(let i=0;i<png.data.length;i+=36)colors.add(`${png.data[i]>>3},${png.data[i+1]>>3},${png.data[i+2]>>3}`);assert.ok(colors.size>100);await page.screenshot({path:`${out}/${name}.png`});}
 await select(4);await capture('campus-overview');
 const overlap=await page.evaluate(()=>{const a=document.querySelector('.map-controls').getBoundingClientRect(),b=document.querySelector('.location-card').getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;});assert.equal(overlap,false,'Zoom controls must not overlap the location card');
 assert.equal(await page.locator('#campus-stops option').count(),8);
 for(const stop of stops){await page.selectOption('#campus-stops',stop.name);await page.waitForTimeout(1250);assert.equal(await page.locator('#location-name').textContent(),stop.name);await capture(stop.name);}
 await page.selectOption('#campus-stops','芙蓉湖');await page.locator('#tour').click();assert.equal(await page.locator('#location-name').textContent(),'芙蓉湖');
 assert.ok(await page.evaluate(()=>window.xiamenAtlas.getState().touring));
 await page.waitForFunction(()=>document.querySelector('#location-name').textContent==='图书馆',null,{timeout:16000});
 await page.locator('#destination-next').click();assert.equal(await page.locator('#location-name').textContent(),'建南楼群');
 await page.locator('#destination-play').click();assert.equal(await page.evaluate(()=>window.xiamenAtlas.getState().touring),false);
 await page.locator('#destination-previous').click();assert.equal(await page.locator('#location-name').textContent(),'图书馆');
 await select(8);await page.locator('#tour').click();assert.equal(await page.locator('#location-name').textContent(),'黄厝海滩');await page.locator('#tour').click();
 await page.locator('.place-search').fill('厦门大学');await page.locator('.place-search').press('Enter');assert.equal(await page.locator('#location-name').textContent(),'厦门大学');await page.locator('.place-search').fill('');
 await page.locator('#travel-docks').click();await page.waitForTimeout(1500);assert.equal(await page.locator('.travel-place-row').count(),7);await capture('dock-overview');
 await page.locator('.travel-place-row[data-place="songyu"]').click();assert.equal(await page.locator('#travel-go').count(),0);assert.match(await page.locator('.travel-body').textContent(),/不绘制跨海步行线/);
 await page.locator('#travel-close').click();await page.locator('#travel-docks').click();await page.locator('#travel-close').click();await page.waitForTimeout(1000);
 report.visibleDocks=await page.locator('.dock-pin:not([hidden])').count();assert.ok(report.visibleDocks>0,'Dock markers persist outside travel drawer');await capture('dock-persistent');
 await page.locator('#toggle-labels').click();await page.waitForTimeout(100);assert.equal(await page.locator('.dock-pin:not([hidden])').count(),0);await page.locator('#toggle-labels').click();
 for(const [width,height] of [[320,740],[390,844],[844,390]]){
  await page.setViewportSize({width,height});await select(4);await page.selectOption('#campus-stops','建南楼群');await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
  assert.equal(await page.locator('.scene-tools').isVisible(),false);await page.locator('#scene-more').click();assert.equal(await page.locator('.scene-tools').isVisible(),true);await page.locator('#scene-more').click();
  const buttons=await page.locator('.destination-controls button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
  assert.ok(buttons.every(r=>r.left>=0&&r.right<=width&&r.top>=0&&r.bottom<=height));
  await capture(`mobile-${width}`);await page.locator('#destination-next').click();assert.equal(await page.locator('#location-name').textContent(),'上弦场');
 }
 report.final=await page.evaluate(()=>window.xiamenAtlas.getState());assert.equal(report.final.world.campus.detailedHalls,1);assert.equal(report.final.world.overlaps,0);assert.equal(report.final.world.invalidPeople,0);assert.equal(errors.length,0);
}finally{report.errors=errors;await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({readyMs:report.readyMs,visibleDocks:report.visibleDocks,errors}));await browser.close();}
