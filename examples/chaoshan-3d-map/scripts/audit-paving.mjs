import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const out=new URL('../RECON/lod-audit/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const start=Date.now();await page.goto('http://127.0.0.1:5242/');await page.waitForFunction(()=>window.chaoshanAtlas?.getState().ready,null,{timeout:240000});await page.locator('#loading').waitFor({state:'hidden'});
 const state=await page.evaluate(()=>window.chaoshanAtlas.getState());console.log('STARTUP '+JSON.stringify({elapsed:Date.now()-start,...state.startup}));
 const frames=await page.evaluate(()=>new Promise(resolve=>{const times=[];let last=performance.now();function sample(now){times.push(now-last);last=now;if(times.length<60)requestAnimationFrame(sample);else resolve(times.sort((a,b)=>a-b));}requestAnimationFrame(sample);}));
 const report={elapsed:Date.now()-start,startup:state.startup,frameMedian:frames[30],frameP95:frames[57],shots:[],errors};
 report.gpu=await page.locator('#viewport canvas').evaluate(c=>{const gl=c.getContext('webgl2'),ext=gl?.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable';});
 for(const index of [1,112,114,130,131,140,248,260]){
  await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),index);await page.waitForTimeout(2400);
  const selected=await page.evaluate(()=>window.chaoshanAtlas.getState());
  if(index===131){const samples=await page.evaluate(()=>new Promise(resolve=>{const samples=[];let last=performance.now();function frame(now){samples.push(now-last);last=now;if(samples.length<45)requestAnimationFrame(frame);else resolve(samples.sort((a,b)=>a-b));}requestAnimationFrame(frame);}));report.closeFrameMedian=samples[22];report.closeFrameP95=samples[42];}
  const name=index+'-'+selected.selected;await page.screenshot({path:fileURLToPath(new URL(name+'.png',out)),timeout:120000});
  report.shots.push({index,id:selected.selected,render:selected.render});console.log('SHOT '+name);
 }
 for(const viewport of [{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(viewport);await page.waitForTimeout(500);await page.screenshot({path:fileURLToPath(new URL('mobile-'+viewport.width+'.png',out)),timeout:120000});
  if(viewport.height===390){
   const card=await page.locator('.location-card').boundingBox(),actions=await page.locator('.top-actions').boundingBox();
   assert.ok(card.y>=actions.y+actions.height,'Location card must clear the lighting controls');
   await page.locator('[data-category="jieyang"]').click();await page.getByRole('searchbox').fill('玉都');await page.locator('#places button:visible').click();assert.equal(await page.evaluate(()=>window.chaoshanAtlas.getState().selected),'jieyang-yangmei');await page.getByRole('checkbox',{name:'山林',exact:true}).uncheck();await page.getByRole('checkbox',{name:'山林',exact:true}).check();report.landscapeControlsReachable=true;
  }
 }
 assert.equal(errors.length,0);await fs.writeFile(new URL('results.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
