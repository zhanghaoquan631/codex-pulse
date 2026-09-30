import * as THREE from 'three';
import {addSpatialInstances} from './spatial-instances.mjs';
import {overviewTree} from './overview-vegetation.mjs';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {spreadRoutes} from './route-distribution.mjs';
import {advanceLane,laneOffset,signalGreen,roadJunctions} from './traffic-rules.mjs';
import {parkWalkerPose} from './small-park-layout.mjs';
import {inCrowdView,crowdDetail,uploadVisibleInstances} from './scene-view-budget.mjs';
import {routeSampler} from './route-sampler.mjs';

export const vehicleTypes=['sedan','taxi','suv','bus','van','truck','scooter'];
export const treeTypes=['pine','broadleaf','umbrella','bamboo','palm','flowering'];
export const outfitTypes=['overalls','raincoat','dress','explorer','wizard','astronaut','beret','cape','student','shopkeeper','chef','office','senior','courier','medic','officer'];
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const palette=['#de6048','#48a69f','#e5b840','#759cba','#b578a9','#eee6d9','#638250'];
const cache=new Map();
const surface=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.8});
function rng(seed){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}

// Merge the colored parts of each miniature once; repeated objects use instancing.
function shapeBuilder(){
  const parts=[];
  function add(geo,color,pos=[0,0,0],scale=[1,1,1],rot=[0,0,0]){
    const g=geo.index?geo.toNonIndexed():geo;
    if(g!==geo)geo.dispose();
    g.deleteAttribute('uv');
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),new THREE.Vector3(...scale)));
    const c=new THREE.Color(color),colors=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<colors.length;i+=3){colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b;}
    g.setAttribute('color',new THREE.BufferAttribute(colors,3));parts.push(g);
  }
  return {
    box:(c,x,y,z,w,h,d)=>add(new THREE.BoxGeometry(w,h,d),c,[x,y+h/2,z]),
    ball:(c,x,y,z,r,s=[1,1,1])=>add(new THREE.IcosahedronGeometry(r,0),c,[x,y,z],s),
    canopy:(c,x,y,z,r,s=[1,1,1])=>add(new THREE.SphereGeometry(r,8,4),c,[x,y,z],s),
    frond:(c,x,y,z,angle,length,width,rise)=>{
      const positions=[],point=(t,side)=>[x+Math.sin(angle)*length*t+Math.cos(angle)*width*Math.sin(Math.PI*t)*side,y+rise*Math.sin(Math.PI*t)-.10*t*t,z+Math.cos(angle)*length*t-Math.sin(angle)*width*Math.sin(Math.PI*t)*side];
      for(let i=0;i<5;i++){const a=point(i/5,-1),b=point(i/5,1),d=point((i+1)/5,-1),e=point((i+1)/5,1);positions.push(...a,...d,...b,...b,...d,...e,...b,...d,...a,...e,...d,...b);}
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();add(geometry,c);
    },
    cyl:(c,x,y,z,rt,rb,h,rot=[0,0,0],n=8)=>add(new THREE.CylinderGeometry(rt,rb,h,n),c,[x,y+h/2,z],[1,1,1],rot),
    beam:(c,a,b,r)=>{const d=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),g=new THREE.CylinderGeometry(r,r,d.length(),6);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0,1,0),d.clone().normalize()));add(g,c,new THREE.Vector3(...a).addScaledVector(d,.5).toArray());},
    done:()=>{const g=mergeGeometries(parts);for(const p of parts)p.dispose();g.computeBoundingSphere();return g;}
  };
}
function cached(key,make){if(!cache.has(key))cache.set(key,make());return cache.get(key);}
export function vehicleGeometry(type){return cached('vehicle-'+type,()=>{
  const s=shapeBuilder(),body=palette[vehicleTypes.indexOf(type)],dark='#243536',rubber='#252c2e',glass='#b2d8de';
  if(type==='scooter'){
    s.box(body,0,.4,0,.65,.65,1.5);s.box(dark,0,1.04,-.22,.65,.2,.85);
    s.beam(dark,[0,.6,.6],[0,1.55,.85],.10);s.beam(dark,[-.42,1.55,.85],[.42,1.55,.85],.08);
    for(const z of [-.6,.75])s.cyl(rubber,0,.225,z,.34,.34,.23,[0,0,Math.PI/2],12);
    s.box('#426ca5',0,1.2,-.12,.52,.75,.38);s.ball('#f0bd98',0,2.05,0,.25);s.ball('#e6bd46',0,2.19,0,.30,[1,.6,1]);
  }else{
    const length=type==='bus'?8.6:type==='truck'?8:type==='van'?5.9:4.8;
    const width=type==='bus'||type==='truck'?2.4:2.1;
    s.box(body,0,.55,0,width,.8,length);
    if(type==='bus'){
      s.box(body,0,1.35,0,2.4,1.7,length);s.box('#f1e9cf',0,2.98,0,2.45,.18,length+.1);
      for(const x of [-1.21,1.21])for(let z=-3.3;z<=3.4;z+=1.1)s.box(glass,x,1.9,z,.025,.86,.86);
      s.box(glass,0,1.85,length/2+.01,1.9,1.02,.04);
    }else if(type==='truck'){
      s.box('#f0e6cf',0,1.25,-.95,2.45,2.4,5.6);s.box(body,0,1.25,2.9,2.2,1.6,2.0);
      s.box(glass,0,1.95,3.91,1.8,.65,.03);
      for(let z=-3.4;z<=1.5;z+=.55)for(const x of [-1.23,1.23])s.box('#c4bda7',x,1.45,z,.025,1.95,.065);
    }else{
      const h=type==='van'?1.6:type==='suv'?1.2:.92;
      s.box(glass,0,1.35,-.25,1.85,h,length*.53);s.box(body,0,1.35+h,-.25,1.94,.14,length*.56);
      for(const x of [-.94,.94])for(const z of [-length*.27,.4,length*.22])s.box(body,x,1.35,z,.1,h,.1);
      if(type==='taxi')s.box('#fff4ce',0,2.48,-.25,.75,.32,.42);
      if(type==='van')s.box(body,0,1.6,-1.65,1.91,.8,1.5);
    }
    for(const x of [-width/2,width/2])for(const z of [-length*.31,length*.31])s.cyl(rubber,x,.40,z,.52,.52,.30,[0,0,Math.PI/2],12);
    for(const x of [-.7,.7]){s.box('#fff6b3',x,.85,length/2+.02,.45,.25,.06);s.box('#ba3533',x,.85,-length/2-.02,.45,.25,.06);}
    s.box('#d4d7cf',0,.55,length/2+.03,width*.8,.15,.08);
  }
  return s.done();
});}

