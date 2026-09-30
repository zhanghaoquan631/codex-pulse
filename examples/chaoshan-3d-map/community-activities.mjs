import * as THREE from 'three';
import {box,disc,sign,tree,material} from './scene-miniatures.mjs';
import {buildDish} from './food-models.mjs';
import {batchStatic} from './static-batch.mjs';
import {streetClearance} from './street-clearance.mjs';
import {landClearance} from './regional-life.mjs';

export const communityPrograms=['basketball','badminton','table-tennis','football','swimming','tea','basketball','table-tennis','tea','badminton','swimming','football'];
export const programNames={basketball:'篮球场',badminton:'羽毛球场','table-tennis':'乒乓球场',football:'足球场',swimming:'游泳池',tea:'街坊茶庭'};
const sphere=new THREE.SphereGeometry(1,12,8);
function ball(g,color,r){const m=new THREE.Mesh(sphere,material(color));m.scale.setScalar(r);g.add(m);return m;}
function athlete(g,index){
  const root=new THREE.Group();g.add(root);const colors=['#ed8064','#397eaa','#e9bb47','#367f6d','#9360a2'];
  box(root,colors[index%5],0,.024,0,.017,.024,.012);
  const head=ball(root,['#e3b99b','#b78463','#d5a37a'][index%3],.009);head.position.y=.059;
  const limbs=[];for(const [x,y,h] of [[-.005,.025,.022],[.005,.025,.022],[-.012,.046,.020],[.012,.046,.020]]){
    const joint=new THREE.Group();joint.position.set(x,y,0);root.add(joint);box(joint,limbs.length<2?'#35516b':'#d5a37a',0,-h,0,.005,h,.006);limbs.push(joint);
  }
  return {root,limbs};
}
function stripe(g,x,z,w,d){box(g,'#edf4e5',x,.004,z,w,.001,d);}
function net(g,x,z,w,h){
  for(const dx of [-w/2,w/2])box(g,'#e4eee6',x+dx,.005,z,.003,h,.003);
  for(let k=0;k<6;k++)box(g,'#e4eee6',x,.006+k*h/6,z,w,.001,.001);
  for(let k=0;k<=16;k++)box(g,'#e4eee6',x-w/2+k*w/16,.005,z,.0007,h,.0007);
}
function buildCourt(g,kind,index){
  const decor=new THREE.Group();g.add(decor);const actors=[],props=[];
  box(decor,kind==='swimming'?'#cad4ca':'#b2c6b8',0,-.008,0,.34,.008,.44);
  const add=(x,z,angle=0)=>{const a=athlete(g,index+actors.length);a.root.position.set(x,.006,z);a.root.rotation.y=angle;actors.push(a);return a;};
  if(kind==='swimming'){
    box(decor,'#1575a2',0,-.004,0,.25,.005,.36);box(decor,'#71cad4',0,.001,0,.236,.002,.35);
    for(let j=-1;j<=1;j++){stripe(decor,j*.072,0,.002,.33);for(let k=-8;k<=8;k++){const f=ball(decor,k%2?'#e8654d':'#f0e1a5',.0024);f.position.set((j+.5)*.072,.008,k*.018);}}
    for(const x of [-.072,0,.072]){box(decor,'#f3f3e9',x,.005,-.185,.036,.015,.028);add(x,-.10);}
    for(const z of [-.12,.02,.14]){box(decor,'#f0e4c5',.145,.01,z,.035,.014,.06);box(decor,'#5e8b88',.145,.024,z-.02,.035,.016,.017);}
    for(const x of [-.14,.14])for(const z of [-.16,.16])box(decor,'#90a39e',x,.0,z,.004,.025,.014);
  }else if(kind==='tea'){
    for(let i=0;i<3;i++){
      const z=(i-1)*.12;disc(decor,'#9a7150',0,.034,z,.059,.006);box(decor,'#5a665d',0,0,z,.018,.034,.018);buildDish(decor,'工夫茶',{y:.04,z,scale:.75});
      for(const side of [-1,1]){box(decor,'#466f69',side*.075,.004,z,.03,.021,.04);const a=add(side*.074,z,side<0?Math.PI/2:-Math.PI/2);a.root.position.y=.019;disc(a.limbs[3],'#f0e5cf',0,-.02,.003,.004,.005);}
    }
    for(const x of [-.15,.15])box(decor,'#78674e',x,0,-.16,.009,.12,.009);
    for(let k=-3;k<=3;k++)box(decor,'#a4875e',k*.05,.12,-.16,.009,.007,.10);
  }else{
    const color=kind==='basketball'?'#b87561':kind==='badminton'?'#448887':kind==='table-tennis'?'#b4bfae':'#689956';
    box(decor,color,0,0,0,.28,.003,.38);
    for(const x of [-.135,.135])stripe(decor,x,0,.002,.37);
    for(const z of [-.185,0,.185])stripe(decor,0,z,.27,.002);
    if(kind==='table-tennis'){
      for(const x of [-.075,.075]){
        box(decor,'#306da1',x,.027,0,.11,.005,.19);
        for(const dx of [-.05,.05])box(decor,'#2f514f',x+dx,0,0,.008,.027,.008);
        for(const dx of [-.051,.051])box(decor,'#f1f1e6',x+dx,.033,0,.001,.001,.18);
        box(decor,'#f1f1e6',x,.033,0,.001,.001,.18);
        const ng=new THREE.Group();ng.position.y=.033;decor.add(ng);net(ng,x,0,.113,.015);
        for(const side of [-1,1]){const a=add(x,side*.136,side<0?0:Math.PI);const paddle=ball(a.limbs[3],side<0?'#dc554b':'#303f47',.010);paddle.scale.set(.010,.010,.002);paddle.position.set(0,-.019,.008);}
        const b=ball(g,'#f3e9c3',.003);props.push(b);
      }
    }else if(kind==='badminton'){
      net(decor,0,0,.28,.07);for(const z of [-.115,.115])stripe(decor,0,z,.27,.002);
      for(const side of [-1,1])for(const x of [-.065,.065]){
        const a=add(x,side*.13,side<0?0:Math.PI);const racket=new THREE.Mesh(new THREE.TorusGeometry(.012,.0012,5,16),material('#e2e8d0'));racket.position.set(0,-.04,0);a.limbs[3].add(racket);box(a.limbs[3],'#7a5558',0,-.035,0,.002,.017,.002);
      }
      const b=new THREE.Mesh(new THREE.ConeGeometry(.004,.009,6),material('#f5f2e1'));g.add(b);props.push(b);
    }else if(kind==='basketball'){
      const hoopGeo=new THREE.TorusGeometry(.013,.0015,6,24);
      for(const z of [-.18,.18]){
        box(decor,'#3d6168',0,0,z,.006,.115,.006);box(decor,'#ecede3',0,.090,z,.052,.037,.003);
        const hoop=new THREE.Mesh(hoopGeo,material('#efac6b'));hoop.rotation.x=Math.PI/2;hoop.position.set(0,.096,z-Math.sign(z)*.018);decor.add(hoop);
        for(let k=0;k<6;k++)box(decor,'#e5e1c9',Math.sin(k)*.011,.080,hoop.position.z+Math.cos(k)*.011,.001,.015,.001);
      }
      const circle=new THREE.Mesh(new THREE.TorusGeometry(.04,.001,5,32),material('#eee6c9'));circle.rotation.x=Math.PI/2;circle.position.y=.005;decor.add(circle);
      for(let j=0;j<6;j++)add((j%3-1)*.065,(j<3?-1:1)*.085,j<3?0:Math.PI);props.push(ball(g,'#da7836',.008));
    }else{
      for(const z of [-.185,.185]){net(decor,0,z,.085,.043);box(decor,'#dae7d2',0,.044,z,.085,.003,.025);}
      const circle=new THREE.Mesh(new THREE.TorusGeometry(.034,.001,5,24),material('#edf4e5'));circle.rotation.x=Math.PI/2;circle.position.y=.005;decor.add(circle);
      for(let j=0;j<8;j++)add((j%4-1.5)*.055,(j<4?-1:1)*.095,j<4?0:Math.PI);props.push(ball(g,'#f0ece0',.009));
    }
  }
  tree(decor,-.153,0,.19,.08,index%2?'flowering':'umbrella');tree(decor,.154,0,-.19,.08,'palm');
  sign(decor,programNames[kind],0,.12,-.22,.28,.026,'#396b67');batchStatic(decor);
  function update(t){
    for(const [j,a] of actors.entries()){
      if(kind==='swimming'){
        const phase=(t*.035+j*.27)%1,forward=phase<.5;a.root.position.z=-.13+(.5-Math.abs(phase-.5))*.52;
        a.root.position.y=.018;a.root.rotation.set(-Math.PI/2,0,forward?0:Math.PI);a.limbs[2].rotation.x=t*5+j;a.limbs[3].rotation.x=t*5+j+Math.PI;
        a.limbs[0].rotation.x=Math.sin(t*9)*.35;a.limbs[1].rotation.x=-a.limbs[0].rotation.x;
      }else if(kind==='tea'){
        a.limbs[0].rotation.x=-1.3;a.limbs[1].rotation.x=-1.3;a.limbs[3].rotation.x=-.7-(Math.sin(t*.8+j)+1)*.6;
      }else{
        a.root.userData.baseX??=a.root.position.x;
        a.root.userData.baseZ??=a.root.position.z;
        a.root.position.x=a.root.userData.baseX+Math.sin(t*1.4+j)*.014;
        if(kind==='football'||kind==='basketball'){
          a.root.position.z=a.root.userData.baseZ+Math.sin(t*.8+j*1.7)*.035;
          a.root.position.x+=Math.sin(t*.8+j)*.018;
          a.root.rotation.y=Math.atan2(Math.sin(t*1.2)*.075-a.root.position.x,Math.sin(t*.8)*.12-a.root.position.z);
        }
        a.limbs[2].rotation.x=Math.sin(t*2+j)*.4;
        a.limbs[3].rotation.x=kind==='football'?Math.sin(t*2+j)*.4:-1.1+Math.sin(t*3+j)*1.0;
        a.limbs[0].rotation.x=Math.sin(t*3+j)*.45;a.limbs[1].rotation.x=-a.limbs[0].rotation.x;
      }
    }
    props.forEach((b,j)=>{
      if(kind==='table-tennis')b.position.set((j?1:-1)*.075+Math.sin(t*4)*.025,.039+Math.abs(Math.sin(t*5))* .025,Math.sin(t*4)*.115);
      else if(kind==='badminton')b.position.set(Math.sin(t*2)*.045,.065+Math.abs(Math.cos(t*2))*.08,Math.sin(t*2)*.135);
      else if(kind==='basketball'){const p=(t%7)/7;b.position.set(p<.6?.035:0,p<.6?.014+Math.abs(Math.sin(t*8))*.035:.022+Math.sin((p-.6)/.4*Math.PI)*.15,p<.6?.03:.03-(p-.6)/.4*.19);}
      else b.position.set(Math.sin(t*1.2)*.075,.013,Math.sin(t*.8)*.12);
    });
  }
  update(0);return {update,actors,kind};
}

