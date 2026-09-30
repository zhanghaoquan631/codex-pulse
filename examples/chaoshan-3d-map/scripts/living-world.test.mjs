import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {solarPosition} from '../living-sky.mjs';
import {photographSun,skyPhotographs} from '../photographic-sky.mjs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RGBELoader} from 'three/addons/loaders/RGBELoader.js';
import {landscapeColor,placeSetting} from '../place-setting.mjs';
import {personGeometry,outfitTypes} from '../street-life.mjs';
import {person,residentOutfit,socialResponsePose} from '../scene-miniatures.mjs';
import {reactionResult,speech,companionFor,conversationPair,conversationTheme,chooseConversation,chooseEncounter,createEncounterMemory,gameReview} from '../community-social.mjs';
import {serviceFor,services,addServiceSigns} from '../neighborhood-services.mjs';
import {serviceBuilding} from '../service-buildings.mjs';
import {addServiceResident,serviceStaffFits,serviceActivityPose,chooseServiceResidents} from '../service-life.mjs';
import {civicVisitorPose,civicPersonScale,planCivicNeighborhoods} from '../civic-neighborhoods.mjs';
import {inspectExhibitGround,planExhibitInfill,planExhibitAccess,reachableExhibitEntrance,pathDistance,toneExhibitPaving,exhibitParcelFits} from '../exhibit-infill.mjs';
import {smallParkCornerLots,smallParkPocketGardens,smallParkMarketLots} from '../small-park-layout.mjs';
import {addAmenityPeople,amenityPose} from '../amenity-life.mjs';
import {batchStatic} from '../static-batch.mjs';
import {planBacklotHousing,hillsideFoundation,raisedHousingAccess} from '../backlot-housing.mjs';
import {buildNanaoSights,nanaoPlaces} from '../nanao-sights.mjs';
import {planExhibitGardens,addExhibitGardens} from '../exhibit-gardens.mjs';

test('continuous exhibit gardens fill spare ground but keep streets, doorways, buildings and water clear',()=>{
 const options={ground:{sample:(x,z)=>({y:0,wet:x>.38}),clear:(x,z,r)=>!(Math.abs(x+.22)<.075+r&&Math.abs(z+.22)<.08+r)},paths:[[[-.5,0,0],[.5,0,0]]],parcels:[{x:.15,z:.20,radius:.055}],amenities:[{x:-.20,z:.24,radius:.035}],access:[[[.15,0,.145],[.15,0,0]]],bounds:[-.5,.5,-.4,.4],profile:placeSetting({id:'coastal-gardens',model:'island'})};
 const plan=planExhibitGardens(options);assert.ok(plan.area>.035);assert.ok(plan.positions.length>100);assert.equal(plan.positions.length,plan.colors.length);
 assert.deepEqual(plan,planExhibitGardens(options));
 const edgeColors=new Map();
 for(let i=0;i<plan.positions.length;i+=3){const [x,y,z]=plan.positions.slice(i,i+3),key=x+','+z;
  assert.ok(Math.abs(y-.0012)<1e-9);assert.ok(options.ground.clear(x,z,0));assert.equal(options.ground.sample(x,z).wet,false);
  assert.ok(pathDistance(x,z,options.paths).distance>=.033);assert.ok(pathDistance(x,z,options.access).distance>=.013);
  for(const p of [...options.parcels,...options.amenities])assert.ok(Math.hypot(x-p.x,z-p.z)>p.radius);
  const color=plan.colors.slice(i,i+3);if(edgeColors.has(key))assert.deepEqual(color,edgeColors.get(key));else edgeColors.set(key,color);
 }
 const alternate=planExhibitGardens({...options,profile:placeSetting({id:'historic-gardens',model:'temple'})});assert.notDeepEqual(alternate.positions,plan.positions);assert.notDeepEqual(alternate.colors,plan.colors);
 const group=new THREE.Group(),mesh=addExhibitGardens(group,plan);assert.equal(group.children.filter(o=>o.isMesh&&!o.isInstancedMesh).length,1);assert.equal(mesh.name,'exhibit-continuous-gardens');assert.ok(mesh.material.vertexColors);assert.equal(mesh.geometry.index,null);
 assert.ok(plan.planting.length>0);assert.equal(group.getObjectByName('exhibit-flowerbeds').userData.planting.count,plan.planting.length);
 for(const p of plan.planting)for(let i=0;i<12;i++){
  const x=p.x+Math.sin(i*Math.PI/6)*p.radius,z=p.z+Math.cos(i*Math.PI/6)*p.radius;
  assert.ok(options.ground.clear(x,z,0));assert.equal(options.ground.sample(x,z).wet,false);
  assert.ok(pathDistance(x,z,options.paths).distance>=.033);assert.ok(pathDistance(x,z,options.access).distance>=.013);
 }
});

test('garden surfaces do not bridge elevated stairs, missing ground or narrow water cuts',()=>{
 const options={ground:{sample:()=>({y:0,wet:false}),clear:()=>true},paths:[],parcels:[],amenities:[],access:[],bounds:[-.2,.2,-.2,.2],profile:placeSetting({id:'forest'})};
 for(const sample of [()=>null,()=>({y:0,wet:true}),()=>({y:.03,wet:false})])assert.equal(planExhibitGardens({...options,ground:{...options.ground,sample}}).area,0);
 const plan=planExhibitGardens({...options,ground:{...options.ground,sample:(x,z)=>({y:z>0?.022:0,wet:Math.abs(x)<.014})}});
 for(let i=0;i<plan.positions.length;i+=9){const xs=[plan.positions[i],plan.positions[i+3],plan.positions[i+6]],ys=[plan.positions[i+1],plan.positions[i+4],plan.positions[i+7]];assert.ok(xs.every(x=>x<-.014)||xs.every(x=>x>.014));assert.ok(Math.max(...ys)-Math.min(...ys)<.006);}
});

test('everyday residents have distinct cached clothing and contextual roles without losing animated limbs',()=>{
 const signatures=new Set();
 for(const outfit of ['student','shopkeeper','chef','office','senior','courier','medic','officer']){
  assert.ok(outfitTypes.includes(outfit));const geometry=personGeometry(outfit,2);assert.equal(geometry,personGeometry(outfit,2));
  assert.ok(Array.from(geometry.attributes.position.array).every(Number.isFinite));
  signatures.add(createHash('sha256').update(Buffer.from(geometry.attributes.position.array.buffer)).update(Buffer.from(geometry.attributes.color.array.buffer)).digest('hex'));
  const actor=person(new THREE.Group(),2,{outfit});assert.equal(actor.outfit,outfit);assert.equal(actor.root.children.length,5);
  actor.pose(1,'sit');assert.equal(actor.root.children[1].rotation.x,-Math.PI/2);
  actor.gesture(2,'wave');assert.notEqual(actor.root.children[4].rotation.z,0);
  const arm=actor.root.children[4];actor.root.updateWorldMatrix(true,true);
  const shoulder=arm.localToWorld(new THREE.Vector3()),hand=arm.localToWorld(new THREE.Vector3(0,-.65,0));
  assert.ok(hand.x>shoulder.x&&hand.y>shoulder.y,'greeting hand rises outside the torso');
 }
 assert.equal(signatures.size,8);
 for(const outfit of ['wizard','astronaut','cape'])assert.ok(outfitTypes.includes(outfit));
 for(const [theme,expected] of [['school','student'],['clinic','medic'],['market','shopkeeper'],['tea','senior'],['square','officer']])assert.equal(residentOutfit(theme,0),expected);
 for(const theme of ['school','market','tea','bench','shelter','bus'])assert.ok(new Set(Array.from({length:12},(_,i)=>residentOutfit(theme,i))).size>=2);
 const market=addAmenityPeople(new THREE.Group(),{type:'market'},0);assert.equal(market[0].outfit,'shopkeeper');
 const tea=addAmenityPeople(new THREE.Group(),{type:'tea'},0);assert.deepEqual(tea.map(a=>a.outfit),['senior','office']);
});

test('small park market fills the unbuilt sector while preserving spokes, gardens and circular traffic',()=>{
 assert.equal(new Set(smallParkMarketLots.map(p=>p.service)).size,3);
 for(const p of smallParkMarketLots){
  const r=p.size*.84;assert.ok(Math.hypot(p.x,p.z)+r<69);
  for(let i=0;i<8;i++){const angle=i*Math.PI/4;assert.ok(Math.abs(p.x*Math.cos(angle)-p.z*Math.sin(angle))>r+4.5);}
  for(const q of smallParkMarketLots)if(q!==p)assert.ok(Math.hypot(p.x-q.x,p.z-q.z)>r+q.size*.84);
  for(let i=0;i<7;i++)for(let j=0;j<3;j++){const a=(i+.5)*Math.PI/4;assert.ok(Math.hypot(p.x-Math.sin(a)*(35+j*11),p.z-Math.cos(a)*(35+j*11))>r+8);}
  for(const g of smallParkPocketGardens)assert.ok(Math.hypot(p.x-g.x,p.z-g.z)>r+10);
  for(let k=0;k<=20;k++){
   const x=p.start[0]+(p.end[0]-p.start[0])*k/20,z=p.start[1]+(p.end[1]-p.start[1])*k/20;
   assert.ok(Math.hypot(x,z)<68);
   for(const q of smallParkMarketLots)if(q!==p)assert.ok(Math.hypot(x-q.x,z-q.z)>q.size*.84+1.1);
  }
 }
});

