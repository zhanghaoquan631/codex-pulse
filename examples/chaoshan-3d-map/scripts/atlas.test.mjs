import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {landmarkPlaces,buildLocalLandmarks} from '../landmarks.mjs';
import {vehicleTypes,vehicleGeometry,treeTypes,treeGeometry,mountainPlaces,buildTraffic,buildLandmarkLife,buildVegetation} from '../street-life.mjs';
import {buildRegionalLife,landClearance,activityTypes} from '../regional-life.mjs';
import {spreadRoutes} from '../route-distribution.mjs';
import {labelPriority,labelPosition,coreCities} from '../label-layout.mjs';
import {advanceLane,signalGreen,followingGap,roadJunctions} from '../traffic-rules.mjs';
import {neighborhoodThemes,buildNeighborhood} from '../neighborhoods.mjs';
import {extendLandmarkLife} from '../coastal-life.mjs';
import {buildUrbanEnvironment} from '../urban-environment.mjs';
const read = p => fs.readFileSync(new URL('../'+p, import.meta.url));
const data = JSON.parse(read('public/data/chaoshan.json'));
const regions = JSON.parse(read('regions.json'));
const app = read('app.js').toString();

test('camera zoom fitting covers every region and portrait orientation',async()=>{
 const {placeZoom}=await import('../atlas-interaction.mjs');
 for(const kind of ['landmark','island','shantou','jiexi','huilai','raoping','chaoan','chenghai','chaoyang','chaonan','puning','jieyang','transport','food','activity']){
  const p={kind,halfHeight:.63,span:1.12};
  for(const aspect of [390/844,900/700,1920/1080]){const z=placeZoom(p,30,aspect,true);assert.ok(z>0&&Number.isFinite(z));assert.ok(30/z>=p.halfHeight&&30/z>=p.span/aspect*.60);}
 }
 assert.ok(app.includes('if(sceneReady&&places[selected])'));
 assert.ok(!app.includes('서울'));
});
test('hidden time is excluded from camera animation and tour clocks',async()=>{
 const {resumedTimeline}=await import('../atlas-interaction.mjs');
 const animation={start:100,duration:2200},s=resumedTimeline({animation,shotStart:50,hiddenAt:500,now:6500});
 assert.equal(s.animation.start,6100);assert.equal(s.shotStart,6050);assert.equal(s.lastTime,6500);assert.equal(animation.start,100);
 assert.equal(resumedTimeline({animation:null,shotStart:0,hiddenAt:0,now:100}).animation,null);
});
test('place search matches Chinese, English and multiple terms without modifying metadata',async()=>{
 const {searchPlaces}=await import('../atlas-interaction.mjs');const p={name:'揭阳学宫（孔庙）',en:'Jieyang Confucian Academy',area:'揭阳市',tags:['古城']};
 assert.ok(searchPlaces(p,' 学宫 '));assert.ok(searchPlaces(p,'JIEYANG academy'));assert.ok(searchPlaces(p,'揭阳 古城'));
 assert.equal(searchPlaces(p,'潮州'),false);assert.ok(searchPlaces(p,''));
});
test('long labels reserve their measured size against other labels and cards',()=>{
 const layout=labelPosition({x:700,y:300,width:1280,height:800,mobile:false,important:true,occupied:[],labelWidth:216,labelHeight:52});
 assert.equal(layout.box.w,216);assert.equal(layout.box.h,52);
 const next=labelPosition({x:700,y:300,width:1280,height:800,mobile:false,important:false,occupied:[layout.box],labelWidth:216,labelHeight:52});assert.equal(next,null);
});
test('static miniatures cast and receive local close-up shadows',async()=>{
 const {batchStatic}=await import('../static-batch.mjs');const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()));
 batchStatic(g);assert.equal(g.children.length,1);assert.equal(g.children[0].castShadow,true);assert.equal(g.children[0].receiveShadow,true);
});

test('Jieyang pedestrian routes clear solid temple and gallery buildings',async()=>{
  const {jieyangPlaces}=await import('../jieyang-places.mjs'),{buildJieyangSights}=await import('../jieyang-sights.mjs');
  const result=buildJieyangSights({parent:new THREE.Group(),places:jieyangPlaces.map((p,i)=>({...p,x:i*2,z:0})),heightAt:()=>.1,waterAt:()=>null});
  for(const model of result.models)for(const route of model.group.userData.walkways)for(let i=1;i<route.length;i++){
    const a=new THREE.Vector3(...route[i-1]),b=new THREE.Vector3(...route[i]),n=Math.ceil(a.distanceTo(b)/.012);
    for(let j=0;j<=n;j++){const p=a.clone().lerp(b,j/n);for(const r of model.group.userData.buildings||[]){
      const intersects=p.x>r.x-r.w/2-.017&&p.x<r.x+r.w/2+.017&&p.z>r.z-r.d/2-.017&&p.z<r.z+r.d/2+.017&&p.y+.035>r.y&&p.y<r.y+r.h;
      assert.equal(intersects,false,model.id+' route intersects solid building at '+p.toArray());
    }}
  }
});

test('Jieyang collection resolves thirty-three original objects with only eighteen new scenes',async()=>{
  const {jieyangPlaces,jieyangCollectionIds,jieyangHighlights,getJieyangCollection,isJieyangPlace}=await import('../jieyang-places.mjs');
  const {jiexiPlaces}=await import('../jiexi-places.mjs'),{puningPlaces}=await import('../puning-places.mjs'),{huilaiPlaces}=await import('../huilai-places.mjs');
  const all=[...landmarkPlaces,...jiexiPlaces,...puningPlaces,...huilaiPlaces,...jieyangPlaces],before=structuredClone(all),collection=getJieyangCollection(all);
  assert.equal(collection.length,33);assert.equal(new Set(jieyangCollectionIds).size,33);assert.equal(jieyangPlaces.length,18);assert.equal(new Set(jieyangHighlights).size,12);
  assert.equal(collection.filter(p=>p.kind!=='jieyang').length,15);assert.deepEqual(all,before);
  for(const p of collection){assert.equal(p,all.find(q=>q.id===p.id));assert.ok(isJieyangPlace(p));}
  assert.ok(jieyangHighlights.every(id=>jieyangCollectionIds.includes(id)));
  assert.equal(isJieyangPlace({id:'puning-panlong'}),false);assert.equal(isJieyangPlace({id:'jiexi-grotto'}),false);
  assert.equal(isJieyangPlace({id:'puning-wenchang'}),false);assert.throws(()=>getJieyangCollection([]),/Missing Jieyang/);
});

test('Jieyang new scenes have distinct programs, populated connected walks and finite geometry',async()=>{
  const {jieyangPlaces}=await import('../jieyang-places.mjs'),{buildJieyangSights}=await import('../jieyang-sights.mjs');
  assert.equal(new Set(jieyangPlaces.map(p=>p.model)).size,18);
  assert.ok(jieyangPlaces.every(p=>p.ll[0]>=data.meta.bbox[0]&&p.ll[0]<=data.meta.bbox[2]&&p.ll[1]>=data.meta.bbox[1]&&p.ll[1]<=data.meta.bbox[3]));
  const result=buildJieyangSights({parent:new THREE.Group(),places:jieyangPlaces.map((p,i)=>({...p,x:i*2,z:0})),heightAt:()=>.1,waterAt:()=>null});
  assert.equal(result.models.length,18);assert.ok(result.stats.people>300);assert.ok(result.stats.coverage.every(p=>p.paths>=2));
  for(const m of result.models){assert.equal(m.type,m.group.userData.program);assert.ok(Object.keys(m.group.userData).length>=2);m.group.traverse(o=>{assert.ok(o.position.toArray().every(Number.isFinite));if(o.isMesh)assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite),m.id);});}
  const start=result.streetLife.snapshot();let checks=0;
  for(let f=0;f<900;f++){
    result.update(f/30);if(f%150)continue;const people=result.streetLife.snapshot();
    for(let i=0;i<people.length;i++)for(let j=i+1;j<people.length;j++){const a=people[i].position,b=people[j].position;if(Math.abs(a[1]-b[1])<.04)assert.ok(Math.hypot(a[0]-b[0],a[2]-b[2])>=.01899);}checks++;
  }
  assert.equal(checks,6);assert.notDeepEqual(start.map(p=>p.position),result.streetLife.snapshot().map(p=>p.position));
  assert.ok(app.indexOf('places.push(...jieyangPlaces)')>app.indexOf('places.push(...puningPlaces)'));
  assert.ok(app.indexOf('places.push(...jieyangPlaces)')<app.indexOf('tourContext=buildTourContext('));
  for(const file of ['tour-context.mjs','civic-neighborhoods.mjs','intro-surroundings.mjs'])assert.ok(read(file).toString().includes("'jieyang'"));
});

test('Jieyang placement leaves preceding scenes untouched and avoids crowded anchors',async()=>{
  const {jieyangPlaces,positionJieyangPlaces}=await import('../jieyang-places.mjs'),{insidePlace}=await import('../place-footprints.mjs');
  const existing=[];for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)existing.push({id:`earlier-${x}-${z}`,x,z,kind:'puning',span:1,footprint:[-.51,.51,-.43,.43]});
  const before=structuredClone(existing),places=jieyangPlaces.slice(0,6).map(p=>({...p}));
  positionJieyangPlaces({places,existing,toWorld:()=>[0,0],heightAt:()=>.1,waterAt:()=>null});assert.deepEqual(existing,before);
  for(let i=0;i<places.length;i++){assert.ok(!existing.some(q=>insidePlace(q,places[i].x,places[i].z,.617)));for(let j=0;j<i;j++)assert.ok(!insidePlace(places[j],places[i].x,places[i].z,.617));}
});

test('Rongjiang fountain jets animate above water, outside pedestrian promenade',async()=>{
  const {jieyangPlaces}=await import('../jieyang-places.mjs'),{buildJieyangSights}=await import('../jieyang-sights.mjs');
  const p={...jieyangPlaces.find(p=>p.id==='jieyang-fountain'),x:0,z:0};
  const result=buildJieyangSights({parent:new THREE.Group(),places:[p],heightAt:()=>.1,waterAt:()=>null}),jets=[];
  result.group.traverse(o=>{if(o.userData.fountainJet)jets.push(o);});assert.equal(jets.length,21);
  const before=jets.map(j=>j.scale.y);
  for(let f=0;f<160;f++){result.update(f*.25);for(const j of jets){assert.ok(j.position.x>-.58&&j.position.x<.58);assert.ok(j.position.z>-.39&&j.position.z<.175);assert.ok(Math.abs(j.position.y-.065*j.scale.y-.029)<1e-8);}
    for(const a of result.streetLife.snapshot())assert.ok(a.position[2]>.13*p.displayScale);
  }
  assert.notDeepEqual(before,jets.map(j=>j.scale.y));
});

