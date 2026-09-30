import * as THREE from './vendor/three.module.js';
import {createWindow} from './windows.js?v=11';
import {createElevator} from './elevator.js?v=11';
import {applyRole} from './character-props.js?v=11';
import {applyOutfit} from './wardrobe.js?v=11';
import {foyerFurniture,clearGlass} from './glazing.js?v=11';
export function buildInterior(life,feature){
  const scene=new THREE.Scene();scene.background=new THREE.Color('#cbd9d4');scene.add(new THREE.HemisphereLight('#fffff4','#6f7567',2.7));const sun=new THREE.DirectionalLight('#fff0d3',2.2);sun.position.set(-14,25,18);scene.add(sun);
  const n=Math.max(2,Math.ceil((feature.height||18)/3.6));
  const room={scene,feature,name:feature.name||'校园建筑',w:32,d:36,floors:n,groups:[],colliders:[],cameraMeshes:[],doors:[],windows:[],seats:[],students:[],teachers:[],boards:[],textures:[],type:feature.category==='dorm'?'dorm':/图书/.test(feature.name)?'library':/食堂|餐厅/.test(feature.name)?'dining':'classroom'};
  const cache=new Map();const mat=c=>{if(!cache.has(c))cache.set(c,new THREE.MeshStandardMaterial({color:c,roughness:.8}));return cache.get(c);};room.materials=cache;
  function block(parent,w,h,d,x,y,z,c,solid=true){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),typeof c==='number'?mat(c):c);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;mesh.userData.interiorOwned=true;parent.add(mesh);if(solid)room.colliders.push({x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,minY:y-h/2,maxY:y+h/2});room.cameraMeshes.push(mesh);return mesh;}
  function textPlane(parent,text,x,y,z,w=3,h=.6,rotation=0){const c=document.createElement('canvas');c.width=1024;c.height=256;const cx=c.getContext('2d');cx.fillStyle='#2e5650';cx.fillRect(0,0,1024,256);cx.fillStyle='#f2ecd1';cx.textAlign='center';cx.textBaseline='middle';cx.font='56px Microsoft YaHei';cx.fillText(text,512,128);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;room.textures.push(tex);const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));m.position.set(x,y,z);m.rotation.y=rotation;parent.add(m);return {canvas:c,ctx:cx,tex,mesh:m};}
  function chair(parent,x,z,y,floor,heading=Math.PI,occupied=false,label='座位'){
    block(parent,.62,.1,.64,x,y+.47,z,0x8f795b,true);block(parent,.62,.62,.08,x,y+.8,z+.29,0x8f795b,true);for(const sx of [-.23,.23])for(const sz of [-.23,.23])block(parent,.055,.43,.055,x+sx,y+.215,z+sz,0x52605c,false);
    const seat={id:`seat-${floor}-${room.seats.length}`,x,z,y:floor*3.6,floor,heading,occupied,label};room.seats.push(seat);return seat;
  }
  function student(parent,seat,index){const rig=life.avatar(['purple','female-lilac','blue','female-blue','green','female-green','orange','female-orange'][index%8]);const root=life.root(rig);root.position.set(seat.x,seat.y,seat.z);root.rotation.y=seat.heading;parent.add(root);room.students.push({rig,seat,floor:seat.floor,phase:index*.7,name:['小林','小陈','小周','小许'][index%4]});seat.occupied=true;}
  for(let floor=0;floor<n;floor++){
    const y=floor*3.6,g=new THREE.Group();scene.add(g);room.groups.push(g);
    const slabCollider=(x0,x1,z0,z1)=>{
      const add=(a,b,c,d)=>{if(b>a&&d>c)room.colliders.push({x0:a,x1:b,z0:c,z1:d,minY:y-.14,maxY:y});};
      if(floor===0||x1<=-1.78||x0>=1.78||z1<=-17.8||z0>=-14.05){add(x0,x1,z0,z1);return;}
      add(x0,Math.min(x1,-1.78),z0,z1);add(Math.max(x0,1.78),x1,z0,z1);add(Math.max(x0,-1.78),Math.min(x1,1.78),z0,Math.min(z1,-17.8));add(Math.max(x0,-1.78),Math.min(x1,1.78),Math.max(z0,-14.05),z1);
    };
    if(floor===0)slabCollider(-16,16,-18,18);else{slabCollider(-16,11.55,-18,18);slabCollider(15.45,16,-18,18);slabCollider(11.55,15.45,-18,-17.25);slabCollider(11.55,15.45,-7.75,18);}
    const slab=new THREE.Shape([new THREE.Vector2(-16,-18),new THREE.Vector2(16,-18),new THREE.Vector2(16,18),new THREE.Vector2(-16,18)]);
    if(floor>0)slab.holes.push(new THREE.Path([new THREE.Vector2(-1.78,17.8),new THREE.Vector2(1.78,17.8),new THREE.Vector2(1.78,14.05),new THREE.Vector2(-1.78,14.05)]));
    if(floor>0)slab.holes.push(new THREE.Path([new THREE.Vector2(11.8,17),new THREE.Vector2(15.2,17),new THREE.Vector2(15.2,8),new THREE.Vector2(11.8,8)]));
    const floorMesh=new THREE.Mesh(new THREE.ShapeGeometry(slab),mat(floor%2?0xc6c9bb:0xc4bcaa));floorMesh.material.side=THREE.DoubleSide;floorMesh.rotation.x=-Math.PI/2;floorMesh.position.y=y;floorMesh.receiveShadow=true;floorMesh.userData.interiorOwned=true;g.add(floorMesh);room.cameraMeshes.push(floorMesh);if(floor===n-1)block(g,32,.16,36,0,y+3.52,0,0xe0dfd0);
    // Solid exterior walls with translucent windows above the sills.
    for(const side of [-1,1]){
      const x=side*16;block(g,.22,1,36,x,y+.5,0,0xe6e0ce);block(g,.22,.5,36,x,y+3.35,0,0xe6e0ce);
      for(let z=-18;z<=18;z+=6)block(g,.3,2.1,.3,x,y+2,z,0xd1d1bc);
      for(const z of [-15,-9,-3,3,9,15]){const window=createWindow(THREE,{x,z,y,side,width:5.4,height:2,sill:1});g.add(window.group);room.windows.push(window);window.group.traverse(m=>{if(m.isMesh)room.cameraMeshes.push(m);});}
    }
    block(g,32,3.6,.24,0,y+1.8,-18,0xe6e0ce);if(floor===0&&feature.windowLobby){for(const sign of [-1,1]){block(g,10.8,3.6,.24,sign*10.6,y+1.8,18,0xe6e0ce);block(g,.5,3.6,.24,sign*1.55,y+1.8,18,0xe6e0ce);block(g,3.4,.67,.24,sign*3.5,y+.335,18,0xe6e0ce);block(g,3.4,.83,.24,sign*3.5,y+3.185,18,0xe6e0ce);block(g,3.4,2.1,.07,sign*3.5,y+1.72,18,clearGlass);}const foyer=foyerFurniture();foyer.group.position.z=18;g.add(foyer.group);foyer.group.traverse(m=>{if(m.isMesh){m.userData.interiorOwned=true;room.cameraMeshes.push(m);}});for(const c of foyer.solids)room.colliders.push({...c,z0:c.z0+18,z1:c.z1+18});for(const [i,x] of [-3.5,3.5].entries()){const seat={id:'foyer-'+i,x,z:15.15,y:0,floor:0,heading:0,occupied:true};room.seats.push(seat);student(g,seat,i+1);}}else{block(g,14.7,3.6,.24,-8.65,y+1.8,18,0xe6e0ce);block(g,14.7,3.6,.24,8.65,y+1.8,18,0xe6e0ce);}block(g,2.6,.7,.24,0,y+3.25,18,0xe6e0ce);
    const exit=life.makeDoor(scene,{x:0,z:18,y,width:2.6,height:2.9,label:floor===0?'校园出口':`${floor+1}楼阳台门`,kind:floor===0?'exit':'balcony'});room.doors.push(exit);if(floor===0){room.exit=exit;exit.open=true;exit.target=-Math.PI*.53;exit.amount=exit.target;exit.pivot.rotation.y=exit.amount;}else{block(g,8,.16,4,0,y-.08,20,0xbabfac,false);block(g,8,1,.12,0,y+.5,22,0x6b837a);for(const side of [-1,1])block(g,.12,1,4,side*4,y+.5,20,0x6b837a);}
    block(g,13.5,3.6,.2,-9.25,y+1.8,0,0xe3dfd3);block(g,13.5,3.6,.2,9.25,y+1.8,0,0xe3dfd3);
    for(const sign of [-1,1]){
      const x=sign*2.5;
      for(const [a,b] of [[-18,-8.15],[-5.85,5.85],[8.15,floor===0&&feature.windowLobby?13.5:18]])block(g,.2,3.6,b-a,x,y+1.8,(a+b)/2,0xe3dfd3);
      for(const z of [-7,7]){
        block(g,.2,.85,2.3,x,y+3.175,z,0xe3dfd3);
        const door=life.makeDoor(scene,{x,z,y,width:2.3,height:2.75,angle:sign*Math.PI/2,label:`${floor+1}${z<0?'0':'1'}${sign<0?'1':'2'} ${room.type==='dorm'?'宿舍':room.type==='library'?'阅览室':room.type==='dining'?'就餐区':'教室'}`});room.doors.push(door);door.floor=floor;
      }
    }
    textPlane(g,`${floor+1}F · 楼梯 ↑ / 电梯 ↕`,0,y+2.6,-17.8,4.2,.7);
    // Staircase occupies a real hole in the upper floor. Treads and rails have depth.
    if(floor<n-1){for(let step=0;step<24;step++){const sy=(step+1)*3.6/24,z=-8-(step+.5)*9/24;block(g,3.4,sy,9/24,13.5,y+sy/2,z,0xb9bbab,false);}for(const x of [11.85,15.15]){for(let step=0;step<=12;step++){const zz=-8-step*.75,yy=y+step*.3;block(g,.06,.92,.06,x,yy+.46,zz,0x66756b,false);}const rail=block(g,.07,.07,Math.hypot(9,3.6),x,y+2.65,-12.5,0x66756b,false);rail.rotation.x=-Math.atan2(3.6,9);}}
    for(const sign of [-1,1])for(const half of [-1,1]){
      const cx=sign*8.3,cz=half*9,roomName=`${floor+1}${half<0?'0':'1'}${sign<0?'1':'2'}`;
      textPlane(g,`${roomName} · ${room.type==='dorm'?'学生宿舍':room.type==='library'?'安静阅览':room.type==='dining'?'校园餐厅':'课堂'}`,sign*2.35,y+2.9,half*7,2,.38,sign<0?Math.PI/2:-Math.PI/2);
      if(room.type==='classroom'){
        const subject=life.subjectForRoom(feature,floor*4+(sign<0?0:2)+(half<0?0:1));
        const boardZ=cz-7;const board=textPlane(g,'求是 · 创新',cx,y+1.65,boardZ+.13,7,1.2);board.floor=floor;board.roomName=roomName;board.subject=subject;board.width=7;board.height=1.2;room.boards.push(board);if(subject)textPlane(g,subject.title,cx,y+2.65,boardZ+.14,3.5,.38);
        block(g,7,.13,1.4,cx,y+.06,boardZ+1.2,0xc4bca3,false);block(g,1.3,1,.65,cx,y+.5,boardZ+1.4,0x8f795b);
        const teacher=life.avatar(floor%2?'female-blue':'blue');applyOutfit(THREE,teacher,'formal','navy');applyRole(THREE,teacher,'teacher');life.root(teacher).position.set(cx+2,y,boardZ+1.1);g.add(life.root(teacher));room.teachers.push({rig:teacher,board,floor,subject,roomName,name:subject?.teacher||(floor%2?'林老师':'陈老师')});
        for(let row=0;row<3;row++)for(let col=0;col<3;col++){
          const x=cx+(col-1)*2.3,z=cz-3+row*3;if(sign>0&&half<0&&x>10.5)continue;
          block(g,1.55,.13,.7,x,y+.83,z,0xb49b72);for(const dx of [-.6,.6])block(g,.06,.76,.5,x+dx,y+.38,z,0x5b716b);
          const seat=chair(g,x,z+1,y,floor,Math.PI,false,`${roomName} · ${subject?.title||'教室'} 空位`);
          if((row+col+floor)%4===1)student(g,seat,row*3+col);
          block(g,.38,.03,.3,x,y+.915,z,0xf0e5c5,false);
        }
      }else if(room.type==='dorm'){
        for(const dx of [-2.8,2.8]){const x=cx+dx;if(sign>0&&half<0&&x>10.5)continue;block(g,1.8,.16,3.1,x,y+.54,cz-3,0x957e5d);for(const side of [-1,1])for(const end of [-1,1])block(g,.12,.48,.12,x+side*.76,y+.24,cz-3+end*1.38,0x6c786c);block(g,1.8,.9,.12,x,y+.9,cz-4.5,0x957e5d);block(g,1.7,.2,3,x,y+.73,cz-3,0xa1b6b6);block(g,1.3,.14,.5,x,y+.92,cz-4,0xe5e0cf,false);block(g,1.8,2.65,.8,x,y+1.325,cz-6.2,0x9a8c6b);block(g,1.7,.14,.8,x,y+.83,cz+3,0xb09a72);for(const side of [-1,1])block(g,.08,.76,.65,x+side*.72,y+.38,cz+3,0x5b716b);const seat=chair(g,x,cz+4,y,floor,Math.PI,false,`${roomName} 书桌座位`);if(dx<0)student(g,seat,half+2);}
        block(g,1.5,.06,1.5,cx,y+.03,cz,0x9aab91,false);
      }else if(room.type==='library'){
        for(const dx of [-3.7,3.7]){const x=cx+dx;if(sign>0&&half<0&&x>10.5)continue;block(g,.7,2.6,9,x,y+1.3,cz,0x998465);for(let shelf=0;shelf<4;shelf++)for(let b=0;b<18;b++)block(g,.8,.35,.32,x,y+.35+shelf*.58,cz-4+b*.46,[0x6c8d81,0xb79373,0x8d83a3][b%3],false);}
        for(const z of [cz-3,cz,cz+3]){block(g,2.8,.14,1,cx,y+.83,z,0xbca787);for(const side of [-1,1])block(g,.1,.76,.72,cx+side*1.15,y+.38,z,0x5b716b);const seat=chair(g,cx,z+1,y,floor,Math.PI,false,`${roomName} 阅读座位`);if(z===cz)student(g,seat,1);}
      }else{
        for(const dx of [-2.5,2.5])for(const dz of [-3,2]){const x=cx+dx,z=cz+dz;if(sign>0&&half<0&&x>10.5)continue;block(g,2.7,.14,1,x,y+.8,z,0xd0c6a7);for(const side of [-1,1])block(g,.1,.73,.7,x+side*1.1,y+.365,z,0x5b716b);for(const side of [-1,1]){const seat=chair(g,x,z+side*1.1,y,floor,side===1?Math.PI:0,false,`${roomName} 餐厅座位`);if(dx<0&&side===1)student(g,seat,half+2);}}
        block(g,7,1.1,1,cx,y+.55,cz-6.5,0x6e8980);
      }
    }
  }
  room.elevator=createElevator(THREE,{floors:n,floorHeight:3.6});scene.add(room.elevator.group);room.colliders.push(...room.elevator.colliders);room.cameraMeshes.push(...room.elevator.cameraMeshes);room.lift={x:0,z:-14.1};
  room.groups.forEach((g,i)=>g.visible=i<=1);room.doors.forEach(d=>d.group.visible=d.y<7.2);
  return room;
}
