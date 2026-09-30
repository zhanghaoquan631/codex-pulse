import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {regionalFacts} from '../regional-facts.mjs';

const output=new URL('../RECON/regional-facts-ui/',import.meta.url);await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'}),errors=[],results=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(30000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5242/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.chaoshanAtlas?.getState().ready,null,{timeout:240000});
 await page.locator('#loading').waitFor({state:'hidden',timeout:240000});
 await page.locator('[data-category="district"]').click();
 await page.locator('#places .place[title="汕头市 · 图片与介绍"]').click();
 await page.locator('.regional-facts').waitFor({state:'visible'});
 assert.match(await page.locator('.regional-facts').innerText(),/19,636/);
 assert.match(await page.locator('.regional-facts').innerText(),/2026年上半年/);
 await page.screenshot({path:fileURLToPath(new URL('shantou-desktop.png',output))});
 await page.locator('.regional-facts-sources summary').click();
 assert.match(await page.locator('.regional-facts-sources').innerText(),/2026-09-08/);
 await page.keyboard.press('Escape');
 results.push({test:'district list opens real statistics with exact half-year income and publication date',pass:true});
 for(const name of Object.keys(regionalFacts)){
  await page.evaluate(name=>document.querySelector(`#places .place[title="${name} · 图片与介绍"]`).click(),name);
  assert.equal(await page.locator('#photo-detail-title').textContent(),name);
  assert.ok(await page.locator('.regional-facts').isVisible());
  assert.match(await page.locator('.regional-facts-scope').textContent(),/统计范围/);
  const anchors=await page.locator('.regional-facts a').evaluateAll(a=>a.map(x=>({href:x.href,rel:x.rel,target:x.target})));
  assert.ok(anchors.length>0&&anchors.every(a=>/\.gov\.cn\//.test(a.href)&&a.rel.includes('noopener')&&a.target==='_blank'));
  await page.keyboard.press('Escape');
 }
 results.push({test:'all twelve districts, scopes and government source links',pass:true});
 await page.evaluate(()=>document.querySelector('#places .place[title="小公园 · 图片与介绍"]').click());
 assert.equal(await page.locator('.regional-facts').isVisible(),false);
 await page.waitForFunction(()=>document.querySelector('.photo-zoom img')?.naturalWidth>0);
 assert.match(await page.locator('.photo-zoom img').getAttribute('src'),/small-park-user/);
 await page.keyboard.press('Escape');
 await page.locator('[data-category="food"]').click();await page.locator('#places .place:visible').first().click();
 assert.equal(await page.locator('.regional-facts').isVisible(),false);
 assert.ok(await page.locator('.detail-dishes').isVisible());await page.keyboard.press('Escape');
 results.push({test:'existing attraction photos and food selector remain separate',pass:true});
 await page.setViewportSize({width:390,height:844});
 for(const name of Object.keys(regionalFacts)){
  await page.evaluate(name=>document.querySelector(`#places .place[title="${name} · 图片与介绍"]`).click(),name);
  const dimensions=await page.locator('.place-detail-viewer').evaluate(d=>({width:d.clientWidth,scroll:d.scrollWidth,left:d.getBoundingClientRect().left,right:d.getBoundingClientRect().right,viewport:innerWidth}));
  assert.ok(dimensions.scroll<=dimensions.width+1&&dimensions.left>=0&&dimensions.right<=dimensions.viewport,name);
  const values=await page.locator('.regional-facts-value').evaluateAll(nodes=>nodes.map(node=>{
   const range=document.createRange();range.selectNode(node.firstChild);
   return {lines:range.getClientRects().length,scroll:node.scrollWidth,width:node.clientWidth};
  }));
  assert.ok(values.every(value=>value.lines===1&&value.scroll<=value.width+1),`${name}: numbers must not wrap or overflow`);
  if(name==='普宁市')await page.screenshot({path:fileURLToPath(new URL('puning-mobile.png',output))});
  if(name==='澄海区'){
   assert.equal(await page.locator('.regional-facts-value.is-unavailable').count(),2);
   await page.screenshot({path:fileURLToPath(new URL('chenghai-unverified-mobile.png',output))});
  }
  await page.keyboard.press('Escape');
 }
 results.push({test:'all twelve mobile dialogs fit, missing figures are not zero',pass:true});
 const sample=()=>page.locator('#viewport canvas').evaluate(canvas=>new Promise(resolve=>requestAnimationFrame(()=>{
  const c=document.createElement('canvas');c.width=120;c.height=80;const ctx=c.getContext('2d');ctx.drawImage(canvas,0,0,120,80);
  const pixels=ctx.getImageData(0,0,120,80).data;const colors=new Set();let sum=0;for(let i=0;i<pixels.length;i+=4){colors.add(pixels.slice(i,i+3).join(','));sum+=pixels[i]*i+pixels[i+1];}resolve({colors:colors.size,sum});
 })));
 const before=await sample();await page.waitForTimeout(1600);const after=await sample();assert.ok(before.colors>50&&after.colors>50);assert.notEqual(before.sum,after.sum);
 await page.screenshot({path:fileURLToPath(new URL('map-mobile.png',output))});
 results.push({test:'map remains nonblank and animated',pass:true,colors:after.colors});
 assert.equal(errors.length,0);console.log(JSON.stringify({results,errors},null,2));
 await fs.writeFile(new URL('results.json',output),JSON.stringify({results,errors},null,2));
}finally{await browser.close();}
