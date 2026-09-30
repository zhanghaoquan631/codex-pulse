import * as THREE from 'three';
import { AdventureGame, WEAPONS, SHOP_ITEMS, CONSUMABLES } from './game-state.mjs';
import { WEATHER } from './weather.mjs';
import { AdventureWeather } from './weather-view.mjs';
import { createCombatAudio } from './combat-audio.mjs';
import {createBattleVFX} from './battle-vfx.mjs';
import {drawMissionMap} from './mission-map.mjs';
import {installTacticalControls} from './tactical-controls.mjs';
import {installCardTilt} from './card-tilt.mjs';
import {smokeOpacity,smokeRadius} from './tactical-equipment.mjs';
import {installMissionTracking} from './mission-tracking-view.mjs';
import {createDemonBoss,animateDemonBoss,disposeDemonBosses} from './boss-models.mjs';
import {BOSS_BY_ID} from './boss-catalog.mjs';
import {restoreRecords,visitRegion,defeatRecordedBoss,collectRecord,recordAvailable} from './record-collection.mjs';
import {installRecordBook} from './record-book.mjs';
import {installChapterBriefing} from './chapter-briefing.mjs';
import {riddleHint} from './riddle-hints.mjs';
import {installGearPanels,equipmentInfo} from './gear-panels.mjs';
import {installAppearancePanel} from './appearance-panel.mjs';
import {setHeroAppearance,disposeHeroAppearance} from './hero-appearance.mjs';
import {createExpansionView} from './expansion-view.mjs';
import {createChapterJourneyView} from './chapter-journey-view.mjs';
import {STORY_CHAPTERS,STORY_PROLOGUE} from './story-content.mjs';
import {installStoryBook} from './story-book.mjs';
import {createStoryCompanionView} from './story-companion-view.mjs';
import {createLetterDropsView} from './letter-drops-view.mjs';
import { installBestiary } from './bestiary.mjs';
import {DESKTOP_ANIMALS,DESKTOP_ANIMAL_COUNTS} from './animal-definitions.mjs';
import {ANIMAL_MOVES} from './animal-combat.mjs';
import {createDesktopAnimal,animateDesktopAnimal,disposeDesktopAnimal,preloadDesktopAnimals,animalTextureCacheStats} from './animal-renderer.mjs';
import { levels } from './levels.mjs';
import { buildWorld } from './world.mjs';
import { AdventureView } from './view-controller.mjs';
import { groundHeight } from './landforms.mjs';
import {segmentBoxDistance} from './camera-math.mjs';
import { createHero, createEnemy, createNPC, createWeapon, animateCharacter, disposeCharacters } from './characters.mjs';

const $ = id => document.getElementById(id);
const SAVE_KEY = 'chaoshan-adventure:singleplayer:v1';
const MAP_URL = '/local-apps/chaoshan-atlas/index.html';
$('map-return').href = MAP_URL;
const icons = { rifle:'枪',shotgun:'霰',sword: '剑', spear: '枪', crossbow: '弩', staff: '杖', potion: '茶', bomb: '弹', medkit: '药', molotov: '火',smoke:'雾',knife:'刀',pan:'锅' };
const weaponOrder = ['rifle', 'shotgun', 'crossbow', 'staff'];
const weaponDescriptions = {
  rifle:'按住连续射击，细长墨弹与轻微枪口后坐。',shotgun:'六发散射，近距离威力强，射击间隔较长。',
  knife:'短距快速刺击，背后命中额外伤害。',pan:'近身拍击；举锅防御正面来弹，背后与爆炸不受保护。',smoke:'形成烟区，阻断敌人新的瞄准，不挡已射出的子弹。',
  sword: '轻巧近战，挥剑覆盖前方扇形。', spear: '更长的攻击距离，适合把敌人挡在身前。',
  crossbow: '远程连发弩箭，需要瞄准与射击通路。', staff: '缓慢而有力的星火，命中时范围爆发。', potion: '饮一盏工夫茶，回复 65 点体力。',
  bomb: '投出后延时爆炸，对附近可见敌人造成范围伤害。', medkit: '恢复 55 点体力；满血时保留药包。', molotov: '落地形成短时燃烧区，持续灼伤走入的敌人。',
};
let initialSave = null;
let storageUnavailable = false;
try { initialSave = localStorage.getItem(SAVE_KEY); } catch { storageUnavailable = true; }
const ANIMAL_DECK_KEY = 'chaoshan-adventure:desktop-animal-deck:v1';
let animalDeckState = null;
try { animalDeckState = JSON.parse(localStorage.getItem(ANIMAL_DECK_KEY)); } catch {}
const game = new AdventureGame({ levels, saveData: initialSave, animalDefinitions: DESKTOP_ANIMALS, animalDeckState });
const state = game.state;
let savedRecords;
try{savedRecords=JSON.parse(initialSave)?.records;}catch{}
const records=restoreRecords(savedRecords,state.progress);
const fullSave=()=>({...JSON.parse(game.exportSave()),records});
let hudFolded=matchMedia('(max-width:1100px) and (pointer:coarse)').matches,recordPauseBefore=false,recordBook;
let storyBook,storyPauseBefore=false;
let briefing,briefingPauseBefore=false,briefingReturnId=null;
let gearPanels,gearPauseBefore=false,guideReturnId=null,buildMode=false,buildWasHeld=false,buildCooldown=0;
let appearancePanel,appearancePauseBefore=false,appearanceLoading=false,renderedAppearanceId='traveler';
const bossChoices=new Map();
let missionTracking,tacticalControls;let touchLean=0,touchGuard=false,mouseGuard=false,tacticsPauseBefore=false;
try{const saved=localStorage.getItem('chaoshan-adventure:hud-folded');if(saved!==null)hudFolded=saved==='true';}catch{}
let selectedLevel = state.progress.unlockedLevelIds.at(-1) || levels[0].id;
const urlPlace = new URLSearchParams(location.search).get('placeId') || new URLSearchParams(location.search).get('place');
if (levels.some(level => level.id === urlPlace)) selectedLevel = urlPlace;

let parentOrigin = null;
try {
  const referrer = new URL(document.referrer);
  if (referrer.origin === location.origin) parentOrigin = referrer.origin;
} catch { /* A standalone tab has no embedding origin. */ }
if (window.parent !== window && parentOrigin) $('map-return').hidden = true;
function notifyMap(type, level = state.level) {
  if (window.parent === window || !parentOrigin) return false;
  const data = { type, placeId: level?.placeId || selectedLevel };
  if (type === 'chaoshan-adventure:complete') data.levelId = level?.id;
  window.parent.postMessage(data, parentOrigin);
  return true;
}

let paused = false;
let displayedResult = null;
let isCamp = true;
let world = null;
let worldLevel = null;
let lastWeapon = null;
let savedAt = 0;
let lastHUD = 0;
let realTime = 0;
let mouseFire = false;
let soundEnabled = true;
try { soundEnabled = localStorage.getItem('chaoshan-adventure:sound') !== 'off'; } catch {}
const combatAudio = createCombatAudio();
combatAudio.setEnabled(soundEnabled);
let hitMarkerUntil = 0;
let shotThisFrame=false,announcementUntil=0,announcedQuota=false,lastShownKills=0;
let lastStatus = state.status;
let lastAttackCooldown = 0;
const pressedKeys = new Set();
const touchHeld = new Set();
const pulseInputs = { jump: false, interact: false, attack: false, consumable: null };
let runLocked = false;
const projected = new THREE.Vector3();
const cameraTarget = new THREE.Vector3();
const entityModels = new Map();
const projectileMeshes = new Map();
const visualEffects = new Map();
const seenVisualEffects = new Set();
const labels = new Set();
const coarsePointer = matchMedia('(pointer: coarse)');

const scene = new THREE.Scene();
const buildGhost=new THREE.Mesh(new THREE.BoxGeometry(1.2,1.2,1.2),new THREE.MeshBasicMaterial({color:0x548468,transparent:true,opacity:.28,depthWrite:false}));
buildGhost.name='construction-preview';buildGhost.visible=false;scene.add(buildGhost);
const buildEdges=new THREE.LineSegments(new THREE.EdgesGeometry(buildGhost.geometry),new THREE.LineBasicMaterial({color:0x416c58}));buildGhost.add(buildEdges);
const battleVFX=createBattleVFX({THREE,scene});
const letterDropsView=createLetterDropsView(scene);
const shotPoint=new THREE.Vector3(),shotRay=new THREE.Raycaster();
const camera = new THREE.PerspectiveCamera(43, innerWidth / innerHeight, 0.1, 220);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('game-canvas'), antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.65));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;
} catch (error) {
  $('loading-message').textContent = `三维画面暂时无法启动：${error.message}。请检查浏览器是否开启硬件加速。`;
  throw error;
}
const cast = new THREE.Group();
scene.add(cast);
const weatherView = new AdventureWeather(scene, { flashElement: $('weather-flash') });
const hazardMeshes = new Map();
const smokeGeometry=new THREE.SphereGeometry(1,12,8),smokeScreen=document.createElement('div');smokeScreen.className='smoke-screen';document.body.append(smokeScreen);
const fireGeometry = new THREE.ConeGeometry(.16, .65, 5), fireRingGeometry = new THREE.RingGeometry(.9, 1, 32);
const fireMaterial = new THREE.MeshBasicMaterial({ color: 0xd9833d, transparent: true, opacity: .7, depthWrite: false, side: THREE.DoubleSide });
const poisonMaterial=new THREE.MeshBasicMaterial({color:0x68a56a,transparent:true,opacity:.58,depthWrite:false,side:THREE.DoubleSide});
const snareMaterial=new THREE.MeshBasicMaterial({color:0x8980bd,transparent:true,opacity:.8,depthWrite:false,side:THREE.DoubleSide});
const poolGeometry=new THREE.CircleGeometry(1,24),webLineGeometry=new THREE.BoxGeometry(1,.015,.022);
let selectedTravelWeapon = null, selectedTravelSupply = null, travelChoiceLevelId = null;
const hero = createHero();
const expansionView=createExpansionView(scene,hero);
const chapterJourneyView=createChapterJourneyView(scene);
const storyCompanion=createStoryCompanionView(scene,hero);
cast.add(hero);
const view = new AdventureView({ camera, canvas: $('game-canvas'), createWeapon, allowed: playingInputAllowed,
  onUnlock: () => pauseGame('鼠标已释放，游戏已暂停。'), button: $('view-toggle'), lockButton: $('look-lock'),
  reticle: $('crosshair'), hint: $('view-hint'), onTap: () => { pulseInputs.attack = true; }, onHold: value => { mouseFire = value; } });
const aimMarker = new THREE.Mesh(new THREE.RingGeometry(0.20, 0.26, 24), new THREE.MeshBasicMaterial({ color: 0xf9e8b2, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
aimMarker.rotation.x = -Math.PI / 2;
aimMarker.visible = false;
scene.add(aimMarker);
const playerHalo = new THREE.Mesh(new THREE.RingGeometry(0.49, 0.56, 28), new THREE.MeshBasicMaterial({ color: 0x28567d, transparent: true, opacity: 0.30, depthWrite: false }));
playerHalo.rotation.x = -Math.PI / 2;
scene.add(playerHalo);
const projectileGeometry = new THREE.IcosahedronGeometry(0.13, 0);
const projectileAxis = new THREE.Vector3(0, 0, 1), projectileDirection = new THREE.Vector3();
const projectileMaterials = {
  player: new THREE.MeshBasicMaterial({ color: 0x28567d }),
  staff: new THREE.MeshBasicMaterial({ color: 0x72528d }),
  enemy: new THREE.MeshBasicMaterial({ color: 0xb34436 }),
};
const particleGeometry = new THREE.IcosahedronGeometry(0.065, 0);
const paperChipGeometry = new THREE.PlaneGeometry(.14, .23);
const slashGeometries = new Map();

function toast(message, kind = '', duration = 3200) {
  const element = document.createElement('div');
  element.className = `toast ${kind}`;
  element.textContent = message;
  $('toasts').append(element);
  while ($('toasts').children.length > 4) $('toasts').firstElementChild.remove();
  setTimeout(() => element.remove(), duration);
}

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(fullSave()));
    savedAt = performance.now();
    $('save-indicator').textContent = '已存档';
    return true;
  } catch {
    $('save-indicator').textContent = '未能保存';
    if (!storageUnavailable) toast('浏览器暂时无法保存进度，请使用“导出存档”。', 'error', 6000);
    storageUnavailable = true;
    return false;
  }
}

function playTone(type) {
  combatAudio.play(({damage:'hurt',door:'coin'})[type] || type, {weaponId:state.player.weaponId});
}

function action(result) {
  if (!result?.ok) { toast(result?.reason || result?.message || '暂时无法执行这个动作', 'error'); return false; }
  processEvents();
  updateHUD(true);
  return true;
}

function createLabel(className, text = '') {
  const element = document.createElement('div');
  element.className = `world-label ${className}`;
  element.textContent = text;
  $('world-labels').append(element);
  labels.add(element);
  return element;
}

function placeLabel(element, x, y, z) {
  projected.set(x, y, z).project(camera);
  const visible = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1.15 && Math.abs(projected.y) < 1.15;
  element.hidden = !visible || isCamp;
  if (visible) { element.style.left = `${(projected.x * 0.5 + 0.5) * innerWidth}px`; element.style.top = `${(-projected.y * 0.5 + 0.5) * innerHeight}px`; }
}

function labelHasSight(x,y,z){
  const d={x:x-camera.position.x,y:y-camera.position.y,z:z-camera.position.z},length=Math.hypot(d.x,d.y,d.z);
  return ![...state.level.walls,...state.level.doors.filter(d=>!d.open)].some(box=>{
    if(box.kind==='invisible')return false;
    const hit=segmentBoxDistance(camera.position,d,box,length);
    return hit!==null&&hit<length-.3;
  });
}

function removeEffect(effect) {
  scene.remove(effect.root);
  effect.material?.dispose();
  if (effect.label) { effect.label.remove(); labels.delete(effect.label); }
}

