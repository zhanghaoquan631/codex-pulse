import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {seededRandom,makeExclusions,chooseSiteAnchor,createSpatialIndex,distanceToSegment} from './world-layout.mjs';
import {terrainPaving} from './terrain-paving.mjs';
import {mappedRoadChains} from './mapped-road-chains.mjs';
import {makeWalkingLoop,sampleRoute} from './pedestrian-routes.mjs';
import {islandCoverage} from './island-layout.mjs';
import {createMappedBuildings} from './mapped-buildings.mjs';
import {createCityLife} from './city-life.mjs';

const up = new THREE.Vector3(0, 1, 0);

// Batch static details by material; near views retain detail without thousands of draw calls.
export function createBuilder(parent,{cellSize=Infinity,tintInstances=false}={}) {
  const groups = new Map(), dummy = new THREE.Object3D();
  const geometries = {
    box: new THREE.BoxGeometry(1,1,1), ball: new THREE.SphereGeometry(1,10,7),
    cone: new THREE.ConeGeometry(1,1,8), cylinder: new THREE.CylinderGeometry(1,1,1,10),
    roof: new THREE.ConeGeometry(1,1,4), leaf: new THREE.SphereGeometry(1,8,5),
    crown: new THREE.SphereGeometry(1,16,10),
    dome: new THREE.SphereGeometry(1,20,12,0,Math.PI*2,0,Math.PI/2),
    arch: new THREE.TorusGeometry(1,.13,5,14,Math.PI)
  };
  const materials = new Map();
  const overview={
    ball:new THREE.SphereGeometry(1,6,4),leaf:new THREE.SphereGeometry(1,6,4),
    crown:new THREE.SphereGeometry(1,8,5),cone:new THREE.ConeGeometry(1,1,6),
    cylinder:new THREE.CylinderGeometry(1,1,1,6)
  };
  const cellKey=(x,z)=>Number.isFinite(cellSize)?`-${Math.floor(x/cellSize)},${Math.floor(z/cellSize)}`:'';
  const material = (color,glow=false) => {
    const key = `${color}-${glow}`;
    if (!materials.has(key)) materials.set(key,new THREE.MeshStandardMaterial({color,roughness:.83,emissive:glow?color:0,emissiveIntensity:0}));
    return materials.get(key);
  };
  function part(type,color,p,s,rotation=[0,0,0],glow=false) {
    const tint=tintInstances&&!glow,key=`${type}-${tint?'tinted':color}-${glow}${cellKey(p[0],p[2])}`;
    if (!groups.has(key)) groups.set(key,{geo:geometries[type],mat:material(tint?'#ffffff':color,glow),items:[],colors:[]});
    dummy.position.set(...p);dummy.scale.set(...s);dummy.rotation.set(...rotation);dummy.updateMatrix();
    groups.get(key).items.push(dummy.matrix.clone());
    if(tint)groups.get(key).colors.push(color);
  }
  function bar(color,a,b,radius=.008) {
    const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),direction=vb.clone().sub(va);
    dummy.position.copy(va).add(vb).multiplyScalar(.5);dummy.scale.set(radius,direction.length(),radius);
    dummy.quaternion.setFromUnitVectors(up,direction.normalize());dummy.updateMatrix();
    const key=`cylinder-${tintInstances?'tinted':color}-false${cellKey(dummy.position.x,dummy.position.z)}`;
    if(!groups.has(key))groups.set(key,{geo:geometries.cylinder,mat:material(tintInstances?'#ffffff':color),items:[],colors:[]});
    groups.get(key).items.push(dummy.matrix.clone());
    if(tintInstances)groups.get(key).colors.push(color);
  }
  function finish() {
    let instances=0;
    for(const {geo,mat,items,colors} of groups.values()) {
      const mesh=new THREE.InstancedMesh(geo,mat,items.length);mesh.name='instanced-world-detail';
      const type=Object.keys(geometries).find(key=>geometries[key]===geo);
      if(overview[type]){
        let size=0;for(const matrix of items){const e=matrix.elements;size=Math.max(size,Math.hypot(e[0],e[1],e[2]),Math.hypot(e[4],e[5],e[6]),Math.hypot(e[8],e[9],e[10]));}
        mesh.userData.atlasLod={detail:geo,overview:overview[type],size};
      }
      items.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();parent.add(mesh);instances+=items.length;
      colors.forEach((value,i)=>mesh.setColorAt(i,new THREE.Color(value)));
    }
    return instances;
  }
  return {part,bar,finish,materials};
}

