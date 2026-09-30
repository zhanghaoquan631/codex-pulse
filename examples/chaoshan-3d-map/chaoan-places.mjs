import {positionShantouPlaces} from './shantou-places.mjs';

export const chaoanSources={
  landscape:'https://www.chaoan.gov.cn/ywdt/zfdt/content/post_3927346.html',
  tea:'https://www.chaoan.gov.cn/ywdt/cayw/content/post_3846388.html',
  heritage:'https://www.chaoan.gov.cn/ywdt/cayw/content/post_3822234.html',
  she:'https://www.chaoan.gov.cn/zjca/qcgm/msfq/content/post_3847396.html'
};
// Approximate regional anchors, not surveyed entrances or building footprints.
const definitions=[
  ['fenghuang','凤凰山','Fenghuang Mountain',116.659,23.941,'summit','群峰、林线、盘山步道与流过山腰的薄雾。','forest',true,'landscape'],
  ['tianchi','凤凰天池','Fenghuang Tianchi',116.688,23.926,'crater-lake','高山湖盆、岩岸与沿湖观景步道。','forest',true,'landscape'],
  ['wudong','乌岽山 · 乌岽茶区','Wudong Tea Highlands',116.681,23.907,'ridge-tea','随山坡展开的弧形茶垄、古茶树和采茶人。','forest',true,'tea'],
  ['fenghuang-town','凤凰镇','Fenghuang Tea Town',116.666,23.826,'tea-town','茶铺、制茶作坊、晒青竹盘与连接街巷的品茶院。','town',false,'tea'],
  ['dancong','凤凰单丛茶园','Dancong Tea Garden',116.651,23.865,'old-tea-garden','独立古茶树、采摘篮、茶叶观察台与茶事体验。','forest',false,'tea'],
  ['fengxiang','凤翔峡','Fengxiang Gorge',116.692,23.831,'cascade-gorge','峡壁、分段瀑布、溪潭与架高栈桥。','forest',false,'landscape'],
  ['jiaoshuikeng','叫水坑原始森林','Jiaoshuikeng Forest',116.703,23.881,'canopy-stream','高低错落的森林、蕨丛、溪床和林下小径。','forest',false,'landscape'],
  ['reservoir','凤凰水库','Fenghuang Reservoir',116.683,23.857,'reservoir','山间水面、分汊库湾、坝体与观景平台。','forest',false,'landscape'],
  ['longhu','龙湖古寨','Longhu Ancient Village',116.639,23.557,'walled-village','南北主街、平行巷道、门楼和连续的传统街屋。','old-town',true,'heritage'],
  ['longhu-halls','龙湖古寨古建筑群','Longhu Heritage Courtyards',116.641,23.561,'ancestral-courts','多进祠堂、天井、山墙、门廊与木作展示。','courtyard',false,'heritage'],
  ['longhu-water','龙湖水乡景观','Longhu Waterside',116.645,23.554,'canal-village','池塘、水道、亭台、廊桥和沿水宅院。','old-town',false,'heritage'],
  ['xiangpu','象埔寨','Xiangpu Walled Village',116.567,23.665,'fortified-courts','围寨墙、门楼、更楼、祠堂与古井院落。','courtyard',false,'landscape'],
  ['guxiang','古巷镇','Guxiang Ceramics Town',116.568,23.679,'ceramic-town','陶瓷展厅、拉坯工坊、器物陈列与传统街屋。','town',false,'landscape'],
  ['anbu','庵埠文祠','Anbu Wenci',116.672,23.452,'scholar-hall','对称文祠、拜亭、院墙、书案与参观步道。','courtyard',false,'landscape'],
  ['sangpu','桑浦山','Sangpu Mountain',116.579,23.521,'granite-ridge','花岗岩峰、山林、石阶与山脚休憩空间。','forest',false,'landscape'],
  ['hanjiang','韩江 · 潮安沿岸','Hanjiang Riverside',116.666,23.605,'river-life','宽阔水道、堤岸绿道、沿江街屋与有界航行的船只。','town',true,'landscape'],
  ['wenci','文祠镇','Wenci Countryside',116.673,23.758,'orchard-village','茶果间作、村屋、溪谷、农产品摊与乡间步道。','forest',false,'tea'],
  ['fenghuang-stream','凤凰溪','Fenghuang Stream',116.665,23.805,'stream-greenway','曲折溪流、连续碧道、跨溪小桥和茶田。','forest',false,'tea'],
  ['memorial','凤凰山革命纪念公园','Fenghuang Memorial Park',116.674,23.838,'memorial-garden','纪念广场、展廊、松林与安静的参观游线。','courtyard',false,'landscape'],
  ['she','凤凰山畲族文化','She Cultural Village',116.657,23.811,'culture-village','以石古坪等村寨文化为参考，表现茶事、织作展示、交流与村落生活。','courtyard',false,'she']
];
export const chaoanPlaces=definitions.map(([id,name,en,lon,lat,model,description,contextModel,priority,source])=>({
  id:'chaoan-'+id,name,en,ll:[lon,lat],model,description,contextModel,priority,kind:'chaoan',area:'潮州市潮安区',
  displayScale:.85,halfHeight:.63,span:1.12,top:.52,offset:[3,4,5],pin:true,major:false,footprint:[-.55,.55,-.44,.44],
  detail:description+' 艺术化微缩展示；坐标是近似地区锚点，建筑、服饰与场景布局非测绘复原，动画非实时数据。',
  tags:['潮州市潮安区',priority?'核心地标':'地区探索','近似位置'],source:chaoanSources[source]
}));
export function positionChaoanPlaces(options){positionShantouPlaces({...options,places:options.places||chaoanPlaces});}