test('secondary homes use vacant back lots with dry unobstructed doors and pavement connections',()=>{
 for(const angle of [0,.65,Math.PI/2,Math.PI]){
  const co=Math.cos(angle),si=Math.sin(angle),rotate=(x,z)=>({x:x*co-z*si,z:x*si+z*co});
  const plots=Array.from({length:6},(_,i)=>({...rotate((i-3)*.32,.14),y:.1,size:.08,angle:Math.PI+angle,frontage:true,profile:{family:'dune'}}));
  const before=structuredClone(plots),roads=[[rotate(-2,0),rotate(2,0)]],options={plots,roads,heightAt:()=>.1,waterAt:()=>null,clear:()=>true};
  const plan=planBacklotHousing(options);assert.ok(plan.length>=4);
  assert.deepEqual(plots,before);assert.deepEqual(plan,planBacklotHousing(options));
  for(const p of plan){
   for(const q of [...plots,...plan])if(q!==p)assert.ok(Math.hypot(p.x-q.x,p.z-q.z)>=p.size*.84+q.size*.84+.012);
   assert.ok(p.access.length>10);assert.equal(p.backlot,true);assert.equal(p.originalSize,p.size);
   const end=p.access.at(-1),roadZ=-end[0]*si+end[2]*co;
   assert.ok(Math.abs(roadZ-.045)<1e-7,'the alley stops at the near pavement, not in traffic');
   const start=p.access[0],heading=Math.atan2(start[0]-p.x,start[2]-p.z)+p.angle;assert.ok(Math.abs(Math.sin(heading))<1e-7&&Math.cos(heading)>.999999);
   for(const point of p.access){
    assert.ok(point.every(Number.isFinite));assert.ok(point[1]>=.109-1e-8&&point[1]<=.123+1e-8);
    for(const q of [...plots,...plan])if(q!==p)assert.ok(Math.hypot(point[0]-q.x,point[2]-q.z)>=q.size*.84+.020-1e-8,'no path cuts through any neighbouring home');
   }
  }
  for(const restrictions of [{roads:[]},{waterAt:()=>0},{clear:()=>false},{heightAt:()=>NaN}])assert.equal(planBacklotHousing({...options,...restrictions}).length,0);
 }
});

test('backlot access cannot jump a water channel or cross another road',()=>{
 const plots=[{x:0,z:.14,y:.1,size:.08,angle:Math.PI,frontage:true,profile:{family:'dune'}}];
 const options={plots,roads:[[{x:-2,z:0},{x:2,z:0}]],heightAt:()=>.1,waterAt:()=>null,clear:()=>true};
 assert.equal(planBacklotHousing(options).length,1);
 assert.equal(planBacklotHousing({...options,waterAt:(x,z)=>z>.20&&z<.24?0:null}).length,0);
 assert.equal(planBacklotHousing({...options,clear:(x,z)=>z<.20||z>.24}).length,0);
 assert.equal(planBacklotHousing({...options,roads:[...options.roads,[{x:-2,z:.26},{x:2,z:.26}]]}).length,0);
 assert.equal(planBacklotHousing({...options,plots:plots.map(p=>({...p,frontage:false}))}).length,0);
});

test('urban and fishing back lanes gain larger secondary homes without moving the first row or blocking any entrance',()=>{
 const source=Array.from({length:6},(_,i)=>({x:(i-3)*.5,z:.14,y:.1,size:.08,angle:Math.PI,frontage:true,profile:{family:'dune'}}));
 const options={roads:[[{x:-3,z:0},{x:3,z:0}]],heightAt:()=>.1,waterAt:()=>null,clear:()=>true};
 const first=planBacklotHousing({...options,plots:source});
 for(const family of ['urban','fishing','courtyard']){
  const plots=source.map(p=>({...p,profile:{family}})),before=structuredClone(plots),plan=planBacklotHousing({...options,plots});
  assert.deepEqual(plots,before);assert.ok(plan.length>first.length);
  assert.deepEqual(plan.filter(p=>!p.secondaryLane).map(p=>[p.x,p.z,p.size,p.access]),first.map(p=>[p.x,p.z,p.size,p.access]));
  const extra=plan.filter(p=>p.secondaryLane);assert.ok(extra.length>=2);assert.ok(extra.every(p=>p.size>=.112));
  assert.deepEqual(plan,planBacklotHousing({...options,plots}));
  for(const p of plan){
   for(const q of [...plots,...plan])if(q!==p){
    assert.ok(Math.hypot(p.x-q.x,p.z-q.z)>=p.size*.84+q.size*.84+.012);
    for(const [x,,z] of p.access)assert.ok(Math.hypot(x-q.x,z-q.z)>=q.size*.84+.020-1e-8);
   }
   assert.ok(Math.abs(p.access.at(-1)[2]-.045)<1e-7);
  }
 }
 for(const family of ['forest','tea','dune','headland'])assert.ok(planBacklotHousing({...options,plots:source.map(p=>({...p,profile:{family}}))}).every(p=>!p.secondaryLane),'natural sites do not become dense city housing');
});

test('civic facilities use real vehicle-road frontage when no walking route is supplied',()=>{
 const road=[{x:-2,z:0},{x:2,z:0}],options={places:[{id:'nanao-nature-gate',name:'Nature Gate',kind:'island',model:'gate',x:0,z:.65,span:.4,footprint:[-.2,.2,-.2,.2]}],heightAt:()=>.1,waterAt:()=>null,routes:[],roadRoutes:[road]};
 const plan=planCivicNeighborhoods(options);
 assert.ok(plan.facilities.length>0);assert.ok(plan.facilities.every(f=>f.path.length>1&&Math.abs(f.z)>.225*f.scale+.025));
 assert.deepEqual(plan,planCivicNeighborhoods({...options,roadRoutes:[road,road]}),'duplicate references must not alter placement');
 assert.equal(planCivicNeighborhoods({...options,waterAt:()=>0}).facilities.length,0);
});
test('coastal visitor back lanes add homes only at populated hubs and retain all earlier parcels',()=>{
 const options={roads:[[{x:-3,z:0},{x:3,z:0}]],heightAt:()=>.1,waterAt:()=>null,clear:()=>true};
 const source=Array.from({length:6},(_,i)=>({x:(i-3)*.5,z:.14,y:.1,size:.08,angle:Math.PI,frontage:true,profile:placeSetting({id:'nanao-nature-gate',model:'gate'})}));
 const baseline=planBacklotHousing({...options,plots:source.map(p=>({...p,profile:{...p.profile,visitorHub:false}}))});
 const plan=planBacklotHousing({...options,plots:source}),extra=plan.filter(p=>p.visitorLane);
 assert.ok(extra.length>=2);assert.deepEqual(plan,planBacklotHousing({...options,plots:source}));
 assert.deepEqual(plan.filter(p=>!p.visitorLane).map(p=>[p.x,p.z,p.size,p.access]),baseline.map(p=>[p.x,p.z,p.size,p.access]));
 for(const p of extra){
  assert.ok(p.secondaryLane);assert.ok(p.profile.visitorHub);assert.ok(Math.abs(p.access.at(-1)[2]-.045)<1e-8);
  for(const q of [...source,...plan])if(q!==p){
   assert.ok(Math.hypot(p.x-q.x,p.z-q.z)>=(p.size+q.size)*.84+.012);
   for(const [x,,z] of p.access)assert.ok(Math.hypot(x-q.x,z-q.z)>=q.size*.84+.020-1e-8);
  }
 }
 for(const p of [{id:'raoping-xiao',model:'island'},{id:'mountain',model:'forest'}])assert.equal(placeSetting(p).visitorHub,false);
 for(const restrictions of [{waterAt:()=>0},{clear:()=>false}])assert.equal(planBacklotHousing({...options,...restrictions,plots:source}).length,0);
});

test('coastal houses have shaded courtyards, terraces and shutters without enlarging their reserved footprint',()=>{
 const home=services.find(s=>s[0]==='home'),variants=[];
 for(let variant=0;variant<4;variant++){
  const base=serviceBuilding(home,{size:1,height:1,variant,residential:true});
  const coast=serviceBuilding(home,{size:1,height:1,variant,residential:true,setting:'dune'});variants.push(coast.parts);
  assert.ok(coast.parts.length>base.parts.length+12);assert.deepEqual(coast.sign,base.sign);
  assert.ok(coast.parts.some(p=>p.color==='#719395'));assert.equal(coast.parts.filter(p=>p.color==='#88aca0').length,12);
  assert.equal(coast.parts.filter(p=>p.color==='#9d9e78').length,variant%2?0:5);
  assert.equal(coast.parts.filter(p=>p.color==='#5a8291').length,variant%2?1:0);
  for(const p of coast.parts){assert.ok(Object.values(p).filter(v=>typeof v==='number').every(Number.isFinite));assert.ok(Math.hypot(Math.abs(p.x)+p.w/2,Math.abs(p.z)+p.d/2)<.84);}
 }
 assert.equal(new Set(variants.map(v=>JSON.stringify(v))).size,4);
 const school=services.find(s=>s[0]==='school');
 assert.deepEqual(serviceBuilding(school,{size:1,height:1}),serviceBuilding(school,{size:1,height:1,setting:'dune'}));
});