export function vehicleOverviewGeometry(type){return cached('vehicle-overview-'+type,()=>{
  const s=shapeBuilder(),color=palette[vehicleTypes.indexOf(type)],length=type==='bus'?8.6:type==='truck'?8:type==='van'?5.9:type==='scooter'?1.5:4.8,width=type==='scooter'?.65:2.1;
  s.box(color,0,.4,0,width,1,length);
  s.box('#b2d8de',0,1.4,0,width*.8,type==='bus'||type==='truck'?1.5:.9,length*.55);
  if(type==='taxi')s.box('#fff4ce',0,2.3,0,.75,.32,.42);
  return s.done();
});}

export function personOverviewGeometry(outfit,index){return cached('person-overview-'+outfit+'-'+index,()=>{
  const s=shapeBuilder();s.box(palette[index%palette.length],0,.8,0,.75,.95,.45);
  s.ball(['#e7b892','#b98262','#835941'][index%3],0,2.03,0,.30);
  for(const side of [-1,1]){s.box('#586a69',side*.2,0,0,.16,.8,.20);s.box('#586a69',side*.46,.9,0,.16,.67,.16);}
  return s.done();
});}

export function treeGeometry(type){return cached('tree-'+type,()=>{
  const s=shapeBuilder(),wood='#82765b',leaf='#488064';
  if(type==='bamboo'){
    for(let i=0;i<5;i++){const x=Math.sin(i*2)*.22,z=Math.cos(i*2)*.22,h=1.2+i*.07;s.cyl('#79975a',x,0,z,.022,.029,h);
      for(let j=0;j<4;j++)s.frond(j%2?leaf:'#80a064',x,h-.13*j,z,i*2.399+j*1.7,.30,.035,.08);}
  }else if(type==='palm'){
    s.beam(wood,[0,0,0],[.10,1.1,0],.052);
    for(let i=0;i<9;i++){const a=i*Math.PI*2/9;s.frond(i%2?leaf:'#77a05f',.10,1.13,0,a,.52,.10,.18);}
    for(let i=0;i<3;i++)s.canopy('#9e8f5c',.1+Math.sin(i*2.1)*.055,1.08,Math.cos(i*2.1)*.055,.05);
  }else{
    s.cyl(wood,0,0,0,.038,.065,.7);
    if(type==='pine'){
      for(let i=0;i<4;i++){const r=.42-i*.077;s.cyl(i%2?'#6a955e':'#466f50',Math.sin(i*2)*.025,.27+i*.23,0,.025,r,.49,[0,0,0],12);}
    }else{
      const umbrella=type==='umbrella';
      for(let i=0;i<5;i++){
        const a=i*2.399,x=Math.sin(a)*.26,z=Math.cos(a)*.22,y=umbrella?.89+(i%2)*.055:.78+(i%3)*.12;
        s.beam(wood,[0,.46,0],[x,y-.07,z],.025);
        s.canopy(['#4d794b','#6b965b','#59874e'][i%3],x,y,z,umbrella?.31:.29,[1,umbrella?.65:1,1]);
      }
      if(type==='flowering')for(let i=0;i<9;i++){
        const a=i*2.399,r=.19+(i%3)*.11;s.canopy(i%2?'#df98ae':'#edbfbd',Math.sin(a)*r,.89+(i%3)*.12,Math.cos(a)*r,.10,[1,.5,1]);
      }
    }
  }
  const merged=s.done(),geometry=mergeVertices(merged);merged.dispose();return geometry;
});}

