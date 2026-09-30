// Unreadable canvas signs are the far-view equivalent of a label collision.
// Keep every building and route; restore the original signs as soon as they are legible.
export function createSignBudget(scene){
 const entries=[],stats={total:0,hidden:0};
 scene.updateMatrixWorld(true);
 scene.traverse(mesh=>{
  if(!mesh.isMesh||mesh.isInstancedMesh||!mesh.material?.map?.isCanvasTexture)return;
  if(!mesh.geometry.boundingSphere)mesh.geometry.computeBoundingSphere();
  const sphere=mesh.geometry.boundingSphere.clone().applyMatrix4(mesh.matrixWorld);
  entries.push({mesh,sphere,visible:mesh.visible});
 });
 stats.total=entries.length;
 let last=-1;
 return {stats,update(camera,height){
  if(!camera.isOrthographicCamera)return;
  const scale=Math.abs(camera.projectionMatrix.elements[5])*height/2;
  if(Math.abs(scale-last)<.01)return;last=scale;stats.hidden=0;
  for(const {mesh,sphere,visible} of entries){mesh.visible=visible&&sphere.radius*scale*2>=7;if(!mesh.visible)stats.hidden++;}
 }};
}
