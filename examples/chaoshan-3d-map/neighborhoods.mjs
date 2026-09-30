import * as THREE from 'three';
import {treeGeometry,treeTypes,personGeometry} from './street-life.mjs';

// The shops are illustrative scene content, not verified branch locations.
export const neighborhoodThemes=[
  {title:'骑楼食街',shops:['潮汕牛肉火锅','喜茶 HEYTEA','屈臣氏 Watsons'],activity:'dining',color:'#b75e4c'},
  {title:'古城茶巷',shops:['工夫茶馆','潮州手拉壶','星巴克 Starbucks'],activity:'tea',color:'#526f67'},
  {title:'社区生活街',shops:['社区超市','公安局（示意）','面包与咖啡'],activity:'community',color:'#537a91'},
  {title:'服饰与夜市',shops:['服饰集合店','瑞幸咖啡 luckin','普宁豆干'],activity:'market',color:'#aa6581'},
  {title:'海岛渔市',shops:['海鲜餐厅','蜜雪冰城','渔具小铺'],activity:'market',color:'#389c9b'},
  {title:'英歌文化广场',shops:['英歌文创','潮汕粿品','便民超市'],activity:'dance',color:'#ad5550'},
  {title:'运动街区',shops:['运动用品','肯德基 KFC','社区超市'],activity:'football',color:'#688455'},
  {title:'玩具创意街',shops:['玩具工坊','麦当劳 McDonald\'s','奶茶小铺'],activity:'play',color:'#b4994e'},
  {title:'陶瓷与茶',shops:['陶瓷工坊','工夫茶室','花店'],activity:'tea',color:'#788bc0'},
  {title:'滨水餐饮街',shops:['海鲜大排档','茶百道','生鲜超市'],activity:'dining',color:'#478d7e'},
  {title:'滨海运动公园',shops:['体育用品','咖啡小站','公安服务站'],activity:'football',color:'#547d99'},
  {title:'山间休闲市集',shops:['山茶铺','农产品超市','客家餐厅'],activity:'market',color:'#7c8b5b'}
];
const materials=new Map();
function material(color){if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.85}));return materials.get(color);}
function box(group,color,x,y,z,w,h,d){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(color));mesh.position.set(x,y+h/2,z);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;}
function sign(text,color){
  if(typeof document==='undefined')return null;
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,768,128);ctx.fillStyle='#ffffff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 48px "Microsoft YaHei",sans-serif';
  while(ctx.measureText(text).width>720){const size=parseInt(ctx.font.match(/\d+px/)[0])-2;ctx.font=`600 ${size}px "Microsoft YaHei",sans-serif`;}
  ctx.fillText(text,384,66);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(.104,.022),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
}
export function buildNeighborhood({parent,center,index,heightAt}){
  const theme=neighborhoodThemes[index%neighborhoodThemes.length],group=new THREE.Group();group.name='neighborhood-'+index;group.position.copy(center);parent.add(group);
  const ground=(x,z)=>heightAt(center.x+x,center.z+z)-center.y;
  const field=theme.activity==='football';
  // Buildings occupy a rear frontage; the foreground remains a pedestrian plaza.
  theme.shops.forEach((name,i)=>{
    const x=(i-1)*.118,z=-.137,y=ground(x,z),police=name.includes('公安');
    box(group,'#e5e8e4',x,y,z,.108,.076+(i%2)*.025,.064);
    box(group,police?'#345a86':theme.color,x,y+.065,z,.113,.018,.070);
    box(group,'#9cc0c9',x,y+.014,z+.0325,.075,.035,.001);
    box(group,'#3e5059',x+.029,y,z+.034,.017,.040,.002);
    for(const sx of [-1,1])box(group,'#a5c2c5',x+sx*.025,y+.088,z+.0325,.019,.014,.001);
    const label=sign(name,police?'#345a86':theme.color);if(label){label.position.set(x,y+.075,z+.037);group.add(label);}
    if(!police){box(group,theme.color,x,y+.050,z+.046,.100,.004,.028);for(let s=-4;s<=4;s+=2)box(group,'#f2f3e9',x+s*.010,y+.052,z+.046,.009,.001,.028);}
  });
  if(!field){
    const pavement=new THREE.PlaneGeometry(.36,.36,8,8);pavement.rotateX(-Math.PI/2);const v=pavement.attributes.position;for(let i=0;i<v.count;i++)v.setY(i,ground(v.getX(i),v.getZ(i))+.004);pavement.computeVertexNormals();group.add(new THREE.Mesh(pavement,material('#c4cdcc')));
    for(let j=-3;j<=3;j++)box(group,'#dce1dc',0,.006,j*.044,.34,.0008,.0015);
    if(['tea','dining'].includes(theme.activity))for(const x of [-.09,.08]){
      box(group,'#725b47',x,.008,.04,.006,.021,.006);box(group,'#d8b58a',x,.029,.04,.046,.005,.040);
      for(const z of [.005,.075])box(group,'#52757a',x,.006,z,.028,.015,.019);
      const shade=new THREE.Mesh(new THREE.ConeGeometry(.049,.015,8),material(theme.color));shade.position.set(x,.092,.04);group.add(shade);box(group,'#525c5b',x,.008,.04,.002,.084,.002);
    }
    if(theme.activity==='market')for(let i=0;i<3;i++){
      const x=(i-1)*.098;box(group,'#b68b5a',x,.008,.045,.062,.023,.036);box(group,theme.color,x,.065,.045,.070,.006,.045);
      for(const side of [-1,1])box(group,'#647368',x+side*.027,.009,.045,.003,.056,.003);
      for(let j=0;j<5;j++){const fruit=new THREE.Mesh(new THREE.IcosahedronGeometry(.006,0),material(j%2?'#e3b94f':'#7baf61'));fruit.position.set(x+(j-2)*.009,.035,.045);group.add(fruit);}
    }
    if(theme.activity==='play'){
      box(group,'#e0be58',-.085,.005,.025,.095,.008,.08);
      for(let i=0;i<5;i++)box(group,['#c46a57','#5398a9','#c8b856'][i%3],-.11+i*.016,.015+i%2*.02,.025,.016,.016,.016);
      box(group,'#598983',.080,.007,.05,.004,.055,.004);box(group,'#598983',.13,.007,.05,.004,.055,.004);box(group,'#d69756',.105,.062,.05,.055,.005,.004);
    }
    if(['dance','community'].includes(theme.activity)){
      const stage=new THREE.Mesh(new THREE.CylinderGeometry(.058,.058,.008,24),material(theme.color));stage.position.set(0,.010,.02);group.add(stage);
    }
  }
  for(const side of [-1,1]){
    const x=side*.166,z=.14,y=ground(x,z);box(group,'#899b8e',x,y,z,.025,.014,.025);
    const tree=new THREE.Mesh(treeGeometry(treeTypes[index%6]),new THREE.MeshStandardMaterial({vertexColors:true}));tree.scale.setScalar(.042);tree.position.set(x,y+.014,z);group.add(tree);
    box(group,'#765f4d',side*.113,ground(side*.113,.155)+.006,.155,.053,.012,.014);
  }
  const police=new THREE.Group();police.position.set(.154,ground(.154,-.062)+.006,-.062);police.scale.setScalar(.012);
  const uniform=personGeometry('overalls',0).clone();uniform.deleteAttribute('color');police.add(new THREE.Mesh(uniform,material('#254d72')));
  box(police,'#e7edf0',0,2.28,0,.70,.12,.57);for(const side of [-1,1])box(police,'#243646',side*.2,0,0,.19,.82,.24);
  const arm=box(police,'#e7edf0',.50,1.40,0,.16,.65,.16);arm.rotation.z=-1.1;group.add(police);
  return {group,theme,field,update:seconds=>{arm.rotation.z=-1.1+Math.sin(seconds*1.8)*.16;}};
}