function clearTransientScene() {
  letterDropsView.clear();
  for (const entry of entityModels.values()) { disposeDesktopAnimal(entry.root); cast.remove(entry.root); entry.label?.remove(); if (entry.label) labels.delete(entry.label);entry.letterTexture?.dispose();entry.letterMaterial?.dispose();entry.letterGeometry?.dispose(); }
  entityModels.clear();
  for (const mesh of projectileMeshes.values()) scene.remove(mesh);
  projectileMeshes.clear();
  for (const effect of visualEffects.values()) removeEffect(effect);
  visualEffects.clear();
  seenVisualEffects.clear();
  battleVFX.clear();shotThisFrame=false;announcedQuota=false;lastShownKills=0;
  $('mission-announcement').hidden=true;
  hitMarkerUntil = 0;
  $('crosshair').classList.remove('confirmed-hit', 'confirmed-kill');
  for (const mesh of hazardMeshes.values()){scene.remove(mesh);mesh.userData.smokeMaterial?.dispose();}smokeScreen.style.opacity='0';
  hazardMeshes.clear();
}

function prepareWorld(definition, camp = false) {
  clearTransientScene();
  world?.dispose();
  worldLevel = definition;
  world = buildWorld(scene, definition);
  isCamp = camp;
  const spawn = camp ? definition.spawn : state.player;
  const floor = groundHeight(definition,spawn.x,spawn.z);
  hero.position.set(spawn.x, floor, spawn.z);
  hero.rotation.y = Math.PI;
  view.reset();
  if(!camp){const focus=definition.collectibles?.[0]||definition.exit;view.yaw=Math.atan2(spawn.x-focus.x,spawn.z-focus.z);view.travelYaw=view.yaw;
    if(definition.landform?.type==='profile')view.pitch=Math.max(-.17,Math.min(.35,Math.atan2(groundHeight(definition,focus.x,focus.z)-floor,Math.hypot(focus.x-spawn.x,focus.z-spawn.z))-.06));
  }
  cameraTarget.set(spawn.x, floor+0.55, spawn.z);
  camera.position.set(spawn.x + (camp ? 8 : 0), floor+(camp ? 14 : 18), spawn.z + (camp ? 13 : 15));
  camera.fov = camp ? 43 : 62; camera.updateProjectionMatrix();
  camera.lookAt(cameraTarget);
  if (!camp) view.update(0, state.player, state.level, world, true, realTime);
  playerHalo.position.set(spawn.x, floor+0.035, spawn.z);
  displayedResult = null;
  lastAttackCooldown = 0;
  syncWeapon();
  if (!camp) syncCharacters(0);
}

function syncWeapon() {
  const id = state.player.weaponId;
  if (id === lastWeapon) return;
  const firearm=id==='rifle'||id==='shotgun';
  const socket = (firearm?hero.userData.firearmSocket:null)||hero.userData.weaponSocket||hero.userData.rig.rightArm;
  for(const holder of [hero.userData.firearmSocket,hero.userData.weaponSocket,hero.userData.rig.rightArm].filter(Boolean))for(const child of [...holder.children])if(child.userData.weaponId)holder.remove(child);
  const weapon = createWeapon(id);
  // A relaxed hand holds a blade/shaft upward; animation raises the entire arm.
  if(firearm){weapon.rotation.set(0,0,0);weapon.scale.setScalar(.9);}
  else if (id === 'crossbow') { weapon.scale.setScalar(0.9); weapon.rotation.x = -0.1; }
  else { weapon.rotation.x = 0.22; weapon.rotation.z = -0.12; }
  socket.add(weapon);
  lastWeapon = id;
}

function modelFor(entity, kind) {
  const key = `${kind}:${entity.id}`;
  if (!entityModels.has(key)) {
    const demonKind=entity.bossKind||({wraith:'arcade-wraith',imp:'bronze-oni'})[entity.type];
    const root = kind === 'enemy' ? entity.animalId ? createDesktopAnimal(entity.animalId) : BOSS_BY_ID[demonKind]?createDemonBoss(demonKind):createEnemy(entity.visualType||entity.type) : createNPC(kind === 'escort' ? 'villager' : entity.type);
    root.name = `${kind}:${entity.id}`;
    if(root.userData.demonBoss)root.scale.setScalar(entity.height/3);
    else if(entity.visualScale)root.scale.setScalar(entity.visualScale);
    else if(entity.visualType)root.scale.setScalar(entity.height/root.userData.height);
    cast.add(root);
    const label = createLabel(kind === 'enemy' ? 'enemy' : 'friend', kind === 'enemy' ? '' : entity.name || (kind === 'escort' ? '守灯人' : '行商'));
    let meter = null;
    if (kind === 'enemy' || kind==='npc') {
      label.textContent='';
      const rank = document.createElement('span'); rank.className = kind==='enemy'?'enemy-rank':'npc-name'; label.append(rank);
      const track = document.createElement('div'); track.className = 'world-meter';
      meter = document.createElement('i'); track.append(meter); label.append(track);
    }
    entityModels.set(key, { root, label, meter, lastX: entity.x, lastZ: entity.z, deathAge: 0, lastAttackCooldown:entity.attackCooldown||0, attackUntil:0 });
  }
  return entityModels.get(key);
}

function syncCharacters(dt) {
  if (isCamp) {
    animateCharacter(hero, { time: realTime, dt });
    return;
  }
  const player = state.player;
  const liveEnemyIds = new Set(state.level.enemies.map(enemy => `enemy:${enemy.id}`));
  for (const [key, entry] of entityModels) {
    if (!key.startsWith('enemy:') || liveEnemyIds.has(key)) continue;
    disposeDesktopAnimal(entry.root); cast.remove(entry.root); entry.label?.remove(); labels.delete(entry.label);
    entry.letterTexture?.dispose(); entry.letterMaterial?.dispose(); entry.letterGeometry?.dispose();
    entityModels.delete(key);
  }
  const labelBoxes=[];
  syncWeapon();
  const floor = entity => groundHeight(state.level,entity.x,entity.z)+(entity.y||0);
  const travelX = player.x - hero.position.x, travelZ = player.z - hero.position.z;
  hero.position.set(player.x, floor(player), player.z);
  if (player.attackCooldown > .05) hero.rotation.y = Math.atan2(player.facingX, player.facingZ);
  else if (player.weaponId==='rifle'||player.weaponId==='shotgun')hero.rotation.y=Math.atan2(player.facingX,player.facingZ);
  else if (player.moving && Math.hypot(travelX, travelZ) > .0001) hero.rotation.y = Math.atan2(travelX, travelZ);
  hero.visible = !view.hideBody && (player.invuln > 0 && player.hp < player.maxHp ? Math.floor(realTime * 15) % 3 !== 0 : true);
  playerHalo.visible = !view.hideBody;
  animateCharacter(hero, { moving: player.moving ? player.sprinting ? 1 : 0.7 : 0, attacking: player.attackCooldown > (WEAPONS[player.weaponId]?.cooldown || 0.4) * 0.45,
    jumping: !player.grounded, dead: state.status === 'dead', time: realTime, dt,stance:player.stance,lean:player.lean,guarding:player.guarding,weaponId:player.weaponId,aiming:true,firePulse:Math.max(0,player.attackCooldown/(WEAPONS[player.weaponId]?.cooldown||1)) });
  playerHalo.position.set(player.x, floor(player)+0.035, player.z);
  for (const enemy of state.level.enemies) {
    if(enemy.active===false)continue;
    const modelKey=`enemy:${enemy.id}`;
    if(!enemy.alive&&!entityModels.has(modelKey))continue;
    const entry = modelFor(enemy, 'enemy');
    if(!enemy.alive&&entry.deathAge>=2){
      disposeDesktopAnimal(entry.root);cast.remove(entry.root);entry.label?.remove();labels.delete(entry.label);
      entry.letterTexture?.dispose();entry.letterMaterial?.dispose();entry.letterGeometry?.dispose();
      entityModels.delete(modelKey);continue;
    }
    if(enemy.clueLetter&&!entry.letterTexture){
      const paper=document.createElement('canvas');paper.width=128;paper.height=128;
      const ctx=paper.getContext('2d');ctx.fillStyle='#f6eed9';ctx.fillRect(0,0,128,128);ctx.strokeStyle='#ad4337';ctx.lineWidth=7;ctx.strokeRect(5,5,118,118);ctx.fillStyle='#223b71';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 88px monospace';ctx.fillText(enemy.clueLetter,64,69);
      entry.letterTexture=new THREE.CanvasTexture(paper);entry.letterTexture.colorSpace=THREE.SRGBColorSpace;
      entry.letterMaterial=new THREE.MeshBasicMaterial({map:entry.letterTexture,side:THREE.DoubleSide});entry.letterGeometry=new THREE.PlaneGeometry(.55,.55);
      const back=new THREE.Mesh(entry.letterGeometry,entry.letterMaterial);back.position.set(0,Math.max(.75,(entry.root.userData.height||1.6)*.62),-.36);back.rotation.y=Math.PI;entry.root.add(back);
    }
    const moving = Math.hypot(enemy.x - entry.lastX, enemy.z - entry.lastZ) > 0.0001;
    entry.lastX = enemy.x; entry.lastZ = enemy.z;
    if (!enemy.alive) entry.deathAge += dt;
    entry.root.position.set(enemy.x, floor(enemy), enemy.z);
    entry.root.rotation.y = Math.atan2(enemy.facingX || 0, enemy.facingZ ?? 1);
    entry.root.visible = enemy.alive || entry.deathAge < 2;
    if (enemy.alive && enemy.hitFlash > 0) entry.root.visible = Math.floor(realTime * 40) % 3 !== 0;
    if(enemy.animalId && enemy.animalAttackMode==='melee' && enemy.attackCooldown>entry.lastAttackCooldown+.05)entry.attackUntil=realTime+.22;
    entry.lastAttackCooldown=enemy.attackCooldown;
    (enemy.animalId?animateDesktopAnimal:entry.root.userData.demonBoss?animateDemonBoss:animateCharacter)(entry.root, { camera, moving:moving?(enemy.sprinting?1:.6):0, attacking: enemy.alive && (enemy.animalId?realTime<entry.attackUntil:entry.root.userData.demonBoss?enemy.attackPhase==='firing':enemy.attackCooldown > enemy.cooldown * 0.82),phase:enemy.phase,
      dead: !enemy.alive, telegraph: Math.max(enemy.telegraph||0,enemy.sprintWarning||0), charging: enemy.charging, recovering: enemy.recovering,
      animalAction:enemy.animalAction,animalLift:enemy.animalLift,animalSpin:enemy.animalSpin,animalGuard:enemy.animalGuard,
      attackPhase: enemy.attackPhase, hitFlash: enemy.hitFlash, time: realTime, dt });
    entry.meter.style.width = `${Math.max(0, enemy.hp / enemy.maxHp) * 100}%`;
    const moveWarning=enemy.animalAction?.phase==='telegraph'?` · ${ANIMAL_MOVES[enemy.animalAction.move]?.name||'蓄力'}！`:'';
    entry.label.querySelector('.enemy-rank').textContent = `${enemy.clueLetter?`[${enemy.clueLetter}] `:''}Lv.${enemy.level || 1} ${enemy.name}${moveWarning|| (enemy.sprintWarning>0?' · 准备奔跑':enemy.sprinting?' · 奔跑追击':enemy.telegraph > 0 ? ' · 蓄力！' : enemy.recovering > 0 || enemy.sprintPhase==='recovering' ? ' · 破绽' : '')}`;
    if (enemy.alive && Math.hypot(player.x-enemy.x,player.z-enemy.z)<22 && labelHasSight(enemy.x,floor(enemy)+enemy.height*.7,enemy.z)) {
      placeLabel(entry.label, enemy.x, floor(enemy)+entry.root.userData.height*entry.root.scale.y + (enemy.animalLift||0) + 0.28, enemy.z);
      if(!entry.label.hidden){const rect=entry.label.getBoundingClientRect();if(labelBoxes.some(b=>rect.left<b.right+5&&rect.right>b.left-5&&rect.top<b.bottom+5&&rect.bottom>b.top-5))entry.label.hidden=true;else labelBoxes.push(rect);}
    }
    else entry.label.hidden = true;
  }
  for (const npc of state.level.npcs || []) {
    const entry = modelFor(npc, 'npc');
    const moving=Math.hypot(npc.x-entry.lastX,npc.z-entry.lastZ)>.0001;
    entry.lastX=npc.x;entry.lastZ=npc.z;
    entry.root.position.set(npc.x, floor(npc), npc.z);
    entry.root.rotation.y = moving?Math.atan2(npc.facingX||0,npc.facingZ??1):Math.atan2(player.x-npc.x,player.z-npc.z);
    entry.root.visible=npc.alive!==false;
    animateCharacter(entry.root, { moving:moving?(npc.sprinting||npc.fleeing?1:.6):0,dead:npc.alive===false,time:realTime,dt });
    entry.label.querySelector('.npc-name').textContent=`${npc.name||'行商'}${npc.fleeing?' · 奔跑避险':npc.y>1.5?' · 楼上躲避':''}${Number.isFinite(npc.hp)?' · '+Math.ceil(npc.hp)+' / '+npc.maxHp:''}`;
    if(entry.meter){entry.meter.style.width=`${Number.isFinite(npc.maxHp)?Math.max(0,npc.hp/npc.maxHp)*100:100}%`;entry.meter.style.background='#527867';}
    if(npc.alive!==false&&Math.hypot(player.x-npc.x,player.z-npc.z)<30&&labelHasSight(npc.x,floor(npc)+1,npc.z))placeLabel(entry.label,npc.x,floor(npc)+entry.root.userData.height+.35,npc.z);
    else entry.label.hidden=true;
  }
  if (state.level.escort) {
    const escort = state.level.escort;
    const entry = modelFor(escort, 'escort');
    const moving = Math.hypot(escort.x - entry.lastX, escort.z - entry.lastZ) > 0.0001;
    entry.lastX = escort.x; entry.lastZ = escort.z;
    entry.root.position.set(escort.x, floor(escort), escort.z);
    entry.root.rotation.y = Math.atan2(escort.facingX || 0, escort.facingZ ?? -1);
    animateCharacter(entry.root, { moving, dead: !escort.alive, time: realTime, dt });
    entry.label.textContent = `${escort.name || '守灯人'} · ${Math.ceil(escort.hp)}`;
    placeLabel(entry.label, escort.x, floor(escort)+entry.root.userData.height + 0.35, escort.z);
  }
}

