import * as THREE from 'three';
import { DESKTOP_ANIMALS, DESKTOP_ANIMAL_BY_ID } from './animal-definitions.mjs';

// Original desktop atlas images are shared; UV transforms, materials and
// geometry belong to each actor. Disposing one actor cannot stop another.
const resources = new Map();
let cacheClock=0;
const MAX_IDLE_SHEETS=8;
const pendingJobs=[];let loadingJobs=0;
function scheduleLoad(job){return new Promise((resolve,reject)=>{pendingJobs.push({job,resolve,reject});pumpLoads();});}
function pumpLoads(){while(loadingJobs<4&&pendingJobs.length){const next=pendingJobs.shift();loadingJobs++;Promise.resolve().then(next.job).then(next.resolve,next.reject).finally(()=>{loadingJobs--;pumpLoads();});}}
function trimSheets(){
 const idle=[...resources.values()].filter(r=>r.refs===0&&r.sheet).sort((a,b)=>b.used-a.used);
 for(const item of idle.slice(MAX_IDLE_SHEETS)){item.sheet.texture.dispose();resources.delete(item.id);}
}
export function animalTextureCacheStats(){return {cached:resources.size,ready:[...resources.values()].filter(r=>r.sheet).length,active:[...resources.values()].filter(r=>r.refs>0).length,idle:[...resources.values()].filter(r=>r.refs===0&&r.sheet).length,loading:loadingJobs,queued:pendingJobs.length};}
// Hand sockets are in the original 192 x 208 frame coordinates. Their movement
// follows the actual source drawing, rather than a percentage of the big head.
const handSockets = {
  'byte-bunny': {
    0: [[130,164],[131,160],[132,164],[137,165],[132,164],[132,164]],
    1: [[142,154],[137,169],[143,155],[138,149],[143,154],[139,169],[145,155],[135,148]],
    3: [[131,159],[134,157],[138,158],[127,155]],
  },
  cloudy: {
    0: [[108,118],[108,119],[109,118],[110,118],[109,119],[108,119]],
    1: [[130,108],[133,108],[127,108],[135,108],[134,108],[136,108],[135,108],[133,108]],
    3: [[110,110],[113,111],[113,112],[113,112]],
  },
  zichaoxiong: {
    0: [[165,145],[165,145],[164,147],[165,145],[154,149],[166,145]],
    1: [[70,150],[66,150],[106,151],[68,150],[76,151],[74,150],[68,149],[63,149]],
    3: [[154,145],[159,145],[161,147],[159,146]],
  },
};
export function loadDesktopAnimalManifest(id) {
 if(!id)return Promise.resolve({schemaVersion:2,animals:DESKTOP_ANIMALS});
 const animal=DESKTOP_ANIMAL_BY_ID[id];
 if(!animal)return Promise.reject(new Error(`Unknown animal ${id}`));
 return fetch(new URL(animal.manifestPath,import.meta.url)).then(response=>{if(!response.ok)throw new Error(`Animal manifest ${id}: ${response.status}`);return response.json();});
}
function sheetResource(id){
 let resource=resources.get(id);
 if(resource){resource.used=++cacheClock;return resource;}
 resource={id,refs:0,used:++cacheClock,sheet:null,promise:null};resources.set(id,resource);
 resource.promise=scheduleLoad(async()=>{
  const entry=await loadDesktopAnimalManifest(id);
  const texture=await new THREE.TextureLoader().loadAsync(new URL(entry.sheet,import.meta.url).href);
  // All source frames remain intact on disk. Keep only a bounded, half-size
  // GPU atlas for the small in-world actor; UVs still address every source frame.
  const original=texture.image;
  if(original.width>1000||original.height>1300){const canvas=document.createElement('canvas');canvas.width=Math.ceil(original.width/2);canvas.height=Math.ceil(original.height/2);const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(original,0,0,canvas.width,canvas.height);texture.image=canvas;}
  texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.LinearFilter;
  texture.generateMipmaps=false;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
  const sheet={texture,entry,manifest:entry};resource.sheet=sheet;resource.used=++cacheClock;trimSheets();return sheet;
 }).catch(error=>{resources.delete(id);throw error;});
 return resource;
}
export function preloadDesktopAnimals(ids=DESKTOP_ANIMALS.slice(0,4).map(a=>a.id)) {
 return Promise.allSettled([...new Set(ids)].filter(id=>DESKTOP_ANIMAL_BY_ID[id]).slice(0,8).map(id=>sheetResource(id).promise));
}

