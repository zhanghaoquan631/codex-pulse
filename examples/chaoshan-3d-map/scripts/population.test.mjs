import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {routeSampler} from '../route-sampler.mjs';
import {buildTraffic} from '../street-life.mjs';
import {buildWalkwayCrowd} from '../walkway-crowds.mjs';
import {planNeighborhoodPopulation} from '../neighborhood-population.mjs';
import {buildUrbanEnvironment} from '../urban-environment.mjs';
import {setCrowdView,crowdDetail} from '../scene-view-budget.mjs';
import {advanceLane} from '../traffic-rules.mjs';

test('indexed route samples preserve arc length, corners, deck height and endpoints',()=>{
 const points=[new THREE.Vector3(0,0,0),new THREE.Vector3(0,.2,1),new THREE.Vector3(0,.2,1),new THREE.Vector3(2,.3,1)];
 const source=new THREE.CurvePath();for(let i=1;i<points.length;i++)source.add(new THREE.LineCurve3(points[i-1],points[i]));
 const route=routeSampler(points);for(let i=0;i<=100;i++)assert.ok(route.getPoint(i/100).distanceTo(source.getPoint(i/100))<1e-10);
 assert.deepEqual(route.getPoint(1).toArray(),[2,.3,1]);assert.equal(route.curves.length,2);
 assert.ok(routeSampler([]).getPoint(.5).toArray().every(Number.isFinite));
});

test('network traffic covers every road, all districts and seven types without stealing mobile coverage',()=>{
 const places=Array.from({length:12},(_,i)=>({kind:'district',name:'district-'+i,x:i*10,z:0}));
 const roads=places.flatMap(p=>Array.from({length:9},(_,j)=>({owner:p.name,width:.04,points:[new THREE.Vector3(p.x,.018,j*.2),new THREE.Vector3(p.x+1,.018,j*.2)]})));
 const traffic=buildTraffic({parent:new THREE.Group(),routes:roads,places,coverNetwork:true,localStreets:true,mobile:true});
 assert.equal(traffic.routeCount,roads.length);assert.ok(traffic.routeCoverage.every(r=>r.cars>=2));
 for(const p of places){assert.ok(traffic.coverage[p.name]>=18);assert.equal(new Set(traffic.routeCoverage.filter(r=>r.owner===p.name).flatMap(r=>r.types)).size,7);}
 const before=traffic.snapshot();for(let frame=0;frame<400;frame++)traffic.update(frame/30);
 assert.notDeepEqual(traffic.snapshot(),before);
 for(const road of traffic.routeCoverage)for(const direction of [-1,1]){
  const cars=traffic.snapshot().filter(c=>c.route===road.id&&c.direction===direction).sort((a,b)=>a.distance-b.distance);
  if(cars.length>1)for(let i=0;i<cars.length;i++){const gap=(cars[(i+1)%cars.length].distance-cars[i].distance+road.length)%road.length;assert.ok(gap>.06);}
 }
});

test('every separated walkway gains residents without concentrating the count on the first region',()=>{
 const routes=Array.from({length:48},(_,i)=>({owner:'area-'+i,points:[new THREE.Vector3(i,.024,0),new THREE.Vector3(i+.6,.024,0)]}));
 const crowd=buildWalkwayCrowd({parent:new THREE.Group(),preparedWalkways:routes,coverEveryTrack:true});
 assert.equal(crowd.tracks,48);assert.ok(crowd.routeCoverage.every(r=>r.people>=4));
 const before=crowd.snapshot();for(let i=1;i<120;i++)crowd.update(i/30);assert.notDeepEqual(crowd.snapshot(),before);
 for(const r of routes)assert.ok(crowd.snapshot().some(p=>p.owner===r.owner));
});

test('new pavement visitors avoid the carriageway, cross street and water',()=>{
 const streets=[{width:.04,owner:'late-region',points:Array.from({length:81},(_,i)=>[i*.025-1,.011,0])}];
 const plan=planNeighborhoodPopulation({streets,plots:[],roadRoutes:[[new THREE.Vector3(0,0,-1),new THREE.Vector3(0,0,1)]],heightAt:()=>0,waterAt:(x,z)=>x>.75?0:null});
 assert.ok(plan.walkways.length>=4);
 for(const w of plan.walkways)for(const p of w.points){assert.ok(Math.abs(p.z)>.02);assert.ok(Math.abs(p.x)>=.043);assert.ok(p.x<=.75);}
});

