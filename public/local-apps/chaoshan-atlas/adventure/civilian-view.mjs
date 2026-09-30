import * as THREE from 'three';
import {groundHeight} from './landforms.mjs';
export function createCivilianView(root,level){
  const group=new THREE.Group();group.name='living-streets';root.add(group);
  const material=new THREE.MeshBasicMaterial({color:0xffffff}),cube=new THREE.BoxGeometry(1,1,1),sphere=new THREE.SphereGeometry(1,10,8);
  const boxes=new THREE.InstancedMesh(cube,material,600),rounds=new THREE.InstancedMesh(sphere,material,150);boxes.frustumCulled=rounds.frustumCulled=false;group.add(boxes,rounds);
  const dummy=new THREE.Object3D(),color=new THREE.Color(),labels=new Map();let bi=0,ri=0;
  const stamp=(mesh,n,actor,x,y,z,sx,sy,sz,tint)=>{const yaw=Math.atan2(actor.facingX||0,actor.facingZ??1),c=Math.cos(yaw),s=Math.sin(yaw);dummy.position.set(actor.x+c*x+s*z,groundHeight(level,actor.x,actor.z)+(actor.y||0)+y,actor.z-s*x+c*z);dummy.rotation.set(0,yaw,0);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();mesh.setMatrixAt(n,dummy.matrix);mesh.setColorAt(n,color.set(tint));};
  const box=(actor,x,y,z,w,h,d,tint)=>stamp(boxes,bi++,actor,x,y,z,w,h,d,tint);
  const ball=(actor,x,y,z,w,h,d,tint)=>stamp(rounds,ri++,actor,x,y,z,w,h,d,tint);
  function label(actor,text,tint,height){
    let l=labels.get(actor.id);if(!l){const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;const texture=new THREE.CanvasTexture(canvas),mat=new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:true}),sprite=new THREE.Sprite(mat);sprite.scale.set(2.2,.55,1);group.add(sprite);l={canvas,texture,mat,sprite,key:''};labels.set(actor.id,l);}
    const key=`${text}:${Math.ceil(actor.hp)}:${tint}`;
    if(l.key!==key){const ctx=l.canvas.getContext('2d');ctx.clearRect(0,0,256,64);ctx.fillStyle='#faf4e7';ctx.fillRect(4,1,248,61);ctx.fillStyle=tint;ctx.font='bold 24px "Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.fillText(text,128,29);ctx.fillStyle='#c8c3b7';ctx.fillRect(20,42,216,9);ctx.fillStyle=tint;ctx.fillRect(20,42,216*Math.max(0,actor.hp/actor.maxHp),9);l.texture.needsUpdate=true;l.key=key;}
    l.sprite.visible=true;l.sprite.position.set(actor.x,groundHeight(level,actor.x,actor.z)+(actor.y||0)+height,actor.z);
  }
  const zoneCanvas=document.createElement('canvas');zoneCanvas.width=256;zoneCanvas.height=128;const zc=zoneCanvas.getContext('2d');zc.fillStyle='#f7f1df';zc.fillRect(0,0,256,128);zc.strokeStyle='#3d795d';zc.lineWidth=8;zc.strokeRect(4,4,248,120);zc.fillStyle='#3d795d';zc.textAlign='center';zc.font='bold 36px "Microsoft YaHei",sans-serif';zc.fillText('旅人避难处',128,53);zc.font='26px sans-serif';zc.fillText('护送至少 5 人',128,99);
  const zoneTexture=new THREE.CanvasTexture(zoneCanvas),zoneMaterial=new THREE.SpriteMaterial({map:zoneTexture}),zoneSign=new THREE.Sprite(zoneMaterial);zoneSign.scale.set(3.8,1.9,1);group.add(zoneSign);
  const ringGeo=new THREE.RingGeometry(2.8,3,48),ringMat=new THREE.MeshBasicMaterial({color:0x4f8766,side:THREE.DoubleSide,transparent:true,opacity:.8}),ring=new THREE.Mesh(ringGeo,ringMat);ring.rotation.x=-Math.PI/2;group.add(ring);
  function update(state){
    const current=state?.level||state||level,e=current.evacuation;group.visible=!!e;if(!e)return;bi=ri=0;for(const l of labels.values())l.sprite.visible=false;
    const t=current.elapsed||0;
    for(const p of e.people){if(p.evacuated||p.insideVehicleId)continue;
      const ink=p.alive?p.following?'#38654e':'#536a7c':'#9b9489',paper='#eee5d1',stride=p.moving?Math.sin(t*(p.sprinting?14:8)+Number(p.id.split('-').at(-1)))*(p.sprinting?.3:.18):0;
      if(!p.alive){box(p,0,.04,0,.9,.06,.28,ink);continue;}
      ball(p,0,1.4,0,.25,.25,.22,ink);ball(p,0,1.4,.025,.22,.22,.205,paper);
      box(p,-.07,1.43,.23,.035,.04,.025,ink);box(p,.07,1.43,.23,.035,.04,.025,ink);
      box(p,0,.93,0,.36,.46,.2,ink);box(p,0,.93,.018,.31,.4,.2,paper);
      box(p,-.29,.9,stride,.065,.52,.065,ink);box(p,.29,.9,-stride,.065,.52,.065,ink);
      box(p,-.12,.36,-stride,.075,.59,.075,ink);box(p,.12,.36,stride,.075,.59,.075,ink);
      ball(p,-.12,.055,-stride+.06,.14,.055,.18,ink);ball(p,.12,.055,stride+.06,.14,.055,.18,ink);
      label(p,p.following?'跟随中':e.phase==='peace'?'街上行人':'靠近带领',ink,2.02);
    }
    for(const v of e.vehicles){const ink=v.alive?'#46617b':'#a28a78',paper=v.alive?'#e7dfca':'#b7a896';
      box(v,0,.48,0,1.3,.58,2,ink);box(v,0,.5,0,1.24,.52,1.94,paper);box(v,0,.99,-.1,1.12,.45,1.13,ink);box(v,0,1.02,-.1,1.02,.37,1.02,'#b6c9d2');box(v,0,1.23,-.1,1.18,.08,1.2,paper);
      for(const x of[-.68,.68])for(const z of[-.65,.65])ball(v,x,.25,z,.12,.24,.24,ink);
      for(const x of[-.43,.43]){box(v,x,.57,1.01,.23,.14,.04,'#ddbe6b');box(v,x,.57,-1.01,.2,.13,.04,'#a65445');}
      if(v.alive)label(v,v.parked?'已停靠':e.phase==='peace'?'行驶车辆':'车辆避险',ink,1.8);
    }
    boxes.count=bi;rounds.count=ri;boxes.instanceMatrix.needsUpdate=rounds.instanceMatrix.needsUpdate=true;if(boxes.instanceColor)boxes.instanceColor.needsUpdate=true;if(rounds.instanceColor)rounds.instanceColor.needsUpdate=true;
    const z=e.safeZone,gy=groundHeight(current,z.x,z.z);zoneSign.position.set(z.x,gy+2.9,z.z);ring.position.set(z.x,gy+.055,z.z);
  }
  return{group,update,dispose(){group.removeFromParent();cube.dispose();sphere.dispose();material.dispose();for(const l of labels.values()){l.texture.dispose();l.mat.dispose();}zoneTexture.dispose();zoneMaterial.dispose();ringGeo.dispose();ringMat.dispose();}};
}
