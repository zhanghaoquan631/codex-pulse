import * as THREE from 'three';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {createBuilder} from './living-world.mjs';
import {terrainTriangle} from './terrain-paving.mjs';
import {prepareWaterContains} from './water-query.mjs';
import {createSpatialIndex,distanceToSegment,seededRandom} from './world-layout.mjs';
import {createMappedCrowd} from './mapped-crowd.mjs';
import {coastLocations,createCoastCoverage} from './coast-layout.mjs';
import {createStreetLayout,footprintCorners,streetWidth} from './oldtown-layout.mjs';

export function createCoastDetail({scene,data,detail,toWorld,heightAt,reducedMotion=false}){
  const group=new THREE.Group();group.name='沙坡尾避风坞与演武海岸';scene.add(group);
  const coverage=createCoastCoverage(detail),builder=createBuilder(group,{tintInstances:true}),rng=seededRandom(3024),roadIndex=createSpatialIndex(.05),buildingIndex=createSpatialIndex(.05);
  const surfaces={land:[],park:[],road:[],walk:[],edge:[]},walkRoutes=[],trafficRoutes=[],geometryGroups=new Map(),trees=[],boats=[];
  const land=(x,z)=>coverage.covers(x,z)&&!coverage.isWater(x,z);
  const localHeight=(x,z)=>Math.max(.016,heightAt(x,z));
  const triangulate=rings=>{
    const v=rings.map(r=>r.slice(0,-1).map(([x,z])=>new THREE.Vector2(x,z))),points=v.flat();
    return THREE.ShapeUtils.triangulateShape(v[0],v.slice(1)).map(face=>face.map(i=>[points[i].x,points[i].y]));
  };
  for(const polygon of detail.land)for(const triangle of triangulate(polygon))surfaces.land.push(...terrainTriangle(data.terrain,localHeight,triangle,{offset:0}));
  for(const polygon of detail.parks)for(const triangle of triangulate(polygon))surfaces.park.push(...terrainTriangle(data.terrain,localHeight,triangle,{offset:.0004}));
  let streetLayout;
  const mappedBuildingAt=(x,z)=>buildingIndex.at(x,z).some(b=>b.contains(x,z));
  const buildingAt=(x,z)=>mappedBuildingAt(x,z)||!!streetLayout?.buildingAt(x,z);
  for(const building of detail.buildings){
    const p=building.rings[0],xs=p.map(v=>v[0]),zs=p.map(v=>v[1]);
    buildingIndex.insert({contains:prepareWaterContains(building.rings)},Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs));
  }
  function ribbon(target,a,b,width,yAt,side=0){
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<1e-8)return;
    const nx=-dz/length,nz=dx/length,steps=Math.max(1,Math.ceil(length/.008));
    const p=(t,s)=>{const x=a[0]+dx*t+nx*s,z=a[1]+dz*t+nz*s;return [x,yAt(x,z),z];};
    for(let i=0;i<steps;i++){const aa=p(i/steps,side-width/2),ab=p(i/steps,side+width/2),ba=p((i+1)/steps,side-width/2),bb=p((i+1)/steps,side+width/2);target.push(...aa,...ab,...ba,...ab,...bb,...ba);}
  }
  function rail(a,b,yAt,side,width){
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),nx=-dz/length,nz=dx/length;
    if(length<.001)return;
    const at=t=>{const x=a[0]+dx*t+nx*side*width/2,z=a[1]+dz*t+nz*side*width/2;return [x,yAt(x,z),z];};
    const n=Math.ceil(length/.004);
    for(let i=0;i<=n;i++){const p=at(i/n);builder.bar('#c6d7d7',p,[p[0],p[1]+.0025,p[2]],.00024);}
    for(const dy of [.0012,.0026]){
      const n=Math.ceil(length/.012);for(let i=0;i<n;i++){const p=at(i/n),q=at((i+1)/n);p[1]+=dy;q[1]+=dy;builder.bar('#dce6df',p,q,.00025);}
    }
  }
  let stairs=0,bridgeSegments=0;
  for(const path of detail.paths){
    const pedestrian=['footway','pedestrian','path','steps','cycleway','pier'].includes(path.kind);
    const width=pedestrian?(path.bridge?.007:path.kind==='pedestrian'?.012:.004):['trunk','primary','secondary'].includes(path.kind)?.012:.007;
    const bridge=path.bridge||path.layer>0;
    const bridgeHeight=bridge?(pedestrian?.019:.024)+Math.max(0,path.layer-1)*.004:null;
    const roadHeight=(x,z)=>bridge?Math.max(bridgeHeight,land(x,z)?localHeight(x,z)+.0012:bridgeHeight):localHeight(x,z)+.0012;
    if(bridge&&!pedestrian){
      const cumulative=[0];for(let i=1;i<path.points.length;i++)cumulative.push(cumulative.at(-1)+Math.hypot(path.points[i][0]-path.points[i-1][0],path.points[i][1]-path.points[i-1][1]));
      if(cumulative.at(-1)>.20)trafficRoutes.push({points:path.points,cumulative,length:cumulative.at(-1),height:bridgeHeight});
    }
    for(let i=1;i<path.points.length;i++){
      const a=path.points[i-1],b=path.points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.00001)continue;
      if(!bridge&&![0,.25,.5,.75,1].every(t=>land(a[0]+dx*t,a[1]+dz*t)))continue;
      ribbon(surfaces.edge,a,b,width+.0012,(x,z)=>roadHeight(x,z)-.0003);
      ribbon(surfaces[pedestrian?'walk':'road'],a,b,width,roadHeight);
      roadIndex.insert({a,b,width},Math.min(a[0],b[0])-.02,Math.min(a[1],b[1])-.02,Math.max(a[0],b[0])+.02,Math.max(a[1],b[1])+.02);
      if(pedestrian&&path.foot!=='no')walkRoutes.push({points:[a,b],bridge,height:bridgeHeight,name:path.name});
      else if(path.kind!=='trunk'&&!bridge&&length>.020)for(const side of [-1,1]){
        const nx=-dz/length,nz=dx/length,offset=side*(width/2+.0022),aa=[a[0]+nx*offset,a[1]+nz*offset],bb=[b[0]+nx*offset,b[1]+nz*offset];
        if(![0,.25,.5,.75,1].every(t=>{const x=aa[0]+(bb[0]-aa[0])*t,z=aa[1]+(bb[1]-aa[1])*t;return land(x,z)&&!buildingAt(x,z);}))continue;
        ribbon(surfaces.walk,a,b,.0038,roadHeight,offset);walkRoutes.push({points:[aa,bb],name:path.name});
      }
      if(bridge){
        bridgeSegments++;for(const side of [-1,1])rail(a,b,roadHeight,side,width);
        if(length>.025)for(let d=.018;d<length;d+=.040){
          const x=a[0]+dx*d/length,z=a[1]+dz*d/length,bottom=coverage.isWater(x,z)?.005:localHeight(x,z);
          const top=roadHeight(x,z);if(top>bottom+.005)builder.part('cylinder','#b6c5bf',[x,(bottom+top)/2,z],[pedestrian?.0013:.0025,top-bottom,pedestrian?.0013:.0025]);
        }
      }
      if(path.kind==='steps'){
        stairs++;const n=Math.max(3,Math.ceil(length/.0012));
        for(let j=0;j<n;j++){const x=a[0]+dx*(j+.5)/n,z=a[1]+dz*(j+.5)/n;builder.part('box','#e0dfce',[x,roadHeight(x,z)+.00025,z],[width,.0005,.00035],[0,-Math.atan2(dz,dx)+Math.PI/2,0]);}
        for(const side of [-1,1])rail(a,b,roadHeight,side,width);
      }
      if(!pedestrian&&length>.07){
        for(let d=.012;d<length;d+=.016){const x=a[0]+dx*d/length,z=a[1]+dz*d/length;builder.part('box','#dbe2ce',[x,roadHeight(x,z)+.00015,z],[.006,.0003,.00045],[0,-Math.atan2(dz,dx),0]);}
      }
    }
  }
  const roadNear=(x,z,pad=0)=>roadIndex.at(x,z).some(s=>distanceToSegment(x,z,s.a,s.b)<s.width/2+pad);
  function addGeometry(color,geometry){if(!geometryGroups.has(color))geometryGroups.set(color,[]);geometryGroups.get(color).push(geometry);}
  const forms=new Set(),infill=[];
  streetLayout=createStreetLayout(detail.paths,{land,heightAt:localHeight,existingAt:mappedBuildingAt});
  for(const path of detail.paths){
    if(path.bridge||path.layer>0||!['minor','tertiary','secondary'].includes(path.kind))continue;
    for(let i=1;i<path.points.length;i++){
      const a=path.points[i-1],b=path.points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.020)continue;
      for(let along=.015;along<length-.010&&infill.length<250;along+=.020)for(const side of [-1,1]){
        const w=.013+rng()*.005,d=.015+rng()*.016,offset=streetWidth(path)/2+.004+d/2;
        const box={x:a[0]+dx*along/length-dz/length*offset*side,z:a[1]+dz*along/length+dx/length*offset*side,w,d,angle:-Math.atan2(dz,dx)};
        if(!streetLayout.footprintFits(box))continue;
        const corners=footprintCorners(box);corners.push(corners[0]);
        streetLayout.reserve(box);infill.push({rings:[corners],height:4+(infill.length%4)*2,minHeight:0,illustrative:true});
      }
    }
  }
  [...detail.buildings,...infill].forEach((building,index)=>{
    const ring=building.rings[0],tower=building.height>200,ground=Math.max(...ring.map(p=>localHeight(...p))),height=building.height*(tower?.0015:.002),base=ground+building.minHeight*.002;
    const shape=new THREE.Shape(ring.map(([x,z])=>new THREE.Vector2(x,-z)));
    for(const hole of building.rings.slice(1))shape.holes.push(new THREE.Path(hole.map(([x,z])=>new THREE.Vector2(x,-z))));
    const minZ=Math.min(...ring.map(p=>p[1])),maxZ=Math.max(...ring.map(p=>p[1]));
    const roofHeight=z=>height*(tower?.56+.44*Math.pow(THREE.MathUtils.clamp((z-minZ)/(maxZ-minZ||1),0,1),1.4):1);
    const geo=new THREE.ExtrudeGeometry(shape,{depth:Math.max(.008,height-building.minHeight*.002),bevelEnabled:false,curveSegments:1});geo.rotateX(-Math.PI/2);
    if(tower){const a=geo.getAttribute('position');for(let i=0;i<a.count;i++)a.setY(i,a.getY(i)/height*roofHeight(a.getZ(i)));geo.computeVertexNormals();}
    geo.translate(0,base,0);
    const color=tower?'#79a5ad':['#d9d5c6','#cad0c9','#d9bda6','#b4c9c7'][index%4];addGeometry(color,geo);forms.add(tower?'mapped-sail-tower':building.illustrative?'illustrative-shopfront':ring.length>9?'irregular-building':'mapped-street-block');
    const roof=new THREE.ShapeGeometry(shape);roof.rotateX(-Math.PI/2);const ra=roof.getAttribute('position');for(let i=0;i<ra.count;i++)ra.setY(i,ground+roofHeight(ra.getZ(i))+.0005);roof.computeVertexNormals();addGeometry(tower?'#abcacb':index%3===0?'#a96854':'#81908a',roof);
    for(let i=1;i<ring.length;i++){
      const a=ring[i-1],b=ring[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),angle=-Math.atan2(dz,dx);if(length<.003)continue;
      const front=(fraction,y)=>[a[0]+dx*fraction,ground+y,a[1]+dz*fraction];
      if(tower){
        for(let h=.006;h<Math.min(roofHeight(a[1]),roofHeight(b[1]));h+=.011)builder.bar('#d3dbd7',front(0,h),front(1,h),.0005);
        for(let d=.002;d<length;d+=.007){const h=roofHeight(a[1]+dz*d/length);builder.part('box','#b3cdce',front(d/length,h/2),[.00065,h,.001],[0,angle,0]);}
      }else{
        const floors=Math.max(1,Math.min(7,Math.round(height/.007))),windows=Math.min(16,Math.floor(length/.005));
        for(let f=0;f<floors;f++)for(let w=0;w<windows;w++){
          const p=front((w+.5)/windows,(f+.55)*height/floors);
          builder.part('box',f===0?'#526f77':'#527e85',p,[Math.min(.0034,length/windows*.65),height/floors*.48,.00075],[0,angle,0]);
          if((f+w+index)%5===0)builder.part('box','#e7bb74',[p[0],p[1],p[2]],[.002,height/floors*.34,.0009],[0,angle,0],true);
        }
        builder.bar('#e8e3d4',front(0,height-.001),front(1,height-.001),.0006);
        if(length>.015&&index%3!==0){
          builder.part('box',['#9b695a','#719682','#a88f58'][index%3],front(.5,.006),[length*.75,.002,.0012],[0,angle,0]);
          builder.part('box','#d8c8ac',front(.5,.008),[length*.80,.0008,.004],[0,angle,0]);
        }
      }
    }
  });
  for(const [color,geometries] of geometryGroups){const geometry=mergeGeometries(geometries);const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.77}));mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);geometries.forEach(g=>g.dispose());}
  const fixtures=[];
  function landscape(x,z,index){
    if(!land(x,z)||buildingAt(x,z)||roadNear(x,z,.004)||trees.some(p=>Math.hypot(p[0]-x,p[1]-z)<.014))return;
    const y=localHeight(x,z),height=.014+rng()*.010,palm=index%4===0;
    builder.part('cylinder','#867461',[x,y+height*.42,z],[.0008,height*.84,.0008]);
    if(palm)for(let j=0;j<7;j++){const a=j*Math.PI*2/7;builder.part('leaf','#608461',[x+Math.cos(a)*.004,y+height,z+Math.sin(a)*.004],[.007,.0007,.002],[0,-a,-.18]);}
    else for(let j=0;j<4;j++){const a=j*2.4;builder.part('crown',index%3===0?'#789957':'#4f8066',[x+Math.cos(a)*.003,y+height*(.8+j%2*.1),z+Math.sin(a)*.003],[.005,.005,.004]);}
    for(let j=0;j<5;j++){const a=j*2.4;builder.part('crown','#719e65',[x+Math.cos(a)*.003,y+.0008,z+Math.sin(a)*.003],[.0013,.001,.0012]);if(j%2===0)builder.part('ball',index%2?'#c4829a':'#e2bc69',[x+Math.cos(a)*.003,y+.0018,z+Math.sin(a)*.003],[.0006,.0004,.0006]);}
    trees.push([x,z]);
  }
  for(const path of detail.paths){if(path.bridge||path.layer>0)continue;
    for(let i=1;i<path.points.length;i++){
      const a=path.points[i-1],b=path.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<.02)continue;
      const dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length;
      for(let d=.015;d<length;d+=.035)for(const side of [-1,1])landscape(a[0]+dx*d-dz*.016*side,a[1]+dz*d+dx*.016*side,trees.length);
    }
  }
  for(const route of walkRoutes){
    if(!route.bridge)continue;
    const [a,b]=route.points,length=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length;
    for(let d=.015;d<length;d+=.028){
      const x=a[0]+dx*d-dz*.0025,z=a[1]+dz*d+dx*.0025,y=route.height;
      if(fixtures.some(p=>Math.hypot(p[0]-x,p[1]-z)<.02))continue;
      builder.part('cylinder','#829b96',[x,y+.0036,z],[.00032,.0072,.00032]);builder.part('ball','#efcd8a',[x,y+.0074,z],[.0008,.0007,.0008],[0,0,0],true);
      fixtures.push([x,z]);
      if(fixtures.length%3===0){const angle=-Math.atan2(dz,dx);builder.part('box','#9f815f',[x+dx*.008,y+.001,z+dz*.008],[.005,.001,.0018],[0,angle,0]);}
    }
  }
  const harborTests=detail.harbor.map(prepareWaterContains),harborWater=(x,z)=>harborTests.some(test=>test(x,z));
  const harborPoints=detail.harbor.flat(2),minX=Math.min(...harborPoints.map(p=>p[0])),maxX=Math.max(...harborPoints.map(p=>p[0])),minZ=Math.min(...harborPoints.map(p=>p[1])),maxZ=Math.max(...harborPoints.map(p=>p[1]));
  for(let i=0;i<150&&boats.length<9;i++){
    const x=minX+rng()*(maxX-minX),z=minZ+rng()*(maxZ-minZ);
    if(![[-.008,0],[.008,0],[0,-.004],[0,.004]].every(([dx,dz])=>harborWater(x+dx,z+dz))||boats.some(b=>Math.hypot(b.x-x,b.z-z)<.027))continue;
    const boat=new THREE.Group(),body=new THREE.Mesh(new THREE.BoxGeometry(.012,.0025,.005),new THREE.MeshStandardMaterial({color:['#558f99','#b66f52','#d1bf82'][boats.length%3]}));body.position.y=.001;boat.add(body);
    const cabin=new THREE.Mesh(new THREE.BoxGeometry(.004,.003,.004),new THREE.MeshStandardMaterial({color:'#dfdfca'}));cabin.position.set(-.001,.003,0);boat.add(cabin);boat.position.set(x,.013,z);boat.rotation.y=rng()*6.28;boat.children.forEach(m=>{m.castShadow=true;m.receiveShadow=true;});boat.userData.atlasLayer='boats';group.add(boat);boats.push({mesh:boat,x,z});
  }
  for(const [kind,vertices] of Object.entries(surfaces)){if(!vertices.length)continue;const raw=new THREE.BufferGeometry();raw.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const geometry=mergeVertices(raw,1e-7);geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:{land:'#bac3af',park:'#739267',road:'#65787a',walk:'#cecebf',edge:'#a4b4ae'}[kind],roughness:.93,side:THREE.DoubleSide}));mesh.name='coast-'+kind;mesh.receiveShadow=true;group.add(mesh);raw.dispose();}
  const routeHeight=(x,z,route)=>route.bridge?Math.max(route.height,land(x,z)?localHeight(x,z)+.0012:route.height):localHeight(x,z);
  const instances=builder.finish(),crowd=createMappedCrowd({group,paths:walkRoutes,heightAt:routeHeight,valid:(x,z,route)=>coverage.covers(x,z)&&(route.bridge||land(x,z))&&!buildingAt(x,z),limit:180,scale:.50,groundOffset:.0016,reducedMotion});
  const vehicles=trafficRoutes.slice(0,16).flatMap((route,i)=>Array.from({length:Math.max(1,Math.floor(route.length/.13))},(_,j)=>({route,phase:(j+.35)/Math.max(1,Math.floor(route.length/.13)),color:i%5})));
  const body=new THREE.BoxGeometry(.0055,.002,.0026),top=new THREE.BoxGeometry(.0026,.0013,.0024);body.translate(0,.0015,0);top.translate(0,.003,0);
  const cars=new THREE.InstancedMesh(mergeGeometries([body,top]),new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.65}),vehicles.length);cars.castShadow=true;cars.receiveShadow=true;cars.frustumCulled=false;cars.userData.atlasLayer='traffic';group.add(cars);
  vehicles.forEach((v,i)=>cars.setColorAt(i,new THREE.Color(['#dadbd1','#ca805b','#bba252','#60868f','#678d70'][v.color])));
  const carTransform=new THREE.Object3D();
  function updateCars(seconds){vehicles.forEach(({route,phase},index)=>{const distance=(phase*route.length+seconds*.005)%route.length;let i=1;while(i<route.cumulative.length-1&&distance>route.cumulative[i])i++;const a=route.points[i-1],b=route.points[i],length=route.cumulative[i]-route.cumulative[i-1],u=(distance-route.cumulative[i-1])/(length||1),dx=b[0]-a[0],dz=b[1]-a[1],x=a[0]+dx*u-dz/(length||1)*.002,z=a[1]+dz*u+dx/(length||1)*.002;carTransform.position.set(x,Math.max(route.height,land(x,z)?localHeight(x,z)+.0012:route.height),z);carTransform.rotation.set(0,-Math.atan2(dz,dx),0);carTransform.updateMatrix();cars.setMatrixAt(index,carTransform.matrix);});cars.instanceMatrix.needsUpdate=true;}
  updateCars(0);
  const anchors=Object.values(coastLocations).map((ll,i)=>{const [x,z]=toWorld(...ll);return {x,z,radius:i?.22:.25,minHalfHeight:.24,viewDirection:i?[-5,5,8]:[-5,5,-7],theme:i?'mapped-observation-deck':'mapped-shelter-harbor'};});
  let seconds=0,quality='balanced';
  return {covers:coverage.covers,anchors,update(dt){seconds+=reducedMotion?0:dt;crowd.update(dt);updateCars(seconds);boats.forEach((b,i)=>{b.mesh.position.y=.013+Math.sin(seconds*1.2+i)*.00035;b.mesh.rotation.z=Math.sin(seconds*.8+i)*.025;});},setQuality(q){quality=q;},setLight(night){for(const [key,mat] of builder.materials)if(key.endsWith('-true'))mat.emissiveIntensity=night*1.8;},getState(){return {snapshot:detail.snapshot,buildings:detail.buildings.length,illustrativeBuildings:infill.length,towers:detail.buildings.filter(b=>b.height>200).length,forms:[...forms],paths:detail.paths.length,stairs,bridgeSegments,trees:trees.length,boats:boats.length,cars:vehicles.length,fixtures:fixtures.length,instances,quality,...crowd.getState()};}};
}
