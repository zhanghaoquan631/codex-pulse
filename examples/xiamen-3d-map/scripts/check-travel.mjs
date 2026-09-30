import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {travelPlaces} from '../travel-data.mjs';
const output='qa/travel';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge',args:['--enable-webgl','--ignore-gpu-blocklist']});
const context=await browser.newContext({viewport:{width:1440,height:960},permissions:['geolocation'],geolocation:{longitude:118.065,latitude:24.451,accuracy:8}});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const report={};
try{
 await page.goto('http://127.0.0.1:5243/');await page.waitForFunction(()=>window.xiamenAtlas?.getState().ready);
 report.initial=await page.evaluate(()=>window.xiamenAtlas.getState().travel);assert.equal(report.initial.location.enabled,false);
 await page.locator('#travel-open').click();await page.waitForFunction(()=>window.xiamenAtlas.getState().travel.routerReady);
 report.photos=[];
 for(const p of travelPlaces){
  await page.locator(`[data-tab="${p.area}"]`).click();await page.locator(`[data-place="${p.id}"]`).click();
  const img=page.locator('.travel-detail figure img');
  if(await img.count()){await img.evaluate(el=>el.decode());report.photos.push({id:p.id,loaded:await img.evaluate(el=>el.naturalWidth>0)});}
  assert.match(await page.locator('.travel-detail h3').innerText(),new RegExp(p.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 }
 await page.locator('[data-tab="island"]').click();await page.locator('[data-place="shuzhuang"]').click();await page.waitForTimeout(1300);await page.screenshot({path:output+'/desktop-detail.png'});
 await page.locator('[data-tab="routes"]').click();await page.getByRole('button',{name:'显示建筑与音乐慢游',exact:true}).click();await page.waitForTimeout(1600);await page.screenshot({path:output+'/desktop-route.png'});
 report.route=await page.locator('.route-result').innerText();assert.ok((await page.evaluate(()=>window.xiamenAtlas.getState().travel.routeSegments))>0);
 await page.locator('[data-tab="location"]').click();await page.locator('#travel-location-enabled').check();
 await page.waitForFunction(()=>window.xiamenAtlas.getState().travel.location.status==='active');await page.waitForTimeout(1000);
 await context.setGeolocation({longitude:118.0655,latitude:24.4505,accuracy:8});await page.waitForTimeout(1500);
 report.live=await page.evaluate(()=>window.xiamenAtlas.getState().travel);assert.ok(report.live.location.trackPoints>=2);assert.equal(report.live.markerVisible,true);
 await page.screenshot({path:output+'/desktop-location.png'});
 await context.setGeolocation({longitude:121.5,latitude:25.03,accuracy:10});await page.waitForFunction(()=>window.xiamenAtlas.getState().travel.location.status==='outside');
 report.outside=await page.evaluate(()=>window.xiamenAtlas.getState().travel);assert.equal(report.outside.markerVisible,false);
 await page.locator('#travel-location-enabled').uncheck();report.off=await page.evaluate(()=>window.xiamenAtlas.getState().travel);assert.equal(report.off.location.trackPoints,0);assert.equal(report.off.trackSegments,0);
 await page.locator('#travel-origin').selectOption('zhongshan');await page.locator('#travel-destination').selectOption('shuzhuang');await page.locator('#travel-ferry').selectOption('night');await page.locator('#travel-plan').click();await page.waitForTimeout(1700);report.ferry=await page.locator('.route-result').innerText();await page.screenshot({path:output+'/ferry.png'});
 await page.setViewportSize({width:390,height:844});await page.locator('[data-tab="island"]').click();await page.locator('[data-place="bagua"]').click();await page.waitForTimeout(1400);await page.screenshot({path:output+'/mobile-detail.png'});
 report.mobile=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,panel:document.querySelector('.travel-drawer').getBoundingClientRect().toJSON(),toolbar:document.querySelector('.bottom-center').getBoundingClientRect().toJSON()}));
 assert.equal(report.mobile.width,report.mobile.scrollWidth);assert.ok(report.mobile.panel.bottom<report.mobile.toolbar.y);
 const pixels=PNG.sync.read(await page.locator('#viewport canvas').screenshot()),colors=new Set();for(let i=0;i<pixels.data.length;i+=64)colors.add(pixels.data[i]+','+pixels.data[i+1]+','+pixels.data[i+2]);report.canvasColors=colors.size;assert.ok(colors.size>100);
 await page.locator('[data-tab="location"]').click();await page.screenshot({path:output+'/mobile-location.png'});
 report.errors=errors;assert.equal(errors.length,0);
}finally{await writeFile(output+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}