export function buildVegetation({parent,accepted}){
  const group=new THREE.Group();group.name='mixed-woodland';const counts={};
  for(const [ti,type] of treeTypes.entries()){
    const rows=accepted.filter((a,i)=>{const chosen=a[2]>2?i%2:i%6;return chosen===ti;});counts[type]=rows.length;
    const mesh=new THREE.InstancedMesh(treeGeometry(type),surface,rows.length),d=new THREE.Object3D();
    mesh.name='woodland-'+type;mesh.castShadow=true;mesh.receiveShadow=true;
    rows.forEach(([x,z,y,scale],i)=>{d.position.set(x,y,z);d.rotation.set(0,(i*2.399),0);d.scale.setScalar(scale*1.4);d.updateMatrix();mesh.setMatrixAt(i,d.matrix);});
    mesh.computeBoundingSphere();addSpatialInstances(group,mesh,4,overviewTree(type));
  }
  parent.add(group);return {group,counts};
}

export function buildTraffic({parent,routes,places,mobile=false,population,coverNetwork=false,localStreets=false}){
  const random=rng(829),prepared=routes.map((source,index)=>{
    const points=source.points||source,curve=routeSampler(points);
    const length=curve.getLength(),mid=curve.getPoint(.5);
    const width=source.width||.08,scale=localStreets?Math.min(.0045,width*.12):.008;
    const bounds=new THREE.Box3().setFromPoints(points),radius=bounds.getSize(new THREE.Vector3()).length()/2+.08;
    return {curve,length,mid,lanes:[[],[]],width,scale,index,owner:source.owner||null,center:bounds.getCenter(new THREE.Vector3()),radius,laneOffset:localStreets?width*.24:laneOffset,lastUpdate:0,nextUpdate:(index%17)*.03,stepDt:.05,inView:true};
  }).filter(r=>r.length>(coverNetwork?.10:.24));
  const group=new THREE.Group();group.name='regional-traffic';parent.add(group);
  const actors=[],batches=[],count=population??(mobile?504:1008),dummy=new THREE.Object3D();
  if(!prepared.length)return {group,update(){},count:0,types:vehicleTypes};
  const distributed=coverNetwork?prepared.flatMap(r=>Array.from({length:Math.min(12,Math.max(localStreets?2:1,Math.ceil(r.length/(localStreets?.35:1.5))))},()=>r)):spreadRoutes(prepared,places,count),coverage={};
  const districts=places.filter(p=>p.kind==='district');
  for(const p of districts)coverage[p.name]=0;
  for(let typeIndex=0;typeIndex<vehicleTypes.length;typeIndex++){
    const n=Math.ceil((distributed.length-typeIndex)/vehicleTypes.length),mesh=new THREE.InstancedMesh(vehicleGeometry(vehicleTypes[typeIndex]),surface,Math.max(0,n));
    mesh.userData.detail=mesh.geometry;mesh.userData.overview=vehicleOverviewGeometry(vehicleTypes[typeIndex]);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;group.add(mesh);batches.push(mesh);
    for(let i=0;i<n;i++){
      const route=distributed[i*7+typeIndex];if(!route)continue;
      const region=districts.reduce((best,p)=>!best||Math.hypot(p.x-route.mid.x,p.z-route.mid.z)<Math.hypot(best.x-route.mid.x,best.z-route.mid.z)?p:best,null);
      const lane=route.lanes[0].length<=route.lanes[1].length?0:1;
      if(route.lanes[lane].length>=Math.max(1,Math.floor(route.length/.15)))continue;
      if(region)coverage[region.name]++;
      const actor={mesh,index:i,...route,route,type:vehicleTypes[typeIndex],region:region?.name,scale:typeIndex===6?route.scale*1.25:route.scale,direction:lane===0?1:-1,distance:0,previousDistance:0,speed:0,cruise:(localStreets?.015:.035)+random()*.010,size:(typeIndex===3?8.6:typeIndex===5?8:typeIndex===4?5.9:4.8)*route.scale};
      route.lanes[lane].push(actor);actors.push(actor);
    }
  }
  // Dashed centerlines follow existing road polylines; no new geographic roads are invented.
  const positions=[];
  for(const route of (localStreets?[]:new Set(distributed)))for(let dist=.02;dist<Math.min(route.length,12);dist+=.10){
    const a=route.curve.getPoint(dist/route.length),b=route.curve.getPoint(Math.min(1,(dist+.045)/route.length));positions.push(a.x,a.y+.002,a.z,b.x,b.y+.002,b.z);
  }
  const roadLines=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3)),new THREE.LineBasicMaterial({color:'#fff4b2',transparent:true,opacity:.8}));group.add(roadLines);
  const active=[...new Set(actors.map(a=>a.route))],signals=[],furniture=[],networkSignals=[[],[]],signalKeys=new Set();
  roadJunctions(active);
  for(const route of active){
    for(const lane of route.lanes)lane.forEach((a,i)=>{a.distance=(i+.35)*route.length/lane.length;a.previousDistance=a.distance;});
    // A marked pedestrian crossing provides a shared red phase in both directions.
    const stops=route.junctions.filter(j=>j.distance>.12&&j.distance<route.length-.12);
    if(!stops.length&&!coverNetwork&&route.length>.45)stops.push({distance:route.length*.5,axis:0});
    route.stops=stops;route.controlled=stops.length>0;
    route.laneStops=[0,1].map(i=>stops.map(s=>({distance:(i===0?s.distance:route.length-s.distance)-(localStreets?.035:.065),axis:s.axis})));
    if(localStreets||coverNetwork){
      for(const stop of stops){
        const p=route.curve.getPoint(stop.distance/route.length),d=route.curve.getTangent(stop.distance/route.length),key=[Math.round(p.x/.02),Math.round(p.y/.02),Math.round(p.z/.02),stop.axis].join(':');
        if(signalKeys.has(key))continue;signalKeys.add(key);
        const scale=route.width/.08,angle=Math.atan2(d.x,d.z);
        for(const side of [-1,1])networkSignals[stop.axis].push({x:p.x+d.z*side*.048*scale+d.x*side*.042*scale,y:p.y,z:p.z-d.x*side*.048*scale+d.z*side*.042*scale,angle,scale});
      }
      continue;
    }
    for(const stop of stops){
    const p=route.curve.getPoint(stop.distance/route.length),d=route.curve.getTangent(stop.distance/route.length).normalize();
    const crossing=new THREE.Group();crossing.position.copy(p);crossing.rotation.y=Math.atan2(d.x,d.z);group.add(crossing);furniture.push(crossing);
    for(let j=-4;j<=4;j++){
      const stripe=new THREE.Mesh(new THREE.BoxGeometry(.007,.001,.045),new THREE.MeshBasicMaterial({color:'#f4f2e8'}));stripe.position.set(j*.008,.004,0);crossing.add(stripe);
    }
    for(const side of [-1,1]){
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.0015,.0015,.055,5),new THREE.MeshStandardMaterial({color:'#394b50'}));pole.position.set(side*.048,.027,side*.042);crossing.add(pole);
      const lamp=new THREE.Mesh(new THREE.BoxGeometry(.009,.012,.009),new THREE.MeshBasicMaterial({color:'#e8483b'}));lamp.position.set(side*.048,.060,side*.042);lamp.userData.axis=stop.axis;crossing.add(lamp);signals.push(lamp);
    }
    }
  }
  const baked=[[],[],[],[]];
  for(const crossing of furniture){crossing.updateWorldMatrix(true,true);crossing.traverse(o=>{if(o.isMesh){const k=signals.includes(o)?2+o.userData.axis:o.geometry.type==='CylinderGeometry'?1:0;baked[k].push(o.geometry.clone().applyMatrix4(o.matrixWorld));o.geometry.dispose();o.material.dispose();}});group.remove(crossing);}
  signals.length=0;
  baked.forEach((parts,i)=>{if(!parts.length)return;const mesh=new THREE.Mesh(mergeGeometries(parts),new THREE.MeshBasicMaterial({color:['#f4f2e8','#394b50','#ed4e43','#ed4e43'][i]}));parts.forEach(g=>g.dispose());group.add(mesh);if(i>=2){mesh.userData.axis=i-2;signals.push(mesh);}});
  networkSignals.forEach((rows,axis)=>{
    if(!rows.length)return;
    const poles=new THREE.InstancedMesh(new THREE.CylinderGeometry(.0015,.0015,.055,5).translate(0,.0275,0),new THREE.MeshStandardMaterial({color:'#394b50'}),rows.length);
    const lamps=new THREE.InstancedMesh(new THREE.BoxGeometry(.009,.012,.009).translate(0,.060,0),new THREE.MeshBasicMaterial({color:'#ed4e43'}),rows.length);lamps.userData.axis=axis;
    rows.forEach((r,i)=>{dummy.position.set(r.x,r.y,r.z);dummy.rotation.set(0,r.angle,0);dummy.scale.setScalar(r.scale);dummy.updateMatrix();poles.setMatrixAt(i,dummy.matrix);lamps.setMatrixAt(i,dummy.matrix);});
    for(const mesh of [poles,lamps]){mesh.computeBoundingSphere();addSpatialInstances(group,mesh,4);}
    signals.push(lamps);
  });
  function update(seconds){
    for(const r of active){
      r.inView=inCrowdView(r.center,r.radius);
      if(r.inView?seconds-r.lastUpdate<.05:seconds<r.nextUpdate)continue;
      const dt=Math.min(r.inView?.1:.55,Math.max(0,seconds-r.lastUpdate));
      for(const lane of r.lanes)for(const a of lane)a.previousDistance=a.distance;
      for(let i=0;i<2;i++)advanceLane(r.lanes[i],r.length,dt,seconds,r.laneStops[i],r.inView?.1:.55);
      r.lastUpdate=seconds;r.stepDt=dt;r.nextUpdate=seconds+.48+(r.index%7)*.009;
    }
    for(const lamp of signals)lamp.material.color.set(signalGreen(seconds,lamp.userData.axis)?'#53c98d':'#ed4e43');
    for(const mesh of batches){mesh.count=0;mesh.geometry=crowdDetail((localStreets?.0045:.008)*5,12)?mesh.userData.detail:mesh.userData.overview;}
    for(const r of active){if(!r.inView)continue;
    const alpha=Math.min(1,(seconds-r.lastUpdate)/(r.stepDt||.05));
    for(const lane of r.lanes)for(const a of lane){const direction=a.direction,travel=(a.distance-a.previousDistance+a.length)%a.length,distance=(a.previousDistance+travel*alpha)%a.length;let t=distance/a.length;if(direction<0)t=1-t;
      const pos=a.curve.getPoint(t),tangent=a.curve.getTangent(t);
      pos.x-=tangent.z*a.laneOffset*direction;pos.z+=tangent.x*a.laneOffset*direction;
      if(!inCrowdView(pos))continue;
      const fade=Math.min(1,a.distance/.035,(a.length-a.distance)/.035);
      dummy.position.copy(pos);dummy.rotation.set(0,Math.atan2(tangent.x*direction,tangent.z*direction),0);dummy.scale.setScalar(a.scale*Math.max(.001,fade));dummy.updateMatrix();a.mesh.setMatrixAt(a.mesh.count++,dummy.matrix);
    }}
    for(const mesh of batches)uploadVisibleInstances(mesh);
  }
  update(0);return {group,update,count:actors.length,types:vehicleTypes,coverage,signalHeads:networkSignals.flat().length,routeCount:active.length,routeCoverage:prepared.map(r=>({id:r.index,owner:r.owner,center:r.mid.toArray(),length:r.length,cars:r.lanes[0].length+r.lanes[1].length,types:[...new Set(r.lanes.flat().map(a=>a.type))]})),snapshot:()=>actors.map(a=>({distance:a.distance,length:a.length,speed:a.speed,direction:a.direction,type:a.type,route:a.route.index,position:a.curve.getPoint(a.direction>0?a.distance/a.length:1-a.distance/a.length).toArray()})),crossings:active.filter(r=>r.controlled).length};
}

