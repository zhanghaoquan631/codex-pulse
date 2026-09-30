import * as THREE from 'three';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {createBuilder} from './living-world.mjs';
import {createMappedCrowd} from './mapped-crowd.mjs';
import {createSpatialIndex,distanceToSegment,seededRandom} from './world-layout.mjs';
import {prepareWaterContains} from './water-query.mjs';
import {terrainTriangle,terrainPaving} from './terrain-paving.mjs';
import {inRectangle} from './coast-layout.mjs';
import {createStreetLayout,footprintCorners,streetWidth} from './oldtown-layout.mjs';

export const eastshoreLocations={village:[118.12047243118286,24.42915274567433],beach:[118.1583,24.44600],coast:[118.1451004743576,24.436302952729406]};

export function createEastshoreDetail({scene,detail,terrain,heightAt,waterAt,toWorld,reducedMotion=false}){
  const group=new THREE.Group();group.name='曾厝垵黄厝环岛海岸';scene.add(group);
  const covers=(x,z)=>inRectangle(x,z,detail.bounds),dry=(x,z)=>covers(x,z)&&waterAt(x,z)===null,h=heightAt;
  const builder=createBuilder(group,{cellSize:1,tintInstances:true}),rng=seededRandom(75813),surfaces={},geometryGroups=new Map(),roads=createSpatialIndex(.05),roadways=createSpatialIndex(.05),buildingIndex=createSpatialIndex(.06),plants=createSpatialIndex(.06);
  const coverTests=detail.covers.map(c=>({...c,contains:prepareWaterContains(c.rings)}));
  const coverAt=(x,z,kinds)=>coverTests.some(c=>kinds.includes(c.kind)&&c.contains(x,z));
  const beachAt=(x,z)=>coverAt(x,z,['beach']),restricted=(x,z)=>coverAt(x,z,['military']);
  const anchors=Object.values(eastshoreLocations).map((ll,i)=>{const [x,z]=toWorld(...ll);return {x,z,radius:[.19,.23,.24][i],mobileSceneRadius:[.11,.13,.13][i],minHalfHeight:.18,viewDirection:[3,7,8],theme:['mapped-coastal-village','mapped-sand-and-dunes','mapped-seaside-promenade'][i]};});
  const pave=terrainPaving(terrain.terrain,h),walking=[],vehicleRoutes=[],bikeRoutes=[],forms=new Set(),treeTypes={},fixtures=[],plantLocations=[],infill=[];
  const isFoot=p=>['footway','path','steps','pedestrian','platform'].includes(p.kind);
  const isMajor=p=>['trunk','primary','secondary'].includes(p.kind);
  const pathWidth=p=>isFoot(p)||p.kind==='cycleway'?.0035:isMajor(p)?p.oneway?.009:.014:.0065;
  for(const path of detail.paths)if(!isFoot(path)&&path.kind!=='cycleway'&&!path.bridge){
    const width=pathWidth(path);
    for(let i=1;i<path.points.length;i++){const a=path.points[i-1],b=path.points[i];roadways.insert({a,b,width},Math.min(a[0],b[0])-.03,Math.min(a[1],b[1])-.03,Math.max(a[0],b[0])+.03,Math.max(a[1],b[1])+.03);}
  }
  const roadwayAt=(x,z,pad=0)=>roadways.at(x,z).some(p=>distanceToSegment(x,z,p.a,p.b)<p.width/2+pad);
  const add=(color,geo)=>{if(geo.index){const old=geo;geo=geo.toNonIndexed();old.dispose();}geo.deleteAttribute('uv');if(!geometryGroups.has(color))geometryGroups.set(color,[]);geometryGroups.get(color).push(geo);};
  function surface(color,rings,offset){
    const v=rings.map(r=>r.slice(0,-1).map(p=>new THREE.Vector2(...p))),points=v.flat(),out=surfaces[color]??=[];
    for(const face of THREE.ShapeUtils.triangulateShape(v[0],v.slice(1)))for(const value of terrainTriangle(terrain.terrain,h,face.map(i=>[points[i].x,points[i].y]),{offset}))out.push(value);
  }
  for(const rings of detail.land){
    const ring=rings[0],area=Math.abs(ring.slice(1).reduce((sum,p,i)=>sum+ring[i][0]*p[1]-p[0]*ring[i][1],0)/2);
    surface(area<.004?'#a8b0a2':'#a6b198',rings,0);
    if(area<.004){
      const xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]),x=(Math.min(...xs)+Math.max(...xs))/2,z=(Math.min(...zs)+Math.max(...zs))/2;
      if(dry(x,z))builder.part('ball','#a8b0a2',[x,h(x,z),z],[(Math.max(...xs)-Math.min(...xs))*.4,.009,(Math.max(...zs)-Math.min(...zs))*.4]);
    }
  }
  const palette={forest:'#74936f',wood:'#74936f',park:'#8da778',garden:'#9eae84',grass:'#a1b785',scrub:'#93a077',heath:'#a9ab82',residential:'#b4b7a4',commercial:'#b9b7ab',retail:'#b9b7ab',beach:'#ddd1b2',flowerbed:'#9fab85',pitch:'#8eab89',track:'#b6a08a'};
  for(const cover of detail.covers)if(palette[cover.kind])surface(palette[cover.kind],cover.rings,cover.kind==='beach'?.0007:.0003);
  for(const building of detail.buildings){const points=building.rings.flat(),xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);buildingIndex.insert({contains:prepareWaterContains(building.rings)},Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs));}
  const mappedAt=(x,z)=>buildingIndex.at(x,z).some(b=>b.contains(x,z));
  const layout=createStreetLayout(detail.paths,{land:(x,z)=>dry(x,z)&&!beachAt(x,z)&&!restricted(x,z)&&!coverAt(x,z,['forest','wood','park','garden','pitch','school','college']),heightAt:h,existingAt:mappedAt});
  const buildingAt=(x,z)=>mappedAt(x,z)||layout.buildingAt(x,z);
  // Only public street-front gaps receive illustrative infill, never the open beach or park.
  for(const path of detail.paths){
    if(path.bridge||!['minor','service','tertiary','footway'].includes(path.kind))continue;
    for(let i=1;i<path.points.length;i++){
      const a=path.points[i-1],b=path.points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.02)continue;
      for(let along=.012;along<length-.01&&infill.length<900;along+=.016)for(const side of [-1,1]){
        const w=.009+rng()*.007,d=.012+rng()*.014,offset=streetWidth(path)/2+.004+d/2;
        const box={x:a[0]+dx*along/length-dz/length*offset*side,z:a[1]+dz*along/length+dx/length*offset*side,w,d,angle:-Math.atan2(dz,dx)};
        if(!coverAt(box.x,box.z,['residential','commercial','retail'])||!layout.footprintFits(box))continue;
        const corners=footprintCorners(box);corners.push(corners[0]);layout.reserve(box);infill.push({rings:[corners],height:4+infill.length%4*2,illustrative:true,box});
      }
    }
  }
  // Courtyard blocks sit behind mapped frontages; these are scenery, not address data.
  const frontages=infill.slice();
  for(const frontage of frontages){
    const box=frontage.box;
    for(const depth of [1,2,3])for(const side of [-1,1]){
      const d=box.d*(.7+rng()*.6),w=box.w*(.85+rng()*.5),offset=(box.d+.006)*depth*side;
      const next={x:box.x+Math.sin(box.angle)*offset,z:box.z+Math.cos(box.angle)*offset,w,d,angle:box.angle};
      if(infill.length>=1700||!coverAt(next.x,next.z,['residential','commercial','retail'])||!layout.footprintFits(next))continue;
      const corners=footprintCorners(next);corners.push(corners[0]);layout.reserve(next);infill.push({rings:[corners],height:4+infill.length%5*2,illustrative:true,box:next});
    }
  }
  [...detail.buildings,...infill].forEach((building,index)=>{
    const ring=building.rings[0],xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]),x=(Math.min(...xs)+Math.max(...xs))/2,z=(Math.min(...zs)+Math.max(...zs))/2;
    const ground=building.illustrative?Math.max(...ring.map(p=>h(...p))):terrain.terraces[index].height,bottom=Math.min(ground,...ring.map(p=>h(...p))),height=Math.max(.008,Math.min(120,building.height)*.0015);
    const village=Math.hypot(x-anchors[0].x,z-anchors[0].z)<.55;
    const shape=new THREE.Shape(ring.map(([u,v])=>new THREE.Vector2(u,-v)));for(const hole of building.rings.slice(1))shape.holes.push(new THREE.Path(hole.map(([u,v])=>new THREE.Vector2(u,-v))));
    const body=new THREE.ExtrudeGeometry(shape,{depth:height+ground-bottom,bevelEnabled:false});body.rotateX(-Math.PI/2);body.translate(0,bottom,0);add(village?['#c2947f','#d4b89c','#c8c9ba'][index%3]:['#d3d6c9','#d5c6ae','#aabec0'][index%3],body);
    const roof=new THREE.ShapeGeometry(shape);roof.rotateX(-Math.PI/2);roof.translate(0,ground+height+.0002,0);add(village?'#a97661':'#879994',roof);
    forms.add(building.illustrative?village?'illustrative-village-house':'illustrative-guesthouse':ring.length>8?'mapped-irregular-block':'mapped-coastal-building');
    if(building.box&&index%3===0){
      const b=building.box;builder.part('roof',village?'#9f6655':'#bbbaa1',[x,ground+height+.002,z],[b.w*.73,.004,b.d*.73],[0,b.angle+Math.PI/4,0]);forms.add('pitched-roof-house');
    }
    for(let j=1;j<ring.length;j++){
      const a=ring[j-1],b=ring[j],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),angle=-Math.atan2(dz,dx);if(length<.002)continue;
      const at=(u,y)=>[a[0]+dx*u,ground+y,a[1]+dz*u];
      builder.bar('#ece3d0',at(0,height),at(1,height),.00045);
      const floors=Math.min(12,Math.max(1,Math.round(height/.005))),windows=Math.min(20,Math.floor(length/.004));
      for(let f=0;f<floors;f++)for(let w=0;w<windows;w++){
        const p=at((w+.5)/windows,(f+.55)*height/floors);builder.part('box','#648989',p,[.0024,height/floors*.46,.0005],[0,angle,0]);
        if((f+w+index)%7===0)builder.part('box','#e8c38b',p,[.0018,height/floors*.38,.0006],[0,angle,0],true);
      }
      if(building.illustrative&&length>.01){
        builder.part('box',village?['#ab7859','#628c7b','#a59c6b'][index%3]:'#779b99',at(.5,.004),[length*.6,.0015,.001],[0,angle,0]);
        if(index%2)builder.part('box','#d9c8a6',at(.5,.006),[length*.7,.0005,.003],[0,angle,0]);
        if(index%4===0)builder.part('box','#e0d8c3',at(.5,height*.6),[length*.6,.0006,.002],[0,angle,0]);
      }
    }
  });
  function rail(a,b,yAt,width){
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.001)return;
    for(const side of [-1,1])for(let d=0;d<length;d+=.006){const x=a[0]+dx*d/length-dz/length*width*.52*side,z=a[1]+dz*d/length+dx/length*width*.52*side,y=yAt(x,z);builder.part('cylinder','#97a39b',[x,y+.0014,z],[.00022,.0028,.00022]);const e=Math.min(length,d+.006),xx=a[0]+dx*e/length-dz/length*width*.52*side,zz=a[1]+dz*e/length+dx/length*width*.52*side;builder.bar('#c2c9b7',[x,y+.0028,z],[xx,yAt(xx,zz)+.0028,zz],.0002);}
  }
  const nearVisits=(x,z)=>anchors.some(p=>Math.hypot(p.x-x,p.z-z)<.85);
  let stairs=0,bridgeSegments=0;
  for(const path of detail.paths){
    const foot=isFoot(path),cycle=path.kind==='cycleway',major=isMajor(path),width=pathWidth(path);
    const yBridge=path.bridge?Math.max(h(...path.points[0]),h(...path.points.at(-1)),...path.points.map(p=>waterAt(...p)??0))+.008:null;
    const yAt=(x,z)=>yBridge??h(x,z)+(foot?.0022:.0013);
    for(let i=1;i<path.points.length;i++){
      const a=path.points[i-1],b=path.points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<1e-5)continue;
      if(!path.bridge&&![0,.25,.5,.75,1].every(u=>dry(a[0]+dx*u,a[1]+dz*u)))continue;
      if(path.bridge){
        const side=[-dz/length*width/2,dx/length*width/2],p=[[a[0]+side[0],a[1]+side[1]],[a[0]-side[0],a[1]-side[1]],[b[0]-side[0],b[1]-side[1]],[b[0]+side[0],b[1]+side[1]]],out=surfaces[foot?'#b9ab89':'#718581']??=[];
        for(const k of [0,1,2,0,2,3])out.push(p[k][0],yBridge,p[k][1]);rail(a,b,yAt,width);bridgeSegments++;
        for(let d=.015;d<length;d+=.045){const x=a[0]+dx*d/length,z=a[1]+dz*d/length,bottom=waterAt(x,z)??h(x,z);if(yBridge>bottom+.004)builder.part('cylinder','#a6b1a5',[x,(bottom+yBridge)/2,z],[.001,yBridge-bottom,.001]);}
      }else{
        pave(surfaces['#bdc4af']??=[],a,b,width+.0016,{offset:.001});pave(surfaces[foot?'#d1c9b2':cycle?'#bb9480':'#718581']??=[],a,b,width,{offset:foot?.0022:.0013});
      }
      roads.insert({a,b,width},Math.min(a[0],b[0])-.035,Math.min(a[1],b[1])-.035,Math.max(a[0],b[0])+.035,Math.max(a[1],b[1])+.035);
      if(foot&&!['no','private'].includes(path.foot)&&!['no','private'].includes(path.access))walking.push({points:[a,b],bridge:path.bridge,yBridge,name:path.name});
      if(cycle&&!path.bridge&&length>.05)bikeRoutes.push({points:[a,b],length});
      if(!foot&&!cycle&&!path.bridge&&path.kind!=='trunk'&&length>.025){
        for(const side of [-1,1]){
          const nx=-dz/length,nz=dx/length,offset=side*(width/2+.0025),aa=[a[0]+nx*offset,a[1]+nz*offset],bb=[b[0]+nx*offset,b[1]+nz*offset];
          const samples=Math.max(4,Math.ceil(length/.005));
          if(!Array.from({length:samples+1},(_,j)=>j/samples).every(u=>{const x=aa[0]+(bb[0]-aa[0])*u,z=aa[1]+(bb[1]-aa[1])*u;return dry(x,z)&&!buildingAt(x,z)&&!beachAt(x,z)&&!restricted(x,z)&&!roadwayAt(x,z,.0018);}))continue;
          pave(surfaces['#d1c9b2']??=[],aa,bb,.0035,{offset:.0022});walking.push({points:[aa,bb],name:path.name});
        }
      }
      if(path.kind==='steps'){
        stairs++;const n=Math.ceil(length/.0013);for(let j=0;j<n;j++){const x=a[0]+dx*(j+.5)/n,z=a[1]+dz*(j+.5)/n;builder.part('box','#e5ddc4',[x,yAt(x,z)+.00025,z],[width,.0005,.00035],[0,-Math.atan2(dz,dx)+Math.PI/2,0]);}rail(a,b,yAt,width);
      }
      if(major&&length>.04&&!path.bridge){
        for(let d=.008;d<length;d+=.018){const start=Math.max(0,d-.0035),end=Math.min(length,d+.0035);pave(surfaces['#e3e3c9']??=[],[a[0]+dx*start/length,a[1]+dz*start/length],[a[0]+dx*end/length,a[1]+dz*end/length],.00035,{offset:.0017});}
      }
    }
    if(['环岛南路','环岛东路'].includes(path.name)&&major&&!path.bridge){
      const cumulative=[0];for(let i=1;i<path.points.length;i++)cumulative.push(cumulative.at(-1)+Math.hypot(path.points[i][0]-path.points[i-1][0],path.points[i][1]-path.points[i-1][1]));
      if(cumulative.at(-1)>.10&&path.points.every(p=>dry(...p)))vehicleRoutes.push({points:path.points,cumulative,length:cumulative.at(-1),oneway:path.oneway});
    }
  }
  const roadNear=(x,z,pad=0)=>roads.at(x,z).some(p=>distanceToSegment(x,z,p.a,p.b)<p.width/2+pad);
  function plant(x,z,type){
    if(!dry(x,z)||beachAt(x,z)||restricted(x,z)||buildingAt(x,z)||roadNear(x,z,.004)||plants.at(x,z).some(p=>Math.hypot(x-p.x,z-p.z)<.020))return;
    const y=h(x,z),size=.02+rng()*.015;treeTypes[type]=(treeTypes[type]||0)+1;
    builder.part('cylinder','#8f8268',[x,y+size*.42,z],[.001,size*.84,.001]);
    if(type==='palm')for(let j=0;j<9;j++){const a=j*Math.PI*2/9;builder.part('leaf','#5b8d72',[x+Math.cos(a)*size*.12,y+size,z+Math.sin(a)*size*.12],[size*.4,.001,size*.10],[0,-a,.2]);}
    else if(type==='coastal-pine')for(let j=0;j<4;j++)builder.part('cone','#6e9776',[x,y+size*(.45+j*.17),z],[size*(.36-j*.05),size*.43,size*(.36-j*.05)]);
    else for(let j=0;j<4;j++){const a=j*2.4;builder.part('crown',type==='flowering'?'#c39ea9':['#60886b','#799965','#98ac79'][plantLocations.length%3],[x+Math.cos(a)*size*.2,y+size*(.75+j%2*.1),z+Math.sin(a)*size*.2],[size*.32,size*.27,size*.32]);}
    plantLocations.push([x,z]);plants.insert({x,z},x-.02,z-.02,x+.02,z+.02);
  }
  for(const path of detail.paths){if(path.bridge||!['secondary','tertiary','cycleway','footway'].includes(path.kind))continue;
    for(let i=1;i<path.points.length;i++){const a=path.points[i-1],b=path.points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);for(let d=.018;d<length;d+=.055)for(const side of [-1,1])plant(a[0]+dx*d/length-dz/length*.018*side,a[1]+dz*d/length+dx/length*.018*side,plantLocations.length%4===0?'flowering':'palm');}
  }
  for(let attempt=0;attempt<18000&&plantLocations.length<3800;attempt++){
    const x=detail.bounds[0]+rng()*(detail.bounds[2]-detail.bounds[0]),z=detail.bounds[1]+rng()*(detail.bounds[3]-detail.bounds[1]);
    if(coverAt(x,z,['forest','wood','park','grass','garden','scrub']))plant(x,z,attempt%3?'banyan':'coastal-pine');
  }
  // Coastal planting is illustrative where the source has no land-cover tag.
  let understory=0;
  for(const anchor of anchors)for(let attempt=0;attempt<7000;attempt++){
    const x=anchor.x+(rng()-.5)*1.4,z=anchor.z+(rng()-.5)*1.4;
    if(!dry(x,z)||beachAt(x,z)||restricted(x,z)||buildingAt(x,z)||roadNear(x,z,.010)||coverAt(x,z,['residential','commercial','retail','school','college','pitch','track','bus_station']))continue;
    const patch=Math.sin(x*31+Math.sin(z*9)*2)+Math.sin(z*29-x*5);
    if(patch<.05)continue;
    if(attempt%7===0)plant(x,z,attempt%5?'banyan':'palm');
    const y=h(x,z),size=.002+rng()*.004;
    builder.part('crown',['#6f9369','#8da777','#799c73'][attempt%3],[x,y+size*.25,z],[size,size*.5,size*.7]);
    if(attempt%4===0)builder.part('ball',attempt%8?'#cba9bc':'#d9c994',[x,y+size*.58,z],[size*.2,size*.12,size*.2]);
    understory++;
  }
  let flowers=0,rocks=0;
  for(const route of walking){
    if(route.bridge)continue;const [a,b]=route.points,dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
    for(let d=.012;d<length;d+=.04){
      const x=a[0]+dx*d/length-dz/length*.005,z=a[1]+dz*d/length+dx/length*.005;
      if(!dry(x,z)||buildingAt(x,z)||roadNear(x,z,.001)||restricted(x,z)||fixtures.some(p=>Math.hypot(p[0]-x,p[1]-z)<.03))continue;
      const y=h(x,z);builder.part('cylinder','#7d948b',[x,y+.004,z],[.00025,.008,.00025]);builder.part('ball','#f0ce9b',[x,y+.008,z],[.0008,.00055,.0008],[0,0,0],true);fixtures.push([x,z]);
      if(fixtures.length%3===0){builder.part('box','#9f8867',[x,y+.0012,z],[.004,.0007,.0015],[0,-Math.atan2(dz,dx),0]);}
      if(!beachAt(x,z))for(let j=0;j<5;j++){const a=j*1.26;builder.part('crown','#7f9c71',[x+Math.cos(a)*.003,y+.001,z+Math.sin(a)*.003],[.002,.001,.0018]);builder.part('ball',flowers%2?'#c993a7':'#d6c186',[x+Math.cos(a)*.003,y+.002,z+Math.sin(a)*.003],[.0006,.0005,.0006]);flowers++;}
    }
  }
  for(const beach of detail.covers.filter(c=>c.kind==='beach'))for(const ring of beach.rings){
    for(let i=0;i<ring.length;i+=2){const [x,z]=ring[i];if(!dry(x,z)||roadNear(x,z,.008))continue;const y=h(x,z),s=.004+rng()*.007;builder.part('ball','#aeb5a5',[x,y+s*.25,z],[s,s*.5,s*.6],[rng(),rng(),rng()]);rocks++;}
  }
  for(const [color,vertices] of Object.entries(surfaces)){
    if(!vertices.length)continue;const raw=new THREE.BufferGeometry();raw.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const geometry=mergeVertices(raw,1e-7);geometry.computeVertexNormals();raw.dispose();add(color,geometry);
  }
  for(const [color,geometries] of geometryGroups){const geometry=mergeGeometries(geometries),mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.87,side:THREE.DoubleSide}));mesh.castShadow=!Object.hasOwn(surfaces,color);mesh.receiveShadow=true;group.add(mesh);geometries.forEach(g=>g.dispose());}
  const instances=builder.finish(),crowd=createMappedCrowd({group,paths:walking.filter(p=>p.points.some(v=>nearVisits(...v))),heightAt:(x,z,r)=>r?.bridge?r.yBridge:h(x,z),valid:(x,z,r)=>covers(x,z)&&(r?.bridge||dry(x,z))&&!buildingAt(x,z)&&!restricted(x,z),limit:340,scale:.55,groundOffset:.0024,seed:513,reducedMotion});
  const vehicles=vehicleRoutes.flatMap((route,index)=>{const count=Math.min(16,Math.max(1,Math.floor(route.length/.09)));return Array.from({length:count},(_,j)=>({route,phase:(j+.2)/count,reverse:route.oneway===-1||!route.oneway&&j%2===1,bus:(j+index)%8===0}));}).slice(0,140);
  const carBody=new THREE.BoxGeometry(.0058,.002,.0028),carTop=new THREE.BoxGeometry(.003,.0014,.0025);carBody.translate(0,.0015,0);carTop.translate(0,.003,0);const carGeometry=mergeGeometries([carBody,carTop]);
  const cars=new THREE.InstancedMesh(carGeometry,new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.7}),vehicles.length);cars.castShadow=true;cars.frustumCulled=false;cars.userData.atlasLayer='traffic';group.add(cars);vehicles.forEach((v,i)=>cars.setColorAt(i,new THREE.Color(v.bus?'#589b99':['#ced7d1','#ca9671','#829eae','#d4bf7b'][i%4])));
  const bicycleRoutes=bikeRoutes.slice(0,32),bicycles=[];
  for(const [i,route] of bicycleRoutes.entries()){
    const bike=new THREE.Group(),frame=new THREE.Mesh(new THREE.BoxGeometry(.003,.0005,.0005),new THREE.MeshStandardMaterial({color:i%2?'#bca255':'#719da8'}));frame.position.y=.002;bike.add(frame);
    for(const x of [-.0018,.0018]){const wheel=new THREE.Mesh(new THREE.TorusGeometry(.0012,.0002,4,9),new THREE.MeshStandardMaterial({color:'#506361'}));wheel.position.set(x,.0013,0);bike.add(wheel);}
    const rider=new THREE.Mesh(new THREE.BoxGeometry(.0014,.0028,.0014),new THREE.MeshStandardMaterial({color:i%2?'#d1a082':'#718ea0'}));rider.position.set(0,.004,0);bike.add(rider);const head=new THREE.Mesh(new THREE.SphereGeometry(.0008,8,6),new THREE.MeshStandardMaterial({color:'#d0a988'}));head.position.set(.0003,.006,0);bike.add(head);bike.children.forEach(m=>m.castShadow=true);group.add(bike);bicycles.push({bike,route,phase:rng()});
  }
  const transform=new THREE.Object3D();let seconds=0,quality='balanced';
  function update(dt){
    seconds+=reducedMotion?0:dt;crowd.update(dt);
    vehicles.forEach((v,index)=>{
      const progress=(v.phase+seconds*.006/v.route.length)%1,t=v.reverse?1-progress:progress,d=t*v.route.length;let k=1;while(k<v.route.cumulative.length-1&&d>v.route.cumulative[k])k++;
      const a=v.route.points[k-1],b=v.route.points[k],length=v.route.cumulative[k]-v.route.cumulative[k-1],u=(d-v.route.cumulative[k-1])/(length||1),dx=(b[0]-a[0])/(length||1),dz=(b[1]-a[1])/(length||1),side=v.reverse?-1:1,x=a[0]+(b[0]-a[0])*u-dz*.003*side,z=a[1]+(b[1]-a[1])*u+dx*.003*side;
      const fade=Math.min(1,progress*30,(1-progress)*30);transform.position.set(x,h(x,z)+.0014,z);transform.rotation.set(0,-Math.atan2(dz,dx)+(v.reverse?Math.PI:0),0);transform.scale.set((v.bus?1.7:1)*fade,fade,fade);transform.updateMatrix();cars.setMatrixAt(index,transform.matrix);
    });cars.instanceMatrix.needsUpdate=true;
    for(const {bike,route,phase} of bicycles){const u=(phase+seconds*.003/route.length)%1,[a,b]=route.points,x=a[0]+(b[0]-a[0])*u,z=a[1]+(b[1]-a[1])*u;bike.position.set(x,h(x,z)+.0016,z);bike.rotation.y=-Math.atan2(b[1]-a[1],b[0]-a[0]);bike.scale.setScalar(Math.min(1,u*20,(1-u)*20));}
  }
  update(0);
  return {covers,anchors,update,setQuality:q=>{quality=q;},setLight(night){for(const [key,mat] of builder.materials)if(key.endsWith('-true'))mat.emissiveIntensity=night*1.7;},getState(){return {snapshot:detail.snapshot,buildings:detail.buildings.length,illustrativeBuildings:infill.length,forms:[...forms],paths:detail.paths.length,stairs,bridgeSegments,trees:plantLocations.length,treeTypes,understory,flowers,rocks,fixtures:fixtures.length,instances,cars:vehicles.length,bicycles:bicycles.length,quality,...crowd.getState()};}};
}
