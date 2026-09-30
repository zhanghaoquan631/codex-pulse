/**
 * Original, DOM-free adventure rules. Distances are metres; x/z is the ground plane.
 *
 * new AdventureGame({ levels, saveData })
 *   .state: JSON-safe runtime data. Render state.player and state.level's arrays.
 *   .step(seconds, {moveX,moveZ,aimX,aimY?,aimZ,attack,sprint,jump,interact,weapon,potion,consumable})
 *   .startLevel(id), .retryLevel(), .returnToCamp(), .interact(), .buy(id),
 *   .equip(id), .chooseAppearance(id), .usePotion(), .useConsumable(id,aim), .claimChapterLoadout({weaponId,supplyId,levelId?}),
 *   .exportSave(), .getObjectives(), .drainEvents()
 *
 * A level has id/title/theme, bounds:{minX,maxX,minZ,maxZ}, spawn:{x,z},
 * exit:{x,z,radius}, walls/doors:{id,x,z,w,d}, enemies:{id,type,x,z},
 * collectibles:{id,x,z}, switches:{id,x,z,doorIds:[]}, npcs:{id,type,x,z}.
 * Doors use open/locked/keyId/keyIds/switchId; switches permanently activate linked doors.
 * switch.requires:[switchId] enforces order; level.defendAfterEscort delays defence.
 * escort:{id,x,z,waypoints:[{x,z}],hp?,speed?,followRadius?} starts with E nearby.
 * goals:{kills:number|'all',collect:number|id[],switches:number|id[],
 *        doors:number|id[],escort:boolean,defendSeconds:number,boss:boolean}
 * Optional defendZone:{x,z,radius,blockingRadius} restricts defence accumulation.
 * All specified objectives must be met, followed by E at the exit, to finish.
 * Configuration can override enemy hp/damage/speed/xp/gold/attackRange/cooldown.
 * Start/economy/interaction methods return {ok:boolean, reason?:string}.
 * Supplying finite aimY enables 3D player aim/projectiles; omit it for legacy
 * horizontal combat. Runtime shots use absolute height above the local terrain.
 * Enemy y is relative to terrain; attackPhase/telegraph/charging/recovering expose
 * real action windows. level.weather advances only in playing steps. Its enemy
 * modifiers always derive from baseStats, preserving current HP percentage.
 * Thrown supplies are projectiles with kind:'throw'/itemId and absolute x/y/z;
 * finite fire areas live in state.hazards. V1 saves include optional inventories
 * and one-time chapter loadout receipts without changing existing progress IDs.
 */

import {validBossChoice,applyBossVariant,restoreBossVictories,echoBossKind} from './boss-variants.mjs';
import {BOSS_BY_ID,BOSS_BY_LEVEL} from './boss-catalog.mjs';
import { segmentBoxDistance, boxLocalPoint } from './camera-math.mjs';
import { groundHeight, segmentGroundDistance } from './landforms.mjs';
import { WEATHER, createWeatherState, chooseWeather, weatherDuration, weatherEnemyProfile } from './weather.mjs';
import {onMappedLand} from './map-geometry.mjs';
import {bodySpaceFree,groundRoute} from './combat-navigation.mjs';
import {createHunt,refreshHuntKeys,huntObjectives,pressureProfile} from './hunt-rules.mjs';
import {bossDefinition,bossPattern,combatTempo,patternDirection} from './demon-combat.mjs';
import {missingLetters,hasRequiredLetters,rollLetterDrop} from './letter-drops.mjs';
import {movePlayerHorizontal,stepPlayerVertical,checkedVault,vaultPosition,supportBelow,reinforcementProfile,pursuitMultiplier} from './traversal-physics.mjs';
import {BUILDING_BLOCK,previewBuildingBlock} from './construction-rules.mjs';
import {initializeStructures,damageStructure,stepStructures} from './structural-damage.mjs';
import {initializeEvacuation,stepEvacuation,damageCivilian,damageVehicle} from './civilian-evacuation.mjs';
import {initializeMerchants,stepMerchants,damageMerchant} from './merchant-rules.mjs';
import {normalizeGrowth,growthStatus,growthBonuses,MEMENTOS} from './traveller-growth.mjs';
import {initializeDistrictContent,updateDistrictStage,nearbyEvidence} from './district-content.mjs';
import {initializeChapterJourney,activeJourneyStep,interactChapterJourney,updateChapterJourney} from './chapter-journeys.mjs';
import {moveCivilian} from './civilian-navigation.mjs';
import {canAim,aimedSpread} from './optics.mjs';
import {initializeWanderingSurvivors,stepWanderingSurvivors} from './npc-awareness.mjs';
import {TACTICAL_WEAPONS,TACTICAL_CONSUMABLES,PAN_GUARD,smokeBlocksSight,resetEquipmentState,stepPanGuard,absorbPanProjectile,knifeDamageMultiplier} from './tactical-equipment.mjs';
import {stanceProfile,resetPlayerTactics,setPlayerStance,stepPlayerTactics,playerMuzzle,playerEye} from './player-tactics.mjs';
import {APPEARANCES,DEFAULT_APPEARANCE,normalizeAppearance} from './player-appearance.mjs';
import {nextAnimalEncounter} from './animal-encounters.mjs';
import {updateAnimalCombat,animalDamageReceived} from './animal-combat.mjs';
import {createAnimalDeck} from './animal-deck.mjs';
const battleSeconds=level=>Math.max(0,level.elapsed-(level.evacuation?10:0));
export {BUILDING_BLOCK} from './construction-rules.mjs';

export const SAVE_VERSION = 1;

export const WEAPONS = Object.freeze({
  ...TACTICAL_WEAPONS,
  rifle: Object.freeze({id:'rifle',name:'蓝墨步枪',kind:'ranged',damage:19,range:55,cooldown:.16,projectileSpeed:85,price:0,color:'#244b77'}),
  shotgun: Object.freeze({id:'shotgun',name:'纸纹霰弹枪',kind:'ranged',damage:13,pellets:6,spread:.13,range:20,cooldown:.82,projectileSpeed:60,price:180,color:'#8d5942'}),
  sword: Object.freeze({ id: 'sword', name: '青竹短剑', kind: 'melee', damage: 24, range: 2.35, cooldown: 0.43, arc: 1.35, price: 0, color: '#e9c679' }),
  spear: Object.freeze({ id: 'spear', name: '红缨长枪', kind: 'melee', damage: 39, range: 3.7, cooldown: 0.7, arc: 0.64, price: 110, color: '#e57762' }),
  crossbow: Object.freeze({ id: 'crossbow', name: '海风连弩', kind: 'ranged', damage: 29, range: 18, cooldown: 0.39, projectileSpeed: 24, price: 160, color: '#a1dccf' }),
  staff: Object.freeze({ id: 'staff', name: '星火法杖', kind: 'ranged', damage: 44, range: 15, cooldown: 0.8, projectileSpeed: 17, splash: 1.9, price: 260, color: '#c5adff' }),
});

export const CONSUMABLES = TACTICAL_CONSUMABLES;

export const SHOP_ITEMS = Object.freeze([
  ...Object.values(WEAPONS).filter(w => w.price > 0).map(w => Object.freeze({ ...w, kind: 'weapon', weaponId: w.id })),
  Object.freeze({ id: 'potion', name: '工夫茶补给', kind: 'potion', heal: 65, price: 25 }),
  ...Object.values(CONSUMABLES),
  Object.freeze({id:'block-pack',name:'纸砖方块 ×5',kind:'building',price:BUILDING_BLOCK.price,amount:BUILDING_BLOCK.packSize}),
]);

export const ENEMY_TYPES = Object.freeze({
  inkling: Object.freeze({ name: '墨灵', hp: 46, damage: 8, speed: 1.8, attackRange: 1.3, cooldown: 1.25, xp: 20, gold: 10, radius: 0.4, height: 1.06 }),
  shade: Object.freeze({ name: '纸影', hp: 34, damage: 7, speed: 2.65, attackRange: 1.2, cooldown: 0.95, xp: 24, gold: 12, radius: 0.34, height: 1.92 }),
  brute: Object.freeze({ name: '石甲妖', hp: 110, damage: 17, speed: 1.2, attackRange: 1.8, cooldown: 1.75, xp: 40, gold: 20, radius: 0.65, height: 2.16 }),
  archer: Object.freeze({ name: '灯火弓手', hp: 45, damage: 10, speed: 1.55, attackRange: 12, preferredRange: 7, cooldown: 2.1, projectileSpeed: 9, xp: 30, gold: 15, radius: 0.4, height: 1.77 }),
  boss: Object.freeze({ name: '墨潮守将', hp: 300, damage: 22, speed: 1.3, attackRange: 2.1, cooldown: 1.7, xp: 130, gold: 75, radius: 0.9, height: 3.3 }),
  doodler: Object.freeze({ name: '涂鸦墨兵', behavior: 'pencil', hp: 40, damage: 6, speed: 1.4, attackRange: 9, preferredRange: 5.8, cooldown: 1.65, telegraphDuration: .75, projectileSpeed: 5.8, xp: 20, gold: 10, radius: .38, height: 1.8 }),
  lantern: Object.freeze({ name: '灯笼精', behavior: 'lantern', hp: 40, damage: 8, speed: 1.25, attackRange: 9.5, preferredRange: 5.5, cooldown: 1.8, telegraphDuration: .8, projectileSpeed: 4.8, hoverHeight: .45, xp: 28, gold: 14, radius: .38, height: 1.4 }),
  crab: Object.freeze({ name: '寄甲蟹', behavior: 'crab', hp: 90, damage: 14, speed: 1.25, attackRange: 5.5, cooldown: 1.5, telegraphDuration: .8, chargeSpeed: 10, chargeDuration: .55, recoveryDuration: 1.15, xp: 38, gold: 19, radius: .68, height: 1.1 }),
  wraith: Object.freeze({name:'纸面小恶灵',behavior:'lantern',weatherType:'shade',hp:52,damage:7,speed:1.6,attackRange:11,preferredRange:6,cooldown:2,telegraphDuration:.95,projectileSpeed:5,hoverHeight:.3,xp:30,gold:15,radius:.38,height:1.65}),
  imp: Object.freeze({name:'墨角小恶魔',behavior:'pencil',weatherType:'doodler',hp:62,damage:9,speed:1.5,attackRange:10,preferredRange:5.5,cooldown:1.9,telegraphDuration:.85,projectileSpeed:6,xp:32,gold:16,radius:.42,height:1.55}),
});

export const DEFAULT_LEVELS = [
  {
    id: 'paifang-lane', title: '牌坊街 · 寻印开门', theme: 'town',
    bounds: { minX: -12, maxX: 12, minZ: -14, maxZ: 14 }, spawn: { x: 0, z: 10 }, exit: { x: 0, z: -11, radius: 2 },
    walls: [{ id: 'west-wall', x: -7, z: -4, w: 10, d: 1 }, { id: 'east-wall', x: 7, z: -4, w: 10, d: 1 }],
    doors: [{ id: 'lantern-gate', x: 0, z: -4, w: 4, d: 0.7, locked: true, switchId: 'lantern-switch' }],
    switches: [{ id: 'lantern-switch', x: -8, z: 2, doorIds: ['lantern-gate'] }],
    collectibles: [{ id: 'seal-one', x: 7, z: 5 }, { id: 'seal-two', x: -6, z: -9 }],
    enemies: [{ id: 'ink-1', type: 'inkling', x: -4, z: 5 }, { id: 'ink-2', type: 'inkling', x: 5, z: 0 }, { id: 'shade-1', type: 'shade', x: 3, z: -9 }],
    npcs: [{ id: 'merchant', type: 'merchant', name: '茶铺掌柜', x: 3, z: 10 }],
    goals: { kills: 'all', collect: ['seal-one', 'seal-two'], switches: ['lantern-switch'], doors: ['lantern-gate'] },
    reward: { gold: 75, xp: 55 },
  },
  {
    id: 'harbor-escort', title: '埠头 · 护送茶车', theme: 'harbor',
    bounds: { minX: -14, maxX: 14, minZ: -16, maxZ: 16 }, spawn: { x: -8, z: 12 }, exit: { x: 8, z: -12, radius: 2.5 },
    walls: [{ id: 'warehouse', x: -6, z: -3, w: 6, d: 8 }, { id: 'crate-stack', x: 7, z: 6, w: 5, d: 3 }],
    doors: [], switches: [], collectibles: [], npcs: [{ id: 'merchant', type: 'merchant', x: -11, z: 12 }],
    escort: { id: 'tea-cart', name: '茶商货车', x: -6, z: 11, hp: 150, speed: 1.6, waypoints: [{ x: 0, z: 8 }, { x: 0, z: -9 }, { x: 8, z: -12 }] },
    enemies: [{ id: 'dock-shade', type: 'shade', x: 3, z: 0 }, { id: 'dock-brute', type: 'brute', x: 4, z: -5 }, { id: 'dock-archer', type: 'archer', x: 10, z: -10 }],
    goals: { kills: 'all', escort: true }, reward: { gold: 110, xp: 80 },
  },
  {
    id: 'ancient-tower', title: '古塔 · 守灯破阵', theme: 'temple',
    bounds: { minX: -15, maxX: 15, minZ: -15, maxZ: 15 }, spawn: { x: 0, z: 11 }, exit: { x: 0, z: -12, radius: 2 },
    walls: [{ id: 'pillar-west', x: -6, z: 0, w: 2, d: 2 }, { id: 'pillar-east', x: 6, z: 0, w: 2, d: 2 }],
    doors: [], switches: [], collectibles: [], npcs: [], defendZone: { x: 0, z: 3, radius: 5, blockingRadius: 1.6 },
    enemies: [{ id: 'tower-boss', type: 'boss', x: 0, z: -7 }, { id: 'tower-archer', type: 'archer', x: -9, z: -4 }, { id: 'tower-shade', type: 'shade', x: 9, z: -2 }],
    goals: { boss: true, defendSeconds: 16 }, reward: { gold: 160, xp: 120 },
  },
];

const clone = value => JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const integer = (value, fallback, min, max) => clamp(Math.floor(finite(value, fallback)), min, max);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const normalize = (x, z) => { const length = Math.hypot(x, z); return length > 0.00001 ? { x: x / length, z: z / length } : { x: 0, z: -1 }; };
const nextXP = level => 70 + (level - 1) * 35;
const playerMaxHP = level => 100 + (level - 1) * 12;
const validIDs = value => Array.isArray(value) ? [...new Set(value.filter(id => typeof id === 'string'))] : [];

import {STORY_CHAPTERS} from './story-content.mjs';
import {normalizeStory,recordStorySolve,storyStatus,assembleStoryAct,setStoryCompanion} from './story-state.mjs';

function freshSave() {
  return { version: SAVE_VERSION, player: { appearanceId: DEFAULT_APPEARANCE, level: 1, xp: 0, gold: 70, weaponId: 'rifle', weapons: ['sword','rifle'], potions: 2, hp: 100, consumables:{bomb:1,medkit:1,molotov:1,smoke:1},buildingBlocks:0 }, progress: { completedLevelIds: [], rewardedLevelIds: [],loadoutClaimedLevelIds:[],journeyRewardIds:[],evidenceRewardIds:[],story:normalizeStory(null) } };
}

/** Invalid JSON, incompatible versions and malformed essentials recover safely. */
export function parseSave(raw, levels = DEFAULT_LEVELS) {
  if (raw === undefined || raw === null || raw === '') return { data: freshSave(), recovered: false, reason: null };
  try {
    const candidate = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!candidate || candidate.version !== SAVE_VERSION || !candidate.player || !candidate.progress || Array.isArray(candidate.player)) throw new Error('存档版本或结构不兼容');
    const p = candidate.player;
    for (const key of ['level', 'xp', 'gold', 'potions']) if (typeof p[key] !== 'number' || !Number.isFinite(p[key]) || p[key] < 0) throw new Error('存档数值损坏');
    const level = integer(p.level, 1, 1, 50);
    const weapons = validIDs(p.weapons).filter(id => Object.hasOwn(WEAPONS,id));
    if (!weapons.includes('sword')) weapons.unshift('sword');
    const rifleGift=!weapons.includes('rifle');if(rifleGift)weapons.push('rifle');
    const known = new Set(levels.map(l => l.id));
    const completed = validIDs(candidate.progress.completedLevelIds).filter(id => known.has(id));
    // Progress is sequential; a later completion without its predecessor is corrupt.
    const contiguous = [];
    for (const l of levels) { if (!completed.includes(l.id)) break; contiguous.push(l.id); }
    const rewarded = validIDs(candidate.progress.rewardedLevelIds).filter(id => known.has(id));
    return {
      recovered: false, reason: null,
      data: { version: SAVE_VERSION, player: { appearanceId: normalizeAppearance(p.appearanceId), level, xp: integer(p.xp, 0, 0, nextXP(level) - 1), gold: integer(p.gold, 70, 0, 10000000), potions: integer(p.potions, 2, 0, 99), hp: clamp(finite(p.hp, playerMaxHP(level)), 1, playerMaxHP(level)), weaponId: rifleGift ? 'rifle' : weapons.includes(p.weaponId) ? p.weaponId : 'rifle', weapons, consumables:Object.fromEntries(Object.keys(CONSUMABLES).map(id=>[id,integer(p.consumables?.[id],p.consumables===undefined&&id!=='smoke'?1:0,0,99)])),buildingBlocks:integer(p.buildingBlocks,0,0,999),growth:normalizeGrowth(p.growth,level,contiguous) }, progress: {story:normalizeStory(candidate.progress.story,contiguous),journeyRewardIds:validIDs(candidate.progress.journeyRewardIds).filter(id=>known.has(id)),evidenceRewardIds:validIDs(candidate.progress.evidenceRewardIds).filter(id=>[...known].some(k=>id.startsWith(k+'-evidence-'))),defeatedBossKinds:restoreBossVictories(candidate.progress,contiguous), completedLevelIds: contiguous, rewardedLevelIds: [...new Set([...contiguous, ...rewarded])],loadoutClaimedLevelIds:validIDs(candidate.progress.loadoutClaimedLevelIds).filter(id=>contiguous.includes(id)) } },
    };
  } catch (error) {
    return { data: freshSave(), recovered: true, reason: error.message || '存档读取失败' };
  }
}

function rectangle(raw, index, prefix) {
  const defaultHeight = prefix === 'door' ? (raw.style === 'portcullis' ? 3.35 : 2.8) : 3.5;
  return { ...raw, id: raw.id || `${prefix}-${index}`, x: finite(raw.x), z: finite(raw.z), rotation:finite(raw.rotation), w: Math.max(0.05, finite(raw.w, finite(raw.width, 1))), d: Math.max(0.05, finite(raw.d, finite(raw.depth, 1))), baseY: finite(raw.baseY), height: Math.max(0.05, finite(raw.height, defaultHeight)) };
}