test('Puning appends twenty complete regional scenes with twelve priorities and distinct programs',async()=>{
  const {puningPlaces}=await import('../puning-places.mjs');const {buildPuningSights}=await import('../puning-sights.mjs');
  assert.equal(puningPlaces.length,20);assert.equal(new Set(puningPlaces.map(p=>p.id)).size,20);assert.equal(new Set(puningPlaces.map(p=>p.model)).size,20);assert.equal(puningPlaces.filter(p=>p.priority).length,12);
  assert.ok(puningPlaces.every(p=>p.area==='揭阳市普宁市'&&p.ll[0]>=data.meta.bbox[0]&&p.ll[0]<=data.meta.bbox[2]&&p.ll[1]>=data.meta.bbox[1]&&p.ll[1]<=data.meta.bbox[3]));
  const result=buildPuningSights({parent:new THREE.Group(),places:puningPlaces.map((p,i)=>({...p,x:i*2,z:0})),heightAt:()=>.1,waterAt:()=>null});
  assert.equal(result.models.length,20);assert.ok(result.stats.people>300);assert.ok(result.stats.coverage.every(p=>p.paths>=2));
  for(const m of result.models){assert.equal(m.type,m.group.userData.program);m.group.traverse(o=>{assert.ok(o.position.toArray().every(Number.isFinite));if(o.isMesh)assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite),m.id);});}
  const byType=t=>result.models.find(m=>m.type===t).group.userData;
  assert.equal(byType('linked-mansion-courts').linkedCompounds,3);assert.equal(byType('terraced-spa-gardens').hotPools,4);assert.equal(byType('waterbus-wharf').separateBerths,3);
  assert.equal(byType('trade-market-arcades').tradeHalls,6);assert.equal(byType('seven-storey-earth-pagoda').towerLevels,7);assert.equal(byType('seven-storey-earth-pagoda').towerSides,8);
  const start=result.streetLife.snapshot();for(let i=0;i<900;i++)result.update(i/30);const end=result.streetLife.snapshot();assert.notDeepEqual(start.map(p=>p.position),end.map(p=>p.position));
  for(let i=0;i<end.length;i++)for(let j=i+1;j<end.length;j++){const a=end[i].position,b=end[j].position;if(Math.abs(a[1]-b[1])<.04)assert.ok(Math.hypot(a[0]-b[0],a[2]-b[2])>=.01899);}
  assert.ok(app.indexOf('places.push(...puningPlaces)')>app.indexOf('places.push(...chaonanPlaces)'));assert.ok(app.indexOf('places.push(...puningPlaces)')<app.indexOf('tourContext=buildTourContext('));
  assert.ok(read('feature-ui.mjs').toString().includes("['puning','普宁景点']"));for(const file of ['tour-context.mjs','civic-neighborhoods.mjs','intro-surroundings.mjs'])assert.ok(read(file).toString().includes("'puning'"));
});

test('Puning clustered anchors avoid preceding districts without altering them',async()=>{
  const {puningPlaces,positionPuningPlaces}=await import('../puning-places.mjs');const {insidePlace}=await import('../place-footprints.mjs');
  const existing=[];for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)existing.push({id:`earlier-${x}-${z}`,x,z,kind:'chaonan',span:1,footprint:[-.51,.51,-.43,.43]});const before=structuredClone(existing),places=puningPlaces.slice(0,6).map(p=>({...p}));
  positionPuningPlaces({places,existing,toWorld:()=>[0,0],heightAt:()=>.1,waterAt:()=>null});assert.deepEqual(existing,before);
  for(let i=0;i<places.length;i++){assert.ok(!existing.some(q=>insidePlace(q,places[i].x,places[i].z,.617)));for(let j=0;j<i;j++)assert.ok(!insidePlace(places[j],places[i].x,places[i].z,.617));}
});

test('Puning Yingge performers animate in separate formation slots outside the public paths',async()=>{
  const {puningPlaces}=await import('../puning-places.mjs');const {buildPuningSights}=await import('../puning-sights.mjs');const p={...puningPlaces.find(p=>p.id==='puning-yingge'),x:0,z:0};
  const result=buildPuningSights({parent:new THREE.Group(),places:[p],heightAt:()=>.1,waterAt:()=>null}),dancers=[];result.group.traverse(o=>{if(o.userData.yinggeDancer)dancers.push(o);});assert.equal(dancers.length,24);
  result.update(0);const initial=dancers.map(d=>d.children.map(c=>c.rotation.toArray()));let moving=false;
  for(let i=0;i<120;i++){result.update(i*.25);const boxes=dancers.map(d=>new THREE.Box3().setFromObject(d));for(let a=0;a<boxes.length;a++){assert.ok(boxes[a].min.x>-.36*p.displayScale&&boxes[a].max.x<.36*p.displayScale);for(let b=a+1;b<boxes.length;b++)assert.ok(!boxes[a].intersectsBox(boxes[b]));}if(JSON.stringify(initial)!==JSON.stringify(dancers.map(d=>d.children.map(c=>c.rotation.toArray()))))moving=true;}
  assert.ok(moving);
});

test('Puning boats stay on water and the train does not teleport between tracks',async()=>{
  const {puningPlaces}=await import('../puning-places.mjs');const {buildPuningSights}=await import('../puning-sights.mjs');
  for(const id of ['nanxi','dagang','xinxi','lianjiang']){
    const p={...puningPlaces.find(p=>p.id==='puning-'+id),x:0,z:0};const result=buildPuningSights({parent:new THREE.Group(),places:[p],heightAt:()=>.1,waterAt:()=>null}),boats=[];result.group.traverse(o=>{if(o.userData.vessel)boats.push(o);});assert.equal(boats.length,id==='nanxi'?2:id==='dagang'?3:1);
    for(let i=0;i<160;i++){result.update(i*.5);const bounds=boats.map(b=>new THREE.Box3().setFromObject(b));for(const b of bounds){assert.ok(b.min.x>-.60*p.displayScale&&b.max.x<.60*p.displayScale,id);assert.ok(b.min.z>-.47*p.displayScale&&b.max.z<.47*p.displayScale,id);if(id==='nanxi')assert.ok(b.min.x>-.225*p.displayScale&&b.max.x<.225*p.displayScale);if(id==='lianjiang')assert.ok(b.min.x>-.145*p.displayScale&&b.max.x<.145*p.displayScale);if(id==='xinxi')assert.ok(b.min.z>.195*p.displayScale);}for(let a=0;a<bounds.length;a++)for(let b=a+1;b<bounds.length;b++)assert.ok(!bounds[a].intersectsBox(bounds[b]));}
  }
  const p={...puningPlaces.find(p=>p.id==='puning-station'),x:0,z:0};const result=buildPuningSights({parent:new THREE.Group(),places:[p],heightAt:()=>.1,waterAt:()=>null});let train;result.group.traverse(o=>{if(o.userData.train)train=o;});assert.ok(train);let prev=train.position.clone();
  for(let i=1;i<=2400;i++){result.update(i/30);assert.ok(prev.distanceTo(train.position)<.01);assert.equal(train.position.z,-.27);prev.copy(train.position);}
  result.update(8);const waiting=train.position.clone();result.update(12);assert.deepEqual(train.position,waiting);
});

test('Chaonan appends twenty distinct scenes, complete walkways and twelve priorities',async()=>{
  const {chaonanPlaces}=await import('../chaonan-places.mjs');const {buildChaonanSights}=await import('../chaonan-sights.mjs');
  assert.equal(chaonanPlaces.length,20);assert.equal(new Set(chaonanPlaces.map(p=>p.id)).size,20);assert.equal(new Set(chaonanPlaces.map(p=>p.model)).size,20);
  assert.equal(chaonanPlaces.filter(p=>p.priority).length,12);
  assert.ok(chaonanPlaces.every(p=>p.area==='汕头市潮南区'&&p.ll[0]>=data.meta.bbox[0]&&p.ll[0]<=data.meta.bbox[2]&&p.ll[1]>=data.meta.bbox[1]&&p.ll[1]<=data.meta.bbox[3]));
  const result=buildChaonanSights({parent:new THREE.Group(),places:chaonanPlaces.map((p,i)=>({...p,x:i*2,z:0})),heightAt:()=>.1,waterAt:()=>null});
  assert.equal(result.models.length,20);assert.ok(result.stats.people>300);assert.ok(result.stats.coverage.every(p=>p.paths>=2));
  for(const m of result.models){assert.equal(m.type,m.group.userData.program);m.group.traverse(o=>{assert.ok(o.position.toArray().every(Number.isFinite));if(o.isMesh)assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite),m.id);});}
  const byType=t=>result.models.find(m=>m.type===t).group.userData;
  assert.equal(byType('lake-gardens').gardenIsland,true);assert.equal(byType('lake-pavilions').zigzagBridge,true);
  assert.equal(byType('forest-ridges').forestedPeaks,2);assert.equal(byType('history-museum').exhibitPanels,6);
  assert.equal(byType('reservoir-dam').damGates,3);assert.equal(byType('woodland-reservoir').woodlandLake,true);
  assert.equal(byType('river-greenway').continuousRiver,true);assert.equal(byType('ancestral-compound').courtyardAxis,true);
  const start=result.streetLife.snapshot();for(let i=0;i<900;i++)result.update(i/30);const end=result.streetLife.snapshot();assert.notDeepEqual(start.map(p=>p.position),end.map(p=>p.position));
  for(let i=0;i<end.length;i++)for(let j=i+1;j<end.length;j++){const a=end[i].position,b=end[j].position;if(Math.abs(a[1]-b[1])<.04)assert.ok(Math.hypot(a[0]-b[0],a[2]-b[2])>=.01899);}
  assert.ok(app.indexOf('places.push(...chaonanPlaces)')>app.indexOf('places.push(...chaoyangPlaces)'));
  assert.ok(app.indexOf('places.push(...chaonanPlaces)')<app.indexOf('tourContext=buildTourContext('));
  assert.ok(read('feature-ui.mjs').toString().includes("['chaonan','潮南景点']"));
  for(const file of ['tour-context.mjs','civic-neighborhoods.mjs','intro-surroundings.mjs'])assert.ok(read(file).toString().includes("'chaonan'"));
});

test('Chaonan crowded anchors do not overwrite earlier districts or stack miniature bases',async()=>{
  const {chaonanPlaces,positionChaonanPlaces}=await import('../chaonan-places.mjs');const {insidePlace}=await import('../place-footprints.mjs');
  const existing=[];for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)existing.push({id:`earlier-${x}-${z}`,x,z,kind:'chaoyang',span:1,footprint:[-.51,.51,-.43,.43]});
  const before=structuredClone(existing),places=chaonanPlaces.slice(0,6).map(p=>({...p}));positionChaonanPlaces({places,existing,toWorld:()=>[0,0],heightAt:()=>.1,waterAt:()=>null});assert.deepEqual(existing,before);
  for(let i=0;i<places.length;i++){assert.ok(places[i].displayOffset>1.8);assert.ok(!existing.some(q=>insidePlace(q,places[i].x,places[i].z,.617)));for(let j=0;j<i;j++)assert.ok(!insidePlace(places[j],places[i].x,places[i].z,.617));}
});

