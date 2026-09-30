import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {prepareWaterContains} from './water-query.mjs';
import {createSpatialIndex} from './world-layout.mjs';

export function createMappedBuildings({group,builder,records,heightAt,waterAt,excluded}){
 const index=createSpatialIndex(.2),batches=new Map();let count=0;
 for(const record of records){
  const {rings,bounds:b}=record,ring=rings[0],x=(b[0]+b[2])/2,z=(b[1]+b[3])/2;
  if(excluded(x,z)||waterAt(x,z)!==null)continue;
  const samples=ring.map(p=>heightAt(...p)).sort((a,b)=>a-b),bottom=samples[0],ground=samples[Math.floor(samples.length/2)];
  const high=Math.max(.009,record.height*.0017),wall=record.height>35?'#b9cbca':['#d0cfc2','#cec3b4','#b8c7c0'][count%3];
  const shape=new THREE.Shape(ring.map(([x,z])=>new THREE.Vector2(x,-z)));
  for(const hole of rings.slice(1))shape.holes.push(new THREE.Path(hole.map(([x,z])=>new THREE.Vector2(x,-z))));
  const geo=new THREE.ExtrudeGeometry(shape,{depth:high+ground-bottom,bevelEnabled:false});geo.rotateX(-Math.PI/2);geo.translate(0,bottom,0);geo.deleteAttribute('uv');
  const cell=`${Math.floor(x)},${Math.floor(z)}`,add=(color,geometry)=>{const tint=new THREE.Color(color),values=new Float32Array(geometry.attributes.position.count*3);for(let i=0;i<values.length;i+=3){values[i]=tint.r;values[i+1]=tint.g;values[i+2]=tint.b;}geometry.setAttribute('color',new THREE.BufferAttribute(values,3));if(!batches.has(cell))batches.set(cell,[]);batches.get(cell).push(geometry);};
  add(wall,geo);
  const top=new THREE.ShapeGeometry(shape).toNonIndexed();top.rotateX(-Math.PI/2);top.translate(0,ground+high+.0003,0);top.deleteAttribute('uv');
  add('#7e8b83',top);
  for(let i=1;i<ring.length;i++){
   const a=ring[i-1],p=ring[i],dx=p[0]-a[0],dz=p[1]-a[1],len=Math.hypot(dx,dz);if(len<.007)continue;
   const columns=Math.min(24,Math.floor(len/.006)),rows=Math.max(1,Math.min(15,Math.floor(high/.0065)));
   for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
    const u=(col+.5)/columns;builder.part('box','#62898a',[a[0]+dx*u,ground+(row+.55)*high/rows,a[1]+dz*u],[Math.min(.0035,len/columns*.6),Math.min(.004,high/rows*.5),.0005],[0,-Math.atan2(dz,dx),0]);
   }
  }
  const contains=prepareWaterContains(rings);index.insert({contains,bounds:b},b[0],b[1],b[2],b[3]);count++;
 }
 const material=new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:.85});
 for(const geos of batches.values()){const mesh=new THREE.Mesh(mergeGeometries(geos),material);mesh.name='mapped-mainland-footprints';mesh.castShadow=true;mesh.receiveShadow=true;mesh.geometry.computeBoundingSphere();group.add(mesh);geos.forEach(g=>g.dispose());}
 return {count,contains:(x,z,pad=0)=>index.at(x,z).some(v=>v.contains(x,z)||(pad&&x>=v.bounds[0]-pad&&x<=v.bounds[2]+pad&&z>=v.bounds[1]-pad&&z<=v.bounds[3]+pad))};
}
