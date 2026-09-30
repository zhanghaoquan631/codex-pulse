import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='RECON/infill-growth';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[],records=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5242/');await page.waitForFunction(()=>window.chaoshanAtlas?.getState().ready,null,{timeout:240000});await page.locator('#loading').waitFor({state:'hidden'});
 const initial=await page.evaluate(()=>window.chaoshanAtlas.getState());
 await page.evaluate(()=>window.chaoshanAtlas.setTime('day'));
 const gardens=await page.evaluate(async()=>{
  const {communityActors}=await import('/community-actors.mjs');let scene=communityActors[0].root;while(scene.parent)scene=scene.parent;
  const rows=[];scene.traverse(o=>{if(o.userData.infill&&o.name!=='landmark-interior-life')rows.push({id:o.name,...o.userData.infill});});return rows;
 });
 assert.ok(gardens.filter(p=>p.gardenArea>0).length>50,'continuous planting must reach later regions, not only the first exhibit');
 for(const prefix of ['nanao','raoping','huilai','jiexi','chaoan','chenghai','chaoyang','chaonan','puning','jieyang'])assert.ok(gardens.some(p=>p.id.startsWith(prefix)&&p.gardenArea>0),prefix+' needs actual planted ground');
 console.log(JSON.stringify({gardenSites:gardens.filter(p=>p.gardenArea>0).length,gardenArea:gardens.reduce((sum,p)=>sum+(p.gardenArea||0),0),startup:initial.startup}));
 const roadsideGrowth=initial.tourContext.roadsideGrowth;
 const frontageGardens=initial.tourContext.surroundings.frontageGardens;
 const streetFabric={streets:initial.tourContext.streets,buildings:initial.tourContext.buildings,people:initial.tourContext.people,vehicles:initial.tourContext.vehicles,backlotHomes:initial.tourContext.backlotHomes,backlotAccess:initial.tourContext.backlotAccess,secondaryLaneHomes:initial.tourContext.secondaryLaneHomes,secondaryLaneArea:initial.tourContext.secondaryLaneArea,visitorHousing:initial.tourContext.visitorHousing};
 assert.ok(streetFabric.visitorHousing.homes>0,'coastal visitor homes must reach the actual map');
 assert.ok(streetFabric.visitorHousing.sites['nanao-nature-gate']>0,'Nature Gate must benefit, not only unrelated urban regions');
 assert.ok(streetFabric.secondaryLaneHomes>0&&streetFabric.secondaryLaneArea>0,'secondary urban homes must be rendered, not just planned in tests');
 assert.ok(streetFabric.backlotHomes>0&&streetFabric.backlotAccess===streetFabric.backlotHomes,'secondary housing must reach the actual map with its access paths');
 assert.ok(frontageGardens>0,'frontage planting must reach the rendered map');
 assert.ok(roadsideGrowth.count>0&&roadsideGrowth.addedArea>0,'roadside growth must reach the rendered map');
 console.log(JSON.stringify({roadsideGrowth,frontageGardens,streetFabric}));
 const targets=['nanao-nature-gate','raoping-haishan','huilai-lighthouse',...['jiexi','chaoan','chenghai','chaoyang','chaonan','puning','jieyang'].map(kind=>initial.places.filter(p=>p.kind===kind).at(-1)?.id)];
 assert.ok(targets.every(Boolean));
 for(const id of targets){
  const place=initial.places.find(p=>p.id===id);await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),place.index);await page.waitForTimeout(2800);
  const png=PNG.sync.read(await page.screenshot({path:out+'/'+id+'.png'})),colors=new Set();
  for(let y=180;y<850;y+=2)for(let x=420;x<1090;x+=2){const i=(y*png.width+x)*4;colors.add(png.data.subarray(i,i+3).toString('hex'));}assert.ok(colors.size>500,id+' scene must be nonblank');
  assert.equal((await page.evaluate(()=>window.chaoshanAtlas.getState())).selected,id);records.push({id,colors:colors.size});
 }
 await page.setViewportSize({width:390,height:844});
 for(const id of targets.slice(0,3)){
  await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),initial.places.find(p=>p.id===id).index);await page.waitForTimeout(2800);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const png=PNG.sync.read(await page.screenshot({path:out+'/'+id+'-mobile.png'})),colors=new Set();for(let y=180;y<650;y+=2)for(let x=20;x<370;x+=2){const i=(y*png.width+x)*4;colors.add(png.data.subarray(i,i+3).toString('hex'));}assert.ok(colors.size>500,id+' mobile scene must be nonblank');
 }
 assert.deepEqual(errors,[]);await fs.writeFile(out+'/results.json',JSON.stringify({pass:true,gardens,roadsideGrowth,frontageGardens,streetFabric,records,mobile:targets.slice(0,3),errors},null,2));console.log(JSON.stringify({pass:true,records,errors}));
}finally{await browser.close();}
