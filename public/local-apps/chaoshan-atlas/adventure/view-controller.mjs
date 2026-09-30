import * as THREE from 'three';
import { resolveCameraPosition, segmentBoxDistance, bodyAimDistance } from './camera-math.mjs';
import { groundHeight, segmentGroundDistance } from './landforms.mjs';
import { createInkMaterial, INK_COLORS } from './ink-materials.mjs';
import {animateWeapon} from './characters.mjs';
import {createYaeFirstPersonArms} from './hero-appearance.mjs';
import {mouseLook,edgeLook} from './mouse-look.mjs';
import {OPTICS,canAim,opticById,normalizeOptics,opticFov,opticLookMultiplier} from './optics.mjs';
import {playerEye,playerMuzzle,playerLeanOffset,stanceProfile} from './player-tactics.mjs';

const VIEW_KEY = 'chaoshan-adventure:view:v1';
const CAMERA_KEY = 'chaoshan-adventure:camera:v1';
const HEIGHTS = { inkling: 1.06, shade: 1.92, brute: 2.16, archer: 1.77, boss: 3.3, doodler: 1.8, lantern: 1.4, crab: 1.1 };

/** Both views control the same traveller. No gameplay state or save is changed. */
export class AdventureView {
  get yaw(){return this._yaw||0;} set yaw(value){this._yaw=value;this.targetYaw=value;}
  get pitch(){return this._pitch||0;} set pitch(value){this._pitch=value;this.targetPitch=value;}
  constructor({ camera, canvas, createWeapon, allowed, onUnlock, button, lockButton, reticle, hint, onTap = () => {}, onHold = () => {} }) {
    Object.assign(this, { camera, canvas, createWeapon, allowed, onUnlock, button, lockButton, reticle, hint });
    this.mode = 'first';
    try { const savedView = localStorage.getItem(VIEW_KEY); if (savedView === 'first' || savedView === 'third') this.mode = savedView; } catch {}
    this.yaw = 0; this.pitch = -0.17; this.dragging = false; this.distance = 5.4;
    this.onTap = onTap; this.onHold = onHold; this.followDistance = 5.4;
    this.fovs = { first: 72, third: 62 }; this.travelYaw = 0;
    this.sensitivity=1;this.motion=.65;this.recoil=0;this.trauma=0;this.turnSway=0;
    this.lookMode='follow';this.edgeTurn=0;this.lookDirty=false;this.lockPending=false;
    Object.assign(this,normalizeOptics());this.ads=false;this.aimToggled=false;
    try {
      const saved = JSON.parse(localStorage.getItem(CAMERA_KEY));
      Object.assign(this,normalizeOptics(saved));
      if (Number.isFinite(saved?.distance)) this.followDistance = THREE.MathUtils.clamp(saved.distance, 2.8, 9);
      if(Number.isFinite(saved?.sensitivity))this.sensitivity=THREE.MathUtils.clamp(saved.sensitivity,.4,3);
      if(saved?.lookMode==='drag')this.lookMode='drag';
      if(Number.isFinite(saved?.motion))this.motion=THREE.MathUtils.clamp(saved.motion,0,1);
      for (const mode of ['first', 'third']) if (Number.isFinite(saved?.[mode])) this.fovs[mode] = THREE.MathUtils.clamp(saved[mode], 55, 95);
    } catch {}
    this.anchor = new THREE.Vector3(); this.forward = new THREE.Vector3(); this.right = new THREE.Vector3();
    this.desired = new THREE.Vector3(); this.aim = new THREE.Vector3(); this.muzzle = new THREE.Vector3();
    this.ray = new THREE.Raycaster(); this.center = new THREE.Vector2();
    this.blocked = false; this.hideBody = false; this.lastCooldown = 0; this.swing = 0;this.panGuardBlend=0;
    this.weaponScene = new THREE.Scene();
    this.weaponCamera = new THREE.PerspectiveCamera(65, camera.aspect, 0.02, 5);
    this.rig = new THREE.Group(); this.weaponScene.add(this.rig);
    this.grip = new THREE.Group(); this.rig.add(this.grip);
    this.handGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.skin = createInkMaterial({ ink: INK_COLORS.blue, tone: 0.40, spacing: 8 });
    this.sleeve = createInkMaterial({ ink: INK_COLORS.blue, tone: 0.62, spacing: 8 });
    this.handEdges = new THREE.EdgesGeometry(this.handGeometry, 25);
    this.handInk = new THREE.LineBasicMaterial({ color: 0x244c73, transparent: true, opacity: 0.85 });
    const hand = (x, y, z, sleeve = false) => {
      const mesh = new THREE.Mesh(this.handGeometry, sleeve ? this.sleeve : this.skin);
      mesh.position.set(x, y, z); mesh.scale.set(sleeve ? 0.13 : 0.10, sleeve ? 0.24 : 0.13, sleeve ? 0.13 : 0.11);
      mesh.rotation.x = -0.35; mesh.add(new THREE.LineSegments(this.handEdges, this.handInk)); this.rig.add(mesh); return mesh;
    };
    this.rightHand=hand(0, -0.035, 0);this.rightSleeve=hand(0, -0.20, 0.055, true);
    this.leftHand = hand(-0.22, -0.03, -0.25); this.leftSleeve = hand(-0.24, -0.19, -0.15, true);
    this.buttons = [...new Set([button, ...document.querySelectorAll('[data-view-toggle]')])];
    this.buttons.forEach(control => control.addEventListener('click', () => this.toggle()));
    lockButton.addEventListener('click', () => this.lock());
    this.distanceInput = document.getElementById('camera-distance');
    this.settings=document.getElementById('camera-settings');this.settingsHome=this.settings?.parentElement;
    this.fovInput = document.getElementById('camera-fov');
    this.distanceInput?.addEventListener('input', () => this.setDistance(Number(this.distanceInput.value)));
    this.fovInput?.addEventListener('input', () => this.setFov(Number(this.fovInput.value)));
    this.lookModeInput=document.getElementById('camera-look-mode');
    this.lookModeInput?.addEventListener('change',()=>{
      this.lookMode=this.lookModeInput.value==='drag'?'drag':'follow';this.cancelGesture();
      this.saveSettings();this.refresh();
      if(this.lookMode==='follow')this.lock();
    });
    for(const [key,title,min,max,step]of [['sensitivity','转向灵敏度',.4,3,.1],['motion','战斗镜头动效',0,1,.1]]){
      const label=document.createElement('label'),slider=document.createElement('input');label.textContent=title;slider.type='range';slider.id=`camera-${key}`;slider.min=min;slider.max=max;slider.step=step;slider.value=this[key];label.htmlFor=slider.id;
      slider.addEventListener('input',()=>{this[key]=Number(slider.value);this.saveSettings();});document.querySelector('.camera-settings-panel')?.append(label,slider);
    }
    this.installOptics();
    document.getElementById('camera-reset')?.addEventListener('click', () => this.recenter());
    document.getElementById('camera-turn-around')?.addEventListener('click',()=>this.turnAround());
    canvas.addEventListener('wheel', event => {
      if (!allowed() || event.ctrlKey) return;
      event.preventDefault();
      const step = Math.sign(event.deltaY);
      if(this.ads){this.cycleOptic(step);return;}
      if (this.mode === 'third') this.setDistance(this.followDistance + step * .5);
      else this.setFov(this.fovs.first + step * 3);
    }, { passive: false });
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('pointerdown', event => {
      if (!allowed()) return;
      if (event.pointerType === 'touch' && this.lookPointerId != null) return;
      this.lastX = event.clientX; this.lastY = event.clientY;
      const locked=document.pointerLockElement===canvas;
      // Right-drag is a look gesture. Only free mouse look uses right-button ADS.
      if(event.button===2&&(locked||this.lookMode==='follow'))this.setAim(true);
      if (event.button === 0 && event.pointerType !== 'touch') {
        if (locked||this.lookMode==='follow') {
          this.setFiring(true);
          if(!locked&&!this.lockFailed)this.lock();
        }
        else {
          this.primary = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false, held: false };
          canvas.setPointerCapture(event.pointerId);
          this.holdTimer = setTimeout(() => {
            if (this.primary && !this.primary.dragged && allowed()) { this.primary.held = true; this.setFiring(true); }
          }, 220);
        }
      }
      if (event.button === 2 || event.pointerType === 'touch') {
        this.lookPointerId = event.pointerId;
        this.dragging = true;
        if (document.pointerLockElement !== canvas&&(event.pointerType==='touch'||this.lookMode==='drag')) canvas.setPointerCapture(event.pointerId);
      }
    });
    window.addEventListener('pointerup', event => {
      if (event.pointerType === 'touch') {
        if (event.pointerId !== this.lookPointerId) return;
        this.lookPointerId = null; this.dragging = false; return;
      }
      if(event.button===2){this.setAim(this.aimToggled);this.dragging=false;return;}
      if (this.primary?.id === event.pointerId && !this.primary.dragged && !this.primary.held && allowed()) this.onTap();
      const keepAim=this.ads;this.primary=null;this.dragging=false;clearTimeout(this.holdTimer);this.setFiring(false);this.setAim(keepAim);
    });
    window.addEventListener('pointercancel', event => { if(event.pointerType !== 'touch' || event.pointerId === this.lookPointerId) this.cancelGesture(); });
    canvas.addEventListener('lostpointercapture', event => { if(event.pointerType==='touch'){if(event.pointerId===this.lookPointerId){this.lookPointerId=null;this.dragging=false;}return;}if(!(event.buttons&1)){this.primary=null;this.dragging=false;clearTimeout(this.holdTimer);this.setFiring(false);} });
    document.addEventListener('mousedown',event=>{
      if(!allowed()||event.target!==canvas)return;
      const free=document.pointerLockElement===canvas||this.lookMode==='follow';
      if(free&&event.button===0)this.setFiring(true);
      if(free&&event.button===2)this.setAim(true);
    });
    document.addEventListener('mouseup',event=>{if(event.button===0)this.setFiring(false);if(event.button===2)this.setAim(this.aimToggled);});
    canvas.addEventListener('pointerenter',event=>{if(event.pointerType==='touch'&&this.lookPointerId!=null&&event.pointerId!==this.lookPointerId)return;this.lastX=event.clientX;this.lastY=event.clientY;this.edgeTurn=0;});
    canvas.addEventListener('pointerleave',()=>{this.edgeTurn=0;});
    canvas.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch' && event.pointerId !== this.lookPointerId) return;
      const locked = document.pointerLockElement === canvas;
      if(locked)return; // Locked relative movement is consumed once, via mousemove.
      if (!locked && this.primary && Math.hypot(event.clientX - this.primary.x, event.clientY - this.primary.y) > 6) {
        this.primary.dragged = true; this.dragging = true; clearTimeout(this.holdTimer); this.setFiring(false);
      }
      const follow=event.pointerType==='mouse'&&this.lookMode==='follow';
      if (allowed() && (follow || this.dragging)) {
        this.applyLook(event.clientX-this.lastX,event.clientY-this.lastY);
        const rect=canvas.getBoundingClientRect();
        this.edgeTurn=follow?edgeLook(event.clientX,rect.left,rect.width):0;
      }
      this.lastX = event.clientX; this.lastY = event.clientY;
    });
    document.addEventListener('mousemove',event=>{
      if(document.pointerLockElement===canvas&&allowed())this.applyLook(event.movementX,event.movementY);
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      this.lockPending=false;const held=this.firing,aim=this.ads,toggled=this.aimToggled;this.cancelGesture();if(locked&&allowed()){if(held)this.setFiring(true);this.aimToggled=toggled;this.setAim(aim);}
      if(locked&&!allowed()){document.exitPointerLock();return;}
      if(locked)this.lockFailed=false;
      if (this.wasLocked && !locked && allowed()) { this.lastUnlockAt = performance.now(); onUnlock(); }
      this.wasLocked = locked; this.refresh();
    });
    document.addEventListener('pointerlockerror', () => this.lockFallback());
    this.refresh();
  }
  installOptics(){
    const panel=document.querySelector('.camera-settings-panel');
    const select=document.createElement('select');select.id='camera-optic';select.setAttribute('aria-label','瞄准镜倍率');
    select.innerHTML=OPTICS.map(o=>'<option value="'+o.id+'">'+o.name+' '+o.zoom+'×</option>').join('');
    select.addEventListener('change',()=>this.setOptic(select.value));panel?.append(select);
    for(const o of [...OPTICS,{id:'reticle',name:'准星大小'}]){
      const label=document.createElement('label'),input=document.createElement('input'),out=document.createElement('output');
      input.type='range';input.id='camera-aim-'+o.id;input.min=o.id==='reticle'?.6:.15;input.max=o.id==='reticle'?1.6:2;input.step=.05;
      label.htmlFor=input.id;label.append(o.name+(o.id==='reticle'?'':'灵敏度 '),out);out.id=input.id+'-value';
      input.addEventListener('input',()=>{if(o.id==='reticle')this.reticleSize=Number(input.value);else this.aimSensitivity[o.id]=Number(input.value);this.saveSettings();});panel?.append(label,input);
    }
    const note=document.createElement('small');note.className='optic-note';note.textContent='右键按住开镜；8 或屏幕按钮切换开镜；7 或开镜滚轮切换红点／2×／4×。第三人称开镜时贴近目光，收镜后恢复。倍镜灵敏度独立保存；开镜减轻后坐并收紧霰弹散布。';panel?.append(note);
    this.opticControls=document.createElement('div');this.opticControls.className='optic-controls';
    this.opticControls.innerHTML='<button id="aim-toggle" type="button">开镜 8</button><button id="optic-cycle" type="button">红点 1× · 7</button><small>右键开镜 · 开镜滚轮切倍率</small>';
    document.getElementById('play-hud').append(this.opticControls);
    this.opticControls.querySelector('#aim-toggle').addEventListener('click',()=>{if(this.allowed())this.toggleAim();});
    this.opticControls.querySelector('#optic-cycle').addEventListener('click',()=>{if(this.allowed())this.cycleOptic();});
    this.opticOverlay=document.createElement('div');this.opticOverlay.className='optic-overlay';this.opticOverlay.id='optic-overlay';this.opticOverlay.hidden=true;this.opticOverlay.setAttribute('aria-hidden','true');this.opticOverlay.innerHTML='<div class="optic-ring"><span></span></div>';document.getElementById('play-hud').append(this.opticOverlay);
  }
  setOptic(id){this.optic=opticById(id).id;this.lookDirty=true;this.saveSettings();}
  cycleOptic(direction=1){this.setOptic(OPTICS[(OPTICS.findIndex(o=>o.id===this.optic)+(direction<0?2:1))%3].id);}
  setAim(value,toggle=false){const next=!!value&&canAim(this.weaponId);if(toggle)this.aimToggled=next;if(this.ads===next)return;this.ads=next;this.lookDirty=true;this.refreshOptics();}
  toggleAim(){this.setAim(!this.ads,true);}
  refreshOptics(){
    if(!this.opticControls)return;
    const o=opticById(this.optic),enabled=canAim(this.weaponId),aimButton=this.opticControls.querySelector('#aim-toggle');
    aimButton.disabled=!enabled;aimButton.textContent=enabled?(this.ads?'收镜 8':'开镜 8'):'此装备无瞄具';aimButton.setAttribute('aria-pressed',String(this.ads));
    const cycle=this.opticControls.querySelector('#optic-cycle');cycle.textContent=o.name+' '+o.zoom+'× · 7';cycle.disabled=!enabled;
    this.opticOverlay.hidden=!this.ads;this.opticOverlay.dataset.zoom=String(o.zoom);this.opticOverlay.querySelector('span').textContent=o.name+' '+o.zoom+'×';
    document.body.dataset.aiming=String(this.ads);this.reticle.style.setProperty('--reticle-size',this.reticleSize);
    document.getElementById('camera-optic').value=this.optic;
    for(const item of [...OPTICS,{id:'reticle'}]){const value=item.id==='reticle'?this.reticleSize:this.aimSensitivity[item.id],el=document.getElementById('camera-aim-'+item.id);el.value=value;document.getElementById(el.id+'-value').textContent=value.toFixed(2)+'×';}
  }
  refresh() {
    const first = this.mode === 'first', locked = document.pointerLockElement === this.canvas;
    this.buttons.forEach(control => {
      control.innerHTML = `切换${first ? '第三人称' : '第一人称'} <kbd>V</kbd>`;
      control.setAttribute('aria-label', `当前${first ? '第一' : '第三'}人称，切换${first ? '第三' : '第一'}人称`);
      control.setAttribute('aria-pressed', String(!first));
      control.title = `当前${first ? '第一人称 · 贴近旅人目光' : '第三人称 · 看见旅人全身'}`;
    });
    this.lockButton.textContent = locked ? '鼠标跟随中 · Esc 释放' : '点击开启鼠标跟随';
    this.lockButton.hidden = matchMedia('(pointer: coarse)').matches;
    this.hint.textContent = matchMedia('(pointer: coarse)').matches ? '拖动画面环视 · 镜头设置调整远近与视野' : locked||this.lookMode==='follow' ? '移动鼠标环视 · T 快速回身 · 左键攻击 · Esc 暂停' : '按住拖动画面环视 · T 快速回身 · 点击攻击';
    document.body.dataset.view = this.mode;
    this.refreshSettings();
  }
  refreshSettings() {
    if(this.lookModeInput)this.lookModeInput.value=this.lookMode;
    if (this.distanceInput) { this.distanceInput.value = this.followDistance; this.distanceInput.disabled = this.mode === 'first'; }
    if (this.fovInput) this.fovInput.value = this.fovs[this.mode];
    const distanceLabel = document.getElementById('camera-distance-value'), fovLabel = document.getElementById('camera-fov-value');
    if (distanceLabel) distanceLabel.textContent = this.mode === 'first' ? '第一人称贴身' : `${this.followDistance.toFixed(1)} 米`;
    if (fovLabel) fovLabel.textContent = `${this.fovs[this.mode]}°`;
    this.refreshOptics();
  }
  showPausedSettings(paused){
    if(!this.settings)return;
    this.settings.open=false;
    if(paused)document.querySelector('#pause-panel .dialog-actions')?.before(this.settings);
    else this.settingsHome?.append(this.settings);
  }
  saveSettings() { try { localStorage.setItem(CAMERA_KEY, JSON.stringify({ distance: this.followDistance,sensitivity:this.sensitivity,motion:this.motion,lookMode:this.lookMode,optic:this.optic,aimSensitivity:this.aimSensitivity,reticleSize:this.reticleSize, ...this.fovs })); } catch {} this.refreshSettings(); }
  setDistance(value) { if (!Number.isFinite(value)) return; this.followDistance = THREE.MathUtils.clamp(value, 2.8, 9); this.saveSettings(); }
  setFov(value) { if (!Number.isFinite(value)) return; this.fovs[this.mode] = Math.round(THREE.MathUtils.clamp(value, 55, 95)); this.saveSettings(); }
  recenter() { this.yaw = this.travelYaw; this.pitch = -.17;this.lookDirty=true; }
  turnAround(){this.yaw+=Math.PI;this.edgeTurn=0;this.lookDirty=true;}
  applyLook(dx,dy){
    if(!Number.isFinite(dx)||!Number.isFinite(dy))return;
    const next=mouseLook(this.yaw,this.pitch,dx,dy,this.sensitivity,this.ads,opticLookMultiplier(this.optic,this.aimSensitivity[this.optic]));
    this.yaw=next.yaw;this.pitch=next.pitch;this.lookDirty=true;
    this.turnSway=THREE.MathUtils.clamp(-dx*.0006,-.055,.055);
  }
  prepareInput(dt,player,level,world,time){
    if(this.lookMode==='follow'&&document.pointerLockElement!==this.canvas&&this.edgeTurn){
      this.yaw-=this.edgeTurn*2.6*Math.max(0,Math.min(.05,dt))*(this.ads?opticLookMultiplier(this.optic,this.aimSensitivity[this.optic]):1);this.lookDirty=true;
    }
    // Resolve the new shoulder/eye position BEFORE computing this frame's shot.
    if(this.lookDirty){this.update(0,player,level,world,true,time);this.lookDirty=false;}
  }
  setFiring(value){this.firing=!!value;this.onHold(this.firing);}
  cancelGesture() { clearTimeout(this.holdTimer); this.lookPointerId = null; this.primary = null; this.dragging = false;this.setAim(false,true);this.edgeTurn=0; this.setFiring(false); }
  toggle() {
    this.setAim(false,true);
    this.mode = this.mode === 'first' ? 'third' : 'first';
    this.lookDirty=true;
    try { localStorage.setItem(VIEW_KEY, this.mode); } catch {}
    this.refresh();
  }
  lock() {
    if (!this.allowed()||matchMedia('(pointer: coarse)').matches||document.pointerLockElement===this.canvas||this.lockPending) return;
    if(!this.canvas.requestPointerLock){this.lockFallback();return;}
    this.lockPending=true;
    try { this.canvas.requestPointerLock()?.catch(()=>this.lockFallback()); } catch {this.lockFallback();}
  }
  lockFallback(){this.lockPending=false;this.lockFailed=true;this.hint.textContent=this.lookMode==='follow'?'鼠标直接环视 · 移到画面左右边缘持续转向 · T 快速回身':'按住拖动画面环视 · T 快速回身';}
  release() { this.cancelGesture(); if (document.pointerLockElement === this.canvas) document.exitPointerLock(); }
  reset() { this.yaw = 0; this.travelYaw = 0; this.previousPlayer = null; this.pitch = -0.17; this.lastCooldown = 0; this.swing = 0;this.recoil=0;this.trauma=0;this.stanceEyeHeight=null;this.panGuardBlend=0; }
  kick({recoil=0,trauma=0}={}){this.recoil=Math.min(.085,this.recoil+recoil*this.motion*(this.ads?.45:1));this.trauma=Math.min(1,this.trauma+trauma*this.motion);}
  boxes(level) {
    return [...level.walls.filter(wall => wall.kind !== 'invisible' || wall.id === 'tower-core'),
      ...level.doors.filter(door => !door.open).map(door => ({ ...door, height: door.style === 'portcullis' ? 3.35 : 2.8 }))];
  }
  update(dt, player, level, world, active, time) {
    if(!active||!canAim(player.weaponId)||player.weaponId!==this.weaponId)this.setAim(false,true);
    const first = this.mode === 'first'||this.ads;
    this.recoil*=Math.exp(-dt*17);this.trauma*=Math.exp(-dt*8);this.turnSway*=Math.exp(-dt*12);
    if (active && this.previousPlayer && player.moving) {
      const dx = player.x - this.previousPlayer.x, dz = player.z - this.previousPlayer.z;
      if (Math.hypot(dx, dz) > .0001) this.travelYaw = Math.atan2(-dx, -dz);
    }
    this.previousPlayer = { x: player.x, z: player.z };
    this.forward.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const profile=stanceProfile(player),eye=playerEye(level,player,this.yaw),lean=playerLeanOffset(level,player,this.yaw);
    this.stanceEyeHeight??=profile.eyeHeight;
    this.stanceEyeHeight+=(profile.eyeHeight-this.stanceEyeHeight)*(1-Math.exp(-Math.max(0,dt)*18));
    // Smooth posture changes, but keep the eye on this side of ceilings/low cover.
    const eyeCandidate={...eye,y:eye.y-profile.eyeHeight+this.stanceEyeHeight};
    const safeEye=resolveCameraPosition(eye,eyeCandidate,this.boxes(level),.08);
    this.anchor.set(safeEye.x,safeEye.y,safeEye.z);
    this.desired.copy(this.anchor);
    if (!first) this.desired.addScaledVector(this.forward, -this.followDistance).addScaledVector(this.right, 0.52);
    let solved = resolveCameraPosition(this.anchor, this.desired, this.boxes(level), 0.22);
    // Real decorative roofs and opened door leaves also obstruct a shoulder camera.
    if (!first && solved.distance > 0.05 && world?.root) {
      world.root.updateMatrixWorld(true);
      const direction = this.desired.clone().sub(this.anchor).normalize();
      this.ray.camera=this.camera;this.ray.set(this.anchor, direction); this.ray.far = solved.distance + 0.2;
      const hit = this.ray.intersectObject(world.root, true).find(hit => hit.object.visible && hit.distance > 0.03 && !(hit.object.material?.opacity < 0.25));
      if (hit && hit.distance < solved.distance + 0.2) {
        const point = this.anchor.clone().addScaledVector(direction, Math.max(0, hit.distance - 0.25));
        solved = { ...point, distance: point.distanceTo(this.anchor), blocked: true };
      }
    }
    if (!first && solved.distance > 0.05) {
      const direction = new THREE.Vector3(solved.x,solved.y,solved.z).sub(this.anchor);
      const terrainHit = segmentGroundDistance(level,this.anchor,direction,solved.distance,0.24);
      if (terrainHit !== null) {
        const point = this.anchor.clone().addScaledVector(direction.normalize(),Math.max(0,terrainHit-0.08));
        solved = {...point,distance:point.distanceTo(this.anchor),blocked:true};
      }
    }
    this.camera.position.set(solved.x, Math.max(groundHeight(level,solved.x,solved.z)+0.24, solved.y), solved.z);
    const tremor=this.trauma*this.trauma*.006,roll=this.motion*this.turnSway*.22-lean.amount*.065;
    this.camera.rotation.set(this.pitch+this.recoil+Math.sin(time*71)*tremor,this.yaw+Math.sin(time*83)*tremor,roll,'YXZ');
    const fov = this.ads?opticFov(this.fovs.first,this.optic):this.fovs[this.mode]+(player.moving&&player.sprinting?5*this.motion:0)+this.trauma*1.4;
    if(Math.abs(this.camera.fov-fov)>.01){this.camera.fov+=(fov-this.camera.fov)*(1-Math.exp(-dt*15));this.camera.updateProjectionMatrix();}
    this.camera.updateMatrixWorld(true);
    this.distance = solved.distance; this.blocked = solved.blocked;
    this.hideBody = first || solved.distance < 2.25;
    if (!first && solved.distance < 2.25) this.hint.textContent = '镜头已避开遮挡 · V 可切换第一人称';
    else if (this.hint.textContent.startsWith('镜头已')) this.refresh();
    this.reticle.hidden = !active;
    this.reticle.classList.toggle('near-wall', !first && solved.blocked);
    if (player.weaponId !== this.weaponId) {
      this.panGuardBlend=0;
      this.grip.clear(); const weapon = this.createWeapon(player.weaponId);
      const firearm=player.weaponId==='rifle'||player.weaponId==='shotgun';
      weapon.scale.setScalar(firearm?.58:player.weaponId === 'crossbow' ? 0.65 : player.weaponId === 'spear' ? 0.52 : 0.55);
      if (player.weaponId === 'crossbow'||firearm) weapon.rotation.y = Math.PI;
      else weapon.rotation.set(-0.26, 0, -0.18);
      this.grip.add(weapon); this.weaponId = player.weaponId;this.refreshOptics();
      this.leftHand.visible = this.leftSleeve.visible = firearm||player.weaponId === 'crossbow' || player.weaponId === 'spear';
      this.leftHand.position.set(firearm?-.055:-.22,-.025,firearm?-.32:-.25);
      this.leftSleeve.position.set(firearm?-.10:-.24,-.15,firearm?-.19:-.15);
      if(firearm){this.rightSleeve.scale.set(.055,.27,.055);this.leftSleeve.scale.set(.055,.27,.055);this.rightHand.scale.set(.07,.10,.07);this.leftHand.scale.set(.07,.10,.07);}
    }
    if (player.attackCooldown > this.lastCooldown + 0.01) this.swing = 1;
    this.lastCooldown = player.attackCooldown;
    if (active) this.swing = Math.max(0, this.swing - dt * (player.weaponId === 'spear' ? 2.4 : 3.5));
    const strike = Math.sin(this.swing * Math.PI), moving = player.moving && active ? 1 : 0;
    this.rig.position.set(0.32 + Math.sin(time * 9) * moving * 0.012 - (player.weaponId === 'sword' ? strike * 0.28 : 0),
      -0.34 + Math.abs(Math.sin(time * 9)) * moving * 0.012,
      -0.63 - (player.weaponId === 'spear' ? strike * 0.30 : -strike * 0.04));
    const firearm=player.weaponId==='rifle'||player.weaponId==='shotgun';
    this.rig.rotation.set(firearm?-strike*.075:player.weaponId === 'crossbow' ? -strike * 0.10 : -strike * 0.6,firearm?0:strike*.2,player.weaponId === 'sword'?strike*.65:0);
    if(firearm){
      animateWeapon(this.grip.children[0],{firePulse:player.attackCooldown/(player.weaponId==='rifle'?.16:.82),aiming:!!this.ads,time});
      if(this.ads){this.rig.position.x=.035;this.rig.position.y=-.19;}
      this.rig.rotation.z+=this.turnSway*this.motion;this.rig.position.z+=this.recoil*.7;
    }
    if(player.weaponId==='pan'){
      // The visible lift follows the actual guard state (including a break),
      // while the body, camera and hit rules remain controlled by the game.
      const target=first&&player.guarding?1:0;
      this.panGuardBlend+=(target-this.panGuardBlend)*(1-Math.exp(-Math.max(0,dt)*14));
      const lift=this.panGuardBlend,portrait=Math.min(1,this.camera.aspect/.95);
      this.grip.children[0].scale.setScalar(.75*portrait);
      this.rig.position.x=THREE.MathUtils.lerp(.37,.17,lift)*portrait;
      this.rig.position.y=THREE.MathUtils.lerp(-.50,-.31,lift);
      this.rig.position.z=THREE.MathUtils.lerp(-.70,-.78,lift);
      this.rig.rotation.x+=lift*.22;this.rig.rotation.y-=lift*.08;this.rig.rotation.z+=lift*.18;
    }
    if(this.appearanceId==='yae-miko'&&this.appearanceArms){
      this.rightHand.visible=this.leftHand.visible=this.rightSleeve.visible=this.leftSleeve.visible=false;
      this.appearanceArms.userData.update(this.rightHand,this.leftHand);
    }
  }
  setAppearance(id, hero) {
    if(id==='yae-miko'&&!this.appearanceArms){this.appearanceArms=createYaeFirstPersonArms(hero);if(this.appearanceArms)this.rig.add(this.appearanceArms);}
    this.appearanceId=id;
    if(this.appearanceArms)this.appearanceArms.visible=id==='yae-miko';
    const original=id!=='yae-miko';
    this.rightHand.visible=this.rightSleeve.visible=original;
    this.leftHand.visible=this.leftSleeve.visible=original&&['rifle','shotgun','crossbow','spear'].includes(this.weaponId);
  }
  aiming(player, level) {
    this.ray.setFromCamera(this.center, this.camera);
    const ray = this.ray.ray;
    let nearest = 40, enemyTarget = null;
    for (const box of this.boxes(level)) {
      const hit = segmentBoxDistance(ray.origin, ray.direction, box, nearest);
      if (hit !== null && hit < nearest) nearest = hit;
    }
    const ground = segmentGroundDistance(level,ray.origin,ray.direction,nearest);
    if (ground !== null && ground < nearest) nearest = ground;
    for (const enemy of level.enemies) {
      if (!enemy.alive || enemy.active===false) continue;
      const hit = segmentBoxDistance(ray.origin, ray.direction, { ...enemy, baseY:groundHeight(level,enemy.x,enemy.z)+(enemy.y||0), w: enemy.radius * 2, d: enemy.radius * 2, height: enemy.height || HEIGHTS[enemy.type] || 1.7 }, nearest, 0.025);
      if (hit !== null && hit < nearest) { nearest = hit; enemyTarget = enemy; }
    }
    if (enemyTarget) {
      // Converge at body depth, not the near face of its collider. At touching
      // distance that face can lie above the lower weapon origin and reverse
      // a downward attack into the sky. The aim point remains on the reticle.
      nearest = bodyAimDistance(ray.origin,ray.direction,{x:enemyTarget.x,
        y:groundHeight(level,enemyTarget.x,enemyTarget.z)+(enemyTarget.y||0)+(enemyTarget.height||HEIGHTS[enemyTarget.type]||1.7)*.5,z:enemyTarget.z},nearest);
    }
    this.aim.copy(ray.origin).addScaledVector(ray.direction, nearest);
    const muzzle=playerMuzzle(level,player,this.yaw);this.muzzle.set(muzzle.x,muzzle.y,muzzle.z);
    const direction = this.aim.clone().sub(this.muzzle).normalize();
    // Do not reverse the weapon when the camera itself is pressed against cover.
    if (direction.x * -Math.sin(this.yaw) + direction.z * -Math.cos(this.yaw) < 0.02) direction.copy(this.forward);
    this.targetEnemyId = enemyTarget?.id ?? null;
    this.reticle.classList.toggle('on-target', !!enemyTarget);
    return { aimX: direction.x, aimY: direction.y, aimZ: direction.z };
  }
  render(renderer, active) {
    if ((this.mode !== 'first'&&!this.ads) || !active || (this.ads&&opticById(this.optic).zoom>1)) return;
    this.weaponCamera.aspect = this.camera.aspect; this.weaponCamera.updateProjectionMatrix();
    const autoClear = renderer.autoClear; renderer.autoClear = false; renderer.clearDepth(); renderer.render(this.weaponScene, this.weaponCamera); renderer.autoClear = autoClear;
  }
  dispose() { this.release(); this.appearanceArms?.userData.dispose(); this.handGeometry.dispose(); this.handEdges.dispose(); this.handInk.dispose(); this.skin.dispose(); this.sleeve.dispose(); }
}
