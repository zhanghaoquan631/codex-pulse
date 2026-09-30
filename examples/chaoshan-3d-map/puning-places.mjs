import {positionChaoyangPlaces} from './chaoyang-places.mjs';

const city='https://www.jieyang.gov.cn/zjjy/xqgl/pns/';
const priorities=new Set(['deanli','academy','wenchang','hongyang','nanxi','dagang','panlong','dananshan','xinxi','dengfeng','yingge','bayi']);
const rows=[
  ['deanli','德安里古建筑群','De An Li Heritage Compound',116.227,23.528,'linked-mansion-courts','courtyard','多进主厅、侧厝、天井和护寨水道表现德安里的成组院落。'],
  ['academy','普宁学宫','Puning Confucian Academy',116.230,23.532,'academy-and-pond','courtyard','礼门、泮池、桥梁、殿堂与两侧廊庑组成学宫轴线。'],
  ['wenchang','洪阳文昌阁','Hongyang Wenchang Pavilion',116.232,23.535,'scholar-residence','old-town','文昌阁以历史院落与文化展陈表达，保留街巷和庭院空间。'],
  ['hongyang','洪阳古镇','Hongyang Historic Town',116.230,23.530,'heritage-cross-streets','old-town','骑楼、古街、茶铺和街角榕树连接成传统城镇。'],
  ['nanxi','南溪水乡','Nanxi Water Town',116.260,23.562,'canals-and-dragonboat','river','交织水道、乌篷船、龙舟与榕树水岸，突出水乡生活。'],
  ['dagang','南溪大港码头','Nanxi Dagang Wharf',116.270,23.567,'waterbus-wharf','harbour','候船亭、码头栈桥和分开的游船泊位，连接滨水步道。'],
  ['panlong','盘龙湾温泉度假村','Panlong Bay Hot Springs',116.176,23.258,'terraced-spa-gardens','lake','不同尺度的温泉池、石径、休息亭与山林度假建筑。'],
  ['feieling','利泰飞鹅岭农业公园','Feieling Agricultural Park',116.158,23.316,'orchards-and-farmwalks','mountain','果园、梯田、温室和田间步道形成乡村农业景观。'],
  ['xinxi','新溪古村滨河景区','Xinxi Riverside Village',116.260,23.472,'riverside-ancestral-village','old-town','滨河古村、祠堂、亲水平台与村民日常活动。'],
  ['dengfeng','登峰乡村文化旅游景区','Dengfeng Rural Culture',116.204,23.295,'village-culture-terraces','old-town','村落展廊、乡村戏台和山麓梯田共同形成文化场景。'],
  ['bayi','八一馆·军事决策会议旧址','Bayi Historic Meeting Site',116.183,23.295,'historic-command-courtyard','courtyard','八一南昌起义南下部队指挥部军事决策会议旧址。以院落、历史展板与会议陈设表现，建筑布局为艺术化展示。'],
  ['yingge','南山英歌传承基地','Nanshan Yingge Heritage Base',116.151,23.294,'yingge-training-ground','square','展馆、鼓点和英歌队列演练，人物持槌并做分拍踏步动作。'],
  ['dananshan','大南山','Puning Danan Mountains',116.189,23.239,'mountain-stream-valley','mountain','连续森林山脊、溪谷和山间步道，表现普宁南部山地。'],
  ['liusha','流沙人民公园','Liusha People Park',116.183,23.300,'civic-pond-park','square','池塘、榕荫、亭廊、弯曲步道与休闲人群组成城市公园。'],
  ['square','普宁广场','Puning Square',116.163,23.326,'city-fountain-square','square','城市广场、喷泉、花坛和商业街边界形成公共活动空间。'],
  ['market','普宁国际商品城','Puning International Commodity City',116.163,23.327,'trade-market-arcades','town','多排商贸展厅、服饰展示、装卸区与独立步行商业街。'],
  ['station','普宁高铁站','Puning Railway Station',116.192,23.259,'rail-station-platforms','town','站房、站前步行广场、独立站台与停靠列车；并非实时运行。'],
  ['lianjiang','练江','Lianjiang in Puning',116.201,23.311,'riverfront-neighborhood','river','河道、两岸步道、跨河桥与沿岸居住街区相连。'],
  ['nigou','泥沟古村','Nigou Historic Village',116.207,23.397,'village-library-courts','old-town','古村院落、文化书屋、村口池塘和茶桌表现乡村人文。'],
  ['peifeng','洪阳培风塔一带','Hongyang Peifeng Pagoda',116.246,23.544,'seven-storey-earth-pagoda','mountain','七层八角古塔、周边林地与古镇步道形成历史景观。'],
];
export const puningPlaces=rows.map(([id,name,en,lon,lat,model,contextModel,description])=>({
  id:'puning-'+id,name,en,ll:[lon,lat],model,contextModel,description,kind:'puning',area:'揭阳市普宁市',priority:priorities.has(id),
  displayScale:.85,halfHeight:.63,span:1.12,top:.54,offset:[3,4,5],pin:true,major:false,footprint:[-.61,.61,-.48,.48],
  detail:description+' 艺术化微缩展示；坐标为近似地区锚点，建筑和动作非实测复原，船只及列车非实时数据。展位可能为避让原有景点平移；开放情况以当地公告为准。',
  tags:['揭阳市普宁市',priorities.has(id)?'重点景观':'地区景观','艺术化微缩'],
  source:id==='deanli'?'https://gdtspa.org.cn/news/detail/831':id==='yingge'?'https://www.qb.gd.gov.cn/jrqx/content/post_1224992.html':
    ['nanxi','dagang'].includes(id)?'https://www.puning.gov.cn/xwzx/pnxw/content/post_812481.html':id==='peifeng'?'https://www.prdculture.org.cn/ygawlzxw/wzwhycr/202312/a3fc360346f14f5280aa5ce9dc93e3a4.shtml':city,
}));
export function positionPuningPlaces(options){return positionChaoyangPlaces({...options,places:options.places||puningPlaces});}
