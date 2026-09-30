import {positionShantouPlaces} from './shantou-places.mjs';
import {insidePlace} from './place-footprints.mjs';
import {streetClearance} from './street-clearance.mjs';

export const chaoyangSources={
  directory:'https://www.shantou.gov.cn/cnst/zdly/lyscjgzfxxgk/cyzl/content/post_1342470.html',
  coast:'https://english.shantou.gov.cn/english/livingtourism/touristresorts/guide/content/post_1728927.html',
  wen:'https://rd.shantou.gov.cn/rd/zjshmst/201908/1c5d0f54c15e4d6f9114c955e54b6ebe.shtml',
  qiaochen:'https://rd.shantou.gov.cn/rd/zjshmst/201908/5957e246c36441dc8555dacf20938728.shtml',
  tower:'https://zh.wikipedia.org/wiki/潮陽文光塔'
};
// Approximate editorial anchors. Nearby scenes are spaced by the existing atlas placement logic.
const definitions=[
  ['lotus','海门莲花峰风景区','Haimen Lotus Peak',116.615,23.197,'lotus-coast','cove','瓣状花岗岩峰、滨海步道、海浪与观景平台。','coast'],
  ['wenguang','文光塔','Wenguang Pagoda',116.600,23.263,'octagonal-pagoda','old-town','八角七层塔身、逐层檐廊、塔刹与古城街景。','tower'],
  ['dafeng','和平大峰风景区','Heping Dafeng Scenic Area',116.481,23.253,'dafeng-precinct','courtyard','纪念殿堂、轴线庭院、林荫参观路与桥梁文化展示。','directory'],
  ['lingshan','灵山寺','Lingshan Temple',116.441,23.322,'woodland-monastery','forest','层进殿堂、山门、钟亭、庭院与寺后林地。','directory'],
  ['minganli','明安里','Minganli Heritage Houses',116.433,23.327,'clan-courts','courtyard','多组四点金民居、祠堂、嵌瓷色彩与传统巷道。','directory'],
  ['dongshan','东山旅游景区','Dongshan Scenic Area',116.619,23.268,'urban-hill','forest','山林石阶、亭阁、山顶观景台与山脚城市。','directory'],
  ['qiaochen','桥陈红色旅游区','Qiaochen Heritage Village',116.428,23.477,'heritage-farm','forest','历史展馆、村居、菜田和连接村落的参观路。','qiaochen'],
  ['miancheng','棉城古城','Miancheng Old Town',116.600,23.264,'old-city-streets','old-town','骑楼商铺、古街、城门意象与茶座。','directory'],
  ['xuegong','潮阳学宫','Chaoyang Confucian Academy',116.602,23.266,'academy-axis','courtyard','棂星门、泮池、石桥、殿堂与两侧学舍。','directory'],
  ['xiyuan','潮阳西园','Chaoyang West Garden',116.592,23.263,'classical-garden','courtyard','曲池、假山、月洞门、廊桥与花木庭院。','directory'],
  ['haimen','海门镇','Haimen Town',116.609,23.206,'coastal-town','town','沿海街屋、市场、渔网工坊和海滨散步道。','coast'],
  ['harbour','海门渔港','Haimen Fishing Harbour',116.593,23.196,'working-harbour','harbour','防波堤、分泊位渔船、码头吊臂与分拣棚。','coast'],
  ['estuary','练江入海口','Lianjiang Estuary',116.595,23.185,'river-meets-sea','cove','由窄到宽的河口、水色过渡、沙洲、两岸植被与船只。','coast'],
  ['lianfeng-temple','莲峰古寺','Lianfeng Temple',116.614,23.198,'coastal-temple','courtyard','海边古寺、前庭、岩岸绿地与听涛步道。','coast'],
  ['lianfeng-academy','莲峰书院 / 忠贤祠','Lianfeng Academy',116.616,23.198,'scholar-memorial','courtyard','书院庭院、读书案、历史展廊与海边林荫。','wen'],
  ['inscriptions','莲花峰摩崖石刻','Lotus Peak Rock Inscriptions',116.615,23.196,'inscribed-cliffs','cove','花岗岩裂隙、红色题刻示意与贴近岩壁的观景步道。','wen'],
  ['wentianxiang','文天祥雕像','Wen Tianxiang Monument',116.616,23.197,'granite-monument','courtyard','长袍石像、自然岩座、题名和环绕纪念园。','wen'],
  ['battery','海门古炮台','Haimen Historic Battery',116.614,23.195,'coastal-battery','cove','海防石墙、炮位、面海观察口与参观步道。','coast'],
  ['tongyu','铜盂镇','Tongyu Town',116.419,23.327,'village-crafts','old-town','潮汕古厝、祠堂、木作工坊、民俗庭院与日常街巷。','directory'],
  ['heping','和平镇','Heping Town',116.479,23.249,'town-and-bridge','town','传统街镇、沿河茶铺、石桥与大峰文化展厅。','directory']
];
const priorities=new Set(['wenguang','miancheng','xuegong','dongshan','minganli','lingshan','dafeng','qiaochen','haimen','lotus','wentianxiang','estuary']);
const core=new Set(['wenguang','lotus','wentianxiang','lingshan','dafeng']);
export const chaoyangPlaces=definitions.map(([id,name,en,lon,lat,model,contextModel,description,source])=>({
  id:'chaoyang-'+id,name,en,ll:[lon,lat],model,contextModel,description,kind:'chaoyang',area:'汕头市潮阳区',priority:priorities.has(id),core:core.has(id),
  displayScale:.85,halfHeight:.63,span:1.12,top:.54,offset:[3,4,5],pin:true,major:false,footprint:[-.61,.61,-.48,.48],
  detail:description+' 艺术化微缩展示；位置为近似地区锚点，细部与布局非实测复原，人物与船只非实时数据。开放情况及景区等级以当地公告为准。',
  tags:['汕头市潮阳区',core.has(id)?'核心地标':priorities.has(id)?'重点景点':'地区探索','示意场景'],source:chaoyangSources[source]
}));
export function positionChaoyangPlaces({places=chaoyangPlaces,existing=[],bbox,...options}){
  const occupied=[...existing],offRoad=streetClearance(options.routes||[]);
  const extent=bbox?[options.toWorld(bbox[0],bbox[1]),options.toWorld(bbox[2],bbox[3])]:null;
  for(const p of places){
    positionShantouPlaces({...options,existing:occupied,places:[p]});
    const radius=.62*p.displayScale+.09;
    const blocked=(x,z)=>occupied.some(q=>q.kind!=='district'&&!q.aliasOf&&q.span&&insidePlace(q,x,z,radius));
    const [ax,az]=options.toWorld(...p.ll);
    const groundAt=(x,z)=>{
      if(extent&&(x-radius<Math.min(extent[0][0],extent[1][0])||x+radius>Math.max(extent[0][0],extent[1][0])||z-radius<Math.min(extent[0][1],extent[1][1])||z+radius>Math.max(extent[0][1],extent[1][1])))return null;
      const hs=[];for(const dx of [-.62,0,.62])for(const dz of [-.49,0,.49]){const xx=x+dx*p.displayScale,zz=z+dz*p.displayScale,h=options.heightAt(xx,zz);if(!Number.isFinite(h)||h<0||options.waterAt(xx,zz)!==null)return null;hs.push(h);}return hs;
    };
    // Dense coastal anchors can exhaust the legacy search. Never fall back to a colliding anchor.
    if(blocked(p.x,p.z)||!groundAt(p.x,p.z)){
      let best;
      for(let ring=1;ring<=70&&!best;ring++){
        for(let ix=-ring;ix<=ring;ix++)for(const iz of [-ring,ring])consider(ix,iz);
        for(let iz=-ring+1;iz<ring;iz++)for(const ix of [-ring,ring])consider(ix,iz);
      }
      function consider(ix,iz){const x=ax+ix*.12,z=az+iz*.12;if(blocked(x,z))return;const hs=groundAt(x,z);if(!hs)return;const score=Math.hypot(x-ax,z-az)+(Math.max(...hs)-Math.min(...hs))*20+(offRoad(x,z,radius)?0:1);if(!best||score<best.score)best={x,z,score};}
      if(!best)throw new Error('No clear Chaoyang exhibit location: '+p.id);
      p.x=best.x;p.z=best.z;
    }
    p.displayOffset=Math.hypot(p.x-ax,p.z-az);occupied.push(p);
    if(p.displayOffset>1.8){const note=' 为避免相邻景点模型重叠，展位已向附近空地平移，显示坐标仍为原景点近似锚点。';if(!p.detail.includes(note))p.detail+=note;}
  }
}
