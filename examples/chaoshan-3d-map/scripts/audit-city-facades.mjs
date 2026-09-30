import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='RECON/city-facades';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[],records=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5242/');
 await page.waitForFunction(()=>window.chaoshanAtlas?.getState().ready,null,{timeout:240000});
 await page.locator('#loading').waitFor({state:'hidden'});
 const state=await page.evaluate(()=>window.chaoshanAtlas.getState());
 assert.ok(state.environment.cityBuildings>0,'clearance must not remove the entire urban background');
 const inspect=()=>page.evaluate(async()=>{
  const {communityActors}=await import('/community-actors.mjs');let scene;
  for(const actor of communityActors){let root=actor.root;while(root.parent)root=root.parent;if(root.isScene){scene=root;break;}}
  const city=scene?.getObjectByName('regional-city-silhouettes');if(!city)return null;
  let facades=0;const bad=[];city.traverse(o=>{if(o.isMesh){if(o.name==='regional-city-facades')facades+=o.count;if(o.material.opacity!==1||o.material.alphaHash)bad.push(o.name);}});
  return {visible:city.visible,facades,bad,zoom:window.chaoshanAtlas.getState().zoom};
 });
 for(const [index,name] of ['汕头市','潮州市','揭阳市'].entries()){
  const p=state.places.find(p=>p.kind==='district'&&p.name===name);assert.ok(p,name);
  await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),p.index);await page.waitForTimeout(2800);
  const city=await inspect();assert.ok(city?.visible&&city.facades>0);assert.deepEqual(city.bad,[]);
  await page.screenshot({path:`${out}/city-${index}.png`});records.push({name,...city});
 }
 const close=state.places.find(p=>p.id==='small-park');await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),close.index);await page.waitForTimeout(2800);
 const nearby=await inspect();assert.ok(nearby.zoom>22,'close view must exceed the old disappearance threshold');assert.ok(nearby.visible);assert.deepEqual(nearby.bad,[]);records.push({name:'close',...nearby});
 await page.screenshot({path:`${out}/close.png`});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(1800);
 await page.screenshot({path:`${out}/mobile.png`});
 const png=PNG.sync.read(await page.locator('canvas').first().screenshot()),colors=new Set();
 for(let i=0;i<png.data.length;i+=32)colors.add(png.data.subarray(i,i+3).toString('hex'));
 assert.ok(colors.size>500);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);const result={cityBuildings:state.environment.cityBuildings,records,errors};
 await fs.writeFile(`${out}/results.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
