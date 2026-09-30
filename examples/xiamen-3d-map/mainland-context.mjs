import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {terrainTriangle} from './terrain-paving.mjs';
import {prepareWaterContains} from './water-query.mjs';
import {createBuilder} from './living-world.mjs';

export function createMainlandContext({scene,data,heightAt,waterAt,excluded,toWorld}){
 const group=new THREE.Group();group.name='全域真实用地与东渡航站楼细节';scene.add(group);
 const colors={residential:'#aeb5aa',commercial:'#b5bdb9',industrial:'#b4bdbe',retail:'#b9c0b1',school:'#b8bba7',university:'#b8bba7',grass:'#8faa82',wood:'#668563',farmland:'#94a777',sand:'#d0c7ab'},batches=new Map();let surfaces=0;
 for(const cover of data.mainlandCovers||[]){
  const color=colors[cover.kind];if(!color)continue;
  const rings=cover.rings.map(r=>r.slice(0,-1).map(p=>new THREE.Vector2(...p))),points=rings.flat();
  for(const face of THREE.ShapeUtils.triangulateShape(rings[0],rings.slice(1))){const values=terrainTriangle(data.terrain,heightAt,face.map(i=>[points[i].x,points[i].y]),{offset:.0004,accept:(x,z)=>!excluded(x,z)&&waterAt(x,z)===null});for(let i=0;i<values.length;i+=9){const key=color+':'+Math.floor((values[i]+values[i+3]+values[i+6])/6)+','+Math.floor((values[i+2]+values[i+5]+values[i+8])/6);if(!batches.has(key))batches.set(key,[]);const out=batches.get(key);for(let j=0;j<9;j++)out.push(values[i+j]);}}
  surfaces++;
 }
 const materials=new Map();for(const [key,vertices] of batches){if(!vertices.length)continue;const color=key.split(':')[0];if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.95}));const raw=new THREE.BufferGeometry();raw.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const geo=mergeVertices(raw,1e-7);raw.dispose();geo.computeVertexNormals();geo.computeBoundingSphere();const mesh=new THREE.Mesh(geo,materials.get(color));mesh.receiveShadow=true;group.add(mesh);}
 const dock=toWorld(118.069752,24.482735),terminal=(data.mainlandBuildings||[]).filter(b=>Math.hypot((b.bounds[0]+b.bounds[2])/2-dock[0],(b.bounds[1]+b.bounds[3])/2-dock[1])<.4).sort((a,b)=>(b.bounds[2]-b.bounds[0])*(b.bounds[3]-b.bounds[1])-(a.bounds[2]-a.bounds[0])*(a.bounds[3]-a.bounds[1]))[0];
 let ribs=0;
 if(terminal){
  // Footprint is mapped; the wave roof and facade ribs are an architectural interpretation.
  const [x0,z0,x1,z1]=terminal.bounds,inside=prepareWaterContains(terminal.rings),builder=createBuilder(group),x=(x0+x1)/2,z=(z0+z1)/2,y=heightAt(x,z)+terminal.height*.0017;
  const roofVertices=[];let previous=null;
  for(let zz=z0+.003;zz<z1;zz+=.009){
   const samples=Array.from({length:65},(_,i)=>x0+(x1-x0)*i/64).filter(xx=>inside(xx,zz));if(samples.length<2)continue;
   const a=samples[0],b=samples.at(-1),out=[];
   for(let i=0;i<=20;i++){const u=i/20;out.push([a+(b-a)*u,y+.001+Math.sin(Math.PI*u)*.010,zz]);}
   for(let i=1;i<out.length;i++)builder.bar('#e2e6de',out[i-1],out[i],.00065);
   if(previous)for(let i=1;i<out.length;i++){const a=previous[i-1],b=previous[i],c=out[i-1],d=out[i];for(const v of [a,c,b,b,c,d])roofVertices.push(...v);}
   previous=out;
   for(const xx of [a,b]){builder.bar('#d8ded5',[xx,heightAt(xx,zz),zz],[xx,y+.001,zz],.0007);builder.part('box','#719ca8',[xx,y-.002,zz],[.0009,.004,.006]);}
   ribs++;
  }
  builder.finish();
  if(roofVertices.length){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(roofVertices,3));geo.computeVertexNormals();const roof=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#bad3d6',roughness:.35,metalness:.12,side:THREE.DoubleSide}));roof.castShadow=true;roof.receiveShadow=true;group.add(roof);}
 }
 const center=terminal?[(terminal.bounds[0]+terminal.bounds[2])/2,(terminal.bounds[1]+terminal.bounds[3])/2]:null;
 return {view:center?{ll:[data.meta.origin[0]+center[0]/data.meta.sx,data.meta.origin[1]-center[1]/data.meta.sz],radius:.24}:null,getState:()=>({surfaces,terminalRibs:ribs,sourceFootprints:!!terminal,roofInterpretation:true})};
}