test('coastal homes follow gentle exaggerated terrain with supported floors and continuous entries',()=>{
 for(const slope of [-.22,.22]){
  const heightAt=(x,z)=>.3+slope*z,source=Array.from({length:6},(_,i)=>({x:(i-3)*.5,z:.14,y:heightAt(0,.14),size:.08,angle:Math.PI,frontage:true,profile:placeSetting({id:'nanao-nature-gate',model:'gate'})}));
  const options={plots:source,roads:[[{x:-3,z:0},{x:3,z:0}]],heightAt,waterAt:()=>null,clear:()=>true};
  const plan=planBacklotHousing(options),homes=plan.filter(p=>p.visitorLane);
  assert.ok(homes.length>0,'sloping visitor districts must not silently lose all housing');
  for(const p of homes){
   assert.ok(p.foundation);assert.equal(p.y,p.foundation.top);
   assert.ok(Math.hypot(p.foundation.width/2,p.foundation.depth/2)<p.size*.84);
   assert.ok(p.access[0][1]>=p.y+.009-1e-9);
   assert.ok(Math.abs(p.access.at(-1)[1]-heightAt(...[p.access.at(-1)[0],p.access.at(-1)[2]])-.023)<1e-9);
   for(let i=0;i<p.access.length;i++){
    const a=p.access[i];assert.ok(a[1]>heightAt(a[0],a[2]));
    if(i){const b=p.access[i-1];assert.ok(Math.abs(a[1]-b[1])<=Math.hypot(a[0]-b[0],a[2]-b[2])*.5+1e-9);}
   }
   for(const q of [...source,...plan])if(p!==q)assert.ok(Math.hypot(p.x-q.x,p.z-q.z)>=(p.size+q.size)*.84+.012);
  }
  for(const restrictions of [{heightAt:(x,z)=>.3+z*2},{waterAt:()=>0},{clear:()=>false}])assert.equal(planBacklotHousing({...options,...restrictions}).filter(p=>p.visitorLane).length,0);
 }
 const p={x:1,z:2,size:.12,angle:.7},heightAt=(x,z)=>.2+x*.1+z*.2,f=hillsideFoundation(p,heightAt);
 assert.ok(f.top>heightAt(p.x,p.z));assert.ok(f.bottom<heightAt(p.x,p.z));
 assert.equal(hillsideFoundation(p,()=>NaN),null);
 assert.equal(raisedHousingAccess([[0,0,0],[.01,0,0]],1),null,'reject a cliff at the entrance');
});

test('coastal visitor hubs use populated road frontage while natural scenery stays sparse',async()=>{
 const {planTourContext}=await import('../tour-context.mjs');
 const {streetClearance}=await import('../street-clearance.mjs');
 const road=[{x:-2,z:0},{x:2,z:0}];
 const p={id:'nanao-nature-gate',name:'Nature Gate',kind:'island',model:'gate',x:0,z:.8,span:.4,footprint:[-.2,.2,-.2,.2]};
 const options={places:[p],routes:[],roadRoutes:[road],heightAt:()=>.1,waterAt:()=>null};
 const busy=planTourContext(options),natural=planTourContext({...options,places:[{...p,model:'beach'}]});
 assert.ok(busy.plots.length>natural.plots.length*1.5);
 assert.ok(busy.plots.reduce((s,p)=>s+p.size**2,0)>natural.plots.reduce((s,p)=>s+p.size**2,0)*1.8);
 assert.equal(busy.streets.length,0,'use the existing approach, not another street grid');
 const clear=streetClearance([road]);
 for(const plot of busy.plots){
  assert.ok(clear(plot.x,plot.z,plot.size*.84+.036));
  assert.ok(busy.plots.every(other=>other===plot||Math.hypot(plot.x-other.x,plot.z-other.z)>=(plot.size+other.size)*.83+.015));
 }
 for(const family of ['dune','headland']){
  const selection=Array.from({length:24},(_,i)=>serviceFor({family,seed:0},i)[0]);
  assert.ok(selection.includes('home'));assert.ok(selection.includes('grocery'));assert.ok(selection.includes('coffee'));assert.ok(selection.includes('seafood'));
 }
 assert.deepEqual(busy,planTourContext(options));
 assert.equal(planTourContext({...options,waterAt:()=>0}).plots.length,0);
});

test('a blocked nearest entrance can use a different existing footpath without crossing water or buildings',()=>{
 const paths=[[[.1,0,-.2],[.1,0,.2]],[[-.15,0,-.2],[-.15,0,.2]]];
 const options={x:0,z:0,y:0,setback:.025,paths,ground:{sample:()=>({y:0,wet:false}),clear:(x,z,r)=>!(x+r>.04&&x-r<.08)}};
 const entrance=reachableExhibitEntrance(options);
 assert.ok(entrance);assert.ok(entrance.link.at(-1)[0]<0);assert.ok(entrance.link.every(p=>p[0]<0));
 assert.equal(reachableExhibitEntrance({...options,ground:{...options.ground,sample:x=>({y:0,wet:x<-.06})}}),null);
 assert.equal(reachableExhibitEntrance({...options,parcels:[{x:-.08,z:0,radius:.04}]}),null);
 assert.equal(reachableExhibitEntrance({...options,maxDistance:.12}),null);
});

test('real HDR skies retain source integrity, useful resolution and captured solar radiance',async()=>{
 for(const photo of skyPhotographs){
  const bytes=await readFile(new URL('../public'+photo.path,import.meta.url));
  assert.equal(createHash('md5').update(bytes).digest('hex'),photo.md5);
  const decoded=new RGBELoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  assert.equal(decoded.width,2048);assert.equal(decoded.height,1024);
  const sun=photographSun(decoded);assert.ok(sun.peak>10&&sun.u>0&&sun.u<1&&sun.v>0&&sun.v<1);
 }
});

test('nearby greetings have pair cooldowns and select the nearest eligible companion',()=>{
 const actors=Array.from({length:3},()=>({})),memory=createEncounterMemory(24);
 memory.remember(actors[0],actors[1],10);
 assert.equal(memory.available(actors[1],actors[0],33),false);
 assert.equal(memory.available(actors[0],actors[1],34),true);
 assert.equal(memory.available(actors[0],actors[2],11),true);
 const a={actor:actors[0],position:new THREE.Vector3(),scale:1},b={actor:actors[1],position:new THREE.Vector3(2,0,0),scale:1},c={actor:actors[2],position:new THREE.Vector3(4,0,0),scale:1};
 assert.equal(companionFor(a,[c,b]),b);
 assert.equal(companionFor(a,[c,b],v=>memory.available(a.actor,v.actor,20)),c);
});

test('street dialogue follows the setting and contest reviews reflect actual outcomes',()=>{
 const settings=[['tea','tea'],['forest','nature'],['harbour','waterside'],['small-park','heritage'],['airport','transport']];
 const scripts=new Set();
 for(const [model,theme] of settings){const p={id:model,model};assert.equal(conversationTheme(p),theme);scripts.add(conversationPair(0,p).join(''));}
 assert.equal(scripts.size,settings.length);assert.equal(conversationTheme({kind:'food'}),'food');
 assert.equal(conversationTheme({id:'chaoan-longhu',name:'龙湖古寨',contextModel:'old-town'}),'heritage','a lake character in a village name must not override its heritage context');
 for(const random of [()=>0,()=>.5,()=>1])for(let previous=0;previous<4;previous++)assert.notEqual(chooseConversation({id:'tea',model:'tea'},previous,random).index,previous);
 assert.deepEqual(reactionResult({pressed:null,ready:100,opponent:800}),{result:'timeout',reaction:null});
 for(const outcome of ['early','win','lose','timeout'])assert.notEqual(gameReview(outcome,()=>0),gameReview(outcome,()=>.99));
 assert.match(gameReview('win',()=>0),/反应真快/);assert.match(gameReview('timeout',()=>0),/没有作答/);
});

test('encounters offer optional contests only when eligible and reviews describe real outcomes',()=>{
 assert.equal(chooseEncounter({mayInvite:false},()=>0).kind,'chat');
 assert.equal(chooseEncounter({mayInvite:true},()=>0).kind,'invite');
 assert.equal(chooseEncounter({mayInvite:true},()=>.8).kind,'chat');
 for(const review of ['early','win','lose','timeout']){
  const choice=chooseEncounter({review,mayInvite:true},()=>0);assert.equal(choice.kind,'review');
  assert.equal(choice.lines[0],gameReview(review,()=>0));assert.ok(choice.lines[1].length>4);
 }
 const variants=new Set();for(const r of [.01,.4,.8]){let count=0;variants.add(chooseEncounter({mayInvite:true},()=>count++?r:0).lines.join('|'));}
 assert.equal(variants.size,3);
});

test('Small Park pocket gardens leave radial walks, arcades and the ring road unobstructed',()=>{
 assert.equal(smallParkPocketGardens.length,14);
 for(const p of smallParkPocketGardens){
  for(const u of [-p.width/2,p.width/2])for(const v of [-p.length/2,p.length/2+2]){
   const x=p.x+Math.cos(p.angle)*u+Math.sin(p.angle)*v,z=p.z-Math.sin(p.angle)*u+Math.cos(p.angle)*v;
   assert.ok(Math.hypot(x,z)<68,'stay inside the ring road');
   for(let i=0;i<8;i++)assert.ok(Math.abs(x*Math.cos(i*Math.PI/4)-z*Math.sin(i*Math.PI/4))>4.5,'reserve each radial pedestrian path');
   const a=(p.sector+.5)*Math.PI/4,tangent=x*Math.cos(a)-z*Math.sin(a);
   assert.ok(Math.abs(tangent)>6.5,'clear the arcade frontage');
  }
 }
});

test('Small Park corner activities stay outside ring traffic and inside the plaza',()=>{
 assert.equal(new Set(smallParkCornerLots.map(p=>p.service)).size,4);
 for(const p of smallParkCornerLots){
  assert.ok(Math.hypot(p.x,p.z)-15>77);
  assert.ok(Math.abs(p.x)+15<90&&Math.abs(p.z)+15<90);
  const entry=new THREE.Vector2(p.x+Math.sin(p.angle)*30,p.z+Math.cos(p.angle)*30);
  assert.ok(entry.length()>73&&entry.length()<76,'approach must connect to the original radial walkway');
 }
});