function normalizeLevel(raw, index) {
  const result = clone(raw);
  result.id = raw.id || `level-${index + 1}`;
  result.title = raw.title || result.id;
  const b = raw.bounds || {};
  result.bounds = { minX: finite(b.minX, -20), maxX: finite(b.maxX, 20), minZ: finite(b.minZ, -20), maxZ: finite(b.maxZ, 20) };
  if (result.bounds.maxX <= result.bounds.minX || result.bounds.maxZ <= result.bounds.minZ) throw new Error(`Invalid bounds: ${result.id}`);
  result.spawn = { x: finite(raw.spawn?.x), z: finite(raw.spawn?.z, 8) };
  result.exit = { ...raw.exit, x: finite(raw.exit?.x), z: finite(raw.exit?.z, -8), radius: finite(raw.exit?.radius, 2.3) };
  result.walls = (raw.walls || []).map((w, i) => rectangle(w, i, 'wall'));
  result.doors = (raw.doors || []).map((d, i) => ({ ...rectangle(d, i, 'door'), open: !!d.open, locked: d.locked === undefined ? !!(d.keyId || d.keyIds?.length || d.switchId) : !!d.locked }));
  // Runtime blockers carry absolute bases. Do not add the terrain twice when
  // a normalized chapter is cloned for a retry.
  for (const box of [...result.walls, ...result.doors]) {
    box.groundOffset = finite(box.groundOffset, box.absoluteBaseY ? finite(box.baseY)-groundHeight(result,box.x,box.z) : finite(box.baseY));
    box.baseY = groundHeight(result, box.x, box.z) + box.groundOffset;
  }
  result.switches = (raw.switches || []).map((s, i) => ({ ...s, id: s.id || `switch-${i}`, x: finite(s.x), z: finite(s.z), active: !!s.active }));
  result.collectibles = (raw.collectibles || []).map((c, i) => ({ ...c, id: c.id || `collect-${i}`, x: finite(c.x), z: finite(c.z), collected: false }));
  result.npcs = (raw.npcs || []).map((n, i) => ({ ...n, id: n.id || `npc-${i}`, type: n.type || 'merchant', x: finite(n.x), z: finite(n.z) }));
  const aliases = { grunt: 'inkling', melee: 'inkling', fast: 'shade', tank: 'brute', ranged: 'archer' };
  result.enemies = (raw.enemies || []).map((e, i) => {
    const type = Object.hasOwn(ENEMY_TYPES,e.type) ? e.type : (aliases[e.type] || 'inkling');
    const boss=type==='boss'?bossDefinition(e.bossKind,index):null;
    const merged = { ...ENEMY_TYPES[type], ...(boss?{cooldown:boss.cooldown,telegraphDuration:boss.telegraphDuration,projectileSpeed:boss.projectileSpeed,attackRange:boss.attackRange,preferredRange:4}:{}), ...e };
    const hp = Math.max(1, finite(e.maxHp, finite(e.hp, ENEMY_TYPES[type].hp)));
    const rank = integer(e.rank,1,1,3), difficulty = raw.difficulty || {};
    const multipliers = {hp:finite(difficulty.hp,1)*(1+(rank-1)*.18),damage:finite(difficulty.damage,1)*(1+(rank-1)*.08),xp:1+(rank-1)*.12,gold:1+(rank-1)*.1};
    const baseStats = Object.fromEntries(['damage','speed','cooldown','xp','gold','telegraphDuration','chargeSpeed','projectileSpeed'].map(key => [key,finite(e.baseStats?.[key],finite(merged[key])*(multipliers[key]||1))]));
    baseStats.hp = Math.max(1,finite(e.baseStats?.hp,hp*multipliers.hp));
    return { ...merged, id: e.id || `enemy-${i}`, type, x: finite(e.x), y: Math.max(0, finite(merged.hoverHeight)), z: finite(e.z), hp, maxHp: hp, alive: true, attackCooldown: 0.65 + (i % 5) * 0.16, burstCooldown: 3, phase: 1, facingX: 0, facingZ: 1, hitFlash: 0,
      ...(boss?{bossKind:boss.id,attackStyle:boss.attackStyle,bossCycle:0,bossPlan:null,bossShotCursor:0,bossAttackTime:0}:{}),
      baseStats, rank, active: !e.encounterId, level: index+rank, weatherTrait: '', attackPhase: 'idle', telegraph: 0, charging: false, recovering: 0, chargeRemaining: 0, chargeHit: false, attackDirX: 0, attackDirZ: 1, aimTarget: null, strafeSign: i % 2 ? 1 : -1 };
  });
  result.encounters = (raw.encounters || []).map(e => ({...e,status:'waiting',remaining:0,rewarded:false}));
  for (const enemy of result.enemies) if (enemy.encounterId && !result.encounters.some(e=>e.id===enemy.encounterId)) throw new Error(`Missing encounter: ${enemy.encounterId}`);
  if(raw.hunt){
    result.hunt=createHunt(raw.hunt);result.encounters=[];
    for(const e of result.enemies){e.active=false;e.encounterId=null;e.spawned=false;}
    const gate=result.doors.find(d=>d.id===result.hunt.gateId);
    if(gate){gate.open=false;gate.locked=true;gate.huntSeal=true;gate.keyIds=[];gate.keyId=null;gate.switchId=null;}
    // The geographic scenes may retain alternative mission definitions for
    // authors. This mode has one main route: cipher, quota, room, boss.
    result.escort=null;result.defendZone=null;result.goals={boss:true};
  }
  if (raw.escort) {
    const escort = raw.escort;
    result.escort = { ...escort, id: escort.id || 'escort', x: finite(escort.x), z: finite(escort.z), hp: finite(escort.hp, 150), maxHp: finite(escort.hp, 150), speed: finite(escort.speed, 1.6), radius: finite(escort.radius, 0.65), followRadius: finite(escort.followRadius, 8), waypointIndex: 0, waypoints: clone(escort.waypoints || []), started: !!escort.started, reached: false, alive: true };
  }
  result.goals = clone(raw.goals || { kills: 'all' });
  result.elapsed = 0;
  result.combat = {elapsed:0,active:false,...combatTempo(0,index+1)};
  result.defendedSeconds = 0;
  result.kills = 0;
  result.objectiveStatus = [];
  result.readyToExit = false;
  initializeStructures(result,index);
  return result;
}

function blockers(level) { return [...level.walls, ...level.doors.filter(d => !d.open)]; }
function collidesCircle(x, z, radius, box) {
  const p=boxLocalPoint({x,z},box);
  const cx = clamp(p.x, -box.w / 2, box.w / 2);
  const cz = clamp(p.z, -box.d / 2, box.d / 2);
  return (p.x - cx) ** 2 + (p.z - cz) ** 2 < radius * radius - 0.000001;
}

/** Segment/oriented rectangle intersection, including collision at t=0. */
function segmentBox(ax, az, bx, bz, box, expand = 0) {
  const pa=boxLocalPoint({x:ax,z:az},box),pb=boxLocalPoint({x:bx,z:bz},box);
  let near = 0, far = 1;
  for (const [a, b, min, max] of [[pa.x,pb.x,-box.w/2-expand,box.w/2+expand],[pa.z,pb.z,-box.d/2-expand,box.d/2+expand]]) {
    const delta = b - a;
    if (Math.abs(delta) < 0.000001) { if (a < min || a > max) return null; continue; }
    let t1 = (min - a) / delta, t2 = (max - a) / delta;
    if (t1 > t2) [t1, t2] = [t2, t1];
    near = Math.max(near, t1); far = Math.min(far, t2);
    if (near > far) return null;
  }
  return near;
}