function ownMesh(data, parent, geometry, material) {
  data.resources.add(geometry); data.resources.add(material);
  const mesh = new THREE.Mesh(geometry, material); parent.add(mesh); return mesh;
}
function plainMaterial(color, extras = {}) {
  return new THREE.MeshBasicMaterial({ color, toneMapped: false, ...extras });
}
function buildWeapon(data) {
  const weapon = new THREE.Group(); weapon.name = 'animal-handheld-ink-gun'; data.billboard.add(weapon);
  const carbine = data.definition.weaponId === 'ink-carbine';
  if(data.definition.weaponId==='ink-blade'){
    const blade=ownMesh(data,weapon,new THREE.BoxGeometry(.06,.54,.025),plainMaterial(0xd9e5ec));blade.position.y=.23;
    ownMesh(data,weapon,new THREE.BoxGeometry(.18,.035,.05),plainMaterial(0x62577c));
    const grip=ownMesh(data,weapon,new THREE.BoxGeometry(.045,.13,.045),plainMaterial(0x976d53));grip.position.y=-.08;
    data.weapon=weapon;return;
  }
  if(data.definition.weaponId==='ink-staff'){
    const staff=ownMesh(data,weapon,new THREE.CylinderGeometry(.019,.019,.65,6),plainMaterial(0x7d6354));staff.position.y=.2;
    const gem=ownMesh(data,weapon,new THREE.OctahedronGeometry(.1),plainMaterial(0x72b6b6));gem.position.y=.56;
    data.weapon=weapon;data.muzzle=gem;return;
  }
  if(data.definition.weaponId==='ink-bomb'){
    ownMesh(data,weapon,new THREE.SphereGeometry(.095,8,6),plainMaterial(0x56684b));
    const fuse=ownMesh(data,weapon,new THREE.BoxGeometry(.03,.12,.03),plainMaterial(0xa47747));fuse.position.y=.11;
    data.weapon=weapon;return;
  }
  const body = ownMesh(data, weapon, new THREE.BoxGeometry(carbine ? .35 : .23, .075, .06), plainMaterial(0x2c4262));
  body.position.x = .06;
  const barrel = ownMesh(data, weapon, new THREE.BoxGeometry(.2, .032, .032), plainMaterial(0x384d72));
  barrel.position.x = carbine ? .31 : .24;
  const grip = ownMesh(data, weapon, new THREE.BoxGeometry(.065, .14, .058), plainMaterial(0x976d53));
  grip.position.set(-.025, -.065, 0); grip.rotation.z = -.22;
  const highlight = ownMesh(data, weapon, new THREE.BoxGeometry(carbine ? .25 : .16, .012, .064), plainMaterial(0xf6e8c7));
  highlight.position.set(.065, .027, .002);
  const muzzle = ownMesh(data, weapon, new THREE.CircleGeometry(.11, 5), plainMaterial(0xffc557, { side: THREE.DoubleSide, transparent: true, opacity: .95, depthWrite: false }));
  muzzle.position.set(carbine ? .45 : .37, 0, .045); muzzle.visible = false;
  data.weapon = weapon; data.muzzle = muzzle;
}

