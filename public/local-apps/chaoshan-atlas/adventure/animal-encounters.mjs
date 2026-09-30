/** Desktop animal encounters are opt-in data; the original enemy rules remain
 * usable without artwork, a browser or an animal catalog. */
const unit = rng => {
  const value = Number(rng());
  return Number.isFinite(value) ? Math.max(0, Math.min(1 - Number.EPSILON, value)) : 0;
};
const positive = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;
const signature = ids => [...ids].sort().join('|');

// Stage enemy roles express the authored regional tactics. Prefer creatures
// with matching anatomy or actual combat moves; never change their own rules
// just to fit a region, and never remove other unseen creatures from the deck.
const STAGE_TRAITS = {
  doodler:{moves:['retreat-shot','burst-shot'],families:['humanoid','robot']},
  inkling:{moves:['claw-combo','flank-hunt'],families:['cat','dog','rabbit','rodent']},
  crab:{moves:['ricochet-charge','tail-sweep','guard-counter'],families:['crab','turtle','fish','penguin']},
  archer:{moves:['sniper','retreat-shot','burst-shot'],families:[]},
  lantern:{moves:['lob-bomb','fan-shot','ember-trail'],families:['slime','plant']},
  shade:{moves:['orbit-strike','flank-hunt','feint-charge'],families:['ghost','fox','feline']},
  brute:{moves:['leap-slam','bodyguard','guard-counter','spin-melee'],families:['heavy','bear','panda']},
  wraith:{moves:['pounce','orbit-strike','flank-hunt'],families:['ghost','bird','bat','owl']},
  imp:{moves:['claw-combo','feint-charge','snare-trail','venom-pool'],families:['monkey','insect','spider']},
};
const regionalPreferences=new WeakMap();
export function animalRegionalPreferences(animals,enemyTypes=[]){
  if(!Array.isArray(animals))return [];
  const types=[...new Set(Array.isArray(enemyTypes)?enemyTypes:[])].filter(type=>STAGE_TRAITS[type]).sort();
  if(!types.length)return [];
  let cache=regionalPreferences.get(animals);if(!cache){cache=new Map();regionalPreferences.set(animals,cache);}
  const key=types.join('|');if(cache.has(key))return cache.get(key);
  const moves=new Set(types.flatMap(type=>STAGE_TRAITS[type].moves)),families=new Set(types.flatMap(type=>STAGE_TRAITS[type].families));
  const primary=animals.filter(animal=>families.has(animal.family)||moves.has(animal.combatProfile?.primary));
  // A ubiquitous defensive secondary should not make virtually the entire
  // library a shoreline/armour match. Use it only if no primary/body matches.
  const matching=primary.length?primary:animals.filter(animal=>moves.has(animal.combatProfile?.secondary));
  const ids=Object.freeze(matching.map(animal=>animal.id));
  cache.set(key,ids);return ids;
}

/** Legacy/UI preview helper only. Actual spawning uses the persistent deck
 * below, so a six-card preview never limits the run to six repeating species. */
export function createAnimalRoster(animals, rng = Math.random, previousIds = [], count = 6) {
  const ids = [...new Set((Array.isArray(animals) ? animals : []).map(a => a?.id).filter(id => typeof id === 'string' && id))];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(unit(rng) * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const size = Math.min(ids.length, Math.max(0, Math.floor(Number.isFinite(count) ? count : 6)));
  const selected = ids.slice(0, size);
  if (size && ids.length > size && signature(selected) === signature(Array.isArray(previousIds) ? previousIds : [])) {
    selected[size - 1] = ids[size];
  }
  return selected;
}

/** Shape determines weapon eligibility. A no-hands ranged request becomes a
 * charge; it can never produce a floating gun or a ranged projectile. */
export function animalEnemySpec(animal) {
  if (!animal || typeof animal.id !== 'string' || !animal.id) return null;
  const hasHands = animal.hasHands === true;
  const mode = animal.attackMode === 'ranged' && hasHands ? 'ranged'
    : animal.attackMode === 'melee' ? 'melee' : 'charge';
  const roles = {
    ranged: {type:'doodler',behavior:'pencil',hp:44,damage:7,speed:1.55,attackRange:10,preferredRange:6,cooldown:1.85,telegraphDuration:.8,projectileSpeed:6,xp:24,gold:12},
    charge: {type:'crab',behavior:'crab',hp:64,damage:11,speed:1.7,attackRange:5.5,cooldown:1.65,telegraphDuration:.85,chargeSpeed:9,chargeDuration:.55,recoveryDuration:1.15,projectileSpeed:0,xp:28,gold:14},
    melee: {type:'inkling',hp:46,damage:8,speed:2,attackRange:1.5,cooldown:1.15,projectileSpeed:0,xp:22,gold:11},
  };
  const role = roles[mode];
  const combatProfile = animal.combatProfile && typeof animal.combatProfile === 'object'
    ? JSON.parse(JSON.stringify(animal.combatProfile)) : undefined;
  const stats = {};
  for (const key of ['hp','damage','speed','attackRange','preferredRange','cooldown','telegraphDuration',
    'chargeSpeed','chargeDuration','recoveryDuration','projectileSpeed','xp','gold']) {
    const value = combatProfile?.stats?.[key];
    if (Number.isFinite(value) && value >= 0) stats[key] = value;
  }
  // Natural melee creatures never acquire firearms from a malformed profile.
  if (!hasHands) stats.projectileSpeed = 0;
  return {...role,...stats,animalId:animal.id,animalAttackMode:mode,animalHasHands:hasHands,
    combatProfile,
    name:animal.name || animal.id,weaponId:hasHands ? (animal.weaponId || (mode === 'ranged' ? 'rifle' : 'knife')) : null,
    weatherType:animal.weatherType || role.type,height:positive(animal.height,1.35),radius:positive(animal.radius,.42),
    muzzleHeightRatio:Math.min(1,positive(animal.muzzleHeightRatio,.65)),hoverHeight:0};
}

/** Every successful spawn advances the full library's persistent deck. The
 * caller must commit animalDeckTicket only after placement has succeeded, or
 * release it on failure. Living images (including aliases) are never repeated.
 * Legacy encounters without a deck exhaust their list instead of looping it. */
export function nextAnimalEncounter(encounter, animals, rng = Math.random, deck = null, excludeIds = [], region = null) {
  if (!encounter?.enabled || !Array.isArray(animals)) return null;
  if (deck) {
    // The opening preview remains exact, including when capacity spreads its
    // first six successful spawns across several waves. Preferences begin only
    // after these promised animals have really entered the level.
    const openingRemaining=Math.max(0,(encounter.rosterIds?.length||0)-(encounter.spawned??encounter.cursor??0));
    const preferIds=openingRemaining?[]:animalRegionalPreferences(animals,region?.enemyTypes);
    const ticket = deck.peek({excludeIds,preferIds});
    if (!ticket) return null;
    const spec = animalEnemySpec(animals.find(animal => animal.id === ticket.id));
    if (!spec) { deck.release(ticket); return null; }
    return {...spec, animalDeckTicket:ticket};
  }
  const index = Number.isSafeInteger(encounter.cursor) ? encounter.cursor : 0;
  const id = encounter.rosterIds?.[index];
  if (!id || excludeIds.includes(id)) return null;
  return animalEnemySpec(animals.find(animal => animal.id === id));
}
