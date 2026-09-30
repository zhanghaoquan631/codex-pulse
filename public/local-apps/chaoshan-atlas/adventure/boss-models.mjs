import * as THREE from 'three';
import {createInkMaterial,createInkLineMaterial,INK_COLORS} from './ink-materials.mjs';
import {BOSS_BY_ID} from './boss-catalog.mjs';

// Original, geometry-only paper demons. +Z is the face, +Y is up. No textures.
// Every prefab is fitted to 3 units tall. The .8 radius is its core collider;
// ornamental fins, wings and chains may extend beyond that body silhouette.
const geometries=new Map(),materials=new Map();
const Y=new THREE.Vector3(0,1,0),direction=new THREE.Vector3();
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function geometry(kind){
  if(!geometries.has(kind)){
    let g;
    if(kind==='box')g=new THREE.BoxGeometry(1,1,1);
    else if(kind==='head')g=new THREE.SphereGeometry(1,12,8);
    else if(kind==='rock')g=new THREE.IcosahedronGeometry(1,0);
    else if(kind==='tube')g=new THREE.CylinderGeometry(1,1,1,7);
    else if(kind==='cone')g=new THREE.ConeGeometry(1,1,7);
    else if(kind==='taper')g=new THREE.CylinderGeometry(.62,1,1,9);
    else if(kind==='ring')g=new THREE.TorusGeometry(1,.09,5,18);
    else if(kind==='octagon')g=new THREE.TorusGeometry(1,.11,4,8);
    else if(kind==='arc')g=new THREE.TorusGeometry(1,.09,5,14,Math.PI);
    else if(kind==='triangle'){
      g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-.5,-.5,0,.5,-.5,0,0,.5,0],3));g.computeVertexNormals();
    }
    else if(kind==='sheet'){
      g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([
        -.5,0,0,.5,0,0,.34,-.48,.045,-.5,0,0,.34,-.48,.045,-.43,-.56,-.025,
        -.43,-.56,-.025,.34,-.48,.045,.09,-1,0,-.43,-.56,-.025,.09,-1,0,-.2,-.83,0,
      ],3));g.computeVertexNormals();
    }else if(kind==='feather'){
      g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([
        -.13,0,0,.12,.08,0,.24,.45,.035,-.13,0,0,.24,.45,.035,0,1,0,
      ],3));g.computeVertexNormals();
    }else throw new Error(`Unknown boss shape ${kind}`);
    g.name=`Shared demon ${kind}`;g.computeBoundingBox();geometries.set(kind,g);
  }
  return geometries.get(kind);
}
function material(color,style='paper'){
  const key=`${color}:${style}`;
  if(!materials.has(key))materials.set(key,style==='solid'
    ?new THREE.MeshBasicMaterial({color,toneMapped:false})
    :style==='line'?createInkLineMaterial(color,{opacity:.88})
    :createInkMaterial({ink:color,paper:style==='dark'?0xd8d0bf:style==='clown-face'?0xfaf6e8:INK_COLORS.paper,
      tone:style==='dark'?.9:style==='clown-face'?.25:.7,accent:style==='dark'?.22:style==='clown-cloth'?.26:style==='clown-face'?.01:.085,spacing:style==='dark'?6.2:7.6,side:THREE.DoubleSide}));
  return materials.get(key);
}
function part(parent,kind,color,size,position=[0,0,0],rotation=[0,0,0],style='paper',edge=true){
  const mesh=new THREE.Mesh(geometry(kind),material(color,style));
  mesh.scale.set(size[0]??1,size[1]??1,size[2]??1);
  mesh.position.set(position[0]??0,position[1]??0,position[2]??0);
  mesh.rotation.set(rotation[0]??0,rotation[1]??0,rotation[2]??0);parent.add(mesh);
  if(edge&&style!=='solid'){
    const key=`edges:${kind}`;
    if(!geometries.has(key))geometries.set(key,new THREE.EdgesGeometry(geometry(kind),24));
    mesh.add(new THREE.LineSegments(geometries.get(key),material(color,'line')));
  }
  return mesh;
}
function bar(parent,a,b,r,color,style='paper'){
  direction.set(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
  const length=direction.length();
  const mesh=part(parent,'tube',color,[r,length,r],[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2],[0,0,0],style);
  mesh.quaternion.setFromUnitVectors(Y,direction.normalize());return mesh;
}
function chain(parent,points,r,color){for(let i=1;i<points.length;i++)bar(parent,points[i-1],points[i],r,color);}
function pivot(parent,name,position=[0,0,0],rotation=[0,0,0]){
  const group=new THREE.Group();group.name=name;
  group.position.set(position[0]??0,position[1]??0,position[2]??0);
  group.rotation.set(rotation[0]??0,rotation[1]??0,rotation[2]??0);parent.add(group);return group;
}
function animated(rig,parent,name,position,rotation,role,phase=0){
  const group=pivot(parent,name,position,rotation);rig.parts.push({group,role,phase});return group;
}
function eye(rig,parent,x,y,z,size=.09){
  const orb=part(parent,'head',rig.color,[size*1.45,size,size*.45],[x,y,z]);
  part(orb,'head',rig.color,[.34,.66,.72],[0,0,.83],[0,0,0],'solid');
  rig.eyes.push(orb);return orb;
}
function face(rig,parent,{y=0,z=.28,w=.17,size=.08,single=false}={}){
  if(single)eye(rig,parent,0,y,z,size*1.75);
  else for(const side of[-1,1])eye(rig,parent,side*w,y,z,size);
}
function fingers(parent,origin,side,color,count=3,length=.27){
  for(let i=0;i<count;i++){
    const x=origin[0]+(i-(count-1)/2)*.08;
    chain(parent,[[x,origin[1],origin[2]],[x+side*.06,origin[1]-length*.55,origin[2]+.07],
      [x+side*.03,origin[1]-length,origin[2]+.14]],.025,color);
  }
}
function horn(parent,color,x,y,z,side,size=.5){
  chain(parent,[[x,y,z],[x+side*size*.32,y+size*.24,z],[x+side*size*.36,y+size*.62,z-.035]],.07,color);
  part(parent,'cone',color,[.065,size*.45,.065],[x+side*size*.33,y+size*.78,z-.035],[0,0,-side*.14]);
}
function clawLeg(rig,parent,x,y,z,side,index,color){
  const leg=animated(rig,parent,`jointed-leg-${side}-${index}`,[x,y,z],[0,side*(index-.5)*.26,0],'leg',index+side);
  chain(leg,[[0,0,0],[side*.42,-.10,.04],[side*.78,-.50,.12],[side*.75,-1.1,.20]],.06,color);
  for(const p of[[side*.42,-.1,.04],[side*.78,-.5,.12]])part(leg,'head',color,[.085,.085,.085],p);
  return leg;
}

function wraith(r){
  const m=r.motion,c=r.color;
  const body=animated(r,m,'floating-cloak',[0,1.28,0],[],'hover');
  part(body,'taper',c,[.44,1.05,.32],[0,.09,0]);
  for(let i=0;i<9;i++){
    const a=i*Math.PI*2/9;
    const rag=animated(r,body,`torn-hem-${i}`,[Math.cos(a)*.28,-.32,Math.sin(a)*.23],[0,-a,0],'rag',i);
    part(rag,'sheet',c,[.29,.53+(i%3)*.12,.7],[0,0,0],[],'paper',true);
  }
  const head=animated(r,body,'hollow-hood',[0,.83,.02],[],'head');
  part(head,'head',c,[.38,.48,.31]);part(head,'head',c,[.255,.33,.08],[0,-.035,.29],[],'dark');
  face(r,head,{y:.055,z:.37,w:.105,size:.043});
  part(head,'arc',c,[.43,.52,.28],[0,.30,-.01]);
  for(const side of[-1,1]){
    const arm=animated(r,body,`empty-sleeve-${side}`,[side*.32,.39,0],[0,0,side*.26],'arm',side);
    chain(arm,[[0,0,0],[side*.34,-.24,0],[side*.42,-.76,.10]],.095,c);
    part(arm,'sheet',c,[.3,.55,.9],[side*.22,-.14,-.04]);fingers(arm,[side*.42,-.76,.1],side,c,4,.35);
    for(let i=0;i<4;i++)part(head,'ring',c,[.06,.095,.06],[side*.28,-.39-i*.14,-.09],[0,i%2*Math.PI/2,0]);
  }
  r.core=part(body,'octagon',c,[.17,.23,.08],[0,.1,.34]);
}
function serpent(r){
  const m=r.motion,c=r.color;
  const coil=animated(r,m,'coiled-bridge-cable',[0,.32,0],[],'coil');
  part(coil,'ring',c,[.8,.64,1],[0,0,0],[Math.PI/2,0,0]);
  part(coil,'ring',c,[.61,.46,1],[0,.23,.05],[Math.PI/2,0,.28]);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;part(coil,'box',c,[.13,.17,.13],[Math.cos(a)*.67,.12,Math.sin(a)*.51],[0,-a,0]);}
  const neck=animated(r,m,'rising-serpent-neck',[-.1,.6,0],[],'neck');
  chain(neck,[[0,0,0],[-.34,.46,0],[.2,.93,.03],[.02,1.5,.02]],.2,c);
  for(let i=0;i<5;i++)part(neck,'cone',c,[.12,.35,.05],[-.22+(i%2)*.13,.22+i*.27,-.15],[.9,0,.2]);
  const head=animated(r,neck,'long-jawed-serpent',[.02,1.53,.08],[],'jaw');
  part(head,'head',c,[.37,.22,.52],[0,.04,.14]);part(head,'box',c,[.39,.15,.54],[0,-.12,.3],[],'paper',true);
  face(r,head,{y:.14,z:.42,w:.19,size:.06});
  for(const side of[-1,1]){horn(head,c,side*.23,.1,-.08,side,.42);for(let j=0;j<3;j++)part(head,'cone',c,[.035,.12,.035],[side*.19,-.065,.28+j*.13],[Math.PI,0,0]);}
  r.core=part(neck,'head',c,[.12,.17,.07],[.13,.95,.23]);
}
function oni(r){
  const m=r.motion,c=r.color;
  const body=animated(r,m,'living-square-ding',[0,1.13,0],[],'heavy');
  part(body,'box',c,[1.13,1.05,.85],[],[],'paper',true);
  part(body,'box',c,[1.25,.16,.99],[0,.48,0],[],'dark',true);
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3+.5;const leg=animated(r,body,`ding-foot-${i}`,[Math.sin(a)*.40,-.46,Math.cos(a)*.30],[],'stomp',i);part(leg,'taper',c,[.19,.68,.18],[0,-.32,0]);part(leg,'box',c,[.3,.14,.31],[0,-.63,.04],[],'dark',true);}
  const head=animated(r,body,'horned-bronze-mask',[0,.85,.09],[],'head');
  part(head,'rock',c,[.43,.4,.29]);face(r,head,{y:.08,z:.27,w:.16,size:.062});
  part(head,'box',c,[.42,.09,.065],[0,-.13,.30],[],'solid');
  for(let i=0;i<5;i++)part(head,'box',c,[.055,.09,.04],[(i-2)*.078,-.14,.34]);
  for(const side of[-1,1]){
    horn(head,c,side*.31,.19,-.06,side,.55);
    const arm=animated(r,body,`hammer-fist-${side}`,[side*.54,.27,0],[],'fist',side);
    chain(arm,[[0,0,0],[side*.31,-.21,.08],[side*.37,-.61,.22]],.16,c);
    part(arm,'box',c,[.38,.38,.39],[side*.37,-.69,.24],[],'paper',true);
    part(body,'arc',c,[.27,.36,.18],[side*.62,.25,-.12],[0,0,side*Math.PI/2]);
  }
  r.core=part(body,'octagon',c,[.23,.26,.08],[0,0,.46]);
}
function siren(r){
  const m=r.motion,c=r.color;
  const tail=animated(r,m,'curled-fish-tail',[0,.31,0],[],'tail');
  chain(tail,[[0,.55,0],[.22,.3,0],[-.20,.06,.08],[-.55,.18,.10]],.18,c);
  for(const side of[-1,1])part(tail,'feather',c,[.65,.55,1],[-.50,.15,.1],[0,0,side*.6+1.1], 'paper',true);
  const body=animated(r,m,'lantern-ribcage',[0,1.39,0],[],'hover');
  part(body,'taper',c,[.34,.94,.24]);
  r.core=part(body,'head',c,[.19,.3,.06],[0,.13,.25]);
  for(const side of[-1,1]){
    const arm=animated(r,body,`kelp-arm-${side}`,[side*.26,.31,0],[],'arm',side);
    chain(arm,[[0,0,0],[side*.39,-.10,.04],[side*.47,-.58,.14]],.075,c);fingers(arm,[side*.47,-.58,.14],side,c,3,.26);
    part(arm,'feather',c,[.5,.59,.8],[side*.17,-.27,-.02],[0,0,-side*.65]);
  }
  const head=animated(r,body,'siren-beacon-crown',[0,.79,.02],[],'head');
  part(head,'head',c,[.28,.34,.22]);face(r,head,{y:.01,z:.23,w:.10,size:.043});
  for(const side of[-1,1])part(head,'feather',c,[.64,.48,1],[side*.19,.07,0],[0,0,-side*.8]);
  const crown=animated(r,head,'turning-lighthouse-lantern',[0,.44,0],[],'orbit',1);
  part(crown,'tube',c,[.25,.14,.25],[0,0,0]);part(crown,'head',c,[.15,.22,.15],[0,.18,0]);part(crown,'cone',c,[.3,.2,.3],[0,.39,0]);
  part(crown,'ring',c,[.39,.39,.8],[0,.19,0],[Math.PI/2,0,0]);
}
function marionette(r){
  const m=r.motion,c=r.color;
  const body=animated(r,m,'wooden-jointed-body',[0,1.22,0],[],'puppet');
  part(body,'box',c,[.44,.73,.28],[],[],'paper',true);
  const head=animated(r,body,'carved-mask',[0,.69,.03],[],'head');
  part(head,'box',c,[.5,.54,.22],[],[0,0,-.07],'paper',true);face(r,head,{y:.045,z:.14,w:.11,size:.045});
  part(head,'cone',c,[.06,.21,.06],[0,-.03,.22],[Math.PI/2,0,0]);
  for(const side of[-1,1])for(let i=0;i<3;i++){
    const arm=animated(r,body,`puppet-arm-${side}-${i}`,[side*.22,.27-i*.22,0],[0,side*.18,-side*(.22+i*.17)],'puppetArm',i+side);
    chain(arm,[[0,0,0],[side*.35,-.10,.025],[side*.59,-.34,.13]],.052,c);
    part(arm,'head',c,[.085,.085,.085],[side*.35,-.1,.025]);part(arm,'box',c,[.13,.18,.09],[side*.59,-.38,.13]);fingers(arm,[side*.59,-.45,.13],side,c,3,.19);
  }
  for(const side of[-1,1]){
    const leg=animated(r,body,`hanging-puppet-leg-${side}`,[side*.14,-.35,0],[],'leg',side);
    chain(leg,[[0,0,0],[side*.025,-.39,.03],[0,-.82,.02]],.066,c);
    part(leg,'box',c,[.18,.1,.29],[0,-.84,.12],[],'paper',true);
  }
  const frame=animated(r,m,'puppet-crossbar',[0,2.61,-.14],[],'frame');
  part(frame,'box',c,[1.5,.095,.10],[],[],'paper',true);part(frame,'box',c,[.09,.1,.67],[],[],'paper',true);
  for(const side of[-1,1]){bar(frame,[side*.64,-.01,0],[side*.54,-1.21,.16],.008,c,'solid');bar(frame,[side*.25,-.01,0],[side*.18,-.55,.16],.008,c,'solid');}
  r.core=part(body,'head',c,[.085,.10,.035],[0,.07,.17]);
}
function pagoda(r){
  const m=r.motion,c=r.color;
  const eyeRig=animated(r,m,'great-cyclopean-eye',[0,1.57,0],[],'hover');
  part(eyeRig,'head',c,[.55,.44,.33]);face(r,eyeRig,{z:.32,single:true,size:.15});
  r.core=eyeRig;
  for(let i=0;i<3;i++){
    const tier=animated(r,m,`detached-octagonal-tier-${i}`,[0,.35+i*1.04,0],[],'orbit',i%2?1:-1);
    const size=.64-i*.1;
    part(tier,'octagon',c,[size,size,.6],[0,0,0],[Math.PI/2,0,Math.PI/8]);
    for(let j=0;j<8;j++){const a=j*Math.PI/4;part(tier,'box',c,[.29,.095,.19],[Math.sin(a)*size,0,Math.cos(a)*size],[0,a,0]);}
    part(tier,'cone',c,[size*.7,.17,size*.7],[0,.09,0]);
    if(i!==1)for(const side of[-1,1]){bar(tier,[side*size,-.02,0],[side*size,-.20,0],.012,c);part(tier,'head',c,[.06,.085,.06],[side*size,-.25,0]);}
  }
  for(let i=0;i<4;i++){const a=i*Math.PI/2;const charm=animated(r,m,`orbiting-paper-charm-${i}`,[Math.sin(a)*.64,1.07,Math.cos(a)*.64],[0,a,0],'charm',i);part(charm,'sheet',c,[.18,.42,.8]);}
  part(m,'cone',c,[.08,.35,.08],[0,2.71,0]);
}
function hydra(r){
  const m=r.motion,c=r.color;
  const body=animated(r,m,'lake-hydra-body',[0,.47,0],[],'hover');
  part(body,'head',c,[.69,.37,.43]);
  for(let i=0;i<5;i++)part(body,'cone',c,[.12,.3,.12],[(i-2)*.2,.21,-.2],[.3,0,0]);
  for(let i=0;i<3;i++){
    const side=i-1,neck=animated(r,body,`hydra-neck-${i}`,[side*.30,.13,.015],[0,-side*.2,-side*.16],'hydraNeck',i);
    chain(neck,[[0,0,0],[side*.12,.46,0],[-side*.11,.88,.03],[side*.05,1.40-i%2*.08,.13]],.14,c);
    const head=animated(r,neck,`hydra-head-${i}`,[side*.05,1.47-i%2*.08,.20],[],'jaw',i);
    part(head,'head',c,[.28,.22,.31]);face(r,head,{y:.08,z:.26,w:.12,size:.047});
    part(head,'box',c,[.34,.08,.23],[0,-.11,.26],[],'dark');
    for(const s of[-1,1])part(head,'cone',c,[.035,.13,.035],[s*.12,-.10,.37],[Math.PI,0,0]);
    horn(head,c,0,.12,-.09,side||1,.27+i*.06);
  }
  for(let i=0;i<2;i++)part(m,'ring',c,[.82+i*.08,.52+i*.04,1],[0,.06+i*.04,0],[Math.PI/2,0,i*.35]);
  r.core=part(body,'head',c,[.14,.13,.06],[0,.03,.43]);
}
function widow(r){
  const m=r.motion,c=r.color;
  const abdomen=animated(r,m,'cracked-porcelain-abdomen',[0,1.38,-.20],[],'abdomen');
  part(abdomen,'head',c,[.64,.52,.66]);
  for(let i=0;i<7;i++){const a=i*2.399;part(abdomen,'rock',c,[.2,.06,.22],[Math.cos(a)*.45,.37+Math.sin(a)*.04,Math.sin(a)*.45],[.2*Math.cos(a),a,.14]);}
  const faceRig=animated(r,m,'eight-eyed-porcelain-mask',[0,1.25,.43],[],'head');
  part(faceRig,'rock',c,[.36,.3,.23]);
  for(let i=0;i<4;i++)for(const side of[-1,1])eye(r,faceRig,side*(.085+i*.035),.11-i*.065,.22-(i%2)*.025,.035);
  for(const side of[-1,1]){chain(faceRig,[[side*.16,-.11,.15],[side*.2,-.32,.26],[side*.08,-.39,.33]],.055,c);}
  for(const side of[-1,1])for(let i=0;i<4;i++)clawLeg(r,m,side*.33,1.29,-.5+i*.28,side,i,c);
  for(let i=0;i<3;i++)part(abdomen,'cone',c,[.07,.34,.07],[(i-1)*.12,-.12,-.60],[-Math.PI/2,0,0]);
  r.core=part(abdomen,'octagon',c,[.22,.24,.05],[0,.10,.64]);
}
function harpy(r){
  const m=r.motion,c=r.color;
  const body=animated(r,m,'cloud-eagle-torso',[0,1.4,0],[],'hover');
  part(body,'taper',c,[.33,.88,.23]);
  const head=animated(r,body,'hook-beaked-head',[0,.66,.025],[],'head');
  part(head,'head',c,[.28,.30,.23]);face(r,head,{y:.06,z:.20,w:.12,size:.045});
  chain(head,[[0,-.03,.18],[0,-.07,.46],[0,-.2,.42]],.065,c);
  for(let i=0;i<3;i++)part(head,'feather',c,[.38,.42,1],[(i-1)*.12,.20,-.07],[0,0,(i-1)*.28]);
  for(const side of[-1,1]){
    const wing=animated(r,body,`great-paper-wing-${side}`,[side*.25,.22,-.015],[0,0,side*.02],'wing',side);
    chain(wing,[[0,0,0],[side*.46,.23,0],[side*1.03,.29,-.02]],.065,c);
    for(let i=0;i<6;i++)part(wing,'feather',c,[.64,.85-i*.08,1],[side*(.17+i*.16),.17+i*.015,-.015],[0,0,Math.PI+side*(.08+i*.15)],'paper',true);
    const leg=animated(r,body,`talon-${side}`,[side*.16,-.36,0],[],'leg',side);
    chain(leg,[[0,0,0],[side*.06,-.32,.03],[side*.04,-.57,.12]],.052,c);
    fingers(leg,[side*.04,-.57,.10],side,c,3,.19);
  }
  for(let i=0;i<5;i++)part(m,'head',c,[.18,.075,.17],[(i-2)*.23,.09,Math.sin(i)*.07]);
  r.core=part(body,'head',c,[.10,.17,.06],[0,.10,.23]);
}
function jailer(r){
  const m=r.motion,c=r.color;
  const body=animated(r,m,'chained-giant-torso',[0,1.24,0],[],'heavy');
  part(body,'box',c,[.68,.96,.46],[],[],'paper',true);
  const cage=animated(r,body,'octagonal-prison-yoke',[0,.60,-.04],[],'yoke');
  part(cage,'octagon',c,[.85,.9,1.25],[],[0,0,Math.PI/8]);
  for(let i=0;i<8;i++){const a=i*Math.PI/4+Math.PI/8;part(cage,'box',c,[.18,.23,.24],[Math.sin(a)*.86,Math.cos(a)*.9,0],[0,0,-a]);}
  const head=animated(r,body,'imprisoned-face',[0,.78,.08],[],'head');
  part(head,'box',c,[.38,.47,.22],[],[],'dark',true);face(r,head,{y:.05,z:.15,w:.10,size:.044});
  for(const side of[-1,1]){
    const arm=animated(r,body,`shackle-arm-${side}`,[side*.32,.22,0],[],'fist',side);
    chain(arm,[[0,0,0],[side*.30,-.23,0],[side*.39,-.55,.16]],.11,c);
    if(side<0)part(arm,'ring',c,[.24,.28,.8],[side*.43,-.69,.15]);
    else part(arm,'box',c,[.33,.40,.34],[side*.43,-.73,.15],[], 'paper',true);
    const leg=animated(r,body,`jailer-leg-${side}`,[side*.20,-.43,0],[],'stomp',side);
    part(leg,'box',c,[.21,.66,.24],[0,-.30,0],[],'paper',true);part(leg,'box',c,[.29,.14,.42],[0,-.65,.08]);
    for(let i=0;i<3;i++)part(leg,'ring',c,[.075,.095,.06],[side*.23,-.35-i*.15,.1],[0,i%2*Math.PI/2,0]);
  }
  r.core=part(body,'box',c,[.29,.34,.08],[0,-.04,.26]);
  part(r.core,'head',c,[.18,.18,.17],[0,.18,.53],[],'solid');part(r.core,'box',c,[.16,.41,.16],[0,-.12,.53],[],'solid');
}
function revenant(r){
  const m=r.motion,c=r.color;
  const body=animated(r,m,'drowned-sailcloth-torso',[0,1.38,0],[],'sway');
  part(body,'taper',c,[.40,.85,.27]);
  for(let i=0;i<5;i++){const rag=animated(r,body,`wet-sail-rag-${i}`,[(i-2)*.14,-.26,-.1],[],'rag',i);part(rag,'sheet',c,[.24,.68+(i%2)*.15,1]);}
  const head=animated(r,body,'sea-ghost-mask',[0,.71,.015],[0,0,-.09],'head');
  part(head,'head',c,[.31,.35,.23]);face(r,head,{y:.07,z:.22,w:.12,size:.05});
  for(let i=0;i<5;i++){const weed=animated(r,head,`seaweed-hair-${i}`,[(i-2)*.12,.18,-.1],[.1,0,(i-2)*.11],'rag',i);part(weed,'sheet',c,[.12,.53,1]);}
  const arm=animated(r,body,'massive-anchor-arm',[-.3,.27,.01],[0,0,.12],'anchor');
  bar(arm,[0,0,0],[-.24,-.33,.03],.095,c);bar(arm,[-.24,-.3,.03],[-.26,-1.1,.10],.065,c);
  part(arm,'arc',c,[.46,.38,.7],[-.26,-.83,.1],[0,0,Math.PI]);
  bar(arm,[-.58,-.51,.1],[.06,-.51,.1],.045,c);
  for(const side of[-1,1])part(arm,'cone',c,[.13,.26,.07],[-.26+side*.4,-.83,.1],[0,0,-side*.7]);
  const hand=animated(r,body,'rope-hand',[.3,.24,.02],[],'arm',1);
  chain(hand,[[0,0,0],[.28,-.18,.02],[.31,-.61,.12]],.07,c);fingers(hand,[.31,-.6,.12],1,c,3,.28);
  const tail=animated(r,m,'water-ghost-tail',[.05,.39,0],[],'tail');chain(tail,[[0,.4,0],[.16,.05,.02],[-.13,-.22,.11]],.15,c);
  r.core=part(body,'ring',c,[.15,.20,.7],[0,.08,.27]);
}
function colossus(r){
  const m=r.motion,c=r.color;
  const body=animated(r,m,'waterfall-rock-torso',[0,1.35,0],[],'heavy');
  part(body,'rock',c,[.64,.68,.39]);part(body,'rock',c,[.73,.30,.43],[0,.35,0],[0,.2,0]);
  const head=animated(r,body,'cleft-stone-face',[0,.83,.07],[],'head');
  part(head,'rock',c,[.4,.38,.3],[0,0,0],[0,.15,.12]);face(r,head,{y:.02,z:.3,single:true,size:.085});
  bar(head,[-.08,.31,.23],[.03,.10,.30],.019,c,'solid');bar(head,[.03,.1,.30],[-.055,-.25,.26],.019,c,'solid');
  for(const side of[-1,1]){
    const arm=animated(r,body,`boulder-fist-${side}`,[side*.52,.3,0],[],'fist',side);
    part(arm,'rock',c,[.25,.39,.27],[side*.14,-.24,.015]);part(arm,'rock',c,[.32,.31,.32],[side*.24,-.63,.17],[0,.2,side*.1]);
    const leg=animated(r,body,`rock-pillar-leg-${side}`,[side*.29,-.48,.01],[],'stomp',side);
    part(leg,'rock',c,[.25,.44,.24],[0,-.30,0]);part(leg,'box',c,[.42,.18,.49],[0,-.66,.13],[],'paper',true);
    for(let i=0;i<3;i++){
      const fall=animated(r,body,`shoulder-waterfall-${side}-${i}`,[side*(.27+i*.14),.52,-.25],[],'waterfall',i+side);
      part(fall,'sheet',c,[.24,1.35-i*.18,1],[0,0,0],[], 'paper',true);
    }
  }
  for(let i=0;i<7;i++){const a=i*Math.PI*2/7;part(m,'rock',c,[.10,.1,.13],[Math.sin(a)*.66,.1,Math.cos(a)*.43]);}
  r.core=part(body,'head',c,[.11,.20,.05],[0,.06,.40]);
}

