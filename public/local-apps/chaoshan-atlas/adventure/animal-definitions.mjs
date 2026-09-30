import {ANIMAL_CATALOG_DATA, ANIMAL_UNIQUE_VISUAL_COUNT} from './animal-catalog-data.mjs';
import {ANIMAL_CATALOG_PROFILES} from './animal-catalog-profiles.mjs';
import {ANIMAL_MOVES} from './animal-combat.mjs';
// The first ten creatures from the user's existing desktop library. These are
// animated original sprite sheets placed in the 3D world, not new 3D meshes.
const animals = [
  { id: 'byte-bunny', muzzleHeightRatio: .27, name: '奶油兔', hasHands: true, attackMode: 'ranged', weaponId: 'ink-pistol', height: 1.55, radius: .38, color: '#e9b4c1', weaponAnchor: [.22, .39], description: '蓝领巾与钥匙吊坠的奶油兔，举起短墨枪瞄准，射击后有短暂后坐停顿。', counter: '看到举枪预警就侧移，趁射击后的空隙靠近。' },
  { id: 'silver-shorthair', name: '薄荷猫', hasHands: false, attackMode: 'charge', height: 1.22, radius: .39, color: '#9eaaa4', description: '保留银渐层的原形象与跑步动作，伏低后向锁定方向扑击。', counter: '不要沿它的正前方倒退；预警结束前向侧面跑开。' },
  { id: 'prompt-penguin', name: '冰川企鹅', hasHands: false, attackMode: 'charge', height: 1.25, radius: .4, color: '#6aa3c4', description: '抱着卷轴的企鹅摇摆前进，靠近后用身体直线冲撞。', counter: '利用墙角改变路线，等它冲过头后反击。' },
  { id: 'fine-pup', name: '薰衣草小狗', hasHands: false, attackMode: 'charge', height: 1.22, radius: .37, color: '#d78b35', description: '沿用桌面的名字与戴帽橙色小狗原画；奔跑追赶，蓄力后向前扑撞。', counter: '保持横向移动，避免在狭窄道路上被正面扑中。' },
  { id: 'little-deer', name: '秋日小鹿', hasHands: false, attackMode: 'charge', height: 1.65, radius: .43, color: '#d89942', description: '红围巾的小鹿踏蹄追击，低身预警后快速冲撞。', counter: '看清冲撞方向再侧移，撞墙后的停顿最适合反击。' },
  { id: 'nightly-fox', name: '北极小狐狸', hasHands: false, attackMode: 'charge', height: 1.17, radius: .36, color: '#a296d4', description: '白色尖耳狐狸轻快奔跑，压低身体后发动短距离扑击。', counter: '留出侧移空间，别让多只狐狸交叉封住退路。' },
  { id: 'cloudy', muzzleHeightRatio: .53, name: '云朵熊猫', hasHands: true, attackMode: 'ranged', weaponId: 'ink-carbine', height: 1.45, radius: .43, color: '#9ecbc2', weaponAnchor: [.19, .49], description: '坐在小云朵上的熊猫保留抬臂动画，持短卡宾墨枪远程射击。', counter: '借围墙挡住弹道，等它停顿时换位。' },
  { id: 'peri-the-owl', name: '月光猫头鹰', hasHands: false, attackMode: 'charge', height: 1.16, radius: .4, color: '#57b691', description: '戴圆眼镜的绿色猫头鹰挥翅追击，短暂蓄力后向前掠扑。', counter: '注意脚边预警圈，向其冲刺路线的两侧闪避。' },
  { id: 'zichaoxiong', muzzleHeightRatio: .34, name: '自嘲熊', hasHands: true, attackMode: 'ranged', weaponId: 'ink-pistol', height: 1.6, radius: .45, color: '#b798b3', weaponAnchor: [.26, .33], description: '圆身白熊保留原本的抬手与奔跑动作，用手中的墨枪瞄准射击。', counter: '它举手时准备侧移，连续后退容易被同一路线的墨弹追上。' },
  { id: 'crabbo', name: '机械钳蟹', hasHands: false, attackMode: 'melee', height: 1.15, radius: .53, color: '#d47c3c', description: '橙色机械钳蟹用多足横移追赶，贴近后挥动前钳；没有附加枪械。', counter: '别被挤在墙边，保持距离并在它挥钳后出手。' },
];

export const FEATURED_ANIMAL_IDS = Object.freeze(animals.map(animal=>animal.id));
const featuredById=Object.fromEntries(animals.map(animal=>[animal.id,animal]));
const rangedMoves=new Set(['retreat-shot','burst-shot','fan-shot','sniper','lob-bomb']);
const chargeMoves=new Set(['pounce','leap-slam','ricochet-charge','feint-charge','ember-trail']);
export const DESKTOP_ANIMALS=Object.freeze(ANIMAL_CATALOG_DATA.map(entry=>{
 const profile=ANIMAL_CATALOG_PROFILES[entry.id];
 if(!profile)throw new Error(`Missing animal profile: ${entry.id}`);
 const featured=featuredById[entry.id];
 const moves=[profile.combatProfile.primary,profile.combatProfile.secondary].filter(Boolean);
 const mode=profile.hasHands&&moves.some(move=>rangedMoves.has(move))?'ranged':moves.some(move=>chargeMoves.has(move))?'charge':'melee';
 const primary=ANIMAL_MOVES[moves[0]],secondary=ANIMAL_MOVES[moves[1]];
 const weaponId=profile.hasHands?(moves.includes('healer')||moves.includes('fan-shot')?'ink-staff':mode==='ranged'?(moves.includes('lob-bomb')?'ink-bomb':featured?.weaponId||'ink-pistol'):'ink-blade'):null;
 const originalWeapon=typeof profile.usesOriginalWeapon==='boolean'?profile.usesOriginalWeapon:!featured&&/\b(sword|katana|blade|dagger|lightsaber|ukulele|guitar|wand|staff|gun|pistol|rifle|bow|crossbow|shield)\b|手持.{0,6}(剑|劍|刀|杖|枪|槍|盾)/i.test(entry.originalDescription||'');
 return Object.freeze({...entry,...profile,assetHash:entry.sha256,name:featured?.name||entry.name,attackMode:mode,
  height:featured?.height||profile.height,radius:featured?.radius||profile.radius,
  combatType:mode==='ranged'?'doodler':mode==='charge'?'crab':'inkling',
  weatherType:mode==='ranged'?'doodler':mode==='charge'?'crab':'inkling',
  color:featured?.color||'#b8c8ba',weaponId,usesOriginalWeapon:originalWeapon,
  weaponAnchor:featured?.weaponAnchor||[.2,.32],muzzleHeightRatio:featured?.muzzleHeightRatio||.39,
  description:`${primary.name}：${primary.description}${secondary?' '+secondary.name+'作为条件招式。':''}`,
  counter:secondary?`${primary.description}留意它在${({hurt:'受伤后',close:'靠近你时',blocked:'路线受阻时',ally:'同伴受伤时',surrounded:'被包围时','after-primary':'第一招结束后'})[profile.combatProfile.secondaryWhen]||'交手中'}改用${secondary.name}。`:primary.description,
 });
}));
export const DESKTOP_ANIMAL_BY_ID=Object.freeze(Object.fromEntries(DESKTOP_ANIMALS.map(animal=>[animal.id,animal])));
export const DESKTOP_ANIMAL_COUNTS=Object.freeze({catalog:DESKTOP_ANIMALS.length,unique:ANIMAL_UNIQUE_VISUAL_COUNT,static:DESKTOP_ANIMALS.filter(a=>a.sourceStatic).length});
