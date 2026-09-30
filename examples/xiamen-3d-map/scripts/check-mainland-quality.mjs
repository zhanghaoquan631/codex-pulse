import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';

const out='qa/mainland-quality';await mkdir(out,{recursive:true});const errors=[],report={};
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});page.on('pageerror',e=>errors.push(e.message));
 const start=Date.now();await page.goto('http://127.0.0.1:5243');await page.waitForFunction(()=>window.xiamenAtlas?.getState().ready,null,{timeout:180000});report.readyMs=Date.now()-start;
 const state=await page.evaluate(()=>window.xiamenAtlas.getState());assert.ok(state.world.mappedBackgroundBuildings>4000);assert.equal(state.world.illustrativeBuildings,state.world.cityLife.infill);assert.ok(state.world.cityLife.cells>40);assert.equal(state.world.campus.jiagengWings,2);assert.equal(state.world.campus.terraceRows,25);
 report.mappedBackgroundBuildings=state.world.mappedBackgroundBuildings;report.terraceRows=state.world.campus.terraceRows;
 assert.ok(state.world.cars>0);report.cars=state.world.cars;
 for(const [i,name] of [[1,'oldtown'],[4,'campus'],[10,'jimei'],[11,'haicang']]){
  await page.selectOption('#district',String(i));if(i===4)await page.selectOption('#campus-stops','建南楼群');await page.waitForTimeout(1800);
  const png=PNG.sync.read(await page.locator('#viewport canvas').screenshot()),colors=new Set();for(let k=0;k<png.data.length;k+=40)colors.add(`${png.data[k]>>3},${png.data[k+1]>>3},${png.data[k+2]>>3}`);assert.ok(colors.size>100);await page.screenshot({path:`${out}/${name}.png`});
 }
 report.mediumLayouts=[];
 for(const width of [768,880,1024]){
  await page.setViewportSize({width,height:771});await page.selectOption('#district','4');await page.selectOption('#campus-stops','建南楼群');await page.waitForTimeout(1500);
  const overlap=await page.evaluate(()=>{const a=document.querySelector('.map-controls').getBoundingClientRect(),b=document.querySelector('.location-card').getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;});
  assert.equal(overlap,false,`Map controls overlap destination card at ${width}px`);report.mediumLayouts.push(width);await page.screenshot({path:`${out}/campus-${width}.png`});
 }
 await page.setViewportSize({width:390,height:844});await page.click('#open-explore');await page.selectOption('#district','4');await page.selectOption('#campus-stops','建南楼群');await page.waitForTimeout(1500);await page.click('#scene-more');await page.click('#scene-more');await page.screenshot({path:`${out}/mobile.png`});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);assert.equal(errors.length,0);
}finally{report.errors=errors;await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();}
