import {positionChaoyangPlaces} from './chaoyang-places.mjs';

export const jieyangCollectionIds=Object.freeze([
  "jieyang-tower",
  "jieyang-jinxian",
  "jieyang-academy",
  "jieyang-chenghuang",
  "jieyang-guandi",
  "jieyang-shuangfeng",
  "jieyang-huangqi",
  "jieyang-west-lake",
  "jieyang-rongjiang",
  "jieyang-yangmei",
  "jieyang-wangtian",
  "jieyang-wanzhu",
  "jieyang-square",
  "jieyang-fountain",
  "jiexi-falls",
  "jiexi-forest",
  "jiexi-jingming",
  "jiexi-dayang",
  "jiexi-sanshan",
  "jieyang-guangde",
  "puning-deanli",
  "puning-nanxi",
  "puning-hongyang",
  "jieyang-nanyan",
  "jieyang-panlong",
  "puning-peifeng",
  "jieyang-masiyan",
  "huilai-spring",
  "huilai-resort",
  "huilai-baihua",
  "huilai-minghu",
  "huilai-foguang",
  "jieyang-wenchang"
]);
export const jieyangHighlights=Object.freeze([
  "jieyang-tower",
  "jieyang-jinxian",
  "jieyang-academy",
  "jieyang-chenghuang",
  "jieyang-huangqi",
  "jieyang-yangmei",
  "jieyang-rongjiang",
  "jiexi-falls",
  "jiexi-forest",
  "puning-deanli",
  "puning-nanxi",
  "huilai-spring"
]);
const collectionIds=new Set(jieyangCollectionIds);
export const isJieyangPlace=p=>collectionIds.has(p?.id);
export function getJieyangCollection(places){
  const byId=new Map(places.map(p=>[p.id,p]));
  return jieyangCollectionIds.map(id=>{
    const p=byId.get(id);if(!p)throw new Error('Missing Jieyang collection place: '+id);return p;
  });
}
const rows=[
  [
    "jinxian",
    "进贤门",
    "Jinxian Gate",
    116.365,
    23.541,
    "three-tier-city-gate",
    "old-town",
    "揭阳市区",
    "城门、城楼与顶层亭阁分层展开，门前石街连接两侧骑楼。"
  ],
  [
    "academy",
    "揭阳学宫（孔庙）",
    "Jieyang Confucian Academy",
    116.364,
    23.537,
    "confucian-ritual-axis",
    "courtyard",
    "揭阳市区",
    "礼门、泮池、桥梁、大成殿与廊庑组成古城学宫轴线。"
  ],
  [
    "chenghuang",
    "揭阳城隍庙",
    "Jieyang City God Temple",
    116.363,
    23.539,
    "temple-opera-courts",
    "courtyard",
    "揭阳市区",
    "庙门、殿堂、戏台与街巷围合成民俗文化院落。"
  ],
  [
    "guandi",
    "古榕武庙（关帝庙）",
    "Gurong Guandi Temple",
    116.361,
    23.538,
    "martial-temple-banyan",
    "courtyard",
    "揭阳市区",
    "朱柱门廊、重檐殿堂、照壁和古榕树表现古榕武庙。"
  ],
  [
    "shuangfeng",
    "双峰寺",
    "Shuangfeng Temple",
    116.363,
    23.535,
    "twin-courtyard-monastery",
    "courtyard",
    "揭阳市区",
    "山门、双侧楼阁、回廊与静院表现古城寺院空间。"
  ],
  [
    "huangqi",
    "黄岐山森林公园",
    "Huangqi Mountain Forest Park",
    116.387,
    23.607,
    "forest-ridge-pagoda",
    "mountain",
    "揭阳市区",
    "起伏山岭、密林、古塔、亭台与登山石阶组成城市山林。"
  ],
  [
    "west-lake",
    "榕江西湖",
    "Rongjiang West Lake",
    116.349,
    23.541,
    "lake-islets-arched-walk",
    "lake",
    "揭阳市区",
    "湖面、小岛、跨水步桥与树荫环湖路表现城市湖园。"
  ],
  [
    "rongjiang",
    "榕江",
    "Rongjiang River",
    116.371,
    23.524,
    "urban-river-two-banks",
    "river",
    "揭阳市区",
    "河道、两岸街区、桥梁和滨江步道相连，保留船行水域。"
  ],
  [
    "yangmei",
    "阳美玉都",
    "Yangmei Jade District",
    116.307,
    23.559,
    "jade-workshops-gallery",
    "town",
    "揭阳市区",
    "玉器展厅、雕刻工作台、手镯和山子摆件展示玉文化与商贸生活。"
  ],
  [
    "wangtian",
    "望天湖旅游度假区",
    "Wangtian Lake Resort",
    116.258,
    23.62,
    "lake-resort-boardwalk",
    "lake",
    "揭阳",
    "湖岸栈道、湿地植物、度假建筑与游船形成湖区休闲景观。"
  ],
  [
    "wanzhu",
    "万竹园",
    "Wanzhu Bamboo Garden",
    116.407,
    23.636,
    "bamboo-stream-gardens",
    "mountain",
    "揭阳",
    "成片竹林、曲径、溪流、小桥与竹亭形成层次丰富的园林。"
  ],
  [
    "square",
    "揭阳文化广场",
    "Jieyang Culture Square",
    116.374,
    23.551,
    "culture-plaza-stage",
    "square",
    "揭阳市区",
    "公共展廊、舞台、休憩树阵与连通步道组成城市文化广场。"
  ],
  [
    "fountain",
    "榕江音乐喷泉",
    "Rongjiang Musical Fountain",
    116.371,
    23.539,
    "river-musical-jets",
    "river",
    "揭阳市区",
    "分组水柱随演示节奏升降，岸边观景台与人行道分离于喷泉水域。"
  ],
  [
    "guangde",
    "广德庵",
    "Guangde Hermitage",
    115.864,
    23.478,
    "rock-valley-hermitage",
    "mountain",
    "揭阳市揭西县",
    "山岩间的庵堂、石阶与林下院落，作为独立人文山地展位。"
  ],
  [
    "nanyan",
    "南岩古寺",
    "Nanyan Ancient Temple",
    116.144,
    23.28,
    "cliff-terrace-temple",
    "mountain",
    "揭阳市普宁市",
    "依山台地、古寺院落、石壁和上山步道形成山林寺院。"
  ],
  [
    "panlong",
    "盘龙阁",
    "Panlong Pavilion Temple",
    116.111,
    23.238,
    "hillside-hall-terraces",
    "mountain",
    "揭阳市普宁市",
    "高低错落的山门、殿阁与层级台地连接成山地寺院。"
  ],
  [
    "masiyan",
    "马嘶岩",
    "Masiyan Temple",
    116.15,
    23.265,
    "boulder-grove-sanctuary",
    "mountain",
    "揭阳市普宁市",
    "岩石、林荫、古寺与回转石径突出山林古迹的宁静氛围。"
  ],
  [
    "wenchang",
    "惠来文昌阁塔",
    "Huilai Wenchang Pagoda",
    116.289,
    23.033,
    "scholar-pagoda-garden",
    "old-town",
    "揭阳市惠来县",
    "古塔、书院式庭院、池塘和城镇街巷组成文脉主题展位。"
  ]
];
export const jieyangPlaces=rows.map(([id,name,en,lon,lat,model,contextModel,area,description])=>({
  id:'jieyang-'+id,name,en,ll:[lon,lat],model,contextModel,description,kind:'jieyang',area,priority:jieyangHighlights.includes('jieyang-'+id),
  displayScale:.85,halfHeight:.63,span:1.12,top:.54,offset:[3,4,5],pin:true,major:false,footprint:[-.61,.61,-.48,.48],
  detail:description+' 艺术化微缩展示；坐标为近似地区锚点，展位可能为避让原有景点平移。建筑、层数与布局非实测复原，喷泉非实时演出。具体位置及开放情况以当地资料为准。',
  tags:[area,'揭阳景点',jieyangHighlights.includes('jieyang-'+id)?'重点景观':'地区景观'],
  source:'https://rc.jieyang.gov.cn/front/zjjy6.jsp',
}));
export function positionJieyangPlaces(options){return positionChaoyangPlaces({...options,places:options.places||jieyangPlaces});}
