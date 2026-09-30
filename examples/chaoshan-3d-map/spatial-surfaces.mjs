import * as THREE from 'three';

// Keep complete triangles at cell boundaries, so paving cannot acquire cracks.
export function addSpatialSurface(parent, source, cellSize=3){
  const geometry=source.geometry, position=geometry.attributes.position;
  const count=geometry.index?.count??position.count;
  if(count<9000||geometry.groups.length||Array.isArray(source.material)){
    parent.add(source);return source;
  }
  const buckets=new Map(),index=geometry.index;
  for(let i=0;i<count;i+=3){
    const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j);
    const x=ids.reduce((s,j)=>s+position.getX(j),0)/3;
    const z=ids.reduce((s,j)=>s+position.getZ(j),0)/3;
    const key=Math.floor(x/cellSize)+','+Math.floor(z/cellSize);
    if(!buckets.has(key))buckets.set(key,[]);
    buckets.get(key).push(...ids);
  }
  if(buckets.size<2){parent.add(source);return source;}
  const detail=new THREE.Group();detail.userData.staticSpatialTiles=true;
  for(const ids of buckets.values()){
    const tile=new THREE.BufferGeometry();
    for(const [name,attribute] of Object.entries(geometry.attributes)){
      const values=new attribute.array.constructor(ids.length*attribute.itemSize);
      ids.forEach((id,i)=>{
        for(let k=0;k<attribute.itemSize;k++)values[i*attribute.itemSize+k]=attribute.array[id*attribute.itemSize+k];
      });
      tile.setAttribute(name,new THREE.BufferAttribute(values,attribute.itemSize,attribute.normalized));
    }
    tile.computeBoundingSphere();
    const mesh=new THREE.Mesh(tile,source.material);
    mesh.name=source.name;mesh.castShadow=source.castShadow;mesh.receiveShadow=source.receiveShadow;
    detail.add(mesh);
  }
  // Source transforms belong to the wrapper, not both levels.
  const lod=new THREE.LOD();lod.name=source.name;
  lod.position.copy(source.position);lod.quaternion.copy(source.quaternion);lod.scale.copy(source.scale);
  source.position.set(0,0,0);source.quaternion.identity();source.scale.set(1,1,1);
  lod.visible=source.visible;lod.layers.mask=source.layers.mask;
  detail.traverse(o=>{o.layers.mask=source.layers.mask;});
  lod.addLevel(detail,0);lod.addLevel(source,12);parent.add(lod);
  return lod;
}

export function partitionLargeSurfaces(scene){
  const pending=[];
  scene.traverse(o=>{
    if(!o.isMesh||o.isInstancedMesh||o.isSkinnedMesh||o.children.length||o.morphTargetInfluences)return;
    if((o.geometry.index?.count??o.geometry.attributes.position?.count??0)<90000)return;
    for(let p=o.parent;p;p=p.parent)if(p.isLOD)return;
    pending.push(o);
  });
  for(const mesh of pending){const parent=mesh.parent;parent.remove(mesh);addSpatialSurface(parent,mesh);}
  return pending.length;
}