function slashGeometry(range, arc) {
  const key = `${range}:${arc}`;
  if (!slashGeometries.has(key)) {
    const geometry = new THREE.RingGeometry(range * 0.75, range, 24, 1, -arc, arc * 2);
    geometry.rotateX(-Math.PI / 2); geometry.rotateY(-Math.PI / 2);
    slashGeometries.set(key, geometry);
  }
  return slashGeometries.get(key);
}

function syncCombatVisuals(dt) {
  const currentProjectiles = new Set();
  for (const shot of state.projectiles) {
    currentProjectiles.add(shot.id);
    let mesh = projectileMeshes.get(shot.id);
    if (!mesh) {
      const materialKey=shot.bossKind&&BOSS_BY_ID[shot.bossKind]?'boss-'+shot.bossKind:shot.owner === 'enemy' ? 'enemy' : shot.weaponId === 'staff' ? 'staff' : 'player';
      if(!projectileMaterials[materialKey])projectileMaterials[materialKey]=new THREE.MeshBasicMaterial({color:BOSS_BY_ID[shot.bossKind].color});
      const material = projectileMaterials[materialKey];
      mesh = new THREE.Mesh(projectileGeometry, material);
      mesh.scale.set(shot.kind === 'throw' ? 1.5 : shot.splash ? 1.9 : .72, shot.itemId === 'molotov' ? 2.5 : shot.kind === 'throw' ? 1.5 : shot.splash ? 1.9 : .72, shot.kind === 'throw' ? 1.5 : shot.splash ? 1.9 : 2.4);
      if(shot.bossKind)mesh.scale.setScalar((shot.radius||.14)/.13);
      scene.add(mesh); projectileMeshes.set(shot.id, mesh);
    }
    mesh.position.set(shot.x, shot.y, shot.z);
    projectileDirection.set(shot.dirX ?? shot.vx ?? 0, shot.dirY ?? shot.vy ?? 0, shot.dirZ ?? shot.vz ?? 1).normalize();
    mesh.quaternion.setFromUnitVectors(projectileAxis, projectileDirection);
  }
  for (const [id, mesh] of projectileMeshes) if (!currentProjectiles.has(id)) { scene.remove(mesh); projectileMeshes.delete(id); }
  const liveHazards = new Set();let smokeCover=0;
  for (const hazard of state.hazards || []) {
    liveHazards.add(hazard.id);
    let patch = hazardMeshes.get(hazard.id);
    if(hazard.type==='smoke'){
      const opacity=smokeOpacity(hazard),radius=smokeRadius(hazard);
      if(!patch){patch=new THREE.Group();patch.name='paper-smoke-cloud';const mat=new THREE.MeshBasicMaterial({color:0xc4cbc3,transparent:true,opacity:.3,depthWrite:false});patch.userData.smokeMaterial=mat;
        for(let i=0;i<9;i++){const cloud=new THREE.Mesh(smokeGeometry,mat),a=i*2.4,r=i?.48:0;cloud.position.set(Math.cos(a)*r,(hazard.height||3.2)/2,Math.sin(a)*r);cloud.scale.set(.52,(hazard.height||3.2)/2,.52);patch.add(cloud);}scene.add(patch);hazardMeshes.set(hazard.id,patch);}
      patch.position.set(hazard.x,hazard.y,hazard.z);patch.scale.set(radius,1,radius);patch.userData.smokeMaterial.opacity=opacity*.42;
      const distance=Math.hypot(camera.position.x-hazard.x,camera.position.z-hazard.z),dy=camera.position.y-hazard.y;
      if(dy>=-.2&&dy<=(hazard.height||3.2))smokeCover=Math.max(smokeCover,opacity*Math.min(.93,Math.max(0,(radius-distance)/Math.max(1,radius*.35))));
      continue;
    }
    if (!patch) {
      patch = new THREE.Group(); patch.name = `${hazard.type||'fire'}-area`;
      const material=hazard.type==='poison'?poisonMaterial:hazard.type==='snare'?snareMaterial:fireMaterial;
      const ring = new THREE.Mesh(fireRingGeometry, material); ring.rotation.x = -Math.PI / 2; ring.scale.setScalar(hazard.radius); patch.add(ring);
      if(hazard.type==='snare'){
        for(const size of [.33,.65]){const inner=new THREE.Mesh(fireRingGeometry,material);inner.rotation.x=-Math.PI/2;inner.scale.setScalar(hazard.radius*size);patch.add(inner);}
        for(let i=0;i<6;i++){const line=new THREE.Mesh(webLineGeometry,material);line.scale.x=hazard.radius*2;line.rotation.y=i*Math.PI/6;patch.add(line);}
      }else if(hazard.type==='poison'){
        const pool=new THREE.Mesh(poolGeometry,material);pool.rotation.x=-Math.PI/2;pool.scale.setScalar(hazard.radius*.92);patch.add(pool);
        for(let i=0;i<6;i++){const bubble=new THREE.Mesh(smokeGeometry,material),a=i*2.4; bubble.position.set(Math.cos(a)*hazard.radius*.6,.08,Math.sin(a)*hazard.radius*.6);bubble.scale.set(.12,.12,.12);patch.add(bubble);}
      }else for (let i = 0; i < 12; i++) { const flame = new THREE.Mesh(fireGeometry, fireMaterial); const a = i * 2.4, r = hazard.radius * Math.sqrt((i + .5) / 12) * .8; flame.position.set(Math.sin(a) * r, .3, Math.cos(a) * r); patch.add(flame); }
      scene.add(patch); hazardMeshes.set(hazard.id, patch);
    }
    patch.position.set(hazard.x, (hazard.y ?? groundHeight(state.level, hazard.x, hazard.z)) + .04, hazard.z);
    if(hazard.type==='poison'){for(let i=2;i<patch.children.length;i++)patch.children[i].scale.y=.12+Math.abs(Math.sin(hazard.remaining*3+i))*.16;}
    else if(hazard.type!=='snare')for (let i = 1; i < patch.children.length; i++) patch.children[i].scale.y = .6 + Math.abs(Math.sin(hazard.remaining * 7 + i)) * .8;
  }
  smokeScreen.style.opacity=String(smokeCover);
  for (const [id, mesh] of hazardMeshes) if (!liveHazards.has(id)) { scene.remove(mesh);mesh.userData.smokeMaterial?.dispose(); hazardMeshes.delete(id); }
  const active = new Set();
  for (const effect of state.effects) {
    active.add(effect.id);
    if (!seenVisualEffects.has(effect.id)) {
      seenVisualEffects.add(effect.id);
      const root = new THREE.Group(); root.position.set(effect.x, effect.y || 0.1, effect.z);
      const enemySlash = effect.type === 'enemy-slash';
      const defeated = effect.type === 'ink-defeat';
      const material = new THREE.MeshBasicMaterial({ color: enemySlash ? 0xb34436 : defeated && effect.boss ? 0xb68a35 : 0x28567d, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide });
      const entry = { root, material, age: 0, life: effect.life, label: null, particles: [], effect };
      if(defeated||effect.type==='hit')view.kick(battleVFX.emit({...effect,type:defeated?'kill':'hit',groundY:effect.groundY??groundHeight(state.level,effect.x,effect.z)}));
      if (effect.type === 'slash' || enemySlash) {
        const mesh = new THREE.Mesh(slashGeometry(effect.range || 2, effect.arc || 1.1), material);
        root.rotation.y = Math.atan2(effect.dirX || 0, effect.dirZ ?? 1); root.add(mesh);
        if (!enemySlash) playTone('attack');
      } else {
        for (let index = 0; index < (defeated||effect.type==='hit'?0:effect.type === 'burst' ? 12 : 6); index++) {
          const chip = defeated && index % 2 === 0;
          const mesh = new THREE.Mesh(chip ? paperChipGeometry : particleGeometry, material);
          const angle = index * 2.39996;
          const scale = defeated ? (effect.radius || 1) * (0.7 + index % 3 * .3) : effect.type === 'burst' ? 2.4 : 1;
          mesh.scale.setScalar(scale); root.add(mesh);
          entry.particles.push({ mesh, vx: Math.sin(angle) * 3 * scale, vy: 1 + (index % 3) * 1.5, vz: Math.cos(angle) * 3 * scale, spin: chip ? angle : 0 });
        }
        if (effect.damage) entry.label = createLabel('damage', `${Math.round(effect.damage)}`);
        if (defeated) {
          entry.label = createLabel('kill-reward', `+${effect.xp} XP · +${effect.gold} 铜钱`);
          combatAudio.play('kill', {boss:effect.boss});
          hitMarkerUntil = realTime + .32;
          $('crosshair').classList.add('confirmed-kill');
        } else if (effect.type === 'hit') {
          playTone('hit'); hitMarkerUntil = realTime + .13;
          $('crosshair').classList.add('confirmed-hit');
        }
      }
      scene.add(root); visualEffects.set(effect.id, entry);
    }
  }
  for (const id of seenVisualEffects) if (!active.has(id)) seenVisualEffects.delete(id);
  for (const [id, entry] of visualEffects) {
    entry.age += dt;
    const remaining = Math.max(0, 1 - entry.age / Math.max(0.01, entry.life));
    entry.material.opacity = remaining * 0.88;
    for (const particle of entry.particles) {
      particle.mesh.position.set(particle.vx * entry.age, particle.vy * entry.age - entry.age ** 2 * 4, particle.vz * entry.age);
      if (particle.spin) particle.mesh.rotation.set(entry.age * particle.spin, entry.age * 5, particle.spin);
    }
    if (entry.label) placeLabel(entry.label, entry.root.position.x, entry.root.position.y + 0.55 + entry.age * 2.5, entry.root.position.z);
    if (remaining === 0) { removeEffect(entry); visualEffects.delete(id); }
  }
}

function renderCamp() {
  $('chapter-grid').replaceChildren();
  levels.forEach((level, index) => {
    const unlocked = state.progress.unlockedLevelIds.includes(level.id);
    const completed = state.progress.completedLevelIds.includes(level.id);
    const button = document.createElement('button');
    button.className = `chapter ${selectedLevel === level.id ? 'selected' : ''}`;
    button.disabled = !unlocked;
    button.setAttribute('aria-pressed', String(selectedLevel === level.id));
    button.innerHTML = `<div class="chapter-top"><span></span><b>${String(index+1).padStart(2,'0')}</b></div><h3></h3><p></p><span class="chapter-status"></span><span class="chapter-icon">${['楼','桥','鼎','海','厝','塔','湖','侨','山','围','城','瀑'][index]}</span>`;
    button.querySelector('.chapter-top span').textContent = level.region;
    button.querySelector('h3').textContent = level.shortTitle;
    button.querySelector('p').textContent = `${['街巷追击','横江推进','广场突围','海岸竞速','古厝探迹','塔影巡街','湖岸寻字','侨厝密信','登山观湖','八角围楼','城墙迷踪','沿谷追瀑'][index]} · ${level.hunt.killTarget} 杀 · ${level.hunt.riddles[0].answer.length} 字母`;
    button.querySelector('.chapter-status').textContent = completed ? '已完成 · 可重游' : unlocked ? '可进入 ↗' : '完成前章后开启';
    button.addEventListener('click', () => { selectedLevel = level.id; renderCamp(); prepareWorld(level, true); });
    $('chapter-grid').append(button);
  });
  const p = state.player;
  $('camp-stats').innerHTML = `<div><strong>${p.level}</strong><span>旅人等级</span></div><div><strong>${p.gold}</strong><span>铜钱</span></div><div><strong>${state.progress.completedLevelIds.length} / ${levels.length}</strong><span>已过章节</span></div>`;
  $('camp-loadout').textContent = `当前兵器 · ${WEAPONS[p.weaponId].name}\n工夫茶 · ${p.potions} 份\n炸弹 ${p.consumables.bomb} · 药包 ${p.consumables.medkit} · 燃烧瓶 ${p.consumables.molotov} · 烟雾弹 ${p.consumables.smoke||0}`;
  $('camp-loadout').style.whiteSpace = 'pre-line';
  const pending = levels.filter(level => state.progress.completedLevelIds.includes(level.id) && !state.progress.loadoutClaimedLevelIds.includes(level.id));
  $('camp-pending-loadout').hidden = !pending.length;
  $('camp-pending-loadout').textContent = `领取通关行装 · ${pending.length} 份待领取`;
  const selectedUnlocked = state.progress.unlockedLevelIds.includes(selectedLevel);
  $('camp-start').disabled = !selectedUnlocked;
  $('camp-start').textContent = !selectedUnlocked ? '完成前章后开启' : state.progress.completedLevelIds.includes(selectedLevel) ? '重游此境 →' : '启程 →';
}

function showCamp() {
  storyBook?.close();
  appearancePanel?.close();
  briefing?.close();
  gearPanels?.close();setBuildMode(false);
  clearInput(); paused = false; closeAllDialogs(); game.returnToCamp(); view.release(); hero.visible = true; playerHalo.visible = true;
  travelChoiceLevelId = null;
  isCamp = true; document.body.dataset.play = 'camp'; $('camp').hidden = false; $('play-hud').hidden = true;
  $('touch-controls').hidden = true; $('menu-toggle').hidden = true;
  renderCamp(); prepareWorld(levels.find(level => level.id === selectedLevel) || levels[0], true);
  saveGame();
}

function beginLevel(id = selectedLevel, prepared = false) {
  if(!prepared){briefing.open(id);return;}
  setBuildMode(false);
  if (!action(game.startLevel(id,{bossKind:bossChoices.get(id)}))) return;
  if(visitRegion(records,id))toast('新地区手记已解锁，可在收藏册收进记录。','good');
  updateRecordButtons();
  storyBook?.close();
  selectedLevel = id; paused = false; isCamp = false; clearInput(); closeAllDialogs();
  document.body.dataset.play = 'playing'; $('camp').hidden = true; $('play-hud').hidden = false; $('menu-toggle').hidden = false;
  $('touch-controls').hidden = !coarsePointer.matches;
  prepareWorld(state.level, false); updateHUD(true); saveGame();
  if(!coarsePointer.matches&&view.lookMode==='follow')view.lock();
  toast(coarsePointer.matches ? '拖动画面环视 · 使用动作按钮 · 镜头设置调整视野' : '鼠标环视 · T 快速回身 · 左键攻击 · E 互动 · V 人称 · Esc 暂停', '', 5200);
}

