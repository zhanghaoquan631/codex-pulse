import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='RECON/service-life';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[];
function changed(a,b){let count=0;for(let i=0;i<a.data.length;i+=4)if(Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+Math.abs(a.data[i+2]-b.data[i+2])>25)count++;return count;}
try{
 const page=await browser.newPage({viewport:{width:1000,height:820}});page.on('pageerror',e=>errors.push(e.message));const closeups=[];
 for(const type of ['florist','soup','coffee','warehouse','school','home','supermarket','kfc']){
  await page.goto('http://127.0.0.1:5242/scripts/service-life-fixture.html?service='+type);await page.waitForFunction(()=>window.serviceFixture);
  await page.evaluate(()=>window.serviceFixture.tick(1));const a=PNG.sync.read(await page.screenshot());
  await page.evaluate(()=>window.serviceFixture.tick(11));const b=PNG.sync.read(await page.screenshot({path:out+'/'+type+'.png'}));
  const pixels=changed(a,b);assert.ok(pixels>20,type+' needs visibly changing limbs or position');closeups.push({type,changedPixels:pixels});
 }
 await page.setViewportSize({width:1440,height:1000});const start=Date.now();await page.goto('http://127.0.0.1:5242/');await page.waitForFunction(()=>window.chaoshanAtlas?.getState().ready,null,{timeout:240000});await page.locator('#loading').waitFor({state:'hidden'});const loadMs=Date.now()-start;
 const state=await page.evaluate(()=>window.chaoshanAtlas.getState());
 const residents=await page.evaluate(async()=>{
  const {communityActors}=await import('/community-actors.mjs');return communityActors.filter(a=>a.root.userData.serviceResident).map(a=>{
   const ancestors=[];for(let p=a.root;p;p=p.parent)if(p.name)ancestors.push(p.name);
   return {...a.root.userData.serviceResident,ancestors,limbs:a.root.children.length};
  });
 });
 assert.ok(residents.length>100);assert.ok(residents.every(p=>p.limbs>=5));
 for(const prefix of ['nanao','huilai','raoping','jiexi','chaoan','chenghai','chaoyang','chaonan','puning','jieyang'])assert.ok(residents.some(p=>p.ancestors.some(a=>a.startsWith(prefix))),prefix+' must have staffed premises');
 const types=[...new Set(residents.map(p=>p.type))];for(const type of ['florist','soup','coffee','warehouse','school','supermarket','kfc','home'])assert.ok(types.includes(type),type+' must reach the real map');
 assert.ok(residents.some(p=>p.ancestors.includes('nanao-nature-gate')));
 for(const id of ['nanao-nature-gate','huilai-lighthouse','raoping-haishan']){
  await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),state.places.find(p=>p.id===id).index);await page.waitForTimeout(2800);await page.screenshot({path:out+'/'+id+'.png'});
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),state.places.find(p=>p.id==='nanao-nature-gate').index);await page.waitForTimeout(2800);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:out+'/nature-gate-mobile.png'});
 assert.deepEqual(errors,[]);const report={pass:true,loadMs,residents:residents.length,types,closeups,coverage:residents,errors};await fs.writeFile(out+'/results.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,coverage:undefined}));
}finally{await browser.close();}