export function personGeometry(outfit,index){return cached('person-'+outfit+'-'+index,()=>{
  const s=shapeBuilder(),c=({student:'#65939c',shopkeeper:'#a97b60',chef:'#c6d3c8',office:'#657584',senior:'#8b7d96',courier:'#bb9850',medic:'#79a99f',officer:'#567587'})[outfit]||palette[index%palette.length],skin=['#e7b892','#b98262','#835941'][index%3];
  s.box(c,0,.80,0,.70,.9,.42);s.ball(skin,0,2.03,0,.30,[.88,1,1]);
  s.box(skin,0,1.66,0,.22,.18,.22);
  if(['student','shopkeeper','chef','office','senior','courier','medic','officer'].includes(outfit)){
    for(const x of [-.095,.095])s.ball('#353c3b',x,2.06,.274,.025);
    s.ball(outfit==='senior'?'#b2b1a9':['#493d37','#635044','#393b3c'][index%3],0,2.24,-.05,.29,[1,.48,1]);
    if(outfit==='student'||outfit==='courier'){
      s.box(outfit==='student'?'#a36b61':'#937239',0,1.0,-.36,.52,.57,.25);
      for(const x of [-.23,.23])s.box('#56706e',x,1.14,.22,.07,.48,.025);
    }
    if(outfit==='shopkeeper'||outfit==='chef'){
      s.box(outfit==='chef'?'#748e81':'#487a6d',0,.72,.24,.51,.77,.03);
      s.box('#c1b690',0,.86,.263,.28,.17,.02);
    }
    if(outfit==='chef'){s.cyl('#c7d3c9',0,2.27,0,.28,.29,.18);for(const x of [-.15,0,.15])s.ball('#c7d3c9',x,2.49,0,.16);}
    if(outfit==='office'){s.box('#b8c4bb',0,1.36,.225,.18,.3,.02);s.box('#92705a',0,1.30,.246,.045,.32,.02);}
    if(outfit==='senior'){
      for(const x of [-.12,.12]){s.box('#4d6667',x,2.08,.275,.19,.13,.025);s.box('#a2beb9',x,2.08,.291,.14,.08,.008);}
      s.box('#4d6667',0,2.08,.28,.07,.025,.025);
    }
    if(outfit==='courier'||outfit==='officer'){
      const cap=outfit==='courier'?'#b99a4e':'#425e70';s.cyl(cap,0,2.24,0,.29,.3,.13);s.box(cap,0,2.26,.24,.42,.04,.25);
    }
    if(outfit==='medic'||outfit==='officer')s.box('#b6c9b5',.19,1.30,.225,.10,.15,.025);
  }
  if(outfit==='dress'||outfit==='cape')s.cyl(c,0,.47,0,.30,.63,1.05);
  if(outfit==='overalls'){s.box('#396e8e',0,.79,.225,.51,.53,.035);for(const x of [-.2,.2])s.box('#396e8e',x,1.30,.23,.09,.36,.035);}
  if(outfit==='explorer'){s.cyl('#d2b273',0,2.19,0,.52,.52,.09);s.cyl('#d2b273',0,2.26,0,.28,.32,.22);s.box('#787853',0,1.02,-.35,.54,.62,.27);}
  if(outfit==='wizard'){s.cyl('#615296',0,2.25,0,0,.48,.87);s.ball('#ecbf56',.10,2.54,.16,.055);}
  if(outfit==='astronaut'){s.ball('#e7ede6',0,2.08,0,.4);s.ball('#6c99aa',0,2.08,.24,.28,[1,.75,.45]);s.box('#e7ede6',0,1.1,-.37,.6,.63,.3);}
  if(outfit==='beret')s.ball('#b64143',-.10,2.28,0,.40,[1,.32,1]);
  if(outfit==='raincoat'){s.ball(c,0,2.13,-.06,.36);s.ball(skin,0,2.04,.19,.25,[.8,.9,.4]);s.box('#eee3d1',0,1.16,.235,.06,.45,.035);}
  if(outfit==='cape')s.box('#a45965',0,.69,-.33,.95,1.13,.09);
  return s.done();
});}

