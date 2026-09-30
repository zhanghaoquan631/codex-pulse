import * as THREE from 'three';
import {batchStatic} from './static-batch.mjs';
import {addExhibitInfill} from './exhibit-infill.mjs';
import {nanaoLocalWalkways} from './nanao-walkways.mjs';
import {buildNanaoWalkways} from './nanao-walkways.mjs';

const official='https://www.shantou.gov.cn/cnst/ywdt/styw/content/post_2227576.html';
// Editorial anchors, not navigation coordinates. Existing Changshanwei model is reused.
const definitions=[
  ['qingao','青澳湾','Qingao Bay',117.13405,23.43923,'beach','弧形沙滩、遮阳伞和面向海湾的步道。',true],
  ['nature-gate','北回归线广场 · 自然之门','Nature Gate',117.13080,23.44401,'gate','倾斜双柱托起球体，广场与青澳湾相连。',true],
  ['sancong','三囱崖灯塔','Sancong Cliff Lighthouse',117.13658,23.40394,'lighthouse','高低相伴的红白竖纹灯塔，立于海边礁岩。',true],
  ['qihang','启航广场','Qihang Square',116.9438,23.4370,'square','入岛后的海岸广场，与长山尾红塔相望。',true],
  ['nanao-bridge','南澳大桥','Nanao Bridge',116.91041,23.44970,'bridge','跨海桥梁连接澄海与南澳岛，桥墩随海面展开。',true],
  ['huanghua','黄花山国家森林公园','Huanghuashan Forest',116.9763,23.4365,'forest','山林、登高台阶与观景亭组成林间游线。',true],
  ['wind-farm','南澳风电场 · 风车山','Wind Farm',117.0550,23.4350,'wind','沿山脊展开的白色风机，叶片持续转动。',false],
  ['headquarters','总兵府','General Headquarters',117.0971,23.4545,'courtyard','门楼、中轴院落与古树，表现海防历史空间。',true],
  ['song-well','宋井','Song Well',117.1031,23.3995,'well','海边石井、护栏和礁石步道，保留清晰井口。',true],
  ['treasure','金银岛','Jinyin Island',117.1180,23.4811,'rocks','花岗岩、曲折小径和海滨观景亭。',true],
  ['xiongzhen','雄镇关','Xiongzhen Pass',117.083,23.444,'pass','山口石关、垛口与穿关步道。',false],
  ['dieshiyan','叠石岩','Dieshiyan Temple',117.065,23.448,'temple','层叠巨石旁的山寺、石阶与树林。',false],
  ['yunao','云澳渔港','Yunao Fishing Harbour',117.08333,23.40806,'harbour','防波堤、泊位、渔船与岸边渔市。',true],
  ['zhuqidu','竹栖肚湾','Zhuqidu Bay',117.139,23.470,'cove','海岸公路、礁石与小海湾形成连续风景。',false],
  ['houzhai','后宅镇','Houzhai Town',117.0190,23.4240,'town','县城街巷、沿街店铺和滨海公共空间。',true],
  ['shenao','深澳镇','Shenao Town',117.093,23.460,'old-town','低矮街屋与院落组成历史城镇肌理。',false],
  ['zoumapu','走马埔村','Zoumapu Village',117.062,23.463,'aquaculture','岸边村落与整齐的海上养殖浮排。',false]
];
export const nanaoPlaces=definitions.map(([id,name,en,lon,lat,model,description,priority])=>({
  id:'nanao-'+id,name,en,ll:[lon,lat],model,description,priority,kind:'island',area:'南澳',
  halfHeight:model==='bridge'?2.2:.65,span:model==='bridge'?3.2:.9,top:.45,offset:[3,4,5],pin:true,major:false,
  detail:description+' 模型为艺术化微缩场景；位置为近似地理锚点，不用于导航。',tags:['南澳岛',priority?'重点景点':'海岛探索','近似位置'],source:official,
  coordinateSource:'Approximate WGS84 editorial anchor; see RECON/nanao-sights-sources.md',
  footprint:model==='bridge'?[-1.55,1.55,-.12,.12]:model==='square'?[-.18,.18,-.16,.16]:model==='old-town'?[-.46,.46,-.4,.64]:[-.46,.46,-.40,.40]
}));

