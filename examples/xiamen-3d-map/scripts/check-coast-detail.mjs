import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import {coastLocations,createCoastCoverage,outsideIntervals} from '../coast-layout.mjs';
import {clipSegmentToBounds} from '../oldtown-layout.mjs';
import {distanceToSegment} from '../world-layout.mjs';

const detail=JSON.parse(await readFile('public/data/coast-detail.json','utf8')),data=JSON.parse(await readFile('public/data/xiamen.json','utf8'));
const world=([lon,lat])=>[(lon-data.meta.origin[0])*data.meta.sx,(data.meta.origin[1]-lat)*data.meta.sz],coverage=createCoastCoverage(detail);
assert.ok(detail.buildings.length>=25);assert.equal(detail.buildings.filter(b=>b.height>200).length,2);
assert.ok(detail.buildings.some(b=>b.rings[0].length>10));assert.ok(detail.paths.filter(p=>p.kind==='steps').length>=4);
assert.equal(coverage.isWater(...world(coastLocations.harbor)),true);
const deck=world(coastLocations.deck),walks=detail.paths.filter(p=>p.bridge&&p.kind==='footway');
assert.ok(Math.min(...walks.flatMap(p=>p.points.slice(1).map((b,i)=>distanceToSegment(...deck,p.points[i],b))))<.001);
assert.deepEqual(outsideIntervals([-1,0],[5,0],[[0,-1,1,1],[2,-1,3,1]],clipSegmentToBounds),[[0,1/6],[2/6,3/6],[4/6,1]]);
assert.deepEqual(outsideIntervals([.1,0],[.9,0],[[0,-1,1,1]],clipSegmentToBounds),[]);
assert.deepEqual(outsideIntervals([-1,4],[5,4],[[0,-1,1,1]],clipSegmentToBounds),[[0,1]]);

const out='qa/coast-detail',errors=[],report={snapshot:detail.snapshot};await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']}),page=await browser.newPage({viewport:{width:1440,height:960}});
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
async function capture(name){const raw=PNG.sync.read(await page.locator('#viewport canvas').screenshot()),colors=new Set();for(let i=0;i<raw.data.length;i+=28)colors.add(`${raw.data[i]>>3},${raw.data[i+1]>>3},${raw.data[i+2]>>3}`);assert.ok(colors.size>100,'Nonblank detailed canvas');await page.screenshot({path:out+'/'+name+'.png'});return colors.size;}
async function selectPlace(i){if(!await page.locator('#district').isVisible())await page.locator('#open-explore').click();await page.locator('#district').selectOption(String(i));}
try{
  const started=Date.now();await page.goto('http://127.0.0.1:5243/');await page.waitForFunction(()=>window.xiamenAtlas?.getState().ready);report.readyMs=Date.now()-started;
  const state=await page.evaluate(()=>window.xiamenAtlas.getState().world.coast);report.coast=state;
  assert.ok(state.buildings>=25&&state.people>=100&&state.trees>100&&state.boats>0&&state.cars>0);assert.equal(state.towers,2);
  for(const i of [2,3]){await page.locator('#district').selectOption(String(i));await page.waitForTimeout(1800);report['colors'+i]=await capture('place-'+i);}
  const after=await page.evaluate(()=>window.xiamenAtlas.getState().world.coast);assert.notDeepEqual(after.motion,state.motion);assert.equal(after.overlaps,0);assert.equal(after.invalidPeople,0);
  await page.locator('#scene-pause').click();const time=await page.evaluate(()=>window.xiamenAtlas.getState().world.coast.seconds);await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>window.xiamenAtlas.getState().world.coast.seconds),time);await page.locator('#scene-pause').click();
  await page.locator('[data-time-choice="night"]').click();await page.waitForFunction(()=>!window.xiamenAtlas.getState().sky.transitioning);await capture('night');
  await page.locator('[data-time-choice="day"]').click();await page.waitForFunction(()=>!window.xiamenAtlas.getState().sky.transitioning);
  for(const [width,height] of [[390,844],[844,390],[667,375]]){await page.setViewportSize({width,height});for(const i of [2,3]){await selectPlace(i);await page.waitForTimeout(1700);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);await capture('mobile-'+width+'-'+i);}
    if(width>650){
      const overlaps=await page.evaluate(()=>{
        const selectors=['.location-card','.bottom-center','.top-actions','.scene-tools','.sky-options','.travel-launch','.scene-settings','.map-controls'];
        const rects=selectors.map(s=>({name:s,rect:document.querySelector(s).getBoundingClientRect()})).filter(r=>r.rect.width&&r.rect.height),bad=[];
        for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];if(Math.min(a.rect.right,b.rect.right)-Math.max(a.rect.left,b.rect.left)>2&&Math.min(a.rect.bottom,b.rect.bottom)-Math.max(a.rect.top,b.rect.top)>2)bad.push([a.name,b.name]);}return bad;
      });assert.deepEqual(overlaps,[],'Landscape controls must not overlap');
    }
  }
  await selectPlace(0);await page.waitForTimeout(1700);await capture('island-regression');
  const final=await page.evaluate(()=>window.xiamenAtlas.getState());assert.equal(final.world.invalidPeople,0);assert.equal(final.world.overlaps,0);assert.ok(final.world.island.paths>400);report.final=final.world.coast;assert.equal(errors.length,0);
}finally{report.errors=errors;await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}
