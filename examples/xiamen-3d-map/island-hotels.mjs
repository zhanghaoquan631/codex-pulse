import catalog from './public/data/island-hotels.json' with {type:'json'};
import {travelPlaces} from './travel-data.mjs';
import {distanceMeters} from './geo-utils.mjs';

export const hotelCatalogInfo={snapshot:catalog.snapshot,checkedOn:'2026-09-28',coverage:catalog.coverage};
// Match named map records, not similarly named hotels or inferred branches.
const profiles={
 '林氏宴集(林氏府公馆酒店)':{displayName:'鼓浪屿林氏府公馆酒店',address:'鹿礁路11–19号',theme:'公馆别墅与闽南风格',intro:'以历史公馆及独立别墅组成住宿空间，结合西洋、南洋与闽南装饰语汇。木作、花园与餐饮空间是特色；地图采用园区内餐厅的位置参考，不是入住入口。',features:['历史公馆','独立别墅','花园','餐厅'],source:'https://hotels.ctrip.com/hotels/435030.html'},
 '琴笙酒店(鼓浪屿海底世界钢琴码头店)':{displayName:'琴笙酒店（鹿礁路店）',address:'鹿礁路8号',theme:'东岸街区与便利设施',intro:'位于鹿礁路、钢琴码头一带。住宿资料列有电梯、洗衣房和行李寄存，适合在比较岛内老别墅住宿时一并考虑；无障碍通达情况仍须向酒店核实。',features:['电梯','洗衣房','行李寄存'],source:'https://hotels.corporatetravel.ctrip.com/hotels/436727.html'},
 '鼓浪屿聆感末凡酒店':{displayName:'聆感 · 末凡古堡酒店',address:'复兴路88号',theme:'德式老宅与彩色室内',intro:'保留德式历史宅邸外观，室内融入色彩与艺术装饰。花园、茶室和咖啡厅让它区别于单纯的客房住宿，儿童设施及服务须按预订日期确认。',features:['历史宅邸','花园','茶室','咖啡厅'],source:'https://hotels.ctrip.com/hotels/436718.html'},
 '黄家花园':{displayName:'鼓浪屿黄家花园酒店',address:'晃岩路27号',theme:'历史别墅群与园林',intro:'住宿位于黄家花园历史别墅环境中，以老建筑和绿化庭院为特色。历史建筑参观点与酒店入住入口并不完全等同，抵达前请核对门牌和接待入口。',features:['历史别墅','园林环境','南部景点周边'],source:'https://m.ctrip.com/html5/hotel/hoteldetail/106796421.html'},
 '鼓浪屿杨桃院子复兴古堡店':{displayName:'杨桃院子 · 复兴古堡',address:'复兴路13号',theme:'拱廊古堡与庭院书吧',intro:'老建筑的拱廊和庭院是辨识点，公开住宿资料列有书吧、咖啡厅、花园与茶室。与同品牌其他分店分开标注，订房时需核对复兴路店址。',features:['拱形外廊','书吧','花园','咖啡厅'],source:'https://hotels.ctrip.com/hotels/1728375.html'},
 '菲尔仕花园酒店':{address:'兴化路1号',theme:'历史别墅与花园',intro:'由历史别墅改造，保留老建筑空间，融入现代客房设施。花园、咖啡厅与屋顶露台是住宿资料中的特色。',features:['历史别墅','花园','咖啡厅','露台'],source:'https://hotels.ctrip.com/hotels/9134521.html'},
 'HUMBLE HALL红堂酒店':{address:'公平路18号',theme:'山坡老宅与阅读',intro:'位于岛内山坡街巷，以老宅、木质空间与庭院形成较安静的住宿氛围。资料列有图书室、咖啡厅和花园。',features:['老宅庭院','图书室','咖啡厅','餐厅'],source:'https://hotels.ctrip.com/hotels/4337031.html'},
 '鼓浪屿李家庄酒店':{displayName:'鼓浪屿李家庄 · LEE MANOR',address:'漳州路38号',theme:'红砖侨宅与南洋风情',intro:'红砖侨宅结合南洋建筑风格，庭院与外廊是这里的辨识点。住宿资料列有茶室、咖啡厅和图书室，可与毓园一带的游览安排在一起。',features:['红砖侨宅','庭院','茶室','图书室'],source:'https://hotels.ctrip.com/hotels/436715.html'},
 '罗望厦门鼓浪屿北屿酒店':{displayName:'鼓浪屿北屿酒店',address:'内厝澳路461号',theme:'岛北街巷与庭院',intro:'位于内厝澳路的岛北街巷，住宿资料列有庭院、行李寄存与前台服务。到码头及房间的实际坡道、台阶和接送安排须向酒店确认。',features:['庭院','行李寄存','24小时前台'],source:'https://www.chinaholiday.com/cn/city_296/605459.html'},
 '海上花园酒店':{address:'田尾路（具体门牌以酒店确认信息为准）',theme:'南岸海滨与园林',intro:'位于鼓浪屿南岸田尾路一带，与菽庄花园及海滨浴场相邻。特色在于滨海园林环境；是否能看海取决于具体房型，不能由酒店名称推定。',features:['滨海园林','菽庄花园周边','海滨步道'],source:'https://www.klook.com/zh-CN/activity/118783-marine-garden-hotel/'}
};
const landmarks=travelPlaces.filter(p=>p.island&&p.area!=='ferry');
export const hotelAreas={all:'全岛住宿',north:'岛北街巷',east:'东侧街巷',south:'南岸片区',west:'西侧片区'};
function areaOf(ll){return ll[1]>24.4504?'north':ll[1]<24.4444?'south':ll[0]<118.061?'west':'east';}
const contexts={
 north:'岛北街巷与坡地交织，选择码头时应同时核对行李搬运和台阶情况。',
 east:'东侧建筑街巷较密集，游览可串联老建筑与商业街，客房隔音和朝向须另行确认。',
 south:'南岸分布海滨步道与园林，接近海岸不等于客房拥有海景。',
 west:'西侧兼有居民街巷与坡地，前往内厝澳码头应以实际道路和开放入口为准。'
};
const duplicates=new Map();
for(const h of catalog.hotels)duplicates.set(h.name,(duplicates.get(h.name)||0)+1);
export const mappedIslandHotels=catalog.hotels.map(h=>{
 const profile=profiles[h.name],zone=areaOf(h.ll);
 const nearby=landmarks.map(p=>({id:p.id,name:p.name,meters:Math.round(distanceMeters(h.ll,p.ll))})).sort((a,b)=>a.meters-b.meters).slice(0,3);
 return {...h,mapName:h.name,name:profile?.displayName||h.name,area:'hotels',island:true,zone,category:'hotel',
  kind:h.kind==='hostel'?'旅舍':h.kind==='guest_house'?'民宿 / 客栈':'酒店 / 住宿',
  profile,nearby,intro:profile?.intro||contexts[zone],theme:profile?.theme||hotelAreas[zone],
  duplicate:duplicates.get(h.name)>1};
});
export function filterHotels(query='',zone='all'){
 const text=query.trim().toLocaleLowerCase();
 return mappedIslandHotels.filter(h=>(zone==='all'||h.zone===zone)&&(!text||[h.name,h.mapName,h.profile?.address,h.theme,...h.nearby.map(p=>p.name)].filter(Boolean).join(' ').toLocaleLowerCase().includes(text)));
}
export function nearestHotel(place){
 return mappedIslandHotels.reduce((best,h)=>!best||distanceMeters(place.ll,h.ll)<distanceMeters(place.ll,best.ll)?h:best,null);
}
