import * as THREE from './vendor/three.module.js';

// The room uses local metres. Its south door corresponds to the mapped entrance.
export function outsideCamera(camera, door, result = camera.clone()) {
  result.copy(camera, false);
  const x=camera.position.x,z=camera.position.z-18,c=Math.cos(door.angle),s=Math.sin(door.angle);
  result.position.set(door.x+x*c+z*s,camera.position.y+.15,door.z-x*s+z*c);
  result.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),door.angle));
  result.updateMatrixWorld();
  return result;
}
export const interiorViewMethods={
  renderScene(renderer,camera){
    if(!this.room){renderer.render(this.world,camera);return;}
    const room=this.room,feature=room.feature,view=outsideCamera(camera,feature.entrance,this.exteriorCamera||(this.exteriorCamera=camera.clone()));
    const changed=[];
    const show=(object,visible)=>{if(object&&object.visible!==visible){changed.push([object,object.visible]);object.visible=visible;}};
    // Never draw the opaque mapped shell across the room's window openings.
    for(const o of [feature.mesh,feature.wallGroup,feature.glazingGroup,feature.entrance.group])show(o,false);
    for(const n of this.npcs)show(this.root(n.rig),this.root(n.rig).position.distanceTo(view.position)<160);
    for(const v of this.vehicles)show(v.group,v.group.position.distanceTo(view.position)<250);
    const autoClear=renderer.autoClear,background=room.scene.background;
    try{
      renderer.autoClear=true;renderer.render(this.world,view);
      renderer.autoClear=false;renderer.clearDepth();room.scene.background=null;
      renderer.render(room.scene,camera);
    }finally{
      renderer.autoClear=autoClear;room.scene.background=background;
      for(const [object,visible] of changed)object.visible=visible;
    }
  }
};
