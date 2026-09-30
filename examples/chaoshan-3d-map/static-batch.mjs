import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Bake only static decorations. Animated people stay in their own groups.
export function batchStatic(root){
  root.updateMatrixWorld(true);
  const inverse=root.matrixWorld.clone().invert(),buckets=new Map(),remove=[];
  root.traverse(o=>{
    if(!o.isMesh||o.isInstancedMesh||Array.isArray(o.material)||o.material.map)return;
    for(let p=o;p&&p!==root;p=p.parent)if(p.userData.preserveAnimation)return;
    const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld));
    if(!g.attributes.normal)g.computeVertexNormals();
    for(const name of Object.keys(g.attributes))if(!['position','normal','color'].includes(name))g.deleteAttribute(name);
    const key=o.material.uuid+!!g.attributes.color;
    if(!buckets.has(key))buckets.set(key,{material:o.material,geometries:[]});
    buckets.get(key).geometries.push(g);remove.push(o);
  });
  for(const {material,geometries} of buckets.values()){
    const geometry=mergeGeometries(geometries,false);
    if(!geometry)throw new Error('Static geometry batching failed');
    const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.atlasStatic=true;
    mesh.updateMatrix();mesh.matrixAutoUpdate=false;
    root.add(mesh);geometries.forEach(g=>g.dispose());
  }
  remove.forEach(o=>o.removeFromParent());
  const groups=[];root.traverse(o=>{if(o!==root&&o.isGroup)groups.push(o);});
  for(const g of groups.reverse())if(g.children.length===0)g.removeFromParent();
  return buckets.size;
}
