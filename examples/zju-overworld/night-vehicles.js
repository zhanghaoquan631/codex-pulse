import * as THREE from './vendor/three.module.js';
import {createVehicleRider} from './vehicle-rider.js?v=11';
// Ambient drivers stop before leaving the seat. They remain the same rig and
// return on foot to the parked vehicle; no unoccupied car continues its route.
export function updateNightVehicles(life){
 const night=life.survival.enabled&&(life.atmosphere.hour>=16||life.atmosphere.hour<6);
 for(const car of life.vehicles){
  if(car.boat||car.rental||car.controlled||life.ride?.car===car||life.pickup===car||car.nightDriver||!night||car.zoneBroken||!car.rider||!car.rig)continue;
  const p=car.group.position,h=car.group.rotation.y;if(life.safeZone?.active&&!life.insideSafeZone(p))continue;let exit=null;
  for(const side of [-1,1])for(const ahead of [0,-car.length/2-1,car.length/2+1]){const lateral=side*(car.width/2+.85),x=p.x+Math.cos(h)*lateral+Math.sin(h)*ahead,z=p.z-Math.sin(h)*lateral+Math.cos(h)*ahead;if(life.monsterWalkable(x,z)){exit={x,z};break;}}
  if(!exit)continue;
  car.nightParked=true;car.actualSpeed=0;car.rider.detach();car.rider=null;
  const rig=car.rig,root=life.root(rig);root.scale.set(1,1,1);root.position.set(exit.x,.16,exit.z);life.world.add(root);
  const n=car.nightDriver={rig,pos:new THREE.Vector3(exit.x,.16,exit.z),kind:'night-driver',speed:1.9,name:'回房的司机'};
  life.nightResidents.addResident(n,{managedOnly:true,onReturn(){
   life.nightResidents.removeResident(n);const index=life.npcs.indexOf(n);if(index>=0)life.npcs.splice(index,1);
   car.rider=createVehicleRider(THREE,car,rig);car.nightDriver=null;car.nightParked=false;car.actualSpeed=0;
  }});
 }
}
