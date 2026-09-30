import * as THREE from 'three';
import {serviceBuilding} from './service-buildings.mjs';
import {services,addServiceSigns} from './neighborhood-services.mjs';
import {smallParkCornerLots,smallParkPocketGardens,smallParkMarketLots} from './small-park-layout.mjs';
import {person} from './scene-miniatures.mjs';
import {batchStatic} from './static-batch.mjs';

// Geographic anchors; the models are enlarged editorial miniatures, not surveyed meshes.
export const landmarkPlaces = [
  {id:'guangji',name:'广济桥',en:'Guangji Bridge',area:'潮州',ll:[116.6505,23.6632],kind:'landmark',halfHeight:.37,span:1.1,top:.10,scale:.0015,rotation:-.20,description:'亭阁列于韩江之上，十八梭船连接两岸。',detail:'把石梁、桥亭和可启闭的浮桥放在同一条线上。红灯笼与青灰屋面，是这座桥最鲜明的记忆。',tags:['韩江','亭阁','十八梭船'],source:'https://www.qb.gd.gov.cn/jrqx/content/post_1250040.html',coordinateSource:'https://en.wikipedia.org/wiki/Guangji_Bridge_(Chaozhou)'},
  {id:'small-park',name:'小公园',en:'Shantou Small Park',area:'汕头',ll:[116.66945,23.35785],kind:'landmark',halfHeight:1.02,span:2.25,top:.42,scale:.012,rotation:0,description:'一座纪念亭，向外展开的骑楼街巷。',detail:'中山纪念亭是街区的中心。放射状街道、连续骑楼与窗廊，共同留下汕头开埠街区的轮廓。',tags:['中山纪念亭','骑楼','开埠记忆'],source:'https://www.gdfao.gov.cn/zwgk/zdly/sts/content/post_1333373.html',coordinateSource:'https://www.openstreetmap.org/way/532956287'},
  {id:'jieyang-tower',name:'揭阳楼',en:'Jieyang Tower',area:'揭阳',ll:[116.3869,23.56772],kind:'landmark',halfHeight:.78,span:1.85,top:.66,scale:.012,rotation:.08,description:'城台托起重檐，青瓦与朱柱层层展开。',detail:'以汉式建筑语言构成的城市地标。模型提炼宽阔城台、层叠屋檐与中轴台阶，不替代实测建筑档案。',tags:['汉式城楼','重檐','城市地标'],source:'https://www.jieyang.com/揭阳楼.品牌.网络.html',coordinateSource:'https://www.openstreetmap.org/way/904362690'},
  {id:'lighthouse',name:'长山尾灯塔',en:'Changshanwei Lighthouse',area:'南澳',ll:[116.94145,23.4343],kind:'landmark',halfHeight:.60,span:1.45,top:.56,scale:.020,rotation:0,description:'红塔、黑顶，在入岛海岸守望。',detail:'长山尾码头旁的红色航标，是南澳西端醒目的海岸记忆。夜景中加入缓慢旋转的示意灯光。',tags:['南澳岛','红色航标','海岸'],source:'https://www.amap.com/place/B0IGJURID3',coordinateSource:'Approximate WGS84 anchor from GCJ-02 map point; not navigation-grade'}
].map(p=>({...p,major:true,pin:true}));