test('Chaoyang adds all twenty themed scenes with five core landmarks and safe crowds',async()=>{
  const {chaoyangPlaces}=await import('../chaoyang-places.mjs');const {buildChaoyangSights}=await import('../chaoyang-sights.mjs');
  assert.equal(chaoyangPlaces.length,20);assert.equal(new Set(chaoyangPlaces.map(p=>p.model)).size,20);
  assert.equal(chaoyangPlaces.filter(p=>p.core).length,5);assert.equal(chaoyangPlaces.filter(p=>p.priority).length,12);
  assert.ok(chaoyangPlaces.every(p=>p.area==='汕头市潮阳区'&&p.ll[0]>=data.meta.bbox[0]&&p.ll[0]<=data.meta.bbox[2]&&p.ll[1]>=data.meta.bbox[1]&&p.ll[1]<=data.meta.bbox[3]));
  const result=buildChaoyangSights({parent:new THREE.Group(),places:chaoyangPlaces.map((p,i)=>({...p,x:i*2,z:0})),heightAt:()=>.12,waterAt:()=>null});
  assert.equal(result.models.length,20);assert.ok(result.stats.people>300);assert.ok(result.stats.coverage.every(p=>p.paths>0));
  for(const m of result.models){assert.equal(m.group.userData.program,m.type);m.group.traverse(o=>{assert.ok(o.position.toArray().every(Number.isFinite));if(o.isMesh)assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite),m.id);});}
  const byType=type=>result.models.find(m=>m.type===type).group.userData;
  assert.equal(byType('octagonal-pagoda').towerLevels,7);assert.equal(byType('octagonal-pagoda').towerSides,8);
  assert.equal(byType('granite-monument').stoneStatue,true);assert.equal(byType('lotus-coast').petalRocks,9);
  assert.equal(byType('woodland-monastery').hallSequence,3);assert.equal(byType('working-harbour').berths,6);
  assert.equal(byType('river-meets-sea').continuousEstuary,true);assert.equal(byType('coastal-battery').displayCannons,3);
  const start=result.streetLife.snapshot();for(let i=0;i<900;i++)result.update(i/30);const end=result.streetLife.snapshot();
  assert.notDeepEqual(start.map(p=>p.position),end.map(p=>p.position));
  for(let i=0;i<end.length;i++)for(let j=i+1;j<end.length;j++){const a=end[i].position,b=end[j].position;if(Math.abs(a[1]-b[1])<.04)assert.ok(Math.hypot(a[0]-b[0],a[2]-b[2])>=.01899);}
  assert.ok(app.indexOf('places.push(...chaoyangPlaces)')>app.indexOf('places.push(...chenghaiPlaces)'));
  assert.ok(app.indexOf('places.push(...chaoyangPlaces)')<app.indexOf('tourContext=buildTourContext('));
  assert.ok(read('feature-ui.mjs').toString().includes("['chaoyang','潮阳景点']"));
});

test('Chaoyang display placement preserves earlier scenes and separates adjacent lotus-peak details',async()=>{
  const {chaoyangPlaces,positionChaoyangPlaces}=await import('../chaoyang-places.mjs');
  const existing=[{id:'earlier',x:0,z:0,kind:'chenghai',span:1.1,displayScale:.85,footprint:[-.61,.61,-.48,.48]}],before=structuredClone(existing);
  const places=chaoyangPlaces.slice(13,18).map(p=>({...p}));positionChaoyangPlaces({places,existing,toWorld:()=>[0,0],heightAt:()=>.1,waterAt:()=>null});assert.deepEqual(existing,before);
  for(let i=0;i<places.length;i++)for(let j=i+1;j<places.length;j++)assert.ok(Math.abs(places[i].x-places[j].x)>1||Math.abs(places[i].z-places[j].z)>.8);
});

test('Chaoyang vessels remain on water and harbour boats have separate berths',async()=>{
  const {chaoyangPlaces}=await import('../chaoyang-places.mjs');const {buildChaoyangSights}=await import('../chaoyang-sights.mjs');
  for(const id of ['lotus','haimen','harbour','estuary','heping']){
    const p={...chaoyangPlaces.find(p=>p.id==='chaoyang-'+id),x:0,z:0};const result=buildChaoyangSights({parent:new THREE.Group(),places:[p],heightAt:()=>-.1,waterAt:()=>.04});assert.ok(p.sceneY>.04);
    const boats=[];result.group.traverse(o=>{if(o.userData.vessel)boats.push(o);});assert.equal(boats.length,id==='harbour'?6:1);
    for(let t=0;t<=120;t+=.5){result.update(t);for(const b of boats){const bounds=new THREE.Box3().setFromObject(b);assert.ok(bounds.min.x>-.60*p.displayScale&&bounds.max.x<.60*p.displayScale);assert.ok(bounds.min.z>-.47*p.displayScale&&bounds.max.z<.47*p.displayScale);if(id==='heping')assert.ok(bounds.min.x>-.125*p.displayScale&&bounds.max.x<.125*p.displayScale);if(['lotus','haimen'].includes(id))assert.ok(bounds.min.z>.17*p.displayScale);}
      for(let i=0;i<boats.length;i++)for(let j=i+1;j<boats.length;j++)assert.ok(!new THREE.Box3().setFromObject(boats[i]).intersectsBox(new THREE.Box3().setFromObject(boats[j])));
    }
  }
});

test('Chaoyang expands an exhausted coastal search instead of stacking on occupied anchors',async()=>{
  const {chaoyangPlaces,positionChaoyangPlaces}=await import('../chaoyang-places.mjs');const {insidePlace}=await import('../place-footprints.mjs');
  const existing=[];for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)existing.push({id:`existing-${x}-${z}`,x,z,kind:'landmark',span:1,footprint:[-.51,.51,-.43,.43]});
  const before=structuredClone(existing),places=chaoyangPlaces.slice(13,18).map(p=>({...p}));
  positionChaoyangPlaces({places,existing,toWorld:()=>[0,0],heightAt:()=>.1,waterAt:()=>null});assert.deepEqual(existing,before);
  for(let i=0;i<places.length;i++){assert.ok(places[i].displayOffset>1.8);assert.ok(!existing.some(q=>insidePlace(q,places[i].x,places[i].z,.62*.85+.09)));for(let j=0;j<i;j++)assert.ok(!insidePlace(places[j],places[i].x,places[i].z,.62*.85+.09));}
});

test('Chenghai appends twenty complete themed exhibits and keeps earlier entries intact',async()=>{
  const {chenghaiPlaces,positionChenghaiPlaces}=await import('../chenghai-places.mjs');
  const {buildChenghaiSights}=await import('../chenghai-sights.mjs');
  assert.equal(chenghaiPlaces.length,20);assert.equal(new Set(chenghaiPlaces.map(p=>p.model)).size,20);
  assert.equal(chenghaiPlaces.filter(p=>p.priority).length,12);
  assert.ok(chenghaiPlaces.every(p=>p.area==='汕头市澄海区'&&p.ll[0]>=data.meta.bbox[0]&&p.ll[0]<=data.meta.bbox[2]&&p.ll[1]>=data.meta.bbox[1]&&p.ll[1]<=data.meta.bbox[3]));
  const existing=[{id:'previous',x:0,z:0,kind:'chaoan',span:1.1,displayScale:.85,footprint:[-.61,.61,-.48,.48]}],before=structuredClone(existing);
  const clustered=chenghaiPlaces.slice(0,4).map(p=>({...p}));
  positionChenghaiPlaces({places:clustered,existing,toWorld:()=>[0,0],heightAt:()=>.1,waterAt:()=>null});assert.deepEqual(existing,before);
  for(let i=0;i<clustered.length;i++)for(let j=i+1;j<clustered.length;j++)assert.ok(Math.abs(clustered[i].x-clustered[j].x)>1||Math.abs(clustered[i].z-clustered[j].z)>.8);
  const result=buildChenghaiSights({parent:new THREE.Group(),places:chenghaiPlaces.map((p,i)=>({...p,x:i*2,z:0})),heightAt:()=>.1,waterAt:()=>null});
  assert.equal(result.models.length,20);assert.ok(result.stats.people>300);assert.ok(result.stats.coverage.every(c=>c.paths>0));
  for(const model of result.models){assert.equal(model.group.userData.program,model.type);model.group.traverse(o=>{assert.ok(o.position.toArray().every(Number.isFinite));if(o.isMesh)assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite),model.id);});}
  assert.equal(result.models.find(m=>m.type==='diaspora-mansion').group.userData.arcadedCourts,2);
  assert.equal(result.models.find(m=>m.type==='toy-campus').group.userData.toyBlocks,5);
  assert.equal(result.models.find(m=>m.type==='botanic-garden').group.userData.treeCollections,4);
  assert.equal(result.models.find(m=>m.type==='red-sail-harbour').group.userData.redHeadedVessel,true);
  const initial=result.streetLife.snapshot();for(let i=0;i<600;i++)result.update(i/30);
  const final=result.streetLife.snapshot();assert.notDeepEqual(initial.map(p=>p.position),final.map(p=>p.position));
  for(let i=0;i<final.length;i++)for(let j=i+1;j<final.length;j++){const a=final[i].position,b=final[j].position;if(Math.abs(a[1]-b[1])<.04)assert.ok(Math.hypot(a[0]-b[0],a[2]-b[2])>=.01899);}
  assert.ok(app.indexOf('places.push(...chenghaiPlaces)')>app.indexOf('places.push(...chaoanPlaces)'));
  assert.ok(app.indexOf('places.push(...chenghaiPlaces)')<app.indexOf('tourContext=buildTourContext('));
  assert.ok(read('feature-ui.mjs').toString().includes("['chenghai','澄海景点']"));
});

test('Chenghai boats remain within exhibit water and have finite continuous headings',async()=>{
  const {chenghaiPlaces}=await import('../chenghai-places.mjs');const {buildChenghaiSights}=await import('../chenghai-sights.mjs');
  for(const id of ['hanjiang','beixi','redboat','laiwu','yanhong']){
    const p={...chenghaiPlaces.find(p=>p.id==='chenghai-'+id),x:0,z:0};
    const result=buildChenghaiSights({parent:new THREE.Group(),places:[p],heightAt:()=>-.1,waterAt:()=>.04});assert.ok(p.sceneY>.04);
    const boats=[];result.group.traverse(o=>{if(o.userData.vessel)boats.push(o);});assert.equal(boats.length,1);
    for(let t=0;t<=120;t+=.5){result.update(t);for(const b of boats){assert.ok(b.position.toArray().every(Number.isFinite));assert.ok(Number.isFinite(b.rotation.y));const bounds=new THREE.Box3().setFromObject(b);assert.ok(bounds.min.x>-.60*p.displayScale&&bounds.max.x<.60*p.displayScale);assert.ok(bounds.min.z>-.47*p.displayScale&&bounds.max.z<.47*p.displayScale);if(['hanjiang','beixi'].includes(id))assert.ok(bounds.min.x>-.19*p.displayScale&&bounds.max.x<.19*p.displayScale);}}
  }
});