function closeAllDialogs() {
  view.showPausedSettings(false);
  for (const id of ['pause-panel', 'shop-panel', 'result-panel', 'riddle-panel', 'tactical-panel', 'modal-layer']) $(id).hidden = true;
}

function pauseGame(reason = '当前关卡与开门状态会留在这里。') {
  if (state.status !== 'playing' || state.shopOpen) return;
  clearInput(); paused = true; view.release();
  $('pause-reason').textContent = reason;
  $('modal-layer').hidden = false; $('pause-panel').hidden = false;
  view.showPausedSettings(true);
  $('resume').focus({ preventScroll: true });
  saveGame();
}

function resumeGame() {
  view.showPausedSettings(false);
  clearInput(); paused = false;
  $('pause-panel').hidden = true;
  $('riddle-panel').hidden=true;
  $('tactical-panel').hidden=true;
  if (!state.shopOpen && !displayedResult) $('modal-layer').hidden = true;
  if(view.lookMode==='follow')view.lock();
}

function showShop() {
  if (state.status !== 'camp' && !state.shopOpen) { toast('靠近场景里的行商，按 E 进入商店。'); return; }
  clearInput(); state.shopOpen = true; view.release();
  $('modal-layer').hidden = false; $('shop-panel').hidden = false;
  $('pause-panel').hidden = true;
  renderShop(); $('shop-close').focus({ preventScroll: true });
}

function closeShop() {
  state.shopOpen = false; clearInput(); $('shop-panel').hidden = true;
  if (paused && state.status === 'playing') { $('pause-panel').hidden = false; $('modal-layer').hidden = false; }
  else $('modal-layer').hidden = true;
  syncWeapon(); if (state.status === 'camp') renderCamp();
  if(state.status==='camp'&&briefingReturnId){const id=briefingReturnId;briefingReturnId=null;briefing.open(id);}
}

function renderShop() {
  $('shop-coins').textContent = state.player.gold;
  $('shop-items').replaceChildren();
  for (const item of SHOP_ITEMS) {
    const owned = item.kind === 'weapon' && state.player.weapons.includes(item.weaponId);
    const affordable = state.player.gold >= item.price;
    const element = document.createElement('article'); element.className = 'shop-item';
    element.innerHTML = `<div class="shop-icon"></div><h3></h3><p></p><button><span></span><b></b></button>`;
    element.querySelector('.shop-icon').textContent = icons[item.id];
    element.querySelector('h3').textContent = item.name;
    element.querySelector('p').textContent = weaponDescriptions[item.id];
    if(item.kind==='building'){element.querySelector('.shop-icon').textContent='▦';element.querySelector('p').textContent='5 块纸砖，逐块堆叠成掩体；双方子弹会损伤它，支撑毁坏会连锁坍塌。';}
    attachEquipmentHint(element,item.kind==='building'?'building-block':item.id);
    const button = element.querySelector('button');
    button.querySelector('span').textContent = owned ? state.player.weaponId === item.weaponId ? '已装备' : '装备' : affordable ? '购入' : '铜钱不足';
    button.querySelector('b').textContent = owned ? '✓' : `${item.price} 文`;
    button.disabled = owned ? state.player.weaponId === item.weaponId : !affordable;
    button.addEventListener('click', () => { if (action(owned ? game.equip(item.weaponId) : game.buy(item.id))) { renderShop(); syncWeapon(); saveGame(); } });
    $('shop-items').append(element);
  }
}

function showResult() {
  if (displayedResult === state.status) return;
  displayedResult = state.status; clearInput(); paused = false; view.release();
  $('toasts').replaceChildren();
  const won = state.status === 'complete';
  $('modal-layer').hidden = false; $('result-panel').hidden = false;
  $('pause-panel').hidden = true; $('shop-panel').hidden = true;
  $('result-eyebrow').textContent = won ? '这一程，已留下足迹' : '歇一盏茶，再试一次';
  $('result-symbol').textContent = won ? '过境' : '暂歇';
  $('result-title').textContent = won ? state.level.nextLevelId ? '前路已经打开。' : '十二地行旅，抵达终章。' : '旅途还没有结束。';
  $('result-description').textContent = won ? `${state.level.shortTitle || state.level.title}已完成。${state.level.firstCompletion ? '首次通关奖励已到账。' : '重游不会重复领取首次通关奖励。'}`
    : state.level.failureReason || (state.level.escort && !state.level.escort.alive ? '守灯人倒下了。保护目标与自己都需要留意。武器、经验与铜钱会保留。' : '可以用工夫茶恢复体力，或换把兵器重新尝试。重试会恢复本关场景与敌人。');
  if(won&&state.level.journey?.completed)$('result-description').textContent+=' 地区行动「'+state.level.journey.title+'」已完成。';
  const chapterStory=STORY_CHAPTERS[state.level.id],story=game.getStoryStatus();
  if(won&&chapterStory){
    $('result-description').textContent+=' '+chapterStory.afterBoss+' '+(state.level.nextLevelId?chapterStory.nextHook:story.complete?'十二页回信已经合拢，可以带着归途纸鹤重访。':story.canAssemble?'十二页已经齐全。打开归途手记，按四组线索拼出最后的回信。':`归途手记还缺 ${story.total-story.collected} 页，可返回营地重访缺页地区。`);
  }
  const storyAction=$('result-story');if(storyAction){storyAction.hidden=!won;storyAction.textContent=story.canAssemble&&!story.complete?'拼接十二页，展开结局 →':`查看归途手记 · ${story.collected}/12`;}
  updateStoryButtons();
  $('result-stats').innerHTML = `<span><b>${state.level.kills}</b>击败墨灵</span><span><b>${Math.floor(state.level.elapsed / 60)}:${String(Math.floor(state.level.elapsed % 60)).padStart(2, '0')}</b>本关用时</span><span><b>${state.player.level}</b>旅人等级</span>`;
  $('result-primary').textContent = won ? state.level.nextLevelId ? '前往下一章 →' : '回营地看看旅程 →' : '重试本关 →';
  renderTravelChoices(won);
  $('result-primary').focus({ preventScroll: true }); saveGame();
}

const travelChoices = document.createElement('div'); travelChoices.className = 'loadout-choice'; travelChoices.hidden = true;
$('result-stats').after(travelChoices);
function renderTravelChoices(won, level = state.level) {
  travelChoices.hidden = !won; travelChoices.replaceChildren();
  selectedTravelWeapon = null; selectedTravelSupply = null;
  travelChoiceLevelId = won ? level.id : null;
  $('result-primary').disabled = won;
  $('result-camp').disabled = won;
  $('result-camp').textContent = won ? '收好行装，回到营地' : '回营地整理行装';
  if (!won) return;
  const claimed = state.progress.loadoutClaimedLevelIds.includes(level.id);
  const addChoices = (title, ids, category, names) => {
    const heading = document.createElement('h3'); heading.textContent = title;
    const grid = document.createElement('div'); grid.className = 'loadout-grid';
    for (const id of ids) {
      const button = document.createElement('button'); button.dataset.travelChoice = category; button.dataset.item = id;
      button.setAttribute('aria-pressed', 'false');
      button.append(document.createTextNode(`${icons[id]} · ${names[id].name}`));
      const detail = document.createElement('small'); detail.textContent = weaponDescriptions[id]; button.append(detail);
      button.addEventListener('click', () => {
        if (category === 'weapon') selectedTravelWeapon = id; else selectedTravelSupply = id;
        for (const sibling of grid.children) sibling.setAttribute('aria-pressed', String(sibling === button));
        $('result-primary').disabled = !selectedTravelWeapon || (!claimed && !selectedTravelSupply);
        $('result-camp').disabled = $('result-primary').disabled;
      }); grid.append(button);
    }
    travelChoices.append(heading, grid);
  };
  addChoices(claimed ? '调整下一程的武器' : '选一把武器，带去下一程', claimed ? state.player.weapons : [...weaponOrder,'knife','pan'], 'weapon', WEAPONS);
  if (!claimed) addChoices('再选一份随身补给', Object.keys(CONSUMABLES), 'supply', CONSUMABLES);
  const note = document.createElement('p'); note.textContent = claimed ? '本章赠礼已经领取；已有兵器仍可自由调整。' : '选中的兵器将解锁并装备，补给放进行囊。每章赠礼领取一次。'; travelChoices.append(note);
  $('result-primary').textContent = state.status === 'complete' && level.nextLevelId ? '带上行装，前往下一章 →' : '收好行装，回到营地 →';
}

function showPendingLoadout() {
  const level = levels.find(level => state.progress.completedLevelIds.includes(level.id) && !state.progress.loadoutClaimedLevelIds.includes(level.id));
  if (state.status !== 'camp' || !level) return;
  closeAllDialogs(); clearInput();
  $('modal-layer').hidden = false; $('result-panel').hidden = false;
  $('result-eyebrow').textContent = '这一程的赠礼，还在等你';
  $('result-symbol').textContent = '行装';
  $('result-title').textContent = `${level.shortTitle} · 通关行装`;
  $('result-description').textContent = '领取后武器与补给会保存在行囊中，下次启程继续携带。';
  $('result-stats').replaceChildren();
  renderTravelChoices(true, level);
}

function claimTravelChoices() {
  return !travelChoiceLevelId || action(game.claimChapterLoadout({ weaponId: selectedTravelWeapon, supplyId: selectedTravelSupply, levelId: travelChoiceLevelId }));
}

function processEvents() {
  for (const event of game.drainEvents()) {
    if(event.type==='animal-roster')void preloadDesktopAnimals(event.rosterIds);
    if(event.type==='animal-deck'){animalDeckState=event.state;try{localStorage.setItem(ANIMAL_DECK_KEY,JSON.stringify(animalDeckState));}catch{if(!storageUnavailable)toast('浏览器暂时无法保存动物出场记录；本次游玩仍会排重，刷新后可能重新抽取。','',6500);storageUnavailable=true;}}
    if(event.type==='kill'){
      const defeated=state.level?.enemies.find(enemy=>enemy.id===event.enemyId);
      if(defeated?.type==='boss'&&defeatRecordedBoss(records,defeated.bossKind)){
        toast('首领图鉴已解锁 · 可收进收藏册','good');updateRecordButtons();
      }
    }
    const positive = ['story-fragment','story-ending','story-assembled','purchase', 'collect', 'letter-pickup', 'level-up', 'reward', 'level-complete', 'heal'].includes(event.type);
    if (event.message && !['damage', 'level-start', 'npc', 'equip', 'enemy-telegraph','boss-telegraph','structural-hit'].includes(event.type)) toast(event.message, positive ? 'good' : '', event.type === 'level-up' ? 4300 : 3100);
    if (positive) playTone('reward');
    if (event.type === 'door' || event.type === 'switch') playTone('door');
    if (event.type === 'enemy-shot') combatAudio.play('enemySlowShot');
    if(event.type==='enemy-spawn')battleVFX.emit({type:'spawn',x:event.x,y:event.y,z:event.z,groundY:event.y,elevated:event.spawnKind==='roof'});
    if(event.type==='enemy-shot'){
      const enemy=state.level.enemies.find(e=>e.id===event.enemyId);
      const entry=entityModels.get(`enemy:${event.enemyId}`);if(entry)entry.attackUntil=realTime+.2;
      if(enemy)battleVFX.emit({type:'enemy-shot',x:enemy.x,y:groundHeight(state.level,enemy.x,enemy.z)+(enemy.y||0)+enemy.height*(enemy.muzzleHeightRatio??.65),z:enemy.z,dirX:enemy.attackDirX,dirY:-.15,dirZ:enemy.attackDirZ});
    }
    if(event.type==='boss-arrival'||event.type==='echo-arrival'){
      const boss=state.level.enemies.find(e=>e.alive&&e.active&&(event.type==='echo-arrival'?e.isEcho:e.id===state.level.hunt.bossId));
      if(boss)view.kick(battleVFX.emit({type:'boss-spawn',x:boss.x,y:groundHeight(state.level,boss.x,boss.z)+(boss.y||0),z:boss.z}));
    }
    if (['echo-warning', 'boss-arrival', 'boss-phase', 'boss-burst','structural-warning','structure-warning'].includes(event.type)) combatAudio.play('bossAlert');
    if (event.type === 'damage') {
      $('damage-vignette').style.opacity = '0.55'; playTone('damage');
      setTimeout(() => { $('damage-vignette').style.opacity = '0'; }, 220);
    }
    if (event.type === 'npc' && state.shopOpen) showShop();
    if(event.type==='riddle-station')openRiddle();
    if(event.type==='district-evidence')gearPanels.open('expedition');
    if(event.type==='journey-choice'&&!gearPanels.isOpen)gearPanels.open('expedition');
    if(event.type.startsWith('story-'))updateStoryButtons();
    if (event.type === 'level-complete') notifyMap('chaoshan-adventure:complete');
    if (event.type === 'equip') toast(event.message);
    if (!['damage', 'notice', 'npc', 'boss-phase', 'enemy-shot', 'enemy-spawn', 'enemy-telegraph','boss-telegraph','boss-volley','letter-drop','letter-observed','structural-hit'].includes(event.type)) saveGame();
  }
}

function buildWeaponSlots() {
  $('weapon-slots').replaceChildren();
  weaponOrder.forEach((id, index) => {
    const button = document.createElement('button'); button.className = 'weapon-slot'; button.dataset.weapon = id;
    button.innerHTML = `<kbd>${index + 1}</kbd><em>${icons[id]}</em><span></span>`;
    button.querySelector('span').textContent = WEAPONS[id].name;
    attachEquipmentHint(button,id);
    button.addEventListener('click', () => { if (!paused && !state.shopOpen) action(game.equip(id)); });
    $('weapon-slots').append(button);
  });
}

