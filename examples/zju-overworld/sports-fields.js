import * as THREE from './vendor/three.module.js';

const mats=new Map();
const mat=c=>{if(!mats.has(c))mats.set(c,new THREE.MeshStandardMaterial({color:c,roughness:.75}));return mats.get(c);};
function box(g,w,h,d,x,y,z,c){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(c));m.position.set(x,y,z);g.add(m);return m;}
function line(g,points,color=0xf4ead6){const m=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(p[0],p[1]??.19,p[2]))),new THREE.LineBasicMaterial({color}));g.add(m);return m;}
function arc(g,x,z,r,a=0,b=Math.PI*2){line(g,Array.from({length:49},(_,i)=>[x+Math.cos(a+(b-a)*i/48)*r,.2,z+Math.sin(a+(b-a)*i/48)*r]));}
export function fieldFrame(f){
 let best={len:0,dx:0,dz:1};for(let i=1;i<f.p.length;i++){const dx=f.p[i][0]-f.p[i-1][0],dz=f.p[i][1]-f.p[i-1][1],len=Math.hypot(dx,dz);if(len>best.len)best={len,dx:dx/len,dz:dz/len};}
 const angle=Math.atan2(best.dx,best.dz),c=Math.cos(angle),s=Math.sin(angle),local=f.p.map(p=>[(p[0]-f.cx)*c-(p[1]-f.cz)*s,(p[0]-f.cx)*s+(p[1]-f.cz)*c]);
 return {x:f.cx,z:f.cz,angle,width:Math.max(...local.map(p=>p[0]))-Math.min(...local.map(p=>p[0])),length:Math.max(...local.map(p=>p[1]))-Math.min(...local.map(p=>p[1])),world(x,z){return new THREE.Vector3(f.cx+x*c+z*s,.16,f.cz-x*s+z*c);}};
}
function hoop(g,z,sign){
 const h=new THREE.Group();h.position.z=z;h.rotation.y=sign>0?Math.PI:0;g.add(h);
 box(h,.18,3.75,.18,0,1.875,-1,0x386866);box(h,.14,.14,1.15,0,3.55,-.48,0x386866);
 box(h,1.8,1.05,.07,0,3.48,0,0xcedddb);box(h,.62,.04,.085,0,3.36,.055,0xeeeeea);box(h,.04,.45,.085,-.31,3.15,.055,0xeeeeea);box(h,.04,.45,.085,.31,3.15,.055,0xeeeeea);
 const ring=new THREE.Mesh(new THREE.TorusGeometry(.23,.026,7,24),mat(0xe98238));ring.rotation.x=Math.PI/2;ring.position.set(0,3.05,.29);h.add(ring);
 for(let i=0;i<12;i++){const a=i/12*Math.PI*2;line(h,[[Math.cos(a)*.22,3.03,.29+Math.sin(a)*.22],[Math.cos(a+.3)*.14,2.63,.29+Math.sin(a+.3)*.14]],0xd8e4de);}
 box(h,.8,.28,1.2,0,.14,-1,0x315955);
}
function goal(g,z,sign,width=7.32){const d=1.9;for(const x of [-width/2,width/2]){box(g,.1,2.44,.1,x,1.22,z,0xf1f0dc);line(g,[[x,2.44,z],[x,1.8,z+sign*d],[x,.18,z+sign*d]],0xc6d5ca);}box(g,width,.1,.1,0,2.44,z,0xf1f0dc);for(let x=-width/2;x<=width/2;x+=.45)line(g,[[x,.18,z+sign*d],[x,1.8,z+sign*d],[x,2.44,z]],0xbecfc4);for(let y=.3;y<1.9;y+=.4)line(g,[[-width/2,y,z+sign*d],[width/2,y,z+sign*d]],0xbecfc4);}
export function createSportsFields(life){
 const result={courts:[],tracks:[],fields:[],groups:[],hoops:0};
 for(const f of life.env.features.filter(f=>f.type==='pitch')){
  const track=f.tags.leisure==='track'||/田径场/.test(f.name||'');
  if(track){const pts=f.p.slice(0,-1).map(p=>{const v=new THREE.Vector3(p[0]-f.cx,0,p[1]-f.cz);v.setLength(Math.max(1,v.length()-3));return new THREE.Vector3(f.cx+v.x,.16,f.cz+v.z);});const segments=pts.map((p,i)=>p.distanceTo(pts[(i+1)%pts.length])),length=segments.reduce((a,b)=>a+b,0);result.tracks.push({feature:f,points:pts,segments,length});}
  const sport=f.tags.sport;if(!['basketball','soccer','tennis','volleyball'].includes(sport))continue;
  const frame=fieldFrame(f);if(sport==='basketball'&&(frame.width>29||frame.length>45))continue;
  const g=new THREE.Group();g.position.set(frame.x,0,frame.z);g.rotation.y=frame.angle;life.world.add(g);result.groups.push({group:g,feature:f});
  const w=Math.min(frame.width-1,sport==='basketball'?15:frame.width-1),l=Math.min(frame.length-1,sport==='basketball'?28:frame.length-1);
  const field={feature:f,frame,group:g,width:w,length:l};result.fields.push(field);
  line(g,[[-w/2,.19,-l/2],[w/2,.19,-l/2],[w/2,.19,l/2],[-w/2,.19,l/2],[-w/2,.19,-l/2]]);
  if(sport==='basketball'){
   const half=f.tags.hoops==='1'||l<22,ends=half?[-1]:[-1,1];
   if(!half){line(g,[[-w/2,.2,0],[w/2,.2,0]]);arc(g,0,0,1.8);}
   for(const sign of ends){const z=sign*(l/2-1);hoop(g,z,sign);result.hoops++;const free=sign*(l/2-5.8);line(g,[[-2.45,.2,sign*l/2],[-2.45,.2,free],[2.45,.2,free],[2.45,.2,sign*l/2]]);arc(g,0,free,1.8);arc(g,0,z,Math.min(6.2,w*.43),sign>0?Math.PI:0,sign>0?Math.PI*2:Math.PI);}
   field.hoopPositions=ends.map(sign=>{const p=frame.world(0,sign*(l/2-1.29));p.y=3.05;return p;});result.courts.push(field);
  }else if(sport==='soccer'){
   line(g,[[-w/2,.2,0],[w/2,.2,0]]);arc(g,0,0,Math.min(9.15,w/5));for(const sign of [-1,1]){goal(g,sign*l/2,sign,Math.min(7.32,w*.3));const bw=Math.min(w*.65,40),bd=Math.min(l*.18,16.5);line(g,[[-bw/2,.2,sign*l/2],[-bw/2,.2,sign*(l/2-bd)],[bw/2,.2,sign*(l/2-bd)],[bw/2,.2,sign*l/2]]);}
  }else{
   const h=sport==='volleyball'?2.43:1.07;for(const x of [-w/2,w/2])box(g,.09,h+.1,.09,x,h/2,0,0xdce5d6);for(let y=.3;y<h;y+=.18)line(g,[[-w/2,y,0],[w/2,y,0]],0xc3d1c4);for(let x=-w/2;x<w/2;x+=.35)line(g,[[x,.3,0],[x,h,0]],0xc3d1c4);line(g,[[-w/2,h,0],[w/2,h,0]],0xf3ecdb);
  }
 }
 return result;
}
export function pointOnTrack(track,meters){let d=((meters%track.length)+track.length)%track.length;for(let i=0;i<track.points.length;i++){if(d<=track.segments[i])return track.points[i].clone().lerp(track.points[(i+1)%track.points.length],d/track.segments[i]);d-=track.segments[i];}return track.points[0].clone();}