function marked(parent,name){const g=pivot(parent,name);g.userData.clownFeature=name;return g;}
function smile(parent,color,{stitched=false,crooked=false}={}){
  const points=[];
  for(let i=0;i<9;i++){const x=(i-4)*.051,y=-.14-.063*Math.sin(i*Math.PI/8)+(crooked?x*.2:0);points.push([x,y,.279]);}
  chain(parent,points,.019,color);
  if(stitched)for(let i=1;i<8;i++){const [x,y,z]=points[i];bar(parent,[x-.015,y-.035,z+.004],[x+.015,y+.035,z+.004],.009,color,'solid');}
}
function cards(parent,color,count=3){
  for(let i=0;i<count;i++){
    const card=pivot(parent,`folded-card-${i}`,[(i-(count-1)/2)*.12,Math.abs(i-(count-1)/2)*.03,0],[0,0,(i-(count-1)/2)*-.22]);
    part(card,'box',color,[.21,.29,.025],[],[],'paper');
    part(card,'box',color,[.058,.074,.012],[0,0,.022],[0,0,Math.PI/4],'solid');
  }
}
function clown(r,id){
  const c=r.color,m=r.motion,ink=0x302d3b,red=0xa33340,green=id==='mint-harlequin'?0x8cba94:0x416e49;
  const body=animated(r,m,'clown-suited-body',[0,1.15,0],[],'sway');
  part(body,'taper',c,[.36,.87,.23],[],[],'clown-cloth');
  const shirt=part(body,'triangle',ink,[.30,.61,1],[0,.09,.235],[0,0,Math.PI]);shirt.name='clown-paper-shirt';
  for(const side of[-1,1]){
    part(body,'triangle',c,[.28,.43,1],[side*.15,.20,.248],[0,0,side*.28]);
    const leg=animated(r,body,`clown-leg-${side}`,[side*.16,-.41,0],[],'leg',side);
    chain(leg,[[0,0,0],[side*.014,-.32,.018],[0,-.70,.035]],.076,c);
    part(leg,'box',ink,[.19,.13,.34],[0,-.73,.12],[],'dark');
  }
  const left=animated(r,body,'clown-prop-arm-left',[-.30,.25,0],[0,0,-.18],'fist',-1);
  const right=animated(r,body,'clown-prop-arm-right',[.30,.25,0],[0,0,.12],'arm',1);
  for(const [arm,side]of[[left,-1],[right,1]]){
    chain(arm,[[0,0,0],[side*.17,-.30,.025],[side*.22,-.58,.20]],.075,c);
    part(arm,'head',ink,[.085,.105,.065],[side*.22,-.58,.20]);
  }
  const head=animated(r,body,'clown-white-face',[0,.78,.02],[],'head');
  part(head,'head',ink,[.31,.39,.265],[],[],'clown-face',false);
  const eyeGroup=marked(head,id==='mint-harlequin'?'mint-asymmetric-eyes':id==='stitched-host'?'host-vertical-eye-ink':'clown-dark-eyes');
  if(id==='carnival-conductor'){
    const triangles=marked(head,'carnival-blue-triangles');
    for(const side of[-1,1])for(const vertical of[-1,1])part(triangles,'triangle',0x315f91,[.13,.14,1],[side*.13,.047+vertical*.09,.258],[0,0,vertical>0?0:Math.PI], 'solid',false);
  }
  for(const side of[-1,1]){
    const width=id==='mint-harlequin'&&side<0?.089:.068,height=id==='stitched-host'?.125:id==='mint-harlequin'&&side<0?.105:.062;
    part(eyeGroup,'head',ink,[width,height,.021],[side*.12,.035,.252],[0,0,side*.13],'solid',false);
    const pupil=part(eyeGroup,'head',id==='carnival-conductor'?0x3d698b:red,[.018,.021,.012],[side*.12,.035,.277],[], 'solid',false);r.eyes.push(pupil);
  }
  if(id==='ink-jester'){
    const hair=marked(head,'ink-brush-hair');
    for(let i=0;i<9;i++){const a=-1.35+i*.34,x=Math.sin(a)*.25,y=Math.cos(a)*.31;
      chain(hair,[[x,y,-.035],[x+Math.sin(a)*.11,y+.14,0],[x+Math.sin(a+.5)*.18,y+.16+(i%3)*.055,.055]],.048,green);
    }
    smile(marked(head,'ink-crooked-smile'),red,{crooked:true});
    const tails=marked(body,'ink-torn-coattails');
    for(let i=0;i<3;i++)part(tails,'sheet',c,[.28,.55+(i%2)*.19,1],[(i-1)*.22,-.22,-.17],[0,0,(i-1)*.13]);
    const fan=marked(left,'ink-card-fan');fan.position.set(-.22,-.53,.29);cards(fan,c);
    bar(right,[.22,-.50,.22],[.30,-.91,.26],.023,ink);part(right,'head',red,[.072,.072,.072],[.22,-.49,.22]);
  }else if(id==='velvet-dealer'){
    const hair=marked(head,'dealer-combed-hair');
    part(hair,'head',green,[.316,.20,.27],[0,.25,-.055]);
    for(let i=0;i<7;i++)bar(hair,[(i-3)*.065,.38,.06],[(i-3)*.075,.24,.214],.012,0x28492f,'solid');
    smile(head,red);const buttons=marked(body,'dealer-double-buttons');
    for(const side of[-1,1])for(let i=0;i<3;i++)part(buttons,'head',ink,[.023,.023,.016],[side*.10,.18-i*.16,.247],[],'solid',false);
    const cane=marked(left,'dealer-diamond-cane');bar(cane,[-.22,-.57,.2],[-.24,-1.35,.19],.025,ink);
    part(cane,'box',0x6b925e,[.15,.15,.055],[-.22,-.52,.2],[0,0,Math.PI/4]);
    const fan=marked(right,'dealer-spread-cards');fan.position.set(.22,-.54,.28);cards(fan,c,4);
  }else if(id==='carnival-conductor'){
    const vest=marked(body,'carnival-yellow-waistcoat');
    part(vest,'box',0xbb983b,[.29,.61,.025],[0,.0,.255],[],'clown-cloth');
    for(let i=0;i<3;i++)part(vest,'head',red,[.023,.023,.012],[0,.18-i*.17,.278],[],'solid',false);
    const nose=marked(head,'carnival-round-red-nose');part(nose,'head',red,[.079,.063,.057],[0,-.045,.292],[],'solid',false);
    smile(head,red);part(head,'head',red,[.087,.025,.01],[0,-.223,.26],[],'solid',false);
    const hair=marked(head,'carnival-long-green-hair');part(hair,'head',green,[.32,.17,.245],[0,.29,-.085]);
    for(const side of[-1,1])for(let i=0;i<3;i++)part(hair,'sheet',green,[.15,.52+i*.035,1],[side*(.235+i*.025),.26,-.08+i*.05],[0,side*.4,side*.10]);
    for(const side of[-1,1])part(body,'sheet',c,[.38,.62,1],[side*.21,-.25,-.18],[0,0,side*.16]);
    const balls=marked(left,'carnival-juggling-balls');
    for(let i=0;i<3;i++)part(balls,'head',[red,0xb59b3a,0x4e7595][i],[.087,.087,.087],[-.24+(i-1)*.16,-.50+Math.sin(i*Math.PI/2)*.22,.28]);
    bar(right,[.20,-.60,.22],[.26,-.07,.28],.025,ink);
    for(let i=0;i<4;i++)part(right,'tube',red,[.03,.039,.03],[.21+i*.01,-.51+i*.115,.235]);
  }else if(id==='mint-harlequin'){
    const hair=marked(head,'mint-short-hair');part(hair,'head',green,[.305,.135,.235],[0,.325,-.054]);
    for(let i=0;i<5;i++)part(hair,'box',green,[.082,.06,.09],[(i-2)*.082,.408-(Math.abs(i-2)*.012),.018],[0,0,-.10]);
    smile(head,ink,{crooked:true});
    const collar=marked(body,'mint-folded-collar');
    for(const side of[-1,1]){part(collar,'triangle',green,[.38,.40,1],[side*.25,.52,.07],[0,0,side*-.5]);part(collar,'triangle',c,[.32,.26,1],[side*.42,.26,.09],[0,0,-side*.8]);}
    const hourglass=marked(left,'mint-hourglass');hourglass.position.set(-.23,-.57,.28);
    part(hourglass,'cone',green,[.15,.23,.15],[0,.10,0],[Math.PI,0,0]);part(hourglass,'cone',green,[.15,.23,.15],[0,-.12,0]);
    for(const side of[-1,1]){part(hourglass,'tube',ink,[.18,.035,.18],[0,side*.235,0]);bar(hourglass,[side*.14,-.23,0],[side*.14,.23,0],.013,ink);}
    bar(right,[.2,-.61,.22],[.37,-.14,.23],.024,ink);part(right,'ring',green,[.1,.1,.4],[.38,-.12,.23]);
  }else if(id==='stitched-host'){
    const hair=marked(head,'host-dark-parted-hair');part(hair,'head',ink,[.312,.14,.23],[0,.30,-.07],[],'dark');
    for(let i=0;i<4;i++)part(hair,'triangle',ink,[.10,.15,1],[(i-1.5)*.11,.285,.14],[0,0,-.4],'solid',false);
    smile(marked(head,'host-stitched-smile'),ink,{stitched:true});
    const tux=marked(body,'host-black-tuxedo-tails');
    for(const side of[-1,1]){part(tux,'sheet',ink,[.28,.83,1],[side*.18,-.18,-.16],[0,0,side*.07],'dark');part(tux,'triangle',ink,[.18,.12,1],[side*.075,.34,.266],[0,0,side*Math.PI/2],'solid',false);}
    const spool=marked(left,'host-thread-spool');spool.position.set(-.25,-.53,.25);
    part(spool,'tube',c,[.14,.28,.14],[],[0,0,Math.PI/2]);
    for(const side of[-1,1])part(spool,'tube',ink,[.21,.04,.21],[side*.16,0,0],[0,0,Math.PI/2]);
    for(let i=0;i<6;i++)bar(spool,[-.1,-.10,.14],[.14+(i-2.5)*.10,.34,.16],.009,ink,'solid');
    const watch=marked(right,'host-pocket-watch');part(watch,'ring',c,[.14,.17,.45],[.22,-.55,.3]);
    chain(watch,[[.22,-.42,.29],[.3,-.29,.23],[.19,-.20,.21]],.01,ink,'solid');
  }
  r.core=part(body,'head',c,[.045,.05,.02],[0,.24,.29]);
}

