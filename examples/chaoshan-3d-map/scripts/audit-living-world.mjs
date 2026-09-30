import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PNG} from 'pngjs';
const out='RECON/living-world';await fs.mkdir(out,{recursive:true});const errors=[];
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE_ERROR',e.stack);});
 await page.goto('http://127.0.0.1:5242/');await page.waitForFunction(()=>window.chaoshanAtlas?.getState().ready,null,{timeout:240000});await page.locator('#loading').waitFor({state:'hidden'});
 const initial=await page.evaluate(()=>window.chaoshanAtlas.getState());console.log(JSON.stringify({startup:initial.startup,sky:initial.sky,services:initial.tourContext.services,social:initial.social}));
 await page.screenshot({path:out+'/overview.png'});
 const checkCanvas=async name=>{
  const png=PNG.sync.read(await page.locator('canvas').first().screenshot({path:out+'/'+name+'-canvas.png'})),colors=new Set();
  for(let y=Math.floor(png.height*.2);y<png.height*.8;y+=3)for(let x=Math.floor(png.width*.25);x<png.width*.8;x+=3){const i=(y*png.width+x)*4;colors.add(`${png.data[i]},${png.data[i+1]},${png.data[i+2]}`);}
  assert.ok(colors.size>500,`${name}: map canvas must contain rendered geometry`);
 };
 await checkCanvas('desktop');
 const ids=['nanao-nature-gate','raoping-haishan','huilai-lighthouse','chaoan-longhu','puning-deanli','small-park'];
 const visited=[];
 for(const [index,id] of ids.entries()){const p=initial.places.find(p=>p.id===id);assert.ok(p,id);await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),p.index);await page.waitForTimeout(2800);assert.equal((await page.evaluate(()=>window.chaoshanAtlas.getState())).social.theme,index<3?'waterside':'heritage',id);await page.screenshot({path:out+'/'+id+'.png'});visited.push(id);}
 const residentPlace=initial.places.find(p=>p.id==='raoping-haishan');await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),residentPlace.index);await page.waitForTimeout(2800);
 const residents=()=>page.evaluate(async()=>{
  const {communityActors}=await import('/community-actors.mjs');
  return communityActors.filter(a=>a.ambientUpdate&&(()=>{for(let o=a.root;o;o=o.parent)if(o.name==='raoping-haishan')return true;return false;})()).map(a=>({position:a.root.position.toArray(),rotation:a.root.rotation.toArray(),limbs:a.root.children.slice(1,5).map(o=>o.rotation.toArray()),state:a.root.userData.state,parts:a.root.children.length}));
 });
 const beforeResidents=await residents();await page.waitForTimeout(900);const afterResidents=await residents();
 assert.ok(beforeResidents.length>0,'existing Haishan amenities must contain articulated residents');
 assert.deepEqual(afterResidents.map(a=>a.position),beforeResidents.map(a=>a.position));
 assert.notDeepEqual(afterResidents,beforeResidents,'resident gestures must advance in the actual map');
 assert.ok(afterResidents.every(a=>a.parts>=5));await page.screenshot({path:out+'/haishan-residents.png'});
 await page.evaluate(async()=>{
  const {communityActors}=await import('/community-actors.mjs');
  window.__livingResponses=()=>communityActors.filter(a=>a.root.userData.socialResponse).map(a=>({state:a.root.userData.state,...a.root.userData.socialResponse}));
 });
 // Poll synchronously: an async predicate is already truthy before its result resolves.
 const responseSnapshot=await page.waitForFunction(()=>{
  const responses=window.__livingResponses();
  return responses.some(a=>a.weight>.5)?responses:false;
 },null,{timeout:30000});
 const responses=await responseSnapshot.jsonValue();await responseSnapshot.dispose();
 await page.evaluate(()=>delete window.__livingResponses);
 console.log('RESPONSE_SNAPSHOT',JSON.stringify(responses));
 assert.ok(responses.length>0&&responses.length<=2);assert.ok(responses.every(a=>Math.abs(a.yaw)<=.48));
 await page.screenshot({path:out+'/companion-response.png'});
 await page.locator('.community-open').click();await page.locator('.reaction-signal').click();await page.locator('.reaction-signal').click();assert.equal((await page.evaluate(()=>window.chaoshanAtlas.getState())).social.lastResult,'early');
 await page.locator('.reaction-signal').click();await page.waitForFunction(()=>document.querySelector('.reaction-signal').dataset.state==='ready');await page.locator('.reaction-signal').click();assert.match(await page.locator('.community-game output').textContent(),/反应/);await page.screenshot({path:out+'/game.png'});await page.keyboard.press('Escape');
 await page.locator('.community-open').click();await page.locator('.reaction-signal').click();await page.waitForFunction(()=>window.chaoshanAtlas.getState().social.lastResult==='timeout');assert.doesNotMatch(await page.locator('.community-game output').textContent(),/你的反应/);await page.keyboard.press('Escape');
 await page.evaluate(()=>window.chaoshanAtlas.setTime('sunset'));assert.equal((await page.evaluate(()=>window.chaoshanAtlas.getState())).sky.auto,false);await page.screenshot({path:out+'/sunset.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(1500);await page.locator('.community-open').click();await page.screenshot({path:out+'/mobile-game.png'});const fit=await page.locator('.community-game').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&e.scrollWidth<=e.clientWidth;});assert.ok(fit);await page.keyboard.press('Escape');
 await checkCanvas('mobile');
 const final=await page.evaluate(()=>window.chaoshanAtlas.getState());assert.ok(final.social.actors>100);assert.ok(final.social.conversations>0);assert.ok(final.social.round>=3);assert.equal(errors.length,0);
 await fs.writeFile(out+'/results.json',JSON.stringify({initial,visited,responses,final,errors},null,2));console.log('PASS living world, directional character responses, game, mobile and manual sky');
}finally{await browser.close();}