function updateHUD(force = false) {
  if (!force && realTime - lastHUD < 0.1) return;
  lastHUD = realTime;
  const p = state.player;
  $('player-level').textContent = `旅人 · Lv.${p.level}`;
  $('player-coins').textContent = `${p.gold} 铜钱`;
  $('hp-fill').style.width = `${Math.max(0, p.hp / p.maxHp) * 100}%`;
  $('hp-text').textContent = `${Math.ceil(p.hp)}/${p.maxHp}`;
  $('stamina-fill').style.width = `${p.stamina}%`;
  $('stamina-text').textContent = `${Math.ceil(p.stamina)}`;
  $('xp-fill').style.width = `${p.xp / p.xpNext * 100}%`;
  $('xp-text').textContent = `${p.xp}/${p.xpNext}`;
  $('potion-count').textContent = `× ${p.potions}`;
  for (const button of $('weapon-slots').children) {
    button.disabled = !p.weapons.includes(button.dataset.weapon);
    button.classList.toggle('active', p.weaponId === button.dataset.weapon);
  }
  if (!state.level || isCamp) return;
  const level = state.level;
  const weather = WEATHER[level.weather?.id || 'clear'];
  $('weather-name').textContent = `${weather.icon} ${weather.name}`;
  const combat=level.combat||{};
  $('combat-tempo').textContent=`移速 ×${(level.hunt?.movementMultiplier||1).toFixed(2)} · ${level.evacuation&&level.elapsed<10?Math.ceil(10-level.elapsed)+'秒后怪物来袭':Math.ceil(combat.nextMovementBoostIn||3)+'秒后提速'} · 射速 ×${(combat.fireRateMultiplier||1).toFixed(2)} · 弹速 ×${(combat.projectileSpeedMultiplier||1).toFixed(2)}`;
  if(level.hunt?.riddle){const h=level.hunt;$('letter-pocket').textContent=`字母卡 ${h.letters.length}/${h.riddle.answer.length}${h.letters.length>=h.riddle.answer.length?' · 已收齐，回猜谜点':' · 靠近掉落卡拾取'}`;}
  $('weather-detail').textContent = level.weather?.forecast ? `即将转为${WEATHER[level.weather.nextId].name} · 怪物状态将变化` : `${Math.ceil(level.weather?.remaining || 0)} 秒后天气变化 · ${weather.description}`;
  for (const id of Object.keys(CONSUMABLES)) {
    $(id + '-count').textContent = p.consumables[id];
    document.querySelector(`[data-supply="${id}"]`).disabled = p.consumables[id] < 1;
  }
  const target = level.enemies.find(enemy => enemy.id === view.targetEnemyId && enemy.alive && enemy.active!==false);
  $('enemy-intel').hidden = !target;
  if (target) $('enemy-intel').textContent = `Lv.${target.level} ${target.name} · ${Math.ceil(target.hp)}/${target.maxHp} · ${target.weatherTrait}`;
  $('level-region').textContent = `${level.region || '潮汕'} / ${level.lighting?.time || '行旅'}`;
  $('level-title').textContent = level.title;
  $('level-subtitle').textContent = level.objectiveText || level.description || '';
  const rescueRows=[];
  if(level.evacuation){const e=level.evacuation,complete=e.status==='complete';rescueRows.push({id:'civilian-rescue',rescue:true,label:complete?'✓ 救援任务完成':e.status==='failed'?'平民护送 · 未完成':'救援 · 护送平民',current:e.delivered||0,target:e.target||5,complete,failed:e.status==='failed'});}
  if(level.survivors?.length){const saved=level.survivors.filter(s=>s.rescued).length,total=level.survivors.length;rescueRows.push({id:'room-rescue',rescue:true,label:saved===total?'✓ 屋内救援完成':'救援 · 屋内受困旅人',current:saved,target:total,complete:saved===total,failed:level.survivors.some(s=>!s.alive&&!s.rescued)});}
  const rows = [...rescueRows,...game.getObjectives()];
  const key = JSON.stringify(rows.map(row => [row.id,row.label,Math.floor(row.current),row.target,row.complete,row.failed]));
  if ($('objectives').dataset.key !== key) {
    $('objectives').dataset.key = key; $('objectives').replaceChildren();
    for (const row of rows) {
      const item = document.createElement('li'); item.className = `objective ${row.complete ? 'done' : ''}${row.rescue?' rescue-objective':''}${row.failed?' failed':''}`;item.dataset.objective=row.id;
      const label = document.createElement('span'); label.textContent = row.label;
      const progress = document.createElement('b'); progress.textContent = `${Math.floor(row.current)} / ${row.target}${row.id === 'defend' ? ' 秒' : ''}`;
      item.append(label, progress); $('objectives').append(item);
    }
  }
  const boss = level.enemies.find(enemy => enemy.alive && enemy.active!==false && enemy.type === 'boss' && Math.hypot(enemy.x - p.x, enemy.z - p.z) < 28);
  $('boss-hud').hidden = !boss; $('view-hint').hidden = !!boss;
  if (boss) {
    $('boss-name').textContent = `${boss.name} · 第 ${boss.phase} 阶段`;
    $('boss-health').textContent = `${Math.ceil(boss.hp)} / ${boss.maxHp}`;
    $('boss-fill').style.width = `${boss.hp / boss.maxHp * 100}%`;
  }
  const h=level.hunt;
  if(h){
    $('kill-current').textContent=h.kills;$('kill-target').textContent=h.killTarget;$('kill-fill').style.width=`${Math.min(100,h.kills/h.killTarget*100)}%`;
    $('kill-objective').classList.toggle('complete',h.killHalf);
    $('kill-remaining').textContent=h.killHalf?(h.clueHalf?'两半钥匙齐全 · 前往任务房':'击杀达标 · 寻找紫色 ? 解谜'):`还需击杀 ${Math.max(0,h.killTarget-h.kills)} 只`;
    if(h.kills!==lastShownKills){$('kill-current').animate([{transform:'scale(1.28)',color:'#ba4437'},{transform:'scale(1)',color:'inherit'}],{duration:240});lastShownKills=h.kills;}
    if(h.killHalf&&!announcedQuota){announcedQuota=true;announcementUntil=realTime+4.5;$('mission-announcement').textContent=`击杀目标完成 · ${h.kills} / ${h.killTarget}　战斗半钥已获得`;$('mission-announcement').hidden=false;combatAudio.play('coin');}
    const active=level.enemies.filter(e=>e.alive&&e.active&&e.type!=='boss').length,distance=Math.round(Math.hypot(p.x-h.target.x,p.z-h.target.z));
    const peace=level.evacuation&&level.elapsed<10,battleTime=level.evacuation?Math.max(0,level.elapsed-10):level.elapsed;
    $('hunt-pressure').textContent=peace?`街区日常 · ${Math.ceil(10-level.elapsed)} 秒后怪物来袭`:`墨潮 ${h.pressure+1} 阶 · ${Math.ceil(h.pressureEvery-battleTime%h.pressureEvery)} 秒后增强`;
    $('hunt-status').textContent=peace?'先认商人、楼梯与安全集结点':h.phase==='boss'?'首领已现身 · 击败即获胜':`${active?`来袭 ${active} 只`:`${Math.ceil(h.waveRemaining)} 秒后下一批`} · 任务房 ${distance} 游戏米`;
    $('riddle-open').textContent=h.riddleSolved?'✓ 谜语已解':'线索册 Q';
  }
  $('escort-hud').hidden = !level.escort;
  if (level.escort) {
    const escort = level.escort;
    $('escort-hud').textContent = `${escort.name || '守灯人'} ${Math.ceil(escort.hp)}/${escort.maxHp} · ${escort.reached ? '已抵达' : !escort.started ? '靠近按 E 开始护送' : Math.hypot(escort.x - p.x, escort.z - p.z) > escort.followRadius ? '太远了，回来陪伴' : '护送中'}`;
  }
  const evacuation=level.evacuation,evacCard=$('evacuation-card');
  evacCard.hidden=!evacuation;
  if(evacuation){
    const people=evacuation.people||[],following=people.filter(n=>n.alive&&n.following&&!n.evacuated).length,alive=people.filter(n=>n.alive&&!n.evacuated).length,delivered=evacuation.delivered||0;
    evacCard.classList.toggle('complete',evacuation.status==='complete');
    $('evacuation-count').textContent=`${delivered} / ${evacuation.target||5}`;
    $('evacuation-title').textContent=evacuation.status==='complete'?'✓ 平民护送已成功':evacuation.status==='failed'?'护送未能完成':'支线 · 护送平民';
    $('evacuation-detail').textContent=`合计 ${evacuation.total||15} 人 · 跟随 ${following} · 在外存活 ${alive}`;
    const zone=evacuation.safeZone,d=zone?Math.round(Math.hypot(p.x-zone.x,p.z-zone.z)):0;
    $('evacuation-route').textContent=evacuation.phase==='peace'?'10 秒后人群避险；靠近会跟随你':evacuation.status==='failed'?'存活人数不足 5；仍可完成主线':`带往地图「安」· 还有 ${d} 游戏米`;
  }
  const merchants=level.npcs.filter(n=>n.type==='merchant'||n.type==='shop'),merchant=merchants.find(n=>n.alive!==false)||merchants[0];
  $('merchant-location').textContent=merchant?merchant.alive===false?'行商已遇难 · 本关无法交易':`商 · ${merchant.fleeing?'正在避险':merchant.y>1.5?'楼上藏身':'可交易'} · ${Math.round(Math.hypot(p.x-merchant.x,p.z-merchant.z))} 米`:'本区暂无行商';
  $('interaction').classList.toggle('active', !!state.interaction || level.readyToExit);
  $('interaction').querySelector('span').textContent = state.interaction?.label || (level.readyToExit ? '目标完成，前往地图上的绿门' : '靠近门、物件或行商后互动');
  updateFieldGear();
  renderMinimap();
}

function renderMinimap(){
  drawMissionMap($('minimap'),state.level,state.player,{tracking:missionTracking?.target()});
  $('map-scale').textContent='';
}
function openTactical(){
  if(state.status!=='playing'||state.shopOpen)return;
  clearInput();paused=true;view.release();closeAllDialogs();$('modal-layer').hidden=false;$('tactical-panel').hidden=false;
  $('tactical-title').textContent=state.level.shortTitle+' · 任务地图';
  missionTracking?.render();
  drawMissionMap($('tactical-canvas'),state.level,state.player,{large:true,time:realTime,tracking:missionTracking?.target()});
  const h=state.level.hunt;$('tactical-note').textContent='紫色字母是待拾取卡片，「谜」为猜谜点：收齐字母后回到这里拼词。击杀 '+h.kills+' / '+h.killTarget+'，解谜并集齐路标符片后，进入旗帜标记的任务房。';
  $('tactical-close').focus({preventScroll:true});
}
function closeTactical(){clearInput();$('tactical-panel').hidden=true;$('modal-layer').hidden=true;paused=false;}
$('tactical-open').addEventListener('click',openTactical);$('tactical-close').addEventListener('click',closeTactical);
$('map-open-riddle').addEventListener('click',openRiddle);

function openRiddle(){
  if(state.shopOpen)return;
  const h=state.level?.hunt;if(state.status!=='playing'||!h)return;
  clearInput();view.release();paused=true;closeAllDialogs();$('modal-layer').hidden=false;$('riddle-panel').hidden=false;
  $('riddle-key-status').textContent=`密码半钥 ${h.clueHalf?'✓ 已拼好':'· 尚未拼好'}　战斗半钥 ${h.killHalf?'✓ 已获得':`${h.kills}/${h.killTarget}`}`;
  $('riddle-prompt').textContent=h.riddleRevealed?h.riddle.prompt:'调查路边带符号的线索标记，或击败来袭野怪，获得第一张谜面。';
  $('riddle-letters').replaceChildren();
  for(const [index,letter] of h.letters.entries()){const tile=document.createElement('button');tile.type='button';tile.dataset.letterIndex=index;tile.textContent=letter;tile.title='放入字母 '+letter;tile.disabled=h.riddleSolved;tile.addEventListener('click',()=>{if(tile.disabled)return;$('riddle-answer').value+=letter;syncLetterTiles();});$('riddle-letters').append(tile);}
  const pending=(h.letterDrops||[]).filter(d=>!d.collected).length;
  $('riddle-progress').textContent=`已收集 ${h.letters.length} / ${h.riddle?.answer.length||0} 张字母卡${pending?' · 场上还有 '+pending+' 张待拾取':''}。${h.letters.length>=h.riddle.answer.length?'字母齐全，已停止掉落。':'击败野怪随机掉卡，靠近即可拾取。'}`;
  $('riddle-station-status').textContent=h.riddleSolved?'本关谜语已解开':h.atRiddleSite?'已到猜谜点 · 字母集齐后可以验证':`现在可以输入或点字母卡推理。正式验证请到地图「谜」标记${Number.isFinite(h.riddleSiteDistance)?' · 还距 '+Math.ceil(h.riddleSiteDistance)+' 米':''}。`;
  $('riddle-form').hidden=!h.riddleRevealed||h.riddleSolved;
  $('riddle-answer').value=h.riddleDraft||'';$('riddle-answer').disabled=h.riddleSolved;
  const submit=$('riddle-form').querySelector('[type=submit]');submit.disabled=!h.atRiddleSite||h.letters.length<h.riddle.answer.length;submit.textContent=!h.atRiddleSite?'到谜点验证':h.letters.length<h.riddle.answer.length?'先集齐字母':'验证 →';
  $('riddle-go-map').hidden=h.atRiddleSite||h.riddleSolved;
  $('riddle-hints').hidden=!h.riddleRevealed||h.riddleSolved;renderRiddleHint();syncLetterTiles();
  $('riddle-result').textContent=h.riddleSolved?'✓ 已获得侦探碎片。集齐路标符片后，密码半钥就完整了。':'';
  renderStoryRiddle();
  if(h.riddleRevealed&&!h.riddleSolved)$('riddle-answer').focus({preventScroll:true});
}
function renderStoryRiddle(){
  const h=state.level?.hunt,c=STORY_CHAPTERS[state.level?.id],node=$('riddle-story-context');if(!node)return;
  node.hidden=!c;
  if(c)node.textContent=h?.riddleSolved?`${c.fragmentTitle} · ${h.riddle.explanation||c.connection} 故事纸片已经保存在归途手记中。`:`${c.title} · ${c.opening}`;
  const button=$('riddle-story-open');if(button)button.hidden=!h?.riddleSolved;
}
function renderRiddleHint(){const h=state.level?.hunt;if(!h?.riddle)return;const step=h.riddleHintStep||0;$('riddle-hint-text').textContent=riddleHint(h.riddle,step);$('riddle-hint-next').textContent=['给我一点提示','看英文开头','查看完整谜底','已显示完整谜底'][Math.min(3,step)];$('riddle-hint-next').disabled=step>=3;}
function syncLetterTiles(){
  state.level.hunt.riddleDraft=$('riddle-answer').value;
  const remaining={};for(const letter of $('riddle-answer').value.toUpperCase())remaining[letter]=(remaining[letter]||0)+1;
  for(const tile of $('riddle-letters').children){const used=(remaining[tile.textContent]||0)>0;if(used)remaining[tile.textContent]--;tile.disabled=used||state.level.hunt.riddleSolved;tile.classList.toggle('used',used);}
}
function closeRiddle(){clearInput();$('riddle-panel').hidden=true;$('modal-layer').hidden=true;paused=false;}
$('riddle-open').addEventListener('click',openRiddle);$('riddle-close').addEventListener('click',closeRiddle);
$('riddle-go-map').addEventListener('click',()=>{closeRiddle();missionTracking?.select('riddle');openTactical();});
$('riddle-hint-next').addEventListener('click',()=>{const h=state.level.hunt;h.riddleHintStep=Math.min(3,(h.riddleHintStep||0)+1);renderRiddleHint();});
$('riddle-form').addEventListener('submit',event=>{event.preventDefault();const result=game.submitRiddle($('riddle-answer').value);$('riddle-result').textContent=result.ok?'✓ 推理正确，侦探碎片已入册。':result.reason;if(result.ok){$('riddle-form').hidden=true;renderStoryRiddle();processEvents();updateHUD(true);}});

