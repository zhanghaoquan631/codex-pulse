import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {prepareRingContains} from './water-query.mjs';
import {createSpatialIndex,distanceToSegment} from './world-layout.mjs';
import {terrainTriangle} from './terrain-paving.mjs';

export function createIslandTerrain(detail,baseHeightAt){
  const rings=detail.shoreline;if(!rings?.length)return null;
  const ring=rings[0],contains=prepareRingContains(ring),xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]);
  const bounds=[[Math.min(...xs),Math.min(...zs)],[Math.max(...xs),Math.max(...zs)]],shore=createSpatialIndex(.04);
  for(let i=1;i<ring.length;i++){const a=ring[i-1],b=ring[i];shore.insert({a,b},Math.min(a[0],b[0])-.024,Math.min(a[1],b[1])-.024,Math.max(a[0],b[0])+.024,Math.max(a[1],b[1])+.024);}
  const terrain={bounds,nx:Math.ceil((bounds[1][0]-bounds[0][0])/.008),nz:Math.ceil((bounds[1][1]-bounds[0][1])/.008)};
  function sourceHeight(x,z){
    const h=Math.max(.014,baseHeightAt(x,z)),near=shore.at(x,z);
    const distance=near.length?Math.min(...near.map(e=>distanceToSegment(x,z,e.a,e.b))):1,t=Math.min(1,distance/.022),blend=t*t*(3-2*t);
    return .014+(h-.014)*blend;
  }
  const {nx,nz}=terrain,sx=(bounds[1][0]-bounds[0][0])/nx,sz=(bounds[1][1]-bounds[0][1])/nz,heights=[];
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++)heights.push(sourceHeight(bounds[0][0]+i*sx,bounds[0][1]+j*sz));
  function heightAt(x,z){
    const gx=THREE.MathUtils.clamp((x-bounds[0][0])/sx,0,nx-.000001),gz=THREE.MathUtils.clamp((z-bounds[0][1])/sz,0,nz-.000001),ix=Math.floor(gx),iz=Math.floor(gz),a=gx-ix,b=gz-iz,k=iz*(nx+1)+ix;
    const h00=heights[k],h10=heights[k+1],h01=heights[k+nx+1],h11=heights[k+nx+2];
    return a+b<=1?h00+(h10-h00)*a+(h01-h00)*b:h11+(h01-h11)*(1-a)+(h10-h11)*(1-b);
  }
  function addTo(scene){
    const points=rings.map(r=>r.slice(0,-1).map(p=>new THREE.Vector2(...p))),flat=points.flat(),vertices=[];
    for(const face of THREE.ShapeUtils.triangulateShape(points[0],points.slice(1)))for(const value of terrainTriangle(terrain,heightAt,face.map(i=>[flat[i].x,flat[i].y]),{offset:0}))vertices.push(value);
    const raw=new THREE.BufferGeometry();raw.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const geo=mergeVertices(raw,1e-6);geo.computeVertexNormals();raw.dispose();
    const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#87a17b',roughness:1,side:THREE.DoubleSide}));mesh.name='鼓浪屿连续岸线地形';mesh.receiveShadow=true;scene.add(mesh);
    return mesh;
  }
  const coversCell=(x,z,w,d)=>x+w>=bounds[0][0]&&x<=bounds[1][0]&&z+d>=bounds[0][1]&&z<=bounds[1][1];
  return {heightAt,terrain,covers:contains,coversCell,addTo};
}