test('Exhibit pedestrians keep personal spacing through crossings, reversals and pauses',async()=>{
  const {buildWalkwayCrowd}=await import('../walkway-crowds.mjs');
  const routes=[[new THREE.Vector3(-.5,.1,0),new THREE.Vector3(.5,.1,0)],[new THREE.Vector3(0,.1,-.5),new THREE.Vector3(0,.1,.5)]];
  const obstacle=new THREE.Vector3(.3,.1,.05),crowd=buildWalkwayCrowd({parent:new THREE.Group(),preparedWalkways:routes,population:32,obstacles:[obstacle]});
  const start=crowd.snapshot();assert.ok(crowd.count>=20);let pauses=0;
  for(let frame=0;frame<1800;frame++){
    crowd.update(frame/30);if(frame%15)continue;const people=crowd.snapshot();
    for(let i=0;i<people.length;i++){
      const a=people[i].position;if(people[i].state!=='walk')pauses++;
      assert.ok(Math.hypot(a[0]-obstacle.x,a[2]-obstacle.z)>=.0299);
      for(let j=i+1;j<people.length;j++){const b=people[j].position;assert.ok(Math.hypot(a[0]-b[0],a[2]-b[2])>=.01899,'overlapping pedestrians');}
    }
  }
  assert.ok(pauses>0);assert.notDeepEqual(crowd.snapshot().map(p=>p.position),start.map(p=>p.position));
});

test('Later Huilai and Raoping stops receive dense regional planting without changing earlier regions',async()=>{
  const {planIntroSurroundings,buildIntroSurroundings}=await import('../intro-surroundings.mjs');
  const places=[{id:'old',name:'old',x:0,z:0,kind:'district',span:.3},{id:'last-raoping',name:'last',x:10,z:0,kind:'raoping',span:1.1,displayScale:.85,footprint:[-.54,.54,-.43,.43],contextModel:'forest'},{id:'last-huilai',name:'last',x:20,z:0,kind:'huilai',span:1.1,displayScale:.85,footprint:[-.54,.54,-.43,.43],contextModel:'cove'}];
  const options={places,heightAt:()=>.1,waterAt:()=>null,routes:[]},plan=planIntroSurroundings(options);
  assert.ok(plan.cells.filter(c=>c.regionalOwner==='last-raoping').length>100);
  assert.ok(plan.cells.filter(c=>c.regionalOwner==='last-huilai').length>100);
  assert.ok(plan.cells.filter(c=>c.owner==='old').every(c=>!c.regionalTheme));
  const result=buildIntroSurroundings({parent:new THREE.Group(),...options});assert.ok(result.stats.regionalPlants>100);
});

test('Chaoan adds twenty distinct exhibits with official district naming and five priorities',async()=>{
  const {chaoanPlaces}=await import('../chaoan-places.mjs');
  const {buildChaoanSights}=await import('../chaoan-sights.mjs');
  const places=chaoanPlaces.map((p,i)=>({...p,x:i*2,z:0}));
  assert.equal(places.length,20);assert.equal(new Set(places.map(p=>p.model)).size,20);
  assert.equal(places.filter(p=>p.priority).length,5);assert.ok(places.every(p=>p.area==='潮州市潮安区'));
  assert.ok(places.every(p=>p.ll[0]>=data.meta.bbox[0]&&p.ll[0]<=data.meta.bbox[2]&&p.ll[1]>=data.meta.bbox[1]&&p.ll[1]<=data.meta.bbox[3]));
  const result=buildChaoanSights({parent:new THREE.Group(),places,heightAt:()=>.12,waterAt:()=>null});
  assert.equal(result.models.length,20);assert.ok(result.stats.people>250);assert.ok(result.stats.animations>30);
  assert.ok(result.stats.coverage.every(p=>p.paths>0));
  for(const m of result.models)m.group.traverse(o=>{assert.ok(o.position.toArray().every(Number.isFinite));if(o.isMesh)assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite),m.id);});
  assert.equal(result.models.find(m=>m.type==='ridge-tea').group.userData.teaRows,7);
  assert.equal(result.models.find(m=>m.type==='crater-lake').group.userData.lakeBasin,true);
  assert.equal(result.models.find(m=>m.type==='walled-village').group.userData.parallelLanes,3);
  assert.equal(result.models.find(m=>m.type==='canal-village').group.userData.coveredBridge,true);
  const before=result.streetLife.snapshot();for(let i=0;i<140;i++)result.update(i/10);
  assert.notDeepEqual(result.streetLife.snapshot().map(p=>p.position),before.map(p=>p.position));
  assert.ok(app.indexOf('places.push(...chaoanPlaces)')>app.indexOf('places.push(...raopingPlaces)'));
  assert.ok(app.indexOf('places.push(...chaoanPlaces)')<app.indexOf('tourContext=buildTourContext('));
  assert.ok(read('feature-ui.mjs').toString().includes("['chaoan','潮安景点']"));
});

test('Chaoan river boats stay inside the water channel and foundations clear existing water',async()=>{
  const {chaoanPlaces}=await import('../chaoan-places.mjs');
  const {buildChaoanSights}=await import('../chaoan-sights.mjs');
  const p={...chaoanPlaces.find(p=>p.model==='river-life'),x:0,z:0};
  const result=buildChaoanSights({parent:new THREE.Group(),places:[p],heightAt:()=>-.12,waterAt:()=>.04});
  assert.ok(p.sceneY>.04);const boats=[];result.models[0].group.traverse(o=>{if(o.userData.vessel)boats.push(o);});assert.equal(boats.length,2);
  for(let t=0;t<=120;t+=.5){result.update(t);for(const boat of boats){const b=new THREE.Box3().setFromObject(boat);assert.ok(b.min.x>-.24*p.displayScale&&b.max.x<.24*p.displayScale);assert.ok(b.min.z>-.47*p.displayScale&&b.max.z<.47*p.displayScale);}}
});

test('Chaoan placement preserves existing places and separates clustered village exhibits',async()=>{
  const {chaoanPlaces,positionChaoanPlaces}=await import('../chaoan-places.mjs');
  const existing=[{id:'existing',x:0,z:0,span:.4,displayScale:1,kind:'raoping',footprint:[-.5,.5,-.4,.4]}],before=structuredClone(existing);
  const places=chaoanPlaces.filter(p=>p.id.startsWith('chaoan-longhu')).map(p=>({...p}));
  positionChaoanPlaces({places,existing,toWorld:()=>[0,0],heightAt:()=>.1,waterAt:()=>null});assert.deepEqual(existing,before);
  for(let i=0;i<places.length;i++)for(let j=i+1;j<places.length;j++)assert.ok(Math.abs(places[i].x-places[j].x)>1.0||Math.abs(places[i].z-places[j].z)>.8);
});

test('Raoping appends twenty varied sights, six core landmarks and animated prepared walkways',async()=>{
  const {raopingPlaces}=await import('../raoping-places.mjs');
  const {buildRaopingSights}=await import('../raoping-sights.mjs');
  const places=raopingPlaces.map((p,i)=>({...p,x:i*2,z:0}));
  assert.equal(places.length,20);assert.equal(new Set(places.map(p=>p.model)).size,20);
  assert.equal(places.filter(p=>p.priority).length,6);
  assert.ok(places.every(p=>p.area==='潮州 · 饶平'));
  const result=buildRaopingSights({parent:new THREE.Group(),places,heightAt:()=>.1,waterAt:()=>null});
  assert.equal(result.models.length,20);assert.ok(result.stats.coverage.every(p=>p.paths>0));
  assert.ok(result.models.every(m=>m.group.userData.infill?.plants+m.group.userData.infill?.services>0),'all Raoping interiors, including late stops, receive infill');
  assert.ok(result.stats.people>=250);assert.ok(result.stats.animations>30);
  assert.equal(result.models.find(m=>m.type==='octagonal-tulou').group.userData.octagonalRings,3);
  for(const m of result.models)m.group.traverse(o=>{assert.ok(o.position.toArray().every(Number.isFinite));if(o.isMesh)assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite),m.id);});
  const before=result.streetLife.snapshot();for(let i=0;i<140;i++)result.update(i/10);
  assert.notDeepEqual(result.streetLife.snapshot().map(p=>p.position),before.map(p=>p.position));
  assert.ok(app.indexOf('places.push(...raopingPlaces)')>app.indexOf('places.push(...huilaiPlaces)'));
  assert.ok(app.indexOf('places.push(...raopingPlaces)')<app.indexOf('tourContext=buildTourContext('));
  const marine=[{...places[0]}];buildRaopingSights({parent:new THREE.Group(),places:marine,heightAt:()=>-.12,waterAt:()=>.04});
  assert.ok(marine[0].sceneY>.04);
});

test('Huanggang exhibit boat hull remains between river banks throughout its animation',async()=>{
  const {raopingPlaces}=await import('../raoping-places.mjs');
  const {buildRaopingSights}=await import('../raoping-sights.mjs');
  const p={...raopingPlaces.find(p=>p.model==='river-town'),x:0,z:0},result=buildRaopingSights({parent:new THREE.Group(),places:[p],heightAt:()=>0,waterAt:()=>null});
  let boat;result.models[0].group.traverse(o=>{if(o.userData.vessel)boat=o;});assert.ok(boat);
  for(let t=0;t<100;t+=.5){result.update(t);const bounds=new THREE.Box3().setFromObject(boat),z0=bounds.min.z/p.displayScale,z1=bounds.max.z/p.displayScale;
    const left=Math.max(Math.sin(z0*5),Math.sin(z1*5))*.1-.105,right=Math.min(Math.sin(z0*5),Math.sin(z1*5))*.1+.105;
    assert.ok(bounds.min.x/p.displayScale>left&&bounds.max.x/p.displayScale<right);
  }
});

test('Raoping off-map anchors retain coordinates but use an explicit visible edge exhibit',async()=>{
  const {raopingPlaces,positionRaopingPlaces}=await import('../raoping-places.mjs');
  const places=[{...raopingPlaces.find(p=>p.id==='raoping-maozhi')}],ll=[...places[0].ll];
  const toWorld=(lon,lat)=>[(lon-data.meta.origin[0])*data.meta.sx,(data.meta.origin[1]-lat)*data.meta.sz];
  positionRaopingPlaces({places,bbox:data.meta.bbox,toWorld,heightAt:()=>.1,waterAt:()=>null});
  assert.deepEqual(places[0].ll,ll);assert.equal(places[0].outsideBasemap,true);
  const north=toWorld(data.meta.bbox[0],data.meta.bbox[3])[1];
  assert.ok(places[0].z>north+.5);assert.ok(places[0].detail.includes('地图边缘展位'));
});

test('Huilai preserves the existing atlas and adds sixteen coastal programs with six core landmarks',async()=>{
  const {huilaiPlaces}=await import('../huilai-places.mjs');
  const {buildHuilaiSights}=await import('../huilai-sights.mjs');
  const places=huilaiPlaces.map((p,i)=>({...p,x:i*2,z:0}));
  assert.equal(places.length,16);assert.equal(new Set(places.map(p=>p.model)).size,16);
  assert.equal(places.filter(p=>p.priority).length,6);
  const result=buildHuilaiSights({parent:new THREE.Group(),places,heightAt:()=>.1,waterAt:()=>null});
  assert.equal(result.models.length,16);assert.equal(result.stats.coverage.length,16);
  assert.ok(result.models.every(m=>m.group.userData.infill?.plants+m.group.userData.infill?.services>0),'all Huilai interiors receive infill');
  assert.ok(result.stats.coverage.every(c=>c.paths>0));assert.ok(result.stats.people>=200);
  for(const m of result.models)m.group.traverse(o=>{assert.ok(o.position.toArray().every(Number.isFinite));if(o.isMesh)assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite),m.id);});
  const before=result.streetLife.snapshot();for(let i=0;i<140;i++)result.update(i/10);
  assert.notDeepEqual(result.streetLife.snapshot().map(p=>p.position),before.map(p=>p.position));
  assert.ok(result.stats.animations>40);
  assert.ok(app.indexOf('places.push(...huilaiPlaces)')>app.indexOf('places.push(...jiexiPlaces)'));
  assert.ok(app.indexOf('places.push(...huilaiPlaces)')<app.indexOf('tourContext=buildTourContext('));
  const marine=[{...places[0]}];
  buildHuilaiSights({parent:new THREE.Group(),places:marine,heightAt:()=>-.12,waterAt:()=>.04});
  assert.ok(marine[0].sceneY>.04,'coastal foundation must stay above the original water surface');
});

