import {Vector3} from 'three';

// Only geometric tessellation changes. Instance counts, transforms and tints stay intact.
export function createInstanceDetailBudget(scene){
 const items=[],scale=new Vector3(),stats={batches:0,simplified:0};
 scene.traverse(mesh=>{if(mesh.userData.atlasLod)items.push(mesh);});stats.batches=items.length;
 let prior='';
 return {stats,update(camera,height,quality='balanced'){
  const pixels=Math.abs(camera.projectionMatrix.elements[5])*height/2,key=pixels.toFixed(2)+quality;
  if(prior===key)return;prior=key;stats.simplified=0;
  for(const mesh of items){
   const lod=mesh.userData.atlasLod;mesh.getWorldScale(scale);
   const diameter=lod.size*Math.max(scale.x,scale.y,scale.z)*pixels*2;
   const small=quality!=='high'&&diameter<(quality==='light'?20:12);
   mesh.geometry=small?lod.overview:lod.detail;if(small)stats.simplified++;
  }
 }};
}
