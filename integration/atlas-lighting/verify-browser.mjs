import http from 'node:http';
import {readFile, mkdir, stat, writeFile} from 'node:fs/promises';
import {resolve, dirname, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(resolve(process.argv[2], 'package.json'));
const {chromium} = require('playwright');
const {PNG} = require('pngjs');
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../public');
const artifacts = resolve(here, '../../work/atlas-lighting-qa');
await mkdir(artifacts, {recursive:true});
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.hdr':'application/octet-stream'};
const server = http.createServer(async (req,res) => {
  try {
    let path = resolve(root, '.' + decodeURI(new URL(req.url,'http://localhost').pathname));
    if (!path.startsWith(root + sep)) throw new Error('outside');
    if ((await stat(path)).isDirectory()) path = resolve(path,'index.html');
    res.writeHead(200, {'Content-Type':types[extname(path)] || 'application/octet-stream'});
    res.end(await readFile(path));
  } catch {res.writeHead(404);res.end('Not found');}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({channel:'msedge',headless:true});
const errors=[], missing=[], checks=[];
try {
  const page = await browser.newPage({viewport:{width:1440,height:960}});
  page.setDefaultTimeout(60000);
  page.on('pageerror', e=>errors.push(e.message));
  page.on('response', r=>{if(r.url().startsWith(origin)&&r.status()>=400)missing.push({url:r.url(),status:r.status()});});
  await page.goto(origin+'/local-apps/chaoshan-atlas/index.html#map');
  await page.waitForFunction(()=>window.chaoshanAtlas?.getState().ready,null,{timeout:300000});
  await page.locator('#loading').waitFor({state:'hidden',timeout:300000});
  await page.waitForFunction(()=>window.chaoshanAtlas.getState().sky.photography.ready,null,{timeout:120000});
  const state = ()=>page.evaluate(()=>window.chaoshanAtlas.getState());
  const initial=await state();
  assert.equal(initial.lightingRelease,'2026-09-27');assert.equal(initial.places.length,266);
  checks.push({test:'266 places and new sky initialized',ready:true});
  console.log('Ready: places, photography and lighting');
  const frames=async name=>{
    const download=page.waitForEvent('download');await page.locator('#scene-capture').click();
    const file=resolve(artifacts,name+'.png');await (await download).saveAs(file);
    const pixels=PNG.sync.read(await readFile(file)), colors=new Set();
    for(let i=0;i<pixels.data.length;i+=64)colors.add(pixels.data.slice(i,i+3).join(','));
    assert.ok(colors.size>150,'nonblank rendered map');return pixels;
  };
  await page.evaluate(()=>{const a=window.chaoshanAtlas;a.focusPlace(a.getState().places.find(p=>p.id==='small-park').index);});
  await page.waitForTimeout(3000);
  await page.locator('#scene-pause').click();
  const before=await state();await page.waitForTimeout(600);assert.equal((await state()).sceneSeconds,before.sceneSeconds);
  const changed=await page.evaluate(()=>{const a=window.chaoshanAtlas.getState().sky;document.querySelector('[data-time-choice=sunset]').click();return {a,b:window.chaoshanAtlas.getState().sky};});
  assert.equal(changed.a.hour,changed.b.hour);assert.ok(changed.b.transitioning);
  await page.waitForTimeout(2300);const mid=await state();assert.ok(mid.sky.transitioning);assert.notEqual(mid.sky.hour,changed.a.hour);
  await page.waitForFunction(()=>!window.chaoshanAtlas.getState().sky.transitioning,null,{timeout:180000});
  assert.ok(Math.abs((await state()).sky.hour-17.6)<.01);assert.equal((await state()).sceneSeconds,before.sceneSeconds);
  await frames('sunset');
  checks.push({test:'continuous sunset while simulation is paused',start:changed.a.hour,mid:mid.sky.hour,end:(await state()).sky.hour});
  for(const [quality,size]of [['high',4096],['light',1024],['balanced',2048]]){await page.locator('#render-quality').selectOption(quality);assert.equal((await state()).sky.light.shadowSize,size);}
  await page.locator('[data-time-choice=night]').click();
  await page.waitForFunction(()=>!window.chaoshanAtlas.getState().sky.transitioning,null,{timeout:180000});
  await page.locator('#home').click();await page.waitForTimeout(3000);
  const stars=await frames('night');
  await page.getByLabel('星辰',{exact:true}).uncheck();await page.waitForTimeout(500);
  const noStars=await frames('night-no-stars');let differences=0;
  for(let i=0;i<stars.data.length;i+=4)if(stars.data[i]+stars.data[i+1]+stars.data[i+2]-noStars.data[i]-noStars.data[i+1]-noStars.data[i+2]>20)differences++;
  assert.ok(differences>20,'Stars change rendered sky pixels');
  await page.getByLabel('星辰',{exact:true}).check();
  await page.locator('#scene-audio').click();assert.equal((await state()).sky.tools.audioState,'running');
  await page.locator('#scene-audio').click();assert.equal((await state()).sky.tools.audioState,'suspended');
  await page.locator('#scene-hide').click();assert.equal(await page.locator('.top-actions').isVisible(),false);
  await page.locator('#scene-restore').click();assert.equal(await page.locator('.top-actions').isVisible(),true);
  checks.push({test:'quality, rendered stars, audio, capture and clean view',starPixels:differences});
  console.log('Solar controls passed');
  const marker=await page.evaluate(()=>{const a=window.chaoshanAtlas;return {placed:a.setCustomPlaces([{id:'test',name:'测试地点',lng:116.6822,lat:23.3535}]),focus:a.focusCoordinates({id:'test',name:'测试地点',lng:116.6822,lat:23.3535})};});
  assert.equal(marker.placed.placed,1);assert.equal(marker.focus.ok,true);
  await page.locator('.opc-map-dock').click();await page.waitForTimeout(1000);const paused=await state();await page.waitForTimeout(600);assert.equal((await state()).sceneSeconds,paused.sceneSeconds);
  await page.getByRole('button',{name:'社区榜单',exact:true}).click();assert.ok(await page.locator('#opc-main').innerText());
  await page.getByRole('button',{name:'活动与政策',exact:true}).click();assert.ok(await page.locator('#opc-main').innerText());
  await page.locator('.opc-map-link').click();
  assert.ok(await page.locator('.unified-entry').isVisible());
  checks.push({test:'community, custom markers and adventure entry preserved',pass:true});
  await page.locator('[data-time-choice=morning]').click();
  await page.waitForFunction(()=>!window.chaoshanAtlas.getState().sky.transitioning,null,{timeout:180000});
  for(const [width,height]of [[1440,960],[390,844],[320,740],[844,390]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(600);
    const boxes=await page.locator('.time-switch button,.scene-tools button,.scene-tools select,.sky-options label').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
    for(const b of boxes)assert.ok(b.x>=0&&b.y>=0&&b.right<=width&&b.bottom<=height,JSON.stringify({width,box:b}));
    const dock=await page.locator('.opc-map-dock').boundingBox(),card=await page.locator('#location-card').boundingBox();
    assert.ok(dock.x+dock.width<=card.x||card.x+card.width<=dock.x||dock.y+dock.height<=card.y||card.y+card.height<=dock.y,'Community return must not cover the location card');
    await page.screenshot({path:resolve(artifacts,`viewport-${width}.png`)});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  const result={passed:true,checks,errors,missing};await writeFile(resolve(here,'verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
} catch(error) {console.error({errors,missing});throw error;}
finally{await browser.close();await new Promise(done=>server.close(done));}