test('Jiexi has twenty distinct exhibits, six core sights and animated connected walking paths',async()=>{
  const {jiexiPlaces}=await import('../jiexi-places.mjs');
  const {buildJiexiSights}=await import('../jiexi-sights.mjs');
  const places=jiexiPlaces.map((p,i)=>({...p,x:i*2,z:0}));
  assert.equal(places.length,20);assert.equal(new Set(places.map(p=>p.model)).size,20);
  assert.equal(places.filter(p=>p.priority).length,6);
  const result=buildJiexiSights({parent:new THREE.Group(),places,heightAt:()=>.1,waterAt:()=>null});
  assert.equal(result.models.length,20);assert.equal(result.stats.coverage.length,20);
  assert.ok(result.stats.coverage.every(c=>c.paths>=1));assert.ok(result.stats.people>=220);
  for(const m of result.models)m.group.traverse(o=>{assert.ok(o.position.toArray().every(Number.isFinite));if(o.isMesh)assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite),m.id);});
  const before=result.streetLife.snapshot();for(let i=0;i<150;i++)result.update(i/10);
  assert.notDeepEqual(result.streetLife.snapshot().map(p=>p.position),before.map(p=>p.position));
  assert.ok(result.stats.animations>70);
  assert.ok(app.indexOf('places.push(...jiexiPlaces)')<app.indexOf('tourContext=buildTourContext('));
});

test('Small Park source roads are clipped without cutting unrelated roads or railway',async()=>{
  const {outsideSmallParkRoads}=await import('../small-park-layout.mjs');
  const road=['primary',false,[[-2,0],[2,0]]],remote=['primary',false,[[3,3],[4,4]]],rail=['rail',false,[[-2,0],[2,0]]];
  const out=outsideSmallParkRoads([road,remote,rail],{x:0,z:0});
  assert.equal(out.length,4);assert.deepEqual(out.at(-1),rail);assert.deepEqual(out[2],remote);
  assert.ok(out[0][2].at(-1)[0]<-1.08);assert.ok(out[1][2][0][0]>1.08);
  assert.equal(outsideSmallParkRoads([['primary',false,[[0,0],[.2,.2]]]],{x:0,z:0}).length,0);
});

test('Small Park pedestrians dwell and cars remain on separate continuous circular lanes',async()=>{
  const {parkWalkerPose}=await import('../small-park-layout.mjs');
  assert.equal(parkWalkerPose(13,0,.1,0).state,'wave');
  assert.equal(parkWalkerPose(13,0,.1,0).angle,parkWalkerPose(17,0,.1,0).angle);
  const landmarks=buildLocalLandmarks({parent:new THREE.Group(),heightAt:()=>0,waterAt:()=>null,toWorld:()=>[0,0]});
  const life=buildLandmarkLife({models:landmarks.models.filter(m=>m.spec.id==='small-park')});
  life.update(0);const before=life.vehicleNodes.map(v=>v.position.clone());life.update(.1);
  for(const [i,v] of life.vehicleNodes.entries()){assert.ok(Math.abs(Math.hypot(v.position.x,v.position.z)-(i%2===0?70.8:74.2))<1e-6);assert.ok(v.position.distanceTo(before[i])<.3);}
  assert.equal(life.people,32);assert.equal(life.vehicles,16);
});

test('Shantou has 28 entries, reuses the pavilion and preserves existing place identities',async()=>{
  const {shantouPlaces,isShantouPlace,positionShantouPlaces}=await import('../shantou-places.mjs');
  const {buildShantouSights}=await import('../shantou-sights.mjs');
  const existing=[{...landmarkPlaces.find(p=>p.id==='small-park'),x:0,z:0},{id:'nanao-nanao-bridge',kind:'island'},{name:'南澳岛',kind:'district'}];
  const places=shantouPlaces.map(p=>({...p}));
  assert.equal([...existing,...places].filter(isShantouPlace).length,28);
  assert.equal(new Set(places.map(p=>p.id)).size,25);
  assert.equal(places.filter(p=>p.priority).length,10);
  positionShantouPlaces({places,existing,toWorld:(lon,lat)=>[(lon-116.66)*100,(23.36-lat)*100],heightAt:()=>.1,waterAt:()=>null});
  assert.equal(places[0].aliasOf,'small-park');assert.equal(places[0].x,0);
  const result=buildShantouSights({parent:new THREE.Group(),places,heightAt:()=>.1,waterAt:()=>null});
  assert.equal(result.models.length,24);assert.ok(result.stats.people>=288);
  assert.equal(result.stats.coverage.length,24);assert.ok(result.stats.coverage.every(c=>c.people>=12));
  for(const m of result.models)m.group.traverse(o=>{assert.ok(o.position.toArray().every(Number.isFinite));if(o.isMesh)assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite),m.id);});
  const before=result.streetLife.snapshot();for(let i=0;i<150;i++)result.update(i/10);
  assert.notDeepEqual(result.streetLife.snapshot().map(p=>p.position),before.map(p=>p.position));
  assert.ok(result.stats.animations>=8);
  assert.ok(app.indexOf('positionShantouPlaces({existing:places')<app.indexOf('tourContext=buildTourContext('));
  assert.ok(app.includes('places.push(...cuisine.places,...nanaoPlaces);positionShantouPlaces'));
});

test('Queshi bridge walkers follow rotated sidewalks and vehicles use opposing lanes',async()=>{
  const {shantouPlaces}=await import('../shantou-places.mjs');
  const {buildShantouSights}=await import('../shantou-sights.mjs');
  const p={...shantouPlaces.find(p=>p.model==='bridge'),x:0,z:0};
  const result=buildShantouSights({parent:new THREE.Group(),places:[p],heightAt:()=>0,waterAt:()=>0});
  const cars=result.models[0].group.children.filter(o=>Math.abs(o.scale.x-.013)<1e-8);
  assert.equal(cars.length,4);result.update(0);const before=cars.map(c=>c.position.x);result.update(1);
  assert.ok(cars[0].position.x>before[0]);assert.ok(cars[1].position.x<before[1]);
  for(const person of result.streetLife.snapshot()){
    const [x,,z]=person.position,localZ=x*Math.sin(p.rotation)+z*Math.cos(p.rotation);
    assert.ok(Math.abs(Math.abs(localZ)-.13)<1e-6);
  }
});

test('Shantou neighboring heritage models do not overlap the original small park or each other',async()=>{
  const {shantouPlaces,positionShantouPlaces}=await import('../shantou-places.mjs');
  const {insidePlace}=await import('../place-footprints.mjs');
  const places=shantouPlaces.filter(p=>['hotel','post','museum','mazu'].includes(p.model)).map(p=>({...p}));
  const park={...landmarkPlaces.find(p=>p.id==='small-park'),x:0,z:0};
  positionShantouPlaces({places,existing:[park],toWorld:()=>[0,0],heightAt:()=>.1,waterAt:()=>null});
  for(const p of places){assert.ok(!insidePlace(park,p.x,p.z,.6*p.displayScale));for(const q of places.filter(q=>q!==p))assert.ok(!insidePlace(q,p.x,p.z,.6*p.displayScale));}
});

test('Nanao adds seventeen distinct models and reuses the existing eighteenth landmark',async()=>{
  const {nanaoPlaces,buildNanaoSights}=await import('../nanao-sights.mjs');
  assert.equal(nanaoPlaces.length,17);assert.equal(new Set(nanaoPlaces.map(p=>p.id)).size,17);
  assert.equal(nanaoPlaces.filter(p=>p.priority).length,11);
  assert.equal(landmarkPlaces.filter(p=>p.id==='lighthouse').length,1);
  const sites=nanaoPlaces.map(p=>({...p}));
  const result=buildNanaoSights({parent:new THREE.Group(),places:sites,heightAt:()=>.1,waterAt:()=>null,toWorld:(lon,lat)=>[(lon-data.meta.origin[0])*data.meta.sx,(data.meta.origin[1]-lat)*data.meta.sz],data});
  const gate=result.models.find(m=>m.id==='nanao-nature-gate').group.userData.infill;
  assert.ok(gate.services>=4&&gate.access>=gate.services&&gate.plants>0,'Nature Gate must include four connected interior services, not only peripheral trees');
  for(const m of result.models){m.group.traverse(o=>{assert.ok(o.position.toArray().every(Number.isFinite),m.id+' position');if(o.isMesh)assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite),m.id+' vertices');});}
  const angles=()=>{const out=[];result.group.traverse(o=>out.push(o.rotation.z));return out;};
  result.update(0);const before=angles();result.update(8);assert.notDeepEqual(angles(),before);
  assert.equal(result.stats.rotors,5);assert.equal(result.stats.boats,10);
  assert.ok(result.stats.people>=170);
  assert.equal(result.stats.walkways.length,17);
  assert.ok(result.stats.walkways.every(p=>p.paths>0&&p.people>=10));
  assert.equal(result.streetLife.count,result.stats.walkways.reduce((n,p)=>n+p.people,0));
  const initial=result.streetLife.snapshot();
  for(let i=0;i<300;i++)result.update(i/10);
  const final=result.streetLife.snapshot();
  assert.notDeepEqual(initial.map(p=>p.position),final.map(p=>p.position));
  assert.ok(new Set(final.map(p=>p.state)).size>=3);
  assert.ok(final.every(p=>p.position.every(Number.isFinite)));
  const anchors=app.indexOf('positionNanaoPlaces({toWorld,heightAt,waterAt})');
  assert.ok(anchors>=0&&anchors<app.indexOf('tourContext=buildTourContext('));
  for(const p of sites){assert.ok(p.x>=data.terrain.bounds[0][0]&&p.x<=data.terrain.bounds[1][0],p.name+' longitude');assert.ok(p.z>=data.terrain.bounds[0][1]&&p.z<=data.terrain.bounds[1][1],p.name+' latitude');}
});

test('prepared model walkways keep their deck elevation and do not create new district scenes',()=>{
  const routes=[[new THREE.Vector3(0,1.25,0),new THREE.Vector3(.5,1.25,0)], [new THREE.Vector3(2,2.5,0),new THREE.Vector3(2.5,2.5,0)]];
  const life=buildRegionalLife({parent:new THREE.Group(),routes:[],roadRoutes:[],places:[],heightAt:()=>-1,waterAt:()=>0,preparedWalkways:routes,population:20});
  assert.equal(life.count,20);assert.equal(life.tracks,2);assert.equal(life.places.length,0);
  for(let i=0;i<100;i++)life.update(i/10);
  for(const person of life.snapshot()){
    assert.ok(Math.abs(person.position[2])<1e-8);
    assert.ok(Math.abs(person.position[1]-(person.position[0]<1?1.25:2.5))<1e-8);
  }
});