test('interior infill samples dry ground, rejects roofs and keeps paths clear',()=>{
 const group=new THREE.Group();group.position.set(3,.2,-4);group.scale.setScalar(2);
 const box=(color,x,y,z,w,h,d)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color}));m.position.set(x,y,z);group.add(m);return m;};
 box('#9fb48e',0,-.01,0,1.24,.02,.98);
 box('#4c9daa',-.32,.01,0,.36,.01,.85);
 box('#9b947c',.3,.1,-.2,.18,.2,.19);
 const paths=[[[-.05,.02,-.40],[-.05,.02,.40]],[[0,.02,.1],[.53,.02,.1]]];
 const ground=inspectExhibitGround(group);
 assert.equal(ground.sample(-.32,0).wet,true);assert.equal(ground.sample(.15,.3).wet,false);
 assert.equal(ground.clear(.3,-.2,.025),false);
 const plans=['urban','forest','courtyard'].map(family=>planExhibitInfill({group,paths,place:{id:family,model:family}}));
 assert.ok(plans.every(p=>p.parcels.length>0&&p.plants.length>0));
 for(const plan of plans){
  assert.equal(plan.access.length,plan.parcels.length+plan.amenities.length);
  for(const link of plan.access){
   const end=link.at(-1);assert.ok(pathDistance(end[0],end[2],paths).distance<1e-8);
   for(const point of link)assert.equal(ground.sample(point[0],point[2]).wet,false);
  }
  for(const p of plan.amenities)for(const q of plan.parcels)assert.ok(Math.hypot(p.x-q.x,p.z-q.z)>p.radius+q.radius);
 }
 for(const plan of plans)for(const p of [...plan.parcels,...plan.plants]){
  assert.equal(ground.sample(p.x,p.z).wet,false);assert.ok(ground.clear(p.x,p.z,p.radius));
  assert.ok(pathDistance(p.x,p.z,paths).distance>=p.radius+.036);
 }
 assert.notDeepEqual(plans[0].parcels.map(p=>[p.x,p.z]),plans[1].parcels.map(p=>[p.x,p.z]));
});

test('large pale exhibit paving is toned without recoloring water or shared building materials',()=>{
 const group=new THREE.Group(),shared=new THREE.MeshStandardMaterial({color:'#d8dfd0'});
 const floor=new THREE.Mesh(new THREE.BoxGeometry(1,.01,.8),shared);group.add(floor);
 const house=new THREE.Mesh(new THREE.BoxGeometry(.2,.3,.2),shared);house.position.y=.15;group.add(house);
 const water=new THREE.Mesh(new THREE.BoxGeometry(.3,.01,.3),new THREE.MeshStandardMaterial({color:'#4c9daa'}));group.add(water);
 const initialWater=water.material.color.getHex(),initialHouse=house.material.color.getHex();
 assert.equal(toneExhibitPaving(group,{family:'river'}),1);
 assert.equal(house.material.color.getHex(),initialHouse);assert.equal(water.material.color.getHex(),initialWater);
 assert.notEqual(floor.material,shared);assert.equal(floor.material.color.getHexString(),'98b29d');
});

test('growing premises reject water, steps, neighbours and access corridors across their full footprint',()=>{
 const options={x:0,z:0,y:0,radius:.09,bounds:[-.5,.5,-.5,.5],paths:[[[0,0,.25],[.4,0,.25]]],ground:{clear:()=>true,sample:()=>({y:0,wet:false})}};
 assert.equal(exhibitParcelFits(options),true);
 assert.equal(exhibitParcelFits({...options,bounds:[-.05,.5,-.5,.5]}),false);
 assert.equal(exhibitParcelFits({...options,ground:{...options.ground,clear:()=>false}}),false);
 for(const sample of [(x,z)=>({y:0,wet:x>.08&&Math.abs(z)<.01}),(x,z)=>({y:z>.08?.015:0,wet:false}),()=>null])assert.equal(exhibitParcelFits({...options,ground:{...options.ground,sample}}),false);
 assert.equal(exhibitParcelFits({...options,parcels:[{x:.16,z:0,radius:.08}]}),false);
 assert.equal(exhibitParcelFits({...options,access:[[[.095,0,-.3],[.095,0,.3]]]}),false);
 assert.equal(exhibitParcelFits({...options,paths:[[[0,0,.10],[.4,0,.10]]]}),false);
});

test('adaptive premises fill unused land while retaining distinct lots and reachable resting places',()=>{
 const group=new THREE.Group(),floor=new THREE.Mesh(new THREE.BoxGeometry(1.24,.02,.98),new THREE.MeshStandardMaterial({color:'#9fb48e'}));floor.position.y=-.01;group.add(floor);
 const paths=[[[-.3,0,-.4],[-.3,0,.4]],[[.25,0,-.4],[.25,0,.4]]],options={group,paths,place:{id:'growth-test',model:'urban'}};
 const plan=planExhibitInfill(options),ground=inspectExhibitGround(group);
 const original=plan.parcels.reduce((s,p)=>s+p.originalSize**2,0),grown=plan.parcels.reduce((s,p)=>s+p.size**2,0);
 assert.ok(grown>original*1.3,'spacious parcels should have materially larger buildings');
 assert.ok(plan.amenities.length>0);assert.equal(plan.access.length,plan.parcels.length+plan.amenities.length);
 assert.deepEqual(plan.parcels.map(p=>[p.x,p.z,p.size]),planExhibitInfill(options).parcels.map(p=>[p.x,p.z,p.size]));
 for(const [index,p] of plan.parcels.entries()){
  assert.ok(p.size>=p.originalSize&&p.size<=.13);
  if(p.size>p.originalSize)assert.ok(exhibitParcelFits({x:p.x,z:p.z,y:p.y,radius:p.radius,bounds:[-.57,.57,-.43,.43],ground,paths,parcels:[...plan.parcels.filter(q=>q!==p),...plan.amenities],access:plan.access.filter((_,i)=>i!==index)}));
 }
 for(const link of plan.access){assert.ok(pathDistance(link.at(-1)[0],link.at(-1)[2],paths).distance<1e-8);for(const point of link)assert.equal(ground.sample(point[0],point[2]).wet,false);}
});

test('visitor squares can use available interior frontage beyond the natural-site allowance',()=>{
 const group=new THREE.Group(),floor=new THREE.Mesh(new THREE.BoxGeometry(1.24,.02,.98),new THREE.MeshStandardMaterial({color:'#9fb48e'}));floor.position.y=-.01;group.add(floor);
 const paths=[[[-.3,0,-.4],[-.3,0,.4]],[[.25,0,-.4],[.25,0,.4]]];
 const place={id:'nanao-nature-gate',model:'gate'},options={group,paths,place};
 const square=planExhibitInfill(options),natural=planExhibitInfill({...options,place:{...place,model:'beach'}});
 assert.ok(square.parcels.length>natural.parcels.length);assert.ok(natural.parcels.length<=6);
 assert.ok(square.amenities.length>0);
 for(const p of square.parcels){
  assert.ok(pathDistance(p.x,p.z,paths).distance>=p.radius+.036);
  assert.ok(square.parcels.every(q=>q===p||Math.hypot(p.x-q.x,p.z-q.z)>=p.radius+q.radius+.015));
 }
 for(const link of square.access)assert.ok(pathDistance(link.at(-1)[0],link.at(-1)[2],paths).distance<1e-8);
 assert.deepEqual(square.parcels.map(p=>[p.x,p.z,p.size]),planExhibitInfill(options).parcels.map(p=>[p.x,p.z,p.size]));
});

test('Nature Gate fills missed interior lots without removing its resting area or landmark',()=>{
 const place={...nanaoPlaces.find(p=>p.model==='gate'),x:0,z:0},root=new THREE.Group();
 buildNanaoSights({parent:root,places:[place],heightAt:()=>0,waterAt:()=>null,toWorld:()=>[0,0]});
 const model=root.getObjectByName(place.id),stats=model.userData.infill;
 assert.ok(stats.gapServices>=2,'actual monument geometry should gain connected infill');
 assert.ok(stats.services>=6);assert.ok(stats.homes>=1);
 assert.ok(stats.amenities>=1&&stats.people>=2,'existing tea seating and residents remain');
 assert.ok(stats.gardenArea>.001,'remaining dry ground gains visible continuous planting');
 assert.equal(stats.access,stats.services+stats.amenities);
 assert.ok(new THREE.Box3().setFromObject(model).max.y>.5,'monument retains its full height');
});

test('shop approaches reject water gaps, obstacles and steep changes between dry endpoints',()=>{
 const options={start:[0,.003,0],end:[.15,0],ground:{clear:()=>true,sample:()=>({y:0,wet:false})}};
 const path=planExhibitAccess(options);assert.ok(path.length>10);assert.deepEqual(path[0],options.start);
 assert.deepEqual(path.at(-1),[.15,.003,0]);
 for(const ground of [
  {clear:()=>true,sample:x=>({y:0,wet:x>.06&&x<.09})},
  {clear:x=>x<.06||x>.09,sample:()=>({y:0,wet:false})},
  {clear:()=>true,sample:x=>({y:x>.06?.05:0,wet:false})}
 ])assert.equal(planExhibitAccess({...options,ground}),null);
 assert.equal(planExhibitAccess({...options,parcels:[{x:.07,z:0,radius:.02}]}),null);
});

test('opt-in exhibit homes have four varied courtyards without replacing existing regional architecture',()=>{
 const service=services.find(s=>s[0]==='home'),signatures=new Set();
 assert.equal(serviceBuilding(service,{size:.07,height:.14}),null);
 for(let variant=0;variant<4;variant++){
  const p=serviceBuilding(service,{size:.07,height:.14,variant,residential:true,low:true});
  assert.ok(p.parts.length>15);signatures.add(JSON.stringify(p.parts.map(p=>[p.x,p.z,p.h])));
  for(const r of p.parts)assert.ok(Math.hypot(Math.abs(r.x)+r.w/2,Math.abs(r.z)+r.d/2)<.07*.84);
 }
 assert.equal(signatures.size,4);
});

