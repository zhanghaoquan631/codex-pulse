import * as THREE from 'three';

// Static instances need local bounds: one map-wide batch defeats frustum culling.
export function addSpatialInstances(parent,source,cellSize=4,overviewGeometry){
  if(source.count<256){parent.add(source);return [source];}
  const buckets=new Map(),matrix=new THREE.Matrix4(),color=new THREE.Color();
  for(let i=0;i<source.count;i++){
    source.getMatrixAt(i,matrix);
    const key=Math.floor(matrix.elements[12]/cellSize)+','+Math.floor(matrix.elements[14]/cellSize);
    if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(i);
  }
  const tiles=[],detail=new THREE.Group();detail.userData.staticSpatialTiles=true;
  for(const indices of buckets.values()){
    const tile=new THREE.InstancedMesh(source.geometry,source.material,indices.length);
    tile.name=source.name;tile.position.copy(source.position);tile.quaternion.copy(source.quaternion);tile.scale.copy(source.scale);
    tile.castShadow=source.castShadow;tile.receiveShadow=source.receiveShadow;tile.visible=source.visible;
    indices.forEach((original,i)=>{source.getMatrixAt(original,matrix);tile.setMatrixAt(i,matrix);if(source.instanceColor){source.getColorAt(original,color);tile.setColorAt(i,color);}});
    tile.computeBoundingBox();tile.computeBoundingSphere();detail.add(tile);tiles.push(tile);
  }
  // The overview also needs bounds; a single world-sized batch draws off-screen districts.
  if(overviewGeometry)source.geometry=overviewGeometry;
  const farBuckets=new Map(),overview=new THREE.Group();overview.userData.staticSpatialTiles=true;
  for(let i=0;i<source.count;i++){
    source.getMatrixAt(i,matrix);const key=Math.floor(matrix.elements[12]/(cellSize*3))+','+Math.floor(matrix.elements[14]/(cellSize*3));
    if(!farBuckets.has(key))farBuckets.set(key,[]);farBuckets.get(key).push(i);
  }
  for(const indices of farBuckets.values()){
    const tile=new THREE.InstancedMesh(source.geometry,source.material,indices.length);
    tile.name=source.name;tile.position.copy(source.position);tile.quaternion.copy(source.quaternion);tile.scale.copy(source.scale);
    tile.castShadow=source.castShadow;tile.receiveShadow=source.receiveShadow;tile.visible=source.visible;
    indices.forEach((original,i)=>{source.getMatrixAt(original,matrix);tile.setMatrixAt(i,matrix);if(source.instanceColor){source.getColorAt(original,color);tile.setColorAt(i,color);}});
    tile.computeBoundingBox();tile.computeBoundingSphere();overview.add(tile);
  }
  const lod=new THREE.LOD();lod.addLevel(detail,0);lod.addLevel(overview,12);parent.add(lod);source.dispose();return tiles;
}
