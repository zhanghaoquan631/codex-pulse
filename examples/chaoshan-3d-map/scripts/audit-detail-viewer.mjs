import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out=new URL('../RECON/detail-viewer/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'}),results=[],errors=[];
const pathname=url=>url.pathname.replace(/^\/([A-Za-z]:)/,'$1');
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.setDefaultTimeout(20000);
 page.on('pageerror',e=>errors.push(e.message));const requests=[];page.on('request',r=>{if(/\/photos\/|detail-photos.json/.test(r.url()))requests.push(r.url());});
 const start=Date.now();await page.goto('http://127.0.0.1:5242/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.chaoshanAtlas?.getState().ready,null,{timeout:240000});await page.locator('#loading').waitFor({state:'hidden'});
 assert.equal(requests.length,0);results.push({name:'no initial photo downloads',pass:true,readyMs:Date.now()-start});
 const places=(await page.evaluate(()=>window.chaoshanAtlas.getState())).places;assert.equal(places.length,266);
 await page.locator('#places .place').filter({hasText:'小公园'}).click();
 await page.waitForFunction(()=>document.querySelector('.photo-zoom img')?.naturalWidth>0);
 assert.equal(await page.locator('#photo-detail-title').textContent(),'小公园');
 assert.match(await page.locator('.photo-zoom img').getAttribute('src'),/small-park-user/);
 await page.screenshot({path:pathname(new URL('small-park-desktop.png',out))});
 await page.locator('.photo-zoom').click();assert.ok(await page.locator('.detail-lightbox').isVisible());
 await page.keyboard.press('Escape');assert.ok(await page.locator('.place-detail-viewer').isVisible());
 await page.keyboard.press('Escape');assert.ok(!await page.locator('.place-detail-viewer').isVisible());
 results.push({name:'pavilion photo, full-size image and Escape',pass:true});
 await page.locator('[data-category="food"]').click();await page.locator('#places .place:visible').first().click();
 await page.locator('.detail-dishes button').filter({hasText:'蚝烙'}).click();
 await page.waitForFunction(()=>document.querySelector('.photo-zoom img')?.naturalWidth>0&&document.querySelector('.photo-zoom img')?.alt==='潮汕蚝烙');
 await page.screenshot({path:pathname(new URL('oyster-desktop.png',out))});
 assert.match(await page.locator('.detail-copy').textContent(),/鲜蚝/);await page.keyboard.press('Escape');
 await page.locator('.food-inspect').click();assert.ok(await page.locator('.food-viewer').isVisible());
 await page.waitForTimeout(900);await page.keyboard.press('Escape');results.push({name:'food photo switch and existing 3D viewer',pass:true});
 // Check every entry has the same real entry point, including later regional lists.
 const all=await page.evaluate(async()=>{
  const entries=[...document.querySelectorAll('#places .place')],seen=[];
  for(const b of entries){b.click();const d=document.querySelector('.place-detail-viewer');seen.push({name:document.querySelector('#photo-detail-title').textContent,open:d.open,intro:document.querySelector('.detail-copy p').textContent});d.close();await new Promise(r=>setTimeout(r,0));}
  return seen;
 });
 assert.equal(all.length,266);assert.ok(all.every(p=>p.open&&p.name&&p.intro));results.push({name:'all 266 entry detail dialogs',pass:true,count:all.length});
 const index=places.find(p=>p.id==='small-park').index;await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),index);await page.waitForTimeout(2400);
 await page.locator('#location-name').focus();await page.keyboard.press('Enter');assert.ok(await page.locator('.place-detail-viewer').isVisible());await page.keyboard.press('Escape');
 await page.evaluate(()=>document.querySelector('.map-label[aria-label^="广济桥，"]').click());assert.equal(await page.locator('#photo-detail-title').textContent(),'广济桥');
 await page.waitForFunction(()=>document.querySelector('.photo-zoom img')?.naturalWidth>0);await page.keyboard.press('Escape');
 results.push({name:'card keyboard and map label entry points',pass:true});
 await page.setViewportSize({width:390,height:844});await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),index);await page.waitForTimeout(2300);
 await page.locator('.photo-inspect').click();await page.waitForFunction(()=>document.querySelector('.photo-zoom img')?.naturalWidth>0);
 const mobile=await page.locator('.place-detail-viewer').evaluate(d=>{const r=d.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,overflow:d.scrollWidth>d.clientWidth+1};});
 assert.ok(mobile.left>=0&&mobile.right<=mobile.width&&!mobile.overflow);await page.screenshot({path:pathname(new URL('small-park-mobile.png',out))});
 await page.locator('.photo-zoom').click();await page.screenshot({path:pathname(new URL('photo-fullscreen-mobile.png',out))});await page.keyboard.press('Escape');await page.keyboard.press('Escape');results.push({name:'mobile fitting and image enlargement',pass:true,mobile});
 const raster=await page.locator('#viewport canvas').evaluate(canvas=>new Promise(resolve=>requestAnimationFrame(()=>{const c=document.createElement('canvas');c.width=120;c.height=80;const ctx=c.getContext('2d');ctx.drawImage(canvas,0,0,120,80);const pixels=ctx.getImageData(0,0,120,80).data,colors=new Set();for(let i=0;i<pixels.length;i+=4)colors.add(pixels.slice(i,i+3).join(','));resolve(colors.size);})));
 assert.ok(raster>50);results.push({name:'map remains rendered after closing detail',pass:true,colors:raster});
 assert.equal(errors.length,0);console.log(JSON.stringify(results,null,2));
 await fs.writeFile(new URL('results.json',out),JSON.stringify({results,errors},null,2));
}finally{await browser.close();}