const mesh = (g,geo,mat,x=0,y=0,z=0) => {
  const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;
};
const box=(g,m,x,y,z,w,h,d)=>mesh(g,new THREE.BoxGeometry(w,h,d),m,x,y+h/2,z);
const cyl=(g,m,x,y,z,rt,rb,h,n=16)=>mesh(g,new THREE.CylinderGeometry(rt,rb,h,n),m,x,y+h/2,z);
function beam(g,m,a,b,r=.25){
  const v=new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
  const item=mesh(g,new THREE.CylinderGeometry(r,r,v.length(),8),m,...a);
  item.position.addScaledVector(v,.5);item.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return item;
}
function roof(g,m,w,d,y,h){
  // Curved eaves: nested rectangular contours taper into a long ridge.
  const rings=[[1,1,0],[.84,.8,-.28],[.50,.45,.35],[.35,.015,1]],v=[],idx=[];
  for(const [sx,sz,sy] of rings) for(const [x,z] of [[-1,-1],[1,-1],[1,1],[-1,1]])v.push(x*w*sx/2,y+sy*h,z*d*sz/2);
  for(let j=0;j<3;j++)for(let k=0;k<4;k++){const a=j*4+k,b=j*4+(k+1)%4,c=a+4,e=b+4;idx.push(a,c,b,b,c,e);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geo.setIndex(idx);geo.computeVertexNormals();
  mesh(g,geo,m);
  beam(g,m,[-w*.175,y+h,-.02],[w*.175,y+h,-.02],.36);
  for(let s of [-1,1])for(let k=-5;k<=5;k++){
    const x=k*w/14;
    const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(x*.5,y+h*.65,0),new THREE.Vector3(x*.85,y-h*.10,s*d*.32),new THREE.Vector3(x,y+.08,s*d*.5)]);
    mesh(g,new THREE.TubeGeometry(curve,5,.09,4,false),m);
  }
}
function polygonRoof(g,m,r,y,h,n=8){
  const pts=[],idx=[];
  for(const [rr,yy] of [[r,y],[r*.76,y-.32],[r*.42,y+h*.45],[.1,y+h]])for(let i=0;i<n;i++){const a=i/n*Math.PI*2;pts.push(Math.cos(a)*rr,yy,Math.sin(a)*rr);}
  for(let j=0;j<3;j++)for(let i=0;i<n;i++){const a=j*n+i,b=j*n+(i+1)%n;idx.push(a,a+n,b,b,a+n,b+n);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));geo.setIndex(idx);geo.computeVertexNormals();mesh(g,geo,m);
}
function rail(g,m,x1,z1,x2,z2,y){
  const len=Math.hypot(x2-x1,z2-z1),n=Math.ceil(len/4);
  for(let i=0;i<=n;i++){const t=i/n;cyl(g,m,x1+(x2-x1)*t,y,z1+(z2-z1)*t,.22,.24,2.6,6);}
  beam(g,m,[x1,y+2.2,z1],[x2,y+2.2,z2],.17);
}
function lantern(g,p,x,y,z){
  beam(g,p.brass,[x,y,z],[x,y-1.6,z],.09);
  const l=mesh(g,new THREE.SphereGeometry(.72,8,6),p.lantern,x,y-2.2,z);l.scale.y=1.25;
  cyl(g,p.brass,x,y-3.4,z,.10,.1,.55,6);
}
function pavilion(g,p,w=15,d=12,y=0,double=false){
  box(g,p.stone,0,y,0,w+3,1.2,d+3);
  for(const x of [-w*.38,w*.38])for(const z of [-d*.34,d*.34])cyl(g,p.red,x,y+1.2,z,.42,.52,8,10);
  box(g,p.red,0,y+7.7,0,w,.8,d);
  roof(g,p.roof,w+5,d+5,y+10,3.6);
  if(double){box(g,p.plaster,0,y+12,0,w*.50,3.8,d*.45);roof(g,p.roof,w*.85,d*.83,y+16,2.8);}
  lantern(g,p,-w*.28,y+8,d*.39);lantern(g,p,w*.28,y+8,d*.39);
}
function broadleaf(g,p,x,z,s=1){
  const y=0;cyl(g,p.wood,x,y,z,.5*s,.8*s,7*s,8);
  for(const [dx,dy,dz,r] of [[0,9,0,4],[-2.8,8,0,3],[2.3,8,1,3],[0,8,-2,3]]){const a=mesh(g,new THREE.IcosahedronGeometry(r*s,1),p.leaf,x+dx*s,dy*s,z+dz*s);a.scale.y=.72;}
}
function palm(g,p,x,z,s=1){
  beam(g,p.wood,[x,0,z],[x+1.2*s,9*s,z],.4*s);
  for(let i=0;i<7;i++){const a=i*Math.PI*2/7;const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(x+s,9*s,z),new THREE.Vector3(x+Math.cos(a)*3*s,11*s,z+Math.sin(a)*3*s),new THREE.Vector3(x+Math.cos(a)*6*s,8*s,z+Math.sin(a)*6*s)]);mesh(g,new THREE.TubeGeometry(curve,6,.36*s,4,false),p.leaf);}
}
function bridge(g,p){
  const pontoons=new THREE.Group();g.add(pontoons);
  for(const sign of [-1,1]){
    box(g,p.stone,sign*165,6,0,190,2,14);
    for(let i=0;i<12;i++){const x=sign*(78+i*15.5);cyl(g,p.stone,x,-6,0,3.4,4.8,12,6);}
    rail(g,p.stone,sign*72,-7,sign*258,-7,8);rail(g,p.stone,sign*72,7,sign*258,7,8);
    for(let i=0;i<6;i++){const pg=new THREE.Group();pg.position.x=sign*(88+i*31);pavilion(pg,p,17,12,8,i===1||i===4);g.add(pg);}
  }
  for(let i=0;i<18;i++){
    const x=-67+i*7.85,boat=new THREE.Group();boat.position.set(x,0,0);
    const hull=cyl(boat,p.wood,0,-1,0,3.1,1.8,2.4,6);hull.scale.z=2.8;
    box(boat,p.wood,0,1.1,0,6.4,1,18);box(boat,p.brass,0,2.1,0,7.8,.6,8);
    pontoons.add(boat);
  }
  return {pontoons};
}
function arcade(g,p,w=14,h=19,d=10){
  box(g,p.plaster,0,5,0,w,h-5,d);
  box(g,p.stone,0,0,0,w+1,.5,d+2);
  for(let i=-1;i<=1;i++){
    const x=i*w/3;
    box(g,p.stone,x,0,d/2,1,5,1.2);
    const curve=new THREE.EllipseCurve(x,4.7,w/6-.5,1.8,0,Math.PI,false,0);
    const pts=curve.getPoints(12).map(v=>new THREE.Vector3(v.x,v.y,d/2+.4));
    mesh(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),12,.35,5,false),p.stone);
    for(const y of [8,13]){box(g,p.glass,x,y,d/2+.08,2.2,3,.15);box(g,p.stone,x,y-.4,d/2+.3,3,.4,.7);}
  }
  for(const y of [5.4,h-1,h])box(g,p.stone,0,y,.4,w+1,.5,d+.8);
  box(g,p.roof,0,h+.5,0,w+1,.55,d+1);
  box(g,p.red,0,5.8,d/2+.4,w*.60,1.3,.3);
  for(const side of [-1,1])for(const z of [-d*.28,d*.12])for(const y of [8,13]){
    box(g,p.glass,side*(w/2+.08),y,z,.15,2.8,1.7);
    box(g,p.stone,side*(w/2+.18),y-.35,z,.5,.3,2.4);
    for(const dz of [-.88,.88])box(g,p.stone,side*(w/2+.20),y,z+dz,.3,2.9,.14);
  }
  box(g,p.wood,0,.4,d/2-.25,2.1,3.8,.35);
  box(g,p.brass,.65,2.2,d/2,.15,.4,.2);
  for(let i=-1;i<=1;i++){box(g,p.glass,i*w/3,8,d/2+.23,.13,3,.12);box(g,p.glass,i*w/3,13,d/2+.23,.13,3,.12);}
}
function smallPark(g,p){
  const cornerPeople=[];
  const paving=p.path.clone();paving.color.set('#a3aea3');
  box(g,paving,0,-1.0,0,180,.4,180);
  // Broad paving bands keep the plaza readable without a second miniature grid.
  for(let i=-4;i<=4;i++){box(g,p.stone,i*18,-.59,0,.16,.025,180);box(g,p.stone,0,-.59,i*18,180,.025,.16);}
  cyl(g,p.stone,0,-.7,0,22,23,1,48);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;const st=new THREE.Group();st.rotation.y=a;box(st,p.stone,0,-.1,44,8,.15,63);for(const x of [-4.3,4.3])box(st,p.plaster,x,.03,44,.35,.25,63);g.add(st);}
  cyl(g,p.stone,0,0,0,9,10,1,8);cyl(g,p.plaster,0,1,0,7.8,8.8,1,8);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;cyl(g,p.red,Math.cos(a)*6.1,2,Math.sin(a)*6.1,.35,.42,8,8);}
  polygonRoof(g,p.roof,10.4,11.5,3.8);cyl(g,p.red,0,14,0,4.2,4.2,2.7,8);polygonRoof(g,p.roof,6.9,17.2,3.1);cyl(g,p.brass,0,20,0,.12,.45,2,8);
  for(let i=0;i<8;i++)lantern(g,p,Math.cos(i*Math.PI/4)*6.4,9.4,Math.sin(i*Math.PI/4)*6.4);
  for(let i=0;i<7;i++){
    const a=(i+.5)*Math.PI/4;
    for(let j=0;j<3;j++){const b=new THREE.Group();b.position.set(Math.sin(a)*(35+j*11),0,Math.cos(a)*(35+j*11));b.rotation.y=a+Math.PI;arcade(b,{...p,plaster:[p.plaster,p.sage,p.peach][(i+j)%3]},12,17+(i%3)*2,10);g.add(b);}
  }
  const gardens=new THREE.Group();g.add(gardens);
  const soil=new THREE.MeshStandardMaterial({color:'#64845b',roughness:1});
  for(const [index,lot] of smallParkPocketGardens.entries()){
    const bed=new THREE.Group();bed.position.set(lot.x,0,lot.z);bed.rotation.y=lot.angle;gardens.add(bed);
    const island=cyl(bed,soil,0,-.54,0,1,1,.2,24);island.scale.set(lot.width/2,1,lot.length/2);
    for(const z of [-5,5])broadleaf(bed,p,0,z,.30+(index%3)*.035);
    for(let k=-2;k<=2;k++){
      const shrub=mesh(bed,new THREE.IcosahedronGeometry(.65,1),p.leaf,Math.sin(k+index)*.7,.15,k*1.3);shrub.scale.y=.55;
      if(index%3===0)cyl(bed,p.peach,.55,.25,k*1.3,.24,.24,.22,7);
    }
    if(index%2===0){box(bed,p.wood,0,.25,9.2,3,.35,1.1);box(bed,p.wood,0,.6,9.6,3,.9,.15);}
  }
  batchStatic(gardens);
  for(let i=0;i<5;i++)broadleaf(g,p,Math.cos(i*1.25)*22,Math.sin(i*1.25)*22,.7);
  for(let i=0;i<8;i++){
    const a=(i+.5)*Math.PI/4,seat=new THREE.Group();seat.position.set(Math.sin(a)*25,0,Math.cos(a)*25);seat.rotation.y=a;g.add(seat);
    box(seat,p.wood,0,1,0,4.8,.35,1.4);box(seat,p.wood,0,1.35,-.55,4.8,1.1,.22);
    for(const x of [-1.7,1.7])box(seat,p.roof,x,0,0,.22,1,.8);
    cyl(seat,p.roof,3.7,0,0,.15,.2,5,8);cyl(seat,p.lantern,3.7,4.8,0,.5,.5,.8,8);
    box(seat,p.sage,-3.8,0,0,1,1.6,1);box(seat,p.roof,-3.8,1.65,0,1.1,.2,1.1);
  }
  const shopMaterials=new Map();
  const shopMaterial=color=>{if(!shopMaterials.has(color))shopMaterials.set(color,new THREE.MeshStandardMaterial({color,roughness:.9}));return shopMaterials.get(color);};
  const market=new THREE.Group();market.name='small-park-market-frontage';g.add(market);
  for(const [index,lot] of smallParkMarketLots.entries()){
    const shop=new THREE.Group();shop.position.set(lot.x,-.5,lot.z);shop.rotation.y=lot.angle;market.add(shop);
    const service=services.find(s=>s[0]===lot.service),program=serviceBuilding(service,{size:lot.size,height:10,variant:index+1,low:true});
    const shapes={box:new THREE.BoxGeometry(1,1,1),sphere:new THREE.SphereGeometry(.5,8,6),cylinder:new THREE.CylinderGeometry(.5,.5,1,10)};
    for(const r of program.parts){const m=mesh(shop,shapes[r.shape],shopMaterial(r.color),r.x,r.y,r.z);m.scale.set(r.w,r.h,r.d);m.rotation.y=r.turn;}
    addServiceSigns(shop,[{...program.sign,angle:0,service}]);
    const [a,b]=[lot.start,lot.end],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const walk=box(market,shopMaterial('#849b88'),(a[0]+b[0])/2,-.5,(a[1]+b[1])/2,2.2,.5,length+.2);walk.rotation.y=lot.angle;
    const visitor=person(shop,index+31,{scale:1.05,outfit:index===0?'senior':index===1?'shopkeeper':'chef'});visitor.root.position.set(0,.5,lot.size*.59+1.2);visitor.root.rotation.y=Math.PI;visitor.root.userData.marketVendor=true;cornerPeople.push(visitor);visitor.root.removeFromParent();batchStatic(shop);shop.add(visitor.root);
  }
  for(const [index,lot] of smallParkCornerLots.entries()){
    const court=new THREE.Group();court.position.set(lot.x,0,lot.z);court.rotation.y=lot.angle;g.add(court);
    box(court,p.stone,0,-.1,18.5,3.2,.15,23);
    const service=services.find(s=>s[0]===lot.service),program=serviceBuilding(service,{size:10,height:14,variant:index,low:true});
    const shapes={box:new THREE.BoxGeometry(1,1,1),sphere:new THREE.SphereGeometry(.5,8,6),cylinder:new THREE.CylinderGeometry(.5,.5,1,10)};
    for(const r of program.parts){const m=mesh(court,shapes[r.shape],shopMaterial(r.color),r.x,r.y,r.z-4);m.scale.set(r.w,r.h,r.d);}
    const s=program.sign;addServiceSigns(court,[{...s,z:s.z-4,angle:0,service}]);
    for(const x of [-8,8]){broadleaf(court,p,x,-6,.55);for(let k=0;k<3;k++){const shrub=mesh(court,new THREE.IcosahedronGeometry(1.3,1),p.leaf,x+(k-1)*1.8,.7,-10);shrub.scale.y=.55;}}
    for(const x of [-5,5]){
      cyl(court,p.wood,x,.2,5,1.6,1.6,.65,12);cyl(court,p.plaster,x,1,5,.32,.32,.5,8);
      for(const z of [2.7,7.3])box(court,p.sage,x,.15,z,1.7,.7,1.5);
      const visitor=person(court,index*2+(x>0?1:0),{scale:1.2});visitor.root.position.set(x,.7,7.3);visitor.root.rotation.y=Math.PI;visitor.pose(0,'sit');cornerPeople.push(visitor);
    }
    const visitor=person(court,index+19,{scale:1.2});visitor.root.position.set(0,0,7);visitor.root.rotation.y=Math.PI;cornerPeople.push(visitor);
    const residents=cornerPeople.slice(-3);residents.forEach(a=>a.root.removeFromParent());batchStatic(court);residents.forEach(a=>court.add(a.root));
  }
  return {cornerPeople};
}
function tower(g,p){
  box(g,p.path,0,-1,0,115,1,75);
  for(let i=0;i<9;i++)box(g,p.stone,0,i*.7,26-i*1.8,38,.7,4);
  box(g,p.stone,-27,0,0,20,10,26);box(g,p.stone,27,0,0,20,10,26);box(g,p.stone,0,7,0,36,3,26);
  for(let i=-7;i<=7;i++)box(g,p.stone,i*5,10,13,2.7,1.8,1.7);
  for(let i=0;i<3;i++){
    const w=59-i*11,d=27-i*4,y=12+i*11;
    box(g,p.red,0,y,0,w*.84,5.4,d*.72);
    for(let x=-w*.38;x<=w*.4;x+=w/8){box(g,p.glass,x,y+1,d*.365,2.6,3.3,.1);cyl(g,p.red,x,y,d*.45,.38,.5,6,8);}
    roof(g,p.roof,w+9,d+8,y+6,4.4);rail(g,p.brass,-w*.5,d*.5,w*.5,d*.5,y);
  }
  for(let x of [-48,48])for(let z of [-25,-10,5,20])broadleaf(g,p,x,z,.8);
  cyl(g,p.brass,0,0,32,3.6,3.6,1.2,24);
}
function lighthouse(g,p){
  cyl(g,p.stone,0,-1,0,10,12,1.5,24);
  box(g,p.path,0,-.8,18,9,.8,30);
  for(let i=0;i<15;i++){const a=i*2.4;const r=11+(i%3)*2;const rock=mesh(g,new THREE.IcosahedronGeometry(1.6+(i%3)*.4,0),p.stone,Math.cos(a)*r,-1,Math.sin(a)*r);rock.scale.y=.65;}
  cyl(g,p.red,0,.4,0,3.1,4.8,17,32);cyl(g,p.red,0,17.4,0,4.7,4.7,.8,32);
  cyl(g,p.glass,0,18.2,0,2.9,2.9,3.5,16);
  for(let i=0;i<12;i++){const a=i*Math.PI/6;cyl(g,p.roof,Math.cos(a)*4.3,18.2,Math.sin(a)*4.3,.10,.1,1.8,6);}
  const ring=mesh(g,new THREE.TorusGeometry(4.3,.12,5,32),p.roof,0,20,0);ring.rotation.x=Math.PI/2;
  cyl(g,p.roof,0,21.7,0,.2,4,2.4,24);cyl(g,p.roof,0,24,0,.08,.1,2,8);
  box(g,p.roof,0,.6,4.2,1.8,3.1,.2);box(g,p.glass,0,9,3.85,.8,1.5,.12);
  const rotor=new THREE.Group();rotor.position.y=20;g.add(rotor);
  const lightMat=new THREE.MeshBasicMaterial({color:'#ffe6aa',transparent:true,opacity:.10,depthWrite:false,side:THREE.DoubleSide});
  const glow=mesh(rotor,new THREE.ConeGeometry(6,40,24,1,true),lightMat,20,0,0);glow.rotation.z=Math.PI/2;
  const bulb=mesh(g,new THREE.SphereGeometry(1.1,12,8),p.lantern,0,20,0);
  for(let i=0;i<4;i++)palm(g,p,[-16,17,-18,20][i],20+i*5,.65);
  return {rotor,bulb};
}

