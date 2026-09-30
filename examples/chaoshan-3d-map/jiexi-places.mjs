export const jiexiSource='https://www.jieyang.gov.cn/zjjy/xqgl/jxx/';
// Regional anchors are approximate; exhibit placement is separated from geography.
const definitions=[
  ['falls','黄满寨瀑布群','Huangmanzhai Waterfalls',115.980,23.584,'cascade','多级瀑布、岩壁、深潭与沿谷栈道。',true],
  ['forest','大北山国家森林公园','Dabeishan Forest',115.916,23.555,'forest','层叠山林、盘山步道与山顶观景亭。',true],
  ['jingming','京明温泉度假村','Jingming Hot Springs',116.012,23.539,'resort','山林中的温泉庭院、连廊与度假客房。',true],
  ['dayang','大洋生态旅游区','Dayang Highlands',115.934,23.627,'highland','高山草地、湖泊、林间木屋与观景平台。',false],
  ['mianhu','棉湖古镇','Mianhu Old Town',116.091,23.432,'old-town','骑楼街巷、临水民居与古镇生活。',true],
  ['academy','兴道书院','Xingdao Academy',116.087,23.435,'academy','书院庭院、讲堂、书架与安静的阅读长廊。',false],
  ['sanshan','三山国王祖庙','Sanshan Ancestral Temple',115.816,23.424,'temple','朱门、三进殿堂、彩色屋脊和山前广场。',true],
  ['flowers','樱山花谷','Yingshan Flower Valley',115.961,23.503,'flowers','花坡、曲径、花架与村野休憩点。',false],
  ['shanhu','山湖村','Shanhu Village',116.039,23.448,'village','村塘、田畦、民居与榕荫下的休息平台。',false],
  ['grotto','广德洞天','Guangde Grotto',115.864,23.478,'grotto','山岩洞口、林间石阶与崖边小亭。',false],
  ['shiling','石灵古刹','Shiling Temple',115.911,23.488,'hill-temple','林中单院古刹、登山阶梯与石灯。',false],
  ['longtan','龙潭瀑布','Longtan Waterfall',115.804,23.482,'plunge','窄谷飞瀑、清潭和跨溪小桥。',false],
  ['shinei','石内河冰川遗迹','Shinei River Rock Formations',115.981,23.564,'potholes','岩床凹穴、溪流和近水观察栈道。',false],
  ['river','榕江南河','Rongjiang South River',115.898,23.422,'river','河岸绿带、慢行步道、小桥与临水村庄。',true],
  ['memorial','大北山革命历史纪念馆','Dabeishan Memorial',115.921,23.548,'memorial','山林纪念馆、展墙与庄重的入口广场。',false],
  ['torch','南山火炬村','Nanshan Huoju Village',115.930,23.524,'heritage-village','传统村居、红色文化展墙与村道。',false],
  ['guo','郭氏大楼','Guo Family Residence',116.090,23.438,'residence','高墙院落、层叠楼窗与内庭回廊。',false],
  ['yongchang','永昌古庙','Yongchang Temple',116.094,23.435,'street-temple','古镇街边庙宇、门楼与小型戏台。',false],
  ['wujingfu','五经富温泉','Wujingfu Hot Springs',116.053,23.581,'river-spring','临溪石池、木栈道与休憩茶亭。',false],
  ['dongxingpu','东星埔温泉','Dongxingpu Hot Springs',115.825,23.412,'garden-spring','天然温泉意象、石围浴池与竹篱花园。',false]
];
export const jiexiPlaces=definitions.map(([id,name,en,lon,lat,model,description,priority])=>({
  id:'jiexi-'+id,name,en,ll:[lon,lat],kind:'jiexi',area:'揭西',model,description,priority,
  displayScale:.85,top:.40,halfHeight:.56,span:1.05,pin:true,major:false,offset:[3,4,5],
  footprint:[-.51,.51,-.408,.408],
  contextModel:['old-town','residence','street-temple'].includes(model)?'old-town':['academy','temple','memorial'].includes(model)?'courtyard':'forest',
  detail:description+' 区域锚点与展示位置为近似布局，模型为艺术化示意，不是实测建筑或实时地图。',
  tags:['揭西',priority?'核心地标':'山水探索','近似位置'],source:jiexiSource
}));