export function buildCommunityActivities({parent,places,heightAt,waterAt,routes=[],buildings=[]}){
  const group=new THREE.Group();group.name='community-recreation';parent.add(group);const courts=[],sites=[];
  const offRoad=streetClearance(routes),clear=landClearance({heightAt,waterAt,buildings});
  for(const [index,p] of places.filter(p=>p.kind==='activity').entries()){
    let site;outer:for(const scale of [1,.75,.55])for(const r of [.48,.65,.83,1.05,1.3,1.65,2,2.5,3,3.5,4.5,5.5])for(let k=0;k<48;k++){
      const x=p.x+Math.cos(k*Math.PI/24)*r,z=p.z+Math.sin(k*Math.PI/24)*r,h=heightAt(x,z);
      if(!offRoad(x,z,.30*scale)||!clear(x,z,.30*scale))continue;
      if(h<0||![-1,0,1].every(dx=>[-1,0,1].every(dz=>waterAt(x+dx*.19*scale,z+dz*.25*scale)===null&&Math.abs(heightAt(x+dx*.19*scale,z+dz*.25*scale)-h)<.025)))continue;
      if(places.some(q=>(q.span||q.kind==='activity')&&Math.hypot(x-q.x,z-q.z)<(q.span||.3)+.30*scale+.15))continue;
      site={x,z,h,scale};break outer;
    }
    if(!site)continue;
    const g=new THREE.Group();g.position.set(site.x,site.h+.012,site.z);g.scale.setScalar(site.scale);group.add(g);
    const kind=communityPrograms[index%12],court=buildCourt(g,kind,index);courts.push(court);
    const distance=Math.hypot(site.x-p.x,site.z-p.z);
    p.views=[{name:p.name,x:(p.x+site.x)/2,z:(p.z+site.z)/2,halfHeight:Math.max(.48,distance*.55+.30),span:distance+.7,top:.04,offset:[1,1.8,1.5]}];
    p.defaultView=0;p.program=kind;p.description=p.description+' 街区活动：'+programNames[kind]+'。';
    sites.push({id:p.id,region:p.name.split(' · ')[0],name:p.name+' · '+programNames[kind],kind,x:site.x,z:site.z,span:.28*site.scale,scale:site.scale,anchor:{x:p.x,z:p.z}});
  }
  return {group,sites,stats:{courts:sites.length,programs:sites.map(s=>s.kind),regions:sites.map(s=>s.region),people:courts.reduce((n,c)=>n+c.actors.length,0)},update(t){courts.forEach(c=>c.update(t));},snapshot:()=>courts.flatMap(c=>c.actors.map(a=>[...a.root.position.toArray(),...a.limbs.flatMap(l=>l.rotation.toArray().slice(0,3))]))};
}