function clearInput(preserveTactical=false) {
  touchLean=0;touchGuard=false;mouseGuard=false;if(!preserveTactical)tacticalControls?.reset();
  pressedKeys.clear(); touchHeld.clear(); mouseFire = false;
  buildWasHeld=false;if(gearTooltip)gearTooltip.hidden=true;
  pulseInputs.interact = false; pulseInputs.jump = false; pulseInputs.attack = false; pulseInputs.consumable = null;pulseInputs.stance=null;
  view.cancelGesture(); setRunLocked(false);
  for (const button of document.querySelectorAll('[data-hold]')) button.classList.remove('pressed');
}
function setRunLocked(value) {
  runLocked = Boolean(value);
  $('run-lock').setAttribute('aria-pressed', String(runLocked));
  $('run-lock').innerHTML = `${runLocked ? '停止奔跑' : '锁定奔跑'} <kbd>Caps</kbd>`;
}

function playingInputAllowed() { return state.status === 'playing' && !paused && !state.shopOpen && !isCamp && !appearancePanel?.isOpen; }
function setBuildMode(value){
  buildMode=Boolean(value);buildWasHeld=false;buildGhost.visible=false;
  if(buildMode)view.setAim(false,true);
  const button=$('build-toggle');if(button){button.setAttribute('aria-pressed',String(buildMode));button.innerHTML=`${buildMode?'退出建造':'方块建造'} <kbd>X</kbd>`;}
  if($('construction-readout'))$('construction-readout').hidden=!buildMode;
}
function cycleWeapon(){
  if(!playingInputAllowed())return;
  const owned=Object.keys(WEAPONS).filter(id=>state.player.weapons.includes(id)),index=owned.indexOf(state.player.weaponId);
  setBuildMode(false);action(game.equip(owned[(index+1)%owned.length]));syncWeapon();
}
let gearTooltip;
function attachEquipmentHint(element,id){
  const d=equipmentInfo(id);element.title=`${d.name} · ${d.description} ${d.range}；${d.ammo}；${d.stats}`;
  const hide=()=>{if(gearTooltip)gearTooltip.hidden=true;};
  const show=()=>{if(document.pointerLockElement)return;if(!gearTooltip){gearTooltip=document.createElement('aside');gearTooltip.className='gear-tooltip';document.body.append(gearTooltip);}gearTooltip.replaceChildren();for(const [tag,text]of [['strong',d.name],['span',d.description],['small',d.range],['small',d.ammo],['small',d.stats]]){const node=document.createElement(tag);node.textContent=text;gearTooltip.append(node);}gearTooltip.hidden=false;const rect=element.getBoundingClientRect(),tip=gearTooltip.getBoundingClientRect();gearTooltip.style.left=Math.max(8,Math.min(innerWidth-tip.width-8,rect.left))+'px';gearTooltip.style.top=Math.max(8,rect.top-tip.height-8)+'px';};
  element.addEventListener('pointerenter',show);element.addEventListener('focusin',show);element.addEventListener('pointerleave',hide);element.addEventListener('focusout',hide);element.addEventListener('click',hide);
}
function updateFieldGear(){
  const p=state.player,l=state.level;if(!l||isCamp)return;
  $('block-stock').textContent=p.buildingBlocks||0;
  const readout=$('target-readout');readout.hidden=true;readout.classList.remove('critical');
  const nearby=state.interaction?.type==='collectible'?l.collectibles.find(c=>c.id===state.interaction.id):null;
  if(nearby?.kind==='supply'){
    const info=equipmentInfo(nearby.supplyId);readout.textContent=`${info.name} · ${info.description} ${info.range} · E 拾取`;readout.hidden=false;
  }else if(state.interaction?.type==='survivor'){
    readout.textContent='受困旅人 · E 招呼跟随，带他离开房屋才算救援完成。';readout.hidden=false;
  }else{
    const direction=camera.getWorldDirection(new THREE.Vector3());let nearest=24,wall=null;
    for(const w of l.walls){if(w.kind==='invisible')continue;const hit=segmentBoxDistance(camera.position,direction,w,nearest);if(hit!==null&&hit<nearest){nearest=hit;wall=w;}}
    const s=wall&&(l.structures||[]).find(s=>s.id===wall.structureId||s.wallIds.includes(wall.id));
    if(s&&s.status!=='collapsed'){
      readout.textContent=`${s.name} · 耐久 ${Math.ceil(s.hp)} / ${s.maxHp}${wall.partMaxHp?' · 支柱 '+Math.ceil(wall.partHp)+' / '+wall.partMaxHp:''}${s.status==='warning'?` · ${Math.ceil(s.collapseRemaining)} 秒后倒塌！`:''}`;readout.hidden=false;readout.classList.toggle('critical',s.status==='warning'||s.hp/s.maxHp<.3);
    }else if(wall?.kind==='player-block'){
      readout.textContent=`纸砖方块 · 耐久 ${Math.ceil(wall.hp??160)} / ${wall.maxHp??160}`;readout.hidden=false;
    }
  }
}
function updateBuildPreview(){
  buildGhost.visible=false;if(!buildMode||!playingInputAllowed()||!game.previewBlock)return;
  const q=game.previewBlock(view.aiming(state.player,state.level)),node=$('construction-readout');
  node.hidden=false;node.classList.toggle('invalid',!q.ok);node.textContent=`方块 ${state.player.buildingBlocks||0} · ${q.ok?'左键放置 / X 退出建造':q.message||q.reason||'这里不能放置'} · 25 金币 / 5 块`;
  if([q.x,q.y,q.z].every(Number.isFinite)){buildGhost.position.set(q.x,q.y+(q.size||1.2)/2,q.z);buildGhost.visible=true;buildGhost.material.color.set(q.ok?0x548468:0xb54343);buildEdges.material.color.set(q.ok?0x416c58:0xb54343);}
}
function inputFrame(dt) {
  view.prepareInput(dt,state.player,state.level,world,realTime);
  const lateral = (pressedKeys.has('KeyD') || pressedKeys.has('ArrowRight') || touchHeld.has('right') ? 1 : 0)
    - (pressedKeys.has('KeyA') || pressedKeys.has('ArrowLeft') || touchHeld.has('left') ? 1 : 0);
  const forward = (runLocked || pressedKeys.has('KeyW') || pressedKeys.has('ArrowUp') || touchHeld.has('up') ? 1 : 0)
    - (pressedKeys.has('KeyS') || pressedKeys.has('ArrowDown') || touchHeld.has('down') ? 1 : 0);
  const sine = Math.sin(view.yaw), cosine = Math.cos(view.yaw);
  const input = { moveX: lateral * cosine - forward * sine, moveZ: -lateral * sine - forward * cosine,
    ...view.aiming(state.player, state.level),aiming:view.ads,
    attack: pulseInputs.attack || mouseFire || pressedKeys.has('Space') || touchHeld.has('attack'),
    consumable: pulseInputs.consumable,stance:pulseInputs.stance,lean:(pressedKeys.has('BracketRight')?1:0)-(pressedKeys.has('BracketLeft')?1:0)||touchLean,yaw:view.yaw,guard:mouseGuard||touchGuard,
    sprint: runLocked || pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight') || touchHeld.has('sprint'),
    jump: pulseInputs.jump || pressedKeys.has('KeyJ') || touchHeld.has('jump'),
    interact: pulseInputs.interact || pressedKeys.has('KeyE') || touchHeld.has('interact') };
  buildCooldown=Math.max(0,buildCooldown-dt);
  if(buildMode){const held=input.attack;input.attack=false;input.consumable=null;if(held&&!buildWasHeld&&buildCooldown===0&&game.placeBlock){action(game.placeBlock(input));buildCooldown=.2;}buildWasHeld=held;}else buildWasHeld=false;
  aimMarker.visible = false;
  pulseInputs.jump = false; pulseInputs.interact = false; pulseInputs.attack = false; pulseInputs.consumable = null;pulseInputs.stance=null;
  return input;
}

window.addEventListener('keydown', event => {
  if(storyBook?.isOpen)return;
  if(appearancePanel?.isOpen){if(!event.repeat&&['Escape','Digit9','Numpad9'].includes(event.code)){event.preventDefault();appearancePanel.close();}return;}
  if(tacticalControls?.isOpen){if(event.code==='Escape'){event.preventDefault();tacticalControls.close();}return;}
  if(gearPanels?.isOpen){if(event.code==='Escape'||event.code==='KeyG'||event.code==='KeyL'||event.code==='KeyN'||event.code==='KeyU'){event.preventDefault();gearPanels.close();}return;}
  if(event.code==='KeyL'&&briefing?.isOpen){event.preventDefault();guideReturnId=selectedLevel;briefing.close();gearPanels.open('guide');return;}
  if(briefing?.isOpen){if(event.code==='Escape'){event.preventDefault();briefing.close();}return;}
  if(recordBook?.isOpen)return;
  if((event.code==='Escape'||event.code==='Tab')&&!$('tactical-panel').hidden){event.preventDefault();closeTactical();return;}
  if(event.code==='Escape'&&!$('riddle-panel').hidden){event.preventDefault();closeRiddle();return;}
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.code) && !isCamp) event.preventDefault();
  if (event.repeat) return;
  if(event.code==='Digit9'||event.code==='Numpad9'){event.preventDefault();appearancePanel.open();return;}
  if(event.code==='KeyG'||event.code==='KeyL'){event.preventDefault();gearPanels.open(event.code==='KeyG'?'inventory':'guide');return;}
  if(event.code==='KeyC'){event.preventDefault();recordBook.open();return;}
  if(event.code==='KeyI'&&state.status==='playing'){event.preventDefault();foldButton.click();return;}
  if(event.code==='Tab'&&playingInputAllowed()){openTactical();return;}
  if (event.code === 'Escape' || event.code === 'KeyP') {
    event.preventDefault();
    if (event.code === 'Escape' && document.pointerLockElement === $('game-canvas')) { pauseGame('鼠标已释放，游戏已暂停。'); return; }
    if (event.code === 'Escape' && performance.now() - (view.lastUnlockAt || -1000) < 180) return;
    if (state.shopOpen) closeShop(); else if (paused) resumeGame(); else pauseGame();
    return;
  }
  if(['KeyN','KeyU'].includes(event.code)){event.preventDefault();gearPanels.open(event.code==='KeyN'?'expedition':'growth');return;}
  if (event.code === 'KeyV') { event.preventDefault(); view.toggle(); return; }
  if(event.code==='KeyQ'&&(playingInputAllowed()||!$('riddle-panel').hidden)){event.preventDefault();if($('riddle-panel').hidden)openRiddle();else closeRiddle();return;}
  if (!playingInputAllowed()) return;
  if(event.code==='Digit7'){event.preventDefault();view.cycleOptic();return;}
  if(event.code==='Digit8'){event.preventDefault();view.toggleAim();return;}
  if(event.code==='KeyZ'||event.code==='KeyY'){event.preventDefault();setRunLocked(false);const stance=event.code==='KeyZ'?'crouch':'prone';pulseInputs.stance=state.player.stance===stance?'stand':stance;return;}
  if(['BracketLeft','BracketRight'].includes(event.code)){event.preventDefault();setRunLocked(false);}
  if(event.code==='KeyF'){event.preventDefault();cycleWeapon();return;}
  if(event.code==='KeyX'){event.preventDefault();setBuildMode(!buildMode);return;}
  if (event.code === 'CapsLock') { event.preventDefault(); setRunLocked(!runLocked); return; }
  if (event.code === 'KeyR') { view.recenter(); return; }
  if (event.code === 'KeyT') { event.preventDefault();view.turnAround();return; }
  if (event.code === 'KeyS' || event.code === 'ArrowDown') setRunLocked(false);
  if (['KeyB', 'KeyK', 'KeyM','KeyO'].includes(event.code)) pulseInputs.consumable = { KeyB: 'bomb', KeyK: 'medkit', KeyM: 'molotov',KeyO:'smoke' }[event.code];
  pressedKeys.add(event.code);
  if(event.code==='Digit5'||event.code==='Digit6'){setBuildMode(false);action(game.equip(event.code==='Digit5'?'knife':'pan'));}
  if (/^Digit[1-4]$/.test(event.code)) {setBuildMode(false);action(game.equip(weaponOrder[Number(event.code.slice(-1)) - 1]));}
  if (event.code === 'KeyH') action(game.usePotion());
  if (event.code === 'KeyJ') pulseInputs.jump = true;
  if (event.code === 'Space') pulseInputs.attack = true;
  if (event.code === 'KeyE') pulseInputs.interact = true;
});
window.addEventListener('keyup', event => pressedKeys.delete(event.code));
$('game-canvas').addEventListener('pointerdown',e=>{if(e.button===2&&playingInputAllowed()&&state.player.weaponId==='pan')mouseGuard=true;});
window.addEventListener('pointerup',e=>{if(e.button===2)mouseGuard=false;});
const canvas = $('game-canvas');
$('run-lock').addEventListener('click', () => { if (playingInputAllowed()) setRunLocked(!runLocked); });
for (const button of document.querySelectorAll('[data-supply]')) button.addEventListener('click', () => {
  if (playingInputAllowed()) pulseInputs.consumable = button.dataset.supply;
});
for (const button of document.querySelectorAll('[data-hold]')) {
  button.addEventListener('pointerdown', event => {
    if (!playingInputAllowed()) return;
    event.preventDefault(); button.setPointerCapture(event.pointerId);
    if (button.dataset.hold === 'down') setRunLocked(false);
    touchHeld.add(button.dataset.hold); button.classList.add('pressed');
    if (button.dataset.hold in pulseInputs) pulseInputs[button.dataset.hold] = true;
  });
  const release = () => { touchHeld.delete(button.dataset.hold); button.classList.remove('pressed'); };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
}

