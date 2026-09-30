import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const out='RECON/soft-landscape';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const start=Date.now();await page.goto('http://127.0.0.1:5242/');
 await page.waitForFunction(()=>window.chaoshanAtlas?.getState().ready,null,{timeout:240000});await page.locator('#loading').waitFor({state:'hidden'});
 const loadMs=Date.now()-start,state=await page.evaluate(()=>window.chaoshanAtlas.getState());
 const planting=state.tourContext.surroundings;assert.ok(planting.understory>30000);assert.ok(Object.values(planting.plantingTypes).every(n=>n>0));
 console.log(JSON.stringify({loadMs,understory:planting.understory,types:planting.plantingTypes}));
 const photos=[];
 for(const wanted of ['nanao-nature-gate','huilai-lighthouse','raoping-haishan','raoping-xiao','chaoan','jiexi']){
  const place=state.places.find(p=>p.id===wanted)||state.places.find(p=>p.id.startsWith(wanted+'-'));
  assert.ok(place,wanted);await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),place.index);await page.waitForTimeout(2800);
  const path=out+'/'+place.id+'.png',png=PNG.sync.read(await page.screenshot({path,timeout:60000}));
  let greens=0,colors=new Set();for(let i=0;i<png.data.length;i+=16){const [r,g,b]=png.data.slice(i,i+3);if(g>r*1.06&&g>b*1.06)greens++;colors.add([r>>3,g>>3,b>>3].join(','));}
  assert.ok(greens>500&&colors.size>300,place.id+' must contain nonblank diverse vegetation');photos.push({id:place.id,greens,colors:colors.size,path});console.log(JSON.stringify({id:place.id,render:(await page.evaluate(()=>window.chaoshanAtlas.getState())).render}));
 }
 await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),state.places.find(p=>p.id==='nanao-nature-gate').index);await page.waitForTimeout(2800);
 const frames=await page.evaluate(()=>new Promise(resolve=>{let count=0,start=performance.now();function tick(now){count++;if(now-start<6000)requestAnimationFrame(tick);else resolve({count,fps:count/((now-start)/1000)});}requestAnimationFrame(tick);}));
 await page.evaluate(()=>window.chaoshanAtlas.setTime('night'));await page.waitForTimeout(800);await page.screenshot({path:out+'/nature-gate-night.png'});
 await page.evaluate(()=>window.chaoshanAtlas.setTime('day'));await page.waitForTimeout(800);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(1500);await page.screenshot({path:out+'/nature-gate-mobile.png'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const residents=await page.evaluate(async()=>(await import('/community-actors.mjs')).communityActors.filter(a=>a.root.userData.serviceResident).length);assert.ok(residents>=222,'existing staffed premises must be retained');
 assert.deepEqual(errors,[]);const report={pass:true,loadMs,planting:{...planting,coverage:undefined},frames,residents,photos,errors};await fs.writeFile(out+'/results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