const builders={
  'arcade-wraith':wraith,'bridge-serpent':serpent,'bronze-oni':oni,'beacon-siren':siren,
  'ancestral-marionette':marionette,'pagoda-eye':pagoda,'lake-hydra':hydra,
  'porcelain-widow':widow,'cloud-harpy':harpy,'octagon-jailer':jailer,
  'sea-revenant':revenant,'cascade-colossus':colossus,
  ...Object.fromEntries(['ink-jester','velvet-dealer','carnival-conductor','mint-harlequin','stitched-host'].map(id=>[id,r=>clown(r,id)])),
};

export function createDemonBoss(bossId){
  if(!BOSS_BY_ID[bossId])throw new RangeError(`Unknown demon boss: ${bossId}`);
  const info=BOSS_BY_ID[bossId],root=new THREE.Group();root.name=info.name;
  const motion=pivot(root,'demon-motion'),r={motion,color:info.color,parts:[],eyes:[],core:null};
  builders[bossId](r);
  root.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(motion),height=bounds.max.y-bounds.min.y;
  if(!Number.isFinite(height)||height<=0)throw new Error(`Invalid demon geometry: ${bossId}`);
  const scale=3/height;motion.scale.setScalar(scale);motion.position.y=-bounds.min.y*scale;
  const restY=motion.position.y;
  for(const p of r.parts){p.position=p.group.position.clone();p.rotation=p.group.rotation.clone();p.scale=p.group.scale.clone();}
  const charge=pivot(motion,'demon-warning-rays',[0,(bounds.min.y+bounds.max.y)/2,.45]);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;bar(charge,[Math.sin(a)*.14,Math.cos(a)*.14,0],[Math.sin(a)*.32,Math.cos(a)*.32,0],.012,info.color,'solid');}
  charge.visible=false;r.charge=charge;
  root.userData={demonBoss:true,bossId,enemyType:'boss',height:3,colliderRadius:.8,
    visualStyle:info.visualFeatures?'original-paper-clown':'original-paper-demon',visualFeatures:info.visualFeatures||[],description:info.description,attackStyle:info.attackStyle,
    rig:r,motionRestY:restY,rigScale:scale,animation:{death:0,attack:0,time:0}};
  root.updateMatrixWorld(true);
  return root;
}

