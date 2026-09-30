// These are original game creatures inspired by visible places and materials.
// Their names and stories are fiction, not claims about local religious lore.
import {CLOWN_BOSSES} from './clown-bosses.mjs';
export const REGIONAL_BOSSES = Object.freeze([
  {id:'arcade-wraith',levelId:'small-park',name:'骑楼缚影',region:'汕头小公园',epithet:'悬在旧招牌下的无足恶灵',description:'破布般的纸身没有双腿，拱廊形头冠下藏着一张空白面孔；细长袖爪在招牌链条间游动。',attackStyle:'aimed-pair',weakness:'双发瞄准弹锁定后侧移，趁袖爪回收时反击。',color:0x922e50},
  {id:'bridge-serpent',levelId:'guangji',name:'盘桥墨蛟',region:'潮州广济桥',epithet:'把桥索盘成身躯的蛇魔',description:'绳结状的盘尾托起长颈，石梁形额甲与梭船形下颌张开，背鳍像被撕碎的桥亭檐线。',attackStyle:'sine-fan',weakness:'沿蛇形弹幕的空隙移动，避开扇形波纹的交汇点。',color:0x713c8c},
  {id:'bronze-oni',levelId:'jieyang-tower',name:'角鼎凶魁',region:'揭阳楼',epithet:'三足立地的铜鼎恶魔',description:'方鼎化为躯壳，双耳变成回卷巨角，三条短足支撑沉重的拳臂；正面铜面露出整齐的方齿。',attackStyle:'three-lanes',weakness:'观察三条射击通道的预兆，在通道之间换位。',color:0xa54b37},
  {id:'beacon-siren',levelId:'lighthouse',name:'灯魇海妖',region:'南澳长山尾',epithet:'以灯桩为冠的潮汐魅影',description:'修长的鱼尾没有人脚，胸腔亮着纸灯，头顶旋转的灯冠照出两片鳍耳与弯曲海藻手指。',attackStyle:'spiral',weakness:'顺着旋转弹圈的空隙环移，不要逆着密集一侧穿越。',color:0xa83458},
  {id:'ancestral-marionette',levelId:'puning-deanli',name:'古厝牵丝偶',region:'普宁德安里',epithet:'六臂木偶与看不见的提线人',description:'木面具下垂着六条关节分明的手臂，横梁与提线悬在身后，踝部小铃随着不协调的步伐摇晃。',attackStyle:'cross-stitch',weakness:'交叉弹线之间保留缝隙，等交点经过后再切线。',color:0x8c3155},
  {id:'pagoda-eye',levelId:'chaoyang-wenguang',name:'塔瞳巡夜者',region:'潮阳文光塔',epithet:'悬空三层塔身中的独眼',description:'三层八角塔盘分离悬浮，巨大的独眼在中央缓缓转动，塔铃和四片锋利纸符随视线公转。',attackStyle:'orbit-ring',weakness:'看清环形弹列的缺口，保持移动等轨道散开。',color:0x74428f},
  {id:'lake-hydra',levelId:'chaonan-cuihu',name:'翠湖三首魇',region:'潮南仙湖',epithet:'三张嘴争抢同一道倒影',description:'宽阔的鳞腹浮在纸波之上，三条弯颈各长出不同的头冠，张开的嘴将湖面反光切成碎片。',attackStyle:'bouncing-fan',weakness:'避开第一轮扇弹后继续观察反弹方向，不停在岸角。',color:0x62438c},
  {id:'porcelain-widow',levelId:'chenghai-chen',name:'瓷甲织梦蛛',region:'澄海陈慈黉故居',epithet:'以碎瓷编织围网的八足恶灵',description:'釉白腹甲裂成多片花窗形瓷片，八条细长关节足撑起红眼面罩，螯牙与纺丝器藏在腹下。',attackStyle:'web-fan',weakness:'贴着网状扇弹的开口前进，避免被两侧弹线夹住。',color:0x9c365f},
  {id:'cloud-harpy',levelId:'chaoan-tianchi',name:'天池云翼妖',region:'凤凰天池',epithet:'展开折纸长翼的山巅猎手',description:'钩喙、羽冠和两只利爪悬在云团之上，双翼由层叠纸羽构成，展开时像一张撕裂的山景。',attackStyle:'wing-burst',weakness:'双翼展开就是弹群预兆，向翼尖外侧拉开位置。',color:0x794598},
  {id:'octagon-jailer',levelId:'raoping-daoyun',name:'八角缄锁灵',region:'饶平道韵楼',epithet:'把自身关进八角枷中的巨灵',description:'八角门框围住一张囚面，两臂分别挂着锁环与重锤，胸前悬着巨大的锁孔；脚边铁链永不落地。',attackStyle:'octagon-ring',weakness:'在八向放射间隙换位，下一轮放射前离开原位置。',color:0x8b385f},
  {id:'sea-revenant',levelId:'huilai-jinghai',name:'靖海沉锚鬼',region:'靖海古城',epithet:'一只手永远拖着沉船的锚',description:'被海藻包裹的水鬼披着破旧船帆，一臂化为巨大船锚，另一臂攀着断索，空眼窝里漂着两点红墨。',attackStyle:'anchor-volley',weakness:'重弹连射前会定向，横向离开落点后再回身射击。',color:0x753b7a},
  {id:'cascade-colossus',levelId:'jiexi-falls',name:'瀑石裂渊像',region:'黄满寨瀑布',epithet:'把整道纸瀑披在肩上的石魔',description:'不规则巨石叠出宽肩与四方双拳，额间裂缝形成一只独眼，层叠纸瀑从肩背垂下，脚边不断溅出水纹。',attackStyle:'cascade-barrage',weakness:'连续弹幕有节拍，利用短暂间隔换到下一处空地。',color:0x664585},
].map(item => Object.freeze(item)));

export const BOSS_CATALOG = Object.freeze([...REGIONAL_BOSSES,...CLOWN_BOSSES]);
export const BOSS_BY_ID = Object.freeze(Object.fromEntries(BOSS_CATALOG.map(item => [item.id, item])));
export const BOSS_BY_LEVEL = Object.freeze(Object.fromEntries(REGIONAL_BOSSES.map(item => [item.levelId, item])));
