import * as THREE from 'three';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {createBuilder} from './living-world.mjs';
import {createMappedCrowd} from './mapped-crowd.mjs';
import {createSpatialIndex,distanceToSegment,seededRandom} from './world-layout.mjs';
import {prepareWaterContains} from './water-query.mjs';
import {terrainTriangle,terrainPaving} from './terrain-paving.mjs';
import {inRectangle} from './coast-layout.mjs';

export const campusLocations={university:[118.09301733970642,24.43994139288682],temple:[118.09161,24.44310]};
export function createCampusDetail({scene,data,detail,toWorld,heightAt,waterAt,campusTerrain,reducedMotion=false}){
  const group=new THREE.Group();group.name='厦大湖畔与南普陀山门';scene.add(group);
  const covers=(x,z)=>inRectangle(x,z,detail.bounds),dry=(x,z)=>covers(x,z)&&waterAt(x,z)===null;
  const builder=createBuilder(group,{tintInstances:true}),rng=seededRandom(4096),surfaces={},geometryGroups=new Map(),roadIndex=createSpatialIndex(.06),buildingIndex=createSpatialIndex(.06),treeIndex=createSpatialIndex(.025);
  const h=heightAt,pave=terrainPaving(campusTerrain.terrain,h),walking=[],trees=[],fixtures=[],forms=new Set();
  const add=(color,geo)=>{if(geo.index){const indexed=geo;geo=geo.toNonIndexed();indexed.dispose();}geo.deleteAttribute('uv');if(!geometryGroups.has(color))geometryGroups.set(color,[]);geometryGroups.get(color).push(geo);};
  function surface(color,rings,offset){
    const v=rings.map(r=>r.slice(0,-1).map(p=>new THREE.Vector2(...p))),points=v.flat();
    const out=surfaces[color]??=[];
    for(const face of THREE.ShapeUtils.triangulateShape(v[0],v.slice(1))){const vertices=terrainTriangle(campusTerrain.terrain,h,face.map(i=>[points[i].x,points[i].y]),{offset});for(const value of vertices)out.push(value);}
  }
  for(const rings of detail.land)surface('#91aa86',rings,0);
  const coverTests=detail.covers.map(c=>({...c,contains:prepareWaterContains(c.rings)}));
  const coverAt=(x,z,kinds)=>coverTests.some(c=>kinds.includes(c.kind)&&c.contains(x,z));
  const palette={forest:'#648566',garden:'#87a576',park:'#8aa97c',grass:'#93ae7a',scrub:'#7c9671',flowerbed:'#97af7c',beach:'#d5cfad',university:'#b6bfa9',pitch:'#749368',track:'#ba8773',library:'#c6c7b5'};
  const coverOffsets={university:.00015,library:.0003,forest:.0004,scrub:.00045,grass:.0005,beach:.0005,garden:.0006,park:.0006,flowerbed:.0007,track:.0008,pitch:.00085};
  for(const cover of detail.covers){if(palette[cover.kind])surface(palette[cover.kind],cover.rings,coverOffsets[cover.kind]??.0002);}
  function frame(ring,orientation){
    let edge=[ring[0],ring[1]],length=0;
    for(let i=1;i<ring.length;i++){const d=Math.hypot(ring[i][0]-ring[i-1][0],ring[i][1]-ring[i-1][1]);if(d>length){length=d;edge=[ring[i-1],ring[i]];}}
    const angle=orientation??Math.atan2(edge[1][1]-edge[0][1],edge[1][0]-edge[0][0]),c=Math.cos(angle),s=Math.sin(angle);
    const points=ring.map(([x,z])=>[x*c+z*s,-x*s+z*c]),xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);
    const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...zs),bottom=Math.max(...zs),u=(left+right)/2,v=(top+bottom)/2;
    return {x:u*c-v*s,z:u*s+v*c,w:right-left,d:bottom-top,angle,c,s};
  }
  function roof(f,y,color,levels=1){
    const transform=(x,dy,z)=>[f.x+x*f.c-z*f.s,y+dy,f.z+x*f.s+z*f.c];
    for(let level=0;level<levels;level++){
      const scale=1-level*.2,w=f.w*scale+.002,d=f.d*scale+.002,rise=Math.min(.012,d*.28),yy=level*.008;
      const ring=[[-w/2,0,-d/2],[w/2,0,-d/2],[w/2,0,d/2],[-w/2,0,d/2]],a=[-Math.max(0,w-d)/2,rise,0],b=[Math.max(0,w-d)/2,rise,0];
      const raw=[ring[0],a,b,ring[0],b,ring[1],ring[1],b,ring[2],ring[2],b,a,ring[2],a,ring[3],ring[3],a,ring[0]].flatMap(p=>transform(p[0],p[1]+yy,p[2]));
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(raw,3));geo.computeVertexNormals();add(color,geo);
      builder.bar('#c9bb94',transform(a[0],rise+yy+.001,0),transform(b[0],rise+yy+.001,0),.00055);
      for(const corner of ring){const tip=transform(corner[0]*1.04,yy+.002,corner[2]*1.03),near=transform(corner[0]*.82,yy,corner[2]*.82);builder.bar(color,near,tip,.0007);}
      for(let u=-w*.45;u<=w*.45;u+=.0035)for(const side of [-1,1]){
        builder.bar(color,transform(u,rise+yy,0),transform(u,yy,d*.49*side),.00022);
      }
    }
  }
  for(const building of detail.buildings){const points=building.rings.flat(),xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);buildingIndex.insert({contains:prepareWaterContains(building.rings)},Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs));}
  const buildingAt=(x,z)=>buildingIndex.at(x,z).some(b=>b.contains(x,z));
  const jiannanPoint=toWorld(118.09287,24.43705);
  const innerWings=[[118.091914,24.436925],[118.093735,24.436722]].map(ll=>toWorld(...ll));
  let detailedHalls=0,jiagengWings=0,terraceRows=0;
  function jiannanHall(building,ground,height){
    // Mapped footprint; the stepped south facade and roof hierarchy follow the
    // university's architectural account. Fine dimensions remain illustrative.
    const f=frame(building.rings[0],.20),at=(u,y,v)=>[f.x+u*f.c-v*f.s,y,f.z+u*f.s+v*f.c];
    const part=(color,u,v,w,d,extra)=>{builder.part('box',color,at(u,ground+height+extra/2,v),[w,extra,d],[0,-f.angle,0]);return {...f,x:at(u,0,v)[0],z:at(u,0,v)[2],w,d};};
    const front=f.d*.30,main=part('#d4cdbb',0,front,f.w*.38,f.d*.22,.013);
    roof(main,ground+height+.013,'#447868',2);
    for(const side of [-1,1]){
      const wing=part('#d4cdbb',f.w*.32*side,front-.002,f.w*.23,f.d*.20,.007);
      roof(wing,ground+height+.007,'#527f69');
      builder.bar('#e4ddc8',at(f.w*.22*side,ground+height+.006,front+f.d*.11),at(f.w*.48*side,ground+height+.006,front+f.d*.11),.0007);
    }
    roof({...f,w:f.w*.70,d:f.d*.55,x:at(0,0,-f.d*.17)[0],z:at(0,0,-f.d*.17)[2]},ground+height+.001,'#a96952');
    for(let row=0;row<3;row++)for(let col=0;col<5;col++){
      builder.part('box','#915b4c',at((col-2)*f.w*.061,ground+.004+row*.0065,front+f.d*.115),[.0022,.0035,.0006],[0,-f.angle,0]);
    }
    for(const u of [-.12,0,.12])builder.part('box','#7a5044',at(f.w*u,ground+.004,front+f.d*.13),[.004,.008,.001],[0,-f.angle,0]);
    for(const u of [-.13,-.045,.045,.13]){
      const v=front+f.d*.125;builder.part('cylinder','#e5decc',at(f.w*u,ground+.009,v),[.001,.018,.001]);
      for(const y of [.001,.018])builder.part('box','#dcd4be',at(f.w*u,ground+y,v),[.003,.0018,.0027],[0,-f.angle,0]);
    }
    forms.add('jiannan-stepped-hall');detailedHalls++;
  }
  detail.buildings.forEach((building,index)=>{
    const ring=building.rings[0],f=frame(ring),lon=data.meta.origin[0]+f.x/data.meta.sx,lat=data.meta.origin[1]-f.z/data.meta.sz;
    const temple=lon<118.0924&&lat>24.4421&&lat<24.4450;
    const heritage=!temple&&lat<24.4382&&lon<118.096;
    const contains=prepareWaterContains(building.rings),jiannan=contains(...jiannanPoint),innerWing=innerWings.some(p=>contains(...p));
    const ground=campusTerrain.terraces[index].height,height=jiannan?.013:Math.max(temple?.014:heritage?.020:.012,building.height*.0018),bottom=Math.min(ground,...ring.map(p=>h(...p)));
    const shape=new THREE.Shape(ring.map(([x,z])=>new THREE.Vector2(x,-z)));
    for(const hole of building.rings.slice(1))shape.holes.push(new THREE.Path(hole.map(([x,z])=>new THREE.Vector2(x,-z))));
    const geo=new THREE.ExtrudeGeometry(shape,{depth:height+ground-bottom,bevelEnabled:false});geo.rotateX(-Math.PI/2);geo.translate(0,bottom,0);
    add(temple?'#c5af89':heritage?'#d0c5ab':['#d6cbb7','#c7cbbd','#cdbaab'][index%3],geo);
    const simple=ring.length<=6,octagonal=temple&&ring.length===9;
    if(jiannan){jiannanHall(building,ground,height);}
    else if(innerWing){
      const long=frame(ring,.20),at=(u,v)=>({...long,x:long.x+u*long.c-v*long.s,z:long.z+u*long.s+v*long.c});
      roof({...at(0,long.d*.20),w:long.w*.96,d:long.d*.43},ground+height,'#507d65');
      for(const side of [-1,1])roof({...at(long.w*.40*side,-long.d*.12),w:long.w*.18,d:long.d*.80},ground+height-.0005,'#a56d55');
      forms.add('jiannan-green-tile-wing');jiagengWings++;
    }
    else if(octagonal){
      for(let level=0;level<3;level++){
        const r=Math.min(f.w,f.d)*(.58-level*.09),geo=new THREE.ConeGeometry(r,.006,8);geo.translate(f.x,ground+height+level*.007+.003,f.z);add('#547d69',geo);
        builder.part('cylinder','#c6a56b',[f.x,ground+height+.024,f.z],[.001,.009,.001]);
      }forms.add('octagonal-pavilion');
    }else if(simple){roof(f,ground+height,temple?'#547d69':heritage?'#a76a51':'#a26c55',temple?2:1);forms.add(temple?'double-eaved-hall':heritage?'jiageng-wing':'gable-campus-building');}
    else{
      const r=new THREE.ShapeGeometry(shape);r.rotateX(-Math.PI/2);r.translate(0,ground+height+.0004,0);add(heritage?'#a96a50':'#7b8d84',r);
      forms.add(building.rings.length>1?'courtyard-building':'mapped-complex-footprint');
      if(heritage){roof({...f,w:f.w*.35,d:f.d*.6},ground+height+.002,'#597b65');}
    }
    for(let j=1;j<ring.length;j++){
      const a=ring[j-1],b=ring[j],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.002)continue;
      const angle=-Math.atan2(dz,dx),rows=temple?1:heritage?3:Math.max(2,Math.min(6,Math.round(height/.006))),cols=Math.min(32,Math.floor(length/.0045));
      for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
        const u=(col+.5)/cols,x=a[0]+dx*u,z=a[1]+dz*u,y=ground+height*(row+.52)/rows;
        builder.part('box',temple?'#925b4d':'#608a8a',[x,y,z],[Math.min(.0025,length/cols*.65),height/rows*.48,.00065],[0,angle,0]);
        if((row+col+index)%7===0)builder.part('box','#f0c782',[x,y,z],[.0017,height/rows*.34,.0008],[0,angle,0],true);
      }
      builder.bar('#dbd6bf',[a[0],ground+height,a[1]],[b[0],ground+height,b[1]],.0006);
      if(heritage)for(let row=1;row<3;row++)builder.bar('#e3dcc8',[a[0],ground+height*row/3,a[1]],[b[0],ground+height*row/3,b[1]],.00045);
      if(innerWing)for(const p of [a,b])for(let row=0;row<10;row++)builder.part('box',row%2?'#e0d8c3':'#ac705b',[p[0],ground+(row+.5)*height/10,p[1]],[.0014,height/10,.0014]);
      if(temple&&length>.014)for(let d=.003;d<length;d+=.007){const u=d/length;builder.part('cylinder','#ac6954',[a[0]+dx*u,ground+height/2,a[1]+dz*u],[.0007,height,.0007]);}
    }
  });
  let stairs=0,stepMarks=0;
  for(const path of detail.paths){
    const pedestrian=['footway','pedestrian','path','steps','cycleway'].includes(path.kind),width=pedestrian?(path.kind==='pedestrian'?.006:.0035):path.kind==='service'?.005:.009;
    for(let i=1;i<path.points.length;i++){
      const a=path.points[i-1],b=path.points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<1e-5)continue;
      if(![0,.25,.5,.75,1].every(u=>dry(a[0]+dx*u,a[1]+dz*u)))continue;
      pave(surfaces['#b9c5b5']??=[],a,b,width+.0014,{offset:.0008});
      pave(surfaces[pedestrian?'#d1cdb9':'#718484']??=[],a,b,width,{offset:.0011});
      roadIndex.insert({a,b,width},Math.min(a[0],b[0])-.02,Math.min(a[1],b[1])-.02,Math.max(a[0],b[0])+.02,Math.max(a[1],b[1])+.02);
      if(pedestrian&&path.foot!=='no')walking.push({points:[a,b],name:path.name,kind:path.kind});
      if(!pedestrian&&!path.bridge&&path.kind!=='trunk')for(const side of [-1,1]){
        const nx=-dz/length,nz=dx/length,offset=side*(width/2+.002),aa=[a[0]+nx*offset,a[1]+nz*offset],bb=[b[0]+nx*offset,b[1]+nz*offset];
        if(![0,.25,.5,.75,1].every(u=>{const x=aa[0]+(bb[0]-aa[0])*u,z=aa[1]+(bb[1]-aa[1])*u;return dry(x,z)&&!buildingAt(x,z);}))continue;
        pave(surfaces['#d1cdb9']??=[],aa,bb,.003,{offset:.0011});walking.push({points:[aa,bb],name:path.name});
      }
      if(path.kind==='steps'){
        stairs++;const n=Math.max(3,Math.ceil(length/.0015));
        for(let j=0;j<n;j++){const x=a[0]+dx*(j+.5)/n,z=a[1]+dz*(j+.5)/n;builder.part('box','#e5dfc9',[x,h(x,z)+.00145,z],[width,.00035,.00035],[0,-Math.atan2(dz,dx)+Math.PI/2,0]);stepMarks++;}
        for(const side of [-1,1])for(let d=0;d<length;d+=.004){const x=a[0]+dx*d/length-dz/length*side*width*.52,z=a[1]+dz*d/length+dx/length*side*width*.52;builder.bar('#9aaf9f',[x,h(x,z)+.001,z],[x,h(x,z)+.0035,z],.0002);}
      }
    }
  }
  const roadNear=(x,z,pad=0)=>roadIndex.at(x,z).some(p=>distanceToSegment(x,z,p.a,p.b)<p.width/2+pad);
  // The 25 curved terraces are described in the university's architectural archive.
  // Their display dimensions are illustrative; mapped paths and footprints stay intact.
  const standPoints=[],standCenter=toWorld(118.09275,24.43596),standAngle=.20;
  for(let row=0;row<25;row++){
    let made=false;
    const at=a=>{const rx=.138+row*.0008,rz=.062+row*.0008,u=Math.cos(a)*rx,v=-Math.sin(a)*rz;return [standCenter[0]+u*Math.cos(standAngle)-v*Math.sin(standAngle),standCenter[1]+u*Math.sin(standAngle)+v*Math.cos(standAngle)];};
    for(let i=4;i<76;i++){
      if(i%16===0||i%16===1)continue;
      const a=at(i/80*Math.PI),b=at((i+1)/80*Math.PI),x=(a[0]+b[0])/2,z=(a[1]+b[1])/2;
      if(buildingAt(x,z)||roadNear(x,z,.001)||!dry(x,z))continue;
      const y=Math.max(h(...a),h(...b))+.0015;
      builder.part('box',row%5===0?'#ddd7c3':'#b4b8a6',[x,y,z],[Math.hypot(b[0]-a[0],b[1]-a[1])+.0001,.0012,.0011],[0,-Math.atan2(b[1]-a[1],b[0]-a[0]),0]);
      if(row===24)standPoints.push([x,z]);made=true;
    }
    if(made)terraceRows++;
  }
  forms.add('shangxian-curved-terraces');
  function tree(x,z,forest=false){
    if(!dry(x,z)||buildingAt(x,z)||roadNear(x,z,.004)||coverAt(x,z,['pitch','track'])||standPoints.some(p=>Math.hypot(p[0]-x,p[1]-z)<.025)||treeIndex.at(x,z).some(p=>Math.hypot(p.x-x,p.z-z)<.011))return;
    const y=h(x,z),size=forest?.016+rng()*.022:.013+rng()*.009,type=trees.length%6;
    builder.part('cylinder','#88765c',[x,y+size*.45,z],[.00085,size*.9,.00085]);
    if(type===0&&!forest)for(let j=0;j<8;j++){const a=j*Math.PI/4;builder.part('leaf','#587e58',[x+Math.cos(a)*.004,y+size,z+Math.sin(a)*.004],[.007,.0008,.002],[0,-a,-.15]);}
    else for(let j=0;j<5;j++){const a=j*2.4;builder.part('crown',['#567a50','#688e5f','#7e9c62'][type%3],[x+Math.cos(a)*size*.2,y+size*(.76+j%2*.10),z+Math.sin(a)*size*.2],[size*.25,size*.28,size*.27]);}
    for(let j=0;j<4;j++){const a=j*2.2;builder.part('crown','#82a06a',[x+Math.cos(a)*.003,y+.001,z+Math.sin(a)*.003],[.0015,.0011,.0015]);if(!forest)builder.part('ball',type%2?'#cc8999':'#e2c376',[x+Math.cos(a)*.003,y+.002,z+Math.sin(a)*.003],[.00065,.00045,.0006]);}
    trees.push([x,z]);treeIndex.insert({x,z},x-.011,z-.011,x+.011,z+.011);
  }
  for(const path of detail.paths)for(let i=1;i<path.points.length;i++){
    const a=path.points[i-1],b=path.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<.02)continue;
    const dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length;
    for(let d=.015;d<length;d+=.030)for(const side of [-1,1])tree(a[0]+dx*d-dz*.012*side,a[1]+dz*d+dx*.012*side);
  }
  for(let i=0;i<12000&&trees.length<1700;i++){
    const x=detail.bounds[0]+rng()*(detail.bounds[2]-detail.bounds[0]),z=detail.bounds[1]+rng()*(detail.bounds[3]-detail.bounds[1]);
    if(coverAt(x,z,['forest','garden','park','scrub']))tree(x,z,true);
  }
  for(const route of walking){
    const [a,b]=route.points,dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
    for(let d=.015;d<length;d+=.055){
      const x=a[0]+dx*d/length-dz/length*.0038,z=a[1]+dz*d/length+dx/length*.0038;
      if(!dry(x,z)||buildingAt(x,z)||roadNear(x,z,.0007)||fixtures.some(p=>Math.hypot(p[0]-x,p[1]-z)<.03))continue;
      const y=h(x,z);builder.part('cylinder','#829b8e',[x,y+.0036,z],[.0003,.0072,.0003]);builder.part('ball','#f0d394',[x,y+.0074,z],[.0008,.0007,.0008],[0,0,0],true);
      if(fixtures.length%3===0){builder.part('box','#a08866',[x,y+.0014,z],[.004,.0007,.0015],[0,-Math.atan2(dz,dx),0]);}
      fixtures.push([x,z]);
    }
  }
  // Model the mapped sports grounds, without substituting a separate sports close-up.
  let courts=0;
  for(const c of detail.covers.filter(c=>c.kind==='pitch')){
    const f=frame(c.rings[0]),contains=prepareWaterContains(c.rings);if(f.w<.007||f.d<.007)continue;
    const at=(u,v)=>[f.x+u*f.c-v*f.s,f.z+u*f.s+v*f.c],points=[at(-f.w*.42,-f.d*.42),at(f.w*.42,-f.d*.42),at(f.w*.42,f.d*.42),at(-f.w*.42,f.d*.42)];
    if(!points.every(p=>contains(...p)))continue;
    for(let i=0;i<4;i++)pave(surfaces['#dedec5']??=[],points[i],points[(i+1)%4],.00035,{offset:.001});
    pave(surfaces['#dedec5']??=[],at(0,-f.d*.42),at(0,f.d*.42),.00035,{offset:.001});courts++;
  }
  for(const [color,vertices] of Object.entries(surfaces)){
    if(!vertices.length)continue;const raw=new THREE.BufferGeometry();raw.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const geometry=mergeVertices(raw,1e-7);geometry.computeVertexNormals();raw.dispose();add(color,geometry);
  }
  for(const [color,geometries] of geometryGroups){const geometry=mergeGeometries(geometries),mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.88,side:THREE.DoubleSide}));mesh.castShadow=!Object.hasOwn(surfaces,color);mesh.receiveShadow=true;group.add(mesh);geometries.forEach(g=>g.dispose());}
  const instances=builder.finish(),crowd=createMappedCrowd({group,paths:walking,heightAt:h,valid:(x,z)=>dry(x,z)&&!buildingAt(x,z),limit:240,scale:.5,groundOffset:.0014,seed:781,reducedMotion});
  const anchors=Object.values(campusLocations).map((ll,i)=>{const [x,z]=toWorld(...ll);return {x,z,radius:i?.25:.46,mobileSceneRadius:i?.13:.23,minHalfHeight:.26,viewDirection:[2,5,8],theme:i?'mapped-hillside-temple':'mapped-lakeside-campus'};});
  let quality='balanced';
  return {covers,anchors,update:dt=>crowd.update(dt),setQuality:q=>{quality=q;},setLight(night){for(const [key,mat] of builder.materials)if(key.endsWith('-true'))mat.emissiveIntensity=night*1.8;},getState(){return {snapshot:detail.snapshot,buildings:detail.buildings.length,paths:detail.paths.length,stairs,stepMarks,forms:[...forms],detailedHalls,jiagengWings,terraceRows,trees:trees.length,fixtures:fixtures.length,courts,instances,quality,...crowd.getState()};}};
}
