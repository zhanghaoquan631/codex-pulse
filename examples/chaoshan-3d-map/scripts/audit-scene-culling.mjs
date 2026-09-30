import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out=new URL('../RECON/culling-audit/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5242/');await page.waitForFunction(()=>window.chaoshanAtlas?.getState().ready,null,{timeout:180000});await page.locator('#loading').waitFor({state:'hidden'});
 const places=await page.evaluate(()=>window.chaoshanAtlas.getState().places),checks=[];assert.equal(places.length,266);
 async function pixels(){return page.locator('#viewport canvas').evaluate(canvas=>new Promise(resolve=>requestAnimationFrame(()=>{const c=document.createElement('canvas');c.width=100;c.height=70;const ctx=c.getContext('2d');ctx.drawImage(canvas,canvas.width*.26,canvas.height*.18,canvas.width*.48,canvas.height*.57,0,0,100,70);const data=ctx.getImageData(0,0,100,70).data,colors=new Set();for(let i=0;i<data.length;i+=4)colors.add(data.slice(i,i+3).join(','));resolve(colors.size);})));}
 async function shot(name){await page.screenshot({path:new URL(name+'.png',out).pathname.replace(/^\/([A-Za-z]:)/,'$1'),timeout:120000});}
 for(const p of places){
  await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),p.index);await page.waitForTimeout(100);
  const s=await page.evaluate(()=>window.chaoshanAtlas.getState()),colors=await pixels();
  assert.equal(s.selected,p.id);assert.ok(colors>30,p.id+' blank');assert.ok(s.render.calls>0);
  checks.push({id:p.id,colors});if(p.index%40===0)console.log('CHECK '+p.index+'/266');
 }
 await page.evaluate(()=>window.chaoshanAtlas.resetView());await page.waitForTimeout(300);assert.ok(await pixels()>100);await shot('overview');
 for(const v of [{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(v);await page.evaluate(()=>window.chaoshanAtlas.focusPlace(131));await page.waitForTimeout(200);assert.ok(await pixels()>30);await shot('mobile-'+v.width);
 }
 for(const name of ['车流','街景','山林','航空轨道']){await page.getByRole('checkbox',{name,exact:true}).uncheck();await page.getByRole('checkbox',{name,exact:true}).check();}
 await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>window.chaoshanAtlas.focusPlace(1));await page.waitForTimeout(200);assert.ok(await pixels()>100);await shot('return-small-park');
 assert.deepEqual(errors,[]);await fs.writeFile(new URL('results.json',out),JSON.stringify({places:checks.length,checks,errors},null,2));console.log('PASS all 266 scenes, overview return, mobile and layer restoration');
}finally{await browser.close();}
