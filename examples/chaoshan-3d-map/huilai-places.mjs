export const huilaiSource='https://www.huilai.gov.cn/zjhl/lyxx/content/post_52083.html';
// Approximate editorial anchors, not surveyed entrances or navigation coordinates.
const definitions=[
  ['keniaowei','靖海客鸟尾石笋区','Keniaowei Sea Rocks',116.585,22.990,'sea-rocks','高低错落的海蚀岩柱、潮池与绕岩栈道。',true],
  ['spring','神泉海角甘泉','Haijiao Sweet Spring',116.318,22.974,'sweet-spring','古井、石碑、围栏和神泉镇的小型街巷广场。',true],
  ['lighthouse','石碑山灯塔','Shibeishan Lighthouse',116.495,22.935,'striped-lighthouse','黑白横纹塔身、灯室与面向海面的礁岸。',true],
  ['jinghai','靖海古城','Jinghai Old City',116.538,22.997,'walled-city','城门、古城墙、老街与低矮传统民居。',true],
  ['battery','澳角炮台','Aojiao Coastal Battery',116.346,22.978,'battery','厚实海防石墙、炮位与海边高地步道。',true],
  ['harbour','神泉渔港','Shenquan Fishing Harbour',116.309,22.970,'fish-market','防波堤、渔船泊位、鱼筐与岸边鲜鱼市场。',true],
  ['jinghai-bay','靖海湾','Jinghai Bay',116.550,22.982,'crescent-bay','弧形沙岸、帆船与连续滨海慢行空间。',false],
  ['resort','惠来海滨度假村','Huilai Seaside Resort',116.369,22.988,'beach-resort','沙滩、遮阳棚、度假客房与海边休息平台。',false],
  ['baihua','百花峰','Baihua Peak',116.248,23.131,'flower-peak','林间登山石径、花木与高处观景亭。',false],
  ['minghu','铭湖岩','Minghu Rock Sanctuary',116.210,23.075,'rock-sanctuary','层叠山岩、林间古建与曲折登山步道。',false],
  ['foguang','黄光山佛光寺','Huangguangshan Foguang Temple',116.179,23.073,'buddhist-temple','山门、中轴殿堂、广场与山坡佛像意象。',false],
  ['danan','大南山红色革命根据地','Danan Mountain Heritage',116.134,23.193,'red-mountain','山林、纪念展墙、传统村舍与山间游线。',false],
  ['botanical','金海湾植物园','Jinhaiwan Botanical Garden',116.398,23.002,'botanical','植物分区、棕榈、竹林、花圃和园中步道。',false],
  ['shenquan-bay','神泉湾','Shenquan Bay',116.302,22.963,'fishing-bay','渔湾、岸边街屋、海上浮排与归航小船。',false],
  ['zishen','资深湾 · 资深渔港','Zishen Fishing Harbour',116.418,22.969,'working-port','成排渔船、工作码头、修船架与整网场。',false],
  ['gangliao','港寮湾','Gangliao Bay',116.461,22.963,'quiet-bay','沙丘、礁岸、防风林与低密度海边休憩空间。',false]
];
export const huilaiPlaces=definitions.map(([id,name,en,lon,lat,model,description,priority])=>({
  id:'huilai-'+id,name,en,ll:[lon,lat],model,description,priority,kind:'huilai',area:'惠来',
  displayScale:.85,halfHeight:.56,span:1.10,top:.43,offset:[3,4,5],pin:true,major:false,
  footprint:[-.54,.54,-.43,.43],
  contextModel:['flower-peak','rock-sanctuary','red-mountain','botanical'].includes(model)?'forest':['sweet-spring','walled-city'].includes(model)?'old-town':['fish-market','working-port'].includes(model)?'harbour':model==='buddhist-temple'?'courtyard':'cove',
  detail:description+' 艺术化微缩场景；地理锚点与邻近展示位置为近似值，非实测建筑、真实运营布局或实时海况。',
  tags:['惠来',priority?'核心地标':'滨海探索','近似位置'],source:huilaiSource
}));