test('island infill uses actual footprints and extends the existing street fabric',async()=>{
  const {planTourContext}=await import('../tour-context.mjs');
  const {planIntroSurroundings}=await import('../intro-surroundings.mjs');
  const {insidePlace}=await import('../place-footprints.mjs');
  const p={id:'island-fixture',name:'Island',kind:'island',model:'town',x:0,z:0,span:.9,footprint:[-.46,.46,-.4,.4]};
  const options={places:[p],routes:[[{x:-2,z:1.2},{x:2,z:1.2}]],heightAt:()=>.1,waterAt:()=>null};
  const plan=planTourContext(options);
  assert.ok(plan.streets.length>0);assert.ok(plan.plots.length>0);assert.ok(plan.coverage[0].joined);
  assert.ok(plan.streets.every(s=>s.points.every(v=>!insidePlace(p,v[0],v[2],s.width))));
  const garden=planIntroSurroundings({...options,routes:[]});
  assert.ok(garden.cells.some(c=>Math.hypot(c.x,c.z)<.8));
  assert.ok(garden.cells.every(c=>!insidePlace(p,c.x,c.z,c.size*.8)));
});

test('ground sampling matches rendered triangles instead of sinking under a bilinear surface',()=>{
  const source=app.slice(app.indexOf('function heightAt'),app.indexOf('function inBounds'));
  const fixture={terrain:{nx:1,nz:1,heights:[0,100,100,0]}};
  const sample=new Function('data','worldBounds','width','depth','clamp',source+';return heightAt;')(fixture,[[0,0],[1,1]],1,1,THREE.MathUtils.clamp);
  assert.equal(sample(.5,.5),.4);assert.equal(sample(.25,.25),.2);
  assert.ok(Math.abs(sample(.75,.75)-.2)<1e-8);
});

test('tour labels use the current camera matrix at varying frame intervals',()=>{
  const labelSetup=app.match(/function updateLabels\(\)\{([\s\S]*?)const occupied=/)?.[1];
  assert.ok(labelSetup?.includes('camera.updateMatrixWorld();'));
  const syncLabels=new Function('camera',labelSetup);
  for(const place of landmarkPlaces){
    const camera=new THREE.OrthographicCamera(-1280/720*24,1280/720*24,24,-24,.1,700);
    camera.zoom=24/Math.max(place.halfHeight,place.span/(1280/720)*.60);
    camera.updateProjectionMatrix();
    const target=new THREE.Vector3(16,place.top*.32,-22);
    const anchor=new THREE.Vector3(target.x,place.top+.14,target.z);
    camera.position.copy(target).add(new THREE.Vector3(3,4,5));
    camera.lookAt(target);camera.updateMatrixWorld();
    let staleError=0,maxError=0;
    for(let i=0;i<180;i++){
      const dt=[1/120,1/60,.05,1/30][i%4];
      const offset=camera.position.clone().sub(target).applyAxisAngle(new THREE.Vector3(0,1,0),dt*.045);
      camera.position.copy(target).add(offset);camera.lookAt(target);
      const stale=anchor.clone().project(camera);
      syncLabels(camera);
      const label=anchor.clone().project(camera);
      camera.updateMatrixWorld();
      const rendered=anchor.clone().project(camera);
      staleError=Math.max(staleError,Math.abs(stale.x-rendered.x)*640);
      maxError=Math.max(maxError,label.distanceTo(rendered));
      assert.ok(Math.abs(label.x)*640<1e-7,place.name+' should stay above the orbit target');
    }
    assert.ok(staleError>1,'fixture must expose the old matrix lag');
    assert.ok(maxError<1e-10,place.name+' labels and rendered frame must agree');
  }
});

test('traffic preserves headway and obeys pedestrian crossing red lights',()=>{
  const cars=[.1,.3,.5].map(distance=>({distance,size:.07,speed:0,cruise:.045}));
  for(let i=0;i<2400;i++){
    advanceLane(cars,1,.05,10,[{distance:.7,axis:0}]);
    const ordered=[...cars].sort((a,b)=>a.distance-b.distance);
    for(let j=0;j<ordered.length;j++)assert.ok((ordered[(j+1)%3].distance-ordered[j].distance+1)%1>=.07+followingGap-1e-8);
  }
  assert.ok(Math.max(...cars.map(c=>c.distance))<=.6650001);
  const before=cars[2].distance;for(let i=0;i<60;i++)advanceLane(cars,1,.05,2,[{distance:.7,axis:0}]);assert.ok(cars[2].distance>before);
  assert.equal(signalGreen(10),false);assert.equal(signalGreen(2),true);assert.equal(signalGreen(22,1),false);
});

test('crossing roads receive opposing signals; grade-separated roads do not',()=>{
  const route=(a,b)=>{const curve=new THREE.CurvePath();curve.add(new THREE.LineCurve3(new THREE.Vector3(...a),new THREE.Vector3(...b)));return {curve};};
  const routes=[route([-1,0,0],[1,0,0]),route([0,0,-1],[0,0,1]),route([.5,.1,-1],[.5,.1,1])];roadJunctions(routes);
  assert.equal(routes[0].junctions.length,1);assert.equal(routes[1].junctions.length,1);assert.equal(routes[2].junctions.length,0);
  assert.notEqual(routes[0].junctions[0].axis,routes[1].junctions[0].axis);
});

test('illustrative buildings stay outside water and existing roads',()=>{
  const group=new THREE.Group(),environment=buildUrbanEnvironment({parent:group,routes:[[new THREE.Vector3(-1,0,0),new THREE.Vector3(1,0,0)]],places:[{kind:'district',x:0,z:0}],heightAt:()=>0,waterAt:(x,z)=>z<0?0:null});
  assert.ok(environment.buildings>0);const positions=new THREE.Matrix4();
  environment.group.children[0].getMatrixAt(0,positions);assert.ok(positions.elements[14]>.10);
});

test('twelve neighborhoods have distinct programs and finite assets',()=>{
  assert.equal(new Set(neighborhoodThemes.map(t=>t.title)).size,12);
  assert.ok(neighborhoodThemes.some(t=>t.shops.some(s=>s.includes('公安'))));
  assert.ok(neighborhoodThemes.some(t=>t.shops.some(s=>s.includes('超市'))));
  assert.ok(neighborhoodThemes.filter(t=>t.activity==='football').length<4);
  for(let index=0;index<12;index++){
    const result=buildNeighborhood({parent:new THREE.Group(),center:new THREE.Vector3(),index,heightAt:()=>0});result.update(10);
    result.group.traverse(o=>{assert.ok(o.position.toArray().every(Number.isFinite));if(o.isMesh)assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite));});
  }
});

test('bridge and lighthouse receive their own pedestrian life',()=>{
  const models=['guangji','lighthouse'].map(id=>({spec:{id},group:new THREE.Group()}));
  const base={groups:[],people:0,vehicles:0,vehicleNodes:[],update(){}};
  const life=extendLandmarkLife(base,{models,heightAt:()=>0,waterAt:()=>null,roads:[],mobile:true});
  assert.ok(life.coverage.guangji.people>=32);assert.ok(life.coverage.lighthouse.people>=16);
  life.update(5);assert.ok(life.snapshot().every(p=>p.position.every(Number.isFinite)));
});

test('seven vehicles and six tree forms use finite colored merged geometry',()=>{
  assert.equal(vehicleTypes.length,7);assert.equal(treeTypes.length,6);
  for(const [types,build] of [[vehicleTypes,vehicleGeometry],[treeTypes,treeGeometry]])for(const type of types){
    const g=build(type);assert.ok(g.attributes.position.count>30);assert.equal(g.attributes.position.count,g.attributes.color.count);
    assert.ok(Array.from(g.attributes.position.array).every(Number.isFinite));assert.ok(Array.from(g.attributes.normal.array).every(Number.isFinite));
  }
});
test('mountain viewpoints come from the original elevation grid',()=>{
  const points=mountainPlaces(data);assert.equal(points.length,3);
  for(const p of points){assert.equal(p.kind,'mountain');assert.ok(p.elevation>100);assert.ok(p.ll[0]>=p.bounds[0]&&p.ll[0]<=p.bounds[2]&&p.ll[1]>=p.bounds[1]&&p.ll[1]<=p.bounds[3]);}
});
test('traffic and walkers animate with bounded population',()=>{
  const parent=new THREE.Group(),traffic=buildTraffic({parent,routes:[[new THREE.Vector3(0,.03,0),new THREE.Vector3(0,.03,2)]],places:[{x:0,z:1}],mobile:true});
  assert.equal(traffic.count,26);traffic.update(10);const a=Array.from(traffic.group.children[0].instanceMatrix.array);traffic.update(11);const b=Array.from(traffic.group.children[0].instanceMatrix.array);
  assert.ok(a.every(Number.isFinite));assert.notDeepEqual(a,b);
  const models=['small-park','jieyang-tower'].map(id=>({spec:{id},group:new THREE.Group()}));
  const life=buildLandmarkLife({models,mobile:true});assert.equal(life.people,32);assert.equal(life.vehicles,16);assert.equal(life.outfits.length,16);
  life.update(10);for(const m of models)m.group.traverse(o=>assert.ok(o.position.toArray().every(Number.isFinite)));
  const empty=buildTraffic({parent,routes:[],places:[],mobile:true});assert.equal(empty.count,0);empty.update(1);
});

test('regional distribution spans every district and distant grid cells',()=>{
  const places=Array.from({length:12},(_,i)=>({kind:'district',name:String(i),en:String(i),x:i*5,z:0}));
  const routes=Array.from({length:120},(_,i)=>({mid:new THREE.Vector3(i*.5,0,0)}));
  const selected=spreadRoutes(routes,places,504);
  for(const p of places)assert.ok(selected.some(r=>Math.abs(r.mid.x-p.x)<1));
  assert.ok(new Set(selected.map(r=>Math.floor(r.mid.x/2))).size>25);
  assert.deepEqual(spreadRoutes([],places,100),[]);
});

test('all twelve regions have people, activities, moving limbs and bounded time steps',()=>{
  const places=Array.from({length:12},(_,i)=>({kind:'district',name:String(i),en:String(i),x:i*5,z:0}));
  const routes=places.flatMap(p=>Array.from({length:4},(_,j)=>[new THREE.Vector3(p.x-.4,0,j*.12),new THREE.Vector3(p.x+.4,0,j*.12)]));
  const life=buildRegionalLife({parent:new THREE.Group(),routes,places,heightAt:()=>0,waterAt:()=>null,mobile:true});
  assert.equal(life.places.length,12);assert.equal(life.count,492);
  for(const c of Object.values(life.coverage)){assert.ok(c.people>=8);assert.equal(c.activity,true);}
  assert.deepEqual(new Set(life.snapshot().map(p=>p.state)),new Set(activityTypes));
  const before=life.snapshot();for(let i=1;i<=300;i++)life.update(i/30);
  const after=life.snapshot();assert.notDeepEqual(after,before);assert.ok(after.every(p=>p.position.every(Number.isFinite)));
  life.update(3600);const resumed=life.snapshot();
  for(let i=0;i<384;i++)assert.ok(new THREE.Vector3(...after[i].position).distanceTo(new THREE.Vector3(...resumed[i].position))<.08);
  life.group.traverse(o=>{if(o.isInstancedMesh)assert.ok(Array.from(o.instanceMatrix.array).every(Number.isFinite));});
});

