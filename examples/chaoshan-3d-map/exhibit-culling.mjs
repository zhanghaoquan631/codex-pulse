import * as THREE from 'three';

// Cull whole fixed-location exhibits before Three.js walks their scene graphs.
// The simulation still updates their local poses; re-entry refreshes all matrices.
export function exhibitCulling(models){
  const gates=[],frustum=new THREE.Frustum(),projection=new THREE.Matrix4();
  for(const model of models){
    const root=model.group,parent=root?.parent;if(!parent)continue;
    root.updateWorldMatrix(true,true);
    const bounds=new THREE.Box3().setFromObject(root);
    if(bounds.isEmpty())continue;
    const radius=bounds.getSize(new THREE.Vector3()).length()*.25;
    bounds.expandByScalar(Math.max(.20,radius));
    const sphere=bounds.getBoundingSphere(new THREE.Sphere());
    const gate=new THREE.Group();gate.name='exhibit-visibility';parent.add(gate);gate.add(root);
    const update=gate.updateMatrixWorld;
    gate.updateMatrixWorld=function(){if(this.visible)update.call(this,true);};
    gates.push({gate,sphere});
  }
  return {count:gates.length,update(camera){
    camera.updateMatrixWorld();projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projection);
    for(const {gate,sphere} of gates)gate.visible=frustum.intersectsSphere(sphere);
  }};
}
