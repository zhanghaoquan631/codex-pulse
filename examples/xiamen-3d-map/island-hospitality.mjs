export const hospitalityCheckedOn='2026-09-28';
const foodList='https://gs.ctrip.com/html5/you/foods/gulangyu120058.html';
export const islandFoods=[
 {id:'yeshi',name:'叶氏麻糍（鼓浪屿店）',dish:'麻糍',address:'龙头路145号',amount:14,priceType:'平台人均',intro:'糯米外皮裹芝麻、花生和糖，口感软糯，适合作为街巷散步时的小点。',note:'含花生、芝麻；人均统计不是一盒的菜单售价。',source:'https://gs.ctrip.com/html5/you/foods/Xiamen21/319760.html'},
 {id:'fishball',name:'龙头鱼丸店',dish:'手工鱼丸汤',address:'龙头路183号',amount:16,priceType:'平台人均',intro:'清汤配弹韧鱼丸，和以花生酱香为主的沙茶面是两种不同口味。',note:'含鱼；份量、包心与双拼价格请看当日菜单。',source:foodList,addressSource:'https://maps.apple.com/place?_provider=57879&place-id=H2710I3F9267A72A56C'},
 {id:'linshacha',name:'林氏沙茶面（街心公园总店）',dish:'沙茶面',address:'龙头路264号1至3楼',amount:34,priceType:'平台人均',intro:'沙茶汤底配面条与自选配料。海鲜、肉类及加料组合会改变整碗价格。',note:'沙茶常含花生及海鲜成分；下单前核对过敏原和加料费用。',photo:'shacha',source:'https://gs.ctrip.com/html5/you/foods/poiAround/120058/4925980-10560568-food.html',addressSource:'https://hk.trip.com/restaurant/china/xiamen/detail/restaurant-97173222/'},
 {id:'egg',name:'蛋满灌（龙头路店）',dish:'手工灌蛋',address:'龙头路175号',amount:20,priceType:'平台人均',intro:'以灌入馅料的蛋制品为主的小吃选择，可与麻糍、鱼丸错开体验。',note:'含蛋，馅料以店内说明为准。平台人均可能同时包含其他小吃。',source:foodList,addressSource:'https://you.ctrip.com/restaurantlist/gulangyu120058.html'},
 {id:'linbanquet',name:'林氏宴集（林氏府公馆酒店）',dish:'闽南正餐',address:'鹿礁路11–19号',amount:127,priceType:'平台人均',intro:'适合把零食巡吃换成一顿坐下来的闽南餐。菜式、份量和海鲜计价需向餐厅确认。',note:'此金额为平台消费参考，并非固定套餐；订位与供应情况须另行核实。',source:foodList}
];
export const islandHotels=[
 {id:'north',name:'鼓浪屿北屿酒店',address:'内厝澳路461号',area:'岛北 · 三丘田片区',amount:268,room:'双床房约25–32㎡；复式阁楼约35㎡',features:'庭院、行李寄存、24小时前台',source:'https://www.chinaholiday.com/cn/city_296/605459.html'},
 {id:'1930',name:'爱菲儿酒店（鼓浪屿1930店）',address:'龙头路245号',area:'龙头路街巷',amount:688,room:'阳台大床约26㎡；复式房约40㎡',features:'老洋房院落、行李寄存、24小时前台',source:'https://www.chinaholiday.com/cn/city_296/244034.html'},
 {id:'lin',name:'鼓浪屿林氏府公馆酒店',address:'鹿礁路11–19号',area:'岛东南 · 海天堂构一带',amount:1318,room:'公馆大床约25㎡；贵宾房约44–54㎡',features:'历史宅院、花园、餐厅、行李寄存',source:'https://www.chinaholiday.com/cn/city_296/50255.html'}
].map(h=>({...h,priceType:'平台未选日期起价',checkin:'平台标注14:00后入住、12:00前退房',note:'非实时房态或可订报价。早餐、取消规则、楼梯与电梯、行李接送、儿童入住需按日期和房型确认。'}));
export function islandHospitality(place,index=0){
 const northern=place.ll[1]>24.4505;
 return {food:islandFoods[index%islandFoods.length],hotel:islandHotels[northern?0:1+index%2],areaNote:'岛内吃住备选，不代表就在当前景点内或最近的一家。'};
}
export function priceFreshness(now=Date.now()){
 return now-Date.parse(hospitalityCheckedOn+'T00:00:00+08:00')>30*86400000?'资料已超过30天，请重新核对价格。':'查询的是公开平台展示，不是商家当日报价。';
}
