import {insidePlace} from './place-footprints.mjs';
import {streetClearance} from './street-clearance.mjs';

export const shantouSource='https://www.shantou.gov.cn/cnst/yxst/cszn/lyzn/jqjd/';
const definitions=[
  ['memorial','中山纪念亭','Zhongshan Memorial Pavilion',116.66945,23.35785,'existing-pavilion','重檐纪念亭与向外展开的骑楼街巷。',true],
  ['mazu','汕头老妈宫','Old Mazu Temple',116.6710,23.3557,'mazu','嵌瓷屋脊、朱红门扇、拜亭与对面的戏台。',false],
  ['hotel','汕头旅社','Shantou Hotel',116.6692,23.3561,'hotel','灰色骑楼立面、层叠窗框和醒目的红色旅社字样。',true],
  ['post','汕头邮政总局大楼','General Post Office',116.6707,23.3549,'post','欧式对称立面、邮政绿门窗与寄信的小广场。',false],
  ['museum','汕头开埠文化陈列馆','Port Opening Museum',116.6700,23.3546,'museum','三层半欧陆式建筑，门廊与开埠文化展廊。',false],
  ['xidi','西堤公园','Xidi Park',116.6583,23.3549,'xidi','滨水步道、侨批主题展墙与开阔的观景台。',true],
  ['zhongshan','中山公园','Zhongshan Park',116.6740,23.3704,'park','牌坊、榕荫、曲桥与湖畔游园。',false],
  ['square','人民广场','People\'s Square',116.6784,23.3513,'square','开阔广场、旗杆、花坛与面向内海湾的步行空间。',false],
  ['promenade','海滨长廊','Seafront Promenade',116.6890,23.3516,'promenade','棕榈、连续廊架与沿海慢行道。',false],
  ['bay','汕头内海湾','Shantou Inner Bay',116.6874,23.3423,'bay','一湾两岸、渡轮、码头与对岸山林。',true],
  ['queshi','礐石风景名胜区','Queshi Scenic Area',116.6646,23.3317,'queshi','花岗岩海蚀地貌、茂密林木和登高石阶。',true],
  ['bridge','礐石大桥','Queshi Bridge',116.6600,23.3436,'bridge','双塔斜拉结构跨越海湾，桥面与两岸道路相接。',true],
  ['nanbin','南滨公园','Nanbin Park',116.6812,23.3352,'nanbin','南岸滨水绿地、弧形步道和看向老城的休憩座椅。',true],
  ['mayu','妈屿岛','Mayu Island',116.74812,23.33716,'mayu','渔村街屋、海边书屋、庙宇与栈道串联的海岛生活。',true],
  ['east-coast','东海岸公园','East Coast Park',116.7830,23.3760,'east-coast','海岸绿带、骑行空间和面向大海的遮阳廊架。',true],
  ['sports','汕头体育中心','Shantou Sports Centre',116.8180,23.4150,'sports','浪花般的场馆屋面、体育场和相邻训练场。',false],
  ['station','汕头站','Shantou Railway Station',116.75243,23.37469,'station','开阔站房、站台雨棚、列车与接送旅客。',false],
  ['port','汕头港','Shantou Port',116.7680,23.2760,'port','以广澳港区为示意锚点，展示岸桥、集装箱和货船。',false],
  ['fantawild','方特欢乐世界 · 蓝水星','Fantawild Blue Mercury',116.7570,23.3505,'fantawild','蓝色主题展馆、游乐轨道和亲子活动广场。',false],
  ['chen','陈慈黉故居','Chen Cihong Residence',116.7226,23.5550,'chen','驷马拖车式多进院落、西式窗廊与天桥相连。',true],
  ['qianmei','前美古村','Qianmei Ancient Village',116.7238,23.5580,'qianmei','侨乡街巷、成片传统民居和村前水塘。',false],
  ['lianhua','莲华乡村旅游区','Lianhua Countryside',116.7780,23.5850,'lianhua','乡间水塘、田园花圃、村道与骑行休憩点。',false],
  ['lotus','莲花峰风景区','Lianhuafeng Scenic Area',116.6150,23.1960,'lotus','瓣状纵裂花岗岩、海岸石刻与沿海步道。',false],
  ['dafeng','和平大峰风景区','Heping Dafeng Scenic Area',116.4670,23.2560,'dafeng','纪念性建筑、庭院和林荫游线。',false],
  ['danying','丹樱生态园','Danying Eco Garden',116.6180,23.2920,'danying','顺地势展开的彩色花田、小桥和园间步行道。',false]
];

