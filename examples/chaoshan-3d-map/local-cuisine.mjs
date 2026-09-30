import * as THREE from 'three';
import {box,disc,sign,tree,person} from './scene-miniatures.mjs';
import {buildDish} from './food-models.mjs';
import {batchStatic} from './static-batch.mjs';
export {dishShape} from './food-models.mjs';

export const regionalMenus=[
  ['汕头市',['牛肉丸','蚝烙','潮汕粿品'],'balls'],
  ['潮州市',['鸭母捻','腐乳饼','工夫茶'],'sweets'],
  ['揭阳市',['乒乓粿','普宁豆干','工夫茶'],'tofu'],
  ['普宁市',['普宁豆干','普宁面线','洪阳粿汁'],'tofu'],
  ['南澳岛',['海鲜鱼饭','海鲜粥','工夫茶'],'seafood'],
  ['潮阳区',['潮汕粿品','肠粉','工夫茶'],'sweets'],
  ['潮南区',['蚝烙','牛肉丸','潮汕粿品'],'balls'],
  ['澄海区',['卤狮头鹅','潮汕粿品','工夫茶'],'seafood'],
  ['潮安区',['工夫茶','腐乳饼','鸭母捻'],'sweets'],
  ['饶平县',['海鲜鱼饭','蚝烙','工夫茶'],'seafood'],
  ['惠来县',['惠来鱼丸','隆江绿豆饼','海鲜粥'],'balls'],
  ['揭西县',['客家擂茶','客家酿豆腐','山间茶点'],'tofu']
];
export const foodSources=['https://www.shantou.gov.cn/cnst/yxst/cszn/lyzn/mcmxc/index.html','https://www.czcityofgastronomy.com/detail/1467','https://www.jieyang.gov.cn/attachment/0/118/118541/401445.pdf'];
export const cuisineLayouts=['骑楼明档','古城甜汤铺','粿铺庭院','豆干开放厨房','海岛鱼市','蒸粿工坊','蚝烙街边厨房','卤鹅宴席','工夫茶庭','渔家长桌','鱼丸与饼铺','山间擂茶院'];

