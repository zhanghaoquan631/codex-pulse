const wiki=name=>'https://zh.wikipedia.org/wiki/'+encodeURIComponent(name);
const recipes={
 '牛肉丸':['牛肉打成肉浆后成丸煮熟，外形圆润，口感紧实弹牙。可作汤丸，也常见于潮汕牛肉火锅。','肉丸截面、汤色与沙茶蘸料','牛肉丸'],
 '蚝烙':['以鲜蚝、薯粉和蛋液煎制，边缘香脆，内部柔软。鲜蚝的形态与煎香的蛋皮是它的辨识点，并不是面饼或包子。','鲜蚝、蛋皮与焦脆边缘','蚝烙'],
 '潮汕粿品':['粿是一个品类，而不是单一小吃。红桃粿有桃形外皮和压印纹样，其他粿品的形状、馅料与制作方式各有不同。','本页以红桃粿为品类示例','红桃粿'],
 '鸭母捻':['潮汕甜汤小吃，以糯米皮包裹甜馅，煮熟后配糖水。成品常呈椭圆形，名称并不表示以鸭肉制作。','糯米外皮、甜馅与糖水','鸭母捻'],
 '腐乳饼':['潮汕传统饼食，腐乳参与调味，形成咸甜交织的风味。不同饼家的馅料配方和饼皮厚度有所差异。','饼皮与剖面馅料','腐乳饼'],
 '工夫茶':['潮汕工夫茶强调茶具、冲泡节奏与分茶过程。小壶、小杯和茶盘共同构成围坐品茶的日常场景。','小壶、小杯与分茶','工夫茶'],
 '乒乓粿':['揭阳传统粿食，常见为半透明粿皮包裹糯米等馅料。其外皮、压纹和馅料，与红桃粿、汤圆并不相同。','半透明外皮与糯米馅','乒乓粿'],
 '普宁豆干':['普宁代表性豆制品，常切块油炸后配蘸料食用。金黄色的外皮和柔嫩的内部，是观察它时最直观的对比。','炸后表皮、豆干切面与蘸碟','普宁豆干'],
 '普宁面线':['普宁传统面食，以细长面线为主要食材。可根据做法搭配汤汁或其他配料，和宽片状的粿汁有明显区别。','细面线与具体配菜','普宁面线'],
 '洪阳粿汁':['洪阳一带的传统米制小吃，以粿片配汤汁及卤味等配料。重点在薄片状的粿及汤料组合，而不是细面条。','粿片形态、汤汁与配料','粿汁'],
 '海鲜鱼饭':['“鱼饭”通常指将海鱼以盐水等方式煮熟后食用的潮汕鱼食，并非一碗鱼肉炒饭。呈现方式强调鱼本身的鲜味。','完整鱼身、鱼皮与鱼肉','鱼饭'],
 '海鲜粥':['以米粥搭配鱼、虾等海鲜，食材会随做法及供应变化。和鱼饭相比，它的主要视觉特征是粥汤与可辨认的海鲜。','粥汤、米粒与海鲜','潮汕砂锅粥'],
 '肠粉':['米浆蒸成薄皮后加入馅料，折叠或卷起并配酱汁。潮汕各地的配料和酱料不同，不能用一种照片代表所有店家的做法。','薄米皮、馅料与酱汁','肠粉'],
 '卤狮头鹅':['澄海具有代表性的卤鹅菜肴，鹅肉经卤制后切件上桌。切片、卤色及皮肉层次是它与丸类、粿类不同的特征。','卤鹅切件及皮肉层次','卤鹅'],
 '惠来鱼丸':['惠来沿海饮食中的鱼制品，以鱼肉加工成丸。具体鱼种、配料和口感随制作而不同，不能直接拿牛肉丸照片替代。','鱼丸色泽与剖面','惠来鱼丸'],
 '隆江绿豆饼':['惠来隆江的传统饼食，以绿豆馅为主要特色。展示时应区分饼皮与馅心，不能与腐乳饼混为一谈。','饼皮与绿豆馅心','隆江绿豆饼'],
 '客家擂茶':['客家饮食中的擂制茶食，将茶叶及其他配料研磨后冲调。配方各地不同，擂钵、擂棒和茶汤共同体现制作过程。','擂钵、研磨配料与茶汤','擂茶'],
 '客家酿豆腐':['在豆腐中填入馅料后烹制的客家菜。辨识重点是豆腐块中的馅心，而不是单纯炸豆干。','豆腐外形与酿入的馅料','酿豆腐'],
 '山间茶点':['这是地图中的茶歇组合名称，并非某一种有固定配方的地方名菜。它表现茶饮与小点心搭配的休闲场景。','茶饮与点心组合',null]
};
export const foodDetails=Object.fromEntries(Object.entries(recipes).map(([name,[intro,look,article]])=>[name,{intro,look,article,source:article?wiki(article):null}]));
const aliases={
 'small-park':'小公园开埠区','shantou-memorial':'中山纪念亭','南澳岛':'南澳县','中山公园':'中山公园 (汕头)',
 '凤凰山':'凤凰山 (潮州)','灵山寺':'灵山寺 (汕头)','汤溪水库 · 汤溪湖':'汤溪水库','龙湖古寨古建筑群':'龙湖古寨',
 '韩江北溪':'韩江','洪阳培风塔':'培风塔','洪阳培风塔一带':'培风塔','南澳总兵府':'南澳总兵府','总兵府':'南澳总兵府',
 '北回归线广场 · 自然之门':'北回归线标志塔 (南澳)','黄花山国家森林公园':'黄花山','黄岐山森林公园':'黄岐山',
 '潮汕高铁站':'潮汕站','普宁高铁站':'普宁站','汕头高铁站':'汕头站'
};
export function detailKey(place,dish){return dish?foodDetails[dish]?.article||dish:aliases[place.id]||aliases[place.name]||place.name;}
export function safeSource(value){try{const url=new URL(value);return url.protocol==='https:'||url.protocol==='http:'?url.href:null;}catch{return null;}}
export function detailContent(place,dish,catalog={}){
 const name=dish||place.name,key=detailKey(place,dish),entry=catalog[key]||{},food=dish&&foodDetails[dish];
 const photos=[...(entry.photos||[])];
 if(['small-park','shantou-memorial'].includes(place.id)&&!dish)photos.unshift({src:'/photos/small-park-user.jpg',caption:'小公园 · 中山纪念亭夜景',author:'用户提供',license:'用户提供图片',source:'',change:'原图'});
 return {name,key,photos,intro:food?.intro||entry.intro||place.detail||place.description||`${place.name}是当前潮汕地图中的一个地区节点。`,look:food?.look||place.tags?.join(' · ')||'',
  scene:dish?'地图中的餐具、摆盘和店铺为艺术化演绎，不代表具体商家的出品。':place.description||'',
  article:safeSource(entry.article||food?.source||place.source),introSource:entry.intro&&!food?entry.article:null,introCredit:entry.introCredit||'资料摘要：维基百科',
  search:'https://www.google.com/search?tbm=isch&q='+encodeURIComponent((dish?'潮汕 ':place.area?place.area+' ':'潮汕 ')+name+' 实拍'),
  map:!dish&&place.ll?.length===2?'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(place.ll[1]+','+place.ll[0]):null};
}
