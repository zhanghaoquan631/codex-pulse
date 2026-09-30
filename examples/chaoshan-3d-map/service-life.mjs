import * as THREE from 'three';
import {person,box,material} from './scene-miniatures.mjs';

const smooth=x=>{x=THREE.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
export function serviceActivityPose(staff,t,index=0){
 const duration=staff.activity==='carry'?34:22+(index%5)*2.3;
 const phase=((t+index*4.17)%duration+duration)%duration;
 const pose={position:[...staff.position],yaw:staff.yaw,state:staff.seated?'sit':'look',weight:0,gait:0};
 if(staff.activity==='carry'){
  const moving=phase>=5&&phase<12||phase>=20&&phase<27;
  const u=phase<5?0:phase<12?smooth((phase-5)/7):phase<20?1:phase<27?1-smooth((phase-20)/7):0;
  pose.position[0]=THREE.MathUtils.lerp(staff.position[0],staff.endX,u);
  const turn=phase<3?0:phase<5?smooth((phase-3)/2):phase<12?1:phase<14?1+smooth((phase-12)/2):phase<18?2:phase<20?2+smooth((phase-18)/2):phase<27?3:phase<29?3+smooth((phase-27)/2):4;
  pose.yaw=turn*Math.PI/2*staff.mirror;pose.state=moving?'walk':'look';pose.weight=1;
  if(moving){const local=phase<12?phase-5:phase-20;pose.gait=smooth(local/.8)*smooth((7-local)/.8);}
 }else{
  const begin=duration*.13,end=duration*.80;
  pose.weight=smooth((phase-begin)/1.2)*smooth((end-phase)/1.2);
 }
 return pose;
}

// Keep worker torsos and the delivery aisle clear of solid fixtures.
export function serviceStaffFits(program){
 const s=program.staff;if(!s)return false;
 for(let i=0;i<=8;i++){
  const x=THREE.MathUtils.lerp(s.position[0],s.endX??s.position[0],i/8),z=s.position[2],r=s.scale*.62;
  const bottom=s.position[1]+s.scale*.95,top=s.position[1]+s.scale*2.45;
  if(program.parts.some(p=>p.y+p.h/2>bottom&&p.y-p.h/2<top&&x+r>p.x-p.w/2&&x-r<p.x+p.w/2&&z+r>p.z-p.d/2&&z-r<p.z+p.d/2))return false;
 }
 return true;
}

export function chooseServiceResidents(parcels,seed=0,limit=2){
 const choices=parcels.filter(p=>p.size>=.05&&serviceStaffFits(p.program)),chosen=[],types=new Set();
 if(!choices.length)return chosen;
 for(let i=0;i<choices.length&&chosen.length<limit;i++){
  const p=choices[(i+seed)%choices.length];if(types.has(p.service[0]))continue;
  chosen.push(p);types.add(p.service[0]);
 }
 return chosen;
}

const cylinder=new THREE.CylinderGeometry(1,1,1,8),sphere=new THREE.SphereGeometry(1,8,6);
function rounded(parent,color,x,y,z,w,h,d,geometry=cylinder){const p=new THREE.Mesh(geometry,material(color));p.position.set(x,y,z);p.scale.set(w,h,d);parent.add(p);return p;}
function heldProp(actor,type){
 const prop=new THREE.Group(),right=actor.root.children[4];prop.name='service-'+type;
 if(type==='box'||type==='basket'){
  actor.root.add(prop);prop.position.set(0,1.04,.50);
  box(prop,'#9d815b',0,-.22,0,.82,.43,.53);box(prop,'#c7ad7a',0,.22,0,.11,.014,.54);
  if(type==='basket')for(const x of [-.24,0,.24])rounded(prop,'#719b94',x,.27,0,.11,.06,.21,sphere);
 }else{
  right.add(prop);prop.position.set(0,-.65,.05);
  if(type==='cup'){
   rounded(prop,'#ccb383',0,.01,0,.18,.25,.18);rounded(prop,'#617650',0,.14,0,.15,.008,.15);
  }else if(type==='flowers'){
   for(const x of [-.14,0,.14]){box(prop,'#547b53',x,0,0,.023,.43,.023);rounded(prop,['#b96188','#d7bc69','#a088b5'][Math.round((x+.14)/.14)],x,.45,0,.13,.11,.12,sphere);}
  }else if(type==='book'){
   box(prop,'#637b98',0,0,0,.48,.06,.43);box(prop,'#dddcc8',0,.06,0,.43,.03,.39);box(prop,'#7b8d7c',0,.09,0,.015,.012,.39);
  }else if(type==='spoon'){
   box(prop,'#9a8564',0,-.10,0,.034,.65,.034);rounded(prop,'#b0bbb0',0,.56,0,.10,.13,.035,sphere);
  }else if(type==='vase'){
   rounded(prop,'#b18470',0,.04,0,.18,.24,.18,sphere);rounded(prop,'#8e7567',0,.27,0,.09,.14,.09);
  }else rounded(prop,'#bc9e68',0,.03,0,.20,.12,.13,sphere);
 }
 return prop;
}

export function addServiceResident(parent,parcel,index=0){
 const {staff}=parcel.program;if(!serviceStaffFits(parcel.program))return null;
 const actor=person(parent,index%56,{scale:staff.scale,outfit:staff.outfit});
 actor.root.userData.preserveAnimation=true;
 actor.root.userData.serviceResident={type:parcel.service[0],activity:staff.activity,prop:staff.prop};
 heldProp(actor,staff.prop);
 const left=actor.root.children[3],right=actor.root.children[4],body=actor.root.children[0];
 actor.ambientUpdate=t=>{
  const p=serviceActivityPose(staff,t,index);actor.pose(t,p.state);actor.root.position.fromArray(p.position);actor.root.rotation.y=p.yaw;
  if(staff.activity==='carry')for(const leg of actor.root.children.slice(1,3))leg.rotation.x*=p.gait;
  const wave=Math.sin(t*1.8+index),w=p.weight;
  let lx=0,rx=0,lz=0,rz=0;
  if(staff.activity==='sip'){rx=-2.0+wave*.10;rz=-.15;}
  else if(staff.activity==='read'){lx=-1.15;rx=-1.4;}
  else if(staff.activity==='stir'){rx=-1.05+wave*.25;rz=Math.cos(t*1.8+index)*.20;lx=-.45;}
  else if(staff.activity==='pour'){rx=-1.1;rz=-.55+wave*.17;lx=-.7;}
  else if(staff.activity==='carry'||staff.activity==='restock'){lx=rx=-.95;lz=-.2;rz=.2;}
  else{lx=-.80+wave*.18;rx=-1.0-wave*.18;lz=-.15;rz=.15;}
  left.rotation.set(lx*w,0,lz*w);right.rotation.set(rx*w,0,rz*w);body.rotation.x=staff.activity==='read'?(.08+wave*.025)*w:0;
 };
 actor.ambientUpdate(0);return actor;
}