export function buildLocalLandmarks({parent,heightAt,waterAt,toWorld}){
  const palette={};
  for(const [name,color] of Object.entries({stone:'#b9b5a7',plaster:'#f1e8d4',red:'#b63f34',roof:'#334d51',wood:'#795c43',brass:'#c59f54',leaf:'#477c62',sage:'#bdccba',peach:'#e1bfa1',path:'#d8d1bd',glass:'#507779',lantern:'#ffc270'}))palette[name]=new THREE.MeshStandardMaterial({color,roughness:.76,side:name==='roof'?THREE.DoubleSide:THREE.FrontSide});
  palette.lantern.emissive.set('#ffa441');
  const models=[];
  for(const spec of landmarkPlaces){
    const group=new THREE.Group(),[x,z]=toWorld(...spec.ll);
    group.name=spec.id;group.userData.landmarkId=spec.id;group.position.set(x,Math.max(heightAt(x,z),waterAt(x,z)??0)+.035,z);group.scale.setScalar(spec.scale);group.rotation.y=spec.rotation;
    let extras={};if(spec.id==='guangji')extras=bridge(group,palette);else if(spec.id==='small-park')extras=smallPark(group,palette);else if(spec.id==='jieyang-tower')tower(group,palette);else extras=lighthouse(group,palette);
    // Keep the articulated pieces live; batch the unchanged masonry, roofs and planting.
    for(const node of [extras.rotor,extras.pontoons,extras.bulb,...(extras.cornerPeople||[]).map(a=>a.root)].filter(Boolean))node.userData.preserveAnimation=true;
    batchStatic(group);
    group.traverse(o=>{if(o.isMesh)o.userData.landmarkId=spec.id;});parent.add(group);models.push({spec,group,...extras});
  }
  return {
    models,
    setLight(night,dusk){palette.lantern.emissiveIntensity=.12+.68*dusk+1.7*night;palette.glass.emissive.set('#e8b366').multiplyScalar(night);palette.glass.emissiveIntensity=.55;for(const m of models)if(m.rotor){m.rotor.visible=night>.02;m.rotor.traverse(o=>{if(o.material&&o.material.transparent)o.material.opacity=.2*night;});}},
    setTime(mode){palette.lantern.emissiveIntensity=mode==='night'?2.5:mode==='sunset'?.8:.12;palette.glass.emissive.set(mode==='night'?'#e8b366':'#000000');palette.glass.emissiveIntensity=.55;for(const m of models)if(m.rotor)m.rotor.visible=mode==='night';},
    update(now,reduced){if(reduced)return;for(const m of models){if(m.rotor)m.rotor.rotation.y=now*.00023;if(m.pontoons)m.pontoons.position.y=Math.sin(now*.001)*.10;m.cornerPeople?.forEach((a,i)=>{const seated=!a.root.userData.marketVendor&&i%3<2;a.pose(now*.001,seated?'sit':Math.sin(now*.0003+i)>.8?'wave':'talk');if(seated)a.gesture(now*.001,'talk');});}},
  };
}
