import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const cache=new Map();
export function overviewTree(type){
  if(cache.has(type))return cache.get(type);
  const parts=[];
  function part(geometry,color,x,y,z,sx=1,sy=1,sz=1){
    const g=geometry.index?geometry.toNonIndexed():geometry.clone();geometry.dispose();g.deleteAttribute('uv');
    g.scale(sx,sy,sz);g.translate(x,y,z);
    const c=new THREE.Color(color),values=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<values.length;i+=3){values[i]=c.r;values[i+1]=c.g;values[i+2]=c.b;}
    g.setAttribute('color',new THREE.BufferAttribute(values,3));parts.push(g);
  }
  part(new THREE.BoxGeometry(.07,.75,.07),'#82765b',0,.375,0);
  if(type==='pine')part(new THREE.ConeGeometry(.4,1.04,4),'#548262',0,.82,0);
  else if(type==='bamboo')part(new THREE.BoxGeometry(.48,.8,.4),'#79975a',0,.96,0);
  else{
    const geometry=new THREE.IcosahedronGeometry(type==='palm'?.52:type==='umbrella'?.6:.47,0);
    part(geometry,type==='flowering'?'#da91a3':'#5d926a',0,type==='palm'?1.12:.94,0,1,type==='palm'?.24:type==='umbrella'?.38:1,1);
  }
  const merged=mergeGeometries(parts);parts.forEach(g=>g.dispose());merged.computeBoundingSphere();cache.set(type,merged);return merged;
}