test('amenity residents stay seated or at their stall and retain articulated gestures after batching',()=>{
 const gestures=new Set();
 for(const type of ['tea','market','shelter','bench']){
  const root=new THREE.Group(),actors=addAmenityPeople(root,{type},2);
  const positions=actors.map(a=>a.root.position.toArray());batchStatic(root);
  for(let t=0;t<40;t+=.5)for(const [i,a] of actors.entries()){
   a.ambientUpdate(t);assert.deepEqual(a.root.position.toArray(),positions[i]);
   assert.ok(a.root.children.length>=5,'batching must not consume moving limbs');
   assert.equal(a.root.userData.state,type==='market'?'look':'sit');
   gestures.add(amenityPose(type,t,2+i).gesture);
   if(type!=='market')assert.equal(a.root.children[1].rotation.x,-Math.PI/2);
  }
  if(type==='tea')assert.ok(actors[0].root.position.distanceTo(actors[1].root.position)>.035);
 }
 for(const gesture of ['drink','talk','arrange','wave'])assert.ok(gestures.has(gesture));
 assert.notDeepEqual(amenityPose('tea',0,0),amenityPose('tea',0,3));
});

test('amenity gestures ease through activity boundaries and cycle seams without moving seated feet',()=>{
 for(const type of ['tea','market','shelter','bench'])for(const index of [0,2,4]){
  const actors=addAmenityPeople(new THREE.Group(),{type},index);
  for(const actor of actors){
   const positions=actor.root.position.toArray();
   const rotations=()=>[actor.root.rotation.y,...actor.root.children.slice(1,5).flatMap(p=>[p.rotation.x,p.rotation.z])];
   actor.ambientUpdate(0);let previous=rotations();
   for(let t=.02;t<120;t+=.02){
    actor.ambientUpdate(t);const current=rotations();
    current.forEach((angle,i)=>assert.ok(Math.abs(angle-previous[i])<.09,`${type}: abrupt joint transition at ${t}`));
    assert.deepEqual(actor.root.position.toArray(),positions);previous=current;
   }
   actor.ambientUpdate(37.8);const resumed=rotations();
   actor.ambientUpdate(180);actor.ambientUpdate(37.8);
   assert.deepEqual(rotations(),resumed,'pose must not depend on frame history after a tab resumes');
  }
 }
 const p=amenityPose('bench',5,0);assert.equal(p.gesture,'stretch');assert.ok(p.weight>0);
 assert.notEqual(amenityPose('tea',10,0).weight,amenityPose('tea',10,4).weight);
});

test('civic visitors pause for different activities and face the direction they travel',()=>{
 const paused=new Set();
 for(const theme of ['school','workshop','gallery','square','library','playground','orchard','bicycle']){
  let previous=civicVisitorPose(theme,0,0);
  for(let t=.05;t<44;t+=.05){
   const current=civicVisitorPose(theme,t,0),delta=current.u-previous.u;
   assert.ok(Math.abs(delta)<.003,'visitor path must remain continuous');
   assert.ok(Math.abs(current.u)<=.12&&current.v>.1);
   if(current.state==='walk'&&previous.state==='walk'&&Math.abs(delta)>1e-5)assert.equal(Math.sign(delta),Math.sign(Math.sin(current.yaw)));
   if(current.state!=='walk')paused.add(current.state);
   previous=current;
  }
 }
 assert.ok(paused.size>=5);
});

test('civic seated visitors match real chair tops and do not slide into tables',()=>{
 for(const theme of ['tea','bus','clinic'])for(let index=0;index<12;index++){
  const start=civicVisitorPose(theme,0,index),gestures=new Set();
  for(let t=0;t<65;t+=.1){
   const pose=civicVisitorPose(theme,t,index);gestures.add(pose.gesture);
   assert.deepEqual([pose.u,pose.v,pose.y,pose.yaw],[start.u,start.v,start.y,start.yaw]);
   assert.equal(pose.state,'sit');
   assert.ok(Math.abs(pose.y+.8*civicPersonScale-.039)<1e-9,'hips must meet the seat surface');
   if(theme==='tea'){
    assert.equal(pose.v,.078);assert.equal(pose.yaw,Math.PI);
    assert.ok(pose.v-.8*civicPersonScale>.035+.026,'feet must remain outside the tabletop footprint');
   }
  }
  assert.ok(gestures.has(theme==='tea'?'drink':'wave'));assert.ok(gestures.has(null));
 }
});

test('market visitors stop at three stalls, stay in the front aisle and turn smoothly',()=>{
 for(let index=0;index<12;index++){
  const stops=new Set();let previous=civicVisitorPose('market',0,index);
  for(let t=.01;t<65;t+=.01){
   const pose=civicVisitorPose('market',t,index),delta=pose.u-previous.u;
   assert.ok(Math.abs(delta)<.001);assert.equal(pose.v,.122);assert.equal(pose.y,.024);
   assert.ok(pose.v-civicPersonScale*.7>.045+.075/2,'body must clear the stall awning');
   const turn=Math.atan2(Math.sin(pose.yaw-previous.yaw),Math.cos(pose.yaw-previous.yaw));
   assert.ok(Math.abs(turn)<.06,'avoid orientation snaps, including cycle wrap');
   if(pose.state==='walk'&&previous.state==='walk'&&Math.abs(delta)>1e-6)assert.equal(Math.sign(delta),Math.sign(Math.sin(pose.yaw)));
   if(pose.state==='idle')stops.add(pose.u);previous=pose;
  }
  assert.deepEqual([...stops].sort((a,b)=>a-b),[-.125,0,.125]);
 }
});

test('service premises have distinct floor plans, safe parcels and finite geometry',()=>{
 const signatures=new Set();
 for(const service of services){
  const program=serviceBuilding(service,{size:.07,height:.14,variant:2});
  if(service[0]==='home'){assert.equal(program,null);continue;}
  assert.ok(program.parts.length>5,service[0]);
  signatures.add(JSON.stringify(program.parts.map(p=>[p.x,p.z,p.w,p.h,p.d,p.shape])));
  for(const p of program.parts){
   assert.ok([p.x,p.y,p.z,p.w,p.h,p.d,p.turn].every(Number.isFinite));
   assert.ok(p.w>0&&p.h>0&&p.d>0);
   assert.ok(['box','sphere','cylinder'].includes(p.shape));
   assert.ok(Math.hypot(Math.abs(p.x)+p.w/2,Math.abs(p.z)+p.d/2)<.07*.84,service[0]+' exceeds the reserved parcel');
  }
  const low=serviceBuilding(service,{size:.07,height:.14,variant:2,low:true});
  assert.ok(Math.max(...low.parts.map(p=>p.y+p.h/2))<Math.max(...program.parts.map(p=>p.y+p.h/2)));
 }
 assert.equal(signatures.size,services.length-1);
});

test('all service workers occupy clear mirrored premises and their seated hips meet real chairs',()=>{
 const activities=new Set(),outfits=new Set();
 for(const service of services)for(const variant of [0,1,2,3])for(const low of [true,false]){
  const program=serviceBuilding(service,{size:.09,height:.14,variant,low,residential:true}),s=program.staff;
  assert.ok(serviceStaffFits(program),service[0]+' variant '+variant);
  activities.add(s.activity);outfits.add(s.outfit);
  for(let t=0;t<70;t+=.5){
   const pose=serviceActivityPose(s,t,variant);
   assert.ok(pose.position.every(Number.isFinite));assert.ok(Math.hypot(pose.position[0],pose.position[2])+s.scale*1.1<.09*.84,service[0]+' must stay inside its parcel');
  }
  if(s.seated){
   const chair=program.parts.find(p=>['#79968b'].includes(p.color)&&Math.abs(p.x-s.position[0])<1e-9&&Math.abs(p.z-s.position[2])<1e-9);
   assert.ok(chair);assert.ok(Math.abs(s.position[1]+s.scale*.8-chair.y-chair.h/2)<1e-9);
  }
 }
 assert.ok(activities.size>=9);assert.ok(outfits.size>=7);
});

test('service work cycles preserve moving limbs, smooth turns and deterministic resume poses',()=>{
 for(const service of services){
  const p={service,program:serviceBuilding(service,{size:.09,height:.1,variant:1,low:true,residential:true})},root=new THREE.Group(),actor=addServiceResident(root,p,3);
  assert.ok(actor);batchStatic(root);assert.ok(actor.root.children.length>=5);
  const values=()=>[...actor.root.position.toArray(),actor.root.rotation.y,actor.root.children[0].rotation.x,...actor.root.children.slice(1,5).flatMap(p=>[p.rotation.x,p.rotation.z])];
  actor.ambientUpdate(0);let previous=values(),moving=false,gesturing=false;
  for(let t=.02;t<80;t+=.02){
   actor.ambientUpdate(t);const current=values();
   for(let i=0;i<current.length;i++){
    const delta=i===3?Math.atan2(Math.sin(current[i]-previous[i]),Math.cos(current[i]-previous[i])):current[i]-previous[i];
    assert.ok(Math.abs(delta)<.12,service[0]+' jumps at '+t+' value '+i);
   }
   moving ||= Math.abs(current[0]-previous[0])>1e-7;gesturing ||= current.slice(9).some((v,i)=>Math.abs(v-previous[i+9])>1e-5);
   if(p.program.staff.seated)assert.equal(actor.root.children[1].rotation.x,-Math.PI/2);
   previous=current;
  }
  if(service[0]==='warehouse')assert.ok(moving);else assert.ok(gesturing,service[0]+' should visibly work or rest');
  actor.ambientUpdate(18.2);const expected=values();actor.ambientUpdate(900);actor.ambientUpdate(18.2);assert.deepEqual(values(),expected);
  const target=new THREE.Vector3(.1,.02,.1),feet=actor.root.position.clone();actor.respondTo(18.2,target,{elapsed:2,remaining:3});assert.ok(feet.equals(actor.root.position));actor.ambientUpdate(18.2);assert.deepEqual(values(),expected);
 }
});

