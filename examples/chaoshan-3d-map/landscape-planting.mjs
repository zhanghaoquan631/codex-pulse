import * as THREE from 'three';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {addSpatialInstances} from './spatial-instances.mjs';

const cache=new Map(),up=new THREE.Vector3(0,1,0);
const palettes={meadow:['#477245','#688c52','#f4d566'],flowers:['#467244','#68914f','#dd8eae'],woodland:['#396a46','#648e50','#d7dfb1'],coastal:['#567c49','#7d995c','#f0d89b'],garden:['#42754c','#69934f','#e9b2c5']};
export const plantingTypes=Object.keys(palettes);

export function plantingGeometry(type,low=false){
 const key=type+'-'+low;if(cache.has(key))return cache.get(key);
 const colors=palettes[type]||palettes.meadow,parts=[];
 const add=(geometry,color,x=0,y=0,z=0,sx=1,sy=1,sz=1)=>{
  const g=geometry.index?geometry.toNonIndexed():geometry;g.deleteAttribute('uv');g.scale(sx,sy,sz);g.translate(x,y,z);
  const c=new THREE.Color(color),values=new Float32Array(g.attributes.position.count*3);
  for(let i=0;i<values.length;i+=3){values[i]=c.r;values[i+1]=c.g;values[i+2]=c.b;}
  g.setAttribute('color',new THREE.BufferAttribute(values,3));parts.push(g);if(g!==geometry)geometry.dispose();
 };
 // Only woody shrubs have a solid canopy. Meadows and flowers grow from leaf fans.
 const lobes=type==='woodland'?3:0;
 for(let i=0;i<lobes;i++){
  const a=i*2.399,r=.30+(i%2)*.08;
  let geometry;
  if(low){
   const vertices=[];for(let k=0;k<6;k++){const a=k*Math.PI/3,b=(k+1)*Math.PI/3;vertices.push(0,1,0,Math.sin(a),0,Math.cos(a),Math.sin(b),0,Math.cos(b));}
   geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
  }else geometry=new THREE.SphereGeometry(1,8,4,0,Math.PI*2,0,Math.PI/2);
  add(geometry,colors[i%2],Math.sin(a)*r,.015,Math.cos(a)*r,.44,.22+(i%2)*.08,.39);
 }
 function blade(x,z,a,h,w,bend,color){
  const verts=[],segments=low?1:3;
  const point=(t,side)=>{
   const reach=bend*t*t,spread=(low?1-t:Math.sin(Math.PI*t)) *w;
   return [x+Math.sin(a)*reach+Math.cos(a)*spread*side,.015+h*(t-.18*t*t),z+Math.cos(a)*reach-Math.sin(a)*spread*side];
  };
  for(let i=0;i<segments;i++){const a0=point(i/segments,-1),b0=point(i/segments,1),a1=point((i+1)/segments,-1),b1=point((i+1)/segments,1);verts.push(...a0,...a1,...b0,...b0,...a1,...b1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.computeVertexNormals();add(g,color);
 }
 const clusters=type==='woodland'?3:5,perCluster=low?2:5;
 for(let i=0;i<clusters;i++){
  const a=i*2.399,r=.15+(i%3)*.16,x=Math.sin(a)*r,z=Math.cos(a)*r;
  for(let j=0;j<perCluster;j++){
   const turn=a+j*2.399,height=.27+((i*3+j)%5)*.065;
   blade(x,z,turn,height,type==='woodland'?.072:type==='coastal'?.030:.038,.18+(j%3)*.06,colors[(i+j)%2]);
  }
 }
 const flowers=type==='flowers'||type==='garden'?5:0;
 for(let i=0;i<flowers;i++){
  const a=i*2.399+.4,r=.18+(i%3)*.18,x=Math.sin(a)*r,z=Math.cos(a)*r,h=.34+(i%3)*.12;
  if(!low){add(new THREE.CylinderGeometry(.012,.016,h,4),colors[0],x,h/2,z);blade(x,z,a+1.2,h*.6,.05,.14,colors[1]);}
  const flowerColor=i%3===0?'#f3edce':colors[2];
  if(low){const g=new THREE.CircleGeometry(.12,5);g.rotateX(-Math.PI/2);add(g,flowerColor,x,h,z);}
  else{
   for(let petal=0;petal<5;petal++){
    const a=petal*Math.PI*2/5,vertices=[0,0,0,-.064,.016,.095,0,.04,.095,0,.04,.095,-.064,.016,.095,0,.02,.18,0,0,0,0,.04,.095,.064,.016,.095,0,.04,.095,0,.02,.18,.064,.016,.095];
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();g.rotateY(a);add(g,flowerColor,x,h,z);
   }
   add(new THREE.SphereGeometry(.048,5,2),'#c9a846',x,h+.027,z,1,.5,1);
  }
 }
 const merged=mergeGeometries(parts),geometry=mergeVertices(merged);merged.dispose();parts.forEach(p=>p.dispose());geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.userData={plantingType:type,solidCanopies:lobes,leafFans:clusters,overview:low};cache.set(key,geometry);return geometry;
}

export function planSoftLandscape(cells,{heightAt}={}){
 const rows=[];
 for(const c of cells){
  if(!c.profile||c.nearBuilding||c.kind==='walk'||c.kind==='bank'||c.setting?.treatment==='crop')continue;
  const {family,phase}=c.profile;
  const field=Math.sin(c.x*6.1+Math.sin(c.z*3.2)+phase)+Math.cos(c.z*5.3-c.x*1.8);
  const natural=['forest','lake','fishing','headland','dune','river'].includes(family);
  if(field<(natural?-1.3:-.4))continue;
  const flowerBand=Math.sin(c.x*3.2+phase)*.6+Math.cos(c.z*4.1-phase);
  let type=family==='forest'||family==='tea'?'woodland':family==='headland'||family==='dune'?'coastal':family==='courtyard'||family==='arcade'?'garden':'meadow';
  if(flowerBand>1.02&&family!=='forest')type='flowers';
  const radius=Math.min(.06,c.size*.49),a=c.seed*2.399;
  const x=c.x+Math.sin(a)*c.size*.025,z=c.z+Math.cos(a)*c.size*.025,y=heightAt?heightAt(x,z):c.y;
  const slopeX=heightAt?(heightAt(x+radius,z)-heightAt(x-radius,z))/(radius*2):0,slopeZ=heightAt?(heightAt(x,z+radius)-heightAt(x,z-radius))/(radius*2):0;
  rows.push({x,y:y+.001,z,radius,turn:a,type,normal:[-slopeX,1,-slopeZ],owner:c.regionalOwner||c.owner});
 }
 return rows;
}

export function applyMeadowSurface(material){
 const previous=material.onBeforeCompile;
 material.onBeforeCompile=function(shader,renderer){
  previous?.call(this,shader,renderer);
  shader.vertexShader='varying vec3 vMeadowWorld;\n'+shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvMeadowWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader=`varying vec3 vMeadowWorld;
   float meadowHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
   float meadowNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(meadowHash(i),meadowHash(i+vec2(1.,0.)),f.x),mix(meadowHash(i+vec2(0.,1.)),meadowHash(i+vec2(1.,1.)),f.x),f.y);}
  `+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec2 ground=vMeadowWorld.xz;
   float meadow=meadowNoise(ground*1.8+vec2(3.2,7.1));
   float fine=meadowNoise(ground*120.0);
   float detail=1.0-smoothstep(.2,.9,max(fwidth(ground.x*120.0),fwidth(ground.y*120.0)));
   diffuseColor.rgb*=mix(vec3(.57,.76,.51),vec3(.85,.98,.71),meadow);
   diffuseColor.rgb*=1.0+(fine-.5)*.07*detail;
  `);
 };
 material.customProgramCacheKey=()=> 'continuous-meadow-v2';material.needsUpdate=true;
}

export function addSoftLandscape(parent,rows,name='soft-landscape'){
 const root=new THREE.Group();root.name=name;parent.add(root);
 const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}),d=new THREE.Object3D(),normal=new THREE.Vector3(),yaw=new THREE.Quaternion();
 const counts={};
 for(const type of plantingTypes){
  const items=rows.filter(p=>p.type===type);counts[type]=items.length;if(!items.length)continue;
  const mesh=new THREE.InstancedMesh(plantingGeometry(type),material,items.length);mesh.name=name+'-'+type;
  items.forEach((p,i)=>{
   d.position.set(p.x,p.y,p.z);d.scale.setScalar(p.radius);normal.fromArray(p.normal||[0,1,0]).normalize();
   d.quaternion.setFromUnitVectors(up,normal);yaw.setFromAxisAngle(up,p.turn||0);d.quaternion.multiply(yaw);d.updateMatrix();mesh.setMatrixAt(i,d.matrix);
  });
  mesh.receiveShadow=true;mesh.computeBoundingSphere();addSpatialInstances(root,mesh,2,plantingGeometry(type,true));
 }
 root.userData.planting={count:rows.length,types:counts};return root;
}