test('pedestrian placement rejects water, steep ground and building footprints',()=>{
  const clear=landClearance({heightAt:x=>x>4?x*10:0,waterAt:(x,z)=>z<0?0:null,buildings:[[2,2,.2,.3,0,12]]});
  assert.equal(clear(0,-1),false);assert.equal(clear(2,2),false);assert.equal(clear(5,1),false);assert.equal(clear(0,1),true);
  const empty=buildRegionalLife({parent:new THREE.Group(),routes:[],places:[],heightAt:()=>0,waterAt:()=>null});
  assert.equal(empty.count,0);empty.update(1);
});

test('city names outrank landmarks and receive non-overlapping alternate positions',()=>{
  const occupied=[];
  for(const [i,name] of coreCities.entries()){
    assert.ok(labelPriority({name},null)>labelPriority({name:'广济桥',major:true},null));
    const pos=labelPosition({x:200+i*10,y:300+i*10,width:390,height:844,mobile:true,important:true,occupied});
    assert.ok(pos);occupied.push(pos.box);
  }
  assert.ok(app.includes('labelPriority(b.p,places[selected])'));
  assert.ok(app.includes("if(!bridge&&!['motorway','trunk'].includes(cls))walkRoutes.push(route)"));
});
test('woodland instances preserve all supplied positions',()=>{
  const accepted=Array.from({length:30},(_,i)=>[i,1,1,.1]);const forest=buildVegetation({parent:new THREE.Group(),accepted});
  assert.equal(Object.values(forest.counts).reduce((a,b)=>a+b,0),30);assert.equal(Object.keys(forest.counts).length,6);
});

test('four distinct regional models contain finite, selectable geometry',()=>{
  const parent=new THREE.Group();
  const local=buildLocalLandmarks({parent,heightAt:()=>0,waterAt:()=>null,toWorld:(x,z)=>[x,z]});
  assert.equal(parent.children.length,4);
  assert.equal(new Set(landmarkPlaces.map(p=>p.id)).size,4);
  let count=0;
  parent.traverse(o=>{if(o.isMesh){count++;assert.ok(o.userData.landmarkId);assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite));}});
  assert.ok(count>100);
  const light=local.models.find(m=>m.rotor);
  local.setTime('day');assert.equal(light.rotor.visible,false);
  local.setTime('night');assert.equal(light.rotor.visible,true);
  local.update(1000,false);const angle=light.rotor.rotation.y;
  local.update(2000,false);assert.notEqual(light.rotor.rotation.y,angle);
  local.update(3000,true);assert.equal(light.rotor.rotation.y,.46);
});

test('all twelve region entry points are inside the geographic extent', () => {
  assert.equal(regions.length, 12);
  assert.equal(new Set(regions.map(r => r.name)).size, 12);
  const [west,south,east,north] = data.meta.bbox;
  for(const {ll:[lon,lat]} of regions) {
    assert.ok(lon>=west && lon<=east && lat>=south && lat<=north);
  }
});
test('elevation grid and feature counts are complete and finite', () => {
  const {nx,nz,heights} = data.terrain;
  assert.equal(heights.length,(nx+1)*(nz+1));
  assert.ok(heights.every(Number.isFinite));
  assert.ok(data.roads.length>10000);
  assert.equal(data.water.length,data.waterHeights.length);
  assert.ok(data.water.length>1000);
  assert.ok(heights.some(h=>h<0),'water bed must be below sea level');
});
test('building binary has exactly six finite floats per footprint', () => {
  const bin=read('public/data/buildings.bin');
  assert.equal(bin.length,data.meta.buildingCount*24);
  for(let i=0;i<bin.length;i+=4) assert.ok(Number.isFinite(bin.readFloatLE(i)));
});
test('regional environment transitions only overview symbols and preserves dry placement', async () => {
  const {environmentOpacity,generateRegionalEnvironment}=await import('../regional-environment.mjs');
  assert.equal(environmentOpacity(1),1);assert.equal(environmentOpacity(23),0);
  assert.ok(environmentOpacity(15)>environmentOpacity(19));
  const fixture={terrain:{bounds:[[-10,-10],[10,10]]},water:[],roads:Array.from({length:10},(_,i)=>['secondary',false,[[-9,i*2-9],[9,i*2-9]]])};
  const options={data:fixture,places:[{kind:'district',name:'Test city',x:0,z:0}],heightAt:()=>.3,waterAt:(x,z)=>x>5?0:null,mobile:true};
  const a=generateRegionalEnvironment(options),b=generateRegionalEnvironment(options);
  assert.deepEqual(a,b);assert.ok(a.cities.length>20);assert.ok(a.forest.length>0);
  assert.ok(a.cities.every(r=>r.x+.24<=5&&[r.x,r.y,r.z,r.h,r.angle].every(Number.isFinite)));
  assert.ok(a.forest.every(r=>r[0]+.35<=5));
});

test('regional buildings keep opaque facades at close zoom and respect reserved neighbourhood land',async()=>{
 const {generateRegionalEnvironment,buildRegionalEnvironment}=await import('../regional-environment.mjs');
 const data={terrain:{bounds:[[-6,-6],[6,6]]},water:[],roads:Array.from({length:5},(_,i)=>['secondary',false,[[-5,i*2-4],[5,i*2-4]]])};
 const options={data,places:[{kind:'district',name:'Test',x:0,z:0}],heightAt:()=>.3,waterAt:()=>null,mobile:true};
 const open=generateRegionalEnvironment(options);assert.ok(open.cities.length>10);
 const reserved=generateRegionalEnvironment({...options,reserve:(x,z,r)=>x-r>0});
 assert.ok(reserved.cities.length>0&&reserved.cities.length<open.cities.length);
 for(const r of reserved.cities)assert.ok(r.x-Math.hypot(r.w,r.d)*.5>.01);
 assert.equal(generateRegionalEnvironment({...options,reserve:()=>false}).cities.length,0);
 assert.equal(generateRegionalEnvironment({...options,reservedSites:[{x:0,z:0,span:20}]}).cities.length,0);
 const env=buildRegionalEnvironment({...options,parent:new THREE.Group()});let facades=0;
 for(const zoom of [1,16,23,50]){
  env.update(4,zoom);assert.equal(env.cityGroup.visible,true);
  env.cityGroup.traverse(o=>{if(o.isMesh){assert.equal(o.material.opacity,1);assert.equal(o.material.alphaHash,false);if(o.name==='regional-city-facades')facades+=o.count;}});
 }
 assert.ok(facades>open.cities.length*8,'nearby buildings contain entrances and multiple windows');
 env.cityGroup.visible=false;env.update(5,30);assert.equal(env.cityGroup.visible,false,'zoom cannot override the user layer toggle');
});

test('detailed riverbanks avoid roads and reserve physical tree spacing', async () => {
  const {generateRegionalEnvironment}=await import('../regional-environment.mjs');
  const data={terrain:{bounds:[[-10,-10],[10,10]]},water:[[[[-4,0],[4,0]]]],roads:[]};
  const options={data,places:[{kind:'landmark',x:0,z:0}],heightAt:()=>0,waterAt:(x,z)=>z<0?0:null,mobile:true};
  const open=generateRegionalEnvironment(options);
  assert.ok(open.banks.length>0);
  assert.ok(open.riparian.length<=10);
  for(let i=2;i<open.banks.length;i+=3)assert.ok(open.banks[i]>=0&&open.banks[i]<=.025);
  const road=generateRegionalEnvironment({...options,data:{...data,roads:[['secondary',false,[[-4,.03],[4,.03]]]]}});
  assert.equal(road.banks.length,0);
  const reserved=generateRegionalEnvironment({...options,reservedSites:[{x:0,z:0,span:10}]});
  assert.equal(reserved.banks.length,0);
});

test('airport, trains and concept metro are finite and animate along their own paths', async () => {
  const {buildTransport}=await import('../transport.mjs');
  const parent=new THREE.Group(),transport=buildTransport({parent,data:{meta:{origin:[0,0],sx:1,sz:1},roads:[['rail',false,[[-5,0],[0,0],[5,0]]]]},places:[{kind:'district',en:'Shantou',x:0,z:0}],heightAt:()=>0,waterAt:()=>null,toWorld:()=>[0,0],mobile:true});
  assert.equal(transport.places[0].name,'揭阳潮汕国际机场');
  assert.equal(transport.stats.animatedPlanes,2);assert.equal(transport.stats.railwayTrains,1);assert.equal(transport.stats.metroConcept,true);
  assert.match(transport.places.find(p=>p.id==='metro-concept').description,/不是已运营地铁/);
  const snapshot=()=>{const out=[];parent.traverse(o=>{out.push(...o.position.toArray());if(o.isMesh)assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite));});return out;};
  transport.update(0);const start=snapshot();transport.update(10);const end=snapshot();
  assert.ok(end.every(Number.isFinite));assert.notDeepEqual(start,end);
  transport.update(36000);assert.ok(snapshot().every(Number.isFinite));
});

test('adaptation preserves sea-level clearance and geographic navigation', () => {
  assert.ok(app.includes('/2,-.86,'));
  assert.ok(app.includes("$('district').value=String(i)"));
  assert.ok(app.includes('V(34,39,46).multiplyScalar(Math.max(width/47,depth/45))'));
  assert.ok(!app.includes('/data/seoul.json'));
  assert.ok(app.includes('landmarks:landmarkGroup.children.length'));
});

test('unnamed road corridors receive buildings and fields beyond district radii',()=>{
  const routes=Array.from({length:12},(_,i)=>[new THREE.Vector3(10+i*3,0,0),new THREE.Vector3(11+i*3,0,0)]);
  const env=buildUrbanEnvironment({parent:new THREE.Group(),routes,places:[{kind:'district',x:0,z:0}],heightAt:()=>0,waterAt:()=>null,mobile:true});
  assert.ok(env.buildings>100);assert.ok(env.corridorCells>=12);assert.ok(env.fields>=12);
  const m=new THREE.Matrix4();env.group.children[0].getMatrixAt(0,m);assert.ok(m.elements[12]>9);
  env.group.traverse(o=>{if(o.isInstancedMesh)assert.ok(Array.from(o.instanceMatrix.array).every(Number.isFinite));});
});

test('all twelve cuisines have selectable scenes and distinct dish geometry choices',async()=>{
  const {buildCuisine,regionalMenus,dishShape}=await import('../local-cuisine.mjs');
  const places=regionalMenus.map(([name],i)=>({name,kind:'district',x:i*10,z:0}));
  const food=buildCuisine({parent:new THREE.Group(),data:{meta:{origin:[0,0],sx:1,sz:1},roads:[]},places,heightAt:()=>0,waterAt:()=>null,mobile:true});
  assert.equal(food.places.length,12);assert.equal(new Set(food.places.map(p=>p.region)).size,12);
  assert.equal(food.places[0].dishes[0],'牛肉丸');assert.equal(food.places[1].dishes[0],'鸭母捻');assert.equal(food.places[2].dishes[0],'乒乓粿');
  assert.equal(dishShape('普宁豆干'),'tofu');assert.equal(dishShape('蚝烙'),'pancake');assert.equal(dishShape('工夫茶'),'tea');
  const a=food.snapshot();food.update(5);assert.notDeepEqual(a,food.snapshot());
  food.group.traverse(o=>{assert.ok(o.position.toArray().every(Number.isFinite));if(o.isMesh)assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite));});
});