test('urban corridor coverage no longer drops later source roads or halves mobile buildings',()=>{
 const routes=Array.from({length:24},(_,i)=>[new THREE.Vector3(i*2,0,0),new THREE.Vector3(i*2+1,0,0)]);
 const options={parent:new THREE.Group(),routes,places:[],heightAt:()=>0,waterAt:()=>null};
 const desktop=buildUrbanEnvironment(options),mobile=buildUrbanEnvironment({...options,parent:new THREE.Group(),mobile:true});
 assert.equal(desktop.corridorCoverage.length,routes.length);assert.ok(desktop.corridorCoverage.every(r=>r.buildings>0));
 assert.equal(mobile.buildings,desktop.buildings);assert.ok(desktop.corridorCoverage.at(-1).buildings>0);
});

test('distant crowds preserve residents and restore animated limbs when zoomed in',()=>{
 const crowd=buildWalkwayCrowd({parent:new THREE.Group(),preparedWalkways:[[new THREE.Vector3(-.5,0,0),new THREE.Vector3(.5,0,0)]],coverEveryTrack:true});
 const camera=new THREE.OrthographicCamera(-5,5,5,-5,.1,100);camera.position.set(0,5,10);camera.lookAt(0,0,0);camera.updateProjectionMatrix();
 try{
  setCrowdView(camera,1000);assert.equal(crowdDetail(.0264),false);crowd.update(1);
  const bodies=crowd.group.children.filter((_,i)=>i%5===0),limbs=crowd.group.children.filter((_,i)=>i%5!==0);
  assert.equal(bodies.reduce((n,m)=>n+m.count,0),crowd.count);assert.equal(limbs.reduce((n,m)=>n+m.count,0),0);
  camera.zoom=3;camera.updateProjectionMatrix();setCrowdView(camera,1000);crowd.update(1.1);
  assert.equal(bodies.reduce((n,m)=>n+m.count,0),crowd.count);assert.equal(limbs.reduce((n,m)=>n+m.count,0),crowd.count*4);
  for(const m of bodies.filter(m=>m.count))assert.equal(m.instanceMatrix.updateRanges[0].count,m.count*16);
 }finally{setCrowdView(null);}
});

test('network junctions have visible signal heads and coarse updates retain stopping gaps',()=>{
 const v=(x,z)=>new THREE.Vector3(x,0,z),traffic=buildTraffic({parent:new THREE.Group(),routes:[[v(-1,0),v(1,0)],[v(0,-1),v(0,1)]],places:[],coverNetwork:true});
 assert.ok(traffic.signalHeads>=4);assert.equal(traffic.crossings,2);
 const cars=[{distance:.1,size:.04,speed:.04,cruise:.04},{distance:.3,size:.04,speed:.04,cruise:.04}];
 for(let t=9;t<12;t+=.5)advanceLane(cars,1,.5,t,[{distance:.5,axis:0}],.55);
 assert.ok(cars.every(c=>c.distance+c.size/2<=.5));assert.ok(cars[1].distance-cars[0].distance>=.075);
});

test('urban block interiors gain curved flower and meadow clusters outside roads and water',()=>{
 const options={parent:new THREE.Group(),routes:[[new THREE.Vector3(-3,0,0),new THREE.Vector3(3,0,0)]],places:[{kind:'district',name:'test',x:0,z:0}],heightAt:()=>0,waterAt:(x,z)=>z>1?0:null};
 const environment=buildUrbanEnvironment(options);assert.ok(environment.gardens>0);assert.ok(environment.plantings>=environment.gardens*4);
 const matrix=new THREE.Matrix4();environment.group.getObjectByName('urban-block-gardens').traverse(o=>{
  if(!o.isInstancedMesh)return;for(let i=0;i<o.count;i++){o.getMatrixAt(i,matrix);assert.ok(Math.abs(matrix.elements[14])>.05);assert.ok(matrix.elements[14]<=1);}
 });
});

test('paused population keeps its positions while camera changes refresh culling and detail',()=>{
 const routes=[[new THREE.Vector3(-.5,0,0),new THREE.Vector3(.5,0,0)]],crowd=buildWalkwayCrowd({parent:new THREE.Group(),preparedWalkways:routes,coverEveryTrack:true}),traffic=buildTraffic({parent:new THREE.Group(),routes,places:[],coverNetwork:true});
 const before=crowd.snapshot().map(p=>p.position),cars=traffic.snapshot(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,100);
 try{
  camera.position.set(20,3,5);camera.lookAt(20,0,0);setCrowdView(camera);crowd.update(0);traffic.update(0);
  assert.equal(crowd.group.children.reduce((n,m)=>n+m.count,0),0);
  camera.position.set(0,3,5);camera.lookAt(0,0,0);setCrowdView(camera);crowd.update(0);traffic.update(0);
  assert.ok(crowd.group.children.reduce((n,m)=>n+m.count,0)>0);assert.deepEqual(crowd.snapshot().map(p=>p.position),before);assert.deepEqual(traffic.snapshot(),cars);
 }finally{setCrowdView(null);}
});
