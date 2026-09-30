import * as THREE from 'three';
import {box,disc,tree,sign,material,person} from './scene-miniatures.mjs';
import {batchStatic} from './static-batch.mjs';
import {addExhibitInfill} from './exhibit-infill.mjs';
import {buildWalkwayCrowd,settleExhibitHosts} from './walkway-crowds.mjs';
import {jieyangPlaces} from './jieyang-places.mjs';

export function buildJieyangSights({parent,places=jieyangPlaces,heightAt,waterAt}){
  const group=new THREE.Group();group.name='jieyang-city-river-and-heritage';parent.add(group);
  const models=[],routes=[],actors=[],animations=[],coverage=[],obstacles=[];
  const mesh=(g,geo,c,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geo,material(c));m.position.set(x,y,z);g.add(m);return m;};
  const beam=(g,a,b,c='#859787',r=.003)=>{const start=new THREE.Vector3(...a),v=new THREE.Vector3(...b).sub(start);const m=mesh(g,new THREE.CylinderGeometry(r,r,v.length(),6),c);m.position.copy(start).addScaledVector(v,.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());};
  const roof=(g,x,y,z,w,d)=>{
    const v=[];for(const s of [-1,1])for(const p of [[-w/2,0,s*d/2],[-w/2,.035,0],[w/2,0,s*d/2],[w/2,0,s*d/2],[-w/2,.035,0],[w/2,.035,0]])v.push(...p);
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geo.computeVertexNormals();const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#4a7169',side:THREE.DoubleSide}));m.position.set(x,y,z);g.add(m);
    box(g,'#b87560',x,y+.035,z,w,.007,.009);for(const s of [-1,1])beam(g,[x+s*w/2,y+.038,z],[x+s*(w/2+.013),y+.055,z],'#b87560');
  };
  const hall=(g,x,y,z,w=.23,d=.14,h=.13,label='')=>{
    (g.userData.buildings??=[]).push({x,y,z,w,d,h});
    box(g,'#d8dbc7',x,y,z,w,h,d);roof(g,x,y+h,z,w+.02,d+.025);
    box(g,'#866852',x,y,z+d/2+.004,.035,h*.56,.006);
    for(const s of [-1,1]){box(g,'#78a4a1',x+s*w*.28,y+h*.35,z+d/2+.004,w*.15,h*.30,.006);beam(g,[x+s*w*.43,y,z+d/2+.018],[x+s*w*.43,y+h,z+d/2+.018],'#b88a6b',.004);}
    if(label)sign(g,label,x,y+h*.75,z+d/2+.024,w*.81,.024);
  };
  for(const [index,p] of places.entries()){
    const g=new THREE.Group();g.name=p.id;g.scale.setScalar(p.displayScale);group.add(g);
    const heights=[];for(let i=0;i<=12;i++)for(let j=0;j<=10;j++)heights.push(heightAt(p.x+(-.62+i*.103)*p.displayScale,p.z+(-.5+j*.1)*p.displayScale));
    const ground=Math.max(...heights,waterAt(p.x,p.z)??-Infinity)+.025,depth=Math.max(.03,(ground-Math.min(...heights))/p.displayScale);
    g.position.set(p.x,ground,p.z);p.sceneY=ground;box(g,'#88a68f',0,-depth,0,1.24,depth,.98);box(g,'#a2ba95',0,0,0,1.22,.01,.96);
    const paths=[],dynamic=[],localActors=[];
    const path=(pts,width=.045,rail=false)=>{
      paths.push(pts);for(let i=1;i<pts.length;i++){
        const a=new THREE.Vector3(...pts[i-1]),b=new THREE.Vector3(...pts[i]),v=b.clone().sub(a),len=v.length();if(len<1e-6)continue;
        const m=box(g,'#c6cebc',0,0,0,width,.008,len);m.position.copy(a).add(b).multiplyScalar(.5);m.position.y-=.004;m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),v.clone().normalize());
        if(rail){const norm=Math.hypot(v.x,v.z);for(const s of [-1,1]){const dx=v.z/norm*width*.60*s,dz=-v.x/norm*width*.60*s;beam(g,[a.x+dx,a.y+.025,a.z+dz],[b.x+dx,b.y+.025,b.z+dz]);const n=Math.ceil(len/.08);for(let j=0;j<=n;j++){const q=a.clone().lerp(b,j/n);beam(g,[q.x+dx,q.y,q.z+dz],[q.x+dx,q.y+.025,q.z+dz]);}}}
      }return pts;
    };
    const loop=(rx=.49,rz=.38,y=.031)=>path([[-rx,y,rz],[-rx,y,-rz],[rx,y,-rz],[rx,y,rz],[-rx,y,rz]]);
    const host=(x,z,state='look',y=.031)=>{const a=person(g,index+actors.length,{scale:.015});a.root.position.set(x,y,z);a.pose(0,state);actors.push(a);localActors.push(a);dynamic.push(a.root);animations.push(t=>a.pose(t*.45,state==='wave'?(Math.sin(t*.35+index)>.90?'wave':'look'):state));};
    const grove=(cx,cz,rx,rz,count=25,type='broadleaf',surface=()=>.014)=>{for(let i=0;i<count;i++){const a=i*2.399,r=Math.sqrt((i+.5)/count),x=cx+Math.cos(a)*rx*r,z=cz+Math.sin(a)*rz*r;tree(g,x,surface(x,z),z,.045+i%5*.01,type);}};
    const edgeTrees=()=>{grove(-.55,0,.021,.35,25);grove(.55,0,.021,.35,25,'bamboo');};
    const oval=(c,x,y,z,rx,rz)=>{const m=disc(g,c,x,y,z,1,.006);m.scale.set(rx,1,rz);};
    const rock=(x,z,r=.06,y=.02,h=1)=>{const m=mesh(g,new THREE.DodecahedronGeometry(r,0),'#a4afa0',x,y+r*h*.6,z);m.scale.set(1,h,.85);m.rotation.y=x*7+z*11;};
    const pavilion=(x,z,y=.021)=>{for(const sx of [-1,1])for(const sz of [-1,1])beam(g,[x+sx*.046,y,z+sz*.035],[x+sx*.046,y+.105,z+sz*.035],'#b48b68',.004);roof(g,x,y+.105,z,.14,.115);};
    const tea=(x,z)=>{disc(g,'#ac8b64',x,.028,z,.032,.020);disc(g,'#a96d4f',x,.049,z-.008,.008,.012);for(const dx of [-.018,0,.018])disc(g,'#e5e7d3',x+dx,.049,z+.012,.004,.005);host(x-.057,z,'sit');host(x+.057,z,'sit');};
    const water=(x,z,w,d)=>{box(g,'#619fa6',x,.014,z,w,.007,d);for(let j=0;j<3;j++){const pts=[];for(let k=0;k<25;k++)pts.push(new THREE.Vector3(x-w*.43+k*w*.86/24,.026,z+(j-1)*d*.24+Math.sin(k*.5)*.005));const m=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:'#c4e5da',transparent:true,opacity:.40}));g.add(m);dynamic.push(m);animations.push(t=>m.position.z=Math.sin(t*.65+j)*.004);}};
    const terrain=f=>{const geo=new THREE.PlaneGeometry(1.2,.94,40,32);geo.rotateX(-Math.PI/2);const pos=geo.attributes.position,colors=[];for(let i=0;i<pos.count;i++){const y=f(pos.getX(i),pos.getZ(i));pos.setY(i,y);const c=new THREE.Color(y>.28?'#95ac90':y>.1?'#759870':'#a2ba95');colors.push(c.r,c.g,c.b);}geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();g.add(new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true})));};
    const orchard=(cx,cz,rows=3,cols=4)=>{for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const x=cx+j*.09,z=cz+i*.11;tree(g,x,.016,z,.075,'broadleaf');for(let k=0;k<4;k++)mesh(g,new THREE.SphereGeometry(.005,5,4),'#ba6652',x+Math.cos(k*1.57)*.019,.083,z+Math.sin(k*1.57)*.019);}};
    const shop=(x,z,label,i)=>{hall(g,x,.02,z,.20,.145,.135+i%2*.03);box(g,i%2?'#d2ad61':'#648e9a',x,.095,z+.095,.21,.01,.06);sign(g,label,x,.075,z+.126,.17,.025);};
    g.userData.program=p.model;


    const gate=(x,z,label,w=.24)=>{for(const s of [-1,1])box(g,'#b2bdaa',x+s*w*.43,.019,z,.024,.145,.037);roof(g,x,.165,z,w+.035,.073);sign(g,label,x,.133,z+.025,w*.75,.027);};
    const boat=(x,z,rx=.04,rz=.02)=>{
      const b=new THREE.Group();g.add(b);dynamic.push(b);disc(b,'#967453',0,0,0,.045,.017).scale.set(.65,1,1.65);box(b,'#c6ad80',0,.018,0,.032,.015,.08);
      animations.push(t=>{b.position.set(x+Math.sin(t*.13)*rx,.034,z+Math.cos(t*.13)*rz);b.rotation.y=Math.atan2(Math.cos(t*.13)*rx,-Math.sin(t*.13)*rz);b.rotation.z=Math.sin(t)*.015;});
    };
    const tower=(x,z,y,levels,r=.085)=>{
      for(let i=0;i<levels;i++){const rr=r-i*.009,yy=y+i*.066;mesh(g,new THREE.CylinderGeometry(rr,rr+.004,.057,8),'#b9b19a',x,yy+.028,z);mesh(g,new THREE.CylinderGeometry(rr*.63,rr*1.18,.018,8),'#537d73',x,yy+.064,z);for(let k=0;k<8;k++){const a=k*Math.PI/4,m=box(g,'#466960',x+Math.sin(a)*rr*.94,yy+.013,z+Math.cos(a)*rr*.94,.014,.027,.003);m.rotation.y=a;}}
      mesh(g,new THREE.ConeGeometry(.025,.06,8),'#a69160',x,y+levels*.066+.03,z);
    };
    if(p.model==='three-tier-city-gate'){
      box(g,'#c1c9b5',0,.012,0,1.05,.01,.87);
      for(const x of [-.15,.15])box(g,'#b8ad91',x,.023,-.05,.19,.145,.20);
      box(g,'#b8ad91',0,.13,-.05,.48,.04,.20);hall(g,0,.17,-.05,.36,.18,.12,'进贤门');hall(g,0,.325,-.05,.23,.135,.09);
      for(const s of [-1,1]){shop(s*.37,.27,s<0?'古城茶铺':'老街书屋',1);grove(s*.54,-.18,.025,.18,22);}
      path([[0,.034,-.41],[0,.034,.42]],.075);loop(.51,.40);path([[-.51,.034,-.24],[.51,.034,-.24]],.045);host(.22,.11);g.userData.gateTiers=3;
    }else if(p.model==='confucian-ritual-axis'){
      hall(g,0,.024,-.30,.43,.16,.17,'揭阳学宫');for(const s of [-1,1])hall(g,s*.34,.024,-.08,.13,.29,.115);
      oval('#6d9e9e',0,.024,.12,.21,.105);path([[0,.063,.28],[0,.063,-.14]],.053,true);gate(0,.33,'礼门');
      loop(.50,.4);path([[-.5,.034,.26],[.5,.034,.26]],.035);edgeTrees();host(.25,.21);g.userData.ritualPond=true;
    }else if(p.model==='temple-opera-courts'){
      hall(g,0,.024,-.29,.45,.16,.17,'城隍庙');for(const s of [-1,1])hall(g,s*.35,.024,-.03,.14,.28,.115);
      box(g,'#b89c7b',0,.021,.27,.31,.04,.15);pavilion(0,.27,.06);gate(-.34,.32,'庙街',.17);
      loop(.51,.4);path([[-.51,.034,.145],[.51,.034,.145]],.055);path([[0,.034,-.19],[0,.034,.145]],.047);
      for(const x of [-.18,-.09,0,.09,.18])host(x,.07);grove(0,-.43,.44,.015,30);g.userData.operaStage=true;
    }else if(p.model==='martial-temple-banyan'){
      hall(g,-.04,.025,-.25,.43,.20,.16,'古榕武庙');hall(g,-.39,.025,.0,.15,.27,.10);
      box(g,'#a75e50',-.06,.022,.27,.25,.105,.025);roof(g,-.06,.127,.27,.28,.046);
      tree(g,.34,.02,.08,.24,'broadleaf');tea(.32,.30);
      path([[-.23,.034,.40],[-.23,.034,-.10],[.19,.034,-.10],[.19,.034,.40]],.051);loop(.52,.4);grove(.49,-.28,.07,.09,23);g.userData.banyanCourt=true;
    }else if(p.model==='twin-courtyard-monastery'){
      hall(g,0,.024,-.30,.44,.16,.18,'双峰寺');
      for(const s of [-1,1]){hall(g,s*.34,.024,-.03,.14,.29,.13);hall(g,s*.32,.154,-.10,.13,.13,.09);oval('#88a77f',s*.13,.023,.12,.07,.09);}
      gate(0,.32,'山门');loop(.51,.4);path([[0,.034,-.19],[0,.034,.4]],.056);path([[-.5,.034,.25],[.5,.034,.25]],.037);edgeTrees();host(.21,.23);g.userData.pairedTowers=2;
    }else if(p.model==='forest-ridge-pagoda'){
      const f=(x,z)=>.016+.28*Math.exp(-((x+.22)**2+(z+.15)**2)/.06)+.17*Math.exp(-((x-.30)**2+(z+.26)**2)/.045);terrain(f);
      grove(-.31,-.20,.24,.20,70,'pine',f);grove(.34,-.15,.17,.23,52,'broadleaf',f);tower(-.13,-.15,f(-.13,-.15),4,.063);
      const pts=[];for(let i=0;i<=36;i++){const z=.40-i*.022,x=.04+Math.sin(i*.13)*.11;pts.push([x,f(x,z)+.014,z]);}path(pts,.036,true);
      path([[-.5,.035,.40],[.5,.035,.40]],.055);grove(-.38,.26,.12,.1,30,'bamboo',f);pavilion(.37,.28);g.userData.forestRidge=true;
    }else if(p.model==='lake-islets-arched-walk'){
      water(0,0,.83,.62);oval('#98b183',-.14,.029,.02,.12,.08);pavilion(-.14,.02,.039);
      loop(.50,.4);path([[-.50,.04,.11],[-.29,.10,.11],[-.13,.04,.11],[.14,.10,.11],[.5,.04,.11]],.046,true);
      grove(-.56,0,.023,.32,30);grove(.55,0,.023,.32,30,'flowering');grove(0,-.43,.46,.015,28);boat(.19,-.12,.10,.05);host(.4,.29);g.userData.lakeIslet=true;
    }else if(p.model==='urban-river-two-banks'){
      water(0,0,.34,.94);
      for(const s of [-1,1]){for(let i=0;i<3;i++){const x=s*.43,z=-.29+i*.28;box(g,'#d3dacc',x,.021,z,.21,.15+i%2*.09,.16);for(let floor=0;floor<3+i%2;floor++)box(g,'#739a99',x,.047+floor*.042,z+.082,.17,.015,.004);}path([[s*.235,.038,-.43],[s*.235,.038,.43]],.055,true);grove(s*.57,0,.012,.35,28);}
      path([[-.235,.067,-.20],[.235,.067,-.20]],.053,true);path([[-.235,.067,.29],[.235,.067,.29]],.053,true);boat(0,.04,.035,.09);host(.3,.17);g.userData.riverBridges=2;
    }else if(p.model==='jade-workshops-gallery'){
      box(g,'#c5cebd',0,.012,0,1.08,.009,.87);hall(g,0,.024,-.29,.53,.17,.15,'阳美玉都');for(const x of [-.37,.37])shop(x,-.04,x<0?'玉雕工坊':'玉器展廊',0);
      for(const x of [-.29,0,.29]){box(g,'#a48e6b',x,.023,.25,.16,.042,.12);mesh(g,new THREE.TorusGeometry(.030,.007,8,20),'#74b5a1',x,.099,.25).rotation.y=.25;disc(g,'#7fa885',x+.043,.065,.22,.014,.05);}
      const stand=new THREE.Group();g.add(stand);dynamic.push(stand);stand.position.set(0,.066,-.07);
      for(let i=0;i<5;i++){const m=mesh(stand,new THREE.DodecahedronGeometry(.032,0),'#75a990',(i-2)*.025,.025+Math.sin(i)*.01,0);m.scale.y=1.7;}
      box(g,'#af9676',0,.023,-.07,.17,.042,.10);animations.push(t=>stand.rotation.y=Math.sin(t*.18)*.20);
      loop(.52,.4);path([[-.52,.034,.11],[.52,.034,.11]],.06);path([[.17,.034,-.18],[.17,.034,.40]],.041);edgeTrees();host(-.20,.18);host(.36,.16);g.userData.jadeDisplays=4;
    }else if(p.model==='lake-resort-boardwalk'){
      water(-.12,0,.68,.77);for(let i=0;i<3;i++)hall(g,.40,.024,-.28+i*.25,.22,.16,.10);
      path([[.25,.04,-.42],[.25,.04,.41]],.06,true);path([[-.49,.055,.30],[.25,.055,.30]],.045,true);path([[-.49,.055,-.30],[-.49,.055,.3]],.046,true);
      pavilion(-.41,-.31,.04);grove(0,-.43,.42,.014,32,'broadleaf');grove(0,.43,.42,.014,30,'flowering');boat(-.09,-.03,.10,.11);host(.33,.30);g.userData.lakesideLodges=3;
    }else if(p.model==='bamboo-stream-gardens'){
      water(0,-.02,1.17,.10);
      for(const s of [-1,1]){grove(s*.34,-.25,.18,.12,55,'bamboo');grove(s*.36,.27,.17,.13,40,'bamboo');}
      loop(.52,.40);path([[0,.04,.40],[0,.08,-.12],[0,.04,-.40]],.046,true);pavilion(.25,.11);tea(-.27,.12);g.userData.bambooGarden=true;
    }else if(p.model==='culture-plaza-stage'){
      box(g,'#bbc7b5',0,.012,0,1.08,.009,.87);hall(g,0,.024,-.3,.58,.16,.155,'揭阳文化广场');
      box(g,'#ad9879',0,.022,-.05,.31,.036,.15);roof(g,0,.17,-.05,.34,.18);
      for(const x of [-.34,.34])for(const z of [-.05,.14,.31]){tree(g,x,.019,z,.10,'broadleaf');box(g,'#9e8d72',x+.04,.023,z,.09,.026,.025);}
      loop(.52,.4);path([[-.51,.034,.23],[.51,.034,.23]],.057);path([[0,.034,.08],[0,.034,.40]],.045);
      host(-.10,.14,'wave');host(.1,.14,'look');grove(0,-.43,.45,.016,27);g.userData.culturalStage=true;
    }else if(p.model==='river-musical-jets'){
      water(0,-.11,1.18,.57);box(g,'#bdcaba',0,.014,.30,1.19,.012,.28);
      for(let i=0;i<21;i++){
        const x=(i-10)*.045,z=-.11+Math.sin(i*.40)*.035;
        const jet=mesh(g,new THREE.CylinderGeometry(.0025,.004,.13,6),'#c2e7df',x,.095,z);dynamic.push(jet);jet.userData.fountainJet=true;
        animations.push(t=>{jet.scale.y=.35+(Math.sin(t*1.9+i*.42)+1)*.55;jet.position.y=.029+.065*jet.scale.y;});
      }
      path([[-.53,.04,.17],[.53,.04,.17]],.063,true);path([[-.53,.034,.40],[.53,.034,.40]],.055);path([[-.53,.04,.17],[-.53,.034,.4]],.044);path([[.53,.04,.17],[.53,.034,.4]],.044);
      for(const x of [-.39,-.13,.13,.39]){tree(g,x,.027,.30,.085,'broadleaf');host(x,.21,'look');}g.userData.fountainJets=21;
    }else if(p.model==='rock-valley-hermitage'){
      const f=(x,z)=>.015+.21*Math.exp(-((x+.39)**2+(z+.19)**2)/.04)+.20*Math.exp(-((x-.39)**2+(z+.21)**2)/.04);terrain(f);
      hall(g,0,.024,-.22,.31,.17,.13,'广德庵');for(const s of [-1,1]){rock(s*.33,-.12,.11,f(s*.33,-.12),1.3);grove(s*.44,.08,.10,.26,48,'broadleaf',f);}
      path([[0,.034,.4],[0,.034,-.1]],.05);path([[-.3,.04,.31],[.3,.04,.31]],.045);pavilion(-.21,.19);host(.16,.13);g.userData.hermitageValley=true;
    }else if(p.model==='cliff-terrace-temple'){
      const f=(x,z)=>.015+.22*Math.exp(-((x+.40)**2+(z+.19)**2)/.055);terrain(f);
      box(g,'#a0ad94',.10,.014,-.16,.63,.09,.43);hall(g,.10,.105,-.22,.37,.19,.16,'南岩古寺');hall(g,.34,.105,-.075,.13,.12,.10);
      for(let i=0;i<5;i++){const x=-.48+i*.07;rock(x,-.25,.10,f(x,-.25),1.4);}
      path([[.12,.034,.4],[.12,.115,.04],[.35,.115,.04]],.052,true);path([[-.48,.034,.4],[.48,.034,.4]],.053);
      grove(-.4,.22,.11,.13,37,'bamboo',f);grove(.5,-.21,.044,.17,30);host(.33,.29);g.userData.cliffTerrace=true;
    }else if(p.model==='hillside-hall-terraces'){
      const f=(x,z)=>.015+.24*Math.exp(-((x+.38)**2+(z+.30)**2)/.05)+.22*Math.exp(-((x-.40)**2+(z+.24)**2)/.045);terrain(f);
      for(let i=0;i<3;i++){const z=.22-i*.24,y=.025+i*.07;box(g,'#acb59e',0,.012,z,.56,y-.006,.21);hall(g,0,y,z-.035,.32-i*.018,.105,.1+i*.025);}
      path([[-.38,.034,.4],[-.38,.047,.22],[-.38,.117,-.02],[-.38,.187,-.39],[.38,.187,-.39],[.38,.117,-.02],[.38,.047,.22],[.38,.034,.40]],.044,true);path([[-.38,.034,.4],[.38,.034,.4]],.05);
      for(let i=0;i<7;i++)box(g,'#91a48b',-.36+i*.12,.022,-.39,.014,.165,.018);
      for(const s of [-1,1])grove(s*.53,-.04,.045,.30,40,'pine',f);host(0,.37);g.userData.templeTerraces=3;
    }else if(p.model==='boulder-grove-sanctuary'){
      hall(g,-.12,.024,-.21,.36,.18,.14,'马嘶岩');pavilion(.28,.27);
      for(let i=0;i<7;i++)rock(.23+Math.sin(i*.8)*.13,-.27+i*.055,.061,.023,1.25+i%2*.4);
      path([[-.40,.035,.39],[-.40,.035,.08],[.06,.035,.08],[.06,.035,.38],[.45,.035,.38]],.05);path([[-.40,.035,.39],[.06,.035,.38]],.045);
      grove(-.49,-.14,.058,.21,40,'broadleaf');grove(0,-.43,.46,.012,29,'pine');grove(.52,.02,.028,.32,32);tea(-.22,.24);g.userData.boulderGarden=7;
    }else if(p.model==='scholar-pagoda-garden'){
      tower(-.12,-.06,.023,5,.096);hall(g,.33,.024,-.26,.25,.17,.125,'文昌书苑');oval('#78a6a0',.32,.023,.14,.13,.085);
      const pts=[];for(let i=0;i<=36;i++){const a=i/36*Math.PI*2;pts.push([-.12+Math.cos(a)*.25,.034,-.06+Math.sin(a)*.29]);}path(pts,.045);
      path([[-.12,.034,.23],[-.12,.034,.40],[.51,.034,.40],[.51,.034,-.38]],.051);grove(-.49,0,.048,.31,35);grove(0,-.43,.42,.013,27,'bamboo');host(.26,.32);g.userData.scholarTower=true;
    }
    if(!paths.length)throw new Error('Missing Jieyang scene: '+p.model);
    g.userData.walkways=paths;
    for(const pts of paths)routes.push(pts.map(a=>new THREE.Vector3(...a).multiplyScalar(p.displayScale).add(g.position)));
    addExhibitInfill({group:g,place:p,paths});
    obstacles.push(...settleExhibitHosts({group:g,actors:localActors,paths}));coverage.push({id:p.id,paths:paths.length,x:p.x,z:p.z,width:1.24*p.displayScale,depth:.98*p.displayScale,offset:p.displayOffset||0});
    for(const o of dynamic)g.remove(o);batchStatic(g);for(const o of dynamic)g.add(o);g.traverse(o=>{if(o.isMesh)o.userData.landmarkId=p.id;});models.push({id:p.id,type:p.model,group:g});
  }
  const streetLife=buildWalkwayCrowd({parent:group,preparedWalkways:routes,population:routes.length*8,obstacles});
  const update=t=>{streetLife.update(t);for(const fn of animations)fn(t);};update(0);
  return {group,models,streetLife,update,stats:{places:places.length,models:models.length,people:streetLife.count+actors.length,animations:animations.length,coverage}};
}
