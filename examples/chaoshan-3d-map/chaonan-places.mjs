import {positionChaoyangPlaces} from './chaoyang-places.mjs';

const official='https://www.shantou.gov.cn/cnst/zdly/lyscjgzfxxgk/cyzl/content/post_1342470.html';
const priorities=new Set(['xiashan','donghua','cuihu','xianhu','cuifeng','dananshan','honggong','museum','leiling-peak','liangying','lianjiang','qiufeng']);
const rows=[
  ['donghua','东华潮乡旅游景区','Donghua Heritage Village',116.432,23.238,'village-watercourts','courtyard','古厝院落、水巷、小桥与村口茶摊组成乡村生活场景。'],
  ['red-landscape','红场大南山红色旅游景区','Hongchang Heritage Landscape',116.361,23.155,'heritage-hillside','mountain','山间历史展廊、林荫步道与村落相连，保留山林背景。'],
  ['cuihu','仙城翠湖旅游区','Xiancheng Cuihu Lake',116.377,23.263,'lake-gardens','lake','环湖步道、亭台、岸边树林与观景小桥围绕湖面展开。'],
  ['cuifeng','翠峰古岩','Cuifeng Ancient Rock',116.371,23.251,'rock-sanctuary','mountain','岩壁、山林古迹与连续登山步道形成高低错落的山地场景。'],
  ['dananshan','大南山','Danan Mountains',116.342,23.151,'forest-ridges','mountain','连续山脊、密林、溪谷与折返登山道，突出潮南山地。'],
  ['museum','大南山革命历史纪念馆','Danan Revolutionary History Museum',116.359,23.164,'history-museum','square','纪念馆、展陈庭院和林荫集散广场；建筑为艺术化表达。'],
  ['honggong','红场革命旧址·红宫','Hongchang Historic Site',116.355,23.160,'historic-meeting-house','old-town','旧址庭院、会议陈设与乡村小巷组合为历史文化场景。'],
  ['martyrs','革命烈士纪念碑','Martyrs Memorial',116.363,23.158,'memorial-terraces','square','纪念碑、分级台阶、花坛与松柏构成安静的纪念空间。'],
  ['leiling-peak','雷岭峰风景名胜区','Leiling Peak',116.405,23.098,'peak-orchards','mountain','山脊观景步道与山麓果林相接，表现雷岭的山地乡村。'],
  ['xianhu','仙湖旅游景区','Xianhu Scenic Area',116.367,23.255,'lake-pavilions','lake','湖岸亭廊、曲桥与山林小径，采用不同于翠湖的布局。'],
  ['xiashan','峡山城区','Xiashan Urban Centre',116.433,23.252,'canal-commercial-centre','town','沿河商业街、街角小店、桥梁和人行空间组成城区。'],
  ['tashan','峡山塔山一带','Xiashan Tashan',116.439,23.257,'hilltop-tower','mountain','山顶塔楼、寺院与坡道连接城市边缘的绿色山丘。'],
  ['liangying','两英镇','Liangying Town',116.398,23.191,'riverside-workshops','town','河岸街镇、传统作坊与生活广场相连，表现山麓城镇。'],
  ['hongchang','红场镇','Hongchang Town',116.351,23.145,'tea-mountain-village','old-town','茶园、乡村民居和山间公共空间，连接红场历史景观。'],
  ['xiancheng','仙城镇','Xiancheng Town',116.382,23.273,'garden-market-town','town','集市、庭园、沿街民居与乡村步道形成生活中心。'],
  ['leiling-town','雷岭镇','Leiling Town',116.410,23.116,'lychee-village','old-town','荔枝果林、村落晒场与农产小铺表现山地乡村生活。'],
  ['lianjiang','练江','Lianjiang River',116.461,23.275,'river-greenway','river','连续河道、两岸碧道、桥梁和亲水平台连接沿河城区。'],
  ['qiufeng','秋风岭水库','Qiufengling Reservoir',116.397,23.165,'reservoir-dam','lake','水库、堤坝、山林与岸边巡护步道构成水源地场景。'],
  ['hongchang-water','红场水库','Hongchang Reservoir',116.337,23.166,'woodland-reservoir','lake','树林环抱的不规则水面、山间步道与小型观景平台。'],
  ['yao-clan','姚氏宗祠（两英古溪）','Yao Ancestral Hall, Guxi',116.400,23.198,'ancestral-compound','courtyard','宗祠门楼、天井、侧廊与古村街巷，突出潮汕传统建筑。'],
];
export const chaonanPlaces=rows.map(([id,name,en,lon,lat,model,contextModel,description])=>({
  id:'chaonan-'+id,name,en,ll:[lon,lat],model,contextModel,description,
  kind:'chaonan',area:'汕头市潮南区',priority:priorities.has(id),
  displayScale:.85,halfHeight:.63,span:1.12,top:.54,offset:[3,4,5],pin:true,major:false,
  footprint:[-.61,.61,-.48,.48],
  detail:description+' 艺术化微缩展示；坐标为近似地区锚点，建筑与布局非实测复原，人物非实时数据。展位可能为避让原有景点平移；开放情况以当地公告为准。',
  tags:['汕头市潮南区',priorities.has(id)?'重点景观':'地区景观','艺术化微缩'],
  source:id==='yao-clan'?'https://www.shantou.gov.cn/stswgltj/gkmlpt/content/1/1406/post_1406407.html':
    ['honggong','hongchang','red-landscape'].includes(id)?'https://rd.shantou.gov.cn/rd/zjshmst/201908/5957e246c36441dc8555dacf20938728.shtml':official,
}));

export function positionChaonanPlaces(options){
  return positionChaoyangPlaces({...options,places:options.places||chaonanPlaces});
}