function installSheet(root, sheet) {
  const data = root.userData.desktopAnimal;
  if (data.disposed) return;
  const { definition } = data;
  data.entry = sheet.entry; data.manifest = sheet.manifest;
  data.texture = sheet.texture.clone(); data.texture.needsUpdate = true; data.resources.add(data.texture);
  const material = plainMaterial(0xffffff, { map: data.texture, transparent: true, alphaTest: .16, side: THREE.DoubleSide, depthWrite: true });
  data.body = ownMesh(data, data.billboard, new THREE.PlaneGeometry(1, 1), material);
  data.body.name = `desktop-atlas-${definition.id}`;
  const idle = sheet.entry.animations.idle;
  const first=idle.sequence?.[0]||{row:idle.row,frame:idle.frames[0]};
  const bound = sheet.entry.frameBoundsByRow?.[first.row]?.[first.frame];
  data.pixelsToWorld = definition.height / Math.max(1, bound ? bound.y1 - bound.y0 : sheet.manifest.frameHeight);
  data.fallback.visible = false; data.ready = true; data.loadError = false;
  setFrame(data, 'idle', 0);
  if (data.weapon) data.weapon.visible = true;
  root.dispatchEvent({ type: 'animalready' });
}

export function createDesktopAnimal(id) {
  const definition = DESKTOP_ANIMAL_BY_ID[id];
  if (!definition) throw new TypeError(`Unknown desktop animal: ${id}`);
  const root = new THREE.Group(); root.name = `desktop-animal-${id}`;
  const billboard = new THREE.Group(); root.add(billboard);
  const data = { definition, billboard, resources: new Set(), disposed: false, ready: false,
    state: 'idle', stateTime: 0, phase: Math.random() * 1.5, deathTime: 0, shotTime: 0, wasAttacking: false,
    worldPosition: new THREE.Vector3(), cameraPosition: new THREE.Vector3(), worldQuaternion: new THREE.Quaternion(),
    billboardQuaternion: new THREE.Quaternion(), forward: new THREE.Vector3(), axis: new THREE.Vector3(0, 1, 0), facing: 1 };
  root.userData.desktopAnimal = data;
  root.userData.animalId = id; root.userData.height = definition.height;
  const fallback = ownMesh(data, billboard, new THREE.CapsuleGeometry(definition.radius * .55, definition.height * .48, 4, 8), plainMaterial(definition.color));
  fallback.position.y = definition.height * .43; fallback.name = 'visible-animal-loading-placeholder'; data.fallback = fallback;
  const shadow = ownMesh(data, root, new THREE.CircleGeometry(definition.radius * .84, 20), plainMaterial(0x35435b, { transparent: true, opacity: .19, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .018; data.shadow = shadow;
  const warning = ownMesh(data, root, new THREE.RingGeometry(definition.radius * .92, definition.radius * 1.15, 32), plainMaterial(0xc34336, { transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false }));
  warning.rotation.x = -Math.PI / 2; warning.position.y = .03; warning.visible = false; data.warning = warning;
  if (definition.hasHands && !definition.usesOriginalWeapon) { buildWeapon(data); data.weapon.visible = false; }
  const resource=sheetResource(id);resource.refs++;data.resource=resource;
  if(resource.sheet)installSheet(root,resource.sheet);
  else resource.promise.then(sheet => installSheet(root, sheet)).catch(error => {
    if (!data.disposed) { data.loadError = true; console.warn(`Desktop animal ${id} uses visible fallback:`, error); }
  });
  return root;
}

function setFrame(data,state,clock,sourceAction=null){
 const {entry,manifest,texture,body}=data;if(!body)return;
 const animation=(sourceAction?entry.sourceActions.find(a=>a.id===sourceAction):null)||entry.animations[state]||entry.animations.idle;
 const sequence=animation.sequence?.length?animation.sequence:animation.frames.map(frame=>({row:animation.row,frame}));
 let index=Math.floor(Math.max(0,clock)*animation.fps);
 if(Array.isArray(animation.durations)&&animation.durations.length===sequence.length){const units=animation.durationUnit==='milliseconds'?1000:1;const tick=clock*units;const total=animation.durations.reduce((sum,n)=>sum+n,0);let cursor=animation.loop===false?Math.min(tick,total-.000001):tick%total;index=0;while(index<sequence.length-1&&cursor>=animation.durations[index])cursor-=animation.durations[index++];}
 else index=animation.loop===false?Math.min(index,sequence.length-1):index%sequence.length;
 const {row,frame}=sequence[index];data.sourceAction=animation.sourceAction||animation.id||state;
 if(data.frame===frame&&data.row===row)return;
 data.frame=frame;data.row=row;
 const rect=entry.frameRectsByRow?.[row]?.[frame]||{x:frame*manifest.frameWidth,y:row*manifest.frameHeight,width:manifest.frameWidth,height:manifest.frameHeight};
 const bounds=entry.frameBoundsByRow?.[row]?.[frame]||{x0:0,y0:0,x1:rect.width,y1:rect.height};
 data.frameBounds=bounds;
 const width=bounds.x1-bounds.x0,height=bounds.y1-bounds.y0;
 texture.repeat.set(width/entry.sheetWidth,height/entry.sheetHeight);
 texture.offset.set((rect.x+bounds.x0)/entry.sheetWidth,1-(rect.y+bounds.y1)/entry.sheetHeight);
 data.frameWidth=width*data.pixelsToWorld;data.frameHeight=height*data.pixelsToWorld;
 body.scale.set(data.frameWidth*data.facing,data.frameHeight,1);body.position.set(0,data.frameHeight*.5,0);
}

export function animateDesktopAnimal(root, options = {}) {
  const data = root?.userData.desktopAnimal;
  if (!data || data.disposed) return;
  const { camera, time = 0, dt = 0, moving = 0, attacking = false, dead = false,
    telegraph = 0, charging = false, recovering = 0, hitFlash = 0, attackPhase = 'idle', animalAction=null, animalLift=0, animalSpin=0, animalGuard=false, sourceAction=null } = options;
  const step = Math.max(0, Math.min(.1, dt));
  const { definition, billboard } = data;
  if (camera) {
    root.updateWorldMatrix(true, false); root.getWorldPosition(data.worldPosition); root.getWorldQuaternion(data.worldQuaternion);
    camera.getWorldPosition(data.cameraPosition);
    const angle = Math.atan2(data.cameraPosition.x - data.worldPosition.x, data.cameraPosition.z - data.worldPosition.z);
    data.billboardQuaternion.setFromAxisAngle(data.axis, angle);
    billboard.quaternion.copy(data.worldQuaternion).invert().multiply(data.billboardQuaternion);
    data.forward.set(0, 0, 1).applyQuaternion(data.worldQuaternion);
    const screenDirection = data.forward.x * Math.cos(angle) - data.forward.z * Math.sin(angle);
    if (Math.abs(screenDirection) > .12) data.facing = screenDirection > 0 ? 1 : -1;
  } else billboard.quaternion.identity();
  let state = dead ? 'hurt' : hitFlash > 0 ? 'hurt' : charging || attacking ? 'attack'
    : telegraph > 0 || attackPhase === 'telegraph' ? (definition.hasHands ? 'wave' : 'look')
    : recovering > 0 ? 'idle' : moving > .8 ? 'run' : moving > .01 ? 'walk' : 'idle';
  if(!dead&&animalAction){if(animalLift>0)state='jump';else if(animalAction.phase==='healing')state='happy';else if(animalGuard)state='wave';else if(animalAction.phase==='active')state=charging?'charge':'attack';}
  if (data.state !== state) { data.state = state; data.stateTime = 0; }
  data.stateTime += step;
  if (dead) data.deathTime += step; else data.deathTime = 0;
  const death = Math.min(1, data.deathTime / .75);
  if (data.ready) {
    setFrame(data, state, sourceAction?time:data.stateTime + (state === 'idle' || state === 'walk' || state === 'run' ? data.phase : 0),sourceAction);
    // Row 2 is a left-facing motion in the source sheets; other movement rows face right.
    const leftFrame=/left|左/i.test(data.sourceAction||'');
    const direction = sourceAction ? 1 : leftFrame ? -data.facing : data.facing;
    data.body.scale.x = data.frameWidth * direction;
    data.body.material.color.set(hitFlash > 0 ? 0xffb2a1 : 0xffffff);
    data.body.material.opacity = 1 - death * .75;
  }
  // The real movement/hit is simulated by game-state. Here only the sprite pose
  // leans/recoils; this never changes the collider or grants extra travel.
  const brace = telegraph > 0 ? Math.sin(time * 19) * .012 : 0;
  const hop = charging && ['silver-shorthair', 'fine-pup', 'nightly-fox', 'peri-the-owl'].includes(definition.id)
    ? Math.sin(Math.min(1, data.stateTime / .55) * Math.PI) * .14 : 0;
  billboard.position.y = Math.max(0,animalLift) + hop;
  billboard.scale.set(1 + (charging ? .04 : 0), 1 - (telegraph > 0 && !definition.hasHands ? .08 : 0), 1);
  billboard.rotateZ(dead ? -.95 * death : brace + (animalSpin?Math.sin(animalSpin)*.18:0) + (charging ? -.09 * data.facing : 0));
  data.shadow.material.opacity = .19 * (1 - death);
  data.warning.visible = !dead && (telegraph > 0 || charging || animalGuard || animalAction?.phase==='healing');
  data.warning.material.color.set(animalAction?.phase==='healing'?0x408968:animalGuard?0x658cb4:0xc34336);
  data.warning.scale.setScalar(charging ? 1.25 : 1 + Math.sin(time * 14) * .08);
  if (data.weapon) {
    if (attacking && !data.wasAttacking) data.shotTime = .18;
    data.shotTime = Math.max(0, data.shotTime - step); data.wasAttacking = attacking;
    const recoil = data.shotTime > 0 ? Math.sin((.18 - data.shotTime) / .18 * Math.PI) : 0;
    const anchor = definition.weaponAnchor, sockets = handSockets[definition.id];
    const socket = sockets?.[data.row]?.[data.frame] || sockets?.[0]?.[0];
    const bounds = data.frameBounds;
    const handX = socket && bounds ? (socket[0] - (bounds.x0 + bounds.x1) / 2) * data.pixelsToWorld : anchor[0] * definition.height;
    const handY = socket && bounds ? (bounds.y1 - socket[1]) * data.pixelsToWorld : anchor[1] * definition.height;
    data.weapon.position.set((handX + .025 - recoil * .025) * data.facing, handY + .065, .07);
    data.weapon.scale.x = data.facing;
    data.weapon.rotation.z = (-.08 + recoil * .18) * data.facing;
    data.weapon.visible = data.ready && !dead;
    if(data.muzzle){data.muzzle.visible = data.weapon.visible && data.shotTime > .1;data.muzzle.rotation.z = time * 17;}
  }
  data.previewState = { state, row: data.row, frame: data.frame, ready: data.ready, armed: definition.hasHands && !!definition.weaponId, addedWeapon:!!data.weapon,
    telegraph: data.warning.visible, muzzle: !!data.muzzle?.visible,sourceAction:data.sourceAction,sourceStatic:definition.sourceStatic,combatMove:animalAction?.move||null };
}

export function disposeDesktopAnimal(root) {
  const data = root?.userData.desktopAnimal;
  if (!data || data.disposed) return;
  data.disposed = true;
  if(data.resource){data.resource.refs=Math.max(0,data.resource.refs-1);data.resource.used=++cacheClock;}
  for (const resource of data.resources) resource.dispose();
  data.resources.clear(); root.clear();trimSheets();
}
