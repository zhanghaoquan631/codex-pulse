import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';

const out='qa/cross-map',report={};await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
 for(const [name,port,key] of [['chaoshan',5242,'chaoshanAtlas'],['xiamen',5243,'xiamenAtlas']]){
  const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.setDefaultTimeout(30000);
  page.on('pageerror',e=>errors.push(e.message));
  const state=()=>page.evaluate(k=>window[k].getState(),key);
  const start=Date.now();await page.goto('http://127.0.0.1:'+port+'/');await page.waitForFunction(k=>window[k]?.getState().ready,key,{timeout:240000});await page.waitForTimeout(1500);
  const before=await state();report[name]={loadMs:Date.now()-start,initialRender:before.render,budget:before.signBudget||before.detailBudget};
  async function capture(label){
   const canvas=PNG.sync.read(await page.locator('#viewport canvas').screenshot()),colors=new Set();
   for(let i=0;i<canvas.data.length;i+=40)colors.add(canvas.data.slice(i,i+3).join(','));assert.ok(colors.size>100);
   await page.screenshot({path:out+'/'+name+'-'+label+'.png'});return colors.size;
  }
  await capture('overview');
  if(name==='chaoshan'){
   assert.equal(before.places.length,266);
   await page.locator('[data-category="huilai"]').click();
   const lighthouse=before.places.find(p=>p.name==='石碑山灯塔');
   await page.selectOption('#district',String(lighthouse.index));await page.waitForTimeout(2400);
   await capture('huilai');
   await page.selectOption('#tour-duration','9');await page.click('#tour');
   assert.equal((await state()).selected,lighthouse.id);assert.ok((await state()).tour.total>=16);
   const current=(await state()).tour.current;await page.waitForFunction(current=>window.chaoshanAtlas.getState().tour.current!==current,current,{timeout:18000});
   await page.click('#destination-play');const elapsed=(await state()).tour.elapsed;await page.waitForTimeout(900);assert.equal((await state()).tour.elapsed,elapsed);
   const pausedPlace=(await state()).selected;await page.click('#destination-play');assert.equal((await state()).selected,pausedPlace);
   await page.click('#destination-next');assert.notEqual((await state()).selected,pausedPlace);await page.click('#destination-play');
   await page.locator('.tour-filter button[data-all="true"]').click();await page.locator('.place-search').fill('普宁 学宫');
   assert.equal(await page.locator('#places .place:not([hidden])').count(),1);await page.locator('.place-search').press('Enter');
   await page.locator('.place-detail-viewer').waitFor({state:'visible'});await page.keyboard.press('Escape');await page.waitForTimeout(2400);
   await page.locator('.place-search').fill('');await page.selectOption('#district',String(before.places.find(p=>p.id==='small-park').index));await page.waitForTimeout(2400);await capture('small-park');
   report[name].closeRender=(await state()).render;
  }else{
   assert.ok(before.discovery.indexed>230);assert.equal(before.travel.hotels,129);assert.equal(before.travel.location.enabled,false);
   for(const [query,expected] of [['建南楼群','建南楼群'],['三丘田','三丘田'],['菲尔仕','菲尔仕']]){
    await page.locator('.place-search').fill(query);assert.ok(await page.locator('#places .place:not([hidden])').count()>0);
    await page.locator('.place-search').press('Enter');await page.waitForTimeout(1500);
    if(query==='建南楼群')assert.equal(await page.locator('#location-name').textContent(),expected);
    else {assert.ok((await page.locator('.travel-body').textContent()).includes(expected));await page.locator('#travel-close').click();}
   }
   await page.locator('.place-search').fill('');await page.selectOption('#district','4');await page.selectOption('#campus-stops','芙蓉湖');await page.waitForTimeout(1500);await capture('campus');
   await page.selectOption('#tour-duration','9');await page.click('#destination-play');await page.waitForTimeout(2500);await page.click('#destination-play');
   const elapsed=(await state()).tour.elapsed;await page.waitForTimeout(800);assert.equal((await state()).tour.elapsed,elapsed);
   await page.click('#destination-play');await page.waitForFunction(()=>document.querySelector('#location-name').textContent==='图书馆',null,{timeout:16000});await page.click('#destination-play');
   await page.locator('.map-layers summary').click();
   for(const [label,layer] of [['游人','people'],['车流','traffic'],['船舶','boats'],['背景山林','forest']]){
    const control=page.getByRole('checkbox',{name:label,exact:true});await control.uncheck();await page.waitForTimeout(200);const s=(await state()).layers[layer];assert.ok(s.total>0);assert.equal(s.visible,0);await control.check();assert.equal((await state()).layers[layer].visible,s.total);
   }
   await page.locator('.map-layers summary').click();
   await page.selectOption('#render-quality','high');await page.waitForTimeout(350);assert.equal((await state()).detailBudget.simplified,0);await page.selectOption('#render-quality','balanced');
   report[name].indexed=before.discovery.indexed;report[name].layers=(await state()).layers;
  }
  const pixels=await page.locator('#viewport canvas').evaluate(async canvas=>{
   const c=document.createElement('canvas');c.width=180;c.height=120;const ctx=c.getContext('2d');
   const snap=()=>new Promise(resolve=>requestAnimationFrame(()=>{ctx.drawImage(canvas,0,0,180,120);resolve(ctx.getImageData(0,0,180,120).data);}));
   const a=await snap();await new Promise(r=>setTimeout(r,1100));const b=await snap();let changed=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>12)changed++;return changed;
  });assert.ok(pixels>0);report[name].movingPixels=pixels;
  for(const [width,height] of [[390,844],[320,740],[844,390]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(700);
   if(name==='chaoshan')await page.evaluate(()=>window.chaoshanAtlas.focusPlace(1));
   else {await page.click('#open-explore');await page.selectOption('#district','4');}
   await page.waitForTimeout(2500);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
   const bounds=await page.locator('.destination-controls button,#tour-duration').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
   assert.ok(bounds.every(r=>r.x>=0&&r.y>=0&&r.right<=width&&r.bottom<=height),'Tour controls remain reachable '+name+width);
   const overlap=await page.evaluate(()=>{const a=document.querySelector('.location-card').getBoundingClientRect(),b=document.querySelector('.map-controls').getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;});
   assert.equal(overlap,false,'Zoom controls overlap '+name+width);await capture('mobile-'+width);
  }
  assert.equal(errors.length,0);report[name].errors=errors;await page.close();console.log(JSON.stringify({name,...report[name]}));
 }
}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();}