export const shantouPlaces=definitions.map(([id,name,en,lon,lat,model,description,priority])=>{
  const scale=['hotel','post','museum','mazu'].includes(model)?.36:model==='bridge'?1:model==='bay'?.85:.75;
  return {id:'shantou-'+id,name,en,ll:[lon,lat],kind:'shantou',area:'汕头',model,description,priority,displayScale:scale,
    top:.32*scale,halfHeight:Math.max(.30,.68*scale),span:1.15*scale,pin:true,major:false,offset:[3,4,5],rotation:model==='bridge'?-1.4744:0,
    footprint:model==='bridge'?[-1.35,1.35,-.14,.14]:model==='existing-pavilion'?[0,0,0,0]:[-.6*scale,.6*scale,-.48*scale,.48*scale],
    contextModel:['hotel','post','museum','station'].includes(model)?'town':['chen','mazu','dafeng'].includes(model)?'courtyard':model==='qianmei'?'old-town':model==='port'?'harbour':['queshi','lotus','lianhua','danying'].includes(model)?'forest':model==='mayu'?'cove':'square',
    detail:description+' 艺术化微缩表现，景点锚点及邻近展示布局为近似位置，非实测建筑或实时客流。',
    tags:['汕头',priority?'重点景点':'城市探索','近似位置'],source:shantouSource};
});

export function isShantouPlace(p){return p.kind==='shantou'||p.id==='small-park'||p.id==='nanao-nanao-bridge'||p.name==='南澳岛';}

export function positionShantouPlaces({places=shantouPlaces,existing=[],toWorld,heightAt,waterAt,routes=[]}){
  const occupied=existing.filter(p=>p.span&&p.kind!=='district'),offRoad=streetClearance(routes);
  for(const p of places){
    const [ax,az]=toWorld(...p.ll);p.x=ax;p.z=az;
    if(p.model==='existing-pavilion'){
      const original=existing.find(q=>q.id==='small-park');
      if(original){p.x=original.x;p.z=original.z;p.ll=[...original.ll];p.halfHeight=.40;p.span=.72;p.top=.32;p.aliasOf=original.id;}
      continue;
    }
    if(p.model==='bay'||p.model==='bridge')continue;
    const rx=.6*p.displayScale,rz=.48*p.displayScale;let best;
    for(let ix=-20;ix<=20;ix++)for(let iz=-20;iz<=20;iz++){
      const x=ax+ix*.09,z=az+iz*.09,samples=[];let dry=true;
      for(const dx of [-rx,0,rx])for(const dz of [-rz,0,rz]){samples.push(heightAt(x+dx,z+dz));if(waterAt(x+dx,z+dz)!==null)dry=false;}
      if(!dry||Math.min(...samples)<0)continue;
      if(occupied.some(q=>insidePlace(q,x,z,Math.max(rx,rz)+.08)))continue;
      const slope=Math.max(...samples)-Math.min(...samples),roadPenalty=offRoad(x,z,Math.max(rx,rz)+.03)?0:1;
      const score=Math.hypot(x-ax,z-az)+slope*30+roadPenalty;
      if(!best||score<best.score)best={x,z,score};
    }
    if(best){p.x=best.x;p.z=best.z;}
    p.displayOffset=Math.hypot(p.x-ax,p.z-az);occupied.push(p);
  }
}