export function buildLandmarkLife({models,mobile=false}){
  const walkers=[],cars=[],groups=[],random=rng(419);
  for(const model of models){
    const {spec}=model;if(!['small-park','jieyang-tower'].includes(spec.id))continue;
    const group=new THREE.Group();group.name='street-life-'+spec.id;model.group.add(group);groups.push(group);
    const small=spec.id==='small-park',n=mobile?16:32;
    for(let i=0;i<n;i++){
      const root=new THREE.Group(),outfit=outfitTypes[i%outfitTypes.length];
      root.add(new THREE.Mesh(personGeometry(outfit,i%8),surface));
      const limbs=[];const limbMat=new THREE.MeshStandardMaterial({color:i%2?'#506477':'#725e59',roughness:.9});
      for(const [x,y,length] of [[-.2,.88,.8],[.2,.88,.8],[-.47,1.6,.67],[.47,1.6,.67]]){
        const pivot=new THREE.Group();pivot.position.set(x,y,0);const m=new THREE.Mesh(new THREE.CylinderGeometry(.10,.09,length,6),limbMat);m.position.y=-length/2;pivot.add(m);root.add(pivot);limbs.push(pivot);
      }
      group.add(root);root.scale.setScalar(1.15+(i%3)*.10);
      walkers.push({root,limbs,phase:i/n*Math.PI*2,speed:small?.045+random()*.025:.08+random()*.07,small,side:i%2?1:-1,offset:i*.618,index:i});
    }
    if(small){
      const ring=new THREE.Mesh(new THREE.RingGeometry(69,76,128),new THREE.MeshStandardMaterial({color:'#657978',roughness:.95}));ring.rotation.x=-Math.PI/2;ring.position.y=.15;group.add(ring);
      for(let i=0;i<96;i++){const a=i*Math.PI*2/96,mark=new THREE.Mesh(new THREE.BoxGeometry(.17,.025,1.7),new THREE.MeshStandardMaterial({color:'#ebe4c8'}));mark.position.set(Math.sin(a)*72.5,.18,Math.cos(a)*72.5);mark.rotation.y=a+Math.PI/2;group.add(mark);}
      for(let i=0;i<8;i++){
        const lane=new THREE.Group();lane.rotation.y=i*Math.PI/4;group.add(lane);
        const s=shapeBuilder();s.box('#c5ccbd',0,.12,45,6.8,.055,46);
        for(let x=-2.8;x<=2.8;x+=.8)s.box('#e8e5d7',x,.20,72.5,.45,.025,7);
        lane.add(new THREE.Mesh(s.done(),surface));
        for(let direction of [-1,1]){const vehicle=new THREE.Mesh(vehicleGeometry(vehicleTypes[(i+(direction===1?2:0))%7]),surface);vehicle.scale.setScalar(.65);vehicle.castShadow=true;group.add(vehicle);cars.push({vehicle,direction,phase:i*Math.PI/4,radius:direction>0?74.2:70.8});}
      }
      for(let i=0;i<4;i++){
        const a=i*Math.PI/2+.55,x=Math.sin(a)*19.2,z=Math.cos(a)*19.2;
        const s=shapeBuilder();s.cyl('#8a7963',x,0,z,.10,.10,4.9);s.cyl(palette[i],x,4.6,z,0,2.7,.8);s.box('#b29870',x,.75,z,3.4,1.2,1.8);group.add(new THREE.Mesh(s.done(),surface));
      }
    }
    for(let i=0;i<12;i++){
      const tree=new THREE.Mesh(treeGeometry(treeTypes[i%6]),surface);tree.scale.setScalar(5.5+(i%3));
      const a=(i+.5)*Math.PI*2/12;tree.position.set(small?Math.sin(a)*83:(i%2?52:-52),0,small?Math.cos(a)*83:-30+Math.floor(i/2)*11);group.add(tree);
    }
    const flowers=shapeBuilder();
    for(let i=0;i<50;i++){const a=i*2.399,r=small?20+(i%3)*.4:31;const x=small?Math.sin(a)*r:Math.sin(a)*37,z=small?Math.cos(a)*r:r;flowers.ball(palette[i%7],x,.4,z,.4);}
    group.add(new THREE.Mesh(flowers.done(),surface));
    group.traverse(o=>{if(o.isMesh){o.userData.landmarkId=spec.id;o.castShadow=true;o.receiveShadow=true;}});
  }
  function update(seconds){
    for(const w of walkers){const a=w.phase+seconds*w.speed;
      const pose=w.small?parkWalkerPose(seconds,w.phase,w.speed,w.index):null;
      if(w.small){const r=12+(Math.floor(w.offset)%4)*1.5,pa=pose.angle;w.root.position.set(Math.sin(pa)*r,.32,Math.cos(pa)*r);w.root.rotation.y=pose.moving?pa+Math.PI/2:pa+Math.PI;w.root.userData.activity=pose.state;}
      else {const z=Math.sin(a)*21;w.root.position.set(w.side*(37+Math.floor(w.offset)%3*3),.1+Math.abs(Math.sin(a*14))*.08,z);w.root.rotation.y=Math.cos(a)>0?0:Math.PI;}
      for(let i=0;i<w.limbs.length;i++){w.limbs[i].rotation.x=pose&&!pose.moving?0:Math.sin(seconds*4+w.phase)*(i%2?-.43:.43);w.limbs[i].rotation.z=0;}
      if(pose?.state==='wave'){w.limbs[3].rotation.z=-2.1+pose.gesture*.22;w.limbs[3].rotation.x=-.25;}
      if(pose?.state==='look')for(const i of [2,3])w.limbs[i].rotation.x=-1.1;
    }
    for(const c of cars){const a=c.phase+c.direction*seconds*.035;c.vehicle.position.set(Math.sin(a)*c.radius,.23,Math.cos(a)*c.radius);c.vehicle.rotation.y=a+(c.direction>0?Math.PI/2:-Math.PI/2);}
  }
  update(0);return {groups,update,people:walkers.length,vehicles:cars.length,vehicleNodes:cars.map(c=>c.vehicle),outfits:outfitTypes};
}

