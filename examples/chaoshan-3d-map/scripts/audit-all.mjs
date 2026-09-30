import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=new URL('../RECON/full-audit/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'});
const results=[],errors=[],network=[];
let page;
const state=()=>page.evaluate(()=>window.chaoshanAtlas.getState());
async function check(name,fn){try{const detail=await fn();results.push({name,pass:true,detail});console.log('PASS '+name);}catch(e){results.push({name,pass:false,error:e.message});console.log('FAIL '+name+': '+e.message);}}
async function ready(options={}){
 const context=await browser.newContext({viewport:{width:1440,height:900},...options});page=await context.newPage();page.setDefaultTimeout(15000);
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&r.url().startsWith('http://127.0.0.1'))network.push({url:r.url(),status:r.status()});});
 const started=Date.now();await page.goto('http://127.0.0.1:5242/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.chaoshanAtlas?.getState().ready,null,{timeout:240000});await page.locator('#loading').waitFor({state:'hidden'});
 console.log('READY '+(Date.now()-started)+'ms');return {context,loadMs:Date.now()-started,startup:(await state()).startup};
}
async function focus(index,delay=2350){await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),index);await page.waitForTimeout(delay);}
async function screenshot(name){await page.screenshot({path:new URL(name+'.png',out).pathname.replace(/^\/([A-Za-z]:)/,'$1'),timeout:120000});}
async function raster(selector='#viewport canvas'){
 return page.locator(selector).evaluate(async canvas=>{
  const c=document.createElement('canvas');c.width=160;c.height=100;const ctx=c.getContext('2d');
  const sample=()=>new Promise(resolve=>requestAnimationFrame(()=>{ctx.drawImage(canvas,0,0,160,100);resolve(Array.from(ctx.getImageData(0,0,160,100).data));}));
  const a=await sample();await new Promise(r=>setTimeout(r,800));const b=await sample();const colors=new Set();let changed=0;
  for(let i=0;i<b.length;i+=4){colors.add(b.slice(i,i+3).join(','));if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>20)changed++;}
  return {colors:colors.size,changed};
 });
}
const layout=()=>page.evaluate(()=>{
 const a=document.getElementById('location-card').getBoundingClientRect(),b=document.querySelector('.map-controls').getBoundingClientRect();
 const t=document.getElementById('location-en');return {overlap:a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top,overflow:document.documentElement.scrollWidth>innerWidth||t.scrollWidth>t.clientWidth+1};
});
try{
 const normal=await ready();const initial=await state();assert.equal(initial.places.length,266);
 await check('all 17 category buttons and counts',async()=>{
  const buttons=page.locator('[data-category]'),counts={};
  for(let i=0;i<await buttons.count();i++){const b=buttons.nth(i);await b.click();const n=await page.locator('#places button:visible').count();assert.ok(n>0);assert.equal(await page.locator('#place-count').textContent(),n+'处');counts[await b.getAttribute('data-category')]=n;}
  assert.equal(counts.jieyang,33);assert.equal(counts.puning,20);assert.equal(counts.district,12);return counts;
 });
 await check('Chinese/English search and empty state',async()=>{
  await page.locator('[data-category="jieyang"]').click();await page.getByRole('searchbox').fill('学宫');assert.equal(await page.locator('#places button:visible').count(),1);
  await page.getByRole('searchbox').fill('JIEYANG academy');assert.equal(await page.locator('#places button:visible').count(),1);
  await page.getByRole('searchbox').fill('不存在的地点');assert.equal(await page.locator('#places button:visible').count(),0);assert.ok(await page.locator('.place-empty').isVisible());
  await page.locator('[data-category="puning"]').click();assert.equal(await page.getByRole('searchbox').inputValue(),'');assert.equal(await page.locator('#places button:visible').count(),20);
 });
 await check('dropdown, list and map pin navigation',async()=>{
  await page.locator('#district').selectOption('248');await page.waitForTimeout(2400);assert.equal((await state()).selected,'jieyang-jinxian');
  await page.getByRole('searchbox').fill('学宫');await page.locator('#places button:visible').click();assert.equal((await state()).selected,'jieyang-academy');assert.ok(await page.locator('.place-detail-viewer').isVisible());await page.keyboard.press('Escape');await page.waitForTimeout(2400);
  const pin=page.locator('.map-pin:visible').first();await pin.click();assert.ok((await state()).selected);await screenshot('desktop-navigation');
 });
 await check('time modes and reversible material emission',async()=>{
  await focus(248);const samples={};
  for(const mode of ['night','sunset','day']){await page.locator('[data-time-choice="'+mode+'"]').click();await page.waitForTimeout(350);assert.equal((await state()).time,mode);assert.equal((await state()).ivoryEmission,mode==='night'?'c58a47':'000000');samples[mode]=await raster();assert.ok(samples[mode].colors>100);await screenshot('gate-'+mode);}
  return samples;
 });
 await check('zoom buttons preserve selection',async()=>{
  const before=await state();await page.locator('#zoom-in').click();assert.ok((await state()).zoom>before.zoom);await page.locator('#zoom-out').click();assert.ok(Math.abs((await state()).zoom-before.zoom)<1e-6);assert.equal((await state()).selected,before.selected);
 });
 await check('flat view, resize all kinds and north orientation',async()=>{
  await page.locator('#view-mode').click();await page.waitForTimeout(1600);assert.equal((await state()).view.flat,true);
  await page.setViewportSize({width:900,height:700});await page.waitForTimeout(300);assert.equal((await state()).view.flat,true);assert.ok((await state()).view.halfHeight<2);
  await page.locator('#north').click();await page.waitForTimeout(1400);const s=await state();assert.ok(Math.abs(s.view.position[0]-s.view.target[0])<1e-6);
  await page.locator('#view-mode').click();await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(1700);
 });
 await check('label and boundary toggles',async()=>{
  await page.locator('#toggle-labels').click();await page.waitForTimeout(100);assert.equal((await state()).labelsVisible,false);assert.equal(await page.locator('.map-label:visible,.map-pin:visible').count(),0);
  await page.locator('#toggle-labels').click();await page.waitForTimeout(100);assert.ok(await page.locator('.map-label:visible,.map-pin:visible').count()>0);
  await page.locator('#boundaries').click();assert.equal((await state()).boundariesVisible,true);await page.locator('#boundaries').click();assert.equal((await state()).boundariesVisible,false);
 });
 await check('all four layers change actual scene nodes',async()=>{
  for(const label of ['车流','街景','山林','航空轨道']){await page.getByRole('checkbox',{name:label,exact:true}).uncheck();assert.equal((await state()).layers[label].visible,0);await page.getByRole('checkbox',{name:label,exact:true}).check();const l=(await state()).layers[label];assert.equal(l.visible,l.total);}
 });
 await check('about modal, escape and close button',async()=>{
  await page.locator('#info').click();assert.ok(await page.locator('#about').isVisible());await page.keyboard.press('Escape');assert.equal(await page.locator('#about').isVisible(),false);
  await page.locator('#credits').click();await page.locator('#close-about').click();assert.equal(await page.locator('#about').isVisible(),false);
 });
 await check('fullscreen enter/exit',async()=>{
  await page.locator('#fullscreen').click();assert.ok(await page.evaluate(()=>!!document.fullscreenElement));await page.locator('#fullscreen').click();assert.equal(await page.evaluate(()=>!!document.fullscreenElement),false);
 });
 await check('keyboard pan and pointer drag never select a different place',async()=>{
  await focus(248);const before=await state();await page.locator('#viewport').focus();await page.keyboard.press('ArrowRight');const moved=await state();assert.ok(moved.view.target[0]>before.view.target[0]);assert.equal(moved.selected,before.selected);
  await page.mouse.move(760,470);await page.mouse.down();await page.mouse.move(835,505,{steps:12});await page.mouse.up();assert.equal((await state()).selected,before.selected);await page.keyboard.press('h');assert.equal((await state()).selected,null);await page.waitForTimeout(2400);
 });
 await check('tour advances, pauses in background and stops on manual zoom',async()=>{
  await page.locator('#tour').click();assert.equal((await state()).touring,true);await page.waitForTimeout(10800);assert.equal((await state()).selected,initial.places[1].id);
  const prior=await state();await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForTimeout(1800);await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});const after=await state();assert.ok(Math.abs(after.tourElapsed-prior.tourElapsed)<700);assert.equal(after.selected,prior.selected);
  await page.locator('#zoom-in').click();assert.equal((await state()).touring,false);
 });
 await check('all twelve food viewers and every dish tab render',async()=>{
  let dishes=0;for(const p of initial.places.filter(p=>p.kind==='food')){
   await focus(p.index);await page.locator('.food-inspect').click();const tabs=page.locator('.food-viewer [role="tab"]');
   for(let i=0;i<await tabs.count();i++){await tabs.nth(i).click();assert.equal(await tabs.nth(i).getAttribute('aria-selected'),'true');const px=await raster('.food-viewer canvas');assert.ok(px.colors>25,p.id+' dish '+i);dishes++;}
   await page.keyboard.press('Escape');assert.equal(await page.locator('.food-viewer canvas').count(),0);
  }return {places:12,dishes};
 });
 await check('mobile exploration, search, details and orientation',async()=>{
  await page.setViewportSize({width:390,height:844});await focus(260);await page.locator('#open-explore').click();assert.equal(await page.locator('#open-explore').getAttribute('aria-expanded'),'true');
  await page.locator('[data-category="jieyang"]').click();await page.getByRole('searchbox').fill('玉都');await page.locator('#places button:visible').click();assert.ok(await page.locator('.place-detail-viewer').isVisible());await page.keyboard.press('Escape');await page.waitForTimeout(2400);
  assert.equal(await page.locator('#open-explore').getAttribute('aria-expanded'),'false');await page.locator('.location-more>summary').click();await page.locator('.feature-detail summary').click();assert.deepEqual(await layout(),{overlap:false,overflow:false});await screenshot('mobile-jade-details');await page.locator('.feature-detail summary').click();await page.locator('.location-more>summary').click();
  await page.setViewportSize({width:844,height:390});await page.waitForTimeout(300);assert.deepEqual(await layout(),{overlap:false,overflow:false});await screenshot('landscape-jade');
  await page.setViewportSize({width:390,height:844});const px=await raster();assert.ok(px.colors>100&&px.changed>0);return px;
 });
 await check('WebGL context loss shows recoverable error instead of silent blank',async()=>{
  const supported=await page.locator('#viewport canvas').evaluate(c=>{const gl=c.getContext('webgl2'),ext=gl?.getExtension('WEBGL_lose_context');if(!ext)return false;ext.loseContext();return true;});
  assert.equal(supported,true);await page.locator('#retry').waitFor({state:'visible'});assert.equal(await page.locator('#loading').isVisible(),true);
 });
 await normal.context.close();
 const reduced=await ready({reducedMotion:'reduce'}),s=await state(),sheets=new Map(),sceneChecks=[];
 await check('all 266 places render, retain selection and fit UI',async()=>{
  for(const p of s.places){
   await focus(p.index,100);const st=await state();assert.equal(st.selected,p.id);
   const issues=await layout();if(issues.overlap||issues.overflow)sceneChecks.push({id:p.id,index:p.index,...issues});
   const buf=await page.screenshot({timeout:120000}),png=PNG.sync.read(buf);
   const colors=new Set();for(let y=200;y<650;y+=5)for(let x=330;x<1100;x+=5){const n=(y*png.width+x)*4;colors.add(png.data.subarray(n,n+3).toString('hex'));}assert.ok(colors.size>30,p.id+' has a blank canvas region');assert.ok(st.render.calls>0);
   if(!sheets.has(p.kind)){const count=s.places.filter(q=>q.kind===p.kind).length;sheets.set(p.kind,{png:new PNG({width:1280,height:Math.ceil(count/4)*200}),count:0});}
   const sheet=sheets.get(p.kind),i=sheet.count++;
   for(let y=0;y<200;y++)for(let x=0;x<320;x++){const src=(Math.floor(y*png.height/200)*png.width+Math.floor(x*png.width/320))*4,dst=((Math.floor(i/4)*200+y)*1280+i%4*320+x)*4;png.data.copy(sheet.png.data,dst,src,src+4);}
   if(p.index%20===0)console.log('SCENE '+p.index+'/'+s.places.length);
  }
  for(const [kind,sheet] of sheets)await fs.writeFile(new URL('all-'+kind+'.png',out),PNG.sync.write(sheet.png));
  await fs.writeFile(new URL('scene-layout-issues.json',out),JSON.stringify(sceneChecks,null,2));assert.equal(sceneChecks.length,0);return {places:s.places.length};
 });
 await check('reduced-motion freezes decorative life',async()=>{const before=(await state()).life.seconds;await page.waitForTimeout(1000);assert.equal((await state()).life.seconds,before);});
 await reduced.context.close();
 const report={at:new Date().toISOString(),loadMs:{normal:normal.loadMs,reduced:reduced.loadMs},startup:{normal:normal.startup,reduced:reduced.startup},results,errors,network};await fs.writeFile(new URL('results.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 if(results.some(r=>!r.pass)||errors.length||network.length)process.exitCode=1;
}finally{await browser.close();}
