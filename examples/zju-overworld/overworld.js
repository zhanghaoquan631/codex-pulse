import * as THREE from './vendor/three.module.js';

const $=id=>document.getElementById(id);
const clamp=THREE.MathUtils.clamp;
const _point=new THREE.Vector3();

// A fixed map-facing camera keeps keyboard directions stable while the player
// explores. Close-up mode still exposes the original campus interactions.
export function installOverworld(life){
  life.overworld=true;
  life.mapDistance=68;
  life.mouseLook=false;
  life.yaw=0;
  $('mouse-look-toggle').checked=false;
  const camera=life.camera,originalCamera=life.updateCamera.bind(life);
  const originalRender=life.renderScene.bind(life);
  const marker=new THREE.Mesh(new THREE.RingGeometry(.58,.73,24),new THREE.MeshBasicMaterial({color:0xffd572,side:THREE.DoubleSide,depthTest:false,depthWrite:false}));
  marker.rotation.x=-Math.PI/2;marker.renderOrder=100;
  const originalMode=life.setMode.bind(life);
  life.setMode=mode=>{
    originalMode(mode);
    if(mode!=='third'){$('ow-player-label').hidden=true;marker.visible=false;document.body.classList.remove('ow-map-view');}
    if(mode==='walk'||mode==='fly'){life.mouseLook=true;$('mouse-look-toggle').checked=true;}
  };
  const clearPanels=()=>{
    for(const key of ['map','life','character'])document.body.classList.remove('ow-'+key+'-open');
    for(const id of ['ow-map','ow-life','ow-character'])$(id).setAttribute('aria-expanded','false');
  };
  for(const key of ['map','life','character']){
    $('ow-'+key).onclick=()=>{
      const wasOpen=document.body.classList.contains('ow-'+key+'-open');clearPanels();
      if(!wasOpen)document.body.classList.add('ow-'+key+'-open');
      $('ow-'+key).setAttribute('aria-expanded',String(!wasOpen));
      if(key==='character'){$('character-tools').classList.remove('compact');$('character-collapse').textContent='×';}
      if(key==='life'){$('campus-life-nav').classList.remove('compact');$('campus-life-menu').hidden=false;$('campus-life-toggle').setAttribute('aria-expanded','true');}
      if(key==='map'){$('explorer').classList.remove('collapsed');$('search').focus();}
    };
  }
  $('collapse').onclick=clearPanels;$('places-toggle').onclick=$('ow-map').onclick;
  $('character-collapse').onclick=clearPanels;
  $('campus-life-toggle').onclick=clearPanels;
  $('campus-life-menu').addEventListener('click',e=>{if(e.target.closest('button'))clearPanels();});
  addEventListener('keydown',e=>{if(e.code==='Escape')clearPanels();});
  $('ow-help').onclick=()=>{$('ow-tutorial').hidden=!$('ow-tutorial').hidden;};
  $('ow-tutorial-close').onclick=()=>$('ow-tutorial').hidden=true;
  $('ow-camera').onclick=()=>{
    life.overworld=!life.overworld;life.mouseLook=!life.overworld;
    $('mouse-look-toggle').checked=life.mouseLook;
    $('ow-camera').textContent=life.overworld?'近景视角':'俯视地图';
    document.body.classList.toggle('ow-closeup',!life.overworld);
    if(life.overworld)life.yaw=0;
    life.setMode('third');life.updateFloorVisibility();
  };
  $('third-button').onclick=()=>{life.overworld=true;life.mouseLook=false;life.yaw=0;$('mouse-look-toggle').checked=false;document.body.classList.remove('ow-closeup');$('ow-camera').textContent='近景视角';life.setMode('third');};
  $('my-location').onclick=$('third-button').onclick;
  const zoom=(factor)=>life.mapDistance=clamp(life.mapDistance*factor,38,200);
  const oldIn=$('zoom-in').onclick,oldOut=$('zoom-out').onclick;
  $('zoom-in').onclick=()=>life.overworld&&life.mode==='third'?zoom(.8):oldIn();
  $('zoom-out').onclick=()=>life.overworld&&life.mode==='third'?zoom(1.25):oldOut();
  life.env.canvas.addEventListener('wheel',e=>{if(life.overworld&&life.mode==='third'&&!life.buildMode&&!life.sportsSession){e.preventDefault();e.stopImmediatePropagation();zoom(Math.exp(e.deltaY*.001));}},{capture:true,passive:false});
  // Picking uses a world-space ground plane, then the existing obstacle-aware
  // route planner. Walking through an entrance remains a real transition.
  let down=null;
  life.env.canvas.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};},true);
  life.env.canvas.addEventListener('pointerup',e=>{
    if(life.survival?.dead)return;
    if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>6||e.button!==0||!life.overworld||life.mode!=='third'||life.buildMode||life.sportsSession||life.ride)return;
    life.env.canvas.dispatchEvent(new Event('pointercancel'));
    e.stopImmediatePropagation();clearPanels();
    const rect=life.env.canvas.getBoundingClientRect(),ray=new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);
    if(life.room){
      const doorHit=ray.intersectObjects(life.room.doors.filter(d=>d.group.visible).map(d=>d.leaf),false)[0];
      if(doorHit&&Math.hypot(doorHit.object.userData.door.x-life.position.x,doorHit.object.userData.door.z-life.position.z)<3.3){life.toggleDoor(doorHit.object.userData.door);return;}
      const target=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-life.currentFloor*3.6),new THREE.Vector3());
      if(target)life.startNavigation({x:target.x,z:target.z});return;
    }
    const creatureHit=ray.intersectObjects((life.monsters||[]).filter(m=>m.hp>0&&m.group.visible).map(m=>m.group),true)[0];
    const hit=ray.intersectObjects(life.env.buildings.map(b=>b.mesh),false)[0];
    if(creatureHit&&(!hit||creatureHit.distance<hit.distance)){
      const creature=life.monsters.find(m=>{let o=creatureHit.object;while(o){if(o===m.group)return true;o=o.parent;}return false;});
      if(creature){life.cancelNavigation();life.heading=Math.atan2(creature.group.position.x-life.position.x,creature.group.position.z-life.position.z);life.attackMonster();return;}
    }
    if(hit){life.navigateLandmark(hit.object.userData.feature);return;}
    const target=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-.16),new THREE.Vector3());
    if(target)life.startNavigation({x:target.x,z:target.z});
  },true);
  const floorVisibility=life.updateFloorVisibility.bind(life);
  life.updateFloorVisibility=()=>{
    floorVisibility();if(!life.room)return;
    if(life.overworld&&life.mode==='third'){
      life.room.groups.forEach((g,i)=>g.visible=i===life.currentFloor);
      life.room.doors.forEach(d=>d.group.visible=Math.round(d.y/3.6)===life.currentFloor);
    }
  };
  function roomCutaway(room,enabled){
    room.groups.forEach((g,floor)=>g.traverse(o=>{
      if(!o.isMesh)return;const p=o.geometry?.parameters;
      if(!p||!p.width||!p.height||!p.depth||o.parent!==g)return;
      if(!o.userData.mapOriginal)o.userData.mapOriginal={y:o.position.y,sy:o.scale.y,visible:o.visible};
      const original=o.userData.mapOriginal;
      o.scale.y=original.sy;o.position.y=original.y;o.visible=original.visible;
      if(!enabled)return;
      if(p.width>=30&&p.depth>=30&&p.height<.3){o.visible=false;return;}
      if(p.height>=2.8&&(p.width>6||p.depth>5)){
        o.scale.y=.24;o.position.y=floor*3.6+.43;
      }
    }));
    room.elevator?.group.traverse(o=>{
      if(!o.isMesh)return;
      if(/ceiling|shaft-side|shaft-back|guide-rail/.test(o.name))o.visible=!enabled;
    });
  }
  life.updateCamera=dt=>{
    const mapView=life.overworld&&life.mode==='third'&&!life.buildMode&&!life.sportsSession&&!life.ride;
    document.body.classList.toggle('ow-map-view',mapView);
    marker.visible=mapView; $('ow-player-label').hidden=!mapView;
    if(marker.parent!==life.activeScene)life.activeScene.add(marker);
    marker.position.copy(life.position);marker.position.y+=.035;
    const playerRoot=life.root(life.player);
    if(!playerRoot.userData.overworldBaseScale)playerRoot.userData.overworldBaseScale=playerRoot.scale.clone();
    playerRoot.scale.copy(playerRoot.userData.overworldBaseScale).multiplyScalar(mapView&&!life.room?1.65:1);
    if(life.room){roomCutaway(life.room,mapView);life.updateFloorVisibility();}
    for(const npc of life.npcs){const root=life.root(npc.rig);if(root!==playerRoot&&root.userData.overworldBaseScale)root.scale.copy(root.userData.overworldBaseScale);}
    if(!mapView){if(life.sportsSession)life.mouseLook=true;originalCamera(dt);return;}
    life.yaw=0;life.mouseLook=false;
    if(camera.fov!==32){camera.clearViewOffset();camera.fov=32;camera.updateProjectionMatrix();}
    const d=life.room?clamp(life.mapDistance*.7,42,75):life.mapDistance;
    const eye=life.position.clone().add(new THREE.Vector3(0,.8,0));
    if(life.room){eye.x=clamp(eye.x,-10,10);eye.z=clamp(eye.z,-12,12);}
    const wanted=eye.clone().add(new THREE.Vector3(0,d*.92,d*.40));
    if(life.snapCamera){camera.position.copy(wanted);life.snapCamera=false;}
    else camera.position.lerp(wanted,1-Math.exp(-dt*6));
    camera.lookAt(eye);camera.updateMatrixWorld();
    _point.copy(life.position).add(new THREE.Vector3(0,2.2,0)).project(camera);
    $('ow-player-label').style.transform=`translate(${(_point.x+1)*innerWidth/2}px,${(1-_point.y)*innerHeight/2}px) translate(-50%,-100%)`;
    if(life.frame%20===0||life.room!==life.lastLocationRoom){
      life.lastLocationRoom=life.room;
      const nearest=life.env.buildings.filter(b=>b.name).sort((a,b)=>Math.hypot(a.cx-life.position.x,a.cz-life.position.z)-Math.hypot(b.cx-life.position.x,b.cz-life.position.z))[0];
      $('ow-location-name').textContent=life.room?life.room.name+' · '+(life.currentFloor+1)+'F':(nearest?.placeTitle||nearest?.name||'紫金港校区')+'附近';
      $('ow-location-status').textContent=life.room?'室内探索 · E 开门 / 入座':life.navigation?'正在前往 '+life.navigation.label:'校园探索 · 点击地面出发';
    }
  };
  life.renderScene=(renderer,view)=>{
    if(life.overworld&&life.mode==='third'&&life.room&&!life.buildMode){
      const bg=life.room.scene.background;life.room.scene.background=new THREE.Color('#cad0b9');
      renderer.render(life.room.scene,view);life.room.scene.background=bg;return;
    }
    originalRender(renderer,view);
  };
  life.setMode('third');clearPanels();
  $('ow-location-name').textContent='东1教学楼 · 竺可桢学院附近';
}
