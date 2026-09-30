import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
const detail=JSON.parse(await readFile('public/data/northshore-detail.json','utf8'));
assert.deepEqual(detail.regions.map(r=>r.id),['jimei','haicang']);
assert.ok(detail.regions.every(r=>r.paths.length>400&&r.buildings.length>300));
const out='qa/northshore-detail',report={},errors=[];await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const start=Date.now();await page.goto('http://127.0.0.1:5243/');await page.waitForFunction(()=>window.xiamenAtlas?.getState().ready,null,{timeout:90000});report.readyMs=Date.now()-start;
 report.initial=await page.evaluate(()=>window.xiamenAtlas.getState().world.northshore);console.log(JSON.stringify({readyMs:report.readyMs,initial:report.initial},null,2));
 assert.ok(report.initial.regions.every(r=>r.people>100&&r.trees>500&&r.flowers>50));
 assert.ok(report.initial.regions[0].tower,'Mapped Nanxun landmark was matched');
 assert.ok(report.initial.regions[0].dragonBoats>0);
 async function capture(name){const png=PNG.sync.read(await page.locator('#viewport canvas').screenshot()),colors=new Set();for(let i=0;i<png.data.length;i+=28)colors.add(`${png.data[i]>>3},${png.data[i+1]>>3},${png.data[i+2]>>3}`);assert.ok(colors.size>100,'Nonblank scene');await page.screenshot({path:out+'/'+name+'.png'});return colors.size;}
 report.visits=[];
 for(const id of [10,11]){
  await page.locator('#district').selectOption(String(id));await page.waitForTimeout(1800);await capture('region-'+id);
  const names=await page.locator('#northshore-stops option').evaluateAll(options=>options.filter(o=>o.value&&!o.hidden).map(o=>o.value));
  assert.ok(names.length>=4);
  for(const [index,name] of names.entries()){
   await page.locator('#northshore-stops').selectOption(name);await page.waitForTimeout(1300);report.visits.push({name,colors:await capture(id+'-'+index)});
   assert.equal(await page.locator('#location-card h2').innerText(),name);
   await page.locator('.detail-open').click();assert.equal(await page.locator('.detail-dialog[open] h2').innerText(),name);assert.ok(await page.locator('.detail-dialog[open] .intro').innerText());await page.locator('.detail-dialog[open] .dialog-top button').click();
  }
 }
 const moved=await page.evaluate(()=>window.xiamenAtlas.getState().world.northshore);assert.notDeepEqual(moved.motion,report.initial.motion);assert.equal(moved.overlaps,0);assert.equal(moved.invalidPeople,0);
 await page.locator('#scene-pause').click();const frozen=await page.evaluate(()=>window.xiamenAtlas.getState().world.northshore.regions.map(r=>r.seconds));await page.waitForTimeout(500);assert.deepEqual(await page.evaluate(()=>window.xiamenAtlas.getState().world.northshore.regions.map(r=>r.seconds)),frozen);await page.locator('#scene-pause').click();
 await page.locator('[data-time-choice="night"]').click();await page.waitForFunction(()=>!window.xiamenAtlas.getState().sky.transitioning);await capture('night');
 await page.locator('[data-time-choice="day"]').click();await page.waitForFunction(()=>!window.xiamenAtlas.getState().sky.transitioning);
 await page.locator('#render-quality').selectOption('high');await capture('high');
 for(const [width,height] of [[390,844],[320,740],[844,390]]){
  await page.setViewportSize({width,height});
  for(const id of [10,11]){if(!await page.locator('#district').isVisible())await page.locator('#open-explore').click();await page.locator('#district').selectOption(String(id));await page.waitForTimeout(1600);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);await capture('mobile-'+width+'-'+id);}
 }
 report.final=await page.evaluate(()=>window.xiamenAtlas.getState().world);assert.equal(report.final.scenes.length,12);assert.equal(report.final.overlaps,0);assert.equal(report.final.invalidPeople,0);assert.deepEqual(errors,[]);
}finally{report.errors=errors;await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({readyMs:report.readyMs,visits:report.visits,errors},null,2));await browser.close();}