export function positionNanaoPlaces({places=nanaoPlaces,toWorld,heightAt,waterAt}){
  const [lx,lz]=toWorld(116.94145,23.4343);
  for(const p of places){
    const [ax,az]=toWorld(...p.ll);p.x=ax;p.z=az;
    if(!['square','courtyard','temple','old-town','pass','town'].includes(p.model))continue;
    let best;
    for(let ix=-7;ix<=7;ix++)for(let iz=-7;iz<=7;iz++){
      const x=ax+ix*.13,z=az+iz*.13;
      if(p.model==='square'&&Math.abs(x-lx)<.95&&Math.abs(z-lz)<1.3)continue;
      const samples=[];let dry=true;
      const size=p.model==='square'?.4:1;
      for(const dx of [-.44*size,0,.44*size])for(const dz of [-.38*size,0,.38*size]){if(waterAt(x+dx,z+dz)!==null)dry=false;samples.push(heightAt(x+dx,z+dz));}
      if(!dry)continue;
      const slope=Math.max(...samples)-Math.min(...samples),score=Math.hypot(x-ax,z-az)+slope*30;
      if(!best||score<best.score)best={x,z,score};
    }
    if(best){p.x=best.x;p.z=best.z;}
  }
}

export function buildNanaoSights({parent,places=nanaoPlaces,heightAt,waterAt,toWorld,data}){
  const group=new THREE.Group();group.name='nanao-sights';parent.add(group);
  const mats=new Map(),rotors=[],boats=[],models=[];
  const material=c=>{if(!mats.has(c))mats.set(c,new THREE.MeshStandardMaterial({color:c,roughness:.8}));return mats.get(c);};
  const mesh=(g,geo,c,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geo,material(c));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;};
  const box=(g,c,x,y,z,w,h,d)=>mesh(g,new THREE.BoxGeometry(w,h,d),c,x,y+h/2,z);
  const cylinder=(g,c,x,y,z,r,h,n=16)=>mesh(g,new THREE.CylinderGeometry(r,r,h,n),c,x,y+h/2,z);
  const beam=(g,c,a,b,r=.012)=>{const v=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),m=mesh(g,new THREE.CylinderGeometry(r,r,v.length(),6),c);m.position.copy(new THREE.Vector3(...a).addScaledVector(v,.5));m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return m;};
  const tree=(g,x,z,s=1)=>{cylinder(g,'#887e63',x,0,z,.012*s,.15*s,6);mesh(g,new THREE.IcosahedronGeometry(.09*s,1),'#53866a',x,.19*s,z).scale.y=1.2;};
  const rock=(g,x,z,s=.12)=>{const m=mesh(g,new THREE.DodecahedronGeometry(s,0),'#89968f',x,s*.35,z);m.rotation.set(x*4,z*3,.2);m.scale.set(1,.8,1.1);};
  const house=(g,x,z,w=.24,d=.18,h=.16)=>{box(g,'#eee7d5',x,0,z,w,h,d);box(g,'#9b5545',x,h*.45,z+d/2,.05,h*.85,.008);const roof=mesh(g,new THREE.ConeGeometry(1,.11,4),'#526b69',x,h+.035,z);roof.rotation.y=Math.PI/4;roof.scale.set(w*.85,1,d*.85);for(const dx of [-.07,.07])box(g,'#719b9a',x+dx,.08,z+d/2+.004,.038,.047,.008);};
  const pavilion=(g,x,z)=>{box(g,'#c8d1c7',x,0,z,.24,.025,.24);for(const dx of [-.08,.08])for(const dz of [-.08,.08])cylinder(g,'#995745',x+dx,.02,z+dz,.012,.19,6);const r=mesh(g,new THREE.ConeGeometry(.20,.12,4),'#536e67',x,.27,z);r.rotation.y=Math.PI/4;};
  const steps=(g,x,z)=>{for(let i=0;i<7;i++)box(g,'#ccd4c9',x,i*.008,z+i*.028,.22,.01,.035);};
  const boat=(g,x,z,i)=>{const b=new THREE.Group();b.position.set(x,.02,z);g.add(b);const hull=mesh(b,new THREE.CylinderGeometry(.05,.025,.035,5),['#326f91','#9a5147','#ceaa61'][i%3]);hull.scale.z=2.6;box(b,'#eee9d8',0,.02,0,.066,.045,.065);beam(b,'#425b64',[0,.03,0],[0,.16,0],.004);boats.push({g:b,y:b.position.y,phase:i});};
  for(const p of places){
    if(!Number.isFinite(p.x)||!Number.isFinite(p.z))positionNanaoPlaces({places:[p],heightAt,waterAt,toWorld});
    const g=new THREE.Group();g.name=p.id;g.position.set(p.x,Math.max(heightAt(p.x,p.z),waterAt(p.x,p.z)??-Infinity)+.014,p.z);group.add(g);
    const ground=(color='#bed0b2')=>{
      if(p.model!=='square')return box(g,color,0,-.025,0,.84,.025,.70);
      const paving=mesh(g,new THREE.PlaneGeometry(.84,.70,12,12),color);
      paving.geometry.rotateX(-Math.PI/2);paving.userData.terrainPaving=true;return paving;
    };
    if(p.model==='gate'){
      ground('#d8dfd4');for(let i=0;i<3;i++)box(g,'#b9c7c5',0,i*.018,0,.48-i*.045,.018,.4-i*.035);
      beam(g,'#d7c28d',[-.17,.06,0],[-.06,.44,0],.034);beam(g,'#d7c28d',[.17,.06,0],[.06,.44,0],.034);
      beam(g,'#d7c28d',[-.06,.44,0],[.08,.44,0],.024);mesh(g,new THREE.SphereGeometry(.078,20,16),'#798a81',0,.49,0);
      for(const a of [0,Math.PI/2]){const r=mesh(g,new THREE.TorusGeometry(.081,.003,5,24),'#dacb9d',0,.49,0);r.rotation.y=a;}
      box(g,'#bfa56e',0,.002,.15,.01,.004,.65);steps(g,0,.18);tree(g,-.34,-.27,.45);tree(g,.34,-.27,.55);
    }else if(p.model==='lighthouse'){
      ground();for(let i=0;i<9;i++)rock(g,Math.cos(i)*.3,Math.sin(i)*.28,.12);
      for(const [x,h,r] of [[-.12,.49,.063],[.14,.31,.05]]){
        cylinder(g,'#e8e7df',x,.02,0,r,h,24);
        for(let j=0;j<6;j++){const a=j*Math.PI/3;const m=box(g,'#ba4c4c',x+Math.sin(a)*(r+.001),.02,Math.cos(a)*(r+.001),.024,h,.004);m.rotation.y=a;}
        cylinder(g,'#efeee4',x,h,0,r*1.4,.025,24);cylinder(g,'#ba4c4c',x,h+.025,0,r*.7,.07);mesh(g,new THREE.ConeGeometry(r,.035,16),'#8b3d3e',x,h+.11,0);
      }steps(g,0,.14);
    }else if(p.model==='courtyard'||p.model==='temple'||p.model==='old-town'){
      ground('#d3d8c7');house(g,0,-.19,.40,.22,.21);house(g,-.29,0,.16,.42,.15);house(g,.29,0,.16,.42,.15);house(g,0,.25,.28,.12,.14);steps(g,0,.32);tree(g,-.22,-.22);
      if(p.model==='temple'){for(let i=0;i<4;i++)rock(g,-.28+i*.15,-.30,.12+i*.02);pavilion(g,.25,.12);}
      if(p.model==='old-town')for(let i=0;i<3;i++)house(g,-.3+i*.25,.52,.17,.16,.12);
    }else if(p.model==='well'){
      ground('#d7cfaa');const ring=mesh(g,new THREE.TorusGeometry(.095,.018,8,24),'#8d9488',0,.045,0);ring.rotation.x=Math.PI/2;cylinder(g,'#315c68',0,.005,0,.076,.008);for(let i=0;i<12;i++){const a=i*Math.PI/6;box(g,'#a1a697',Math.cos(a)*.097,.02,Math.sin(a)*.097,.036,.034,.032);}steps(g,0,.14);for(let i=0;i<5;i++)rock(g,-.30+i*.14,-.22,.07);
    }else if(p.model==='forest'||p.model==='wind'){
      for(let i=0;i<45;i++){const a=i*2.4,r=.12+((i*13)%29)/60,x=Math.cos(a)*r,z=Math.sin(a)*r;tree(g,x,z,.6+(i%4)*.15);}steps(g,0,.13);pavilion(g,0,-.06);
      if(p.model==='wind')for(let i=0;i<5;i++){const x=(i-2)*.21,z=Math.sin(i)*.2;cylinder(g,'#e9efeb',x,0,z,.015,.40);const rotor=new THREE.Group();rotor.position.set(x,.4,z+.025);g.add(rotor);for(let j=0;j<3;j++){const a=j*2*Math.PI/3;beam(rotor,'#edf1ee',[0,0,0],[Math.sin(a)*.17,Math.cos(a)*.17,0],.008);}rotors.push(rotor);}
    }else if(p.model==='harbour'||p.model==='aquaculture'){
      ground('#4d999c');box(g,'#bcc7c0',0,.01,-.27,.88,.035,.18);
      if(p.model==='harbour'){
        box(g,'#bcc7c0',-.40,.01,0,.06,.035,.65);box(g,'#bcc7c0',.40,.01,0,.06,.035,.65);
        for(let i=0;i<3;i++){box(g,'#bda682',-.24+i*.24,.03,-.05,.035,.02,.30);house(g,-.26+i*.25,-.3,.16,.12,.09);}
        for(let i=0;i<9;i++)boat(g,-.30+(i%5)*.14,.03+Math.floor(i/5)*.17,i);
      }else{for(let i=0;i<5;i++)for(let j=0;j<4;j++){const x=-.30+i*.14,z=-.12+j*.13;box(g,'#4f685b',x,.018,z,.11,.012,.10);for(const dx of [-.045,.045])for(const dz of [-.04,.04])cylinder(g,['#cc7758','#739abd','#dcbe72'][(i+j)%3],x+dx,.029,z+dz,.011,.014,8);}boat(g,.38,.20,0);house(g,0,-.31);}
    }else if(p.model==='bridge'){
      // Follow the available OSM bridge corridor near its geographic midpoint.
      const paths=(data?.roads||[]).filter(r=>r[1]&&r[0]!=='rail').map(r=>r[2]);
      let best;for(const path of paths)for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],d=Math.hypot((a[0]+b[0])/2-p.x,(a[1]+b[1])/2-p.z);if(!best||d<best.d)best={a,b,d};}
      if(best)g.rotation.y=-Math.atan2(best.b[1]-best.a[1],best.b[0]-best.a[0]);
      box(g,'#667b82',0,.11,0,3,.035,.12);for(let i=-7;i<=7;i++){box(g,'#d1d8d0',i*.2,-.08,0,.025,.2,.085);box(g,'#ece9d4',i*.2,.149,0,.075,.002,.006);}
      for(const x of [-.6,.6]){for(const z of [-.09,.09])box(g,'#dce3da',x,.1,z,.04,.55,.035);beam(g,'#dce3da',[x,.55,-.09],[x,.55,.09],.018);for(const sign of [-1,1])for(let k=1;k<5;k++)for(const z of [-.07,.07])beam(g,'#e8eadd',[x,.58,z],[x+sign*k*.14,.15,z],.004);}
      p.top=.62;
    }else if(p.model==='pass'){
      ground();for(const x of [-.25,.25])box(g,'#97a18f',x,0,0,.28,.24,.17);box(g,'#97a18f',0,.17,0,.30,.07,.17);for(let i=-5;i<=5;i++)box(g,'#a9b29e',i*.072,.24,0,.037,.05,.17);steps(g,0,.1);tree(g,-.30,-.22);tree(g,.30,-.22);
    }else if(p.model==='rocks'){
      for(let i=0;i<15;i++)rock(g,Math.cos(i*2.4)*(.12+i*.015),Math.sin(i*2.4)*(.12+i*.015),.07+(i%4)*.023);pavilion(g,0,-.08);steps(g,0,.14);
    }else if(p.model==='town'){
      ground('#c7d4bd');box(g,'#60767a',0,.002,0,.82,.008,.075);for(const z of [-.20,.20])for(let i=0;i<4;i++){house(g,-.30+i*.2,z,.14,.14,.13+(i%3)*.04);tree(g,-.36+i*.2,z+Math.sign(z)*.1,.55);}
    }else if(p.model==='square'){
      ground('#d7ded3');for(let i=0;i<4;i++)box(g,'#b1c5c4',0,.002+i*.003,0,.6-i*.1,.008,.48-i*.08);mesh(g,new THREE.ConeGeometry(.09,.32,3),'#d7af71',0,.18,0);for(let i=0;i<6;i++){tree(g,-.34+i*.135,-.27,.7);box(g,'#967d64',-.3+i*.12,.025,.26,.075,.025,.03);}
    }else{
      // Bay scenes are schematic coastal vignettes, leaving the real coastline intact.
      const sand=new THREE.Shape();sand.moveTo(-.42,-.15);sand.quadraticCurveTo(0,-.48,.42,-.15);sand.lineTo(.42,.02);sand.quadraticCurveTo(0,-.24,-.42,.02);sand.closePath();const beach=mesh(g,new THREE.ShapeGeometry(sand,32),'#d7cba1');beach.rotation.x=-Math.PI/2;
      for(let i=0;i<7;i++){const x=-.3+i*.1,z=.12+Math.cos(x*4)*.1;cylinder(g,'#987b61',x,.01,z,.004,.07,6);mesh(g,new THREE.ConeGeometry(.045,.022,8),['#d88d77','#77b7b3','#eedba4'][i%3],x,.09,z);}
      for(let i=0;i<7;i++)tree(g,-.36+i*.12,-.06,.55);
      if(p.model==='cove')for(let i=0;i<6;i++)rock(g,.3,(-3+i)*.10,.08);
    }
    const siteScale=p.model==='square'?.4:1;g.scale.setScalar(siteScale);
    if(p.model==='square'){p.halfHeight=.34;p.span=.50;p.top=.20;}
    if(!['square','bridge','beach','cove','harbour','aquaculture'].includes(p.model)){
      let level=g.position.y;for(let ix=-2;ix<=2;ix++)for(let iz=-2;iz<=2;iz++)level=Math.max(level,heightAt(p.x+ix*.22*siteScale,p.z+iz*.19*siteScale)+.014);
      g.position.y=level;
      // Retaining walls connect the level courtyard to the sloping terrain.
      if(!['forest','wind','rocks'].includes(p.model)){
        const corners=[[-.44,-.38],[.44,-.38],[.44,.38],[-.44,.38]],vertices=[];
        for(let i=0;i<4;i++){const a=corners[i],b=corners[(i+1)%4],ay=(heightAt(p.x+a[0]*siteScale,p.z+a[1]*siteScale)-level)/siteScale,by=(heightAt(p.x+b[0]*siteScale,p.z+b[1]*siteScale)-level)/siteScale;vertices.push(a[0],0,a[1],b[0],0,b[1],a[0],ay,a[1],b[0],0,b[1],b[0],by,b[1],a[0],ay,a[1]);}
        const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();mesh(g,geo,'#a8b4a4');
      }
    }
    if(p.model==='square'){
      for(const m of g.children){
        if(m.userData.terrainPaving){
          const a=m.geometry.attributes.position;
          for(let i=0;i<a.count;i++)a.setY(i,(heightAt(p.x+a.getX(i)*siteScale,p.z+a.getZ(i)*siteScale)+.014-g.position.y)/siteScale);
          a.needsUpdate=true;m.geometry.computeVertexNormals();
        }else m.position.y+=(heightAt(p.x+m.position.x*siteScale,p.z+m.position.z*siteScale)+.014-g.position.y)/siteScale;
      }
    }
    if(!['forest','wind','rocks','square','bridge'].includes(p.model))addExhibitInfill({group:g,place:p,paths:nanaoLocalWalkways(p.model),bounds:[-.40,.40,-.33,.33]});
    p.sceneY=g.position.y;
    const dynamic=new Set([...rotors,...boats.map(b=>b.g)]);const moving=g.children.filter(c=>dynamic.has(c));for(const m of moving)g.remove(m);batchStatic(g);for(const m of moving)g.add(m);
    if(['forest','wind','rocks'].includes(p.model)){
      for(const m of g.children){
        if(m.isMesh){const a=m.geometry.attributes.position;for(let i=0;i<a.count;i++)a.setY(i,a.getY(i)+heightAt(p.x+a.getX(i),p.z+a.getZ(i))+.014-g.position.y);a.needsUpdate=true;m.geometry.computeVertexNormals();m.geometry.computeBoundingSphere();}
        else if(dynamic.has(m))m.position.y+=heightAt(p.x+m.position.x,p.z+m.position.z)+.014-g.position.y;
      }
      p.sceneY=heightAt(p.x,p.z)+.014;
    }
    g.traverse(o=>{if(o.isMesh)o.userData.landmarkId=p.id;});
    models.push({id:p.id,type:p.model,group:g});
  }
  const streetLife=buildNanaoWalkways({parent:group,models,places,heightAt});
  return {group,models,streetLife,update(t){streetLife.update(t);for(const r of rotors)r.rotation.z=t*.5;for(const b of boats){b.g.position.y=b.y+Math.sin(t*1.3+b.phase)*.005;b.g.rotation.z=Math.sin(t+b.phase)*.025;}},stats:{places:models.length,rotors:rotors.length,boats:boats.length,people:streetLife.count,walkways:streetLife.coverage}};
}
