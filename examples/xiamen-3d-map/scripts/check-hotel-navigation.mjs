import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {PNG} from 'pngjs';
import {mappedIslandHotels} from '../island-hotels.mjs';
const out='qa/hotel-navigation';await mkdir(out,{recursive:true});
const report={hotelSelections:[],layouts:[]},errors=[];
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});
 page.on('pageerror',e=>errors.push(e.message));
 const state=()=>page.evaluate(()=>window.xiamenAtlas.getState());
 await page.goto('http://127.0.0.1:5243/');await page.waitForFunction(()=>window.xiamenAtlas?.getState().ready,null,{timeout:90000});
 const before=(await state()).camera.target;
 await page.locator('#island-tour-launch').click();await page.waitForTimeout(1000);
 assert.notDeepEqual((await state()).camera.target,before);
 assert.equal((await state()).travel.tour.total,79+mappedIslandHotels.length);
 await page.getByLabel('每站巡游停留时间').selectOption('9');
 await page.waitForFunction(()=>window.xiamenAtlas.getState().travel.tour.stage===2,null,{timeout:15000});
 await page.waitForTimeout(1000);
 const hotelStage=await state();assert.match(hotelStage.travel.focusedPlace,/^hotel-/);
 assert.equal(await page.locator('.island-tour-story').getAttribute('data-hotel'),hotelStage.travel.focusedPlace);
 assert.deepEqual(hotelStage.camera.travelView.ll,mappedIslandHotels.find(h=>h.id===hotelStage.travel.focusedPlace).ll);
 await page.waitForFunction(()=>window.xiamenAtlas.getState().travel.tour.index===1,null,{timeout:15000});
 await page.locator('#travel-close').click();
 const collapsed=await state();assert.equal(collapsed.travel.opened,false);assert.equal(collapsed.travel.tour.running,true);
 await page.waitForFunction(i=>window.xiamenAtlas.getState().travel.tour.index>i,collapsed.travel.tour.index,{timeout:15000});
 assert.equal(await page.locator('.travel-drawer').isVisible(),false);
 await page.locator('#travel-play').click();const paused=(await state()).travel.tour;await page.waitForTimeout(700);
 assert.equal((await state()).travel.tour.elapsed,paused.elapsed);
 await page.locator('#travel-tour-expand').click();assert.equal(await page.locator('.travel-drawer').isVisible(),true);
 await page.locator('#tour').click();assert.equal((await state()).travel.tour.running,false);assert.equal((await state()).touring,true);await page.locator('#tour').click();
 await page.locator('#travel-open').click();await page.locator('[data-tab="hotels"]').click();
 assert.equal(await page.locator('[data-hotel].hotel-row').count(),mappedIslandHotels.length);
 const samples=[mappedIslandHotels[0],...mappedIslandHotels.filter(h=>h.profile).slice(0,3),mappedIslandHotels.at(-1)];
 for(const hotel of samples){
  await page.locator('#hotel-search').fill(hotel.name);
  await page.locator(`.hotel-row[data-hotel="${hotel.id}"]`).click();await page.waitForTimeout(1000);
  const s=await state();assert.equal(s.travel.focusedPlace,hotel.id);assert.deepEqual(s.camera.travelView.ll,hotel.ll);
  assert.equal(await page.locator('.hotel-detail').getAttribute('data-hotel'),hotel.id);
  assert.equal(await page.locator(`.hotel-pin[data-poi="${hotel.id}"]`).isVisible(),true);
  report.hotelSelections.push({name:hotel.name,ll:s.camera.travelView.ll,zoom:s.camera.zoom});
  await page.getByRole('button',{name:'返回酒店列表',exact:true}).click();
 }
 await page.locator('#hotel-search').fill('');await page.locator('#hotel-tour-all').click();await page.getByLabel('每站巡游停留时间').selectOption('9');
 assert.equal((await state()).travel.tour.total,mappedIslandHotels.length);
 const hotelBefore=(await state()).travel.selected;
 await page.waitForFunction(id=>window.xiamenAtlas.getState().travel.selected!==id,hotelBefore,{timeout:16000});await page.waitForTimeout(1000);
 assert.notEqual((await state()).travel.focusedPlace,hotelBefore);
 await page.locator('#travel-play').click();
 report.automaticHotelJump=(await state()).travel.focusedPlace;
 for(const [width,height] of [[1440,960],[390,844],[320,740],[844,390]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
  for(const selector of ['.travel-drawer','.travel-tour-bar','.hotel-detail h3']){
   const box=await page.locator(selector).boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1,selector);
  }
  if(width<=650){
   const panel=await page.locator('.travel-drawer').boundingBox(),zoom=await page.locator('.map-controls').boundingBox();
   assert.ok(zoom.y+zoom.height<=panel.y,'Zoom controls must stay above the mobile drawer');
  }
  const canvas=PNG.sync.read(await page.locator('#viewport canvas').screenshot()),colors=new Set();
  for(let i=0;i<canvas.data.length;i+=64)colors.add(canvas.data.subarray(i,i+3).join(','));
  assert.ok(colors.size>100);await page.screenshot({path:`${out}/hotel-${width}.png`});
  if(width===1440){
   await page.waitForTimeout(1200);
   const next=PNG.sync.read(await page.locator('#viewport canvas').screenshot());let changed=0;
   for(let i=0;i<canvas.data.length;i+=4)if(canvas.data[i]!==next.data[i]||canvas.data[i+1]!==next.data[i+1]||canvas.data[i+2]!==next.data[i+2])changed++;
   assert.ok(changed>100);report.animatedPixels=changed;
  }
  report.layouts.push({width,height,colors:colors.size});
 }
 await page.setViewportSize({width:1440,height:960});await page.locator('#hotel-go').click();
 await page.waitForFunction(()=>window.xiamenAtlas.getState().travel.routerReady);
 await page.waitForFunction(()=>document.querySelector('.route-result')?.textContent.includes('参考步行'),null,{timeout:20000});
 report.route=await page.locator('.route-result').innerText();
 await page.locator('[data-tab="hotels"]').click();
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('.hotel-row').count(),mappedIslandHotels.length);
 const tabs=await page.locator('.travel-tabs button').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON()));
 assert.ok(tabs.every(r=>r.x>=0&&r.right<=390));
 await page.screenshot({path:out+'/hotel-list-mobile.png'});
 await page.locator('#hotel-search').fill('不存在的酒店12345');assert.equal(await page.locator('.hotel-row').count(),0);
 await page.locator('#hotel-search').fill('林氏府');
 await page.locator('.hotel-row').click();assert.match(await page.locator('.hotel-detail').innerText(),/园区内餐厅参考点/);
 await page.screenshot({path:out+'/linshifu-mobile.png'});
 assert.equal((await state()).travel.location.enabled,false);
 assert.deepEqual(errors,[]);
}finally{report.errors=errors;await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}
