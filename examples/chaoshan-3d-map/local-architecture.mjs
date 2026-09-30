import * as THREE from 'three';
import {box,disc,material} from './scene-miniatures.mjs';
import {placeSetting} from './place-setting.mjs';

export function localHouse(g,x,z,w=.17,d=.13,h=.15,y=.018,color){
 const profile=g.userData.setting||placeSetting({id:g.name||'village',model:'village'});
 const type=profile.building,variant=(profile.seed+Math.abs(Math.round(x*137+z*79)))%4;
 const flat=['fishing','stone','warehouse','commercial'].includes(type);
 const wall=color||(type==='fishing'?['#e2e6df','#d5c5b7','#bbd1ce','#cbd3bc'][variant]:type==='stone'?'#cad0c5':type==='arcade'?'#d9d9ce':'#d7cfbb');
 box(g,wall,x,y,z,w,h,d);
 const roofY=y+h;
 if(flat){
  box(g,'#879d99',x,roofY,z,w*1.05,.012,d*1.05);
  for(const side of [-1,1])box(g,'#dee4da',x+side*w*.47,roofY+.01,z,w*.065,.019,d);
  box(g,'#d4ddd2',x,roofY+.01,z-d*.46,w,.019,d*.07);
  if(type==='fishing'&&variant%2===0){disc(g,'#d3dcda',x-w*.25,roofY+.013,z-d*.24,w*.10,.032);box(g,'#679193',x+w*.22,roofY+.013,z-d*.18,w*.28,.019,d*.28);}
  else if(type==='commercial')box(g,'#a7beb9',x+w*.16,roofY+.012,z-d*.2,w*.48,.035,d*.43);
 }else{
  const rise=Math.min(.048,w*.22),positions=[];
  for(const side of [-1,1]){const a=[x-w*.55,roofY,z+side*d*.57],b=[x+w*.55,roofY,z+side*d*.57],c=[x-w*.49,roofY+rise,z],e=[x+w*.49,roofY+rise,z];for(const p of [a,c,b,b,c,e])positions.push(...p);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:type==='farm'?'#7f8470':'#526960',side:THREE.DoubleSide,roughness:.95})));
  box(g,type==='courtyard'?'#a87768':'#879086',x,roofY+rise,z,w*1.04,.008,.008);
  for(let k=0;k<5;k++){const xx=x-w*.42+k*w*.21;for(const side of [-1,1]){const ridge=box(g,'#81938a',xx,roofY+.006,z+side*d*.28,.002,.002,d*.57);ridge.rotation.x=side*Math.atan2(rise,d*.57);}}
 }
 const floors=Math.max(1,Math.floor(h/.065)),cols=variant%2?3:2;
 for(let floor=0;floor<floors;floor++){
  for(let col=0;col<cols;col++){const xx=x+(col-(cols-1)/2)*w/(cols+1),yy=y+.032+floor*h/floors;
   if(floor===0&&Math.abs(xx-x)<w*.13)continue;
   box(g,'#527c84',xx,yy,z+d*.505,w/(cols+2)*.62,Math.min(.026,h*.27),.003);
   box(g,'#e5e8db',xx,yy-.004,z+d*.52,w/(cols+2)*.8,.004,.005);
  }
  if(floor>0&&type==='fishing'){box(g,'#d5ddd1',x,y+floor*h/floors,z+d*.55,w*.9,.006,d*.13);for(let k=0;k<6;k++)box(g,'#648d8b',x-w*.38+k*w*.152,y+floor*h/floors+.006,z+d*.60,.002,.018,.002);}
 }
 box(g,type==='arcade'?'#496f72':'#8a7967',x,y+.001,z+d*.51,w*.19,Math.min(h*.48,.063),.005);
 if(type==='arcade'){
  for(const side of [-1,1])box(g,'#dddace',x+side*w*.43,y,z+d*.57,w*.09,Math.min(.065,h*.6),d*.13);
  box(g,['#5e998d','#b9876c','#72969e','#a2a66b'][variant],x,y+Math.min(.065,h*.6),z+d*.57,w*1.03,.009,d*.20);
 }else if(type==='stone'){
  for(let row=0;row<4;row++)box(g,'#aebbad',x,y+.016+row*h*.22,z+d*.51,w*.96,.002,.003);
 }
}
