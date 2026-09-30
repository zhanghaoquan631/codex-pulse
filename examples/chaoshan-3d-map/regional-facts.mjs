// Statistics are a reviewed snapshot, not a live feed. Publication year is not the reporting period.
export const factsCheckedAt='2026-09-19';
export const factsMethod='常住人口不等于户籍人口或游客人数；居民人均可支配收入不是平均工资。半年收入不与全年收入直接比较，也不据此推算全年。市级数据包含下辖县区，不可重复相加。';

const source=(title,publisher,publishedAt,url)=>({title,publisher,publishedAt,url});
export const regionalSources={
 'st25':source('2025年汕头国民经济和社会发展统计公报','汕头市统计局、国家统计局汕头调查队','2026-05-07','https://www.shantou.gov.cn/ststjj/gkmlpt/content/2/2532/post_2532927.html'),
 'st26':source('2026年7月汕头市国民经济主要指标','汕头市统计局','2026-09-08','https://www.shantou.gov.cn/cnst/gkml/zwgk/gzwj/qtwj/tjybgb/content/post_2565967.html'),
 'cz25':source('2025年潮州市国民经济和社会发展统计公报','潮州市统计局','2026-05-13','https://www.chaozhou.gov.cn/attachment/0/568/568748/3991598.pdf'),
 'cz26':source('2026年上半年潮州经济运行简况','潮州市统计局','2026-07-24','https://www.chaozhou.gov.cn/zwgk/tjxx/tjfx/content/post_3999474.html'),
 'jy25':source('2025年揭阳市国民经济和社会发展统计公报','揭阳市统计局','2026-06-30','https://www.jieyang.gov.cn/attachment/0/172/172898/1030784.pdf'),
 'jy26':source('上半年全市经济运行简况','揭阳市统计局','2026-08-03','https://www.jieyang.gov.cn/tjj/tjsj/kx/content/post_1037259.html'),
 'jy-report':source('2026年政府工作报告','揭阳市人民政府',null,'https://www.jieyang.gov.cn/zwgk/jcxxgk/fggw/szfwj/content/post_1004715.html'),
 'jy-pop':source('2025年揭阳市国民经济统计快报','揭阳市统计局','2026-05-07','https://www.jieyang.gov.cn/attachment/0/171/171120/1020298.xls'),
 'pn25':source('2025年普宁市国民经济和社会发展统计公报','普宁市统计局','2026-07-27','https://www.puning.gov.cn/attachment/0/173/173669/1035814.pdf'),
 'pn26':source('2026年上半年普宁经济运行简况','普宁市统计局','2026-08-07','https://www.puning.gov.cn/zwgk/jcgk/tjxx/content/post_1038876.html'),
 'na25':source('2025年南澳县国民经济和社会发展统计公报','南澳县统计局','2026-05-22','https://www.nanao.gov.cn/attachment/0/157/157522/2539314.pdf'),
 'cy25':source('2025年潮阳区国民经济和社会发展统计公报','汕头市潮阳区统计局','2026-09-01','https://www.gdcy.gov.cn/stcytjj/attachment/0/158/158751/2564153.pdf'),
 'cy26':source('潮阳区2026年6月份统计月报','汕头市潮阳区统计局','2026-08-13','https://www.gdcy.gov.cn/stcytjj/attachment/0/158/158164/2559861.pdf'),
 'cn25':source('2025年汕头市潮南区国民经济和社会发展统计公报','汕头市潮南区统计局','2026-05-12','https://www.chaonan.gov.cn/attachment/0/152/152475/2534823.pdf'),
 'ch-report':source('政府工作报告（2026年4月）','汕头市澄海区人民政府','2026-04-30','https://www.chenghai.gov.cn/gkmlpt/content/2/2532/post_2532314.html'),
 'ca25':source('2025年潮州市潮安区国民经济和社会发展统计公报','潮州市潮安区统计局','2026-05-25','https://www.chaoan.gov.cn/attachment/0/569/569116/3993475.pdf'),
 'rp25':source('潮州市饶平县2025年国民经济和社会发展统计公报','饶平县统计局','2026-05-27','https://www.raoping.gov.cn/zwgk/tjxx/content/post_3993075.html'),
 'hl25':source('2025年惠来国民经济和社会发展统计公报','惠来县统计局','2026-07-02','https://www.huilai.gov.cn/bmzz/hlxtjj/dt/content/post_1031174.html'),
 'jx-intro':source('揭西简介','揭西县人民政府门户网站','2026-01-12','https://www.jiexi.gov.cn/zjjx/jxjj/content/post_995179.html'),
};

