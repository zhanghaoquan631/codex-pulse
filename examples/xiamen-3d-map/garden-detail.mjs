import * as THREE from 'three';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {createBuilder} from './living-world.mjs';
import {createMappedCrowd} from './mapped-crowd.mjs';
import {createSpatialIndex,distanceToSegment,seededRandom} from './world-layout.mjs';
import {prepareWaterContains} from './water-query.mjs';
import {terrainTriangle,terrainPaving} from './terrain-paving.mjs';
import {inRectangle} from './coast-layout.mjs';

const descriptions={
  '万石湖':['lake','湖岸步道、棕榈与水面组成万石涵翠的核心景观。',.18],
  '松杉园':['conifer','针叶树冠与林下山路。',.08],
  '竹类植物区':['bamboo','细密竹竿、成簇竹叶与林间步道。',.06],
  '棕榈植物区':['palm','位于湖畔的棕榈专类区，树冠与水岸相映。',.08],
  '奇趣植物区':['cycad','专类植物与展馆周边的游览空间。',.08],
  '南洋杉疏林草坪':['araucaria','高耸南洋杉与疏林草坪形成开阔的湖畔空间。',.085],
  '苏铁园':['cycad','低矮羽状叶冠与林下石景。',.075],
  '雨林世界':['rainforest','多层树冠、蕨类和藤蔓表现湿润雨林环境。',.14],
  '蔷薇园':['flowers','花灌木与园路相接的近景。花色为示意，不表示当日花期。',.09],
  '多肉植物区':['succulent','沙生植物、柱状仙人掌与莲座状多肉形成干旱景观。',.15],
  '藤本植物区':['vine','攀援植物与山林园路。',.085],
  '姜目植物园':['ginger','宽叶草本与花序丰富林下层次。',.14],
  '西山园':['forest','山地步道与林木。',.14],
  '花卉园':['flowers','依山展开的花草近景。',.15]
};
export function gardenStops(detail){return detail.pois.filter(p=>descriptions[p.name]).map(p=>({
  ...p,theme:descriptions[p.name][0],description:descriptions[p.name][1],radius:descriptions[p.name][2],
  tip:'坐标与园路来自2026-09-13地图快照，植物布局为艺术化示意。入口、围挡和通行条件须现场核对。'
}));}