$('camp-start').addEventListener('click', () => beginLevel());
$('camp-shop').addEventListener('click', showShop);
$('camp-pending-loadout').addEventListener('click', showPendingLoadout);
$('shop-close').addEventListener('click', closeShop);
$('menu-toggle').addEventListener('click', () => paused ? resumeGame() : pauseGame());
$('resume').addEventListener('click', resumeGame);
$('pause-camp').addEventListener('click', showCamp);
const pauseView = document.createElement('button');
pauseView.id = 'pause-view-toggle'; pauseView.className = 'outlined dark';
pauseView.addEventListener('click', () => view.toggle());
$('pause-camp').before(pauseView); view.buttons.push(pauseView); view.refresh();
$('result-camp').addEventListener('click', () => { if (claimTravelChoices()) showCamp(); });
$('result-primary').addEventListener('click', () => {
  if (state.status === 'dead') beginLevel(state.level.id);
  else if (state.status === 'complete') {
    if (!claimTravelChoices()) return;
    if (state.level.nextLevelId) beginLevel(state.level.nextLevelId); else showCamp();
  }
  else if (state.status === 'camp' && travelChoiceLevelId) { if (claimTravelChoices()) showCamp(); }
  else showCamp();
});
$('potion-button').addEventListener('click', () => { if (playingInputAllowed()) action(game.usePotion()); });
function updateSoundButton() { $('sound-toggle').textContent = `音效 · ${soundEnabled ? '开' : '关'}`; $('sound-toggle').setAttribute('aria-pressed', String(soundEnabled)); }
updateSoundButton();
const unlockSound = () => { if (soundEnabled) void combatAudio.unlock(); };
window.addEventListener('pointerdown', unlockSound);
window.addEventListener('keydown', unlockSound);
$('sound-toggle').addEventListener('click', async () => {
  soundEnabled = !soundEnabled; combatAudio.setEnabled(soundEnabled); updateSoundButton();
  try { localStorage.setItem('chaoshan-adventure:sound', soundEnabled ? 'on' : 'off'); } catch {}
  if (soundEnabled && await combatAudio.unlock()) playTone('reward');
});
$('map-return').addEventListener('click', event => {
  event.preventDefault(); clearInput(); saveGame();
  if (state.status === 'playing') pauseGame('已回到地图入口；继续游戏时可恢复当前关卡。');
  if (!notifyMap('chaoshan-adventure:exit', isCamp ? levels.find(level => level.id === selectedLevel) : state.level)) {
    location.assign(MAP_URL);
  }
});
$('save-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(fullSave(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `潮汕行旅-存档-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('存档已导出，包含人物成长、兵器、章节与收藏记录。', 'good');
});

function suspendForFocus() {
  clearInput(); saveGame();
  if (state.shopOpen && state.status === 'playing') { paused = true; $('pause-reason').textContent = '窗口失去焦点，游戏已暂停。'; }
  else if (playingInputAllowed()) pauseGame('窗口失去焦点，游戏已暂停。回来后点击继续。');
}
window.addEventListener('blur', suspendForFocus);
document.addEventListener('visibilitychange', () => { if (document.hidden) suspendForFocus(); });
window.addEventListener('pagehide', saveGame);
window.addEventListener('resize', () => {
  if (coarsePointer.matches) clearInput();
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
  $('touch-controls').hidden = isCamp || !coarsePointer.matches;
});
window.addEventListener('message', event => {
  if (!parentOrigin || event.origin !== parentOrigin || event.source !== window.parent) return;
  if (event.data?.type === 'chaoshan-adventure:enter' && levels.some(level => level.placeId === event.data.placeId)) {
    const target = levels.find(level => level.placeId === event.data.placeId);
    if (!state.progress.unlockedLevelIds.includes(target.id)) { toast('此境尚未开放，请先完成前一章。'); return; }
    if (state.level?.id === target.id && state.status === 'playing') { if (paused) resumeGame(); return; }
    selectedLevel = target.id; showCamp();
  }
});

function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.max(0, Math.min(0.05, (now - animate.previous) / 1000));
  animate.previous = now;
  realTime += delta;
  const running = playingInputAllowed();
  if(!state.shopOpen&&!$('shop-panel').hidden)closeShop();
  if (running) {
    game.step(delta, inputFrame(delta));
    processEvents();
    if (state.shopOpen && $('shop-panel').hidden) showShop();
    if (state.player.attackCooldown > lastAttackCooldown + 0.01 && WEAPONS[state.player.weaponId].kind === 'ranged'){playTone('attack');shotThisFrame=true;}
    lastAttackCooldown = state.player.attackCooldown;
    if (now - savedAt > 6000) saveGame();
  } else aimMarker.visible = false;
  if (state.status === 'dead' || state.status === 'complete') showResult();
  if (state.status !== lastStatus) { updateHUD(true); lastStatus = state.status; }
  const visualDelta = running || isCamp || state.status === 'dead' ? delta : 0;
  world?.update(isCamp ? worldLevel : state, visualDelta);
  letterDropsView.update(isCamp?null:state.level,visualDelta,camera,world);
  weatherView.update(isCamp ? null : state.level?.weather, state.player, state.level, world, visualDelta, running);
  if (!isCamp) view.update(visualDelta, state.player, state.level, world, running, realTime);
  else { hero.visible = true; playerHalo.visible = true; $('crosshair').hidden = true; }
  syncCharacters(visualDelta);
  expansionView.update(state,realTime);
  chapterJourneyView.update(state,realTime);
  storyCompanion.update(state,realTime,visualDelta);
  missionTracking?.update();tacticalControls?.update();
  if(shotThisFrame){
    const weapon=view.mode==='first'?view.grip.children[0]:hero.userData.firearmSocket?.children[0],muzzle=weapon?.userData.muzzleSocket;
    if(muzzle){muzzle.updateWorldMatrix(true,false);muzzle.getWorldPosition(shotPoint);
      if(view.mode==='first'){shotPoint.project(view.weaponCamera);shotRay.setFromCamera(new THREE.Vector2(shotPoint.x,shotPoint.y),camera);shotRay.ray.at(.9,shotPoint);}
    }else shotPoint.copy(camera.position).addScaledVector(view.forward,.85);
    const aim=view.aiming(state.player,state.level);view.kick(battleVFX.emit({type:'muzzle',x:shotPoint.x,y:shotPoint.y,z:shotPoint.z,dirX:aim.aimX,dirY:aim.aimY,dirZ:aim.aimZ,weaponId:state.player.weaponId}));shotThisFrame=false;
  }
  if (!isCamp) syncCombatVisuals(running || state.status === 'complete' || state.status === 'dead' ? delta : 0);
  if (realTime > hitMarkerUntil) $('crosshair').classList.remove('confirmed-hit', 'confirmed-kill');
  if(realTime>announcementUntil)$('mission-announcement').hidden=true;
  battleVFX.update(running||state.status==='complete'?delta:0,camera);
  updateHUD();
  updateBuildPreview();
  renderer.render(scene, camera);
  view.render(renderer, !isCamp && state.status !== 'dead');
}
animate.previous = performance.now();

const fieldKit=document.createElement('div');fieldKit.className='field-kit-controls';fieldKit.innerHTML='<button id="weapon-cycle" class="quiet">换装备 <kbd>F</kbd></button><button id="inventory-open" class="quiet">背包 <kbd>G</kbd></button><button id="appearance-open" class="quiet" aria-haspopup="dialog">换装 <kbd>9</kbd></button><button id="build-toggle" class="quiet" aria-pressed="false">方块建造 <kbd>X</kbd></button><button id="guide-open" class="quiet">指南 <kbd>L</kbd></button><span class="quiet">▦ <b id="block-stock">0</b></span>';$('play-hud').append(fieldKit);
const evacCard=document.createElement('aside');evacCard.id='evacuation-card';evacCard.className='evacuation-card';evacCard.hidden=true;evacCard.innerHTML='<b id="evacuation-title">支线 · 护送平民</b><strong id="evacuation-count">0 / 5</strong><p id="evacuation-detail"></p><small id="evacuation-route"></small>';$('play-hud').append(evacCard);
const merchantLocation=document.createElement('button');merchantLocation.id='merchant-location';merchantLocation.className='quiet merchant-location';merchantLocation.addEventListener('click',()=>{const n=state.level?.npcs.find(n=>['merchant','shop'].includes(n.type));if(n)missionTracking?.select('merchant:'+n.id);openTactical();});document.querySelector('.minimap-shell').append(merchantLocation);
for(const id of ['construction-readout','target-readout']){const node=document.createElement('aside');node.id=id;node.className=id;node.hidden=true;$('play-hud').append(node);}
const homeGuide=document.createElement('div');homeGuide.className='guide-home-actions';homeGuide.innerHTML='<button id="camp-guide" class="quiet">操作指南 <kbd>L</kbd></button><button id="camp-inventory" class="quiet">查看背包 <kbd>G</kbd></button>';document.querySelector('.camp-start-actions').prepend(homeGuide);
const homeKeys=document.createElement('p');homeKeys.className='camp-controls-summary';homeKeys.textContent='WASD 移动 · F 换装备 · G 背包 · 9 换装 · X 堆方块 · E 翻窗／救援 · Z 蹲走 · Y 匍匐 · [ ] 探头 · L 完整按键表';document.querySelector('.camp-heading').after(homeKeys);
const campAppearance=document.createElement('button');campAppearance.id='camp-appearance';campAppearance.className='outlined';campAppearance.setAttribute('aria-haspopup','dialog');campAppearance.innerHTML='主角换装 <kbd>9</kbd>';$('camp-shop').before(campAppearance);
async function choosePlayerAppearance(id){
  if(appearanceLoading)throw new Error('角色正在加载，请稍候。');
  if(state.status==='dead')throw new Error('请先重试本关或返回营地，再切换角色。');
  const previous=renderedAppearanceId;
  appearanceLoading=true;
  try{
    await setHeroAppearance(hero,id);
    const result=game.chooseAppearance(id);
    if(!result.ok){await setHeroAppearance(hero,previous);throw new Error(result.reason||'暂时无法换装，请稍后再试。');}
    renderedAppearanceId=id;view.setAppearance?.(id,hero);
    lastWeapon=null;syncWeapon();processEvents();saveGame();
    if(isCamp)renderCamp();
    toast(`已换上${id==='yae-miko'?'八重神子':'红巾旅人'}，按 V 可切到第三人称查看。`,'good');
  }catch(error){
    const failure=renderedAppearanceId===previous?new Error('角色暂时未能加载，当前角色已保留。请检查连接后重试。',{cause:error}):error;
    if(!appearancePanel?.isOpen)toast(failure?.message||'换装暂时失败，请稍后重试。','error',6000);
    throw failure;
  }finally{appearanceLoading=false;}
}
appearancePanel=installAppearancePanel({getAppearance:()=>state.player.appearanceId,
  onOpen:()=>{if(appearanceLoading&&!appearancePanel?.isLoading){toast('已选择的角色正在加载，请稍候。');return false;}if(briefing?.isOpen||gearPanels?.isOpen||recordBook?.isOpen||tacticalControls?.isOpen||state.shopOpen||document.querySelector('dialog[open]')||(!$('modal-layer').hidden&&$('pause-panel').hidden)){toast('请先关闭当前面板，再打开换装。');return false;}if(state.status==='dead'){toast('请先重试本关或返回营地，再切换角色。');return false;}appearancePauseBefore=paused;clearInput();paused=true;view.release();return true;},
  onClose:()=>{clearInput();paused=appearancePauseBefore;},onSelect:choosePlayerAppearance});
for(const id of ['appearance-open','camp-appearance'])$(id).addEventListener('click',()=>appearancePanel.open());
gearPanels=installGearPanels({getState:()=>state,
  onTrack:id=>{missionTracking.select(id);openTactical();},
  onOpen:()=>{if(appearancePanel?.isOpen||briefing?.isOpen||recordBook?.isOpen||state.shopOpen||(!$('modal-layer').hidden&&$('pause-panel').hidden))return false;gearPauseBefore=paused;clearInput();paused=true;view.release();if(gearTooltip)gearTooltip.hidden=true;return true;},
  onClose:()=>{clearInput();paused=gearPauseBefore;saveGame();if(guideReturnId){const id=guideReturnId;guideReturnId=null;briefing.open(id);}},
  onEquip:id=>{setBuildMode(false);action(game.equip(id));syncWeapon();saveGame();},
  onUse:id=>{if(id==='potion')action(game.usePotion());else action(game.useConsumable(id,view.aiming(state.player,state.level)));processEvents();updateHUD(true);},
  onBuild:()=>{if(playingInputAllowed())setBuildMode(true);},
  getBlocks:()=>game.getNearbyBlocks(),
  onBlock:(id,operation)=>{action(game.serviceBlock(id,operation));processEvents();saveGame();},
  onGrowth:(id,reset)=>{action(game.chooseGrowth(id,reset));processEvents();saveGame();},
  onMemento:id=>{action(game.equipMemento(id));processEvents();saveGame();},
  onEvidence:(id,reward)=>{action(game.claimEvidence(id,reward));processEvents();saveGame();},
  onJourney:choice=>{action(game.chooseJourney(choice));processEvents();updateHUD(true);saveGame();}});
