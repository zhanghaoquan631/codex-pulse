import {positionShantouPlaces} from './shantou-places.mjs';

export const chenghaiSources={
  culture:'https://english.shantou.gov.cn/english/livingtourism/touristresorts/spots/content/post_1729762.html',
  sights:'https://www.shantou.gov.cn/cnst/zdly/lyscjgzfxxgk/cyzl/content/post_1342470.html',
  toys:'https://youth.shantou.gov.cn/youth/chq/201805/f564751e714a4bba866e37c42fc62894.shtml'
};
// Editorial anchors and spaced exhibits, not surveyed entrances or real-time geography.
const definitions=[
  ['qianmei','前美古村侨文化旅游区','Qianmei Heritage Village',116.747,23.562,'heritage-village','old-town','连续古厝、侨乡街巷、门楼与村前水塘。','culture'],
  ['chen','陈慈黉故居','Chen Cihong Residence',116.747,23.560,'diaspora-mansion','courtyard','多进院落、南洋拱廊、彩色地砖与中西合璧立面。','culture'],
  ['yongning','永宁寨','Yongning Walled Village',116.749,23.564,'fortress','courtyard','寨墙、角楼、门楼、内街和古井庭院。','sights'],
  ['wenyuan','文园小筑','Wenyuan Garden Residence',116.746,23.559,'garden-villa','courtyard','花园小楼、阳台、花窗、池塘和庭园步道。','culture'],
  ['lianhua-country','莲华乡村旅游区','Lianhua Countryside',116.801,23.617,'paddy-country','forest','山脚田畴、灌渠、村舍与乡间集市。','sights'],
  ['lianhua-mountain','莲花山','Lianhua Mountain',116.799,23.663,'mountain-trails','forest','连续山脊、阔叶林、盘山步道与山顶观景亭。','sights'],
  ['hot-spring','莲花山温泉度假村','Lianhua Hot Springs',116.793,23.640,'thermal-garden','forest','林间温泉池、木平台、休息廊与低层度假建筑。','sights'],
  ['tashan','塔山风景区','Tashan Scenic Area',116.786,23.526,'temple-lake','forest','山林寺院、塔、湖岸、石阶与亭台。','sights'],
  ['tang','唐伯元纪念馆','Tang Boyuan Memorial',116.782,23.529,'memorial-court','courtyard','展厅、书案、纪念庭院与安静的参观游线。','sights'],
  ['laiwu','莱芜旅游度假区','Laiwu Coast',116.866,23.443,'rocky-beach','cove','沙滩、礁石、防风林、滨海步道和小渔船。','sights'],
  ['dehua','德华民俗文化公园','Dehua Folk Culture Park',116.767,23.551,'folk-stage','courtyard','民俗展廊、传统戏台、工艺摊与观众席。','sights'],
  ['qianshu','科隆千树园','Qianshu Garden',116.773,23.526,'botanic-garden','forest','不同树冠、花圃、曲径、温室与水生植物池。','sights'],
  ['farm','大自然休闲农庄','Countryside Farm',116.802,23.617,'orchard-farm','forest','果园、菜畦、棚架、农舍与采摘休憩空间。','sights'],
  ['baoao','宝奥玩具文旅产业园','Baoao Toy Industry Park',116.808,23.524,'toy-campus','town','玩具展馆、积木、机器人、展示轨道与设计工坊。','toys'],
  ['hanjiang','韩江 · 澄海沿岸','Hanjiang Chenghai Riverside',116.760,23.513,'river-quays','town','宽水道、堤岸绿道、沿江街屋和往来船只。','culture'],
  ['beixi','韩江北溪','Hanjiang Beixi',116.800,23.592,'river-farmland','forest','分汊水道、堤岸田园、跨渠小桥与沿岸步道。','sights'],
  ['downtown','澄海城区','Chenghai Urban Center',116.758,23.467,'urban-blocks','town','错落城区、玩具商店、社区广场与人车分离街道。','toys'],
  ['dongli','东里古镇一带','Dongli Historic Streets',116.827,23.577,'port-street','old-town','沿河老街、仓栈、拱廊、茶铺和古港记忆。','culture'],
  ['yanhong','盐鸿镇','Yanhong Coastal Village',116.858,23.620,'shellfish-village','harbour','薄壳养殖示意、渔村、分拣棚与田园水渠。','sights'],
  ['redboat','澄海红头船文化','Chenghai Red-headed Boats',116.829,23.570,'red-sail-harbour','harbour','红色船首、桅杆布帆、码头货栈与侨批文化展廊。','culture']
];
const priorities=new Set(['chen','qianmei','yongning','lianhua-country','lianhua-mountain','hot-spring','tashan','tang','laiwu','baoao','hanjiang','redboat']);
export const chenghaiPlaces=definitions.map(([id,name,en,lon,lat,model,contextModel,description,source])=>({
  id:'chenghai-'+id,name,en,ll:[lon,lat],model,contextModel,description,kind:'chenghai',area:'汕头市澄海区',priority:priorities.has(id),
  displayScale:.85,halfHeight:.63,span:1.12,top:.52,offset:[3,4,5],pin:true,major:false,footprint:[-.61,.61,-.48,.48],
  detail:description+' 艺术化微缩场景，坐标为近似地区锚点，非实测建筑或实时交通；景区等级与开放信息以当地公布为准。',
  tags:['汕头市澄海区',priorities.has(id)?'重点地标':'地区探索','示意场景'],source:chenghaiSources[source]
}));
export function positionChenghaiPlaces(options){positionShantouPlaces({...options,places:options.places||chenghaiPlaces});}
