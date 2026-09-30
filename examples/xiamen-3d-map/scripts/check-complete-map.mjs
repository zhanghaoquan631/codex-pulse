import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
const out='qa/complete-map';await mkdir(out,{recursive:true});const report={errors:[],areas:[]};
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});page.on('pageerror',e=>report.errors.push(e.message));
 const start=Date.now();await page.goto('http://127.0.0.1:5243');await page.waitForFunction(()=>window.xiamenAtlas?.getState().ready,null,{timeout:180000});report.readyMs=Date.now()-start;await page.waitForTimeout(2500);
 const compact=()=>page.evaluate(()=>{const s=window.xiamenAtlas.getState();return {tour:s.tour,travelTour:s.travel.tour,selected:s.selected,render:s.render,location:s.travel.location};});
 report.coverage=await page.evaluate(()=>window.xiamenCoverage());assert.equal(report.coverage.records,8857);assert.ok(report.coverage.context.terminalRibs>10);
 report.overview=await page.evaluate(()=>window.xiamenOverview());assert.ok(report.overview.island>=70);assert.equal(new Set(report.overview.catalog.map(p=>p.id)).size,report.overview.total);assert.equal(report.overview.catalog.filter(p=>p.island).length,report.overview.island);
 const overviewText=await page.locator('.overview-label').allTextContents();assert.ok(overviewText.some(s=>s.includes('鼓浪屿')));report.labels=overviewText;await page.screenshot({path:out+'/overview.png'});
 await page.click('#overview-catalog');assert.equal(await page.locator('.catalog-row').count(),report.overview.total);await page.getByRole('button',{name:'关闭地点目录',exact:true}).click();
 for(let i=0;i<12;i++){
  await page.selectOption('#district',String(i));await page.waitForTimeout(1800);
  const png=PNG.sync.read(await page.locator('#viewport canvas').screenshot()),colors=new Set();for(let k=0;k<png.data.length;k+=40)colors.add(`${png.data[k]>>3},${png.data[k+1]>>3},${png.data[k+2]>>3}`);assert.ok(colors.size>100,`Nonblank area ${i}`);report.areas.push({i,colors:colors.size,...(await compact()).render});await page.screenshot({path:`${out}/area-${i}.png`});
 }
 await page.click('#travel-docks');await page.locator('[data-place=dongdu]').click();await page.waitForTimeout(1800);await page.screenshot({path:out+'/dongdu.png'});await page.click('#travel-close');
 await page.click('#island-tour-launch');await page.waitForTimeout(1600);let s=await compact();assert.equal(s.tour.total,report.overview.island);assert.equal(s.travelTour.total,s.tour.total);assert.ok(s.tour.running);assert.equal(s.travelTour.running,true);
 await page.click('#tour');s=await compact();assert.equal(s.tour.running,false);assert.equal(s.travelTour.running,false);const elapsed=s.tour.elapsed;await page.waitForTimeout(1200);assert.equal((await compact()).tour.elapsed,elapsed);
 const oldIndex=s.tour.index;await page.click('#travel-next');assert.equal((await compact()).tour.index,(oldIndex+1)%s.tour.total);
 await page.locator('.travel-tour-bar select').selectOption('30');assert.equal((await compact()).tour.seconds,30);await page.click('#tour');assert.ok((await compact()).travelTour.running);await page.waitForTimeout(800);assert.ok((await compact()).tour.elapsed>elapsed||((await compact()).tour.index!==oldIndex));await page.click('#tour');await page.click('#travel-close');
 await page.click('#home');await page.selectOption('#tour-scope','all');await page.click('#tour');assert.equal((await compact()).tour.total,report.overview.total);await page.click('#tour');
 for(const [width,height] of [[390,844],[320,740],[844,390]]){
  await page.setViewportSize({width,height});await page.click('#home');await page.waitForTimeout(2200);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);assert.ok(await page.locator('#overview-catalog').isVisible());await page.screenshot({path:`${out}/overview-${width}.png`});
  await page.click('#travel-docks');await page.locator('[data-place=dongdu]').click();await page.waitForTimeout(1800);await page.screenshot({path:`${out}/dongdu-${width}.png`});await page.click('#travel-close');
 }
 const moving=await page.locator('#viewport canvas').evaluate(async canvas=>{const c=document.createElement('canvas');c.width=180;c.height=120;const ctx=c.getContext('2d');const snap=()=>new Promise(resolve=>requestAnimationFrame(()=>{ctx.drawImage(canvas,0,0,180,120);resolve(ctx.getImageData(0,0,180,120).data);}));const a=await snap();await new Promise(r=>setTimeout(r,1200));const b=await snap();let n=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>12)n++;return n;});assert.ok(moving>0);report.movingPixels=moving;report.tour=(await compact()).tour;
 assert.equal(report.errors.length,0);assert.equal((await compact()).location.enabled,false);report.passed=true;
}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,overview:report.overview&&{total:report.overview.total,island:report.overview.island}}));await browser.close();}