test('airport passengers wait, walk, board and return; train boarding follows station dwell',async()=>{
  const {buildAirportLife,buildRailStation,journeyPhase}=await import('../transport-life.mjs');
  const {trainModel}=await import('../transport.mjs');
  assert.equal(journeyPhase(5).state,'wait');assert.equal(journeyPhase(20).state,'walk');assert.equal(journeyPhase(35).state,'aboard');assert.equal(journeyPhase(43).state,'return');
  const airport=buildAirportLife({airport:new THREE.Group()});assert.ok(airport.people>=50);assert.equal(airport.vehicles,6);
  airport.update(5);const a=airport.snapshot();airport.update(20);assert.notDeepEqual(a,airport.snapshot());assert.ok(airport.snapshot().every(p=>p.position.every(Number.isFinite)));
  const curve=new THREE.CurvePath();curve.add(new THREE.LineCurve3(new THREE.Vector3(-5,0,0),new THREE.Vector3(5,0,0)));
  const station=buildRailStation({parent:new THREE.Group(),route:{curve},index:0,trainModel});station.update(5);assert.equal(station.snapshot().state,'arrive');station.update(20);assert.equal(station.snapshot().state,'dwell');station.update(45);assert.equal(station.snapshot().state,'depart');assert.equal(station.snapshot().people,12);
  assert.ok(app.includes('population:mobile()?1008:2016'));assert.ok(app.includes('population:mobile()?768:1536'));
});

test('six recreation programs cover all twelve stops and reserve a road-free footprint',async()=>{
  const {buildCommunityActivities,communityPrograms}=await import('../community-activities.mjs');
  const {streetClearance}=await import('../street-clearance.mjs');
  const places=regions.map((p,i)=>({id:'activity-'+i,name:p.name+' · 街头生活',kind:'activity',x:i*10,z:0,description:''}));
  const routes=places.map(p=>[new THREE.Vector3(p.x-3,0,0),new THREE.Vector3(p.x+3,0,0)]);
  const options={parent:new THREE.Group(),places,routes,heightAt:()=>0,waterAt:()=>null};
  const activities=buildCommunityActivities(options),offRoad=streetClearance(routes);
  assert.equal(activities.stats.courts,12);assert.equal(new Set(communityPrograms).size,6);
  for(const site of activities.sites){
    assert.ok(offRoad(site.x,site.z,.30*site.scale));
    const place=places.find(p=>p.id===site.id);
    assert.equal(place.defaultView,0);assert.equal(place.views.length,1);
    assert.equal(place.views[0].name,place.name);assert.ok(place.views[0].halfHeight>=.48);
    assert.ok(Math.hypot(site.x-place.x,site.z-place.z)>=.45+.30*site.scale);
  }
  const before=activities.snapshot();activities.update(2);assert.notDeepEqual(before,activities.snapshot());
  activities.update(3600);assert.ok(activities.snapshot().flat().every(Number.isFinite));
  activities.group.traverse(o=>{if(o.isMesh)assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite));});
});

test('every later district, food and activity receives streets and dry connected approaches',async()=>{
  const {planTourContext}=await import('../tour-context.mjs');
  const {streetClearance}=await import('../street-clearance.mjs');
  const places=regions.flatMap((p,i)=>[{id:'district-'+i,name:p.name,kind:'district',x:i*10,z:0},{id:'life-'+i,name:p.name+'生活',kind:'activity',x:i*10,z:1},{id:'food-'+i,name:p.name+'美食',kind:'food',x:i*10,z:2,span:.26}]);
  const routes=regions.map((_,i)=>[new THREE.Vector3(i*10-3,0,-1),new THREE.Vector3(i*10+3,0,-1)]);
  const plan=planTourContext({places,routes,heightAt:()=>0,waterAt:(x,z)=>z>4?0:null});
  assert.equal(plan.coverage.length,36);
  for(const c of plan.coverage){assert.ok(c.streets>0,c.name);assert.ok(c.joined,c.name);}
  assert.ok(plan.plots.length>100);
  assert.ok(plan.streets.every(s=>s.points.every(p=>p[2]<4&&p.every(Number.isFinite))));
  const offRoad=streetClearance([...routes,...plan.streets.map(s=>s.points.map(p=>({x:p[0],z:p[2]})))]);
  for(const p of plan.plots)assert.ok(offRoad(p.x,p.z,p.size*.8+.036));
});

test('intro surroundings cover every category without covering water, roads or subjects',async()=>{
  const {planIntroSurroundings}=await import('../intro-surroundings.mjs');
  const kinds=['landmark','district','mountain','activity','food','transport'];
  const places=kinds.map((kind,i)=>({id:kind,name:kind,kind,x:i*12,z:0,span:.28}));
  const routes=places.map(p=>[new THREE.Vector3(p.x-4,0,.55),new THREE.Vector3(p.x+4,0,.55)]);
  const {streetClearance}=await import('../street-clearance.mjs'),offRoad=streetClearance(routes);
  const plan=planIntroSurroundings({places,routes,heightAt:()=>0,waterAt:(x,z)=>z<-.7?0:null});
  assert.equal(plan.coverage.length,6);assert.ok(plan.coverage.every(c=>c.cells>0));
  for(const c of plan.cells){assert.ok(offRoad(c.x,c.z,c.size*.75+.025));assert.ok(c.corners.every(v=>v[1]>=-.7));assert.ok(places.every(p=>Math.hypot(c.x-p.x,c.z-p.z)>=p.span+c.size*.8));}
});

test('airport and rail forecourts are finite and stay outside operating lanes',async()=>{
  const {buildAirportSurroundings,buildStationSurroundings}=await import('../transport-surroundings.mjs');
  const airport=buildAirportSurroundings(new THREE.Group()),station=buildStationSurroundings(new THREE.Group());
  for(const g of [airport,station])g.traverse(o=>{if(o.isMesh)assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite));});
  assert.ok(new THREE.Box3().setFromObject(station,true).min.x>.64);
  assert.ok(new THREE.Box3().setFromObject(airport).min.x>1.1);
});

test('food models are distinct and static batching preserves framing',async()=>{
  const {buildDish,dishShape}=await import('../food-models.mjs');const {batchStatic}=await import('../static-batch.mjs');
  const {regionalMenus,cuisineLayouts}=await import('../local-cuisine.mjs');
  assert.equal(new Set(cuisineLayouts).size,12);
  const names=[...new Set(regionalMenus.flatMap(p=>p[1]))];assert.ok(new Set(names.map(dishShape)).size>=14);
  for(const name of names){
    const g=buildDish(new THREE.Group(),name),before=new THREE.Box3().setFromObject(g,true);batchStatic(g);const after=new THREE.Box3().setFromObject(g,true);
    assert.ok(before.min.distanceTo(after.min)<1e-6,name);assert.ok(before.max.distanceTo(after.max)<1e-6,name);
    assert.ok(after.getSize(new THREE.Vector3()).length()>.04,name);
    g.traverse(o=>{if(o.isMesh)assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite));});
  }
  assert.ok(app.includes('viewIndex??original.defaultView??0'));
});

test('all regional civic layouts connect to roads, differ and preserve dry footprints',async()=>{
  const {planCivicNeighborhoods,buildCivicNeighborhoods,civicThemes}=await import('../civic-neighborhoods.mjs');
  const {streetClearance}=await import('../street-clearance.mjs');
  const places=regions.map((p,i)=>({...p,id:p.name,kind:'district',x:i*10,z:0}));
  const routes=places.flatMap(p=>[-.5,.5,1].map(z=>[new THREE.Vector3(p.x-2,0,z),new THREE.Vector3(p.x+2,0,z)]));
  const opts={places,routes,heightAt:()=>0,waterAt:(x,z)=>z>1.6?0:null};
  const plan=planCivicNeighborhoods(opts),offRoad=streetClearance(routes);
  assert.equal(plan.coverage.length,12);assert.ok(plan.coverage.every(c=>c.facilities===3));
  assert.equal(new Set(plan.coverage.map(c=>c.themes.join(','))).size,12);
  assert.equal(new Set(plan.facilities.map(f=>f.theme)).size,civicThemes.length);
  for(const f of plan.facilities){
    assert.ok(offRoad(f.x,f.z,.225*f.scale+.025));
    assert.ok(f.z+.225*f.scale<1.6);
    assert.ok(Math.abs(Math.hypot(f.path[0][0]-f.rx,f.path[0][2]-f.rz)-.035)<1e-8);
    assert.ok(Math.abs(Math.hypot(f.path.at(-1)[0]-f.x,f.path.at(-1)[2]-f.z)-.145*f.scale)<1e-8);
  }
  const result=buildCivicNeighborhoods({parent:new THREE.Group(),plan});
  const positions=()=>{const a=[];result.group.traverse(o=>a.push(...o.position.toArray()));return a;};
  const before=positions();result.update(5);assert.notDeepEqual(before,positions());
  result.group.traverse(o=>{if(o.isMesh)assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite));});
  assert.ok(plan.facilities.every(f=>!result.clear(f.x,f.z,.01)));
});

test('bridge banks use the narrow model footprint, not a circular camera exclusion',async()=>{
  const {insidePlace}=await import('../place-footprints.mjs');
  const bridge={...landmarkPlaces[0],x:0,z:0,rotation:0};
  assert.ok(insidePlace(bridge,.3,0,.01));assert.equal(insidePlace(bridge,.3,.2,.01),false);
  const {planIntroSurroundings}=await import('../intro-surroundings.mjs');
  const plan=planIntroSurroundings({places:[bridge],heightAt:()=>0,waterAt:(x,z)=>Math.abs(x)<.08?0:null});
  assert.ok(plan.cells.some(c=>Math.abs(c.x)<.35&&Math.abs(c.z)<.3));
  assert.ok(plan.cells.every(c=>!insidePlace(bridge,c.x,c.z,c.size*.8)));
  const airport={x:0,z:0,rotation:0,footprint:[-.9,3.15,-1.9,1.9]};
  assert.ok(insidePlace(airport,3,1));assert.equal(insidePlace(airport,-1.3,0),false);
});

test('nature paths retain terrain height, avoid water and include the last mountain',async()=>{
  const {planNatureApproaches,buildNatureApproaches}=await import('../nature-approaches.mjs');
  const places=['northern-ridge','western-valleys','island-hills'].map((id,i)=>({id,kind:'mountain',x:i*10,z:0}));
  const options={places,heightAt:(x,z)=>1+z*.1,waterAt:()=>null};
  const paths=planNatureApproaches(options);assert.equal(new Set(paths.map(p=>p.owner)).size,3);
  for(const path of paths)for(const p of path.points)assert.ok(Math.abs(p[1]-options.heightAt(p[0],p[2])-.014)<1e-8);
  const result=buildNatureApproaches({...options,parent:new THREE.Group()});
  result.group.traverse(o=>{if(o.isMesh)assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite));});
});