function segmentCircle(ax, az, bx, bz, target, radius) {
  const dx = bx - ax, dz = bz - az, fx = ax - target.x, fz = az - target.z;
  const c = fx * fx + fz * fz - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dz * dz;
  if (a < 1e-10) return null;
  const b = 2 * (fx * dx + fz * dz), disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

function hasSight(level, a, b) {
  return hasSight3D(level,
    {x:a.x,y:hitBodyBase(level,a)+bodyHeight(a)*.5,z:a.z},
    {x:b.x,y:hitBodyBase(level,b)+bodyHeight(b)*.5,z:b.z});
}

const bodyHeight = entity => Math.max(0.05, finite(entity.height, ENEMY_TYPES[entity.type]?.height || 1.7));
const bodyBase = (level, entity) => groundHeight(level, entity.x, entity.z) + finite(entity.y);
// The drawn leap raises the vulnerable body, not its floor-support anchor.
// Keep bodyBase for navigation/support and use hitBodyBase for combat only.
const hitBodyBase = (level,entity) => bodyBase(level,entity)+(entity.animalId?Math.max(0,finite(entity.animalLift)):0);
const aimPoint = (level,entity) => entity.stance&&Math.abs(finite(entity.lean))>.03?playerEye(level,entity):{x:entity.x,y:hitBodyBase(level,entity)+bodyHeight(entity)*.5,z:entity.z};
const collectibleBase = (level,entity) => entity.absoluteY===true ? finite(entity.y) : groundHeight(level,entity.x,entity.z);
const worldBody = (level, entity) => ({ ...entity, y: hitBodyBase(level, entity) });

/** Swept projectile against the target's vertical body cylinder, t in [0,1]. */
function segmentBody3D(origin, end, entity, padding) {
  const dx = end.x-origin.x, dy = end.y-origin.y, dz = end.z-origin.z;
  const fx = origin.x-entity.x, fz = origin.z-entity.z;
  const radius = finite(entity.radius,0.4)+padding;
  let near = 0, far = 1;
  const a = dx*dx+dz*dz, b = 2*(fx*dx+fz*dz), c = fx*fx+fz*fz-radius*radius;
  if (a < 1e-12) { if (c > 0) return null; }
  else {
    const discriminant = b*b-4*a*c;
    if (discriminant < 0) return null;
    const root = Math.sqrt(discriminant);
    near = Math.max(near,(-b-root)/(2*a)); far = Math.min(far,(-b+root)/(2*a));
  }
  const bottom = finite(entity.y)-padding, top = finite(entity.y)+bodyHeight(entity)+padding;
  if (Math.abs(dy) < 1e-12) { if (origin.y < bottom || origin.y > top) return null; }
  else {
    const a = (bottom-origin.y)/dy, b = (top-origin.y)/dy;
    near = Math.max(near,Math.min(a,b)); far = Math.min(far,Math.max(a,b));
  }
  return near <= far ? near : null;
}

function closestBodyPoint(origin, entity) {
  const dx = origin.x-entity.x, dz = origin.z-entity.z, d = Math.hypot(dx,dz);
  const scale = d > 0 ? Math.min(1,finite(entity.radius,0.4)/d) : 0;
  return {x:entity.x+dx*scale,y:clamp(origin.y,finite(entity.y),finite(entity.y)+bodyHeight(entity)),z:entity.z+dz*scale};
}

function hasSight3D(level, origin, target) {
  const direction = {x:target.x-origin.x,y:target.y-origin.y,z:target.z-origin.z};
  const length = Math.hypot(direction.x,direction.y,direction.z);
  if (length < 1e-8) return true;
  const ground = segmentGroundDistance(level, origin, direction, length, 0.02);
  if (ground !== null && ground < length - 1e-6) return false;
  return !blockers(level).some(box => {
    const hit = segmentBoxDistance(origin,direction,box,length);
    return hit !== null && hit < length-1e-6;
  });
}

export class AdventureGame {
  constructor({ levels = DEFAULT_LEVELS, saveData = null, weatherRandom = Math.random, huntRandom = Math.random,
    animalDefinitions = [], animalRandom = Math.random, previousAnimalRoster = [], animalDeckState = null } = {}) {
    if (!Array.isArray(levels) || !levels.length) throw new Error('At least one level is required');
    this.levels = levels.map((l, i) => normalizeLevel(l, i));
    if (new Set(this.levels.map(l => l.id)).size !== this.levels.length) throw new Error('Level ids must be unique');
    const save = parseSave(saveData, this.levels);
    this._serial = 0;
    this._previousInput = {};
    this._lastChipLayouts = new Map();
    this._weatherRandom = typeof weatherRandom === 'function' ? weatherRandom : Math.random;
    this._huntRandom = typeof huntRandom === 'function' ? huntRandom : Math.random;
    this._animalDefinitions = (Array.isArray(animalDefinitions) ? animalDefinitions : []).filter(a => a && typeof a.id === 'string' && a.id);
    this._animalRandom = typeof animalRandom === 'function' ? animalRandom : Math.random;
    this._previousAnimalRoster = Array.isArray(previousAnimalRoster) ? [...previousAnimalRoster] : [];
    this._animalDeck=createAnimalDeck(this._animalDefinitions,{random:this._animalRandom,state:animalDeckState});
    this.state = {
      status: 'camp',
      player: { ...save.data.player, maxHp: playerMaxHP(save.data.player.level), xpNext: nextXP(save.data.player.level), x: 0, y: 0, z: 0, vy: 0, radius: 0.38, stamina: 100, maxStamina: 100, facingX: 0, facingZ: -1, aimY: null, attackCooldown: 0, throwCooldown:0,invuln: 0, grounded: true, moving: false },
      progress: {journeyRewardIds:[],evidenceRewardIds:[], ...save.data.progress,defeatedBossKinds:restoreBossVictories(save.data.progress,save.data.progress.completedLevelIds), unlockedLevelIds: [] },
      level: null, events: [], effects: [], projectiles: [], hazards:[],shopOpen: false,
      interaction: null, hint: '', saveRecovered: save.recovered, saveRecoveryReason: save.reason,
    };
    this.state.player.growth=normalizeGrowth(save.data.player.growth,this.state.player.level,this.state.progress.completedLevelIds);
    resetPlayerTactics(this.state.player);resetEquipmentState(this.state.player);
    this._updateUnlocks();
    if (save.recovered) this._event('notice', '损坏或旧版存档已恢复为新旅程。');
  }

  _event(type, message, extra = {}) {
    this.state.events.push({ id: ++this._serial, type, message, text: message, at: this.state.level?.elapsed || 0, ...extra });
    if (this.state.events.length > 60) this.state.events.splice(0, this.state.events.length - 60);
  }

  drainEvents() { return this.state.events.splice(0); }

  _updateUnlocks() {
    const completed = this.state.progress.completedLevelIds;
    this.state.progress.unlockedLevelIds = this.levels.filter((l, i) => i === 0 || this.levels.slice(0, i).every(previous => completed.includes(previous.id))).map(l => l.id);
  }

  startLevel(id = this.state.progress.unlockedLevelIds.at(-1), {bossKind=null}={}) {
    const definition = this.levels.find(level => level.id === id);
    if (!definition) return { ok: false, reason: '关卡不存在' };
    if (!this.state.progress.unlockedLevelIds.includes(id)) return { ok: false, reason: '请先完成前一关' };
    if(!validBossChoice(id,bossKind))return {ok:false,reason:'这位首领不属于当前关卡'};
    const selectedDefinition=bossKind?clone(definition):definition;
    if(bossKind)applyBossVariant(selectedDefinition.enemies.find(e=>e.id===selectedDefinition.hunt?.bossId)||selectedDefinition.enemies.find(e=>e.type==='boss'),bossKind);
    this.state.level = normalizeLevel(selectedDefinition, this.levels.indexOf(definition));this.state.level.chosenBossKind=bossKind;
    const hunt=this.state.level.hunt;
    if(hunt && this._animalDefinitions.length){
      const rosterIds=this._animalDeck.preview(6);
      this._previousAnimalRoster=[...rosterIds];
      this.state.level.animalEncounter={enabled:true,rosterIds,cursor:0,spawned:0,seenIds:[],...this._animalDeck.stats()};
      this._event('animal-roster','未出现过的动物正从全图鉴中依次来袭',{rosterIds:[...rosterIds]});
    }
    initializeEvacuation(this.state.level,this._huntRandom);
    this._randomizeHuntChips();
    initializeDistrictContent(this.state.level);
    for(const e of this.state.level.expedition?.evidence||[])e.rewardClaimed=this.state.progress.evidenceRewardIds.includes(e.id);
    initializeMerchants(this.state.level,this._huntRandom);
    initializeWanderingSurvivors(this.state.level,this._huntRandom);
    initializeChapterJourney(this.state.level);
    if(hunt)this.state.level.hunt.waveRemaining=10;
    if(hunt){hunt.echoChecked=false;hunt.echoPending=null;hunt.echoSpawned=false;}
    if(hunt?.riddles?.length){
      hunt.riddle=clone(hunt.riddles[Math.min(hunt.riddles.length-1,Math.floor(this._huntRandom()*hunt.riddles.length))]);
      hunt.letterBag=[...hunt.riddle.answer];
      for(let i=hunt.letterBag.length-1;i>0;i--){const j=Math.min(i,Math.floor(this._huntRandom()*(i+1)));[hunt.letterBag[i],hunt.letterBag[j]]=[hunt.letterBag[j],hunt.letterBag[i]];}
    }
    this.state.level.weather = createWeatherState(definition.theme,this._weatherRandom,'clear');
    this._applyWeather();
    this.state.status = 'playing';
    this.state.deathReason=null;
    this.state.shopOpen = false;
    this.state.projectiles = [];
    this.state.effects = [];
    this.state.hazards = [];
    this._previousInput = {};
    Object.assign(this.state.player, { ...definition.spawn, y: 0, vy: 0, hp: this.state.player.maxHp, stamina: 100, invuln: 1, grounded: true, moving: false, attackCooldown: 0, throwCooldown:0, animalSlowed:0, facingX: 0, facingZ: -1, aimY: null, vault:null, supportId:'ground' });
    resetPlayerTactics(this.state.player);resetEquipmentState(this.state.player);
    this._move(this.state.player, 0, 0);
    this._updateEncounters(0);
    this._updateLetterState(false);
    this._objectives();
    this._updateInteraction();
    this._event('level-start', `进入 ${definition.title}`, { levelId: id });
    return { ok: true };
  }

  _applyWeather() {
    const level = this.state.level, chapter = this.levels.findIndex(l=>l.id===level.id)+1;
    for (const enemy of level.enemies) {
      const profile = weatherEnemyProfile(enemy.weatherType||enemy.type,level.weather.id,chapter+enemy.rank-1), base = enemy.baseStats;
      const ratio = clamp(enemy.hp/Math.max(1,enemy.maxHp),0,1);
      enemy.level = profile.level; enemy.weatherTrait = profile.weatherTrait;
      const pressure=pressureProfile(level.hunt?.pressure||0),waveTier=enemy.waveTier||0;
      enemy.maxHp = Math.max(1,Math.round(base.hp*profile.hpMultiplier*pressure.hp*(1+waveTier*.12)));
      enemy.hp = enemy.alive ? enemy.maxHp*ratio : 0;
      enemy.damage = base.damage*profile.damageMultiplier*pressure.damage*(1+waveTier*.06);
      enemy.speed = base.speed*profile.speedMultiplier*pressure.speed;
      enemy.chargeSpeed = base.chargeSpeed*profile.speedMultiplier*pressure.speed;
      enemy.combatBase = {cooldown:base.cooldown*profile.cooldownMultiplier*pressure.cooldown,projectileSpeed:base.projectileSpeed,telegraphDuration:base.telegraphDuration*profile.telegraphMultiplier,movementSpeed:enemy.speed,chargeSpeed:enemy.chargeSpeed};
      enemy.xp = Math.max(0,Math.round(base.xp*profile.xpMultiplier));
      enemy.gold = Math.max(0,Math.round(base.gold*profile.goldMultiplier));
      this._applyEnemyTempo(enemy);
    }
    this._exposeCombatTempo();
  }

  _randomizeHuntChips(){
    const level=this.state.level,h=level.hunt;if(!h||!level.traversal?.chipSpawns?.length)return;
    const clues=h.clueIds.map(id=>level.collectibles.find(c=>c.id===id)).filter(Boolean);
    const unresolvedStreetRoutes=new Set(['guangji-west-manifest','guangji-floating-rope-note','chen-clue-2']);
    // Replace excluded historical markers with locations on the same proven
    // spawn-connected street graph used by evacuees. Keep clue IDs unchanged.
    const replacements=[];
    for(const clue of clues.filter(c=>unresolvedStreetRoutes.has(c.id))){
      const pool=(level.evacuation?.streetPoints||[]).filter(q=>replacements.every(r=>distance(q,r)>3)&&distance(q,level.spawn)>3);
      const q=pool.reduce((best,p)=>!best||distance(p,clue)<distance(best,clue)?p:best,null);
      if(q)replacements.push({...q,y:groundHeight(level,q.x,q.z),street:true,upstairs:false,sourceClueId:clue.id});
    }
    level.streetChipCandidates=replacements;
    const candidates=[...replacements,...level.traversal.chipSpawns.map(q=>({...q,upstairs:q.y>groundHeight(level,q.x,q.z)+1})),...clues.filter(c=>!unresolvedStreetRoutes.has(c.id)).map(c=>({x:c.x,y:collectibleBase(level,c),z:c.z,street:true,upstairs:false}))];
    const seen=new Set(),pool=candidates.filter(q=>{
      const key=`${q.x},${q.y},${q.z}`;
      if(seen.has(key)||![q.x,q.y,q.z].every(Number.isFinite))return false;
      const support=supportBelow(level,q.x,q.z,q.y+.03,.38);
      if(!support||Math.abs(support.y-q.y)>.04||!bodySpaceFree(level,{x:q.x,z:q.z,absoluteY:q.y},.42,1.7))return false;
      if(q.street){
        // These are the chapter's original, route-verified street markers.
        // Recheck their current doorway/apron, not the expensive whole-map
        // navigation graph every time the player starts or retries a chapter.
        const exitClear=[0,1,2,3,4,5,6,7].some(i=>{
          const x=q.x+Math.cos(i*Math.PI/4)*.85,z=q.z+Math.sin(i*Math.PI/4)*.85,y=groundHeight(level,x,z);
          return bodySpaceFree(level,{x,z,absoluteY:y},.42,1.7)&&hasSight3D(level,{x:q.x,y:q.y+.9,z:q.z},{x,y:y+.9,z});
        });
        if(!exitClear)return false;
      }
      seen.add(key);return true;
    }).map(q=>({...q}));
    if(pool.length<clues.length||!pool.some(q=>q.upstairs))return;
    for(let i=pool.length-1;i>0;i--){const j=clamp(Math.floor(this._huntRandom()*(i+1)),0,i);[pool[i],pool[j]]=[pool[j],pool[i]];}
    const includeUpstairs=()=>{if(!pool.slice(0,clues.length).some(q=>q.upstairs)){const i=pool.findIndex(q=>q.upstairs);[pool[0],pool[i]]=[pool[i],pool[0]];}};
    includeUpstairs();
    const signature=()=>JSON.stringify(pool.slice(0,clues.length).map(q=>[q.x,q.y,q.z]));
    if(pool.length>1&&signature()===this._lastChipLayouts.get(level.id)){pool.push(pool.shift());includeUpstairs();}
    this._lastChipLayouts.set(level.id,signature());
    for(let i=0;i<clues.length;i++)Object.assign(clues[i],{x:pool[i].x,y:pool[i].y,z:pool[i].z,absoluteY:true,randomized:true});
    h.randomChipPositions=true;
  }

  _applyEnemyTempo(enemy){
    const tempo=this.state.level.combat,base=enemy.combatBase;if(!base)return;
    const ranged=enemy.type==='boss'||base.projectileSpeed>0,rate=ranged?tempo.fireRateMultiplier:1,previous=enemy.cooldown;
    enemy.cooldown=ranged?Math.max(.32,base.cooldown/rate):base.cooldown;
    enemy.projectileSpeed=base.projectileSpeed>0?Math.min(14,base.projectileSpeed*tempo.projectileSpeedMultiplier):0;
    enemy.telegraphDuration=base.telegraphDuration>0?Math.max(.35,base.telegraphDuration/(ranged?Math.sqrt(rate):1)):0;
    enemy.fireRateMultiplier=rate;enemy.projectileSpeedMultiplier=ranged?tempo.projectileSpeedMultiplier:1;
    enemy.movementMultiplier=pursuitMultiplier(battleSeconds(this.state.level));
    enemy.speed=base.movementSpeed*enemy.movementMultiplier;
    enemy.chargeSpeed=finite(base.chargeSpeed)*enemy.movementMultiplier;
    enemy.movementBoostTier=Math.floor((battleSeconds(this.state.level)+1e-8)/3);
    if(previous>0&&enemy.attackCooldown>0)enemy.attackCooldown=enemy.attackCooldown/previous*enemy.cooldown;
  }

  _exposeCombatTempo(){
    const level=this.state.level,c=level.combat;
    c.movementBoostTier=Math.floor((battleSeconds(level)+1e-8)/3);c.nextMovementBoostIn=Math.max(0,(c.movementBoostTier+1)*3-battleSeconds(level));
    if(level.hunt)Object.assign(level.hunt,{combatSeconds:c.elapsed,fireRateMultiplier:c.fireRateMultiplier,projectileSpeedMultiplier:c.projectileSpeedMultiplier,movementMultiplier:pursuitMultiplier(battleSeconds(level))});
  }

  _updateCombatTempo(dt){
    const level=this.state.level,c=level.combat,p=this.state.player;
    c.active=level.enemies.some(e=>e.alive&&e.active!==false&&distance(e,p)<=Math.min(60,finite(e.detectionRange,35)))||this.state.projectiles.some(s=>s.owner==='enemy');
    if(c.active)c.elapsed+=dt;
    Object.assign(c,combatTempo(c.elapsed,this.levels.findIndex(l=>l.id===level.id)+1));
    for(const enemy of level.enemies)if(enemy.alive)this._applyEnemyTempo(enemy);
    this._exposeCombatTempo();
  }

  _huntSpawnPoint(enemy,index){
    const level=this.state.level,p=this.state.player,b=level.bounds,r=enemy.radius||.5;
    const free=q=>bodySpaceFree(level,q,r+.12,enemy.height||1.8)&&!level.enemies.some(e=>e.active&&e.alive&&distance(e,q)<r+e.radius+.65&&Math.abs(bodyBase(level,e)-(q.absoluteY??groundHeight(level,q.x,q.z)))<2);
    const supported=s=>level.walls.some(box=>{
      if(box.kind==='invisible'||!Number.isFinite(s.y))return false;
      if(s.supportId&&box.id!==s.supportId)return false;
      const top=box.baseY+box.height,q=boxLocalPoint(s,box);
      return s.y>=top-.03&&s.y<=top+.45&&Math.abs(q.x)+r<=box.w/2&&Math.abs(q.z)+r<=box.d/2;
    });
    const eligible=(level.spawnSites||[]).filter(s=>distance(s,p)>8&&distance(s,p)<40&&s.kind==='roof'&&supported(s));
    // Upper-floor shooters are chosen from real rendered supports, never from
    // arbitrary air coordinates. Their shots use full 3D collision and aim.
    if(eligible.length&&['pencil','lantern'].includes(enemy.behavior)&&this._huntRandom()<.32){
      const offset=Math.floor(this._huntRandom()*eligible.length);
      for(let i=0;i<eligible.length;i++){
        const s=eligible[(i+offset)%eligible.length],q={x:s.x,z:s.z,absoluteY:s.y};
        if(free(q)&&hasSight3D(level,{x:q.x,y:s.y+enemy.height*(enemy.muzzleHeightRatio??.65),z:q.z},{x:p.x,y:bodyBase(level,p)+.9,z:p.z}))return {...q,y:s.y-groundHeight(level,s.x,s.z),perched:true,spawnKind:'roof'};
      }
    }
    const phase=this._huntRandom()*Math.PI*2;
    for(const radius of [18,24,14,30,10])for(let i=0;i<24;i++){
      const angle=phase+(i+index*7)*Math.PI*2/24,q={x:p.x+Math.sin(angle)*radius,z:p.z+Math.cos(angle)*radius};
      if(!free(q))continue;
      const visible=hasSight(level,q,p);
      if(visible||groundRoute(level,q,p,r))return {...q,y:enemy.hoverHeight||0,perched:false,spawnKind:visible?'street':'corner'};
    }
    return null; // Tight rooms defer a wave; do not teleport an enemy into walls.
  }

  _updateHunt(dt){
    const level=this.state.level,h=level.hunt,p=this.state.player;if(!h)return;
    const entered=updateDistrictStage(level,p);
    if(entered?.first)this._event('district-stage',entered.title+' · '+entered.tactic);
    if(level.evacuation&&level.elapsed<10){h.waveRemaining=10-level.elapsed;return;}
    if(level.evacuation&&!level.evacuation.firstWave){level.evacuation.firstWave=true;h.waveRemaining=0;}
    const pressure=Math.min(10,Math.floor(battleSeconds(level)/h.pressureEvery));
    if(pressure!==h.pressure){h.pressure=pressure;this._applyWeather();this._event('pressure',`墨潮升至 ${pressure+1} 阶 · 怪物体力和攻击性增强，尽快前往任务房。`);}
    refreshHuntKeys(level);
    for(const e of level.enemies)if(e.active&&e.alive&&distance(e,p)<18&&hasSight3D(level,{x:p.x,y:bodyBase(level,p)+1.5,z:p.z},{x:e.x,y:bodyBase(level,e)+e.height*.65,z:e.z}))this._observeHuntLetter(e);
    if(h.phase==='ready'&&!h.readyAnnounced){h.readyAnnounced=true;this._event('cipher-ready','密码两半已经拼合！跟随金色任务标记，打开远处任务房。');}
    if(!h.echoChecked && h.kills>=Math.ceil(h.killTarget*.75)){
      h.echoChecked=true;
      const chapter=this.levels.findIndex(l=>l.id===level.id);
      const previous=this.levels.slice(0,chapter).filter(l=>this.state.progress.completedLevelIds.includes(l.id)&&(!BOSS_BY_LEVEL[l.id]||this.state.progress.defeatedBossKinds.some(id=>BOSS_BY_ID[id]?.levelId===l.id))&&l.enemies.some(e=>e.type==='boss'));
      if(previous.length && this._huntRandom()<.18){
        const defeated=previous[Math.min(previous.length-1,Math.floor(this._huntRandom()*previous.length))],source=clone(defeated.enemies.find(e=>e.type==='boss'));
        applyBossVariant(source,echoBossKind(this.state.progress,defeated.id,this._huntRandom));
        h.echoPending={enemy:clone(source),sourceLevelId:defeated.id,remaining:3,scaling:1+(chapter-this.levels.indexOf(defeated))*.24};
        this._event('echo-warning',`远处传来熟悉的脚步……${source.name}即将卷土重来。`);
      }
    }
    if(h.echoPending){
      h.echoPending.remaining-=dt;
      if(h.echoPending.remaining<=0){
        const echo=h.echoPending.enemy,point=this._huntSpawnPoint(echo,7);
        if(point){
          const scale=h.echoPending.scaling;
          Object.assign(echo,point,{id:`echo-${level.id}-${echo.id}`,name:`再袭 · ${echo.name}`,active:true,spawned:true,alive:true,isEcho:true,rank:3,attackCooldown:2.5,detectionRange:500,phase:1,telegraph:0,attackPhase:'idle'});
          echo.baseStats={...echo.baseStats,hp:echo.baseStats.hp*scale,damage:echo.baseStats.damage*(1+(scale-1)*.6)};
          echo.hp=echo.maxHp;level.enemies.push(echo);this._applyWeather();h.echoPending=null;h.echoSpawned=true;
          this._event('echo-arrival',`${echo.name}意外现身！回归等级已提高，可交战，也可继续前往任务房。`);
        }
      }
    }
    const gate=level.doors.find(d=>d.id===h.gateId),boss=level.enemies.find(e=>e.id===h.bossId);
    if(h.phase==='ready' && gate?.open && distance(p,h.target)<=h.target.radius && hasSight(level,p,h.target)){
      h.phase='boss';h.echoPending=null;boss.active=true;boss.spawned=true;boss.attackCooldown=2.5;
      this._event('boss-arrival',`${boss.name}现身！击败它即可获胜。`);return;
    }
    if(h.phase==='boss'||h.phase==='won')return;
    const active=level.enemies.filter(e=>e.active&&e.alive&&e.type!=='boss');
    h.waveRemaining=Math.max(0,h.waveRemaining-dt);
    const reinforcements=reinforcementProfile(battleSeconds(level),h);
    Object.assign(h,{reinforcementTier:reinforcements.tier,currentWaveSize:reinforcements.waveSize,currentMaxAlive:reinforcements.maxAlive,currentWaveInterval:reinforcements.interval});
    const capacity=reinforcements.maxAlive;
    if(active.length>=capacity || h.waveRemaining>0)return;
    let spawned=0,localSpawned=0;
    const waveSlots=Math.min(reinforcements.waveSize,capacity-active.length);
    const stage=level.expedition?.stages[level.expedition.activeIndex];
    const openingRemaining=Math.max(0,(level.animalEncounter?.rosterIds?.length||0)-(level.animalEncounter?.spawned||0));
    // Honour the opening six-card promise first. Every later regional wave
    // reserves two available slots for local enemies; other slots continue the
    // full, persistent animal deck, with a preference for this stage's tactics.
    const localQuota=stage&&level.animalEncounter?.enabled?Math.min(2,Math.max(0,waveSlots-openingRemaining)):0;
    for(let i=0;i<waveSlots;i++){
      const openingDone=!level.animalEncounter?.enabled||level.animalEncounter.spawned>=(level.animalEncounter.rosterIds?.length||0);
      const localSlot=openingDone&&localSpawned<localQuota;
      const animal=localSlot?null:nextAnimalEncounter(level.animalEncounter,this._animalDefinitions,this._animalRandom,this._animalDeck,level.enemies.filter(e=>e.alive&&e.active!==false&&e.animalId).map(e=>e.animalId),stage);
      if(level.animalEncounter?.enabled&&!localSlot&&!animal)break;
      let e=null;
      if(animal){
        const raw=this.levels.find(l=>l.id===level.id);
        e=normalizeLevel({id:'animal-wave',bounds:level.bounds,difficulty:raw.difficulty,enemies:[animal]},this.levels.indexOf(raw)).enemies[0];
        delete e.animalDeckTicket;
        e.id=`animal-${h.wave}-${i}`;e.spawned=false;e.active=false;
      }else e=stage?null:level.enemies.find(e=>e.type!=='boss'&&!e.spawned);
      if(!e){
        const templates=this.levels.find(l=>l.id===level.id).enemies.filter(e=>e.type!=='boss');
        if(stage){
          const type=stage.enemyTypes[(h.wave+i)%stage.enemyTypes.length];
          // Normalize a fresh type so body, behavior and unmodified base stats agree.
          const raw=this.levels.find(l=>l.id===level.id);
          const draft=normalizeLevel({id:'wave-template',bounds:level.bounds,difficulty:raw.difficulty,enemies:[{id:'wave',type}]},this.levels.indexOf(raw));
          e=draft.enemies[0];
        }else e=clone(templates[(h.wave*3+i)%templates.length]);e.id=`reinforcement-${h.wave}-${i}`;e.alive=true;e.spawned=false;e.active=false;e.hp=e.maxHp;
      }
      const point=this._huntSpawnPoint(e,i);if(!point){if(animal?.animalDeckTicket)this._animalDeck.release(animal.animalDeckTicket);break;}
      if(!level.enemies.includes(e))level.enemies.push(e);
      Object.assign(e,point,{active:true,spawned:true,alive:true,hp:e.maxHp,attackCooldown:2.2,detectionRange:500,attackPhase:'idle',telegraph:0,recovering:0,charging:false,hitFlash:0});
      if(e.animalId){
        this._animalDeck.commit(animal.animalDeckTicket);
        level.animalEncounter.cursor++;level.animalEncounter.spawned++;level.animalEncounter.seenIds.push(e.animalId);
        Object.assign(level.animalEncounter,this._animalDeck.stats());
        this._event('animal-deck','',{state:this._animalDeck.snapshot(),...this._animalDeck.stats()});
      }else if(localSlot)localSpawned++;
      if(stage){e.districtStageId=stage.id;e.encounterOrigin=e.animalId?'animal':'district';}
      this._event('enemy-spawn','',{enemyId:e.id,x:e.x,y:bodyBase(level,e),z:e.z,spawnKind:e.spawnKind});
      // Later waves also earn a bounded elite rank, independently of weather.
      e.rank=Math.min(3,1+Math.floor(h.wave/2));e.waveTier=Math.min(5,h.wave);
      if(h.letterBag?.length)e.clueLetter=h.letterBag[h.letterCursor++%h.letterBag.length];
      spawned++;
    }
    h.waveRemaining=spawned?reinforcements.interval:1;
    if(spawned){h.wave++;this._applyWeather();this._event('hunt-wave',`第 ${h.wave} 批来袭 · ${spawned} 只墨怪正在追来`);}
  }

  _observeHuntLetter(enemy){
    const h=this.state.level?.hunt;
    if(!h||!enemy.clueLetter||h.observedIds.includes(enemy.id))return;
    h.observedIds.push(enemy.id);
    // Seeing a back-mark can hint at the word; only a physical pickup adds a card.
    this._event('letter-observed','',{enemyId:enemy.id,letter:enemy.clueLetter});
  }

  _letterGroundPoint(enemy){
    const level=this.state.level,p=this.state.player,points=[{x:enemy.x,z:enemy.z}];
    const elevated=supportBelow(level,enemy.x,enemy.z,bodyBase(level,enemy)+.05,.4);
    if(elevated?.kind==='floor'&&bodySpaceFree(level,{x:enemy.x,z:enemy.z,absoluteY:elevated.y},.4,1.7))return {x:enemy.x,y:elevated.y,z:enemy.z};
    for(const radius of[1.2,2.4,4])for(let i=0;i<8;i++)points.push({x:enemy.x+Math.sin(i*Math.PI/4)*radius,z:enemy.z+Math.cos(i*Math.PI/4)*radius});
    // A roof kill may have no reachable floor below it. Try the player's safe
    // ground, never the enemy's elevated y or the interior of its roof support.
    points.push({x:p.x,z:p.z});
    for(const radius of[.8,1.6,2.4])for(let i=0;i<8;i++)points.push({x:p.x+Math.sin(i*Math.PI/4)*radius,z:p.z+Math.cos(i*Math.PI/4)*radius});
    for(const q of points){
      const y=groundHeight(level,q.x,q.z);if(!bodySpaceFree(level,{...q,absoluteY:y},.4,1.7))continue;
      // Sight across water is not proof of a walking route. Use the same
      // ground graph as pursuing enemies, with a safe player-floor fallback.
      if(Math.hypot(q.x-p.x,q.z-p.z)<.05||groundRoute(level,q,p,.4))return {...q,y};
    }
    return null;
  }

  _dropHuntLetter(enemy){
    const h=this.state.level?.hunt;if(!h?.riddle||h.riddleSolved||enemy.type==='boss'||this.state.status!=='playing')return;
    const roll=rollLetterDrop({answer:h.riddle.answer,collected:h.letters,drops:h.letterDrops,misses:h.letterDropMisses},this._huntRandom);
    h.letterDropMisses=roll.misses;if(!roll.letter)return;
    const position=this._letterGroundPoint(enemy);
    if(!position){h.letterDropMisses=2;return;}
    const drop={id:`letter-${++this._serial}`,letter:roll.letter,...position,collected:false};h.letterDrops.push(drop);
    this._event('letter-drop','',{dropId:drop.id,letter:drop.letter,x:drop.x,y:drop.y,z:drop.z});
  }

  _updateLetterState(pickup=true){
    const level=this.state.level,h=level?.hunt,p=this.state.player;if(!h?.riddle)return;
    const base=bodyBase(level,p),eye={x:p.x,y:base+.9,z:p.z};
    if(pickup&&this.state.status==='playing'&&p.hp>0)for(const drop of h.letterDrops){
      if(drop.collected||Math.hypot(p.x-drop.x,base-drop.y,p.z-drop.z)>1.8)continue;
      if(!hasSight3D(level,eye,{x:drop.x,y:drop.y+.35,z:drop.z}))continue;
      // Sanity bound protects repeated collection and unexpected stale cards.
      if(!missingLetters(h.riddle.answer,h.letters).includes(drop.letter))continue;
      drop.collected=true;h.letters.push(drop.letter);
      this._event('letter-pickup',`拾取字母 ${drop.letter} · ${h.letters.length}/${h.riddle.answer.length}`,{dropId:drop.id,letter:drop.letter,x:drop.x,y:drop.y,z:drop.z});
    }
    h.lettersComplete=hasRequiredLetters(h.riddle.answer,h.letters);
    const site=level.collectibles.find(c=>c.id===h.riddleSiteId);
    h.riddleSiteDistance=site?Math.hypot(p.x-site.x,base-collectibleBase(level,site),p.z-site.z):null;
    h.atRiddleSite=!!site&&h.riddleSiteDistance<=3&&hasSight3D(level,eye,{x:site.x,y:collectibleBase(level,site)+.9,z:site.z});
  }

  _clearHuntLetters(){
    const h=this.state.level?.hunt;if(!h)return;
    h.letters=[];h.letterDrops=[];h.letterDropMisses=0;h.lettersComplete=false;h.atRiddleSite=false;
  }

  submitRiddle(answer){
    const h=this.state.level?.hunt;
    if(this.state.status!=='playing'||!h?.riddle||!h.riddleRevealed)return {ok:false,reason:'先调查路标或击败来袭野怪，找到谜面。'};
    this._updateLetterState(false);
    if(!h.atRiddleSite)return {ok:false,reason:'请回到地图标出的猜谜地点，在路标旁拼词。'};
    if(h.riddleSolved)return {ok:true,alreadySolved:true};
    const word=String(answer).normalize('NFKC').trim().replace(/[\s-]+/g,'').toUpperCase();
    if(!h.lettersComplete)return {ok:false,reason:'字母卡还没齐，请击败野怪并靠近拾取掉落卡片。'};
    if(word!==h.riddle.answer){
      if(word.length!==h.riddle.answer.length)return {ok:false,reason:`本题需要 ${h.riddle.answer.length} 个字母，你输入了 ${word.length} 个。重复字母也要逐个填入。`};
      if([...word].sort().join('')!==[...h.riddle.answer].sort().join(''))return {ok:false,reason:'字母组成还没对上。请核对收集卡片中每种字母的数量，再查看中文思路提示。'};
      return {ok:false,reason:'字母数量和种类都正确，排列还需调整。参考地区笔记的词义线索，或查看英文开头提示。'};
    }
    h.riddleSolved=true;refreshHuntKeys(this.state.level);this._objectives();
    const storyReceipt=recordStorySolve(this.state.progress.story,this.state.level.id,h.riddle.id);
    this._event('riddle-solved','谜语已解开！获得侦探碎片，记入密码半钥。');
    if(storyReceipt.fragmentAdded)this._event('story-fragment',`归途手记 +1 · ${STORY_CHAPTERS[this.state.level.id].fragmentTitle}`,{chapterId:this.state.level.id});
    return {ok:true,storyReceipt};
  }

  // A route encounter is dormant until its authored conditions are satisfied.
  // Dormant enemies are neither targets nor blockers; they still count toward
  // the chapter's total, so an unopened wave cannot count as a defeated enemy.
  _updateEncounters(dt) {
    const level=this.state.level,p=this.state.player;
    if(!level?.encounters?.length)return;
    for(const encounter of level.encounters){
      const members=level.enemies.filter(e=>e.encounterId===encounter.id);
      if(encounter.status==='active' && members.every(e=>!e.alive)){
        encounter.status='cleared';
        if(!encounter.rewarded){
          encounter.rewarded=true;
          const reward=encounter.reward||{},heal=Math.min(Math.max(0,finite(reward.heal,10)),p.maxHp-p.hp);
          p.hp+=heal;
          for(const id of Object.keys(CONSUMABLES))p.consumables[id]=Math.min(99,p.consumables[id]+integer(reward[id],0,0,3));
          this._event('encounter-clear',`${encounter.name}已清除${heal>0?` · 恢复 ${Math.round(heal)} 体力`:''}${reward.medkit?' · 获得药包':''}`,{encounterId:encounter.id});
        }
      }
      if(encounter.status==='waiting'){
        const t=encounter.trigger||{};
        if(t.near && distance(p,t.near)>finite(t.near.radius,12))continue;
        if(t.switch && !level.switches.some(s=>s.id===t.switch && s.active))continue;
        if(t.after && !level.encounters.some(e=>e.id===t.after && e.status==='cleared'))continue;
        if(t.escortStarted && !level.escort?.started)continue;
        if(t.escortReached && !level.escort?.reached)continue;
        if(t.collect && ![].concat(t.collect).every(id=>level.collectibles.some(c=>c.id===id && c.collected)))continue;
        encounter.status='warning';encounter.remaining=Math.max(1.5,finite(encounter.warningSeconds,2));
        this._event('encounter-warning',`${encounter.name} · ${members.length} 只墨怪即将出现`,{encounterId:encounter.id});
      }
      if(encounter.status==='warning'){
        encounter.remaining=Math.max(0,encounter.remaining-dt);
        if(encounter.remaining<=0){
          encounter.status='active';
          for(const enemy of members){enemy.active=true;enemy.attackCooldown=Math.max(enemy.attackCooldown,1.2);}
          this._event('encounter-start',`${encounter.name}开始，留意蓄力动作。`,{encounterId:encounter.id});
        }
      }
    }
  }

  _updateWeather(dt) {
    const level = this.state.level, weather = level.weather;
    weather.remaining = Math.max(0,weather.remaining-dt);
    if(!weather.forecast && weather.remaining<=5){
      weather.forecast = true;
      this._event('weather-forecast', `天气即将转为${WEATHER[weather.nextId].name}，留意敌人的变化。`, {weatherId:weather.id,nextId:weather.nextId});
    }
    if(weather.remaining<=0){
      const previousId = weather.id;
      weather.id = weather.nextId;
      weather.nextId = chooseWeather(level.theme,weather.id,this._weatherRandom);
      weather.duration = weatherDuration(this._weatherRandom);weather.remaining=weather.duration;weather.forecast=false;
      this._applyWeather();
      this._event('weather-change', `天气转为${WEATHER[weather.id].name}。${WEATHER[weather.id].description}`, {weatherId:weather.id,previousId});
    }
  }

  retryLevel() {
    if (!this.state.level) return { ok: false, reason: '当前没有关卡' };
    return this.startLevel(this.state.level.id,{bossKind:this.state.level.chosenBossKind});
  }

  returnToCamp() {
    this.state.status = 'camp';
    this.state.shopOpen = false;
    this.state.projectiles = [];
    this.state.hazards = [];
    this.state.interaction = null;
    this.state.hint = '';
    return { ok: true };
  }

  exportSave() {
    const p = this.state.player;
    return JSON.stringify({ version: SAVE_VERSION, player: { appearanceId: normalizeAppearance(p.appearanceId), level: p.level, xp: p.xp, gold: p.gold, weaponId: p.weaponId, weapons: [...p.weapons], potions: p.potions, hp: Math.max(1, p.hp),consumables:{...p.consumables},buildingBlocks:p.buildingBlocks,growth:normalizeGrowth(p.growth,p.level,this.state.progress.completedLevelIds) }, progress: {story:normalizeStory(this.state.progress.story,this.state.progress.completedLevelIds),journeyRewardIds:[...this.state.progress.journeyRewardIds],evidenceRewardIds:[...this.state.progress.evidenceRewardIds],defeatedBossKinds:[...this.state.progress.defeatedBossKinds], completedLevelIds: [...this.state.progress.completedLevelIds], rewardedLevelIds: [...this.state.progress.rewardedLevelIds],loadoutClaimedLevelIds:[...this.state.progress.loadoutClaimedLevelIds] } });
  }

  chooseAppearance(appearanceId) {
    const appearance = APPEARANCES.find(choice => choice.id === appearanceId);
    if (!appearance) return {ok:false,reason:'该角色外观不存在。'};
    if (!['camp','playing','complete','paused'].includes(this.state.status) || this.state.player.hp <= 0) return {ok:false,reason:'倒下后请先重试本关，再更换角色。'};
    const changed = this.state.player.appearanceId !== appearanceId;
    this.state.player.appearanceId = appearanceId;
    if (changed) this._event('appearance', `已换装：${appearance.name}`, {appearanceId});
    return {ok:true,appearanceId,changed};
  }

  getGrowthStatus(){return growthStatus(this.state.player,this.state.progress);}

  getStoryStatus(){return storyStatus(this.state.progress.story,this.state.progress.completedLevelIds);}

  assembleStory(actId,chapterIds){
    if(!['camp','complete'].includes(this.state.status))return {ok:false,reason:'先完成这一程、返回营地，再安静地拼起归途手记。'};
    const before=this.getStoryStatus().complete;
    const result=assembleStoryAct(this.state.progress.story,actId,chapterIds,this.state.progress.completedLevelIds);
    if(result.ok){
      const complete=this.getStoryStatus().complete;
      this._event(complete&&!before?'story-ending':'story-assembled',complete&&!before?'十二页回信合拢了。归途纸鹤将随你继续行旅。':'这一段归途已接好，进度已记录。');
    }
    return result;
  }

  setStoryCompanion(enabled){
    const result=setStoryCompanion(this.state.progress.story,enabled,this.state.progress.completedLevelIds);
    if(result.ok)this._event('story-companion',enabled?'归途纸鹤已出发，进入地区后会跟随你。':'归途纸鹤已收入手记。');
    return result;
  }

  getNearbyBlocks(){
    const l=this.state.level,p=this.state.player;if(this.state.status!=='playing'||!l)return [];
    const eye={x:p.x,y:bodyBase(l,p)+1,z:p.z};
    return l.walls.filter(w=>w.kind==='player-block').filter(w=>{
      const center={x:w.x,y:w.baseY+w.height/2,z:w.z},dir={x:center.x-eye.x,y:center.y-eye.y,z:center.z-eye.z},range=Math.hypot(dir.x,dir.y,dir.z);
      return range<=3&&!blockers(l).some(b=>b!==w&&segmentBoxDistance(eye,dir,b,range)!==null);
    }).map(w=>{const s=l.structures.find(s=>s.id===w.structureId);return {id:w.id,hp:s.hp,maxHp:s.maxHp};});
  }

  serviceBlock(id,operation){
    const info=this.getNearbyBlocks().find(b=>b.id===id);if(!info)return {ok:false,reason:'请靠近看得见的已建方块，距离不超过 3 米。'};
    const l=this.state.level,p=this.state.player,w=l.walls.find(w=>w.id===id),s=l.structures.find(s=>s.id===w.structureId);
    if(operation==='repair'){
      if(s.hp>=s.maxHp)return {ok:false,reason:'方块完好，无需修理。'};
      if(p.gold<10)return {ok:false,reason:'修理需要 10 铜钱。'};
      p.gold-=10;s.hp=Math.min(s.maxHp,s.hp+80);w.hp=s.hp;
      this._event('block-repair','花费 10 铜钱修理方块，恢复最多 80 耐久。');return {ok:true};
    }
    if(operation!=='recover'||s.hp<s.maxHp||p.buildingBlocks>=999)return {ok:false,reason:'仅可收回完好的方块，且背包需要有空位。'};
    const atop=q=>Math.abs(q.x-w.x)<w.w/2+.5&&Math.abs(q.z-w.z)<w.d/2+.5&&Math.abs(bodyBase(l,q)-(w.baseY+w.height))<.3;
    if([p,...l.enemies.filter(e=>e.active&&e.alive),...this._livingTargets().map(c=>c.entity)].some(atop)||l.walls.some(b=>b!==w&&b.kind==='player-block'&&Math.abs(b.x-w.x)<w.w&&Math.abs(b.z-w.z)<w.d&&Math.abs(b.baseY-(w.baseY+w.height))<.05))return {ok:false,reason:'方块上方有人或叠着方块，请先腾空再收回。'};
    this._structureEvents(damageStructure(l,id,s.maxHp+1,{owner:'recovery'}));p.buildingBlocks++;
    this._event('block-recovered','已收回 1 块完好纸砖，不兑换铜钱。');return {ok:true};
  }

  chooseGrowth(branch,reset=false){
    if(!['camp','complete'].includes(this.state.status))return {ok:false,reason:'回营地或通关后才能调整成长，关内不能临时换点。'};
    const s=this.getGrowthStatus();
    if(reset){this.state.player.growth=normalizeGrowth({memento:s.growth.memento},this.state.player.level,this.state.progress.completedLevelIds);}
    else {
      if(!s.branches.some(b=>b.id===branch)||!s.remaining||s.growth.ranks[branch]>=3)return {ok:false,reason:'没有可用成长点，或该分支已满。'};
      s.growth.ranks[branch]++;this.state.player.growth=s.growth;
    }
    this._event('growth',reset?'成长点已退回，可重新分配。':'成长分支已提升。');return {ok:true};
  }

  equipMemento(id){
    if(!['camp','complete'].includes(this.state.status))return {ok:false,reason:'回营地或通关后更换纪念徽记。'};
    const m=MEMENTOS.find(m=>m.id===id);
    if(id!==null&&(!m||!this.state.progress.completedLevelIds.includes(id)))return {ok:false,reason:'先完成对应地区才能佩戴纪念徽记。'};
    this.state.player.growth.memento=id;this._event('memento',m?'佩戴'+m.name:'已收起纪念徽记');return {ok:true};
  }

  claimEvidence(id,supplyId){
    const e=this.state.level?.expedition?.evidence.find(e=>e.id===id),p=this.state.player;
    if(this.state.status!=='playing'||!e?.collected||e.rewardClaimed)return {ok:false,reason:'先实地调查；每份证据补给仅可领取一次。'};
    if(!['medkit','bomb','molotov'].includes(supplyId)||p.consumables[supplyId]>=99)return {ok:false,reason:'请选择未装满的补给。'};
    p.consumables[supplyId]++;e.rewardClaimed=true;e.rewardId=supplyId;
    if(!this.state.progress.evidenceRewardIds.includes(id))this.state.progress.evidenceRewardIds.push(id);
    this._event('evidence-reward','调查补给已装入背包：'+CONSUMABLES[supplyId].name,{evidenceId:id});return {ok:true};
  }

  _journeyResult(result){
    if(!result)return;
    const level=this.state.level,j=level?.journey;
    if(result.message)this._event(result.advanced||result.completed?'journey-progress':'notice',result.message);
    if(result.needsChoice)this._event('journey-choice','',{stepId:activeJourneyStep(level)?.id});
    if(j?.completed&&!this.state.progress.journeyRewardIds.includes(level.id)){
      let gold=integer(j.reward?.coins,20,0,500);
      const supply=j.reward?.consumable,amount=integer(j.reward?.amount,1,1,5);
      const received=Object.hasOwn(CONSUMABLES,supply)?Math.min(amount,99-this.state.player.consumables[supply]):0;
      if(received)this.state.player.consumables[supply]+=received;
      if(Object.hasOwn(CONSUMABLES,supply))gold+=(amount-received)*10;
      j.rewardClaimed=true;this.state.progress.journeyRewardIds.push(level.id);this.state.player.gold+=gold;
      this._event('reward',`地区任务完成 · +${gold} 铜钱${received?' / '+CONSUMABLES[supply].name+' +'+received:''}；本章奖励已记录，重试不重复领取。`,{gold,levelId:level.id});
    }
    if(result.completed&&STORY_CHAPTERS[level?.id])this._event('story-journey',STORY_CHAPTERS[level.id].afterJourney);
    refreshHuntKeys(level);
  }

  chooseJourney(choice){
    if(this.state.status!=='playing'||this.state.shopOpen)return {ok:false,reason:'当前不能操作地区机关。'};
    // A menu is only an input surface. Revalidate the live location and sight
    // for every choice, so remote panels cannot activate a distant mechanism.
    const candidate=this._interactionCandidates().find(c=>c.type==='journey');
    if(!candidate)return {ok:false,reason:'请到当前地区任务标记旁，再按 E 操作。'};
    const result=interactChapterJourney(this.state.level,this.state.player,{choice});
    this._journeyResult(result);this._objectives();this._updateInteraction();
    return result;
  }

  _canTrade() {
    return this.state.status === 'camp' || (this.state.status === 'playing' && this.state.level.npcs.some(n => (n.type === 'merchant' || n.type === 'shop') && n.alive!==false && Math.hypot(n.x-this.state.player.x,bodyBase(this.state.level,n)-bodyBase(this.state.level,this.state.player),n.z-this.state.player.z) <= 3 && hasSight3D(this.state.level,{x:n.x,y:bodyBase(this.state.level,n)+1,z:n.z},{x:this.state.player.x,y:bodyBase(this.state.level,this.state.player)+1,z:this.state.player.z})));
  }

  buy(itemId) {
    if (!this._canTrade()) return { ok: false, reason: '请靠近商人或返回营地交易' };
    const item = SHOP_ITEMS.find(candidate => candidate.id === itemId);
    if (!item) return { ok: false, reason: '商品不存在' };
    const p = this.state.player;
    if (item.kind === 'weapon' && p.weapons.includes(item.weaponId)) return { ok: false, reason: '已拥有这把武器' };
    if (item.kind === 'potion' && p.potions >= 99) return { ok: false, reason: '补给已装满' };
    if(item.kind==='consumable' && p.consumables[item.id]>=99)return {ok:false,reason:'这类补给已装满'};
    if(item.kind==='building'&&p.buildingBlocks+item.amount>999)return {ok:false,reason:'方块背包已满'};
    if (p.gold < item.price) return { ok: false, reason: '铜钱不足' };
    p.gold -= item.price;
    if (item.kind === 'weapon') { p.weapons.push(item.weaponId); p.weaponId = item.weaponId; } else if(item.kind==='consumable')p.consumables[item.id]+=1;else if(item.kind==='building')p.buildingBlocks+=item.amount;else p.potions += 1;
    this._event('purchase', `购入 ${item.name}，花费 ${item.price} 铜钱`, { itemId, cost: item.price });
    return { ok: true };
  }

  equip(weaponId) {
    if (!this.state.player.weapons.includes(weaponId) || !Object.hasOwn(WEAPONS,weaponId)) return { ok: false, reason: '尚未拥有这把武器' };
    this.state.player.weaponId = weaponId;
    this._event('equip', `装备 ${WEAPONS[weaponId].name}`, { weaponId });
    return { ok: true };
  }

  usePotion() {
    const p = this.state.player;
    if (this.state.status === 'dead' || p.hp <= 0) return { ok: false, reason: '倒下后请重试本关' };
    if (p.potions <= 0) return { ok: false, reason: '补给不足' };
    if (p.hp >= p.maxHp) return { ok: false, reason: '体力已满' };
    p.potions -= 1;
    p.hp = Math.min(p.maxHp, p.hp + 65);
    this._event('heal', '饮用工夫茶，恢复体力');
    return { ok: true };
  }

  useConsumable(id, aim = {}) {
    const item = Object.hasOwn(CONSUMABLES,id) ? CONSUMABLES[id] : null, p = this.state.player;
    if(this.state.status!=='playing'||p.hp<=0)return {ok:false,reason:'进入关卡且存活时才能使用补给'};
    if(!item)return {ok:false,reason:'未知补给'};
    if(p.consumables[id]<=0)return {ok:false,reason:'这类补给已用完'};
    if(id==='medkit'){
      if(p.hp>=p.maxHp)return {ok:false,reason:'体力已满'};
      p.consumables[id]-=1;p.hp=Math.min(p.maxHp,p.hp+item.heal);
      this._event('heal',`使用${item.name}，恢复体力`,{itemId:id});
    }else{
      if(p.throwCooldown>0)return {ok:false,reason:'请稍候再投掷'};
      const dir=normalize(finite(aim.aimX,p.facingX),finite(aim.aimZ,p.facingZ));
      const pitch=clamp(finite(aim.aimY,finite(p.aimY)),-1,1);
      p.consumables[id]-=1;p.throwCooldown=.9;
      const muzzle=playerMuzzle(this.state.level,p);
      this.state.projectiles.push({id:++this._serial,kind:'throw',itemId:id,owner:'player',sourceId:'player',...muzzle,vx:dir.x*8,vy:5.4+pitch*3,vz:dir.z*8,gravity:14,radius:.16,fuse:item.fuse||2,stopped:false});
      this._event('consume',`投出${item.name}`,{itemId:id});
    }
    return {ok:true,itemId:id};
  }

  claimChapterLoadout({weaponId,supplyId,levelId} = {}) {
    const p=this.state.player,progress=this.state.progress,inCamp=this.state.status==='camp';
    if(!inCamp && this.state.status!=='complete')return {ok:false,reason:'通关后或回营地才能选择携带装备'};
    // Camp has no active chapter after a reload. The explicit source ID must
    // refer to an earned, unclaimed receipt; never infer it from stale runtime.
    const level=inCamp ? this.levels.find(l=>l.id===levelId) : this.state.level;
    if(!level || inCamp && !progress.completedLevelIds.includes(level.id))return {ok:false,reason:'请选择已经通关的章节'};
    if(!inCamp && levelId!==undefined && levelId!==level.id)return {ok:false,reason:'当前只能选择本章通关装备'};
    if(inCamp && progress.loadoutClaimedLevelIds.includes(level.id))return {ok:false,reason:'本章补给已经领取'};
    if(!Object.hasOwn(WEAPONS,weaponId))return {ok:false,reason:'请选择一种武器'};
    if(progress.loadoutClaimedLevelIds.includes(level.id)){
      if(!p.weapons.includes(weaponId))return {ok:false,reason:'本关补给已领取，只能调整已有武器'};
      this.equip(weaponId);return {ok:true,claimed:false,weaponId,levelId:level.id};
    }
    if(!Object.hasOwn(CONSUMABLES,supplyId))return {ok:false,reason:'请选择一种补给'};
    if(p.consumables[supplyId]>=99)return {ok:false,reason:'这类补给已满，请选另一种'};
    if(!p.weapons.includes(weaponId))p.weapons.push(weaponId);
    p.weaponId=weaponId;p.consumables[supplyId]+=1;progress.loadoutClaimedLevelIds.push(level.id);
    this._event('chapter-loadout',`携带${WEAPONS[weaponId].name}与${CONSUMABLES[supplyId].name}继续旅程`,{levelId:level.id,weaponId,supplyId});
    return {ok:true,claimed:true,weaponId,supplyId,levelId:level.id};
  }

  _move(entity, dx, dz) {
    if(entity===this.state.player||entity._usesStairs)return movePlayerHorizontal(this.state.level,entity,dx,dz);
    const level = this.state.level, radius = finite(entity.radius, 0.4), boxes = blockers(level), b = level.bounds;
    entity.x = clamp(entity.x, b.minX + radius, b.maxX - radius);
    entity.z = clamp(entity.z, b.minZ + radius, b.maxZ - radius);
    const originalX = entity.x, originalZ = entity.z;
    const nextX = clamp(entity.x + dx, b.minX + radius, b.maxX - radius);
    const obstructs=(x,z,box)=>{
      // Water volumes mark an unavailable walking area, rather than a low
      // physical obstacle. Jump clearance must not let a traveller enter them.
      if(box.kind==='invisible')return collidesCircle(x,z,radius,box);
      const bottom=groundHeight(level,x,z)+finite(entity.y),top=bottom+bodyHeight(entity);
      return bottom < box.baseY+box.height-1e-6 && top > box.baseY+1e-6 && collidesCircle(x,z,radius,box);
    };
    if (onMappedLand(level,nextX,entity.z,radius) && !boxes.some(box => obstructs(nextX, entity.z, box))) entity.x = nextX;
    const nextZ = clamp(entity.z + dz, b.minZ + radius, b.maxZ - radius);
    if (onMappedLand(level,entity.x,nextZ,radius) && !boxes.some(box => obstructs(entity.x, nextZ, box))) entity.z = nextZ;
    return Math.hypot(entity.x - originalX, entity.z - originalZ);
  }

  _damagePlayer(damage, source, projectile=null) {
    const p = this.state.player;
    if (p.invuln > 0 || this.state.status !== 'playing') return;
    if(projectile){
      const guarded=absorbPanProjectile(p,projectile,damage);damage=guarded.damage;
      if(guarded.blocked)this._event('pan-block',guarded.broken?'平底锅架势崩解，先松开防御恢复耐久。':'平底锅挡住前方部分弹伤。',{damage,source,durability:p.guardDurability,broken:guarded.broken});
    }
    damage*=1-growthBonuses(p).damageReduction;
    p.hp = Math.max(0, p.hp - damage);
    p.invuln = 0.36;
    this._event('damage', `受到 ${Math.round(damage)} 点伤害`, { damage, source });
    if (p.hp === 0) { this.state.status = 'dead'; this.state.shopOpen = false; this._clearHuntLetters(); this._event('dead', '旅人倒下了。重试本关会保留武器、经验与铜钱。'); }
  }

  _damageEscort(damage) {
    const escort = this.state.level.escort;
    if (!escort || !escort.alive || escort.reached) return;
    escort.hp = Math.max(0, escort.hp - damage);
    if (escort.hp === 0) { escort.alive = false; this.state.status = 'dead'; this._clearHuntLetters(); this._event('dead', '货车被击毁，护送失败。可以重试本关。'); }
  }

  _awardXP(amount) {
    const p = this.state.player;
    p.xp += Math.max(0, amount);
    while (p.xp >= p.xpNext && p.level < 50) {
      p.xp -= p.xpNext; p.level += 1; p.xpNext = nextXP(p.level); p.maxHp = playerMaxHP(p.level); p.hp = Math.min(p.maxHp, p.hp + 32);
      this._event('level-up', `升至 ${p.level} 级！体力上限与武器伤害提升。`, { level: p.level });
    }
    if (p.level === 50) p.xp = Math.min(p.xp, p.xpNext - 1);
  }

  _damageEnemy(enemy, damage) {
    if (!enemy.alive || enemy.active===false) return;
    damage=animalDamageReceived(enemy,damage);
    enemy.hp = Math.max(0, enemy.hp - damage);
    enemy.hitFlash = 0.15;
    this.state.effects.push({ id: ++this._serial, type: 'hit', x: enemy.x, y: hitBodyBase(this.state.level, enemy) + 1, groundY:bodyBase(this.state.level,enemy), z: enemy.z, life: 0.25, damage });
    if (enemy.hp === 0) {
      enemy.alive = false;
      if(enemy.animalId||enemy.encounterOrigin==='district')enemy.defeatedAt=this.state.level.elapsed;
      enemy.attackPhase = 'idle'; enemy.telegraph = 0; enemy.charging = false; enemy.recovering = 0; enemy.aimTarget = null;
      if(enemy.animalId){enemy.animalLift=0;enemy.animalSpin=0;enemy.animalGuard=false;enemy.animalAction={...enemy.animalAction,phase:'dead'};}
      if(enemy.type==='boss'){enemy.bossPlan=null;enemy.bossShotCursor=0;enemy.bossAttackTime=0;}
      this.state.level.kills += 1;
      const gold = Math.max(0, Math.floor(finite(enemy.gold))), xp = Math.max(0, Math.floor(finite(enemy.xp)));
      this.state.effects.push({id:++this._serial,type:'ink-defeat',x:enemy.x,y:bodyBase(this.state.level,enemy)+enemy.height*.5,groundY:bodyBase(this.state.level,enemy),z:enemy.z,life:.65,radius:enemy.type==='boss'?2:1,xp,gold,boss:enemy.type==='boss'});
      this.state.player.gold += gold;
      this._awardXP(xp);
      this._event('kill', `${enemy.name}被击败 · +${xp} 经验 / +${gold} 铜钱`, { enemyId: enemy.id, xp, gold });
      const h=this.state.level.hunt;
      if(h && enemy.type!=='boss'){
        h.kills++;
        this._dropHuntLetter(enemy);
        this._observeHuntLetter(enemy);
        if(h.riddle&&!h.riddleRevealed){h.riddleRevealed=true;this._event('riddle-found','野怪留下了一张谜面。击败来袭野怪并拾取字母卡，集齐后回猜谜地点拼词。');}
        const missing=h.clueIds.map(id=>this.state.level.collectibles.find(c=>c.id===id)).filter(c=>c&&!c.collected);
        if(missing.length && (this._huntRandom()<.24 || h.kills%4===0)){
          const clue=missing[Math.min(missing.length-1,Math.floor(this._huntRandom()*missing.length))];clue.collected=true;
          this._event('clue-drop',`野怪掉落线索：识出「${clue.symbol||clue.name}」，记入密码半钥。`);
        }
        refreshHuntKeys(this.state.level);
        if(!this.state.level.enemies.some(e=>e.active&&e.alive&&e.type!=='boss')){
          h.waveRemaining=reinforcementProfile(battleSeconds(this.state.level),h).interval;
          this.state.player.hp=Math.min(this.state.player.maxHp,this.state.player.hp+12);
          if(h.wave%2===0)this.state.player.consumables.medkit=Math.min(99,this.state.player.consumables.medkit+1);
          this._event('wave-clear',`这一批已清除 · 恢复 12 体力，${Math.round(h.waveRemaining)} 秒后下一批来袭${h.wave%2===0?' · 获得药包':''}。`);
        }
      }
      if(h && enemy.id===h.bossId && h.phase==='boss'){
        h.phase='won';this._objectives();this._completeLevel();
      }
    }
  }

  _projectile(source, dir, damage, owner, options = {}) {
    const is3D = Number.isFinite(dir.y);
    const muzzle=owner==='player'?playerMuzzle(this.state.level,source):{x:source.x,y:hitBodyBase(this.state.level,source)+finite(options.muzzleHeight,.9),z:source.z};
    // Preserve the old horizontal-only API; the browser sends explicit 3D aim.
    if(owner==='player'&&!is3D&&stanceProfile(source).id==='stand'&&!source.lean)muzzle.y=bodyBase(this.state.level,source)+.9;
    this.state.projectiles.push({ id: ++this._serial, owner, sourceId: source.id || 'player', ...muzzle, dirX: dir.x, dirZ: dir.z, ...(is3D ? {dirY:dir.y} : {}), speed: options.speed || 20, remaining: options.range || 18, damage, radius: options.radius || 0.15, splash: options.splash || 0, weaponId: options.weaponId || null, style: options.style || null,
      ...(options.bossKind?{bossKind:options.bossKind,attackStyle:options.attackStyle,patternColor:options.patternColor,groundBounces:integer(options.groundBounces,0,0,1)}:{}) });
  }

  previewBlock(aim={}){
    if(this.state.status!=='playing'||this.state.shopOpen||!this.state.level)return {ok:false,message:'进入关卡并关闭商店后再建造'};
    return previewBuildingBlock(this.state.level,this.state.player,aim);
  }

  placeBlock(aim={}){
    const preview=this.previewBlock(aim);if(!preview.ok)return {...preview,reason:preview.message};
    const level=this.state.level,wall={id:`player-block-${++this._serial}`,kind:'player-block',x:preview.x,z:preview.z,w:preview.size,d:preview.size,rotation:0,baseY:preview.y,height:preview.size,groundOffset:preview.y-groundHeight(level,preview.x,preview.z),absoluteBaseY:true,hp:BUILDING_BLOCK.maxHp,maxHp:BUILDING_BLOCK.maxHp,cellKey:preview.cellKey};
    level.walls.push(wall);level.structureRevision=(level.structureRevision||0)+1;initializeStructures(level,this.levels.findIndex(l=>l.id===level.id));this.state.player.buildingBlocks--;
    this._event('block-place','放置纸砖方块',{wallId:wall.id,x:wall.x,y:wall.baseY,z:wall.z});
    return {...preview,id:wall.id};
  }

  _updateDemonBoss(enemy,target,dt){
    const level=this.state.level,height=Math.min(1.8,enemy.height*.55),origin={x:enemy.x,y:bodyBase(level,enemy)+height,z:enemy.z};
    const eventData={enemyId:enemy.id,bossKind:enemy.bossKind,attackStyle:enemy.attackStyle,phase:enemy.phase};
    if(enemy.attackPhase==='recovering'){
      enemy.recovering=Math.max(0,enemy.recovering-dt);
      if(enemy.recovering===0)enemy.attackPhase='idle';
      return;
    }
    if(enemy.attackPhase==='telegraph'){
      enemy.facingX=enemy.attackDirX;enemy.facingZ=enemy.attackDirZ;
      enemy.telegraph=Math.max(0,enemy.telegraph-dt);
      if(enemy.telegraph>0)return;
      enemy.attackPhase='firing';enemy.bossAttackTime=0;enemy.bossShotCursor=0;
    }
    if(enemy.attackPhase==='firing'){
      enemy.facingX=enemy.attackDirX;enemy.facingZ=enemy.attackDirZ;
      const plan=enemy.bossPlan,aim=enemy.aimTarget;
      if(!plan||!aim){enemy.attackPhase='idle';enemy.attackCooldown=enemy.cooldown;return;}
      enemy.bossAttackTime+=dt;let emitted=0;
      // Do not aim again after warning. A moving player can leave the old line.
      const locked={x:aim.x-origin.x,y:aim.y-origin.y,z:aim.z-origin.z};
      while(enemy.bossShotCursor<plan.shots.length&&plan.shots[enemy.bossShotCursor].delay<=enemy.bossAttackTime){
        const shot=plan.shots[enemy.bossShotCursor++];
        if(!hasSight3D(level,origin,aim)||smokeBlocksSight(this.state.hazards,origin,aim))continue;
        this._projectile(enemy,patternDirection(locked,shot),enemy.damage*shot.damageMultiplier,'enemy',{
          speed:Math.min(14,enemy.projectileSpeed*shot.speedMultiplier),range:enemy.attackRange+3,muzzleHeight:height,radius:shot.radius,
          style:`boss-${enemy.attackStyle}`,bossKind:enemy.bossKind,attackStyle:enemy.attackStyle,patternColor:plan.patternColor,groundBounces:shot.groundBounces,
        });emitted++;
      }
      if(emitted){this._event('enemy-shot','',{...eventData,behavior:'boss',count:emitted});this._event('boss-volley','',{...eventData,count:emitted});}
      if(enemy.bossShotCursor>=plan.shots.length){
        enemy.attackPhase='recovering';enemy.recovering=plan.recovery;enemy.attackCooldown=enemy.cooldown/(1+(enemy.phase-1)*.12);enemy.bossPlan=null;enemy.aimTarget=null;
      }
      return;
    }
    const d=distance(enemy,target);if(d>finite(enemy.detectionRange,35))return;
    const aim=aimPoint(level,target);
    const sight=hasSight3D(level,origin,aim),dir=normalize(target.x-enemy.x,target.z-enemy.z);
    if(d<=enemy.attackRange+finite(target.radius,.4)&&sight&&enemy.attackCooldown<=0){
      enemy.attackDirX=dir.x;enemy.attackDirZ=dir.z;enemy.aimTarget=aim;
      enemy.bossPlan=bossPattern({bossKind:enemy.bossKind,phase:enemy.phase,cycle:enemy.bossCycle++,fireRateMultiplier:enemy.fireRateMultiplier});
      enemy.attackPhase='telegraph';enemy.telegraph=Math.max(.35,enemy.telegraphDuration);
      this._event('boss-telegraph',`${enemy.name}正在蓄力，侧移或利用墙角躲开弹幕。`,{...eventData,duration:enemy.telegraph,x:enemy.x,y:origin.y,z:enemy.z,aim:{...aim}});
      return;
    }
    if(!enemy.perched&&(!sight||d>finite(enemy.preferredRange,4))){
      const next=sight?target:groundRoute(level,enemy,target,enemy.radius);if(!next)return;
      const move=normalize(next.x-enemy.x,next.z-enemy.z),amount=enemy.speed*(1+(enemy.phase-1)*.1)*dt;
      this._move(enemy,move.x*amount,move.z*amount);
    }
  }

  // These enemies have explicit, renderable attack windows. Aim is locked when
  // the warning begins: sideways movement can evade a pencil, lamp or charge.
  _warnEnemy(enemy, target) {
    enemy.attackPhase = 'telegraph'; enemy.telegraph = enemy.telegraphDuration;
    const dir = normalize(target.x-enemy.x, target.z-enemy.z);
    enemy.attackDirX = dir.x; enemy.attackDirZ = dir.z;
    enemy.aimTarget = aimPoint(this.state.level,target);
    this._event('enemy-telegraph', `${enemy.name}${enemy.behavior === 'crab' ? '伏低蓄力，侧移躲开冲撞' : '正在蓄力，侧移躲开慢弹'}`, { enemyId: enemy.id, duration: enemy.telegraphDuration, behavior: enemy.behavior });
  }

  _recoverCrab(enemy) {
    enemy.attackPhase = 'recovering'; enemy.charging = false;
    enemy.recovering = enemy.recoveryDuration; enemy.chargeRemaining = 0;
    enemy.attackCooldown = enemy.cooldown;
  }

  _updatePursuit(enemy,target,dt){
    const hash=[...enemy.id].reduce((sum,c)=>sum+c.charCodeAt(0),0);
    enemy.mobileShooter=!enemy.perched&&enemy.type!=='boss'&&['pencil','lantern'].includes(enemy.behavior)&&(enemy.mobileShooter===true||hash%3===0);
    enemy.sprinting=false;enemy.pursuitSpeed=enemy.speed;
    if(!enemy.mobileShooter||battleSeconds(this.state.level)<45)return;
    enemy.sprintCooldown=Math.max(0,finite(enemy.sprintCooldown)-dt);
    const d=distance(enemy,target);
    if(enemy.sprintPhase==='warning'){
      enemy.sprintWarning=Math.max(0,enemy.sprintWarning-dt);enemy.pursuitSpeed=enemy.speed*.3;
      if(enemy.sprintWarning===0){enemy.sprintPhase='running';enemy.sprintRemaining=1.2;}
    }else if(enemy.sprintPhase==='running'){
      enemy.sprintRemaining=Math.max(0,enemy.sprintRemaining-dt);enemy.sprinting=true;enemy.pursuitSpeed=enemy.speed*1.8;
      if(enemy.sprintRemaining===0||d<2){enemy.sprintPhase='recovering';enemy.sprintRecovery=1.4;enemy.sprinting=false;}
    }else if(enemy.sprintPhase==='recovering'){
      enemy.sprintRecovery=Math.max(0,enemy.sprintRecovery-dt);enemy.pursuitSpeed=enemy.speed*.6;
      if(enemy.sprintRecovery===0){enemy.sprintPhase='idle';enemy.sprintCooldown=8;}
    }else if(enemy.sprintCooldown===0&&d>finite(enemy.preferredRange,5)+1.5&&d<finite(enemy.detectionRange,35)){
      enemy.sprintPhase='warning';enemy.sprintWarning=.45;
      this._event('enemy-sprint-warning',`${enemy.name}准备奔跑追击`,{enemyId:enemy.id,duration:.45});
    }
  }

  _moveWhileAiming(enemy,target,dt){
    if(!enemy.mobileShooter||battleSeconds(this.state.level)<45||distance(enemy,target)<=finite(enemy.preferredRange,5))return;
    const sight=hasSight3D(this.state.level,{x:enemy.x,y:bodyBase(this.state.level,enemy)+bodyHeight(enemy)*.6,z:enemy.z},aimPoint(this.state.level,target)),next=sight?target:groundRoute(this.state.level,enemy,target,enemy.radius);
    if(!next)return;
    const dir=normalize(next.x-enemy.x,next.z-enemy.z),amount=enemy.pursuitSpeed*.38*dt;
    this._move(enemy,dir.x*amount,dir.z*amount);
  }

  _updateSpecialEnemy(enemy, target, dt) {
    const level = this.state.level;
    this._updatePursuit(enemy,target,dt);
    const attackRange=enemy.perched?30:enemy.attackRange;
    if (enemy.attackPhase === 'recovering') {
      enemy.recovering = Math.max(0,enemy.recovering-dt);
      if (enemy.recovering <= 0) enemy.attackPhase = 'idle';
      return;
    }
    if (enemy.attackPhase === 'charging') {
      // A charge never re-aims or damages by proximity while recovering.
      enemy.facingX = enemy.attackDirX; enemy.facingZ = enemy.attackDirZ;
      const previous = {x:enemy.x,z:enemy.z};
      const amount = enemy.chargeSpeed*Math.min(dt,enemy.chargeRemaining);
      const moved = this._move(enemy,enemy.attackDirX*amount,enemy.attackDirZ*amount);
      enemy.chargeRemaining = Math.max(0,enemy.chargeRemaining-dt);
      const candidates = [{entity:this.state.player,escort:false}, ...(level.escort?.alive && !level.escort.reached ? [{entity:level.escort,escort:true}] : []),...this._livingTargets()];
      if (!enemy.chargeHit) for (const candidate of candidates) {
        const body = candidate.entity;
        const overlap = bodyBase(level,body) < bodyBase(level,enemy)+enemy.height && bodyBase(level,body)+bodyHeight(body) > bodyBase(level,enemy);
        if (overlap && segmentCircle(previous.x,previous.z,enemy.x,enemy.z,body,enemy.radius+finite(body.radius,.4)) !== null && hasSight(level,enemy,body)) {
          enemy.chargeHit = true;
          this._damageTarget(body,enemy.damage,enemy.id);
          break;
        }
      }
      if (enemy.chargeRemaining <= 0 || moved < amount*.9 || enemy.chargeHit) this._recoverCrab(enemy);
      return;
    }
    if (enemy.attackPhase === 'telegraph') {
      if(enemy.behavior!=='crab')this._moveWhileAiming(enemy,target,dt);
      enemy.facingX = enemy.attackDirX; enemy.facingZ = enemy.attackDirZ;
      enemy.telegraph = Math.max(0,enemy.telegraph-dt);
      if (enemy.telegraph > 0) return;
      if (enemy.behavior === 'crab') {
        enemy.attackPhase = 'charging'; enemy.charging = true;
        enemy.chargeRemaining = enemy.chargeDuration; enemy.chargeHit = false;
      } else {
        const height = enemy.height*(enemy.muzzleHeightRatio??.65), origin = {x:enemy.x,y:bodyBase(level,enemy)+height,z:enemy.z}, aim = enemy.aimTarget;
        // A newly closed door cancels the shot; already flying projectiles also
        // use the shared swept wall/door/terrain collision below.
        if (aim && hasSight3D(level,origin,aim)&&!smokeBlocksSight(this.state.hazards,origin,aim)) {
          const dx=aim.x-origin.x,dy=aim.y-origin.y,dz=aim.z-origin.z,length=Math.hypot(dx,dy,dz)||1;
          this._projectile(enemy,{x:dx/length,y:dy/length,z:dz/length},enemy.damage,'enemy',{speed:enemy.projectileSpeed,range:attackRange+2,muzzleHeight:height,style:enemy.behavior,radius:enemy.behavior==='lantern'?.2:.12});
          this._event('enemy-shot','',{enemyId:enemy.id,behavior:enemy.behavior});
        }
        enemy.attackPhase = 'idle'; enemy.attackCooldown = enemy.cooldown; enemy.aimTarget = null;
      }
      return;
    }
    const d = distance(enemy,target);let dir = normalize(target.x-enemy.x,target.z-enemy.z);
    if (d > finite(enemy.detectionRange,35)) return;
    const sight = hasSight3D(level,{x:enemy.x,y:bodyBase(level,enemy)+enemy.height*(enemy.perched?.65:.5),z:enemy.z},aimPoint(level,target));
    if (d <= attackRange+finite(target.radius,.4) && sight && enemy.attackCooldown <= 0) { this._warnEnemy(enemy,target); return; }
    if(enemy.perched)return;
    if(!sight){const route=groundRoute(level,enemy,target,enemy.radius);if(route)dir=normalize(route.x-enemy.x,route.z-enemy.z);}
    const stop = enemy.behavior === 'crab' ? enemy.attackRange*.8 : sight ? enemy.preferredRange : 0;
    const forward = d > stop ? 1 : 0; // No endless retreat from a player's sword.
    const side = sight && d > 1.5 && d < enemy.attackRange+2 && !['pencil','archer'].includes(enemy.behavior) ? enemy.strafeSign*(Math.floor(level.elapsed/2.4)%2 ? -1 : 1) : 0;
    if (forward || side) {
      const movement = normalize(dir.x*forward-dir.z*side*.8,dir.z*forward+dir.x*side*.8), amount = enemy.pursuitSpeed*dt;
      const moved = this._move(enemy,movement.x*amount,movement.z*amount);
      if (moved < amount*.25) this._move(enemy,-dir.z*amount*enemy.strafeSign,dir.x*amount*enemy.strafeSign);
    }
  }

  _attack() {
    const p = this.state.player, weapon = WEAPONS[p.weaponId];
    if (p.attackCooldown > 0||p.guarding||p.guardBroken>0) return;
    p.attackCooldown = weapon.cooldown;
      const damage = (weapon.damage + (p.level - 1) * 3)*growthBonuses(p).weaponMultiplier;
    const is3D = Number.isFinite(p.aimY), horizontal = is3D ? Math.sqrt(Math.max(0,1-p.aimY*p.aimY)) : 1;
    const aim = {x:p.facingX*horizontal,z:p.facingZ*horizontal,...(is3D ? {y:p.aimY} : {})};
    if (weapon.kind === 'ranged') {
      const pellets=weapon.pellets||1,spread=aimedSpread(weapon,p.aiming);
      for(let i=0;i<pellets;i++){
        let direction=aim;
        if(pellets>1){const angle=(i/(pellets-1)-.5)*spread*2,c=Math.cos(angle),s=Math.sin(angle);direction={x:aim.x*c-aim.z*s,z:aim.x*s+aim.z*c,...(is3D?{y:aim.y+(i%2?1:-1)*spread*.15}:{})};const n=Math.hypot(direction.x,direction.y||0,direction.z);direction={x:direction.x/n,z:direction.z/n,...(is3D?{y:direction.y/n}:{})};}
        this._projectile(p,direction,damage,'player',{speed:weapon.projectileSpeed,range:weapon.range,splash:weapon.splash,weaponId:weapon.id});
      }
    }
    else {
      const origin=playerMuzzle(this.state.level,p);
      this.state.effects.push({ id: ++this._serial, type: 'slash', ...origin, dirX: p.facingX, dirZ: p.facingZ, range: weapon.range, arc: weapon.arc, life: 0.2, weaponId: weapon.id });
      if(weapon.id==='knife'||weapon.id==='pan'){
        const candidates=[...this.state.level.enemies.filter(e=>e.alive&&e.active!==false).map(entity=>({kind:'enemy',entity})),...this._livingTargets()];
        const hits=candidates.map(c=>{
          const point=closestBodyPoint(origin,worldBody(this.state.level,c.entity));
          const dx=point.x-origin.x,dy=point.y-origin.y,dz=point.z-origin.z,d=Math.hypot(dx,dy,dz);
          const dot=(dx*aim.x+dy*(aim.y||0)+dz*aim.z)/(d||1);
          return {...c,point,d,inArc:d<.15||dot>=Math.cos(weapon.arc)};
        }).filter(c=>c.d<=weapon.range&&c.inArc&&hasSight3D(this.state.level,origin,c.point)).sort((a,b)=>a.d-b.d).slice(0,weapon.singleTarget?1:weapon.maxTargets||3);
        for(const hit of hits){
          const enemy=hit.entity,multiplier=weapon.id==='knife'&&hit.kind==='enemy'?knifeDamageMultiplier(p,enemy):1;
          if(hit.kind==='enemy'){
            this._damageEnemy(enemy,damage*multiplier);
            if(multiplier>1)this._event('backstab','短刀背击命中。',{enemyId:enemy.id,multiplier,damage:damage*multiplier});
            if(weapon.id==='pan'&&enemy.alive&&enemy.type!=='boss'){
              enemy.attackPhase='recovering';enemy.recovering=Math.max(enemy.recovering||0,weapon.stagger);enemy.telegraph=0;enemy.charging=false;enemy.aimTarget=null;
              if(enemy.animalId&&enemy._animalCombat){
                enemy._animalCombat.phase='recovering';enemy._animalCombat.time=0;
                enemy.animalLift=0;enemy.animalSpin=0;enemy.animalGuard=false;
                enemy.animalAction={...enemy.animalAction,phase:'recovering'};
              }
              enemy.attackCooldown=Math.max(enemy.attackCooldown,weapon.stagger);
              const away=normalize(enemy.x-p.x,enemy.z-p.z);this._move(enemy,away.x*.3,away.z*.3);
            }
          }else this._damageLiving(hit.kind,enemy,damage,'player');
        }
        return;
      }
      for (const enemy of this.state.level.enemies) {
        if (!enemy.alive || enemy.active===false) continue;
        const d = Math.hypot(distance(p, enemy), hitBodyBase(this.state.level,enemy)-bodyBase(this.state.level,p)), direction = normalize(enemy.x - p.x, enemy.z - p.z);
        let inArc = d < 0.5 || direction.x*p.facingX+direction.z*p.facingZ >= Math.cos(weapon.arc);
        if (is3D) {
          const dx = enemy.x-origin.x, dy = hitBodyBase(this.state.level,enemy)+bodyHeight(enemy)/2-origin.y, dz = enemy.z-origin.z;
          const length = Math.hypot(dx,dy,dz);
          inArc = length < 1e-8 || (dx*aim.x+dy*aim.y+dz*aim.z)/length >= Math.cos(weapon.arc);
        }
        if (d <= weapon.range + enemy.radius && inArc && hasSight3D(this.state.level,origin,aimPoint(this.state.level,enemy))) this._damageEnemy(enemy, damage);
      }
      for(const c of this._livingTargets()){
        const q=c.entity,dx=q.x-origin.x,dy=bodyBase(this.state.level,q)+bodyHeight(q)*.5-origin.y,dz=q.z-origin.z,d=Math.hypot(dx,dy,dz);
        if(d<=weapon.range+q.radius&&(dx*aim.x+dy*(aim.y||0)+dz*aim.z)/(d||1)>=Math.cos(weapon.arc)&&hasSight3D(this.state.level,origin,{x:q.x,y:bodyBase(this.state.level,q)+bodyHeight(q)*.5,z:q.z}))this._damageLiving(c.kind,q,damage,'player');
      }
    }
  }

  _livingTargets(){
    const l=this.state.level;
    return [...l.npcs.filter(n=>n.alive&&Number.isFinite(n.hp)).map(entity=>({kind:'merchant',entity})),
      ...(l.evacuation?.people||[]).filter(n=>n.alive&&!n.evacuated&&!n.insideVehicleId).map(entity=>({kind:'civilian',entity})),
      ...(l.evacuation?.vehicles||[]).filter(n=>n.alive).map(entity=>({kind:'vehicle',entity}))];
  }
  _civilEvents(events){for(const {type,text,...extra}of events||[]){
    if(type==='evacuation-complete'&&!this.state.level.evacuation.rewarded){this.state.level.evacuation.rewarded=true;this.state.player.gold+=60;}
    if(type==='merchant-lost')this.state.shopOpen=false;
    this._event(type,text,extra);
  }}
  _damageLiving(kind,entity,amount,owner){this._civilEvents(kind==='merchant'?damageMerchant(this.state.level,entity.id,amount,owner):kind==='civilian'?damageCivilian(this.state.level,entity.id,amount,owner):kind==='vehicle'?damageVehicle(this.state.level,entity.id,amount,owner):[]);}
  _damageTarget(target,amount,source){
    const candidate=this._livingTargets().find(c=>c.entity===target);
    if(candidate)this._damageLiving(candidate.kind,target,amount,'enemy');
    else if(target===this.state.level.escort)this._damageEscort(amount);
    else this._damagePlayer(amount,source);
  }
  _damageLivingArea(origin,radius,damage,owner,exclude){
    for(const c of this._livingTargets()){
      if(c.entity===exclude)continue;
      const point=closestBodyPoint(origin,worldBody(this.state.level,c.entity));
      if(Math.hypot(point.x-origin.x,point.y-origin.y,point.z-origin.z)<=radius&&hasSight3D(this.state.level,origin,point))this._damageLiving(c.kind,c.entity,damage,owner);
    }
  }
  _followEnemyStairs(enemy,target,dt){
    if(enemy.perched||!['doodler','imp','shade','archer','inkling'].includes(enemy.type)||!this.state.level.traversal?.rooms?.length)return false;
    if(enemy.attackPhase!=='idle'||enemy.charging||enemy.recovering>0)return false;
    if(Math.abs(finite(enemy.y)-finite(target.y))<.45&&!enemy._stairPath?.length)return false;
    // Use the same stepped collision and physical ramp route as the traveller.
    // Traversing a floor transition replaces ground-only pursuit this frame.
    enemy._usesStairs=true;
    moveCivilian(this.state.level,enemy,target,Math.min(3.8,enemy.speed),dt);
    return true;
  }

  _animalTargets(){
    return [this.state.player,...(this.state.level.escort?.alive&&!this.state.level.escort.reached?[this.state.level.escort]:[]),...this._livingTargets().map(c=>c.entity)];
  }

  _animalArea(origin,radius,damage,source){
    const level=this.state.level;
    for(const target of this._animalTargets()){
      const point=closestBodyPoint(origin,worldBody(level,target));
      if(Math.hypot(point.x-origin.x,point.y-origin.y,point.z-origin.z)<=radius&&hasSight3D(level,origin,point))this._damageTarget(target,damage,source);
    }
  }

  _updateAnimalEnemy(enemy,target,dt){
    if(!enemy.combatProfile)return false;
    const level=this.state.level;
    this._updatePursuit(enemy,target,dt);
    const origin=q=>({x:q.x,y:hitBodyBase(level,q)+bodyHeight(q)*.5,z:q.z});
    const sight=(a,b)=>hasSight3D(level,origin(a),aimPoint(level,b))&&!smokeBlocksSight(this.state.hazards,origin(a),aimPoint(level,b));
    const muzzle=q=>({x:q.x,y:hitBodyBase(level,q)+q.height*(q.muzzleHeightRatio??.65),z:q.z});
    const effect=(type,q,radius)=>this.state.effects.push({id:++this._serial,type,...origin(q),radius,range:radius,dirX:enemy.facingX,dirZ:enemy.facingZ,life:.32});
    return updateAnimalCombat(enemy,target,dt,{
      allies:()=>level.enemies.filter(e=>e!==enemy&&e.alive&&e.active!==false&&e.type!=='boss'),
      targets:()=>this._animalTargets(),aim:q=>aimPoint(level,q),muzzle,sight,
      sightPoint:(a,point)=>hasSight3D(level,muzzle(a),point)&&!smokeBlocksSight(this.state.hazards,muzzle(a),point),
      route:(a,b)=>groundRoute(level,a,b,a.radius),move:(a,x,z)=>this._move(a,x,z),
      event:(type,message,extra)=>this._event(type,message,extra),effect,
      shoot:(source,dir,damage,options)=>{
        if(this.state.projectiles.filter(s=>s.owner==='enemy').length>=96)return;
        this._projectile(source,dir,damage,'enemy',{...options,muzzleHeight:source.height*(source.muzzleHeightRatio??.65)});
      },
      lob:(source,aim,damage)=>{
        if(this.state.projectiles.filter(s=>s.owner==='enemy').length>=96)return;
        const start=muzzle(source),flight=clamp(Math.hypot(aim.x-start.x,aim.z-start.z)/8,.6,1.25),gravity=12;
        this.state.projectiles.push({id:++this._serial,kind:'throw',animalBomb:true,owner:'enemy',sourceId:source.id,...start,
          vx:(aim.x-start.x)/flight,vz:(aim.z-start.z)/flight,vy:(aim.y-start.y)/flight+gravity*flight*.5,
          gravity,radius:.16,fuse:flight+.8,stopped:false,damage,blastRadius:2.25,style:'animal-lob-bomb'});
      },
      area:(q,radius,damage)=>this._animalArea(origin(q),radius,damage,enemy.id),
      melee:(radius,damage,arc=Math.PI,knock=0)=>{
        const center=origin(enemy);
        effect('enemy-slash',enemy,radius);
        for(const victim of this._animalTargets()){
          const point=closestBodyPoint(center,worldBody(level,victim)),dx=victim.x-enemy.x,dz=victim.z-enemy.z,d=Math.hypot(dx,dz)||1;
          if(Math.hypot(point.x-center.x,point.y-center.y,point.z-center.z)>radius||(dx*enemy.facingX+dz*enemy.facingZ)/d<Math.cos(arc)||!hasSight3D(level,center,point))continue;
          this._damageTarget(victim,damage,enemy.id);
          if(knock&&victim!==level.escort&&victim.alive!==false)this._move(victim,dx/d*knock,dz/d*knock);
        }
      },
      sweep:(from,to,hitIds,damage)=>{
        for(const victim of this._animalTargets()){
          const id=victim===this.state.player?'player':victim.id;
          if(hitIds.includes(id))continue;
          const overlap=hitBodyBase(level,victim)<hitBodyBase(level,enemy)+enemy.height&&hitBodyBase(level,victim)+bodyHeight(victim)>hitBodyBase(level,enemy);
          if(overlap&&segmentCircle(from.x,from.z,to.x,to.z,victim,enemy.radius+finite(victim.radius,.4))!==null&&sight(enemy,victim)){
            hitIds.push(id);this._damageTarget(victim,damage,enemy.id);
          }
        }
      },
      hazard:(type,q,radius,duration,dps)=>{
        if(this.state.hazards.filter(h=>h.owner==='enemy').length>=36)return;
        this.state.hazards.push({id:++this._serial,owner:'enemy',sourceId:enemy.id,type,x:q.x,y:bodyBase(level,q)+.15,z:q.z,radius,duration,remaining:duration,dps,tickRemaining:.45});
      },
    });
  }

  _updateEnemies(dt) {
    const p = this.state.player, level = this.state.level;
    for (const enemy of level.enemies) {
      if (!enemy.alive || enemy.active===false || this.state.status !== 'playing') continue;
      if(enemy.perched&&!enemy.falling){
        const base=bodyBase(level,enemy),support=supportBelow(level,enemy.x,enemy.z,base+.04,enemy.radius);
        if(!support||Math.abs(support.y-base)>.08){enemy.falling=true;enemy.vy=0;enemy.grounded=false;enemy.attackPhase='idle';enemy.telegraph=0;enemy.aimTarget=null;enemy.sprinting=false;enemy.animalGuard=false;enemy.animalLift=0;}
      }
      if(enemy.falling){
        stepPlayerVertical(level,enemy,dt);
        if(enemy.grounded){enemy.falling=false;enemy.perched=false;enemy.y+=finite(enemy.hoverHeight);enemy.attackCooldown=Math.max(enemy.attackCooldown,.7);}
        continue;
      }
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
      enemy.burstCooldown = Math.max(0, enemy.burstCooldown - dt);
      if (enemy.type === 'boss') {
        const phase = enemy.hp > enemy.maxHp * 0.66 ? 1 : enemy.hp > enemy.maxHp * 0.33 ? 2 : 3;
        if (phase !== enemy.phase) { enemy.phase = phase; this._event('boss-phase', `${enemy.name}进入第 ${phase} 阶段`, { enemyId: enemy.id, phase }); }
      }
      const escort = level.escort;
      const targetEscort = escort?.alive && escort.started && !escort.reached && distance(enemy, escort) < distance(enemy, p) * 0.85;
      let target = targetEscort ? escort : p;
      const eye={x:enemy.x,y:hitBodyBase(level,enemy)+bodyHeight(enemy)*.6,z:enemy.z};
      const targetPoint=q=>aimPoint(level,q);
      for(const c of this._livingTargets())if(distance(enemy,c.entity)<Math.min(18,distance(enemy,target)*.8)&&hasSight3D(level,eye,targetPoint(c.entity))&&!smokeBlocksSight(this.state.hazards,eye,targetPoint(c.entity)))target=c.entity;
      const hiddenBySmoke=smokeBlocksSight(this.state.hazards,eye,targetPoint(target));
      enemy.visionObscured=hiddenBySmoke;
      if(hiddenBySmoke&&enemy.attackPhase!=='charging'){
        // Lose the target, including a telegraphed shot. Smoke cannot delete a
        // projectile or stop a charge already in flight, and never moves cover.
        enemy.attackPhase='idle';enemy.telegraph=0;enemy.aimTarget=null;enemy.bossPlan=null;enemy.sprinting=false;
        enemy.animalGuard=false;enemy.animalLift=0;enemy.animalSpin=0;
        enemy.attackCooldown=Math.max(enemy.attackCooldown,.65);
        const last=enemy.lastSeenTarget;
        if(last&&!enemy.perched&&distance(enemy,last)>.5){
          if(!this._followEnemyStairs(enemy,last,dt)){
            const next=groundRoute(level,enemy,last,enemy.radius);
            if(next){const move=normalize(next.x-enemy.x,next.z-enemy.z),amount=Math.min(distance(enemy,last),enemy.speed*.6*dt);this._move(enemy,move.x*amount,move.z*amount);}
          }
        }
        continue;
      }
      if(!hiddenBySmoke&&hasSight3D(level,eye,targetPoint(target)))enemy.lastSeenTarget={x:target.x,y:finite(target.y),z:target.z};
      if(!enemy.behavior&&!enemy.combatProfile&&enemy.type!=='boss'&&enemy.recovering>0){enemy.recovering=Math.max(0,enemy.recovering-dt);if(enemy.recovering===0)enemy.attackPhase='idle';continue;}
      const d = distance(enemy, target);let dir = normalize(target.x - enemy.x, target.z - enemy.z);
      enemy.facingX = dir.x; enemy.facingZ = dir.z;
      if(d<80&&this._followEnemyStairs(enemy,target,dt))continue;
      if(enemy._usesStairs)stepPlayerVertical(level,enemy,dt);
      if(enemy.type==='boss'){this._updateDemonBoss(enemy,target,dt);continue;}
      if(enemy.animalId&&this._updateAnimalEnemy(enemy,target,dt))continue;
      if (enemy.behavior) { this._updateSpecialEnemy(enemy,target,dt); continue; }
      if (d > finite(enemy.detectionRange, 35)) continue;
      const sight = hasSight3D(level, eye,targetPoint(target)) && hasSight3D(level,
        {x:enemy.x,y:bodyBase(level,enemy)+.9,z:enemy.z}, targetPoint(target));
      if(!sight){const route=groundRoute(level,enemy,target,enemy.radius);if(route)dir=normalize(route.x-enemy.x,route.z-enemy.z);}
      const ranged = enemy.type === 'archer';
      const speed = enemy.speed * (enemy.type === 'boss' ? 1 + 0.18 * (enemy.phase - 1) : 1);
      const stopDistance = ranged ? (sight ? enemy.preferredRange : 0) : enemy.attackRange * 0.8;
      let forward = d > stopDistance ? 1 : ranged && d < 4 ? -1 : 0;
      if (forward) {
        const amount = speed * dt * forward;
        const moved = this._move(enemy, dir.x * amount, dir.z * amount);
        if (moved < Math.abs(amount) * 0.25) {
          const sign = level.enemies.indexOf(enemy) % 2 ? 1 : -1;
          if (this._move(enemy, -dir.z * Math.abs(amount) * sign, dir.x * Math.abs(amount) * sign) < Math.abs(amount) * 0.2) this._move(enemy, dir.z * Math.abs(amount) * sign, -dir.x * Math.abs(amount) * sign);
        }
      }
      if (d <= enemy.attackRange + finite(target.radius, 0.4) && sight && enemy.attackCooldown <= 0) {
        enemy.attackCooldown = enemy.cooldown / (enemy.type === 'boss' ? 1 + 0.1 * (enemy.phase - 1) : 1);
        if (ranged) {
          const aimed=target.stance&&Math.abs(finite(target.lean))>.03?targetPoint(target):{x:target.x,y:bodyBase(level,target)+Math.min(.9,bodyHeight(target)*.6),z:target.z};
          const dy=aimed.y-(bodyBase(level,enemy)+.9), length=Math.hypot(aimed.x-enemy.x,dy,aimed.z-enemy.z)||1;
          this._projectile(enemy, {x:(aimed.x-enemy.x)/length,y:dy/length,z:(aimed.z-enemy.z)/length}, enemy.damage, 'enemy', { speed: enemy.projectileSpeed, range: enemy.attackRange + 3 });
        }
        else {
          this.state.effects.push({ id: ++this._serial, type: 'enemy-slash', x: enemy.x, y: bodyBase(level,enemy) + 0.6, z: enemy.z, life: 0.25, range: enemy.attackRange, dirX: dir.x, dirZ: dir.z });
          if(Math.abs(bodyBase(level,target)-bodyBase(level,enemy))<1.35)this._damageTarget(target,enemy.damage,enemy.id);
        }
      }
    }
  }

  _updateProjectiles(dt) {
    const level = this.state.level, retained = [];
    for (const shot of this.state.projectiles) {
      if(this.state.status!=='playing')break;
      if(shot.kind==='throw'){
        if(this._updateThrown(shot,dt))retained.push(shot);
        continue;
      }
      const travel = Math.min(shot.remaining, shot.speed * dt), nx = shot.x + shot.dirX * travel, nz = shot.z + shot.dirZ * travel;
      const is3D = Number.isFinite(shot.dirY), ny = shot.y+(is3D ? shot.dirY*travel : 0);
      let closest = 2, hit = null;
      for (const box of blockers(level)) {
        const hitDistance = is3D ? segmentBoxDistance(shot,{x:shot.dirX,y:shot.dirY,z:shot.dirZ},box,travel,shot.radius) : null;
        const t = is3D ? (hitDistance === null ? null : hitDistance/Math.max(travel,1e-12)) : segmentBox(shot.x, shot.z, nx, nz, box, shot.radius);
        if (t !== null && t < closest) { closest = t; hit = { kind: 'wall',entity:box }; }
      }
      const groundHit = segmentGroundDistance(level,shot,{x:shot.dirX,y:shot.dirY||0,z:shot.dirZ},travel,shot.radius);
      if (groundHit !== null) {
        const t = groundHit/Math.max(travel,1e-12);
        if (t < closest) { closest = t; hit = {kind:'ground'}; }
      }
      const targets = shot.owner === 'player' ? level.enemies.filter(e => e.alive && e.active!==false).map(entity => ({ kind: 'enemy', entity })) : [{ kind: 'player', entity: this.state.player }, ...(level.escort?.alive && !level.escort.reached ? [{ kind: 'escort', entity: level.escort }] : [])];
      if(shot.owner==='enemy'&&is3D&&Math.abs(finite(this.state.player.lean))>.03){
        const p=this.state.player,head=playerEye(level,p);
        // A peeking head is exposed beyond the central body, never an invulnerable camera.
        targets.push({kind:'player',entity:{x:head.x,z:head.z,y:head.y-groundHeight(level,head.x,head.z)-.14,height:.28,radius:.16}});
      }
      targets.push(...this._livingTargets());
      for (const candidate of targets) {
        if (!is3D && candidate.kind === 'player' && this.state.player.y > 1.25) continue;
        if(!is3D&&candidate.entity.animalId){const base=hitBodyBase(level,candidate.entity);if(shot.y<base-shot.radius||shot.y>base+bodyHeight(candidate.entity)+shot.radius)continue;}
        const t = is3D ? segmentBody3D(shot,{x:nx,y:ny,z:nz},worldBody(level,candidate.entity),shot.radius) : segmentCircle(shot.x, shot.z, nx, nz, candidate.entity, finite(candidate.entity.radius, 0.4) + shot.radius);
        if (t !== null && t < closest) { closest = t; hit = candidate; }
      }
      if (hit) {
        shot.x += (nx - shot.x) * closest; shot.y += (ny-shot.y)*closest; shot.z += (nz - shot.z) * closest;
        if(hit.kind==='ground'&&shot.groundBounces>0&&shot.dirY<0){
          // A single ground rebound; walls/doors still terminate the shot.
          // Range is consumed on the swept incoming part, so it cannot live forever.
          shot.groundBounces--;shot.dirY=Math.abs(shot.dirY);shot.remaining-=travel*closest;shot.speed*=.86;
          shot.y=Math.max(shot.y,groundHeight(level,shot.x,shot.z)+shot.radius)+.015;
          if(shot.remaining>0)retained.push(shot);
          this.state.effects.push({id:++this._serial,type:'spark',x:shot.x,y:shot.y,z:shot.z,life:.22,radius:.25});
          continue;
        }
        if(['merchant','civilian','vehicle'].includes(hit.kind))this._damageLiving(hit.kind,hit.entity,shot.damage,shot.owner);
        if (hit.kind === 'enemy') this._damageEnemy(hit.entity, shot.damage);
        if (hit.kind === 'player') this._damagePlayer(shot.damage, shot.sourceId,shot);
        if (hit.kind === 'escort') this._damageEscort(shot.damage);
        if(hit.kind==='wall')this._structureEvents(damageStructure(level,hit.entity.id,shot.damage,{owner:shot.owner,point:{x:shot.x,y:shot.y,z:shot.z}}));
        if (shot.splash && shot.owner === 'player') {
          for (const enemy of level.enemies) {
            if (!enemy.alive || enemy.active===false || enemy === hit.entity) continue;
            const target = is3D ? closestBodyPoint(shot,worldBody(level,enemy)) : enemy;
            const inBlast = is3D ? Math.hypot(target.x-shot.x,target.y-shot.y,target.z-shot.z) <= shot.splash : distance(enemy,shot) <= shot.splash+enemy.radius;
            if (inBlast && (is3D ? hasSight3D(level,shot,target) : hasSight(level,shot,enemy))) this._damageEnemy(enemy,shot.damage*0.65);
          }
          this._damageLivingArea(shot,shot.splash,shot.damage*.65,shot.owner,hit.entity);
          this._damageStructuresInArea(shot,shot.splash,shot.damage*.65,shot.owner,hit.kind==='wall'?hit.entity.structureId:null);
        }
        this.state.effects.push({ id: ++this._serial, type: shot.splash ? 'burst' : 'spark', x: shot.x, y: shot.y, z: shot.z, radius: shot.splash || 0.3, life: 0.3 });
      } else {
        shot.x = nx; shot.y = ny; shot.z = nz; shot.remaining -= travel;
        const b = level.bounds;
        if (shot.remaining > 0 && nx >= b.minX && nx <= b.maxX && nz >= b.minZ && nz <= b.maxZ) retained.push(shot);
      }
    }
    this.state.projectiles = retained;
  }

  _areaDamage(origin,radius,damage) {
    const level=this.state.level;
    for(const enemy of level.enemies){
      if(!enemy.alive || enemy.active===false)continue;
      const point=closestBodyPoint(origin,worldBody(level,enemy));
      if(Math.hypot(point.x-origin.x,point.y-origin.y,point.z-origin.z)<=radius && hasSight3D(level,origin,point))this._damageEnemy(enemy,damage);
    }
    this._damageLivingArea(origin,radius,damage,'player');
    this._damageStructuresInArea(origin,radius,damage,'player');
  }

  _structureEvents(events){
    for(const event of events||[]){
      const {type,text,...extra}=event;
      this._event(type,type==='structural-hit'?'':text||'',extra);
      if(type==='survivor-lost'&&this.state.status==='playing'){
        const reason=text||'房屋倒塌，受困旅人未能获救，本关失败。';
        this.state.status='dead';this.state.level.failureReason=reason;this.state.deathReason=reason;
        this.state.shopOpen=false;this.state.projectiles=[];this.state.hazards=[];this._clearHuntLetters();
      }
    }
  }

  _damageStructuresInArea(origin,radius,damage,owner='player',excludeStructureId=null){
    if(this.state.status!=='playing')return;
    const level=this.state.level,groups=new Map();
    for(const wall of level.walls){
      if(!wall.destructible||wall.structureId===excludeStructureId)continue;
      const local=boxLocalPoint(origin,wall),x=clamp(local.x,-wall.w/2,wall.w/2),z=clamp(local.z,-wall.d/2,wall.d/2),c=Math.cos(wall.rotation||0),s=Math.sin(wall.rotation||0);
      const point={x:wall.x+c*x+s*z,y:clamp(origin.y,wall.baseY,wall.baseY+wall.height),z:wall.z-s*x+c*z};
      const direction={x:point.x-origin.x,y:point.y-origin.y,z:point.z-origin.z},distance=Math.hypot(direction.x,direction.y,direction.z);if(distance>radius)continue;
      const blocked=blockers(level).some(other=>{if(other.id===wall.id)return false;const hit=segmentBoxDistance(origin,direction,other,distance);return hit!==null&&hit<distance-.025;});
      const ground=segmentGroundDistance(level,origin,direction,distance,.01);if(blocked||ground!==null&&ground<distance-.025)continue;
      const key=wall.structureId||wall.id,old=groups.get(key);if(!old||distance<old.distance)groups.set(key,{wall,distance,point});
    }
    // One blast/fire tick damages each structure once, independent of how many
    // facade panels are inside the radius. Solid intervening cover still works.
    for(const {wall,point}of groups.values())this._structureEvents(damageStructure(level,wall.id,damage,{owner,point}));
  }

  _finishThrow(shot) {
    if(shot.animalBomb){
      this._animalArea(shot,shot.blastRadius,shot.damage,shot.sourceId);
      this._damageStructuresInArea(shot,shot.blastRadius,shot.damage*.55,'enemy');
      this.state.effects.push({id:++this._serial,type:'burst',x:shot.x,y:shot.y,z:shot.z,radius:shot.blastRadius,life:.45});
      return;
    }
    const item=CONSUMABLES[shot.itemId];
    if(shot.itemId==='bomb'){
      this._areaDamage(shot,item.radius,item.damage);
      this.state.effects.push({id:++this._serial,type:'burst',itemId:'bomb',x:shot.x,y:shot.y,z:shot.z,radius:item.radius,life:.5});
    }else if(shot.itemId==='smoke'){
      this.state.hazards.push({id:++this._serial,type:'smoke',itemId:'smoke',x:shot.x,y:finite(shot.surfaceY,groundHeight(this.state.level,shot.x,shot.z)+.18),z:shot.z,radius:item.radius,height:item.height,remaining:item.duration,duration:item.duration});
      this._event('smoke-deployed','烟区已展开：可遮挡敌人瞄准，不能阻挡已发出的子弹。',{x:shot.x,z:shot.z,duration:item.duration});
    }else{
      // A bottle broken against a wall drips down on its near side. A bottle
      // landing on a crate/roof keeps that top surface instead of burning below.
      this.state.hazards.push({id:++this._serial,type:'fire',itemId:'molotov',x:shot.x,y:finite(shot.surfaceY,groundHeight(this.state.level,shot.x,shot.z)+.18),z:shot.z,radius:item.radius,remaining:item.duration,duration:item.duration,dps:item.dps});
    }
  }

  _updateThrown(shot,dt) {
    const level=this.state.level;
    shot.fuse=Math.max(0,shot.fuse-dt);
    let collided=false;
    if(!shot.stopped){
      const dx=shot.vx*dt,dy=shot.vy*dt-shot.gravity*dt*dt*.5,dz=shot.vz*dt,travel=Math.hypot(dx,dy,dz),dir={x:dx,y:dy,z:dz};
      let closest=travel,hitBox=null;
      for(const box of blockers(level)){
        const hit=segmentBoxDistance(shot,dir,box,travel,shot.radius);
        if(hit!==null&&hit<=closest){closest=hit;collided=true;hitBox=box;}
      }
      const ground=segmentGroundDistance(level,shot,dir,travel,shot.radius);
      if(ground!==null&&ground<=closest){closest=ground;collided=true;hitBox=null;}
      const t=travel>1e-9?closest/travel:0;
      shot.x+=dx*t;shot.y+=dy*t;shot.z+=dz*t;shot.vy-=shot.gravity*dt;
      if(hitBox && dy<0 && Math.abs(shot.y-(hitBox.baseY+hitBox.height+shot.radius))<.001)shot.surfaceY=hitBox.baseY+hitBox.height+.18;
      const b=level.bounds;
      if(shot.x<b.minX+shot.radius||shot.x>b.maxX-shot.radius||shot.z<b.minZ+shot.radius||shot.z>b.maxZ-shot.radius){
        shot.x=clamp(shot.x,b.minX+shot.radius,b.maxX-shot.radius);shot.z=clamp(shot.z,b.minZ+shot.radius,b.maxZ-shot.radius);collided=true;
      }
      if(collided){shot.stopped=true;shot.vx=0;shot.vy=0;shot.vz=0;}
    }
    if(shot.fuse<=0 || shot.itemId==='molotov'&&collided){this._finishThrow(shot);return false;}
    return true;
  }

  _updateHazards(dt) {
    for(const hazard of this.state.hazards){
      const active=Math.min(dt,hazard.remaining);
      if(active>0&&hazard.owner==='enemy'){
        if(hazard.type==='snare'){
          const p=this.state.player,point=closestBodyPoint(hazard,worldBody(this.state.level,p));
          if(Math.hypot(point.x-hazard.x,point.y-hazard.y,point.z-hazard.z)<=hazard.radius&&hasSight3D(this.state.level,hazard,point))p.animalSlowed=Math.max(finite(p.animalSlowed),.22);
        }else{
          hazard.tickRemaining=finite(hazard.tickRemaining)-active;
          if(hazard.tickRemaining<=0){this._animalArea(hazard,hazard.radius,hazard.dps*.5,hazard.sourceId);hazard.tickRemaining=.5;}
        }
      }else if(active>0&&(hazard.type==='fire'||(!hazard.type&&Number.isFinite(hazard.dps))))this._areaDamage(hazard,hazard.radius,hazard.dps*active);
      hazard.remaining=Math.max(0,hazard.remaining-dt);
    }
    this.state.hazards=this.state.hazards.filter(h=>h.remaining>0);
  }

  _updateEscort(dt) {
    const escort = this.state.level.escort;
    if (!escort || !escort.alive || escort.reached || !escort.started) return;
    if (distance(escort, this.state.player) > escort.followRadius) return;
    const waypoint = escort.waypoints[escort.waypointIndex];
    if (!waypoint) { escort.reached = true; this._event('escort-arrived', '货车安全到达终点'); return; }
    const d = distance(escort, waypoint), dir = normalize(waypoint.x - escort.x, waypoint.z - escort.z);
    if (d <= 0.35) { escort.waypointIndex += 1; return; }
    const amount = Math.min(d, escort.speed * dt);
    escort.facingX = dir.x; escort.facingZ = dir.z;
    this._move(escort, dir.x * amount, dir.z * amount);
  }

  getObjectives() { return this.state.level ? clone(this._objectives()) : []; }

  _objectives() {
    const level = this.state.level;
    if (!level) return [];
    const g = level.goals, rows = [];
    const add = (id, label, current, target) => rows.push({ id, label, current: Math.min(current, target), target, complete: current >= target });
    if(level.journey){const j=level.journey,s=activeJourneyStep(level);add('journey',j.completed?'✓ 地区任务完成':`地区任务 · ${s?.title||j.title}${s?.started?' · '+s.status:''}${j.carrying?' · 携带 '+j.carrying:''}`,j.stepIndex,j.steps.length);}
    if(level.hunt)rows.push(...huntObjectives(level));
    if (g.kills !== undefined) add('kills', '击败敌人', level.enemies.filter(e => !e.alive).length, g.kills === 'all' ? level.enemies.length : Math.max(0, finite(g.kills)));
    if(level.encounters.length)add('encounters','清除沿途遭遇',level.encounters.filter(e=>e.status==='cleared').length,level.encounters.length);
    for (const [goalKey, entities, flag, label] of [['collect', level.collectibles, 'collected', '收集印记'], ['switches', level.switches, 'active', '启动机关'], ['doors', level.doors, 'open', '开启通路']]) {
      if (g[goalKey] === undefined) continue;
      const requested = g[goalKey];
      if (Array.isArray(requested)) add(goalKey, label, requested.filter(id => entities.some(e => e.id === id && e[flag])).length, requested.length);
      else add(goalKey, label, entities.filter(e => e[flag]).length, Math.max(0, finite(requested)));
    }
    if (g.escort) add('escort', '护送抵达终点', level.escort?.reached && level.escort?.alive ? 1 : 0, 1);
    if (g.defendSeconds !== undefined) add('defend', '守住灯阵', level.defendedSeconds, Math.max(0, finite(g.defendSeconds)));
    if (g.boss) {
      const bosses = level.enemies.filter(e => e.type === 'boss' && !e.isEcho);
      add('boss', '击败守关首领', bosses.filter(e => !e.alive).length, Math.max(1, bosses.length));
    }
    level.objectiveStatus = rows;
    level.readyToExit = rows.length > 0 && rows.every(row => row.complete);
    return rows;
  }

  _interactionCandidates() {
    const level = this.state.level, p = this.state.player;
    if (!level||p.vault) return [];
    this._updateLetterState(false);
    const candidates = [
      ...(activeJourneyStep(level)?[{type:'journey',entity:activeJourneyStep(level),label:activeJourneyStep(level).title}]:[]),
      ...nearbyEvidence(level,p,e=>hasSight3D(level,{x:p.x,y:bodyBase(level,p)+1,z:p.z},{x:e.x,y:e.y+1,z:e.z})).map(entity=>({type:'evidence',entity,label:'调查'+entity.name})),
      ...level.doors.map(entity => ({ type: 'door', entity, label: entity.open ? '关闭门' : '打开门' })),
      ...level.switches.filter(s => !s.active).map(entity => ({ type: 'switch', entity, label: '启动机关' })),
      ...level.collectibles.filter(c => !c.collected).map(entity => ({ type: 'collectible', entity, label: `收集${entity.name || '印记'}` })),
      ...level.npcs.filter(n=>n.alive!==false).map(entity => ({ type: 'npc', entity, label: (entity.type === 'merchant' || entity.type === 'shop') ? '购买武器 / 补给' : '交谈' })),
      ...(level.survivors||[]).filter(s=>s.alive&&!s.rescued&&!s.following).map(entity=>({type:'survivor',entity,label:`招呼${entity.name||'受困旅人'}跟随`})),
      { type: 'exit', entity: level.exit, label: level.readyToExit ? '前往下一关' : '查看出口目标' },
    ];
    const riddleSite=level.hunt?.riddle&&level.collectibles.find(c=>c.id===level.hunt.riddleSiteId&&c.collected);
    if(riddleSite&&level.hunt.atRiddleSite)candidates.push({type:'riddle',entity:riddleSite,label:'拼词解谜'});
    if (level.escort && !level.escort.started && level.escort.alive) candidates.push({ type: 'escort', entity: level.escort, label: '开始护送' });
    const itemY=c=>c.absoluteY===true?finite(c.y):groundHeight(level,c.x,c.z);
    const vaultDistance=q=>Math.hypot(q.x-p.x,q.y-bodyBase(level,p),q.z-p.z);
    const vaults=(level.traversal?.vaults||[]).map(entity=>({entity,path:checkedVault(level,p,entity)})).filter(c=>c.path).map(c=>({type:'vault',entity:c.entity,path:c.path,label:c.entity.name||'翻窗进入',distance:Math.min(vaultDistance(c.entity.from),c.entity.oneWay?Infinity:vaultDistance(c.entity.to))+.1}));
    const candidateY=c=>c.type==='survivor'?finite(c.entity.y):c.type==='npc'?bodyBase(level,c.entity):itemY(c.entity);
    const nearby=candidates.map(c => ({ ...c, distance: c.entity.absoluteY===true||c.type==='survivor'||c.type==='npc' ? Math.hypot(c.entity.x-p.x,candidateY(c)-bodyBase(level,p),c.entity.z-p.z) : distance(c.entity, p) })).filter(c => {
      const range = c.type === 'exit' ? c.entity.radius : c.type === 'door' ? Math.max(c.entity.w, c.entity.d) / 2 + 1.5 : c.type==='riddle'?3:2.5;
      if (c.distance > range) return false;
      // The door itself is touchable, but another intervening wall is not.
      const blocking = blockers(level).filter(box => c.type !== 'door' || box.id !== c.entity.id);
      const origin={x:p.x,y:bodyBase(level,p)+1,z:p.z};
      const direction={x:c.entity.x-p.x,y:candidateY(c)+1-origin.y,z:c.entity.z-p.z};
      const rayLength=Math.hypot(direction.x,direction.y,direction.z);
      return !blocking.some(box => segmentBoxDistance(origin,direction,box,rayLength) !== null);
    });
    return [...nearby,...vaults].sort((a,b)=>a.distance-b.distance);
  }

  _updateInteraction() {
    if (this.state.status !== 'playing') { this.state.interaction = null; this.state.hint = ''; return; }
    const candidate = this._interactionCandidates()[0];
    this.state.interaction = candidate ? { type: candidate.type, id: candidate.entity.id || 'exit', label: candidate.label, distance: candidate.distance } : null;
    this.state.hint = candidate ? `E · ${candidate.label}` : this.state.level.readyToExit ? '目标完成，前往光门并按 E' : '探索场景，完成左侧目标';
  }

  interact() {
    if (this.state.status !== 'playing') return { ok: false, reason: '当前不能交互' };
    this._objectives();
    const candidate = this._interactionCandidates()[0];
    if (!candidate) return { ok: false, reason: '附近没有可交互对象' };
    const { entity, type } = candidate, level = this.state.level;
    if(type==='journey'){
      const result=interactChapterJourney(level,this.state.player);
      this._journeyResult(result);
      this._objectives();this._updateInteraction();
      return {...result,type,id:entity.id};
    } else if(type==='evidence'){
      entity.collected=true;if(level.hunt)level.hunt.riddleRevealed=true;
      this._event('district-evidence','发现'+entity.name+' · 地区笔记已记录',{evidenceId:entity.id});
    } else if(type==='vault'){
      this.state.player.vault=candidate.path;this.state.player.vy=0;this.state.player.grounded=false;
      this._event('vault',entity.name||'翻过窗台',{vaultId:entity.id});
    } else if (type === 'door') {
      if(entity.huntSeal){refreshHuntKeys(level);if(entity.locked){const reason=level.journey&&!level.journey.completed?`先完成地区任务「${activeJourneyStep(level)?.title}」，并集齐密码与战斗两半钥匙。`:'任务房需要密码半钥与战斗半钥，请继续收集线索并完成击杀数。';this._event('notice',reason);return {ok:false,reason};}}
      const keyFound = entity.keyId && level.collectibles.some(c => c.id === entity.keyId && c.collected);
      const keysFound = entity.keyIds?.length && entity.keyIds.every(id => level.collectibles.some(c => c.id === id && c.collected));
      const switchFound = entity.switchId && level.switches.some(s => s.id === entity.switchId && s.active);
      if (!entity.open && entity.locked && !keyFound && !keysFound && !switchFound) { this._event('notice', '门已锁住，请寻找钥匙或机关。'); return { ok: false, reason: '门已锁住' }; }
      if (entity.open) {
        const occupants = [this.state.player, ...level.enemies.filter(e => e.alive && e.active!==false), ...(level.escort?.alive ? [level.escort] : [])];
        if (occupants.some(e => collidesCircle(e.x, e.z, finite(e.radius, 0.4), entity))) return { ok: false, reason: '门口有人，暂时无法关门' };
      }
      entity.open = !entity.open;
      this._event('door', entity.open ? '门已打开，可以通过' : '门已关闭，阻挡敌人', { doorId: entity.id, open: entity.open });
    } else if (type === 'switch') {
      if (entity.requires?.some(id => !level.switches.some(s => s.id === id && s.active))) {
        this._event('notice', entity.lockedMessage || '请先启动前一道机关。');
        return { ok: false, reason: '机关启动顺序尚未满足' };
      }
      entity.active = true;
      for (const door of level.doors) if (entity.doorIds?.includes(door.id) || door.switchId === entity.id) { door.locked = false; door.open = true; }
      this._event('switch', '机关已启动，通路打开', { switchId: entity.id });
    } else if (type === 'collectible') {
      if(entity.kind==='supply'){
        const item=CONSUMABLES[entity.supplyId];
        if(!item)return {ok:false,reason:'补给类型不可用'};
        const inventory=this.state.player.consumables;
        if(inventory[item.id]>=99)return {ok:false,reason:'这类补给已满'};
        inventory[item.id]=Math.min(99,inventory[item.id]+integer(entity.amount,1,1,99));
      }
      entity.collected = true;
      if(level.hunt?.riddle&&entity.kind!=='supply')level.hunt.riddleRevealed=true;
      this._event('collect', `获得${entity.name || '印记'}`, { collectibleId: entity.id });
    } else if(type==='riddle'){
      this._event('riddle-station','',{siteId:entity.id,lettersComplete:level.hunt.lettersComplete});
    } else if(type==='survivor'){
      entity.following=true;entity.accompanying=true;
      this._event('notice',`${entity.name||'受困旅人'}开始跟随，请带他离开房屋`,{survivorId:entity.id,structureId:entity.structureId});
    } else if (type === 'escort') {
      entity.started = true;
      this._event('escort-start', '护送开始。留在货车附近，引导它安全抵达。');
    } else if (type === 'npc') {
      this.state.shopOpen = entity.type === 'merchant' || entity.type === 'shop';
      this._event('npc', this.state.shopOpen ? '商店已打开' : entity.dialogue || '路上小心，旅人。', { npcId: entity.id });
    } else if (type === 'exit') {
      if (!level.readyToExit) { this._event('notice', '还有目标尚未完成，光门暂未开启。'); return { ok: false, reason: '请完成所有关卡目标' }; }
      this._completeLevel();
    }
    this._objectives(); this._updateInteraction();
    return { ok: true, type, id: entity.id || 'exit' };
  }

  _completeLevel() {
    const level = this.state.level, progress = this.state.progress;
    if (this.state.status !== 'playing' || !level.readyToExit) return;
    const firstReward = !progress.rewardedLevelIds.includes(level.id);
    if (!progress.completedLevelIds.includes(level.id)) progress.completedLevelIds.push(level.id);
    const defeated=level.enemies.find(e=>e.id===level.hunt?.bossId)||level.enemies.find(e=>e.type==='boss'&&!e.alive);
    if(defeated&&!defeated.alive&&BOSS_BY_ID[defeated.bossKind]?.levelId===level.id&&!progress.defeatedBossKinds.includes(defeated.bossKind))progress.defeatedBossKinds.push(defeated.bossKind);
    if (firstReward) {
      progress.rewardedLevelIds.push(level.id);
      const gold = Math.max(0, Math.floor(finite(level.reward?.gold, 80))), xp = Math.max(0, Math.floor(finite(level.reward?.xp, 60)));
      this.state.player.gold += gold; this._awardXP(xp);
      this._event('reward', `首次通关奖励 · +${gold} 铜钱 / +${xp} 经验`, { gold, xp, levelId: level.id });
    }
    this._updateUnlocks();
    this.state.status = 'complete';
    this.state.shopOpen = false;
    this.state.projectiles = [];
    this.state.hazards = [];
    const index = this.levels.findIndex(l => l.id === level.id);
    level.nextLevelId = this.levels[index + 1]?.id || null;
    level.firstCompletion = firstReward;
    this._event('level-complete', `${level.title}通关！${level.nextLevelId ? '下一关已解锁。' : '本次旅程全部完成。'}`, { levelId: level.id, nextLevelId: level.nextLevelId, firstReward });
  }

  _pruneAnimalEnemies(){
    const level=this.state.level;
    if(!level?.hunt||!level.animalEncounter?.enabled)return;
    // Hunt kills and dropped letters have independent records. Both animal and
    // local reinforcements keep their two-second death animation, then release
    // runtime state after four seconds. Authored enemies and Bosses are kept.
    level.enemies=level.enemies.filter(enemy=>(!enemy.animalId&&enemy.encounterOrigin!=='district')||enemy.alive||!Number.isFinite(enemy.defeatedAt)||level.elapsed-enemy.defeatedAt<=4);
  }

  step(seconds, input = {}) {
    if (this.state.status !== 'playing'||this.state.shopOpen) return this.state;
    const dt = clamp(finite(seconds), 0, 0.25);
    if (dt <= 0) return this.state;
    const p = this.state.player, level = this.state.level;
    p.aiming=!!input.aiming&&canAim(p.weaponId);
    let mx = clamp(finite(input.moveX), -1, 1), mz = clamp(finite(input.moveZ), -1, 1);
    const movementLength = Math.hypot(mx, mz);
    if (movementLength > 1) { mx /= movementLength; mz /= movementLength; }
    const ax = finite(input.aimX), az = finite(input.aimZ);
    const aimLength = Math.hypot(ax,finite(input.aimY),az);
    p.aimY = Number.isFinite(input.aimY) ? (aimLength > 1e-8 ? clamp(input.aimY/aimLength,-1,1) : 0) : null;
    if (Math.hypot(ax, az) > 0.001) { const dir = normalize(ax, az); p.facingX = dir.x; p.facingZ = dir.z; }
    else if (movementLength > 0.01 && !input.attack) { const dir = normalize(mx, mz); p.facingX = dir.x; p.facingZ = dir.z; }
    if(input.stance){const changed=setPlayerStance(level,p,input.stance);if(!changed.ok)this._event('notice',changed.reason);}
    if (typeof input.weapon === 'string' && input.weapon !== p.weaponId) this.equip(input.weapon);
    if (input.potion && !this._previousInput.potion) this.usePotion();
    if(typeof input.consumable==='string' && input.consumable!==this._previousInput.consumable)this.useConsumable(input.consumable,input);
    if (input.jump && !this._previousInput.jump && stanceProfile(p).id==='stand'&&p.grounded && !p.vault && p.stamina >= 10) { p.vy = 6.8; p.grounded = false; p.stamina -= 10; }
    if (input.interact && !this._previousInput.interact) this.interact();
    this._previousInput = { jump: !!input.jump, interact: !!input.interact, potion: !!input.potion,consumable:typeof input.consumable==='string'?input.consumable:null };
    const substeps = Math.max(1, Math.ceil(dt / (1 / 60))), subdt = dt / substeps;
    for (let i = 0; i < substeps && this.state.status === 'playing'; i++) {
      level.elapsed += subdt;
      this._structureEvents(stepStructures(level,subdt));
      if(this.state.status!=='playing')break;
      this._updateWeather(subdt);
      this._updateEncounters(subdt);
      this._updateHunt(subdt);
      this._updateCombatTempo(subdt);
      p.attackCooldown = Math.max(0, p.attackCooldown - subdt);
      p.throwCooldown = Math.max(0,p.throwCooldown-subdt);
      p.invuln = Math.max(0, p.invuln - subdt);
      const posture=stepPlayerTactics(level,p,subdt,{lean:input.lean,yaw:input.yaw});
      stepPanGuard(p,subdt,input.guard);
      const sprinting = posture.sprintAllowed&&!p.guarding&&!p.vault && !!input.sprint && movementLength > 0.01 && p.stamina >= subdt * 24;
      p.sprinting = sprinting;
      p.stamina = clamp(p.stamina + (sprinting ? -24 : p.guarding?0:19+growthBonuses(p).staminaRecovery) * subdt, 0, p.maxStamina);
      p.animalSlowed=Math.max(0,finite(p.animalSlowed)-subdt);
      const speed = (sprinting ? 7.2 : 4.3)*posture.speedMultiplier*(p.guarding?PAN_GUARD.moveMultiplier:1)*(p.animalSlowed>0?.55:1)*(level.journey?.carrySpeedMultiplier||1);
      if(p.vault){
        p.vault.elapsed=Math.min(p.vault.duration,p.vault.elapsed+subdt);
        const position=vaultPosition(p.vault,p.vault.elapsed/p.vault.duration);
        // Recheck in case a door closed after the action began.
        if(bodySpaceFree(level,{x:position.x,z:position.z,absoluteY:position.y},p.radius,bodyHeight(p))){
          p.x=position.x;p.z=position.z;p.y=position.y-groundHeight(level,p.x,p.z);p.moving=true;
          if(p.vault.elapsed>=p.vault.duration){const drop=p.vault.drop;p.vault=null;p.grounded=!drop;p.vy=0;p.supportId=drop?null:supportBelow(level,p.x,p.z,position.y+.04)?.id||null;}
        }else {p.vault=null;p.vy=0;p.grounded=false;}
      }else {
        p.moving = this._move(p, mx * speed * subdt, mz * speed * subdt) > 0.00001;
        stepPlayerVertical(level,p,subdt);
      }
      if (input.attack&&!p.vault) this._attack();
      this._civilEvents(stepEvacuation(level,p,subdt));
      this._civilEvents(stepMerchants(level,subdt,p));
      this._civilEvents(stepWanderingSurvivors(level,p,subdt));
      this._updateEnemies(subdt);
      if (this.state.status !== 'playing') break;
      this._updateProjectiles(subdt);
      if (this.state.status !== 'playing') break;
      this._updateHazards(subdt);
      if (this.state.status !== 'playing') break;
      this._updateEscort(subdt);
      const journeyStep=activeJourneyStep(level);
      // The journey engine checks range/height before sight; avoid raycasting
      // every distant enemy on every subframe while carrying or reading clues.
      if(journeyStep?.started)this._journeyResult(updateChapterJourney(level,p,subdt,{threats:level.enemies}));
      if (this.state.status !== 'playing') break;
      this._updateLetterState();
      if (level.goals.defendSeconds !== undefined && (!level.defendAfterEscort || level.escort?.reached)) {
        const zone = level.defendZone || { x: level.spawn.x, z: level.spawn.z, radius: 6, blockingRadius: 0 };
        const inZone = distance(p, zone) <= finite(zone.radius, 6);
        const contested = level.enemies.some(e => e.alive && e.active!==false && distance(e, zone) <= finite(zone.blockingRadius, 0));
        level.defenseContested = contested;
        level.defensePlayerInside = inZone;
        if (inZone && !contested) level.defendedSeconds = Math.min(level.goals.defendSeconds, level.defendedSeconds + subdt);
      }
      for (const effect of this.state.effects) effect.life -= subdt;
      this.state.effects = this.state.effects.filter(effect => effect.life > 0);
    }
    this._pruneAnimalEnemies();
    this._objectives();
    this._updateInteraction();
    if (this.state.shopOpen && !this._canTrade()) this.state.shopOpen = false;
    return this.state;
  }
}
