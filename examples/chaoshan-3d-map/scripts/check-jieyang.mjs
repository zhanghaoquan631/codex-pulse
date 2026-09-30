import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {jieyangCollectionIds} from '../jieyang-places.mjs';

const out=new URL('../RECON/jieyang-qa/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
const layout=()=>page.evaluate(()=>{
  const a=document.querySelector('.map-controls').getBoundingClientRect(),b=document.getElementById('location-card').getBoundingClientRect(),t=document.getElementById('location-en');
  return {overlap:a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top,overflow:document.documentElement.scrollWidth>innerWidth||t.scrollWidth>t.clientWidth+1};
});
const pixels=()=>page.evaluate(async()=>{
  const canvas=document.querySelector('canvas'),c=document.createElement('canvas');c.width=160;c.height=100;const ctx=c.getContext('2d');
  const sample=()=>new Promise(resolve=>requestAnimationFrame(()=>{ctx.drawImage(canvas,0,0,160,100);resolve(Array.from(ctx.getImageData(0,0,160,100).data));}));
  const a=await sample();await new Promise(r=>setTimeout(r,1400));const b=await sample();let changed=0;const colors=new Set();
  for(let i=0;i<b.length;i+=4){colors.add(b.slice(i,i+3).join(','));if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>20)changed++;}
  return {changed,colors:colors.size};
});
try{
  await page.goto('http://127.0.0.1:5242/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.chaoshanAtlas?.getState().ready,{},{timeout:180000});
  const stats=await page.evaluate(()=>window.chaoshanAtlas.getState());
  const counts=['huilai','raoping','chaoan','chenghai','chaoyang','chaonan','puning'].map(k=>stats[k].people);
  assert.deepEqual(counts,[333,399,446,447,428,450,533]);assert.equal(stats.jieyang.places,18);
  const placement=stats.jieyang.coverage;
  for(let i=0;i<placement.length;i++){
    const a=placement[i];assert.ok([a.x,a.z].every(Number.isFinite));assert.ok(a.paths>=2);
    for(const b of [...placement.slice(0,i),...['chaoyang','chaonan','puning'].flatMap(k=>stats[k].coverage)])
      assert.ok(Math.abs(a.x-b.x)>=(a.width+b.width)/2||Math.abs(a.z-b.z)>=(a.depth+b.depth)/2,a.id+' overlaps '+b.id);
  }
  console.log(JSON.stringify({counts,newScenes:stats.jieyang.places,newPeople:stats.jieyang.people}));
  await page.getByRole('button',{name:'揭阳景点',exact:true}).click();
  assert.equal(await page.locator('#places button:visible').count(),33);
  const indices=await page.locator('#places button:visible .place-number').allTextContents();
  const sheet=new PNG({width:1280,height:1800});
  for(let i=0;i<indices.length;i++){
    await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),Number(indices[i])-1);await page.waitForTimeout(2800);
    assert.equal(await page.evaluate(()=>window.chaoshanAtlas.getState().selected),jieyangCollectionIds[i]);
    assert.equal(await page.locator('#places button:visible').count(),33);
    assert.equal(await page.locator('[data-category="jieyang"]').getAttribute('aria-pressed'),'true');
    if(jieyangCollectionIds[i].startsWith('jieyang-')&&jieyangCollectionIds[i]!=='jieyang-tower')assert.deepEqual(await layout(),{overlap:false,overflow:false});
    const buffer=await page.screenshot(),png=PNG.sync.read(buffer);
    for(let y=0;y<200;y++)for(let x=0;x<320;x++){const src=(Math.floor(y*png.height/200)*png.width+Math.floor(x*png.width/320))*4,dst=((Math.floor(i/4)*200+y)*1280+i%4*320+x)*4;png.data.copy(sheet.data,dst,src,src+4);}
    await fs.writeFile(new URL(i+'-'+jieyangCollectionIds[i]+'.png',out),buffer);
    console.log('verified '+jieyangCollectionIds[i]);
  }
  await fs.writeFile(new URL('jieyang-sheet.png',out),PNG.sync.write(sheet));
  await page.evaluate(()=>window.chaoshanAtlas.focusPlace(260));await page.waitForTimeout(2800);
  const desktopPixels=await pixels();assert.ok(desktopPixels.colors>100&&desktopPixels.changed>0);
  const mobile=[];
  for(const [width,height,index,name] of [[390,844,248,'mobile-gate'],[390,844,256,'mobile-jade'],[390,844,260,'mobile-fountain'],[900,700,265,'tablet-pagoda']]){
    await page.setViewportSize({width,height});await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),index);await page.waitForTimeout(2800);
    const check=await layout(),raster=await pixels();assert.deepEqual(check,{overlap:false,overflow:false});assert.ok(raster.colors>100&&raster.changed>0);
    await fs.writeFile(new URL(name+'.png',out),await page.screenshot());mobile.push({name,...check,...raster});
  }
  assert.deepEqual(errors,[]);
  const results={counts,newScenes:18,newPeople:stats.jieyang.people,collection:33,desktopPixels,mobile,errors};
  await fs.writeFile(new URL('results.json',out),JSON.stringify(results,null,2));await fs.writeFile(new URL('placement.json',out),JSON.stringify(placement,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}