export function buildRockfields({parent,data,heightAt,waterAt}){
  const random=rng(711),t=data.terrain,[min,max]=t.bounds,rows=[];
  for(let n=0;n<5500&&rows.length<420;n++){
    const x=min[0]+random()*(max[0]-min[0]),z=min[1]+random()*(max[1]-min[1]),h=heightAt(x,z);
    const slope=Math.abs(heightAt(x+.20,z)-heightAt(x-.20,z))+Math.abs(heightAt(x,z+.20)-heightAt(x,z-.20));
    if(h<1.5||slope<.22||waterAt(x,z)!==null)continue;
    rows.push({x,z,h,s:.045+random()*.09});
  }
  const mesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:'#b2b0a1',roughness:1}),rows.length),d=new THREE.Object3D();
  rows.forEach((r,i)=>{d.position.set(r.x,r.h,r.z);d.scale.set(r.s*1.8,r.s*.6,r.s);d.rotation.set(.2,i*2.39,.2);d.updateMatrix();mesh.setMatrixAt(i,d.matrix);});
  mesh.computeBoundingSphere();parent.add(mesh);return {mesh,count:rows.length};
}

export function mountainPlaces(data){
  const t=data.terrain,[min,max]=t.bounds,meta=data.meta;
  const areas=[{id:'northern-ridge',name:'北部连峰',en:'Northern Ridges',bounds:[116.5,23.8,117.1,24.06]},
    {id:'western-valleys',name:'西部山谷',en:'Western Valleys',bounds:[115.75,23.45,116.25,23.95]},
    {id:'island-hills',name:'海岛山丘',en:'Island Hills',bounds:[116.97,23.4,117.12,23.48]}];
  return areas.map(area=>{
    let best=null;
    for(let j=2;j<t.nz-2;j++)for(let i=2;i<t.nx-2;i++){
      const x=min[0]+i/t.nx*(max[0]-min[0]),z=min[1]+j/t.nz*(max[1]-min[1]);
      const ll=[meta.origin[0]+x/meta.sx,meta.origin[1]-z/meta.sz],h=t.heights[j*(t.nx+1)+i];
      if(ll[0]<area.bounds[0]||ll[0]>area.bounds[2]||ll[1]<area.bounds[1]||ll[1]>area.bounds[3])continue;
      if(!best||h>best.h)best={ll,h};
    }
    if(!best)return null;
    return {...area,ll:best.ll,elevation:Math.round(best.h),kind:'mountain',major:true,pin:true,top:.25,zoom:area.id==='island-hills'?19:13,
      description:`高程网格约 ${Math.round(best.h)} 米。沿山脊展开的真实地形采样，视点名称为景观描述。`};
  }).filter(Boolean);
}