for(const id of ['guide-open','camp-guide'])$(id).addEventListener('click',()=>gearPanels.open('guide'));
const notesButton=document.createElement('button');notesButton.id='district-notes-open';notesButton.className='quiet';notesButton.textContent='地区笔记 N';notesButton.addEventListener('click',()=>gearPanels.open('expedition'));$('riddle-open').after(notesButton);
const growthButton=document.createElement('button');growthButton.className='quiet';growthButton.id='camp-growth';growthButton.textContent='旅人成长 U';growthButton.addEventListener('click',()=>gearPanels.open('growth'));homeGuide.append(growthButton);
for(const id of ['inventory-open','camp-inventory'])$(id).addEventListener('click',()=>gearPanels.open('inventory'));
$('weapon-cycle').addEventListener('click',cycleWeapon);$('build-toggle').addEventListener('click',()=>{if(playingInputAllowed())setBuildMode(!buildMode);});
for(const b of document.querySelectorAll('[data-supply]'))attachEquipmentHint(b,b.dataset.supply);
tacticalControls=installTacticalControls({getState:()=>state,allowed:playingInputAllowed,onOpen:()=>{tacticsPauseBefore=paused;clearInput(true);paused=true;view.release();},onClose:()=>{clearInput(true);paused=tacticsPauseBefore;},onStance:id=>{setRunLocked(false);pulseInputs.stance=id;},onLean:value=>{setRunLocked(false);touchLean=value;},onGuard:value=>{touchGuard=value;}});
buildWeaponSlots();
const tempoLabel=document.createElement('small');tempoLabel.id='combat-tempo';$('kill-objective').append(tempoLabel);
const leftNotes=document.createElement('div');leftNotes.className='left-field-notes';$('play-hud').append(leftNotes);leftNotes.append(document.querySelector('.location-card'),$('weather-card'));
missionTracking=installMissionTracking({getState:()=>state,getYaw:()=>view.yaw,redrawMap:()=>{drawMissionMap($('tactical-canvas'),state.level,state.player,{large:true,tracking:missionTracking.target()});renderMinimap();}});
const pocketLabel=document.createElement('small');pocketLabel.id='letter-pocket';$('kill-objective').append(pocketLabel);
const stationStatus=document.createElement('p');stationStatus.id='riddle-station-status';$('riddle-progress').after(stationStatus);
const spellingTools=document.createElement('div');spellingTools.className='spelling-tools';spellingTools.innerHTML='<button type="button" id="spelling-back">退一张</button><button type="button" id="spelling-clear">重新排列</button>';$('riddle-answer').closest('.riddle-answer-row').after(spellingTools);
$('spelling-back').addEventListener('click',()=>{$('riddle-answer').value=$('riddle-answer').value.slice(0,-1);syncLetterTiles();});$('spelling-clear').addEventListener('click',()=>{$('riddle-answer').value='';syncLetterTiles();});$('riddle-answer').addEventListener('input',syncLetterTiles);
const foldButton=document.createElement('button');foldButton.id='hud-notes-toggle';foldButton.className='quiet';$('menu-toggle').before(foldButton);
function updateFold(){document.body.dataset.hudFolded=String(hudFolded);foldButton.textContent=hudFolded?'展开信息':'收起信息';foldButton.setAttribute('aria-expanded',String(!hudFolded));}
foldButton.addEventListener('click',()=>{hudFolded=!hudFolded;updateFold();try{localStorage.setItem('chaoshan-adventure:hud-folded',String(hudFolded));}catch{}});updateFold();
const recordsButton=document.createElement('button');recordsButton.id='records-open';recordsButton.className='quiet';recordsButton.textContent='收藏册';recordsButton.title='收藏册 · C';$('save-export').before(recordsButton);foldButton.title='收起或展开信息 · I';
const campRecordsButton=document.createElement('button');campRecordsButton.id='camp-records-open';campRecordsButton.className='outlined';$('camp-shop').before(campRecordsButton);
function updateRecordButtons(){
  const waiting=[...records.visitedLevelIds.map(id=>'region-'+id),...records.defeatedBossIds].filter(id=>recordAvailable(records,id)&&!records.collectedIds.includes(id)).length;
  const button=$('camp-records-open');if(button)button.textContent=`行旅收藏册 · ${records.collectedIds.length}/${12+Object.keys(BOSS_BY_ID).length}${waiting?' · '+waiting+' 张待收':''}`;
}
recordBook=installRecordBook({getState:()=>records,onCollect:id=>{if(collectRecord(records,id)){saveGame();updateRecordButtons();toast('已收进收藏册，下次回来仍会保留。','good');}},
  onOpen:()=>{if(appearancePanel?.isOpen||state.shopOpen||(!$('modal-layer').hidden&&$('pause-panel').hidden))return false;recordPauseBefore=paused;clearInput();paused=true;view.release();return true;},
  onClose:()=>{clearInput();paused=recordPauseBefore;saveGame();}});
recordsButton.addEventListener('click',()=>recordBook.open());campRecordsButton.addEventListener('click',()=>recordBook.open());updateRecordButtons();
const bestiaryButton = document.createElement('button'); bestiaryButton.id = 'bestiary-open'; bestiaryButton.className = 'outlined'; bestiaryButton.textContent = `桌宠图鉴 · ${DESKTOP_ANIMAL_COUNTS.catalog} 个条目`; bestiaryButton.style.marginBottom = '10px'; $('camp-shop').before(bestiaryButton);
const bestiary = installBestiary(bestiaryButton);
function updateStoryButtons(){
  const s=game.getStoryStatus();
  for(const id of ['camp-story','story-open']){const node=$(id);if(node)node.textContent=`归途手记 · ${s.collected}/${s.total}${s.complete?' · 已合拢':s.canAssemble?' · 可拼接':''}`;}
}
storyBook=installStoryBook({getState:()=>state,
  onOpen:()=>{
    if(appearancePanel?.isOpen||gearPanels?.isOpen||recordBook?.isOpen||briefing?.isOpen||tacticalControls?.isOpen||state.shopOpen||document.querySelector('dialog[open]')||(!$('modal-layer').hidden&&$('result-panel').hidden&&$('pause-panel').hidden))return false;
    storyPauseBefore=paused;clearInput();paused=true;view.release();return true;
  },
  onClose:()=>{clearInput();paused=storyPauseBefore;saveGame();},
  onAssemble:(id,chapters)=>{const result=game.assembleStory(id,chapters);processEvents();saveGame();updateStoryButtons();return result;},
  onCompanion:enabled=>{const result=game.setStoryCompanion(enabled);processEvents();saveGame();return result;},
  onRevisit:id=>{
    storyBook.close();
    if(travelChoiceLevelId&&!$('result-panel').hidden&&!claimTravelChoices())return;
    selectedLevel=id;showCamp();briefing.open(id);
  },
});
for(const [id,parent] of [['camp-story',homeGuide],['story-open',$('riddle-open').parentElement],['result-story',$('result-stats').parentElement]]){
  const button=document.createElement('button');button.id=id;button.className='quiet';button.setAttribute('aria-haspopup','dialog');button.textContent='归途手记';button.addEventListener('click',()=>storyBook.open(id==='result-story'?'assembly':'archive'));parent.append(button);
}
const prologue=document.createElement('details');prologue.className='camp-story-prologue';
const prologueTitle=document.createElement('summary');prologueTitle.textContent=STORY_PROLOGUE.title;
const prologueText=document.createElement('p');prologueText.textContent=STORY_PROLOGUE.text;
prologue.append(prologueTitle,prologueText);homeGuide.before(prologue);
const storyContext=document.createElement('p');storyContext.id='riddle-story-context';storyContext.className='riddle-story-context';$('riddle-prompt').before(storyContext);
const storyRiddleButton=document.createElement('button');storyRiddleButton.id='riddle-story-open';storyRiddleButton.className='quiet';storyRiddleButton.textContent='回看这一页归途记录 →';storyRiddleButton.hidden=true;
storyRiddleButton.addEventListener('click',()=>{closeRiddle();storyBook.open('archive');});$('riddle-result').after(storyRiddleButton);updateStoryButtons();
briefing=installChapterBriefing({levels,getPlayer:()=>state.player,getBossChoice:id=>bossChoices.get(id),onBossChoice:(id,kind)=>{if(kind)bossChoices.set(id,kind);else bossChoices.delete(id);},
  onOpen:()=>{briefingPauseBefore=paused;clearInput();paused=true;view.release();},
  onClose:()=>{clearInput();paused=briefingPauseBefore;},
  onStart:id=>beginLevel(id,true),
  onGuide:id=>{guideReturnId=id;briefing.close();gearPanels.open('guide');},
  onShop:id=>{selectedLevel=id;briefingReturnId=id;showCamp();showShop();}});
showCamp();
if(state.player.appearanceId!=='traveler'){
  appearanceLoading=true;$('loading-message').textContent='正在准备已选择的角色…';
  try{await setHeroAppearance(hero,state.player.appearanceId);renderedAppearanceId=state.player.appearanceId;view.setAppearance?.(renderedAppearanceId,hero);lastWeapon=null;syncWeapon();}
  catch{await setHeroAppearance(hero,'traveler');game.chooseAppearance('traveler');renderedAppearanceId='traveler';view.setAppearance?.('traveler',hero);saveGame();toast('已保存的角色暂时未能加载，先以红巾旅人继续。按 9 可重新换装。','error',6500);}
  finally{appearanceLoading=false;}
}
void preloadDesktopAnimals().then(results=>{if(results.some(result=>result.status==='rejected'))toast('部分桌宠图像尚未就绪，加载失败时会显示备用轮廓。','',5000);}).catch(()=>toast('桌宠图像暂时未能加载，先显示备用轮廓。','',5000));
briefing.open(selectedLevel);
if (state.saveRecovered) {
  $('save-recovery').hidden = false;
  $('save-recovery').textContent = '原存档损坏或版本不兼容，已安全恢复为新旅程。你可以从第一章重新启程。';
}
if (storageUnavailable) {
  $('save-recovery').hidden = false;
  $('save-recovery').textContent = '浏览器存储不可用。仍可游玩，请在离开前使用“导出存档”保存成长进度。';
}
processEvents();
$('loading').hidden = true;
const cardTilt=installCardTilt();
requestAnimationFrame(animate);

// Read-only snapshots are useful to inspect this original prototype. Gameplay
// remains controlled by the ordinary inputs and AdventureGame rules above.
Object.defineProperty(window, 'chaoshanAdventure', { value: Object.freeze({
  snapshot: () => JSON.parse(JSON.stringify({ status: state.status, paused, shopOpen: state.shopOpen, player: state.player,
    animalVisuals:[...entityModels.values()].filter(entry=>entry.root.userData.desktopAnimal).map(entry=>({entityId:entry.root.name,animalId:entry.root.userData.animalId,...entry.root.userData.desktopAnimal.previewState})),
    animalCatalog:DESKTOP_ANIMAL_COUNTS,animalTextures:animalTextureCacheStats(),
    appearance:{id:state.player.appearanceId,loading:appearanceLoading,modelReady:renderedAppearanceId===state.player.appearanceId,renderedId:renderedAppearanceId,panelOpen:appearancePanel.isOpen},
    story:game.getStoryStatus(),storyCompanion:storyCompanion.snapshot?.(),progress: state.progress, records, hudFolded, level: state.level, interaction: state.interaction, projectiles: state.projectiles, hazards: state.hazards,
    view: { mode: view.mode, ads:view.ads,optic:view.optic,aimSensitivity:view.aimSensitivity,reticleSize:view.reticleSize,lookMode:view.lookMode,sensitivity:view.sensitivity,yaw: view.yaw, pitch: view.pitch, camera: camera.position.toArray(), distance: view.distance, followDistance: view.followDistance, fov: camera.fov, blocked: view.blocked, bodyVisible: hero.visible, runLocked, weatherId: weatherView.weatherId, rainCount: weatherView.rainCount, pointerLocked: document.pointerLockElement === canvas } })),
  version: 'connected-story-v20',
  uiVersion: 'tilted-cards-v14',
}), configurable: true });

window.addEventListener('beforeunload', () => {
  appearancePanel.dispose();disposeHeroAppearance(hero);
  cardTilt.dispose();
  missionTracking.dispose();tacticalControls.dispose();smokeGeometry.dispose();smokeScreen.remove();
  guideReturnId=null;gearPanels.dispose();buildGhost.geometry.dispose();buildGhost.material.dispose();buildEdges.geometry.dispose();buildEdges.material.dispose();
  briefing.dispose();
  view.dispose(); bestiary.dispose(); recordBook.dispose(); weatherView.dispose(); clearTransientScene(); world?.dispose(); disposeCharacters();disposeDemonBosses();
  fireGeometry.dispose(); fireRingGeometry.dispose(); fireMaterial.dispose();
  poisonMaterial.dispose();snareMaterial.dispose();poolGeometry.dispose();webLineGeometry.dispose();
  projectileGeometry.dispose(); particleGeometry.dispose(); paperChipGeometry.dispose(); void combatAudio.dispose();
  battleVFX.dispose();
  letterDropsView.dispose();
  chapterJourneyView.dispose();
  storyBook.dispose();storyCompanion.dispose();
  for (const material of Object.values(projectileMaterials)) material.dispose();
  for (const geometry of slashGeometries.values()) geometry.dispose();
  aimMarker.geometry.dispose(); aimMarker.material.dispose(); playerHalo.geometry.dispose(); playerHalo.material.dispose();
  renderer.dispose();
});