test('exhibit staffing is bounded, varies service types and rejects obstructed stations',()=>{
 const parcels=services.map((service,i)=>({service,size:.08,program:serviceBuilding(service,{size:.08,height:.1,variant:i%4,low:true,residential:true})}));
 const choices=chooseServiceResidents(parcels,8);assert.equal(choices.length,2);assert.notEqual(choices[0].service[0],choices[1].service[0]);assert.deepEqual(chooseServiceResidents(parcels,8),choices);
 assert.notDeepEqual(chooseServiceResidents(parcels,9),choices);assert.equal(chooseServiceResidents([],8).length,0);
 const blocked=structuredClone(parcels[0]);blocked.program.parts.push({x:0,y:.1,z:0,w:1,h:1,d:1});assert.equal(serviceStaffFits(blocked.program),false);assert.equal(chooseServiceResidents([blocked],0).length,0);
});

test('mirrored commercial layouts keep sign orientation and reserved parcel clearance',()=>{
 for(const service of services.filter(s=>s[0]!=='home')){
  const a=serviceBuilding(service,{size:1,height:1,variant:0}),b=serviceBuilding(service,{size:1,height:1,variant:1});
  assert.equal(a.parts.length,b.parts.length);assert.equal(b.sign.x,-a.sign.x);assert.equal(b.sign.z,a.sign.z);
  for(let i=0;i<a.parts.length;i++){assert.equal(b.parts[i].x,-a.parts[i].x);assert.equal(b.parts[i].turn,-a.parts[i].turn);}
  for(const variant of [0,1,2,3])for(const p of serviceBuilding(service,{size:1,height:1,variant}).parts)assert.ok(Math.hypot(Math.abs(p.x)+p.w/2,Math.abs(p.z)+p.d/2)<.84,service[0]);
 }
 const market=services.find(s=>s[0]==='supermarket');
 for(const variant of [0,1,2,3]){
  const p=serviceBuilding(market,{size:1,height:1,variant});
  assert.equal(p.parts.some(r=>r.z-r.d/2>.28&&Math.abs(r.x)-r.w/2<.10),false,'produce and trolley must leave the central entrance clear');
 }
});

test('florists and groceries reserve entrance aisles while bowls distinguish soup from noodles',()=>{
 for(const [type,entry] of [['florist',.07],['grocery',.14]])for(let variant=0;variant<4;variant++){
  const program=serviceBuilding(services.find(s=>s[0]===type),{size:1,height:1,variant});
  const x=variant%2?-entry:entry;
  const blockers=program.parts.filter(r=>r.z-r.d/2>.14&&r.y-r.h/2<.5&&r.y+r.h/2>.04&&Math.abs(r.x-x)<r.w/2+.055);
  assert.deepEqual(blockers,[],type+' must not put merchandise across the entry');
 }
 const soup=serviceBuilding(services.find(s=>s[0]==='soup'),{size:1,height:1}),noodles=serviceBuilding(services.find(s=>s[0]==='noodles'),{size:1,height:1});
 assert.equal(soup.parts.filter(r=>r.color==='#bdb595'&&r.shape==='sphere').length,6);
 assert.equal(noodles.parts.filter(r=>r.color==='#dbc273'&&r.shape==='box').length,6);
 for(const program of [soup,noodles]){
  assert.equal(program.parts.filter(r=>r.color==='#d4d1b7'&&r.shape==='cylinder').length,2);
  assert.equal(program.parts.filter(r=>r.color==='#826947').length,4);
 }
});

test('school and warehouse alternatives change architecture while keeping entry corridors open',()=>{
 const make=(type,variant)=>serviceBuilding(services.find(s=>s[0]===type),{size:1,height:1,variant});
 for(const type of ['school','warehouse']){
  const footprint=v=>make(type,v).parts.map(p=>[p.x,p.z,p.w,p.h,p.d,p.shape]);
  assert.notDeepEqual(footprint(0),footprint(2));
  assert.equal(make(type,2).parts.length,make(type,3).parts.length);
 }
 for(const variant of [2,3]){
  const school=make('school',variant);
  const blockers=school.parts.filter(p=>p.z+p.d/2>-.19&&p.z-p.d/2<.55&&p.y-p.h/2<.35&&p.y+p.h/2>.12&&Math.abs(p.x)<p.w/2+.055);
  assert.deepEqual(blockers,[],'school courtyard must retain the central route to its door');
  const warehouse=make('warehouse',variant);
  assert.equal(warehouse.parts.filter(p=>p.color==='#355458').length,2);
  for(const x of [-.26,.26])assert.equal(warehouse.parts.some(p=>p.z-p.d/2>.42&&p.y-p.h/2<.3&&p.y+p.h/2>.08&&Math.abs(p.x-x)<p.w/2+.08),false,'crates must not block either loading bay');
 }
 for(const variant of [0,1,2,3]){
  const police=make('police',variant);assert.equal(police.parts.filter(p=>p.color==='#355568').length,1);
  assert.equal(police.parts.filter(p=>p.color==='#a0b4ae').length,3);
 }
});
test('sun rises in geographic east, crosses the meridian and sets in west',()=>{
 assert.ok(solarPosition(6).east>.99);assert.ok(solarPosition(12).altitude>.99);assert.ok(solarPosition(18).east<-.99);assert.equal(solarPosition(22).period,'night');
});
test('landscape colour is continuous across former tile boundaries',()=>{
 for(let x=-10;x<10;x+=.1){const a=landscapeColor(x-1e-7,1.3),b=landscapeColor(x+1e-7,1.3);assert.ok(a.every((c,i)=>Math.abs(c-b[i])<1e-6));assert.ok(a.every(c=>c>=0&&c<.6));}
});
test('cached people retain different clothing and skin palettes',()=>{
 const a=personGeometry('overalls',0),b=personGeometry('overalls',1);assert.notEqual(a,b);assert.notDeepEqual([...a.attributes.color.array],[...b.attributes.color.array]);assert.equal(a,personGeometry('overalls',0));
 const p=person(new THREE.Group(),3),states=new Set();for(const state of ['walk','wave','talk','clap','stretch','photo']){p.pose(2,state);states.add(p.root.children.slice(1).map(o=>o.rotation.toArray().join(',')).join('|'));}assert.equal(states.size,6);
});

test('social gestures retain the legs of walking and seated people',()=>{
 const actor=person(new THREE.Group(),2);
 for(const state of ['walk','run','sit'])for(const gesture of ['wave','talk']){
  actor.pose(1.25,state);const legs=actor.root.children.slice(1,3).map(o=>o.rotation.toArray());
  actor.gesture(1.25,gesture);
  assert.deepEqual(actor.root.children.slice(1,3).map(o=>o.rotation.toArray()),legs);
  assert.equal(actor.root.userData.state,state);
 }
});
test('social responses face the companion in rotated scenes without moving feet or changing seated legs',()=>{
 const group=new THREE.Group();group.rotation.y=1.3;group.scale.setScalar(2.4);
 const actor=person(group,3),root=actor.root;root.position.set(.2,.04,.1);root.rotation.y=.6;
 for(const state of ['walk','run','sit'])for(const side of [-1,1]){
  actor.pose(2,state);root.updateWorldMatrix(true,false);
  const target=root.localToWorld(new THREE.Vector3(side*4,0,3));
  const position=root.position.toArray(),heading=root.rotation.toArray(),legs=root.children.slice(1,3).map(o=>o.rotation.toArray());
  const before=root.children.map(o=>({position:o.position.toArray(),rotation:o.rotation.toArray()}));
  actor.respondTo(2,target,{elapsed:.7,remaining:4,speaker:0});
  assert.ok(side*root.children[0].rotation.y>.2);assert.equal(root.userData.socialResponse.hand,side<0?'left':'right');
  const hand=root.children[side<0?3:4];assert.ok(side*hand.rotation.z>1);
  assert.deepEqual(root.position.toArray(),position);assert.deepEqual(root.rotation.toArray(),heading);
  assert.deepEqual(root.children.slice(1,3).map(o=>o.rotation.toArray()),legs);assert.equal(root.userData.state,state);
  actor.clearResponse();assert.equal(root.userData.socialResponse,undefined);
  assert.deepEqual(root.children.map(o=>({position:o.position.toArray(),rotation:o.rotation.toArray()})),before);
 }
});
test('conversation gestures fade smoothly, alternate speakers and restore current base animation',()=>{
 assert.equal(socialResponsePose(0,5).weight,0);assert.equal(socialResponsePose(5,0).weight,0);
 for(let t=.02;t<5;t+=.02){const a=socialResponsePose(t,5-t),b=socialResponsePose(t-.02,5-t+.02);for(const key of ['weight','wave','talk'])assert.ok(Math.abs(a[key]-b[key])<.11,key);}
 assert.ok(socialResponsePose(.6,4,0).wave>.7);assert.equal(socialResponsePose(.6,4,1).wave,0);
 assert.ok(socialResponsePose(1.8,3,1).wave>.7);
 const actor=person(new THREE.Group(),4),baseline=person(new THREE.Group(),4);
 const target=new THREE.Vector3(.1,0,.1);
 for(let t=0;t<6;t+=.02){
  actor.pose(t,'walk');baseline.pose(t,'walk');actor.respondTo(t,target,{elapsed:t,remaining:6-t});
  actor.clearResponse();assert.deepEqual(actor.root.children.map(o=>o.rotation.toArray()),baseline.root.children.map(o=>o.rotation.toArray()));
 }
 actor.pose(2,'sit');actor.respondTo(2,target,{elapsed:2,remaining:3});
 actor.pose(3,'run');baseline.pose(3,'run');
 assert.deepEqual(actor.root.children.map(o=>o.rotation.toArray()),baseline.root.children.map(o=>o.rotation.toArray()));
});
test('neighbourhood services vary by setting and cover every requested service type',()=>{
 const found=new Set();for(const family of ['urban','tea','harbour','courtyard','forest','transport'])for(let i=0;i<100;i++)found.add(serviceFor({...placeSetting({id:'test'}),family},i)[0]);
 assert.equal(found.size,services.length);assert.ok(!Array.from({length:30},(_,i)=>serviceFor({family:'forest',seed:3},i)[0]).includes('kfc'));
 const g=new THREE.Group();addServiceSigns(g,[{x:0,y:0,z:0,width:.1,height:.02,angle:1,service:services[0]}]);assert.ok([...g.children[0].geometry.attributes.position.array].every(Number.isFinite));
});
test('reaction rounds distinguish false starts, wins and losses; dialogue varies',()=>{
 assert.equal(reactionResult({pressed:1,ready:2,opponent:800}).result,'early');assert.equal(reactionResult({pressed:200,ready:100,opponent:800}).result,'win');assert.equal(reactionResult({pressed:1000,ready:100,opponent:800}).result,'lose');
 for(const kind of ['greeting','chat','contest','review'])assert.notEqual(speech(kind,()=>0),speech(kind,()=>.99));
});
test('nearby people greet a separate companion, excluding overlaps and distant actors',()=>{
 const a={position:new THREE.Vector3(),scale:.02},close={position:new THREE.Vector3(.08,0,0),scale:.02},overlap={position:new THREE.Vector3(.001,0,0),scale:.02},far={position:new THREE.Vector3(3,0,0),scale:.02};
 assert.equal(companionFor(a,[a,overlap,far,close]),close);assert.equal(companionFor(a,[a,overlap,far]),undefined);
});