const population=(value,unit,sourceId,locator)=>({value,unit,period:'2025年末',periodEnd:'2025-12-31',sourceId,locator});
const income=(value,urban,rural,sourceId,halfYear=false,locator='人口和人民生活')=>({value,urban,rural,unit:'元/人',period:halfYear?'2026年上半年':'2025年全年',periodEnd:halfYear?'2026-06-30':'2025-12-31',sourceId,locator});
const trait=(title,text,sourceId,locator)=>({title,text,sourceId,locator});
export const regionalFacts={
 '汕头市':{
  scope:'汕头市全市（含下辖区县）',
  population:population(557.69,'万人','st25','综合：年末常住人口'),
  income:income(19636,21729,14276,'st26',true,'第六项明确标注收入为1—6月，非1—7月'),
  traits:[trait('玩具与外向型制造','玩具、机电产品是汕头出口商品中的重要类别，城市生活之外也有鲜明的制造业与商贸特色。','st25','对外经济：出口商品分类')],
 },
 '潮州市':{
  scope:'潮州市全市（含潮安区、饶平县等）',
  population:population(257.88,'万人','cz25','PDF第2页：年末人口'),
  income:income(17143,18367,14826,'cz26',true,'第七节：居民收入'),
  traits:[trait('陶瓷与食品产业','陶瓷、食品、印刷等构成潮州的产业面貌。韩江古城之外，地区介绍也保留这些日常生产与生活的内容。','cz26','第二产业：支柱行业')],
 },
 '揭阳市':{
  scope:'揭阳市全市（含普宁市、揭西县、惠来县等）',
  population:population(568.72,'万人','jy25','PDF第2页：常住人口'),
  income:income(15228,17653,12527,'jy26',true,'第八项：居民收入'),
  traits:[trait('制造、商贸与玉文化','绿色石化、海洋经济、五金、纺织、玉文化等在揭阳并存，不能只用一种古城或滨海景观代表全市。','jy-report','产业发展与文旅相关章节')],
 },
 '普宁市':{
  scope:'普宁市（揭阳市所辖县级市）',
  population:population(205.10,'万人','pn25','PDF第2页：常住人口'),
  income:income(16635,18616,14786,'pn26',true,'第八项：居民收入'),
  traits:[trait('纺织服装、食品与医药','统计公报将纺织服装制造、食品加工制造和医药制造列为三大支柱产业；这也是普宁商贸街区之外值得了解的一面。','pn25','PDF第5页：三大支柱产业')],
 },
 '南澳岛':{
  scope:'南澳县全县；不是单个景点或仅主岛范围',
  population:population(63383,'人','na25','PDF第13页：常住人口'),
  income:income(22908,23605,20184,'na25',false,'PDF第14页：居民收入'),
  traits:[trait('海岛渔业与旅游','海洋捕捞、海水养殖与海岛旅游共同构成南澳生活。渔港、海湾、森林和渔灯民俗各有不同的内容。','na25','PDF第3页农业、第9页旅游')],
 },
 '潮阳区':{
  scope:'汕头市潮阳区',
  population:population(168.11,'万人','cy25','PDF第2页：常住人口'),
  income:income(28307,32678,23321,'cy25',false,'PDF第8页：居民收入'),
  traits:[trait('纺织生产与滨海渔业','潮阳既有纺织制造活动，也有海水与淡水渔业。沿海片区和城镇工业片区的生产生活并不相同。','cy26','PDF第6页：纺织业'),trait('海水与淡水产品','2025年公报分别列出海水产品和淡水产品产量，反映潮阳滨海与内陆水域并存的生产背景。','cy25','PDF第4页：水产品')],
 },
 '潮南区':{
  scope:'汕头市潮南区',
  population:population(125.36,'万人','cn25','PDF第2页：常住人口'),
  income:income(28580,32566,24766,'cn25',false,'PDF第5—6页：人民生活'),
  traits:[trait('纺织服装与印染','纺织服装是公报明确列出的主导产业，主要产品包括服装、布、印染布和纱。潮南的城镇生活与这条产业链联系紧密。','cn25','PDF第3页：工业和建筑业')],
 },
 '澄海区':{
  scope:'汕头市澄海区',population:null,income:null,
  availability:'本次尚未核实澄海区2025年末常住人口和2025—2026年居民收入，不以户籍人口或全市数据替代。',
  traits:[trait('玩具创意与侨乡','2026年政府工作报告回顾了玩具创意产业、玩博会，以及樟林古港、陈慈黉故居等涉侨文物修缮。玩具制造与侨乡文化共同构成澄海的辨识度。','ch-report','十四五回顾与2025年工作')],
 },
 '潮安区':{
  scope:'潮州市潮安区',
  population:population(118.12,'万人','ca25','PDF第4页：常住人口'),
  income:income(30382,32415,26669,'ca25',false,'PDF第11页：人民生活'),
  traits:[trait('茶园与多样制造业','茶叶种植、陶瓷、不锈钢、食品和印刷均见于当地统计公报。山地茶区与平原产业聚落应呈现不同的地区性格。','ca25','PDF第6页茶叶、第8页工业')],
 },
 '饶平县':{
  scope:'潮州市饶平县',
  population:population(81.85,'万人','rp25','人口和人民生活：年末常住人口'),
  income:income(26508,30202,22900,'rp25'),
  traits:[trait('单丛茶与滨海渔业','茶山、海洋捕捞和海水养殖同时出现在饶平的农业结构中；广东饶平单丛茶文化系统也被公报单独记录。','rp25','农业与文化相关章节')],
 },
 '惠来县':{
  scope:'揭阳市惠来县',
  population:population(106.78,'万人','hl25','综合：常住人口'),
  income:income(24648,30409,19873,'hl25',false,'综合：居民收入'),
  traits:[trait('海洋渔业与绿色石化','惠来既有海水产品生产、水产加工，也有绿色石化产业。渔港生活和现代工业是不同但同时存在的地方内容。','hl25','农业、绿色石化产业章节')],
 },
 '揭西县':{
  scope:'揭阳市揭西县',
  population:population(67.60,'万人','jy-pop','工作表“人口”，揭西县行，年末常住人口列'),income:null,
  availability:'已核实2025年末人口；本次尚未核实揭西县2025—2026年居民收入，暂不填入估算数。',
  traits:[trait('山水、温泉与潮客文化','大北山森林、黄满寨瀑布、温泉与棉湖古镇形成不同的自然和人文景观。客家与潮汕文化交融，擂茶、酿豆腐等也是当地特色。','jx-intro','旅游资源、饮食、方言章节')],
 },
};

export function factsForPlace(place){
 // Do not attach county-wide statistics to an individual attraction, food dish or simulated street.
 if(place?.kind!=='district')return null;
 return regionalFacts[place.name==='南澳县'?'南澳岛':place.name]||null;
}
export function formatFact(metric){
 if(!metric)return '尚未核实';
 const precision=metric.unit==='万人'?2:0;
 return new Intl.NumberFormat('zh-CN',{minimumFractionDigits:precision,maximumFractionDigits:precision}).format(metric.value);
}
