import * as THREE from 'three';
import {buildVegetation} from './street-life.mjs';
import {landClearance} from './regional-life.mjs';
import {addSpatialInstances} from './spatial-instances.mjs';
import {spatialQuery} from './spatial-query.mjs';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
export function hash(x,z,seed=0){const n=Math.sin(x*127.1+z*311.7+seed*71.9)*43758.5453;return n-Math.floor(n);}
export function environmentOpacity(zoom){return 1-THREE.MathUtils.smoothstep(zoom,12,22);}

function roadIndex(roads){
  const cells=new Map();
  for(const [kind,bridge,path] of roads){if(kind==='rail'||bridge)continue;
    for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i],edge={a,b};
      for(let x=Math.floor(Math.min(a[0],b[0])-.9);x<=Math.floor(Math.max(a[0],b[0])+.9);x++)for(let z=Math.floor(Math.min(a[1],b[1])-.9);z<=Math.floor(Math.max(a[1],b[1])+.9);z++){
        const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(edge);
      }
    }
  }
  return (x,z)=>{
    let distance=Infinity,angle=0;
    for(const {a,b} of cells.get(Math.floor(x)+','+Math.floor(z))||[]){const dx=b[0]-a[0],dz=b[1]-a[1],t=THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1),0,1),d=Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);if(d<distance){distance=d;angle=Math.atan2(dx,dz);}}
    return {distance,angle};
  };
}

export function generateRegionalEnvironment({data,places,heightAt,waterAt,mobile=false,reservedSites=[],reserve=()=>true}){
  const nearestRoad=roadIndex(data.roads),cities=[],forest=[],riparian=[],counts={},occupied=new Set();
  const bankBounds=p=>{const r=Math.max(0,p.span+.02)+1e-9;return [p.x-r,p.x+r,p.z-r,p.z+r];};
  const bankCandidates=spatialQuery(reservedSites,bankBounds),unindexedBanks=reservedSites.filter(p=>!bankBounds(p).every(Number.isFinite));
  const bankReserved=(x,z)=>bankCandidates(x,z).some(p=>Math.hypot(x-p.x,z-p.z)<p.span+.02)||unindexedBanks.some(p=>Math.hypot(x-p.x,z-p.z)<p.span+.02);
  const clearLand=landClearance({heightAt,waterAt,buildings:data.buildings||[]});
  const bounds=data.terrain.bounds,inside=(x,z,pad)=>x>bounds[0][0]+pad&&x<bounds[1][0]-pad&&z>bounds[0][1]+pad&&z<bounds[1][1]-pad;
  const land=(x,z,r)=>inside(x,z,r)&&[[0,0],[-1,-1],[-1,1],[1,-1],[1,1]].every(([dx,dz])=>waterAt(x+dx*r,z+dz*r)===null);
  for(const [i,p] of places.filter(p=>p.kind==='district').entries()){
    counts[p.name]=0;
    const radius=i===0?12:i<3?8:i===4?3.8:6.3,spacing=mobile?.78:.58;
    for(let dz=-radius;dz<radius;dz+=spacing)for(let dx=-radius;dx<radius;dx+=spacing){
      const noise=hash(dx,dz,i),distance=Math.hypot(dx,dz*1.2);
      if(distance>radius*(.78+.20*hash(dx*.22,dz*.22,i))||noise<.12)continue;
      const x=p.x+dx+(noise-.5)*.15,z=p.z+dz+(hash(dx,dz,44)-.5)*.15,key=Math.round(x/.5)+','+Math.round(z/.5);
      if(occupied.has(key)||!land(x,z,.24))continue;
      const h=heightAt(x,z),road=nearestRoad(x,z);
      if(h<0||h>.8||Math.abs(heightAt(x+.25,z)-h)>.09||Math.abs(heightAt(x,z+.25)-h)>.09||road.distance<.12||road.distance>.9)continue;
      if(places.some(q=>(q.kind==='landmark'||['transport','food'].includes(q.kind)&&q.span)&&Math.hypot(q.x-x,q.z-z)<Math.max(.6,q.span||0)))continue;
      occupied.add(key);counts[p.name]++;
      const downtown=distance<radius*.38,tall=downtown&&noise>.62,w=.28+noise*.14,d=.27+hash(x,z,91)*.16;
      const footprint=Math.hypot(w,d)*.5+.012;
      if(!land(x,z,footprint)||!clearLand(x,z,footprint)||!reserve(x,z,footprint)||road.distance<footprint+.04||reservedSites.some(q=>Math.hypot(q.x-x,q.z-z)<(q.span||0)+footprint+.08)){
        occupied.delete(key);counts[p.name]--;continue;
      }
      cities.push({x,z,y:h,w,d,h:tall?.9+noise*.95:.20+noise*.47,angle:road.angle,type:tall?2:noise>.5?1:0,region:p.name});
    }
  }
  const step=mobile?1.28:1.0;
  for(let z=bounds[0][1]+.8;z<bounds[1][1]-.8;z+=step)for(let x=bounds[0][0]+.8;x<bounds[1][0]-.8;x+=step){
    const px=x+(hash(x,z,7)-.5)*step*.7,pz=z+(hash(x,z,11)-.5)*step*.7,h=heightAt(px,pz);
    if(h<.20||h>5.4||!land(px,pz,.35)||nearestRoad(px,pz).distance<.24)continue;
    const clustered=hash(Math.floor(px/3),Math.floor(pz/3),2);
    if(hash(px,pz,4)<.16+(h>3.8?.28:0)||clustered<.10)continue;
    let urban=false;for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)if(occupied.has((Math.round(px/.5)+dx)+','+(Math.round(pz/.5)+dz)))urban=true;if(urban)continue;
    if(reservedSites.every(p=>Math.hypot(px-p.x,pz-p.z)>p.span+.55))forest.push([px,pz,h,.43+hash(px,pz,9)*.34]);
  }
  const banks=[],shallows=[];
  // Query both sides to suppress artificial boundaries between adjacent vector tiles.
  for(const rings of data.water)for(const ring of rings)for(let i=1;i<ring.length;i++){
    const a=ring[i-1],b=ring[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<.04)continue;
    const nx=-(b[1]-a[1])/length,nz=(b[0]-a[0])/length;
    const detailedBank=places.some(p=>Math.hypot((a[0]+b[0])/2-p.x,(a[1]+b[1])/2-p.z)<3+(p.span||0));
    const n=Math.max(1,Math.ceil(length/(detailedBank?.025:.30)));
    const treeStride=Math.max(1,Math.ceil(.9/(length/n)));
    for(let j=0;j<n;j++){
      const t=(j+.5)/n,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;
      if(!inside(x,z,.18))continue;
      const left=waterAt(x+nx*.065,z+nz*.065),right=waterAt(x-nx*.065,z-nz*.065);
      if((left===null)===(right===null))continue;
      const side=left===null?1:-1,wh=left??right;
      const p=[a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n],q=[a[0]+(b[0]-a[0])*(j+1)/n,a[1]+(b[1]-a[1])*(j+1)/n];
      const ribbon=(out,offset,water)=>{
        const points=[p,q,[p[0]+nx*offset*side,p[1]+nz*offset*side],[q[0]+nx*offset*side,q[1]+nz*offset*side]];
        if(water&&points.slice(2).some(v=>waterAt(...v)===null))return;
        if(!water&&points.slice(2).some(v=>waterAt(...v)!==null||nearestRoad(...v).distance<.049||bankReserved(...v)))return;
        for(const k of [0,2,1,1,2,3]){const v=points[k];out.push(v[0],water?wh+.005:Math.max(wh,heightAt(...v))+.006,v[1]);}
      };
      ribbon(banks,detailedBank?.025:.065,false);ribbon(shallows,detailedBank?-.025:-.075,true);
      if(j%treeStride===0&&hash(x,z,8)>.55){const tx=x+nx*.25*side,tz=z+nz*.25*side;
        if(land(tx,tz,.14)&&nearestRoad(tx,tz).distance>.20&&Math.abs(heightAt(tx,tz)-wh)<.30&&reservedSites.every(p=>Math.hypot(tx-p.x,tz-p.z)>p.span+.4))riparian.push([tx,tz,heightAt(tx,tz),.23+hash(tx,tz,1)*.16]);
      }
    }
  }
  return {cities,forest,riparian,banks,shallows,counts};
}

