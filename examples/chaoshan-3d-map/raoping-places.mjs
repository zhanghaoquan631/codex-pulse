import {positionShantouPlaces} from './shantou-places.mjs';

export const raopingSources={
  coast:'https://www.raoping.gov.cn/xqqk/gzjs/content/post_3844027.html',
  lake:'https://www.raoping.gov.cn/zwgk/zwdt/content/post_3941893.html',
  heritage:'https://www.prdculture.org.cn/ygawlzxw/wzwhycr/202312/1b235ec6e81d49f2b6c57e3418c9c538.shtml',
  forest:'https://www.chaozhou.gov.cn/slhwz/czxw/content/post_3947723.html'
};
// Editorial regional anchors; local exhibit placement is not an entrance survey.
const definitions=[
  ['zhelin-bay','柘林湾','Zhelin Bay',117.018,23.567,'aquaculture','浮排养殖网格、归航渔船、堤岸与湾中小岛。','harbour',true],
  ['xunzhou','汛洲岛','Xunzhou Island',117.002,23.555,'island-village','环海村落、林间步道、岸边礁石与栖息白鹭。','cove',true],
  ['xiao','西澳岛','Xiao Island',117.047,23.520,'dune-island','疏林、沙丘与海边野餐休憩空间。','cove',false],
  ['haishan','海山岛','Haishan Island',116.946,23.546,'twin-island','双片岛屿意象、连接道路、镇区与海岸林带。','cove',true],
  ['dacheng-bay','大埕湾','Dacheng Bay',117.145,23.582,'open-beach','开阔弧形海滩、滨海步道与观海亭。','cove',false],
  ['shibi','石壁山风景区','Shibishan',117.002,23.687,'inscribed-cliff','层叠山岩、粤东一壁题刻意象与林间登高游线。','forest',true],
  ['lvdao','绿岛旅游山庄','Lvdao Resort',116.918,23.766,'wetland-resort','竹林、湿地木栈道、湖边院落与民俗休憩区。','forest',false],
  ['qinglan','青岚怪臼谷','Qinglan Rock Potholes',116.884,23.803,'pothole-valley','岩床圆形凹穴、浅溪、林荫与绕谷栈道。','forest',false],
  ['daoyun','道韵楼','Daoyun Tulou',116.826,23.986,'octagonal-tulou','八角形层层围屋、中央院落、门楼与两口井的微缩表达。','courtyard',true],
  ['sanrao','三饶古城一带','Sanrao Old Town',116.837,23.998,'old-lanes','纵横古街、传统院落、牌坊与街边茶座。','old-town',false],
  ['maozhi','茂芝会议旧址','Maozhi Meeting Memorial',116.853,24.160,'memorial-hall','传统院落、纪念展厅、阅读展墙与参观人群。','courtyard',false],
  ['tangxi','汤溪水库 · 汤溪湖','Tangxi Lake',116.896,23.865,'lake-islands','群山环湖、大小山岛、堤坝和亲水观景栈道。','forest',true],
  ['longfu','海山隆福寺','Longfu Temple',116.946,23.569,'island-temple','山门、中轴殿堂、香炉与海岛古树院落。','courtyard',false],
  ['suocheng','大埕所城','Suocheng Walled Town',117.116,23.617,'coastal-fort','有门洞的城墙、城门楼、十字街与低矮民居。','old-town',false],
  ['zhelin-port','柘林古港 · 柘林镇','Zhelin Old Port',117.070,23.565,'old-port','红头船意象、泊位、沿港街屋与鱼市。','harbour',false],
  ['wind-tower','柘林风塔','Zhelin Wind Tower',117.079,23.575,'stone-pagoda','分层石塔、山坡植被与盘绕观塔步道。','forest',false],
  ['qitou','旗头山炮台','Qitou Coastal Battery',117.085,23.548,'cliff-battery','临海台地、历史炮位、厚石护墙与参观步道。','cove',false],
  ['huanggang-river','黄冈河','Huanggang River',117.005,23.651,'river-town','弯曲水道、跨河桥、人行绿道与两岸街屋。','town',false],
  ['huanggang','黄冈镇 · 饶平县城','Huanggang Town',117.004,23.674,'civic-centre','城区路口、骑楼商店、公园、公交站与步行广场。','town',false],
  ['tea','饶平茶山','Raoping Tea Hills',116.861,24.039,'tea-terraces','沿山层叠的茶垄、采茶人、山间步道与品茶亭。','forest',false]
];
export const raopingPlaces=definitions.map(([id,name,en,lon,lat,model,description,contextModel,priority])=>({
  id:'raoping-'+id,name,en,ll:[lon,lat],model,description,contextModel,priority,kind:'raoping',area:'潮州 · 饶平',
  displayScale:.85,halfHeight:.57,span:1.12,top:.44,offset:[3,4,5],pin:true,major:false,
  footprint:[-.55,.55,-.44,.44],
  detail:description+' 艺术化微缩展示，地理锚点为近似值；布局与动画非实测复原、实时交通或海况。',
  tags:['潮州 · 饶平',priority?'核心地标':'地区探索','近似位置'],
  source:raopingSources[model==='octagonal-tulou'?'heritage':model==='lake-islands'?'lake':['cove','harbour'].includes(contextModel)?'coast':'forest']
}));

export function positionRaopingPlaces({places=raopingPlaces,bbox,...options}){
  const a=options.toWorld(bbox[0],bbox[1]),b=options.toWorld(bbox[2],bbox[3]);
  const clampAnchor=(lon,lat)=>{const [x,z]=options.toWorld(lon,lat);return [Math.max(Math.min(a[0],b[0])+3,Math.min(Math.max(a[0],b[0])-3,x)),Math.max(Math.min(a[1],b[1])+3,Math.min(Math.max(a[1],b[1])-3,z))];};
  positionShantouPlaces({...options,places,toWorld:clampAnchor});
  for(const p of places){
    const [x,z]=options.toWorld(...p.ll);p.displayOffset=Math.hypot(p.x-x,p.z-z);
    p.outsideBasemap=p.ll[0]<bbox[0]||p.ll[0]>bbox[2]||p.ll[1]<bbox[1]||p.ll[1]>bbox[3];
    if(p.outsideBasemap){const note=' 此锚点超出当前底图边界，模型置于地图边缘展位，不代表景点真实展示位置。';if(!p.detail.includes(note))p.detail+=note;}
  }
}
