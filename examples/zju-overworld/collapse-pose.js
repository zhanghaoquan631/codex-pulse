/** Three-second kneel, pause, and side-collapse layer for campus avatars.
 * Each frame: prepareCollapsePose(rig), updateAvatar(...), then this pose.
 * progress is absolute 0..1; prepare prevents base-animator height accumulation.
 * Only joint rotations and hips.localPosition change: group/root/motionRoot
 * transforms and scene hierarchy are never modified. No timers or geometry.
 */
const states=new WeakMap();
const clamp=n=>Math.max(0,Math.min(1,Number.isFinite(n)?n:0));
const smooth=n=>n*n*(3-2*n);
const names=['hips','torso','head','upperLegL','upperLegR','lowerLegL','lowerLegR','footL','footR','upperArmL','upperArmR','lowerArmL','lowerArmR','handL','handR'];
const frames=[
 {p:0,hips:[0,0,0],torso:[0,0,0],head:[0,0,0],upperLegL:[0,0,0],upperLegR:[0,0,0],lowerLegL:[0,0,0],lowerLegR:[0,0,0],footL:[0,0,0],footR:[0,0,0],upperArmL:[0,0,.035],upperArmR:[0,0,-.035],lowerArmL:[-.04,0,0],lowerArmR:[-.04,0,0]},
 {p:.18,hips:[.04,0,0],torso:[.16,0,0],head:[-.10,0,0],upperLegL:[-.52,0,0],upperLegR:[-.52,0,0],lowerLegL:[1.04,0,0],lowerLegR:[1.04,0,0],footL:[-.52,0,0],footR:[-.52,0,0],upperArmL:[-.38,0,.14],upperArmR:[-.38,0,-.14],lowerArmL:[-.5,0,0],lowerArmR:[-.5,0,0]},
 {p:.42,hips:[.03,0,0],torso:[.28,0,0],head:[.18,0,0],upperLegL:[-.03,0,0],upperLegR:[-.03,0,0],lowerLegL:[1.61,0,0],lowerLegR:[1.61,0,0],footL:[1.56,0,0],footR:[1.56,0,0],upperArmL:[-.40,0,.20],upperArmR:[-.45,0,-.20],lowerArmL:[-.68,0,0],lowerArmR:[-.72,0,0]},
 {p:.55,hips:[.08,0,-.08],torso:[.38,0,-.08],head:[.20,0,.02],upperLegL:[-.06,0,0],upperLegR:[-.06,0,0],lowerLegL:[1.62,0,0],lowerLegR:[1.62,0,0],footL:[1.55,0,0],footR:[1.55,0,0],upperArmL:[-.40,0,.25],upperArmR:[-.60,0,-.25],lowerArmL:[-.72,0,0],lowerArmR:[-.78,0,0]},
 {p:.78,hips:[.08,.02,-.86],torso:[.27,.03,-.12],head:[.03,-.06,.08],upperLegL:[-.22,0,0],upperLegR:[-.32,0,0],lowerLegL:[1.32,0,0],lowerLegR:[1.42,0,0],footL:[.90,0,0],footR:[.80,0,0],upperArmL:[.20,0,.25],upperArmR:[-.58,-.15,.38],lowerArmL:[-.90,0,.05],lowerArmR:[-1.0,0,0]},
 {p:1,hips:[.08,.02,-Math.PI/2],torso:[.16,.04,-.035],head:[-.04,-.13,.10],upperLegL:[-.42,0,0],upperLegR:[-.28,0,0],lowerLegL:[1.03,0,0],lowerLegR:[1.16,0,0],footL:[.16,0,0],footR:[.06,0,0],upperArmL:[.10,0,-.20],upperArmR:[-.50,-.08,.38],lowerArmL:[-.60,0,0],lowerArmR:[-.90,0,0]}
];

