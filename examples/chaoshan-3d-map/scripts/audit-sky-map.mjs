import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PNG} from 'pngjs';

const out='RECON/sky-map';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const errors=[],states={};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5242/');
 await page.waitForFunction(()=>window.chaoshanAtlas?.getState().ready,null,{timeout:240000});
 await page.locator('#loading').waitFor({state:'hidden'});
 await page.waitForFunction(()=>window.chaoshanAtlas.getState().sky.photography.ready);
 const initial=await page.evaluate(()=>window.chaoshanAtlas.getState());
 await page.evaluate(()=>{window.chaoshanAtlas.setTime('day');window.chaoshanAtlas.resetView();});
 await page.waitForTimeout(3000);
 await page.screenshot({path:`${out}/overview.png`});
 await page.evaluate(()=>window.chaoshanAtlas.setTime('sunset'));
 await page.waitForTimeout(600);
 await page.screenshot({path:`${out}/overview-sunset.png`});
 await page.setViewportSize({width:390,height:844});
 await page.waitForTimeout(1200);
 await page.screenshot({path:`${out}/overview-mobile.png`});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.setViewportSize({width:1440,height:1000});
 await page.evaluate(()=>window.chaoshanAtlas.setTime('day'));
 const place=initial.places.find(p=>p.id==='small-park');
 assert.ok(place);
 await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),place.index);
 await page.waitForTimeout(3000);
 for(const mode of ['day','sunset','night']){
  await page.evaluate(mode=>window.chaoshanAtlas.setTime(mode),mode);
  await page.waitForTimeout(600);
  states[mode]=(await page.evaluate(()=>window.chaoshanAtlas.getState())).sky;
  assert.equal(states[mode].auto,false);
  assert.equal(states[mode].photography.visible,mode!=='night');
  const png=PNG.sync.read(await page.screenshot({path:`${out}/${mode}.png`}));
  const colors=new Set();
  for(let y=250;y<750;y+=3)for(let x=400;x<1000;x+=3){const i=(y*png.width+x)*4;colors.add(`${png.data[i]},${png.data[i+1]},${png.data[i+2]}`);}
  assert.ok(colors.size>500,`${mode} map must remain nonblank`);
 }
 await page.evaluate(()=>window.chaoshanAtlas.setTime('day'));
 await page.setViewportSize({width:390,height:844});
 await page.waitForTimeout(1200);
 await page.screenshot({path:`${out}/mobile.png`});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.equal(errors.length,0);
 await fs.writeFile(`${out}/results.json`,JSON.stringify({states,errors},null,2));
 console.log('PASS actual map: day, sunset, night, mobile and photographic loading');
}finally{await browser.close();}