export function buildRegionalEnvironment({parent,waterMesh,...options}){
  const layout=generateRegionalEnvironment(options),cityGroup=new THREE.Group(),forestGroup=new THREE.Group(),riverGroup=new THREE.Group();
  cityGroup.name='regional-city-silhouettes';forestGroup.name='regional-forest-canopy';riverGroup.name='riverbanks-and-shallows';parent.add(cityGroup,forestGroup,riverGroup);
  const dummy=new THREE.Object3D(),details=new Map();
  const detail=(r,color,x,y,z,w,h,d)=>{
    if(!details.has(color))details.set(color,[]);
    const co=Math.cos(r.angle),si=Math.sin(r.angle);
    details.get(color).push({x:r.x+x*co+z*si,y:r.y+y,z:r.z-x*si+z*co,w,h,d,angle:r.angle});
  };
  for(const type of [0,1,2]){
    const rows=layout.cities.filter(r=>r.type===type),mat=new THREE.MeshStandardMaterial({color:type===2?'#73989d':type===1?'#a7b59c':'#b5aa90',roughness:.85}),mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),mat,rows.length);
    const roofMat=new THREE.MeshStandardMaterial({color:type===0?'#826e60':'#527979',roughness:.9}),roof=new THREE.InstancedMesh(type===0?new THREE.ConeGeometry(1,1,4):new THREE.BoxGeometry(1,1,1),roofMat,rows.length);
    rows.forEach((r,i)=>{
      dummy.position.set(r.x,r.y+r.h/2,r.z);dummy.rotation.set(0,r.angle,0);dummy.scale.set(r.w,r.h,r.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      dummy.position.y=r.y+r.h+(type===0?.06:.04);dummy.rotation.y=r.angle+(type===0?Math.PI/4:0);dummy.scale.set(r.w*(type===0?.76:.90),type===0?.12:.08,r.d*(type===0?.76:.90));dummy.updateMatrix();roof.setMatrixAt(i,dummy.matrix);
      const doorHeight=Math.min(.13,r.h*.32),floors=Math.max(1,Math.min(7,Math.floor(r.h/.16)));
      detail(r,'#365d60',0,doorHeight/2,r.d/2+.003,r.w*.19,doorHeight,.008);
      for(let floor=0;floor<floors;floor++){
        const y=doorHeight+.045+floor*(r.h-doorHeight-.07)/floors;
        for(const side of [-1,1])for(const col of [-1,1])detail(r,'#456d76',col*r.w*.27,y,side*(r.d/2+.003),r.w*.17,.052,.007);
        if(type!==0)detail(r,'#8da8a0',0,y-.034,r.d/2+.006,r.w*.94,.009,.012);
      }
      if(type===1){detail(r,'#54786d',0,doorHeight+.01,r.d/2+.026,r.w*.52,.015,.058);}
    });
    for(const object of [mesh,roof]){object.castShadow=true;object.receiveShadow=true;object.name='regional-city-building';}
    mesh.computeBoundingSphere();roof.computeBoundingSphere();addSpatialInstances(cityGroup,mesh);addSpatialInstances(cityGroup,roof);
  }
  for(const [color,rows] of details){
    const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color,roughness:.85}),rows.length);mesh.name='regional-city-facades';
    rows.forEach((r,i)=>{dummy.position.set(r.x,r.y,r.z);dummy.rotation.set(0,r.angle,0);dummy.scale.set(r.w,r.h,r.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
    mesh.receiveShadow=true;mesh.computeBoundingSphere();addSpatialInstances(cityGroup,mesh);
  }
  const woodland=buildVegetation({parent:forestGroup,accepted:layout.forest}),riverside=buildVegetation({parent:forestGroup,accepted:layout.riparian});
  const closeTrees=buildVegetation({parent:forestGroup,accepted:[...layout.forest,...layout.riparian].map(([x,z,y,s])=>[x,z,y,s*.22])});
  // Clone shared vegetation materials so LOD fading never affects existing street trees.
  const forestMaterials=[];for(const g of [woodland.group,riverside.group])g.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.alphaHash=true;forestMaterials.push(o.material);}});
  const bankMat=new THREE.MeshStandardMaterial({color:'#8da482',roughness:1,side:THREE.DoubleSide}),shallowMat=new THREE.MeshStandardMaterial({color:'#72b8b6',roughness:.55,side:THREE.DoubleSide});
  for(const [vertices,mat] of [[layout.banks,bankMat],[layout.shallows,shallowMat]]){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();const mesh=new THREE.Mesh(geo,mat);mesh.receiveShadow=true;riverGroup.add(mesh);}
  const time={value:0};
  if(waterMesh){waterMesh.material.onBeforeCompile=shader=>{
    shader.uniforms.uWaterTime=time;
    shader.vertexShader='varying vec3 vWaterWorld;\n'+shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvWaterWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader='uniform float uWaterTime;\nvarying vec3 vWaterWorld;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float swell=sin(vWaterWorld.x*.72+vWaterWorld.z*.41+uWaterTime*.35);
      float ripple=sin(vWaterWorld.x*24.0+sin(vWaterWorld.z*14.0)+uWaterTime*.8);
      float glint=pow(max(0.0,ripple),24.0)*.065;
      diffuseColor.rgb*=.94+.035*swell;
      diffuseColor.rgb+=vec3(.42,.72,.70)*glint;
    `);
  };waterMesh.material.needsUpdate=true;}
  function update(seconds,zoom){time.value=seconds;const opacity=environmentOpacity(zoom);woodland.group.visible=opacity>0;riverside.group.visible=opacity>0;closeTrees.group.visible=zoom>=12;
    for(const mat of forestMaterials)mat.opacity=opacity;
  }
  function setTime(mode){bankMat.color.set(mode==='night'?'#47675c':'#8da482');shallowMat.color.set(mode==='night'?'#326e78':'#72b8b6');}
  const bankDay=new THREE.Color('#8da482'),bankNight=new THREE.Color('#47675c'),shallowDay=new THREE.Color('#72b8b6'),shallowNight=new THREE.Color('#326e78');
  function setLight(night){bankMat.color.copy(bankDay).lerp(bankNight,night);shallowMat.color.copy(shallowDay).lerp(shallowNight,night);}
  return {cityGroup,forestGroup,riverGroup,update,setTime,setLight,stats:{cityBuildings:layout.cities.length,forestTrees:layout.forest.length,riverTrees:layout.riparian.length,bankTriangles:layout.banks.length/9,cityCoverage:layout.counts},layout};
}