export function animateDemonBoss(root,{time=0,dt=1/60,moving=false,telegraph=0,attacking=false,dead=false,phase=1}={}){
  if(!root?.userData?.demonBoss)return;
  const r=root.userData.rig,a=root.userData.animation;
  dt=clamp(Number.isFinite(dt)?dt:0,0,.1);time=Number.isFinite(time)?time:a.time+dt;a.time=time;
  const gait=typeof moving==='number'?clamp(moving,0,1):moving?1:0;
  const warned=telegraph>0?1:0,stage=clamp(Number.isFinite(phase)?phase:1,1,3),speed=1+(stage-1)*.16;
  a.death=dead?Math.min(1,a.death+dt*1.6):Math.max(0,a.death-dt*5);
  a.attack=attacking?Math.min(1,a.attack+dt*10):Math.max(0,a.attack-dt*6);
  const alive=1-a.death,t=time*speed,kick=Math.sin(a.attack*Math.PI)*alive;
  const m=r.motion,base=root.userData.rigScale;
  m.position.y=root.userData.motionRestY-a.death*.25;
  m.rotation.set(-a.death*.6,0,Math.sin(t*1.7)*.012*alive);
  m.scale.set(base*(1-a.death*.5),base*Math.max(.04,1-a.death*.93),base*(1-a.death*.5));
  for(const p of r.parts){
    const g=p.group;g.position.copy(p.position);g.rotation.copy(p.rotation);g.scale.copy(p.scale);
    const wave=Math.sin(t*2.3+p.phase*1.37)*alive;
    switch(p.role){
      case 'hover':g.position.y+=Math.sin(t*2+p.phase)*.055*alive;g.rotation.z+=wave*.025;break;
      case 'heavy':g.position.y+=Math.abs(Math.sin(t*4))*gait*.045*alive;g.rotation.x-=warned*.06+kick*.08;break;
      case 'sway':g.rotation.z+=wave*.055;break;
      case 'head':g.rotation.y+=wave*.09;g.rotation.x-=warned*.08+kick*.10;break;
      case 'arm':g.rotation.z+=wave*.12-p.phase*warned*.25;g.rotation.x-=kick*.5;break;
      case 'fist':g.rotation.x-=warned*.55+kick*.9;g.rotation.z+=p.phase*wave*.055;break;
      case 'stomp':g.position.y+=Math.max(0,Math.sin(t*5+p.phase*Math.PI))*gait*.09*alive;g.rotation.x+=wave*gait*.08;break;
      case 'leg':g.rotation.x+=Math.sin(t*4.5+p.phase*1.4)*gait*.16*alive;g.rotation.z+=wave*.025;break;
      case 'rag':g.rotation.x+=wave*.14;g.rotation.z+=Math.cos(t*2.7+p.phase)*.07*alive;break;
      case 'coil':g.rotation.y+=wave*.05;g.scale.x*=1+warned*.035;break;
      case 'neck':g.rotation.z+=wave*.09;g.rotation.x-=warned*.15+kick*.24;break;
      case 'jaw':g.rotation.x+=Math.sin(t*3+p.phase)*.025*alive+warned*.16+kick*.20;break;
      case 'tail':g.rotation.y+=wave*.23;g.rotation.z+=wave*.05;break;
      case 'puppet':g.rotation.z+=Math.sin(t*3.2)*.05*alive;g.position.y+=Math.sin(t*2.4)*.025*alive;break;
      case 'puppetArm':g.rotation.z+=Math.sin(t*2.8+p.phase*1.1)*.17*alive+warned*.28*Math.sign(p.phase||1);g.rotation.x-=kick*.45;break;
      case 'frame':g.rotation.y+=wave*.05;break;
      case 'orbit':g.rotation.y+=t*.23*(p.phase||1)*alive;g.position.y+=wave*.025;break;
      case 'charm':g.rotation.y+=t*.65*alive;g.position.y+=wave*.08;break;
      case 'hydraNeck':g.rotation.z+=wave*.11;g.rotation.y+=Math.cos(t*1.9+p.phase)*.13*alive;g.rotation.x-=warned*.14+kick*.18;break;
      case 'abdomen':g.scale.y*=1+Math.sin(t*3)*.025*alive+warned*.045;g.rotation.x+=kick*.08;break;
      case 'wing':g.rotation.z+=p.phase*(Math.sin(t*4.5)*.14+warned*.24-kick*.30)*alive;break;
      case 'yoke':g.rotation.z+=wave*.025;g.scale.multiplyScalar(1+warned*.025);break;
      case 'anchor':g.rotation.x-=warned*.45+kick*.55;g.rotation.z+=wave*.08;break;
      case 'waterfall':g.rotation.x+=Math.sin(t*3+p.phase)*.06*alive;g.scale.y*=1+wave*.035;break;
    }
  }
  r.charge.visible=!dead&&warned>0;r.charge.rotation.z=-time*.75;
  r.charge.scale.setScalar(.9+Math.sin(time*16)*.12+(stage-1)*.13);
  for(let i=0;i<r.eyes.length;i++)r.eyes[i].visible=!dead||a.death<.7;
}

/** Global shutdown only; never dispose shared materials when one Boss dies. */
export function disposeDemonBosses(){
  for(const item of geometries.values())item.dispose();
  for(const item of materials.values())item.dispose();
  geometries.clear();materials.clear();
}