test('street conversation pairs vary without inventing a completed match',()=>{
 const pairs=Array.from({length:8},(_,i)=>conversationPair(i));
 assert.equal(new Set(pairs.map(p=>p.join('|'))).size,8);
 assert.ok(pairs.every(p=>p.length===2&&p.every(s=>s.length>4&&!/这一局|反应真快|再练一轮/.test(s))));
 assert.deepEqual(conversationPair(8),pairs[0]);
});
test('dense source roads get road-front houses instead of overlapping rotated block grids',async()=>{
 const {planTourContext}=await import('../tour-context.mjs');
 const places=[{id:'city',name:'City',kind:'district',x:0,z:0},
  {id:'coast',name:'Coast',kind:'raoping',model:'twin-island',x:1,z:1,span:.3,footprint:[-.2,.2,-.2,.2]},
  {id:'woods',name:'Woods',kind:'huilai',model:'forest',x:-1,z:-1,span:.3,footprint:[-.2,.2,-.2,.2]}];
 const routes=[];for(let x=-4;x<=4;x+=.4)routes.push([{x,z:-4},{x,z:4}]);
 const plan=planTourContext({places,routes,heightAt:()=>0,waterAt:()=>null});
 assert.equal(plan.infillCoverage.length,3);assert.ok(plan.infillCoverage.every(c=>c.nearby>0));
 assert.ok(plan.plots.length>100);assert.ok(plan.streets.length<20,'dense roads should not receive an extra grid');
 for(let i=0;i<plan.plots.length;i++)for(let j=i+1;j<plan.plots.length;j++){
  const a=plan.plots[i],b=plan.plots[j];assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=(a.size+b.size)*.83+.0149);
 }
});

test('peripheral premises use vehicle roads as well as footpaths without duplicating or covering either',async()=>{
 const {planTourContext}=await import('../tour-context.mjs');
 const {streetClearance}=await import('../street-clearance.mjs');
 const road=[{x:-3,z:0},{x:3,z:0}],walk=[{x:-3,z:.5},{x:3,z:.5}];
 const options={places:[{id:'coast',name:'Coast',kind:'raoping',model:'twin-island',x:0,z:1,span:.3,footprint:[-.2,.2,-.2,.2]}],routes:[],heightAt:()=>.1,waterAt:()=>null};
 const empty=planTourContext(options),withRoad=planTourContext({...options,roadRoutes:[road]});
 assert.equal(empty.plots.length,0);assert.ok(withRoad.plots.length>0);
 assert.deepEqual(withRoad,planTourContext({...options,roadRoutes:[road,road]}));
 assert.deepEqual(withRoad,planTourContext({...options,routes:[road],roadRoutes:[road]}));
 const both=planTourContext({...options,routes:[walk],roadRoutes:[road]}),clear=streetClearance([road,walk]);
 assert.ok(both.plots.some(p=>Math.abs(p.z)<.2));assert.ok(both.plots.some(p=>Math.abs(p.z-.5)<.2));
 for(const p of both.plots)assert.ok(clear(p.x,p.z,p.size*.8+.036),'reserve both kinds of source road');
 assert.equal(planTourContext({...options,roadRoutes:[road],waterAt:()=>0}).plots.length,0);
});

test('road-front parcels use available land without moving, merging or crossing terrain and road limits',async()=>{
 const {growRoadsideParcels}=await import('../tour-context.mjs');
 const parcel=(x,z,frontage=true)=>({x,z,y:0,size:.054,frontage,profile:{family:'headland'}});
 const options={offRoad:()=>true,clear:()=>true,heightAt:()=>0};
 const open=[parcel(0,0),parcel(.23,0),parcel(.5,0,false)];
 growRoadsideParcels(open,options);
 assert.ok(open[0].size>.09&&open[1].size>.09);assert.equal(open[2].size,.054);
 assert.deepEqual(open.map(p=>[p.x,p.z]),[[0,0],[.23,0],[.5,0]]);
 assert.ok(open[0].size**2>open[0].originalSize**2*2);
 const neighbours=[parcel(0,0),parcel(.115,0)];growRoadsideParcels(neighbours,options);
 assert.ok((neighbours[0].size+neighbours[1].size)*.83+.015<=.115);
 const road=[parcel(0,0)];growRoadsideParcels(road,{...options,offRoad:(x,z,r)=>r<.095});
 assert.ok(road[0].size*.84+.036<.095);assert.ok(road[0].size<open[0].size);
 for(const restriction of [{clear:()=>false},{heightAt:(x,z)=>x<-.048?.03:0}]){
  const blocked=[parcel(0,0)];growRoadsideParcels(blocked,{...options,...restriction});assert.equal(blocked[0].size,.054);
 }
});

test('later street grids reserve earlier streets and generated roads gain their own frontage',async()=>{
 const {planTourContext}=await import('../tour-context.mjs');
 const {streetClearance}=await import('../street-clearance.mjs');
 const options={places:[{id:'first-city',name:'First',kind:'district',x:0,z:0},{id:'second-city',name:'Second',kind:'district',x:1.1,z:.3},{id:'third-city',name:'Third',kind:'district',x:-1,z:.4}],routes:[],heightAt:()=>0,waterAt:()=>null};
 const plan=planTourContext(options),blocks=plan.streets.filter(s=>s.role==='block');
 assert.equal(new Set(blocks.map(s=>s.owner)).size,3);
 const crosses=(a,b)=>{
  const p=a.points[0],q=a.points.at(-1),r=b.points[0],s=b.points.at(-1),dx=q[0]-p[0],dz=q[2]-p[2],ux=s[0]-r[0],uz=s[2]-r[2],den=dx*uz-dz*ux;
  if(Math.abs(den)<1e-9)return false;const t=((r[0]-p[0])*uz-(r[2]-p[2])*ux)/den,u=((r[0]-p[0])*dz-(r[2]-p[2])*dx)/den;
  return t>.001&&t<.999&&u>.001&&u<.999;
 };
 for(let i=0;i<blocks.length;i++)for(let j=i+1;j<blocks.length;j++)if(blocks[i].owner!==blocks[j].owner)assert.equal(crosses(blocks[i],blocks[j]),false,'different neighbourhood grids must not cross');
 assert.ok(plan.plots.filter(p=>p.frontage).length>10,'newly generated streets must also support roadside premises');
 const offRoad=streetClearance(plan.streets.map(s=>s.points.map(p=>({x:p[0],z:p[2]}))));
 for(const p of plan.plots)assert.ok(offRoad(p.x,p.z,p.size*.8+.036));
 assert.deepEqual(plan,planTourContext(options));
});

test('planting cells do not create another layer of tiled ground geometry',async()=>{
 const {buildIntroSurroundings}=await import('../intro-surroundings.mjs');
 const result=buildIntroSurroundings({parent:new THREE.Group(),places:[{id:'woods',name:'Forest',kind:'mountain',x:0,z:0}],heightAt:()=>0,waterAt:()=>null});
  assert.ok(result.stats.cells>0);let surfaces=0;
  assert.ok(result.stats.understory>0,'empty forest ground needs clustered low planting');
 result.group.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh)surfaces++;});
 assert.equal(surfaces,0,'terrain, not square overlays, must own all ground shading');
});