export function createGardenDetail({scene,detail,heightAt,waterAt,terrain,reducedMotion=false}){
  const group=new THREE.Group();group.name='万石山地植物园';scene.add(group);
  const covers=(x,z)=>inRectangle(x,z,detail.bounds),dry=(x,z)=>covers(x,z)&&waterAt(x,z)===null;
  const builder=createBuilder(group,{tintInstances:true}),rng=seededRandom(5729),surfaces={},geometryGroups=new Map(),roadIndex=createSpatialIndex(.04),buildingIndex=createSpatialIndex(.04),plantIndex=createSpatialIndex(.025);
  const stops=gardenStops(detail),h=heightAt,pave=terrainPaving(terrain.terrain,h),walking=[],trees=[],fixtures=[],types={},forms=new Set();
  const add=(color,geo)=>{if(geo.index){const old=geo;geo=geo.toNonIndexed();old.dispose();}geo.deleteAttribute('uv');if(!geometryGroups.has(color))geometryGroups.set(color,[]);geometryGroups.get(color).push(geo);};
  function surface(color,rings,offset){
    const v=rings.map(r=>r.slice(0,-1).map(p=>new THREE.Vector2(...p))),points=v.flat(),out=surfaces[color]??=[];
    for(const face of THREE.ShapeUtils.triangulateShape(v[0],v.slice(1)))for(const value of terrainTriangle(terrain.terrain,h,face.map(i=>[points[i].x,points[i].y]),{offset}))out.push(value);
  }
  for(const rings of detail.land)surface('#7f9e72',rings,0);
  const coverTests=detail.covers.map(c=>({...c,contains:prepareWaterContains(c.rings)}));
  const coverAt=(x,z,kinds)=>coverTests.some(c=>kinds.includes(c.kind)&&c.contains(x,z));
  const palette={forest:'#6c8f68',garden:'#9bad81',park:'#84a078',residential:'#b6bba4'};
  for(const cover of detail.covers)if(palette[cover.kind])surface(palette[cover.kind],cover.rings,cover.kind==='garden'?.0005:cover.kind==='park'?.0004:.0002);
  const themeAt=(x,z)=>{let chosen=null,score=1;for(const p of stops){if(p.theme==='lake')continue;const d=Math.hypot(x-p.point[0],z-p.point[1])/p.radius;if(d<score){score=d;chosen=p;}}return chosen?.theme||'forest';};
  for(const building of detail.buildings){const points=building.rings.flat(),xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);buildingIndex.insert({contains:prepareWaterContains(building.rings)},Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs));}
  const buildingAt=(x,z)=>buildingIndex.at(x,z).some(b=>b.contains(x,z));
  detail.buildings.forEach((building,index)=>{
    const ring=building.rings[0],xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]),x=(Math.min(...xs)+Math.max(...xs))/2,z=(Math.min(...zs)+Math.max(...zs))/2;
    const ground=terrain.terraces[index].height,bottom=Math.min(ground,...ring.map(p=>h(...p))),height=Math.max(.01,building.height*.0015);
    const shape=new THREE.Shape(ring.map(([u,v])=>new THREE.Vector2(u,-v)));
    for(const hole of building.rings.slice(1))shape.holes.push(new THREE.Path(hole.map(([u,v])=>new THREE.Vector2(u,-v))));
    const body=new THREE.ExtrudeGeometry(shape,{depth:height+ground-bottom,bevelEnabled:false});body.rotateX(-Math.PI/2);body.translate(0,bottom,0);add('#d2cbb3',body);
    const roof=new THREE.ShapeGeometry(shape);roof.rotateX(-Math.PI/2);roof.translate(0,ground+height+.0002,0);add('#627f74',roof);forms.add(ring.length>6?'mapped-garden-hall':'mapped-pavilion');
    for(let j=1;j<ring.length;j++){
      const a=ring[j-1],b=ring[j],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),angle=-Math.atan2(dz,dx);if(length<.001)continue;
      builder.bar('#eee7cf',[a[0],ground+height,a[1]],[b[0],ground+height,b[1]],.0005);
      for(let d=.002;d<length;d+=.004){const u=d/length;builder.part('box','#659591',[a[0]+dx*u,ground+height*.53,a[1]+dz*u],[.002,height*.5,.0006],[0,angle,0]);}
    }
    if(themeAt(x,z)==='succulent'){
      const w=Math.max(...xs)-Math.min(...xs),d=Math.max(...zs)-Math.min(...zs);
      if(w>.01&&d>.01){builder.part('dome','#8bb9b2',[x,ground+height,z],[w*.45,Math.min(w,d)*.28,d*.45]);forms.add('illustrative-conservatory-roof');}
    }
  });
  let stairs=0,bridges=0;
  for(const path of detail.paths){
    const foot=['path','footway','pedestrian','steps','cycleway'].includes(path.kind),width=foot?(path.kind==='pedestrian'?.0045:.0032):.006;
    const bridgeY=path.bridge?Math.max(h(...path.points[0]),h(...path.points.at(-1)),...path.points.map(p=>waterAt(...p)??-1))+.002:null;
    for(let i=1;i<path.points.length;i++){
      const a=path.points[i-1],b=path.points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<1e-5)continue;
      if(!path.bridge&&![0,.25,.5,.75,1].every(u=>dry(a[0]+dx*u,a[1]+dz*u)))continue;
      if(path.bridge){
        const y=bridgeY,side=[-dz/length*width/2,dx/length*width/2],corners=[[a[0]+side[0],a[1]+side[1]],[a[0]-side[0],a[1]-side[1]],[b[0]-side[0],b[1]-side[1]],[b[0]+side[0],b[1]+side[1]]];
        const v=surfaces['#c9c3a8']??=[];for(const k of [0,1,2,0,2,3])v.push(corners[k][0],y,corners[k][1]);
        for(const side of [-1,1]){const aa=[a[0]-dz/length*width*.52*side,y+.002,a[1]+dx/length*width*.52*side],bb=[b[0]-dz/length*width*.52*side,y+.002,b[1]+dx/length*width*.52*side];builder.bar('#c8cfbd',aa,bb,.00025);}
        bridges++;
      }else{
        pave(surfaces['#657f63']??=[],a,b,width+.0014,{offset:.001});pave(surfaces[foot?'#cdc8ae':'#7e8d87']??=[],a,b,width,{offset:.0013});
      }
      roadIndex.insert({a,b,width},Math.min(a[0],b[0])-.015,Math.min(a[1],b[1])-.015,Math.max(a[0],b[0])+.015,Math.max(a[1],b[1])+.015);
      if(foot&&path.foot!=='no')walking.push({points:[a,b],name:path.name,kind:path.kind,bridge:path.bridge,bridgeY});
      if(path.kind==='steps'){
        stairs++;const n=Math.ceil(length/.0013);
        for(let j=0;j<n;j++){const x=a[0]+dx*(j+.5)/n,z=a[1]+dz*(j+.5)/n;builder.part('box','#e5ddc4',[x,h(x,z)+.0017,z],[width,.0004,.00035],[0,-Math.atan2(dz,dx)+Math.PI/2,0]);}
      }
    }
  }
  const roadNear=(x,z,pad=0)=>roadIndex.at(x,z).some(p=>distanceToSegment(x,z,p.a,p.b)<p.width/2+pad);
  const clear=(x,z,pad=.003)=>dry(x,z)&&!buildingAt(x,z)&&!roadNear(x,z,pad);
  function plant(x,z,theme){
    if(!clear(x,z)||plantIndex.at(x,z).some(p=>Math.hypot(p.x-x,p.z-z)<.012))return false;
    const y=h(x,z),size=.013+rng()*.013,a=rng()*6.28;types[theme]=(types[theme]||0)+1;
    if(theme==='succulent'){
      if(types[theme]%3===0){builder.part('ball','#80a080',[x,y+.0025,z],[.003,.003,.003]);}
      else if(types[theme]%3===1){builder.part('cylinder','#608666',[x,y+.006,z],[.0017,.012,.0017]);for(const side of [-1,1]){builder.bar('#608666',[x,y+.005,z],[x+side*.003,y+.005,z],.0008);builder.part('cylinder','#608666',[x+side*.003,y+.007,z],[.0009,.004,.0009]);}}
      else for(let j=0;j<9;j++){const angle=j*.7;builder.part('leaf','#8da59d',[x+Math.cos(angle)*.002,y+.0015,z+Math.sin(angle)*.002],[.0035,.00055,.0012],[0,-angle,.18]);}
      if(types[theme]%6===0)builder.part('ball','#d3aa9d',[x,y+.003,z],[.0006,.0009,.0006]);
    }else if(theme==='bamboo'){
      for(let j=0;j<4;j++){const u=Math.cos(j*2.4)*.002,v=Math.sin(j*2.4)*.002,height=size*(.8+j*.12);builder.part('cylinder','#8b9f56',[x+u,y+height/2,z+v],[.00035,height,.00035]);for(let k=0;k<3;k++)builder.part('leaf','#739056',[x+u,y+height*(.65+k*.12),z+v],[.005,.0008,.0014],[0,a+k*2,0]);}
    }else if(['palm','cycad','ginger'].includes(theme)){
      const tall=theme==='palm'?size:theme==='cycad'?.004:.006;
      builder.part('cylinder','#91816a',[x,y+tall/2,z],[.00065,tall,.00065]);
      for(let j=0;j<9;j++){const angle=j*Math.PI*2/9+a;builder.part('leaf',theme==='ginger'?'#79a173':'#547e58',[x+Math.cos(angle)*.003,y+tall,z+Math.sin(angle)*.003],[theme==='palm'?.0065:.004,.0007,theme==='ginger'?.0022:.0013],[0,-angle,.22]);}
      if(theme==='ginger')builder.part('cone','#c98974',[x,y+.009,z],[.001,.003,.001]);
    }else if(['araucaria','conifer'].includes(theme)){
      const tall=theme==='araucaria'?size*1.65:size;
      builder.part('cylinder','#867b63',[x,y+tall/2,z],[.0007,tall,.0007]);
      for(let j=0;j<6;j++)builder.part('cone',j%2?'#577e61':'#638964',[x,y+tall*(.3+j*.12),z],[size*(.35-j*.043),size*.3,size*(.35-j*.043)]);
    }else if(theme==='flowers'){
      for(let j=0;j<5;j++){const angle=j*2.4;builder.part('crown','#6b9464',[x+Math.cos(angle)*.002,y+.0015,z+Math.sin(angle)*.002],[.002,.002,.002]);builder.part('ball',['#d39da9','#e3c47c','#d7bfc7'][types[theme]%3],[x+Math.cos(angle)*.002,y+.0032,z+Math.sin(angle)*.002],[.0008,.00055,.0008]);}
    }else{
      const tall=theme==='rainforest'?size*1.5:size;
      builder.part('cylinder','#86795f',[x,y+tall*.42,z],[.001,tall*.84,.001]);
      for(let j=0;j<4;j++){const angle=j*2.4;builder.part('crown',['#557d58','#6b905f','#86a06c'][types[theme]%3],[x+Math.cos(angle)*size*.22,y+tall*(.74+j%2*.12),z+Math.sin(angle)*size*.22],[size*.28,size*.27,size*.3]);}
      if(theme==='rainforest'||theme==='vine')for(let j=0;j<3;j++){const angle=j*2.1;builder.bar('#8c9660',[x+Math.cos(angle)*.004,y+tall*.8,z+Math.sin(angle)*.004],[x+Math.cos(angle)*.003,y+.002,z+Math.sin(angle)*.003],.0002);}
    }
    trees.push([x,z]);plantIndex.insert({x,z},x-.012,z-.012,x+.012,z+.012);return true;
  }
  // Species group locations are source POIs; planting extent and individual specimens are illustrative.
  for(const stop of stops){if(stop.theme==='lake')continue;for(let i=0,n=0;i<1500&&n<85;i++){const angle=rng()*6.28,r=Math.sqrt(rng())*stop.radius*.9,x=stop.point[0]+Math.cos(angle)*r,z=stop.point[1]+Math.sin(angle)*r;if(plant(x,z,stop.theme))n++;}}
  for(let i=0;i<18000&&trees.length<2900;i++){
    const x=detail.bounds[0]+rng()*(detail.bounds[2]-detail.bounds[0]),z=detail.bounds[1]+rng()*(detail.bounds[3]-detail.bounds[1]);
    if(coverAt(x,z,['forest','garden','park'])&&!coverAt(x,z,['military','residential']))plant(x,z,themeAt(x,z));
  }
  let understory=0,rocks=0;
  for(let i=0;i<2200;i++){
    const x=detail.bounds[0]+rng()*(detail.bounds[2]-detail.bounds[0]),z=detail.bounds[1]+rng()*(detail.bounds[3]-detail.bounds[1]);if(!clear(x,z,.002)||!coverAt(x,z,['forest','garden','park']))continue;
    const y=h(x,z),type=themeAt(x,z);
    if(i%5===0){const size=.003+rng()*.006;builder.part('ball',['#a5aa95','#bac0a7'][i%2],[x,y+size*.3,z],[size,size*.45,size*.6],[rng(),rng(),rng()]);rocks++;}
    else{for(let j=0;j<5;j++){const a=j*1.26;builder.part('leaf',type==='succulent'?'#a4b38b':'#759660',[x,y+.001,z],[.0025,.0003,.00065],[0,a,.3]);}understory++;}
  }
  for(const route of walking){
    if(route.bridge)continue;const [a,b]=route.points,dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
    for(let d=.012;d<length;d+=.055){
      const x=a[0]+dx*d/length-dz/length*.004,z=a[1]+dz*d/length+dx/length*.004;
      if(!clear(x,z,.0006)||fixtures.some(p=>Math.hypot(p[0]-x,p[1]-z)<.025))continue;
      const y=h(x,z);builder.part('cylinder','#7c9281',[x,y+.003,z],[.00025,.006,.00025]);builder.part('ball','#edd6a0',[x,y+.006,z],[.0007,.0006,.0007],[0,0,0],true);
      if(fixtures.length%3===0)builder.part('box','#a08f73',[x,y+.001,z],[.0035,.0006,.0014],[0,-Math.atan2(dz,dx),0]);fixtures.push([x,z]);
    }
  }
  for(const [color,vertices] of Object.entries(surfaces)){
    if(!vertices.length)continue;const raw=new THREE.BufferGeometry();raw.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const geometry=mergeVertices(raw,1e-7);geometry.computeVertexNormals();raw.dispose();add(color,geometry);
  }
  const soilColors={succulent:new THREE.Color('#c6b08c'),rainforest:new THREE.Color('#5f8061'),bamboo:new THREE.Color('#99a780')};
  for(const [color,geometries] of geometryGroups){
    const geometry=mergeGeometries(geometries),tintGround=['#7f9e72','#6c8f68','#9bad81','#84a078'].includes(color);
    if(tintGround){
      const positions=geometry.getAttribute('position'),colors=new Float32Array(positions.count*3),baseColor=new THREE.Color(color),tint=new THREE.Color();
      // Blend soil on the terrain itself instead of stacking a flat patch over the slope.
      for(let i=0;i<positions.count;i++){
        const x=positions.getX(i),z=positions.getZ(i);tint.copy(baseColor);
        for(const stop of stops){
          const target=soilColors[stop.theme];if(!target)continue;
          const edge=1+.08*Math.sin(x*71+z*23)*Math.cos(z*47),distance=Math.hypot(x-stop.point[0],z-stop.point[1])/(stop.radius*edge);
          const weight=1-THREE.MathUtils.smoothstep(distance,.3,1.05);if(weight>0)tint.lerp(target,weight);
        }
        tint.toArray(colors,i*3);
      }
      geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    }
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:tintGround?'#ffffff':color,vertexColors:tintGround,roughness:.88,side:THREE.DoubleSide}));
    mesh.castShadow=!Object.hasOwn(surfaces,color);mesh.receiveShadow=true;group.add(mesh);geometries.forEach(g=>g.dispose());
  }
  const instances=builder.finish(),crowd=createMappedCrowd({group,paths:walking,heightAt:(x,z,r)=>r?.bridge?r.bridgeY:h(x,z),valid:(x,z,r)=>covers(x,z)&&(r?.bridge||waterAt(x,z)===null)&&!buildingAt(x,z)&&!coverAt(x,z,['military']),limit:160,scale:.5,groundOffset:.0017,seed:223,reducedMotion});
  const lake=stops.find(p=>p.theme==='lake'),anchor={x:lake.point[0]+.11,z:lake.point[1]+.16,radius:.45,mobileSceneRadius:.24,minHalfHeight:.24,viewDirection:[3,7,8],theme:'mapped-mountain-botanical-garden'};
  let quality='balanced';
  return {covers,anchor,stops,update:dt=>crowd.update(dt),setQuality:q=>{quality=q;},setLight(night){for(const [key,mat] of builder.materials)if(key.endsWith('-true'))mat.emissiveIntensity=night*1.6;},getState(){return {snapshot:detail.snapshot,buildings:detail.buildings.length,paths:detail.paths.length,stairs,bridges,stops:stops.length,forms:[...forms],trees:trees.length,types,understory,rocks,fixtures:fixtures.length,instances,quality,...crowd.getState()};}};
}
