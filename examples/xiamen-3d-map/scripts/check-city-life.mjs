import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
const out=process.argv[2]?'qa/public-city-life':'qa/city-life',report={errors:[],areas:[]};await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});page.on('pageerror',e=>report.errors.push(e.message));
 const start=Date.now();await page.goto(process.argv[2]||'http://127.0.0.1:5243/');await page.waitForFunction(()=>window.xiamenAtlas?.getState().ready,null,{timeout:180000});report.readyMs=Date.now()-start;await page.waitForTimeout(2000);
 report.city=await page.evaluate(()=>window.xiamenCityLife());console.log(JSON.stringify({readyMs:report.readyMs,city:report.city}));
 assert.ok(report.city.infill>3000);assert.ok(report.city.people>800);assert.ok(report.city.cars>150);assert.ok(report.city.cells>40);
 assert.equal(report.city.scenes.length,12);for(const s of report.city.scenes){assert.ok(s.people>=20,s.theme+' people');assert.ok(s.localPeople>=20,s.theme+' local plaza people');assert.ok(s.venues>=3,s.theme+' food venues');}
 report.render=await page.evaluate(()=>window.xiamenAtlas.getState().render);
 report.frames=await page.evaluate(()=>new Promise(resolve=>{let count=0,first=performance.now();const tick=()=>{count++;if(performance.now()-first>2500)resolve({count,ms:performance.now()-first,fps:count*1000/(performance.now()-first)});else requestAnimationFrame(tick);};requestAnimationFrame(tick);}));
 await page.screenshot({path:out+'/overview.png'});
 const before=await page.evaluate(()=>window.xiamenCityAudit().motion);await page.waitForTimeout(2200);const after=await page.evaluate(()=>window.xiamenCityAudit().motion);assert.ok(after.some((p,i)=>Math.hypot(p[0]-before[i][0],p[1]-before[i][1])>.0003));
 report.safety=await page.evaluate(()=>window.xiamenCityAudit().safety);assert.deepEqual(report.safety,{overlaps:0,invalidPeople:0,invalidCars:0});
 for(let i=0;i<12;i++){await page.selectOption('#district',String(i));await page.waitForTimeout(1800);await page.screenshot({path:out+'/area-'+i+'.png'});await page.click('#city-life-focus');await page.waitForTimeout(1500);const png=PNG.sync.read(await page.locator('#viewport canvas').screenshot()),colors=new Set();for(let k=0;k<png.data.length;k+=40)colors.add(`${png.data[k]>>3},${png.data[k+1]>>3},${png.data[k+2]>>3}`);assert.ok(colors.size>100);assert.ok((await page.locator('#location-name').textContent()).includes(' · '));report.areas.push({i,colors:colors.size});await page.screenshot({path:out+'/life-'+i+'.png'});}
 for(const [width,height] of [[390,844],[320,740],[844,390]]){await page.setViewportSize({width,height});await page.click('#home');await page.waitForFunction(()=>window.xiamenAtlas.getState().camera.zoom<1.01,null,{timeout:30000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);await page.waitForTimeout(400);const labels=await page.locator('.overview-label:visible').evaluateAll(nodes=>nodes.map(n=>({width:n.offsetWidth,height:n.offsetHeight,text:n.textContent})));assert.ok(labels.length>0,'overview retains reachable labels');assert.ok(labels.every(n=>n.width>=100&&n.height<90),'overview labels cannot collapse into vertical text');assert.equal(await page.locator('#location-card').isVisible(),false,'global card cannot obscure mobile overview');await page.screenshot({path:out+'/phone-'+width+'.png'});await page.locator('#district').evaluate(el=>{el.value='1';el.dispatchEvent(new Event('change',{bubbles:true}));});await page.waitForTimeout(1800);assert.equal(await page.locator('#location-card').isVisible(),true,'selected place retains its detail controls');}
 assert.equal(report.errors.length,0);report.passed=true;
}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();}