test('soft planting has curved leaves, separate petal colors and economical overview models',async()=>{
 const {plantingGeometry,plantingTypes}=await import('../landscape-planting.mjs');
 for(const type of plantingTypes){
  const high=plantingGeometry(type),low=plantingGeometry(type,true),positions=high.attributes.position.array;
  assert.ok(Array.from(positions).every(Number.isFinite));assert.ok(Array.from(high.attributes.normal.array).every(Number.isFinite));
  assert.ok(high.attributes.position.count<2000,type+' close-up vertex budget');
  assert.ok(low.attributes.position.count<200,type+' overview vertex budget');
  assert.ok(high.index&&low.index);assert.ok(low.index.count<high.index.count/3);
  assert.ok(high.attributes.position.count<high.index.count,'repeated plant vertices should be shared');
  assert.ok(high.boundingBox.min.y>-1e-7&&high.boundingBox.max.y>.4);
  for(let i=0;i<positions.length;i+=3)assert.ok(Math.hypot(positions[i],positions[i+2])<1,'plant remains in its reserved circular footprint');
  const colors=new Set();for(let i=0;i<high.attributes.color.array.length;i+=3)colors.add(Array.from(high.attributes.color.array.slice(i,i+3)).join(','));
  assert.ok(colors.size>=(['woodland','meadow','coastal'].includes(type)?2:4));assert.equal(plantingGeometry(type),high);
 }
});

test('soft landscape follows terrain and excludes paths, banks, entrances and crops in every region',async()=>{
 const {planSoftLandscape,addSoftLandscape}=await import('../landscape-planting.mjs');
 const {placeSetting,settingCell}=await import('../place-setting.mjs');
 const models=['forest','lighthouse','courtyard','lake','town','beach'];
 const cells=models.flatMap((model,j)=>Array.from({length:40},(_,i)=>{
  const profile=placeSetting({id:'region-'+j,model}),x=(i%10)*.04+j,z=Math.floor(i/10)*.04;
  return {x,z,y:.03,size:.038,seed:i*117,profile,setting:settingCell(profile,x,z,.038),kind:'lawn',owner:'region-'+j};
 }));
 const rows=planSoftLandscape(cells,{heightAt:(x,z)=>.2*x+.1*z});
 assert.ok(rows.length>80);assert.equal(new Set(rows.map(r=>r.owner)).size,models.length);assert.ok(new Set(rows.map(r=>r.type)).size>=4);
 assert.deepEqual(rows,planSoftLandscape(cells,{heightAt:(x,z)=>.2*x+.1*z}));
 for(const p of rows){assert.ok(Math.abs(p.y-(.2*p.x+.1*p.z+.001))<1e-8);assert.ok(Math.abs(p.normal[0]+.2)<1e-8);}
 for(const changes of [{kind:'walk'},{kind:'bank'},{nearBuilding:true},{setting:{treatment:'crop'}}])assert.equal(planSoftLandscape(cells.map(c=>({...c,...changes}))).length,0);
 const group=addSoftLandscape(new THREE.Group(),rows);assert.equal(group.userData.planting.count,rows.length);
 group.traverse(o=>{if(o.isMesh){assert.ok(o.isInstancedMesh);assert.equal(o.castShadow,false);}});
});

test('meadows and flower borders use open leaf fans instead of repeated solid ground lumps',async()=>{
 const {plantingGeometry,applyMeadowSurface}=await import('../landscape-planting.mjs');
 for(const type of ['meadow','coastal','flowers','garden'])for(const low of [false,true]){
  const g=plantingGeometry(type,low);
  assert.equal(g.userData.solidCanopies,0);
  assert.equal(g.userData.leafFans,5);
  const p=g.attributes.position;let rooted=0;
  for(let i=0;i<p.count;i++)if(p.getY(i)<.02)rooted++;
  assert.ok(rooted>=10,'separate rooted grass fans must remain visible');
 }
 assert.ok(plantingGeometry('woodland').userData.solidCanopies>0,'woodland retains its shrub layer');
 const material=new THREE.MeshStandardMaterial();let previousCalled=false;
 material.onBeforeCompile=()=>{previousCalled=true;};applyMeadowSurface(material);
 const shader={vertexShader:'#include <worldpos_vertex>',fragmentShader:'#include <color_fragment>'};
 material.onBeforeCompile(shader);assert.equal(previousCalled,true);
 assert.match(shader.fragmentShader,/fwidth/);assert.doesNotMatch(shader.fragmentShader,/sin\(/);
 assert.match(shader.fragmentShader,/ground\*1\.8/);assert.equal(material.customProgramCacheKey(),'continuous-meadow-v2');
});

test('rotated neighbourhood blocks reserve their own traffic loop before filling roadside lots',async()=>{
 const {planTourContext}=await import('../tour-context.mjs');
 const {streetClearance}=await import('../street-clearance.mjs');
 for(let i=0;i<12;i++){
  const p={id:`loop-town-${i}`,name:`Town ${i}`,kind:'raoping',model:'town',span:.4,x:0,z:0,footprint:[-.2,.2,-.2,.2]};
  const options={places:[p],heightAt:()=>0,waterAt:()=>null};
  const plan=planTourContext(options),ring=plan.streets.filter(s=>s.role==='loop'),blocks=plan.streets.filter(s=>s.role==='block');
  assert.equal(ring.length,4);assert.equal(plan.loops.length,1);
  assert.deepEqual(plan.loops[0].points[0],plan.loops[0].points.at(-1));
  assert.ok(blocks.length>0);assert.ok(plan.plots.length>10);
  const offRing=streetClearance(ring.map(s=>s.points.map(p=>({x:p[0],z:p[2]}))));
  for(const street of blocks)for(const [x,,z] of street.points)assert.ok(offRing(x,z,.05),'block paving and pavements must clear the loop');
  const offRoad=streetClearance(plan.streets.map(s=>s.points.map(p=>({x:p[0],z:p[2]}))));
  for(const q of plan.plots)assert.ok(offRoad(q.x,q.z,q.size*.8+.036));
  assert.deepEqual(plan,planTourContext(options));
 }
});

test('frontage gardens occupy dry side space without blocking entrances, neighbours or roads',async()=>{
 const {planIntroSurroundings}=await import('../intro-surroundings.mjs');
 const {streetClearance}=await import('../street-clearance.mjs');
 for(const angle of [0,.7,Math.PI,4.2]){
  const plots=Array.from({length:4},(_,variant)=>({x:variant*.4,z:0,size:.08,angle,variant,profile:{family:variant%2?'tea':'headland'}}));
  const options={places:[],plots,heightAt:()=>.01,waterAt:()=>null};
  const plan=planIntroSurroundings(options);assert.equal(plan.gardens.length,4);
  assert.deepEqual(plan.gardens,planIntroSurroundings(options).gardens);
  for(const g of plan.gardens){
   assert.ok([g.x,g.y,g.z].every(Number.isFinite));const p=plots[g.owner],dx=g.x-p.x,dz=g.z-p.z;
   const front=dx*Math.sin(-angle)+dz*Math.cos(-angle);
   assert.ok(front<0,'planting belongs beside or behind the building, never across its entrance');
   for(const q of plots)assert.ok(Math.hypot(g.x-q.x,g.z-q.z)>=q.size*.84+g.radius);
  }
  assert.equal(planIntroSurroundings({...options,waterAt:()=>0}).gardens.length,0);
  assert.equal(planIntroSurroundings({...options,heightAt:x=>Math.sin(x*1000)*.1}).gardens.length,0);
  const routes=plan.gardens.map(g=>[{x:g.x-.2,z:g.z},{x:g.x+.2,z:g.z}]),offRoad=streetClearance(routes);
  for(const g of planIntroSurroundings({...options,routes}).gardens)assert.ok(offRoad(g.x,g.z,g.radius+.04));
 }
 const noVariant=planIntroSurroundings({places:[],plots:[{x:0,z:0,size:.08}],heightAt:()=>0,waterAt:()=>null});
 assert.equal(noVariant.gardens.length,1);
});

test('island plazas reserve their footprint against the secondary urban infill layer',async()=>{
 const {buildTourContext}=await import('../tour-context.mjs');
 const p={id:'nanao-nature-gate',name:'Nature Gate',model:'gate',kind:'island',x:0,z:0,span:.6,footprint:[-.46,.46,-.4,.4]};
 const routes=[-.8,.8].map(z=>[{x:-3,z},{x:3,z}]);
 const result=buildTourContext({parent:new THREE.Group(),places:[p],routes,heightAt:()=>0,waterAt:()=>null,terrain:{bounds:[[-4,-4],[4,4]],nx:8,nz:8}});
 assert.equal(result.clear(0,0,.05),false);assert.equal(result.clear(.35,.25,.04),false);
 assert.equal(result.clear(3,3,.04),true);
 assert.ok(result.stats.roadFrontHomes>0,'road-front homes must use the courtyard program, not legacy blank boxes');
 assert.equal(result.stats.roadFrontHomes+result.stats.backlotHomes,result.stats.services.home);
});

test('courtyard homes have exterior side and rear windows inside their reserved plot',()=>{
 const home=services.find(s=>s[0]==='home');
 for(const variant of [0,1,2,3])for(const setting of ['dune','forest','arcade']){
  const size=.078,program=serviceBuilding(home,{size,height:.16,variant,residential:true,setting}),side=variant%2?1:-1;
  const panes=program.parts.filter(p=>p.color==='#4e8390');
  assert.ok(panes.filter(p=>Math.abs(p.x/size-side*.476)<1e-7).length===4,'both floors of the exposed side must have windows');
  assert.ok(panes.filter(p=>p.z<-.48*size).length>=3,'both rear wings must have windows');
  for(const p of panes){assert.ok(Math.abs(p.x)+p.w/2<size*.51);assert.ok(Math.abs(p.z)+p.d/2<size*.52);}
  assert.ok(serviceStaffFits(program),'new facades must not obstruct the courtyard resident');
 }
});