function foodPlate(parent,type,x,y,z){
  disc(parent,'#eef1e8',x,y,z,.038,.005);
  if(type==='tea'){
    disc(parent,'#905d3e',x,y+.006,z,.013,.019);disc(parent,'#684931',x,y+.026,z,.009,.003);
    for(const dx of [-.025,.025])disc(parent,'#e6ddd0',x+dx,y+.006,z,.007,.01);
  }else if(type==='pancake'){
    disc(parent,'#d8a95c',x,y+.006,z,.03,.008);for(let i=0;i<6;i++)box(parent,'#658855',x+Math.sin(i)*.019,y+.015,z+Math.cos(i)*.017,.007,.002,.004);
  }else if(type==='noodles'){
    disc(parent,'#bb936c',x,y+.005,z,.029,.008);for(let i=-2;i<=2;i++)box(parent,'#edd5a4',x+i*.008,y+.014,z,.003,.004,.04);
  }else if(type==='goose'){
    for(let i=0;i<5;i++)box(parent,'#ae693c',x+(i-2)*.009,y+.006,z,.008,.012,.035);
  }else if(type==='balls'||type==='sweets'){
    disc(parent,type==='balls'?'#b88d5c':'#dccb9e',x,y+.005,z,.030,.004);
    for(let i=0;i<5;i++){const m=new THREE.Mesh(new THREE.SphereGeometry(.008,8,6),new THREE.MeshStandardMaterial({color:type==='balls'?'#937051':'#f0dfb7'}));m.position.set(x+Math.sin(i*2.4)*.018,y+.018,z+Math.cos(i*2.4)*.018);parent.add(m);}
  }else if(type==='tofu')for(let i=0;i<6;i++)box(parent,'#e1b350',x+(i%3-1)*.018,y+.006,z+(Math.floor(i/3)-.5)*.020,.016,.016,.018);
  else {const fish=new THREE.Mesh(new THREE.SphereGeometry(.02,8,6),new THREE.MeshStandardMaterial({color:'#98b1b3'}));fish.scale.set(1.5,.3,.65);fish.position.set(x,y+.013,z);parent.add(fish);box(parent,'#739798',x-.033,y+.01,z,.013,.006,.026);}
}
function clearRoads(x,z,roads,r=.20){
  return roads.every(([,bridge,path])=>bridge||path.every((b,i)=>{if(!i)return true;const a=path[i-1],dx=b[0]-a[0],dz=b[1]-a[1],t=THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)>r;}));
}
export function buildCuisine({parent,data,places,heightAt,waterAt,mobile=false}){
  const group=new THREE.Group();group.name='regional-cuisine';parent.add(group);const entries=[],actors=[],courts=[];
  for(const [index,[region,dishes,type]] of regionalMenus.entries()){
    const anchor=places.find(p=>p.kind==='activity'&&p.name.startsWith(region))||places.find(p=>p.name===region);if(!anchor)continue;
    const nearby=data.roads.filter(([, ,path])=>path.some(p=>Math.hypot(p[0]-anchor.x,p[1]-anchor.z)<5));let site;
    outer:for(let r=.40;r<4.5;r+=.20)for(let k=0;k<32;k++){
      const x=anchor.x+Math.sin(k*Math.PI/16)*r,z=anchor.z+Math.cos(k*Math.PI/16)*r,h=heightAt(x,z);
      if(h<0||![[0,0],[-1,-1],[-1,1],[1,-1],[1,1]].every(([dx,dz])=>waterAt(x+dx*.18,z+dz*.18)===null&&Math.abs(heightAt(x+dx*.18,z+dz*.18)-h)<.045)||!clearRoads(x,z,nearby))continue;
      if(places.some(p=>p.span&&Math.hypot(x-p.x,z-p.z)<p.span+.5))continue;site={x,z,h};break outer;
    }
    if(!site)continue;const g=new THREE.Group();g.position.set(site.x,site.h+.015,site.z);g.scale.setScalar(.5);group.add(g);courts.push(g);
    const color=['#ae6452','#497e77','#ab824b','#698fab'][index%4];
    const decor=new THREE.Group();g.add(decor);
    box(decor,['#c9d0c2','#c5bbaa','#b1c2b8','#b5c6c6'][index%4],0,0,0,.66,.012,.60);
    for(let k=-5;k<=5;k++)box(decor,'#9eaaa2',k*.06,.013,0,.001,.001,.58);
    const market=[4,9].includes(index),tea=[8,11].includes(index),workshop=[2,5].includes(index);
    dishes.forEach((dish,i)=>{
      const x=(i-1)*.205,z=market?-.13:tea?-.24:-.20,h=market?.10:tea?.20:.16;
      box(decor,tea?'#d9d1bb':'#e4e9df',x,.012,z,.18,h,.14);
      box(decor,color,x,h+.015,z,.195,.012,market?.13:.17);
      box(decor,'#477784',x,.045,z+.071,.125,.054,.002);sign(decor,dish,x,h-.018,z+.081,.18,.032,color);
      if(!tea)box(decor,color,x,.122,-.07,.19,.008,.066);
      box(decor,market?'#8fa6ad':'#b09166',x,.012,-.04,.14,.055,.07);
      buildDish(decor,dish,{x,y:.068,z:-.04,scale:.85});
      if(workshop)for(let n=0;n<3;n++)disc(decor,'#ba9663',x+.058,.07+n*.016,-.04,.02,.015);
      if(market)for(let n=0;n<2;n++)box(decor,n?'#5e969b':'#739ba8',x+(n-.5)*.075,.013,.035,.064,.019,.045);
      if(index===3||index===6){disc(decor,'#303c41',x,.072,-.04,.048,.006);buildDish(decor,dish,{x,y:.080,z:-.04,scale:.8});}
      const cook=person(g,i+index,{scale:.027});cook.root.position.set(x,.017,-.13);actors.push({actor:cook,mode:'wave'});
    });
    for(const [i,x] of [-.19,0,.19].entries()){
      const tableZ=.13+(tea?Math.abs(i-1)*.055:0);
      if(index===7)disc(decor,'#b6966c',x,.068,tableZ,.079,.009);
      else box(decor,tea?'#6f5140':'#ae8e64',x,.068,tableZ,.145,.009,market?.10:.13);
      box(decor,'#617673',x,.014,tableZ,.013,.055,.013);buildDish(decor,dishes[i],{x,y:.078,z:tableZ,scale:1.25});
      for(const z of [.025,.245])box(decor,'#487580',x,.013,z,.052,.045,.040);
      const cup=disc(decor,'#edf2e5',x+.058,.078,tableZ,.008,.013);cup.name='tea-cup';
      for(const side of [-1,1]){const p=person(g,index+side+2,{scale:.025});p.root.position.set(x,.018,.11+side*.095);p.root.rotation.y=side<0?0:Math.PI;actors.push({actor:p,mode:'sit'});}
    }
    for(let i=0;i<(mobile?3:6);i++){const p=person(g,i+index,{scale:.026});actors.push({actor:p,mode:'walk',slot:i});p.root.userData.court=index;}
    tree(decor,-.30,.012,.25,.16,index%2?'umbrella':'palm');tree(decor,.30,.012,.25,.16,'flowering');
    if(tea){for(const x of [-.27,.27])box(decor,'#755b42',x,.013,-.16,.013,.22,.014);for(let k=-4;k<=4;k++)box(decor,'#947454',k*.061,.23,-.16,.013,.012,.26);}
    if(index===7){for(let j=0;j<5;j++){const hanging=buildDish(decor,'卤狮头鹅',{x:(j-2)*.033,y:.12,z:-.113,scale:.35});hanging.rotation.x=Math.PI/2;}}
    sign(decor,region+' · '+cuisineLayouts[index],0,.28,-.23,.58,.045,color);
    batchStatic(decor);
    entries.push({id:'food-'+index,name:region+' · '+dishes[0],en:'Local Flavours',kind:'food',x:site.x,z:site.z,ll:[data.meta.origin[0]+site.x/data.meta.sx,data.meta.origin[1]-site.z/data.meta.sz],zoom:310,span:.26,top:.12,pin:true,major:false,description:cuisineLayouts[index]+' · '+dishes.join(' · ')+'。艺术化风味场景，不代表真实店铺地址。',region,dishes,layout:cuisineLayouts[index]});
  }
  function update(seconds){for(const p of actors){p.actor.pose(seconds,p.mode);if(p.mode==='walk'){const t=seconds*.12+p.slot,root=p.actor.root;root.position.set(Math.sin(t)*.25,.015,.26+Math.cos(t)*.027);root.rotation.y=Math.atan2(Math.cos(t),-Math.sin(t)*.1);}}}
  update(0);return {group,places:entries,update,stats:{courts:courts.length,people:actors.length,regions:entries.map(p=>p.region),dishes:entries.map(p=>p.dishes),layouts:entries.map(p=>p.layout)},snapshot:()=>actors.map(p=>p.actor.root.position.toArray())};
}
