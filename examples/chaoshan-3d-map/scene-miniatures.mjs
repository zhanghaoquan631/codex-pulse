import * as THREE from 'three';
import {personGeometry,vehicleGeometry,treeGeometry,outfitTypes} from './street-life.mjs';
import {communityActors} from './community-actors.mjs';
export {communityActors} from './community-actors.mjs';

const materials=new Map(),cube=new THREE.BoxGeometry(1,1,1);
export function material(color){if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.8}));return materials.get(color);}
export function box(parent,color,x,y,z,w,h,d){const m=new THREE.Mesh(cube,material(color));m.position.set(x,y+h/2,z);m.scale.set(w,h,d);parent.add(m);return m;}
export function disc(parent,color,x,y,z,r,h=.004){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,16),material(color));m.position.set(x,y+h/2,z);parent.add(m);return m;}
export function sign(parent,text,x,y,z,w=.25,h=.04,color='#236f79'){
  if(typeof document==='undefined')return;
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=160;const c=canvas.getContext('2d');c.fillStyle=color;c.fillRect(0,0,1024,160);c.fillStyle='#fff';c.textAlign='center';c.textBaseline='middle';let size=68;c.font=`600 ${size}px "Microsoft YaHei",sans-serif`;while(c.measureText(text).width>960){size-=2;c.font=`600 ${size}px "Microsoft YaHei",sans-serif`;}c.fillText(text,512,82);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map,side:THREE.DoubleSide}));m.position.set(x,y,z);m.userData.sign=true;parent.add(m);return m;
}
export function tree(parent,x,y,z,scale=.10,type='palm'){const m=new THREE.Mesh(treeGeometry(type),new THREE.MeshStandardMaterial({vertexColors:true}));m.position.set(x,y,z);m.scale.setScalar(scale);parent.add(m);return m;}
const colored=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.8});
const residentOutfits={school:['student','student','office'],market:['shopkeeper','chef','overalls'],tea:['senior','office','beret'],bench:['senior','office','dress'],shelter:['courier','senior','explorer'],clinic:['medic','senior','office'],workshop:['overalls','shopkeeper'],library:['student','office','senior'],bus:['courier','office','student'],playground:['student','dress','office'],orchard:['explorer','overalls'],gallery:['beret','office','student'],square:['officer','senior','dress'],bicycle:['courier','student','raincoat']};
export function residentOutfit(theme,index=0){const choices=residentOutfits[theme]||outfitTypes;return choices[((index%choices.length)+choices.length)%choices.length];}
export function socialResponsePose(elapsed,remaining,speaker=0){
  const smooth=(a,b,x)=>THREE.MathUtils.smoothstep(x,a,b),local=elapsed-speaker*1.2;
  const weight=smooth(0,.65,elapsed)*smooth(0,.65,remaining);
  return {weight,wave:weight*smooth(0,.3,local)*(1-smooth(.65,1.15,local)),
   talk:weight*(.5+.5*Math.sin((elapsed-1.2)*Math.PI/2.4+speaker*Math.PI))};
}
export function person(parent,index,{scale=.022,luggage=false,outfit:requestedOutfit}={}){
  const root=new THREE.Group();root.scale.setScalar(scale);const outfit=outfitTypes.includes(requestedOutfit)?requestedOutfit:outfitTypes[index%outfitTypes.length];root.add(new THREE.Mesh(personGeometry(outfit,index%7),colored));const limbs=[];
  for(const [x,y,h] of [[-.2,.8,.8],[.2,.8,.8],[-.48,1.6,.65],[.48,1.6,.65]]){const p=new THREE.Group();p.position.set(x,y,0);box(p,index%2?'#465366':'#967b64',0,-h,0,.15,h,.18);root.add(p);limbs.push(p);}
  if(luggage){box(root,index%2?'#cc9349':'#3f8d93',.7,.10,-.30,.42,.65,.28);box(root,'#364952',.7,.7,-.30,.035,.34,.035);}
  const gesture=(t,state)=>{
   if(state==='wave')limbs[3].rotation.z=1.8+Math.sin(t*3+index)*.2;
   if(state==='talk'){limbs[2].rotation.x=-.55+Math.sin(t*2+index)*.2;limbs[3].rotation.z=-.25;}
  };
  let responseBase=null;
  const clearResponse=()=>{
   if(!responseBase)return;
   root.children[0].rotation.copy(responseBase.body);
   for(let i=0;i<2;i++){limbs[i+2].position.copy(responseBase.arms[i].position);limbs[i+2].rotation.copy(responseBase.arms[i].rotation);}
   responseBase=null;delete root.userData.socialResponse;
  };
  parent.add(root);const actor={root,outfit,gesture,clearResponse,respondTo(t,target,{elapsed,remaining,speaker=0}){
   clearResponse();const motion=socialResponsePose(elapsed,remaining,speaker);
   if(motion.weight<=0)return;
   root.updateWorldMatrix(true,false);const local=root.worldToLocal(target.clone());
   const yaw=THREE.MathUtils.clamp(Math.atan2(local.x,local.z),-.48,.48)*motion.weight;
   responseBase={body:root.children[0].rotation.clone(),arms:limbs.slice(2).map(a=>({position:a.position.clone(),rotation:a.rotation.clone()}))};
   // Turn only the upper body: walking routes, leg poses and seated hips stay fixed.
   root.children[0].rotation.y+=yaw;
   for(const [i,arm] of limbs.slice(2).entries()){
    arm.position.applyAxisAngle(THREE.Object3D.DEFAULT_UP,yaw);arm.rotation.y+=yaw;
    arm.rotation.x=THREE.MathUtils.lerp(arm.rotation.x,-.5+Math.sin(t*2.1+index+i)*.14,motion.talk*.65);
   }
   const hand=local.x<0?0:1,arm=limbs[hand+2];
   arm.rotation.z=THREE.MathUtils.lerp(arm.rotation.z,(hand?1:-1)*(1.8+Math.sin(t*3+index)*.18),motion.wave);
   root.userData.socialResponse={yaw,weight:motion.weight,hand:hand?'right':'left',wave:motion.wave,talk:motion.talk};
  },pose(t,state='walk'){
   clearResponse();
   const moving=state==='walk'||state==='run',phase=t*(state==='run'?9:5.4)+index*.73;
   limbs.forEach((l,i)=>{l.rotation.set(moving?Math.sin(phase+(i===0||i===3?0:Math.PI))*(state==='run'?.65:.36):state==='sit'&&i<2?-Math.PI/2:0,0,0);});
   gesture(t,state);
   if(state==='clap'){limbs[2].rotation.x=limbs[3].rotation.x=-1.1;limbs[2].rotation.z=-.7+Math.sin(t*5)*.15;limbs[3].rotation.z=.7-Math.sin(t*5)*.15;}
   if(state==='stretch'){limbs[2].rotation.z=2.4;limbs[3].rotation.z=-2.4;}
   if(state==='photo'){limbs[2].rotation.x=limbs[3].rotation.x=-1.8;}
   root.userData.state=state;
  }};communityActors.push(actor);return actor;
}
export function vehicle(parent,type,scale=.023){const root=new THREE.Mesh(vehicleGeometry(type),colored);root.scale.setScalar(scale);parent.add(root);return root;}
export function polyline(points){const c=new THREE.CurvePath();for(let i=1;i<points.length;i++)c.add(new THREE.LineCurve3(new THREE.Vector3(...points[i-1]),new THREE.Vector3(...points[i])));return c;}
export function follow(root,path,t){const p=path.getPoint(THREE.MathUtils.clamp(t,0,1)),d=path.getTangent(THREE.MathUtils.clamp(t,.0001,.9999));root.position.copy(p);root.rotation.y=Math.atan2(d.x,d.z);}
