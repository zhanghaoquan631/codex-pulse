import * as THREE from 'three';
import {person,residentOutfit} from './scene-miniatures.mjs';

export function amenityPose(type,t,index=0){
 const duration=19+(index%5)*1.7,phase=((t+index*3.71)%duration+duration)%duration;
 const u=phase/duration,windows=type==='tea'?[[.05,.32,'drink'],[.43,.76,'talk']]:type==='market'?[[.04,.48,'arrange'],[.70,.95,'wave']]:[[.16,.39,'stretch'],[.64,.93,'talk']];
 const active=windows.find(([start,end])=>u>start&&u<end);
 const smooth=x=>x*x*(3-2*x);
 // Fade both ends of an activity; a paused tab may resume at any phase.
 const weight=active?smooth(Math.min(1,(phase-active[0]*duration)/.9,(active[1]*duration-phase)/.9)):0;
 return {state:type==='market'?'look':'sit',gesture:active?.[2]??null,weight,
  turn:Math.sin(u*Math.PI*2)*(type==='tea'?.06:type==='market'?.14:.12)};
}

export function addAmenityPeople(parent,site,index){
 const positions=site.type==='tea'?[[-.021,0,Math.PI/2],[.021,0,-Math.PI/2]]:site.type==='market'?[[0,-.024,0]]:[[0,0,0]];
 return positions.map(([x,z,yaw],i)=>{
  const actor=person(parent,(index*3+i)%56,{scale:.010,outfit:residentOutfit(site.type,index+i)});
  actor.root.position.set(x,site.type==='market'?0:.004,z);actor.root.rotation.y=yaw;
  actor.root.userData.preserveAnimation=true;
  const right=actor.root.children[4],left=actor.root.children[3];
  if(site.type==='tea'){
   const cup=new THREE.Mesh(new THREE.CylinderGeometry(.17,.13,.21,8),new THREE.MeshStandardMaterial({color:'#c7b685',roughness:.8}));
   cup.position.set(0,-.65,.08);right.add(cup);
  }
  actor.ambientUpdate=t=>{
   const p=amenityPose(site.type,t,index+i);actor.pose(t,p.state);actor.root.rotation.y=yaw+p.turn;
   if(p.gesture==='drink'){right.rotation.x=-2.0+Math.sin(t*.8+index)*.11;right.rotation.z=-.2;}
   else if(p.gesture==='arrange'){left.rotation.x=-.9+Math.sin(t*1.5+index)*.23;right.rotation.x=-.8-Math.sin(t*1.5+index)*.23;}
   else if(p.gesture==='stretch'){left.rotation.z=1.1;right.rotation.z=-1.1;left.rotation.x=right.rotation.x=-.25;}
   else if(p.gesture)actor.gesture(t,p.gesture);
   for(const arm of [left,right]){arm.rotation.x*=p.weight;arm.rotation.z*=p.weight;}
  };
  actor.ambientUpdate(0);return actor;
 });
}
