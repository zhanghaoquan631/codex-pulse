import {Frustum,Matrix4,Sphere} from 'three';
const frustum=new Frustum(),projection=new Matrix4(),sphere=new Sphere();
let enabled=false,pixelsPerUnit=Infinity;
export function setCrowdView(camera,height=globalThis.innerHeight||1000){
 enabled=!!camera;if(!camera){pixelsPerUnit=Infinity;return;}
 pixelsPerUnit=camera.isOrthographicCamera?Math.abs(camera.projectionMatrix.elements[5])*height/2:Infinity;
 camera.updateMatrixWorld();projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projection);
}
export function crowdDetail(worldHeight,threshold=7){return worldHeight*pixelsPerUnit>=threshold;}
export function uploadVisibleInstances(mesh){
 if(!mesh.count)return;
 mesh.instanceMatrix.clearUpdateRanges();mesh.instanceMatrix.addUpdateRange(0,mesh.count*16);mesh.instanceMatrix.needsUpdate=true;
}
// Simulation continues off-screen. Only instance uploads and draw counts are compacted.
export function inCrowdView(position,radius=.13){
 if(!enabled)return true;sphere.center.copy(position);sphere.radius=radius;return frustum.intersectsSphere(sphere);
}