export function createLivingWorld({scene,data,places,heightAt,waterAt,reducedMotion=false,islandWorld=null,oldTownWorld=null,coastWorld=null,campusWorld=null,gardenWorld=null,eastshoreWorld=null,northshoreWorld=null}) {
  const rng=seededRandom(9824),exclusions=makeExclusions(data),anchors=[];
  const islandCovers=islandWorld?islandCoverage(data.meta):()=>false;
  const inDetailedArea=(x,z)=>islandCovers(x,z)||!!oldTownWorld?.covers(x,z)||!!coastWorld?.covers(x,z)||!!campusWorld?.covers(x,z)||!!gardenWorld?.covers(x,z)||!!eastshoreWorld?.covers(x,z)||!!northshoreWorld?.covers(x,z);
  places.forEach((p,i)=>anchors.push(chooseSiteAnchor(p,i,{places,waterAt,heightAt,exclusions,occupied:anchors})));
  if(islandWorld)Object.assign(anchors[0],{x:places[0].x,z:places[0].z,radius:1.05,theme:'heritage-island'});
  if(oldTownWorld)Object.assign(anchors[1],oldTownWorld.anchor);
  if(coastWorld)coastWorld.anchors.forEach((anchor,i)=>Object.assign(anchors[i+2],anchor));
  if(campusWorld)campusWorld.anchors.forEach((anchor,i)=>Object.assign(anchors[i+4],anchor));
  if(gardenWorld)Object.assign(anchors[6],gardenWorld.anchor);
  if(eastshoreWorld)eastshoreWorld.anchors.forEach((anchor,i)=>Object.assign(anchors[i+7],anchor));
  if(northshoreWorld)northshoreWorld.anchors.forEach((anchor,i)=>Object.assign(anchors[i+10],anchor));
  const forests=new THREE.Group();forests.name='厦门植被';forests.userData.atlasLayer='forest';scene.add(forests);
  const forestBuilder=createBuilder(forests,{cellSize:1,tintInstances:true}),sites=[],actors=[],traffic=[],obstacles=[],treeLocations=[];
  const pave=terrainPaving(data.terrain,heightAt),[[minX,minZ],[maxX,maxZ]]=data.terrain.bounds;
  const palette={wall:['#eee0c4','#d9d8c9','#cfb991'],roof:'#a55c4b',glass:'#648f9b',path:'#c3b59a',leaf:'#417a57',trunk:'#74533d'};
  const mat = (color) => new THREE.MeshStandardMaterial({color,roughness:.9,side:THREE.DoubleSide});
  const city=new THREE.Group();city.name='地图建筑轮廓';scene.add(city);
  const cityBuilder=createBuilder(city,{cellSize:1,tintInstances:true}),mappedCity=createMappedBuildings({group:city,builder:cityBuilder,records:data.mainlandBuildings||[],heightAt,waterAt,excluded:(x,z)=>inDetailedArea(x,z)&&!oldTownWorld?.covers(x,z)});
  const cityBuildings=0,cityAt=mappedCity.contains;
  cityBuilder.finish();
  const cityLife=createCityLife({scene,data,anchors,heightAt,waterAt,excluded:inDetailedArea,infillExcluded:(x,z)=>islandCovers(x,z)||!!oldTownWorld?.covers(x,z),createBuilder,reducedMotion});
  function tree(builder,x,z,size,type='banyan') {
    if(inDetailedArea(x,z))return;
    const y=heightAt(x,z)+.001;
    builder.part('cylinder',palette.trunk,[x,y+size*.4,z],[size*.035,size*.8,size*.035]);
    if(type==='palm')for(let j=0;j<7;j++){
      const angle=j*Math.PI*2/7;
      builder.part('leaf','#558657',[x+Math.cos(angle)*size*.2,y+size*.85,z+Math.sin(angle)*size*.2],[size*.37,size*.04,size*.115],[0,-angle,-.22]);
    }
    else if(type==='pine')for(let j=0;j<3;j++)builder.part('cone','#326550',[x,y+size*(.45+j*.2),z],[size*(.34-j*.065),size*.55,size*(.34-j*.065)]);
    else {
      const color=type==='flower'?'#d99daf':type==='banyan'?'#427959':'#72934f';
      for(let j=0;j<3;j++)builder.part('ball',color,[x+Math.cos(j*2.1)*size*.18,y+size*(.68+j*.06),z+Math.sin(j*2.1)*size*.18],[size*.31,size*.27,size*.32]);
    }
    treeLocations.push({x,z,size,type});
  }
  function meadow(builder,x,z,size) {
    if(inDetailedArea(x,z))return;
    const y=heightAt(x,z)+.001;
    builder.part('ball','#5f915c',[x,y+size*.13,z],[size*.44,size*.2,size*.35]);
    for(let j=0;j<3;j++)builder.part('ball',j%2?'#eed078':'#cd82a4',[x+Math.cos(j*2)*size*.3,y+size*.26,z+Math.sin(j*2)*size*.24],[size*.065,size*.04,size*.065]);
  }
  for(let i=0;i<65000&&treeLocations.length<3700;i++) {
    const x=minX+rng()*(maxX-minX),z=minZ+rng()*(maxZ-minZ),h=heightAt(x,z);
    if(waterAt(x,z)!==null||h<.05||exclusions.roadAt(x,z,.04)||exclusions.buildingAt(x,z,.06)||cityAt(x,z,.065)||!cityLife.freeAt(x,z))continue;
    if(anchors.some(a=>Math.hypot(a.x-x,a.z-z)<a.radius*1.2))continue;
    const slope=Math.abs(h-heightAt(x+.06,z))+Math.abs(h-heightAt(x,z+.06));
    if(slope>.25)continue;
    const type=h>.75?(rng()<.6?'pine':'banyan'):['banyan','banyan','palm','broadleaf','broadleaf','banyan','flower'][Math.floor(rng()*7)];
    tree(forestBuilder,x,z,.020+rng()*.020,type);
    if(i%4===0)meadow(forestBuilder,x+.03,z+.04,.024);
  }
  const forestInstances=forestBuilder.finish();

  function person(site,point,activity,index,path=null) {
    const scale=site.radius*.64,position=point.clone(),builder=new THREE.Group();
    const skin=new THREE.MeshStandardMaterial({color:['#d8a37d','#af795b','#e0b493'][index%3],roughness:1});
    const cloth=new THREE.MeshStandardMaterial({color:['#b55e64','#e2b84e','#608c97','#677b50','#7e729b','#e5dec8'][index%6],roughness:1});
    const dark=new THREE.MeshStandardMaterial({color:'#354448',roughness:1});
    function piece(geometry,material,p,parent=builder){const m=new THREE.Mesh(geometry,material);m.position.set(...p);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
    piece(new THREE.BoxGeometry(.06,.085,.038),cloth,[0,.1,0]);
    piece(new THREE.SphereGeometry(.026,8,6),skin,[0,.168,0]);
    piece(new THREE.SphereGeometry(.028,8,5,0,Math.PI*2,0,Math.PI*.53),dark,[0,.177,0]);
    const arms=[],legs=[];
    for(const side of [-1,1]){
      const arm=new THREE.Group();arm.position.set(side*.037,.13,0);builder.add(arm);piece(new THREE.BoxGeometry(.017,.075,.02),cloth,[0,-.032,0],arm);arms.push(arm);
      const leg=new THREE.Group();leg.position.set(side*.018,.061,0);builder.add(leg);piece(new THREE.BoxGeometry(.019,.061,.023),dark,[0,-.029,0],leg);legs.push(leg);
    }
    if(activity==='read'){piece(new THREE.BoxGeometry(.054,.007,.035),new THREE.MeshStandardMaterial({color:'#fbf2cd'}),[0,.11,.05]);}
    if(activity==='photo'){piece(new THREE.BoxGeometry(.031,.02,.018),dark,[0,.143,.04]);}
    builder.scale.setScalar(scale);builder.position.copy(position);builder.name=`厦门人物-${activity}`;site.group.add(builder);
    const actor={mesh:builder,arms,legs,activity,path,index,phase:index*1.73,scale,origin:position.clone(),site,progress:0};
    actors.push(actor);site.actors.push(actor);return actor;
  }

  anchors.forEach((anchor,index)=>{
    if(index===0&&islandWorld)return;
    if(index===1&&oldTownWorld)return;
    if((index===2||index===3)&&coastWorld)return;
    if((index===4||index===5)&&campusWorld)return;
    if(index===6&&gardenWorld)return;
    if(index>=7&&index<=9&&eastshoreWorld)return;
    if(index>=10&&northshoreWorld)return;
    const group=new THREE.Group();group.name=`生活街区-${anchor.theme}`;scene.add(group);
    const builder=createBuilder(group),r=anchor.radius,design=anchor.design;
    const site={...anchor,group,builder,actors:[],paths:[],buildings:0,lights:[],props:[],index};sites.push(site);
    const local=(x,z,dy=0)=>[anchor.x+x*r,heightAt(anchor.x+x*r,anchor.z+z*r)+.023+dy*r,anchor.z+z*r];
    const valid=(x,z,pad=0)=>waterAt(x,z)===null&&!exclusions.roadAt(x,z,pad)&&!exclusions.buildingAt(x,z,pad);
    const footprintFree=(x,z,w,d)=>[[0,0],[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].every(([dx,dz])=>valid(x+dx,z+dz,.012));
    function house([lx,lz,w,d,type],i){
      const [x,,z]=local(lx,lz),ww=w*r,dd=d*r;
      if(!footprintFree(x,z,ww,dd))return;
      const ground=Math.max(heightAt(x-ww/2,z-dd/2),heightAt(x+ww/2,z+dd/2),heightAt(x,z));
      const height=(type==='tower'?.65:type==='jimei'?.38:type==='kiosk'?.14:.27)*r,wall=palette.wall[i%3];
      const parts=[];
      function box(c,dx,y,dz,sx,sy,sz,glow=false){builder.part('box',c,[x+dx,ground+y,z+dz],[sx,sy,sz],[0,0,0],glow);}
      box('#b3b5a5',0,.015*r,0,ww+.04*r,.03*r,dd+.04*r);
      if(type==='arcade'){
        box(wall,0,height*.7,0,ww,height*.6,dd);
        for(let k=-1;k<=1;k++)box('#e9e6d5',k*ww*.38,height*.22,dd*.35,.025*r,height*.44,.025*r);
        box('#8c624d',0,.008*r,dd*.32,ww,.018*r,dd*.48);
      }else box(type==='glasshouse'?'#90b7b0':wall,0,height/2,0,ww,height,dd);
      if(type!=='tower'&&type!=='studio')builder.part('roof',palette.roof,[x,ground+height+.035*r,z],[ww*.8,.1*r,dd*.8],[0,Math.PI/4,0]);
      else box('#517275',0,height+.018*r,0,ww+.02*r,.035*r,dd+.02*r);
      for(let row=0;row<(type==='tower'?6:2);row++)for(let k=-1;k<=1;k++){
        box(palette.glass,k*ww*.28,height*(.36+row*(type==='tower'?.095:.31)),dd/2+.003*r,ww*.14,.042*r,.009*r);
        if((k+row+i)%3===0)box('#f5c675',k*ww*.28,height*(.36+row*(type==='tower'?.095:.31)),dd/2+.009*r,ww*.12,.034*r,.004*r,true);
      }
      box('#685b4a',0,height*.17,dd/2+.006*r,ww*.16,height*.31,.008*r);
      if(['arcade','village','studio','kiosk'].includes(type)){
        box(['#b55d54','#638e7c','#d0a653'][i%3],0,height*.4,dd*.65,ww*.88,.014*r,dd*.42);
        for(let k=-2;k<=2;k++)box('#eadfbd',k*ww*.14,height*.41,dd*.65,ww*.04,.01*r,dd*.4);
      }
      if(type==='jimei'){
        box('#e5c69c',0,height+.15*r,0,ww*.26,.3*r,dd*.4);
        builder.part('roof',palette.roof,[x,ground+height+.33*r,z],[ww*.25,.09*r,dd*.4],[0,Math.PI/4,0]);
      }
      const obstacle={x,z,halfX:ww/2+.03*r,halfZ:dd/2+.03*r};obstacles.push(obstacle);site.props.push(obstacle);site.buildings++;
    }
    design.buildings.forEach(house);
    const pathData=[],pathWidth=r*.13;
    const controlPoints=design.route.map(([x,z])=>new THREE.Vector3(anchor.x+x*r,0,anchor.z+z*r));
    const route=new THREE.CatmullRomCurve3(controlPoints,true,'centripetal');
    const points=route.getSpacedPoints(144).map(p=>{p.y=heightAt(p.x,p.z)+.029;return p;});
    const blocked=(p)=>!valid(p.x,p.z,.012)||site.props.some(b=>Math.abs(p.x-b.x)<b.halfX+.035*r&&Math.abs(p.z-b.z)<b.halfZ+.035*r);
    // Split on invalid segments so pedestrians never bridge across water or buildings.
    const runs=[];let run=[];
    for(let j=0;j<points.length;j++){
      const p=points[j],side=points[Math.min(j+1,points.length-1)].clone().sub(points[Math.max(0,j-1)]).normalize();
      const safe=!blocked(p)&&!blocked(p.clone().add(new THREE.Vector3(-side.z,0,side.x).multiplyScalar(pathWidth*.5)))&&!blocked(p.clone().add(new THREE.Vector3(side.z,0,-side.x).multiplyScalar(pathWidth*.5)));
      if(safe)run.push(p);else if(run.length){if(run.length>3)runs.push(run);run=[];}
    }
    if(run.length>3)runs.push(run);
    for(const path of runs){
      for(let j=1;j<path.length;j++)pave(pathData,[path[j-1].x,path[j-1].z],[path[j].x,path[j].z],pathWidth,{offset:.023});
      site.paths.push(path);
    }
    if(pathData.length){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pathData,3));geo.computeVertexNormals();const pavement=new THREE.Mesh(geo,mat(index===8?'#dac68f':'#cfbea1'));pavement.receiveShadow=true;group.add(pavement);}
    function pathDistance(x,z){let d=Infinity;for(const path of runs)for(let j=1;j<path.length;j++)d=Math.min(d,distanceToSegment(x,z,[path[j-1].x,path[j-1].z],[path[j].x,path[j].z]));return d;}
    for(let i=0;i<150;i++){
      const lx=(rng()-.5)*2.05,lz=(rng()-.5)*2.05,[x,,z]=local(lx,lz);
      if(!valid(x,z,.025)||pathDistance(x,z)<pathWidth*.85||site.props.some(b=>Math.abs(x-b.x)<b.halfX+.075*r&&Math.abs(z-b.z)<b.halfZ+.075*r))continue;
      const size=r*(.15+rng()*.14);
      if(i%3===0)tree(builder,x,z,size,design.tree==='mixed'?['banyan','flower','palm'][i%3]:design.tree);
      else meadow(builder,x,z,r*.11);
    }
    let actorIndex=index*31,walkingCount=0;
    for(const path of runs){
      const loop=makeWalkingLoop(path,r*.032,p=>!blocked(p));
      if(!loop)continue;
      const count=Math.min(8,Math.max(1,Math.floor(loop.length/(r*.5))));
      for(let i=0;i<count;i++){
        const progress=(i+.5)/count,point=sampleRoute(loop,progress*loop.length).point;
        point.y=heightAt(point.x,point.z)+.028;
        if(actors.some(a=>a.mesh.position.distanceTo(point)<Math.max(r,a.site.radius)*.065))continue;
        const actor=person(site,point,'walk',actorIndex++,loop);actor.progress=progress;actor.speed=r*(.075+(index%3)*.01);walkingCount++;
      }
    }
    // Coastal anchors can have no continuous land route after the real water
    // and road exclusions are applied. Keep them inhabited with separated,
    // non-overlapping visitors on the nearest valid ground.
    if(!walkingCount){
      for(let i=0;i<7;i++){
        const angle=i*2.39996323+index*.37,dist=r*(.2+.08*(i%3));
        const x=anchor.x+Math.cos(angle)*dist,z=anchor.z+Math.sin(angle)*dist;
        if(!valid(x,z,.018)||site.props.some(b=>Math.abs(x-b.x)<b.halfX+.05*r&&Math.abs(z-b.z)<b.halfZ+.05*r))continue;
        const activity=design.activity==='volleyball'?'stretch':design.activity==='cycle'?'photo':'greet';
        person(site,new THREE.Vector3(x,heightAt(x,z)+.028,z),activity,actorIndex++);
      }
    }
    for(let i=0;i<7;i++){
      const theta=i*2.4+index*.5,lx=Math.cos(theta)*.93,lz=Math.sin(theta)*.9,[x,y,z]=local(lx,lz);
      if(!valid(x,z,.04)||pathDistance(x,z)<pathWidth||site.props.some(b=>Math.abs(x-b.x)<b.halfX+.13*r&&Math.abs(z-b.z)<b.halfZ+.13*r))continue;
      if(i%2===0){
        builder.part('box','#876847',[x,y+.065*r,z],[.18*r,.021*r,.07*r]);
        builder.part('box','#876847',[x,y+.12*r,z-.035*r],[.18*r,.08*r,.014*r]);
        for(const dx of [-.065,.065])builder.part('box','#3e5b57',[x+dx*r,y+.03*r,z],[.016*r,.06*r,.065*r]);
        const actor=person(site,new THREE.Vector3(x,y+.045*r,z),['read','tea'].includes(design.activity)?design.activity:'sit',actorIndex++);actor.seated=true;
      }else {
        person(site,new THREE.Vector3(x,y,z),design.activity==='volleyball'?'stretch':design.activity==='cycle'?'photo':design.activity,actorIndex++);
      }
      site.props.push({x,z,halfX:.12*r,halfZ:.1*r});
    }
    for(let i=0;i<runs.length;i++){
      const p=runs[i][Math.floor(runs[i].length*.3)],x=p.x+pathWidth*.9,z=p.z;
      if(!valid(x,z,.012))continue;
      const y=heightAt(x,z)+.025;
      builder.part('cylinder','#4f6258',[x,y+.16*r,z],[.009*r,.32*r,.009*r]);
      builder.part('ball','#f4d090',[x,y+.33*r,z],[.035*r,.04*r,.035*r],[0,0,0],true);
    }
    site.instances=builder.finish();
  });

  const carGroup=new THREE.Group();carGroup.name='道路车流';carGroup.userData.atlasLayer='traffic';scene.add(carGroup);
  const carBody=new THREE.BoxGeometry(.016,.009,.009),carTop=new THREE.BoxGeometry(.009,.006,.008);carTop.translate(0,.007,0);
  const carGeo=mergeGeometries([carBody,carTop]);carGeo.translate(0,.009,0);
  const roads=mappedRoadChains(data.roads).filter(([kind,bridge,path])=>bridge&&['primary','secondary','trunk','motorway'].includes(kind)&&path.length>4);
  for(let i=0;i<roads.length&&traffic.length<80;i+=3){
    const [kind,bridge,raw]=roads[i];let path=raw.map(([x,z])=>new THREE.Vector3(x,0,z));
    if(path.some(p=>coastWorld?.covers(p.x,p.z)||campusWorld?.covers(p.x,p.z)||gardenWorld?.covers(p.x,p.z)||eastshoreWorld?.covers(p.x,p.z)||northshoreWorld?.covers(p.x,p.z)))continue;
    if(!bridge&&path.some(p=>waterAt(p.x,p.z)!==null))continue;
    const length=path.reduce((n,p,j)=>j?n+p.distanceTo(path[j-1]):0,0);if(length<.13)continue;
    const cumulative=[0];for(let j=1;j<path.length;j++)cumulative.push(cumulative.at(-1)+path[j].distanceTo(path[j-1]));
    for(let j=0;j<2;j++)traffic.push({path,cumulative,length,bridge,phase:j*.5,reverse:!!j,size:traffic.length%9===0?1.4:1,kind});
  }
  const cars=new THREE.InstancedMesh(carGeo,new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.7}),traffic.length);cars.castShadow=true;cars.receiveShadow=true;carGroup.add(cars);
  const temp=new THREE.Object3D(),carColor=new THREE.Color();traffic.forEach((_,i)=>cars.setColorAt(i,carColor.set(['#efc04f','#c46652','#789ca8','#e9e8d8','#776e8d'][i%5])));
  function samplePath(points,cumulative,distance){let i=1;while(i<cumulative.length-1&&distance>cumulative[i])i++;const t=THREE.MathUtils.clamp((distance-cumulative[i-1])/(cumulative[i]-cumulative[i-1]),0,1);return {point:points[i-1].clone().lerp(points[i],t),direction:points[i].clone().sub(points[i-1]).normalize()};}
  let seconds=0,currentQuality='balanced';
  function update(dt,target){
    islandWorld?.update(dt,target);
    oldTownWorld?.update(dt,target);
    coastWorld?.update(dt,target);
    campusWorld?.update(dt,target);
    gardenWorld?.update(dt,target);
    eastshoreWorld?.update(dt,target);
    northshoreWorld?.update(dt,target);
    cityLife.update(dt,target);
    seconds+=reducedMotion?0:dt;
    // Keep the full living layer present in the atlas view. Details are batched,
    // while the larger radius avoids empty-looking districts during panning.
    for(const site of sites)site.group.visible=Math.hypot(target.x-site.x,target.z-site.z)<24;
    for(const actor of actors){
      if(!actor.site.group.visible)continue;
      const t=seconds,cycle=t*5+actor.phase;
      if(actor.path){
        const progress=(actor.progress+(reducedMotion?0:dt)*actor.speed/actor.path.length)%1;
        const {point,direction}=sampleRoute(actor.path,progress*actor.path.length);
        point.y=heightAt(point.x,point.z)+.028;
        const occupied=actors.some(other=>other!==actor&&Math.abs(point.x-other.mesh.position.x)<Math.max(actor.site.radius,other.site.radius)*.058&&point.distanceTo(other.mesh.position)<Math.max(actor.site.radius,other.site.radius)*.058);
        const moving=!occupied&&waterAt(point.x,point.z)===null;
        if(moving){actor.progress=progress;actor.mesh.position.copy(point);actor.mesh.rotation.y=Math.atan2(direction.x,direction.z);}
        const swing=moving?Math.sin(cycle):0;
        actor.legs[0].rotation.x=swing*.48;actor.legs[1].rotation.x=-swing*.48;actor.arms[0].rotation.x=-swing*.42;actor.arms[1].rotation.x=swing*.42;
      }else if(actor.seated){actor.legs.forEach(l=>l.rotation.x=-1.35);actor.arms.forEach(l=>l.rotation.x=-.7+Math.sin(cycle*.3)*.1);}
      else if(['greet','music','market'].includes(actor.activity)){actor.arms[0].rotation.z=1.75+Math.sin(cycle*.4)*.24;actor.arms[1].rotation.x=Math.sin(cycle*.3)*.2;}
      else if(actor.activity==='photo'){actor.arms.forEach(l=>l.rotation.x=-1.25);actor.mesh.rotation.y=Math.sin(cycle*.13)*.4;}
      else if(actor.activity==='stretch'||actor.activity==='fitness'){actor.arms[0].rotation.z=.8+Math.sin(cycle*.3)*.8;actor.arms[1].rotation.z=-actor.arms[0].rotation.z;}
      else{actor.arms[0].rotation.x=Math.sin(cycle*.2)*.4;actor.mesh.rotation.y=Math.sin(cycle*.1)*.22;}
    }
    traffic.forEach((car,i)=>{
      const travel=(seconds*.018/car.length+car.phase)%2,u=travel<=1?travel:2-travel,sign=travel<=1?1:-1;
      const {point,direction}=samplePath(car.path,car.cumulative,u*car.length),offset=.005*sign;
      point.x+=-direction.z*offset;point.z+=direction.x*offset;
      point.y=Math.max(heightAt(point.x,point.z),car.bridge?(waterAt(point.x,point.z)??0):0)+(car.bridge?.045:.025);
      temp.position.copy(point);temp.rotation.set(0,-Math.atan2(direction.z*sign,direction.x*sign),0);temp.scale.set(car.size,1,1);temp.updateMatrix();cars.setMatrixAt(i,temp.matrix);
    });
    cars.instanceMatrix.needsUpdate=true;
  }
  function setLight(night){islandWorld?.setLight(night);oldTownWorld?.setLight(night);coastWorld?.setLight(night);campusWorld?.setLight(night);gardenWorld?.setLight(night);eastshoreWorld?.setLight(night);northshoreWorld?.setLight(night);for(const site of sites)for(const [key,material] of site.builder.materials)if(key.endsWith('-true'))material.emissiveIntensity=night*2.2;}
  function getState(){
    let invalidPeople=0,overlaps=0;
    for(const actor of actors)if(waterAt(actor.mesh.position.x,actor.mesh.position.z)!==null)invalidPeople++;
    for(const site of sites)for(let i=0;i<site.actors.length;i++)for(let j=i+1;j<site.actors.length;j++)if(site.actors[i].mesh.position.distanceTo(site.actors[j].mesh.position)<site.radius*.04)overlaps++;
    const island=islandWorld?.getState(),oldTown=oldTownWorld?.getState(),coast=coastWorld?.getState(),campus=campusWorld?.getState(),garden=gardenWorld?.getState(),eastshore=eastshoreWorld?.getState(),northshore=northshoreWorld?.getState(),scenes=sites.map(s=>({name:places[s.index].name,theme:s.theme,x:s.x,z:s.z,radius:s.radius,buildings:s.buildings,people:s.actors.length,paths:s.paths.length,instances:s.instances}));
    if(northshore)for(const i of [11,10]){const r=northshore.regions[i-10];scenes.unshift({name:places[i].name,theme:anchors[i].theme,x:anchors[i].x,z:anchors[i].z,radius:anchors[i].radius,buildings:r.buildings,people:r.people,paths:r.paths,instances:r.instances});}
    if(eastshore)for(const i of [9,8,7])scenes.unshift({name:places[i].name,theme:anchors[i].theme,x:anchors[i].x,z:anchors[i].z,radius:anchors[i].radius,buildings:eastshore.buildings+eastshore.illustrativeBuildings,people:eastshore.people,paths:eastshore.paths,instances:eastshore.instances});
    if(garden)scenes.unshift({name:places[6].name,theme:anchors[6].theme,x:anchors[6].x,z:anchors[6].z,radius:anchors[6].radius,buildings:garden.buildings,people:garden.people,paths:garden.paths,instances:garden.instances});
    if(campus)for(const i of [5,4])scenes.unshift({name:places[i].name,theme:anchors[i].theme,x:anchors[i].x,z:anchors[i].z,radius:anchors[i].radius,buildings:campus.buildings,people:campus.people,paths:campus.paths,instances:campus.instances});
    if(coast)for(const i of [3,2])scenes.unshift({name:places[i].name,theme:anchors[i].theme,x:anchors[i].x,z:anchors[i].z,radius:anchors[i].radius,buildings:coast.buildings,people:coast.people,paths:coast.paths,instances:coast.instances});
    if(oldTown)scenes.unshift({name:places[1].name,theme:'mapped-oldtown',x:anchors[1].x,z:anchors[1].z,radius:anchors[1].radius,buildings:oldTown.buildings,people:oldTown.people,paths:oldTown.paths,instances:oldTown.instances});
    if(island)scenes.unshift({name:places[0].name,theme:'heritage-island',x:anchors[0].x,z:anchors[0].z,radius:anchors[0].radius,buildings:island.houses+island.landmarks.length,people:island.people,paths:island.paths,instances:island.instances});
    const detailed=[island,oldTown,coast,campus,garden,eastshore,northshore].filter(Boolean),total=key=>detailed.reduce((sum,p)=>sum+(p[key]||0),0);
    const urban=cityLife.getState();
    return {seconds,trees:treeLocations.length+total('trees'),forestInstances,illustrativeBuildings:cityBuildings+urban.infill,mappedBackgroundBuildings:mappedCity.count,cars:traffic.length+total('cars')+urban.cars,people:actors.length+total('people')+urban.people,invalidPeople:invalidPeople+total('invalidPeople'),overlaps:overlaps+total('overlaps'),quality:currentQuality,island,oldTown,coast,campus,garden,eastshore,northshore,cityLife:urban,scenes,motion:[...actors.filter(a=>a.path).map(a=>a.mesh.position.toArray()),...detailed.flatMap(p=>p.motion||[])].slice(0,8)};
  }
  update(0,new THREE.Vector3());
  return {anchors,update,setLight,getState,cityAudit:cityLife.audit,cityState:cityLife.getState,cityViews:cityLife.views,setQuality(q){currentQuality=q;forests.visible=true;islandWorld?.setQuality(q);oldTownWorld?.setQuality(q);coastWorld?.setQuality(q);campusWorld?.setQuality(q);gardenWorld?.setQuality(q);eastshoreWorld?.setQuality(q);northshoreWorld?.setQuality(q);}};
}