function cache(T,rig){
 const root=rig.root||rig.group,hips=rig.joints.hips;
 const state={root,hips,baseHip:hips.position.clone(),rest:{},body:[],feet:[],anchor:new T.Vector3(),point:new T.Vector3(),mean:new T.Vector3(),inverse:new T.Matrix4(),map:new T.Matrix4(),origin:new T.Vector3(),delta:new T.Vector3()};
 for(const name of names)if(rig.joints[name])state.rest[name]=rig.joints[name].quaternion.clone();
 for(const m of Object.values(rig.meshes||{})){
  if(!m?.isMesh||!m.geometry)continue;if(!m.geometry.boundingBox)m.geometry.computeBoundingBox();const b=m.geometry.boundingBox;if(!b)continue;
  const corners=[];for(let i=0;i<8;i++)corners.push([i&1?b.max.x:b.min.x,i&2?b.max.y:b.min.y,i&4?b.max.z:b.min.z]);state.body.push({mesh:m,corners});
 }
 for(const m of (rig._footMeshes||[rig.meshes?.soleL,rig.meshes?.soleR]).filter(Boolean)){
  if(!m.geometry?.boundingBox)m.geometry?.computeBoundingBox();const b=m.geometry?.boundingBox;if(b)state.feet.push({mesh:m,center:b.getCenter(new T.Vector3())});
 }
 root.updateWorldMatrix(true,true);state.inverse.copy(root.matrixWorld).invert();measure(state);state.anchor.copy(state.mean);states.set(rig,state);return state;
}
function measure(s){
 s.mean.set(0,0,0);let count=0,minY=Infinity;
 for(const {mesh,center}of s.feet){s.point.copy(center).applyMatrix4(mesh.matrixWorld).applyMatrix4(s.inverse);s.mean.add(s.point);count++;}
 if(count)s.mean.multiplyScalar(1/count);
 for(const {mesh,corners}of s.body){if(!mesh.visible)continue;for(const c of corners){s.point.fromArray(c).applyMatrix4(mesh.matrixWorld).applyMatrix4(s.inverse);minY=Math.min(minY,s.point.y);}}
 if(!Number.isFinite(minY))minY=0;return minY;
}

export function applyCollapsePose(T,rig,progress=0){
 if(!rig?.joints?.hips||!(rig.root||rig.group))return rig;
 if(!T?.Matrix4)throw new TypeError('applyCollapsePose requires THREE');
 const p=clamp(progress),s=states.get(rig)||cache(T,rig),j=rig.joints;
 let a=frames[0],b=frames[1];for(let i=1;i<frames.length;i++){a=frames[i-1];b=frames[i];if(p<=b.p)break;}const t=smooth(clamp((p-a.p)/(b.p-a.p)));
 s.hips.position.copy(s.baseHip);
 for(const name of names){if(!j[name])continue;const start=a[name]||[0,0,0],end=b[name]||[0,0,0];j[name].rotation.set(start[0]+(end[0]-start[0])*t,start[1]+(end[1]-start[1])*t,start[2]+(end[2]-start[2])*t);}
 // Ground against the entire original body, so a head/shoulder never sinks
 // after the side roll. Held weapons are deliberately absent from rig.meshes.
 s.root.updateWorldMatrix(true,true);s.inverse.copy(s.root.matrixWorld).invert();const minY=measure(s);
 const dx=s.feet.length?s.anchor.x-s.mean.x:0,dz=s.feet.length?s.anchor.z-s.mean.z:0;
 // Convert a root-local correction to hips-parent space without changing that
 // parent. This also cancels updateAvatar's previous-frame sole correction.
 s.map.copy(s.hips.parent.matrixWorld).invert().multiply(s.root.matrixWorld);s.origin.set(0,0,0).applyMatrix4(s.map);s.delta.set(dx,-minY,dz).applyMatrix4(s.map).sub(s.origin);s.hips.position.add(s.delta);
 s.root.updateWorldMatrix(false,true);return rig;
}

/** Before updateAvatar each frame: restore only the internally displaced hips.
 * The base animator otherwise feeds the previous collapse height into its own
 * sole correction. Keeping its input neutral avoids accumulating parent/child
 * offsets while leaving every root transform untouched by this module.
 */
export function prepareCollapsePose(rig){const s=states.get(rig);if(s)s.hips.position.copy(s.baseHip);return rig;}

/** Call before the next updateAvatar on resurrection, reuse or respawn. */
export function resetCollapsePose(rig){
 const s=states.get(rig);if(!s)return rig;s.hips.position.copy(s.baseHip);for(const [name,q]of Object.entries(s.rest))rig.joints[name]?.quaternion.copy(q);states.delete(rig);return rig;
}
