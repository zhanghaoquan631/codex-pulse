import * as THREE from 'three';

// Only opt-in, immobile spatial tiles are indexed. Animated actors remain untouched.
export function createStaticVisibility(scene,{leafSize=12}={}){
  const roots=[],trees=[],stats={trees:0,totalTiles:0,nodes:0,tested:0,visibleTiles:0};
  scene.traverse(root=>{if(root.userData.staticSpatialTiles&&root.children.length>leafSize)roots.push(root);});
  function gate(group){
    const update=group.updateMatrixWorld;
    group.updateMatrixWorld=function(force){if(this.visible)update.call(this,force);};
    return update;
  }
  function branch(items){
    const group=new THREE.Group(),bounds=new THREE.Box3();group.name='static-visibility-cell';
    items.forEach(item=>bounds.union(item.bounds));gate(group);stats.nodes++;
    const node={group,bounds,casts:items.some(i=>i.mesh.castShadow),count:items.length};
    if(items.length<=leafSize){items.forEach(i=>group.add(i.mesh));return node;}
    const size=bounds.getSize(new THREE.Vector3()),axis=size.x>=size.z?'x':'z';
    items.sort((a,b)=>(a.bounds.min[axis]+a.bounds.max[axis])-(b.bounds.min[axis]+b.bounds.max[axis]));
    const middle=Math.floor(items.length/2);node.children=[branch(items.slice(0,middle)),branch(items.slice(middle))];
    node.children.forEach(n=>group.add(n.group));return node;
  }
  for(const root of roots){
    const items=[];
    for(const mesh of [...root.children]){
      if(!mesh.isMesh||mesh.children.length||mesh.isSkinnedMesh||mesh.morphTargetInfluences)continue;
      mesh.updateMatrix();
      if(mesh.isInstancedMesh){if(!mesh.boundingBox)mesh.computeBoundingBox();}
      else if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
      const bounds=(mesh.isInstancedMesh?mesh.boundingBox:mesh.geometry.boundingBox).clone().applyMatrix4(mesh.matrix);
      if(bounds.isEmpty()||!bounds.min.toArray().concat(bounds.max.toArray()).every(Number.isFinite))continue;
      items.push({mesh,bounds});
    }
    if(items.length<=leafSize)continue;
    const node=branch(items);root.add(node.group);
    trees.push({root,node,originalUpdate:gate(root),items});stats.totalTiles+=items.length;
  }
  stats.trees=trees.length;
  const projection=new THREE.Matrix4(),localProjection=new THREE.Matrix4(),view=new THREE.Frustum(),shadows=[];
  function visit(node,shadowFrustums){
    stats.tested++;
    node.group.visible=view.intersectsBox(node.bounds)||(node.casts&&shadowFrustums.some(f=>f.intersectsBox(node.bounds)));
    if(!node.group.visible)return;
    if(node.children)node.children.forEach(n=>visit(n,shadowFrustums));else stats.visibleTiles+=node.count;
  }
  return {stats,update(camera,lights=[]){
    stats.tested=0;stats.visibleTiles=0;camera.updateMatrixWorld();projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    shadows.length=0;
    for(const light of lights){
      if(!light.castShadow||!light.visible||!light.target||!light.shadow)continue;
      light.updateWorldMatrix(true,false);light.target.updateWorldMatrix(true,false);light.shadow.updateMatrices(light);
      shadows.push(new THREE.Matrix4().multiplyMatrices(light.shadow.camera.projectionMatrix,light.shadow.camera.matrixWorldInverse));
    }
    for(const tree of trees){
      const {root,node}=tree;root.updateWorldMatrix(true,false);
      if(root.parent?.isLOD)root.parent.update(camera);
      let visible=true;for(let o=root;o;o=o.parent)if(!o.visible){visible=false;break;}
      if(!visible)continue;
      view.setFromProjectionMatrix(localProjection.multiplyMatrices(projection,root.matrixWorld),camera.coordinateSystem,camera.reversedDepth);
      const shadowFrustums=shadows.map(p=>new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(p,root.matrixWorld)));
      visit(node,shadowFrustums);
    }
  },dispose(){
    for(const {root,node,items,originalUpdate} of trees){items.forEach(i=>root.add(i.mesh));root.remove(node.group);root.updateMatrixWorld=originalUpdate;}
    trees.length=0;
  }};
}
