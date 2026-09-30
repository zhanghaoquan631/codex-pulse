import * as THREE from 'three';
import {box,disc,tree,sign,material,person} from './scene-miniatures.mjs';
import {batchStatic} from './static-batch.mjs';
import {addExhibitInfill} from './exhibit-infill.mjs';
import {buildWalkwayCrowd,settleExhibitHosts} from './walkway-crowds.mjs';
import {chaonanPlaces} from './chaonan-places.mjs';

export function buildChaonanSights({parent,places=chaonanPlaces,heightAt,waterAt}){
  const group=new THREE.Group();group.name='chaonan-towns-lakes-and-mountains';parent.add(group);
  const models=[],routes=[],actors=[],animations=[],coverage=[],obstacles=[];
  const mesh=(g,geo,c,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geo,material(c));m.position.set(x,y,z);g.add(m);return m;};
  const beam=(g,a,b,c='#859787',r=.003)=>{const start=new THREE.Vector3(...a),v=new THREE.Vector3(...b).sub(start);const m=mesh(g,new THREE.CylinderGeometry(r,r,v.length(),6),c);m.position.copy(start).addScaledVector(v,.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());};
  const roof=(g,x,y,z,w,d)=>{
    const v=[];for(const s of [-1,1])for(const p of [[-w/2,0,s*d/2],[-w/2,.035,0],[w/2,0,s*d/2],[w/2,0,s*d/2],[-w/2,.035,0],[w/2,.035,0]])v.push(...p);
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geo.computeVertexNormals();const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#4a7169',side:THREE.DoubleSide}));m.position.set(x,y,z);g.add(m);
    box(g,'#b87560',x,y+.035,z,w,.007,.009);for(const s of [-1,1])beam(g,[x+s*w/2,y+.038,z],[x+s*(w/2+.013),y+.055,z],'#b87560');
  };
  const hall=(g,x,y,z,w=.23,d=.14,h=.13,label='')=>{
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
    if(p.model==='village-watercourts'){
      water(0,.06,.17,.79);for(const s of [-1,1]){for(let i=0;i<3;i++)hall(g,s*.34,.02,-.29+i*.25,.24,.17,.13);path([[s*.16,.038,-.4],[s*.16,.038,.4]],.055,true);}
      for(const z of [-.14,.30])path([[-.16,.054,z],[.16,.054,z]],.055,true);edgeTrees();tea(.32,.39);g.userData.courtyards=6;
    }else if(p.model==='heritage-hillside'){
      const f=(x,z)=>.017+.22*Math.exp(-((x+.28)**2+(z+.23)**2)/.09);terrain(f);grove(-.36,-.21,.17,.21,60,'pine',f);grove(.32,-.28,.14,.1,26,'broadleaf',f);
      hall(g,.18,.035,.05,.43,.19,.13,'红场历史展廊');path([[-.52,.04,.36],[.48,.04,.36],[.48,.04,-.03]],.06);const pts=[];for(let i=0;i<30;i++){const x=-.48+i*.017,z=.28-i*.018;pts.push([x,f(x,z)+.015,z]);}path(pts,.035,true);for(let i=0;i<3;i++)box(g,'#8b9d8e',-.27+i*.15,.025,.23,.095,.07,.017);host(.3,.28);g.userData.hillsideExhibition=true;
    }else if(p.model==='lake-gardens'){
      water(-.06,-.02,.66,.53);oval('#acd0a4',.03,.03,-.07,.13,.08);grove(.03,-.07,.075,.036,9,'flowering');
      path([[-.46,.034,.35],[-.46,.034,-.35],[.45,.034,-.35],[.45,.034,.35],[-.46,.034,.35]],.06,true);path([[-.46,.047,.10],[-.20,.047,.10],[.03,.047,-.07],[.45,.047,-.07]],.042,true);
      pavilion(.44,.25);grove(-.55,-.02,.022,.34,25);grove(.13,-.43,.38,.021,28,'flowering');tea(.20,.35);g.userData.gardenIsland=true;
    }else if(p.model==='rock-sanctuary'){
      for(let i=0;i<7;i++)rock(-.4+i*.12,-.21,.088,.014,1.8+i%3*.5);hall(g,.15,.075,-.08,.24,.13,.12);grove(-.4,.02,.11,.16,25,'pine');grove(.45,-.18,.06,.20,24,'bamboo');
      path([[-.48,.036,.38],[.32,.036,.38],[.40,.06,.16],[.25,.09,.05],[-.12,.09,.05]],.05,true);path([[-.12,.09,.05],[-.26,.14,-.06],[-.12,.20,-.15]],.033,true);pavilion(-.12,-.15,.20);host(.21,.32);g.userData.rockRidge=true;
    }else if(p.model==='forest-ridges'){
      const f=(x,z)=>.02+.31*Math.exp(-((x+.25)**2+(z+.18)**2)/.05)+.25*Math.exp(-((x-.24)**2+(z+.20)**2)/.06);terrain(f);grove(-.33,-.19,.21,.21,75,'pine',f);grove(.32,-.22,.18,.18,65,'broadleaf',f);
      const pts=[];for(let i=0;i<55;i++){const z=.39-i*.014,x=Math.sin(i*.13)*.16;pts.push([x,f(x,z)+.014,z]);}path(pts,.039,true);const end=pts.at(-1);pavilion(end[0],end[2],end[1]);path([[-.48,.035,.38],[.48,.035,.38]],.05);g.userData.forestedPeaks=2;
    }else if(p.model==='history-museum'){
      box(g,'#c5cebb',0,.013,0,1.06,.009,.83);box(g,'#d1d8cb',0,.024,-.23,.55,.19,.24);box(g,'#a87566',0,.024,-.101,.11,.14,.012);box(g,'#62858b',0,.21,-.23,.59,.019,.28);
      for(const s of [-1,1])for(let i=0;i<3;i++)box(g,'#679a9e',s*(.11+i*.06),.087,-.105,.04,.08,.008);sign(g,'大南山革命历史纪念馆',0,.17,-.083,.43,.035);
      loop(.49,.37);path([[0,.034,.37],[0,.034,-.03]],.07);for(const s of [-1,1])for(let i=0;i<3;i++){box(g,'#879b8d',s*.30,.023,-.02+i*.125,.12,.072,.012);host(s*.30,.03+i*.125);}
      grove(-.55,0,.018,.35,27,'pine');grove(.55,0,.018,.35,27,'pine');g.userData.exhibitPanels=6;
    }else if(p.model==='historic-meeting-house'){
      hall(g,0,.021,-.24,.43,.18,.16,'红场旧址');for(const s of [-1,1])hall(g,s*.35,.021,-.07,.15,.34,.12);
      box(g,'#c5cbb8',0,.012,.10,.48,.009,.40);box(g,'#a98461',0,.023,-.06,.19,.035,.055);for(let i=0;i<4;i++){box(g,'#eee7ce',-.066+i*.044,.059,-.06,.027,.002,.019);box(g,'#aa9370',-.066+i*.044,.021,.015,.025,.022,.028);}
      loop(.49,.39);path([[-.49,.032,.27],[.49,.032,.27]],.06);grove(0,-.43,.46,.02,29);edgeTrees();host(.20,.20);g.userData.meetingTable=true;
    }else if(p.model==='memorial-terraces'){
      for(let i=0;i<5;i++)box(g,'#b5c0b2',0,.014+i*.012,-.06,.50-i*.045,.012,.38-i*.035);
      mesh(g,new THREE.CylinderGeometry(.031,.055,.34,4),'#c4cdbf',0,.24,-.06);box(g,'#d5dccb',0,.410,-.06,.057,.018,.057);sign(g,'革命烈士纪念碑',0,.21,-.001,.085,.022,'#8e9c8b');
      loop(.47,.36);path([[0,.032,.36],[0,.032,.15]],.08);for(const s of [-1,1]){grove(s*.35,-.15,.055,.19,24,'pine');for(let i=0;i<5;i++)oval('#c6988b',s*.34,.022,.10+i*.044,.04,.016);}grove(0,-.43,.45,.018,24,'pine');host(.12,.30);g.userData.terraceLevels=5;
    }else if(p.model==='peak-orchards'){
      const f=(x,z)=>.018+.37*Math.exp(-((x+.16)**2+(z+.21)**2)/.048);terrain(f);grove(-.31,-.20,.17,.22,64,'pine',f);grove(.25,-.23,.17,.12,40,'broadleaf',f);orchard(.12,.05,3,5);
      const pts=[];for(let i=0;i<45;i++){const z=.37-i*.015,x=-.19+Math.sin(i*.15)*.12;pts.push([x,f(x,z)+.014,z]);}path(pts,.04,true);path([[-.5,.031,.42],[.5,.031,.42]],.045);pavilion(-.16,-.21,f(-.16,-.21));g.userData.orchardAtFoot=true;
    }else if(p.model==='lake-pavilions'){
      water(0,.015,.90,.60);for(const [x,z] of [[-.32,-.23],[.33,.23]]){oval('#c1c9a4',x,.028,z,.13,.10);pavilion(x,z,.036);}
      path([[-.52,.04,-.39],[-.52,.04,.39],[.52,.04,.39],[.52,.04,-.39],[-.52,.04,-.39]],.05,true);path([[-.52,.06,-.23],[-.16,.06,-.23],[-.16,.06,.06],[.16,.06,.06],[.16,.06,.23],[.52,.06,.23]],.043,true);
      grove(0,-.44,.43,.015,34,'bamboo');grove(0,.44,.44,.013,28,'flowering');host(-.36,.36);g.userData.zigzagBridge=true;
    }else if(p.model==='canal-commercial-centre'){
      water(0,0,.20,.94);for(const s of [-1,1]){for(let i=0;i<3;i++)shop(s*.37,-.30+i*.28,['峡山茶铺','河岸书店','街角食堂'][i],i);path([[s*.16,.04,-.42],[s*.16,.04,.42]],.07,true);}
      for(const z of [-.14,.30])path([[-.16,.065,z],[.16,.065,z]],.068,true);edgeTrees();host(.20,.20,'wave');g.userData.commercialCanal=true;
    }else if(p.model==='hilltop-tower'){
      const f=(x,z)=>.016+.23*Math.exp(-((x+.19)**2+(z+.15)**2)/.06);terrain(f);const y=f(-.19,-.15);for(let i=0;i<4;i++){mesh(g,new THREE.CylinderGeometry(.065-i*.007,.068-i*.007,.055,8),'#cbc8ae',-.19,y+.027+i*.064,-.15);mesh(g,new THREE.CylinderGeometry(.079-i*.007,.085-i*.007,.012,8),'#56867c',-.19,y+.059+i*.064,-.15);}mesh(g,new THREE.ConeGeometry(.044,.06,8),'#56867c',-.19,y+.29,-.15);
      hall(g,.35,.026,.1,.20,.22,.13);grove(-.4,-.18,.15,.2,45,'pine',f);grove(.25,-.28,.15,.1,26,'broadleaf',f);const pts=[];for(let i=0;i<42;i++){const x=-.15+Math.sin(i*.15)*.15,z=.39-i*.012;pts.push([x,f(x,z)+.013,z]);}path(pts,.038,true);path([[-.48,.034,.41],[.50,.034,.41]],.05);g.userData.towerLevels=4;
    }else if(p.model==='riverside-workshops'){
      water(0,.30,1.20,.28);for(let i=0;i<4;i++){const x=-.42+i*.28;hall(g,x,.02,-.29,.23,.17,.13);box(g,'#a18e6f',x,.022,-.105,.14,.036,.045);for(let j=0;j<3;j++)box(g,j%2?'#80a7a0':'#d1b478',x-.045+j*.045,.059,-.105,.034,.026,.032);}
      path([[-.53,.04,.105],[.53,.04,.105]],.07,true);path([[-.53,.032,-.17],[.53,.032,-.17]],.042);for(const x of [-.26,.26])path([[x,.032,-.17],[x,.04,.105]],.043);grove(0,-.43,.47,.021,30);tea(.37,.10);g.userData.workshops=4;
    }else if(p.model==='tea-mountain-village'){
      const f=(x,z)=>.017+.17*Math.exp(-((x-.1)**2+(z+.25)**2)/.16);terrain(f);for(let row=0;row<6;row++)for(let j=0;j<15;j++){const x=-.44+j*.063,z=-.40+row*.055;box(g,'#69905f',x,f(x,z),z,.046,.024,.022);}
      for(const x of [-.37,0,.37])hall(g,x,.024,.18,.23,.16,.12);path([[-.52,.033,.39],[.52,.033,.39]],.055);const pts=[];for(let i=0;i<32;i++){const x=-.52,z=.36-i*.025;pts.push([x,f(x,z)+.013,z]);}path(pts,.037,true);grove(.56,-.14,.018,.25,30,'pine',f);tea(.16,.34);g.userData.teaRows=6;
    }else if(p.model==='garden-market-town'){
      for(let i=0;i<4;i++)shop(-.42+i*.28,-.29,['仙城菜市','乡村茶馆','手作铺','米粿小铺'][i],i);oval('#7baea2',.30,.015,.20,.15,.11);grove(.3,.20,.065,.035,7,'flowering');
      for(let i=0;i<3;i++){const x=-.35+i*.18;box(g,'#a98c62',x,.022,.09,.12,.036,.06);for(let j=0;j<5;j++)disc(g,j%2?'#d0a264':'#83a15d',x-.04+j*.02,.059,.09,.008,.008);}
      loop(.52,.39);path([[-.52,.032,-.14],[.52,.032,-.14]],.06);path([[-.52,.032,.23],[.08,.032,.23],[.08,.032,-.14]],.05);edgeTrees();host(-.22,.15);g.userData.marketStalls=3;
    }else if(p.model==='lychee-village'){
      orchard(-.49,-.36,4,6);for(const z of [-.27,.02,.29])hall(g,.34,.023,z,.26,.18,.13);path([[.08,.032,-.42],[.08,.032,.42]],.055);path([[-.52,.032,.15],[.52,.032,.15]],.045);
      path([[-.52,.032,.40],[.52,.032,.40]],.047);box(g,'#cabd95',-.26,.013,.29,.36,.01,.16);for(let i=0;i<6;i++)disc(g,'#a7815a',-.38+i%3*.115,.024,.26+Math.floor(i/3)*.08,.041,.008);host(-.17,.24);grove(.55,0,.018,.35,27);g.userData.fruitTrees=24;
    }else if(p.model==='river-greenway'){
      water(0,0,.35,.94);for(const s of [-1,1]){path([[s*.23,.04,-.43],[s*.23,.04,.43]],.064,true);grove(s*.33,0,.026,.38,30);for(let i=0;i<3;i++)hall(g,s*.48,.021,-.31+i*.29,.18,.18,.14);}
      const bridge=[];for(let i=0;i<=24;i++){const x=-.23+i*.46/24;bridge.push([x,.065+.04*Math.sin(i/24*Math.PI),.08]);}path(bridge,.06,true);path([[.23,.04,.32],[.11,.04,.32]],.075,true);host(.25,-.15,'wave');g.userData.continuousRiver=true;
    }else if(p.model==='reservoir-dam'){
      water(0,-.08,.81,.65);for(const s of [-1,1]){grove(s*.52,-.13,.065,.25,40,'pine');path([[s*.46,.045,-.42],[s*.46,.07,.22]],.037,true);}
      box(g,'#8daba3',0,.02,.26,.94,.085,.085);path([[-.50,.112,.26],[.50,.112,.26]],.06,true);for(const x of [-.16,0,.16])box(g,'#638b8c',x,.025,.305,.072,.063,.025);
      water(0,.40,.28,.14);hall(g,.37,.02,.41,.18,.10,.095);grove(0,-.44,.37,.013,28,'pine');host(-.29,.25,'look',.113);g.userData.damGates=3;
    }else if(p.model==='woodland-reservoir'){
      oval('#639ea3',-.03,.017,-.015,.36,.31);oval('#6aa8ac',.21,.018,.12,.22,.17);grove(-.46,-.03,.065,.30,45,'pine');grove(.20,-.34,.27,.08,50);grove(.47,.18,.047,.17,26,'bamboo');
      path([[-.52,.035,.39],[-.34,.035,.30],[.02,.035,.35],[.42,.035,.37],[.52,.035,.21]],.055,true);path([[-.52,.035,.39],[-.52,.035,-.38],[.40,.035,-.38]],.035,true);pavilion(-.32,.30,.04);host(.20,.36);g.userData.woodlandLake=true;
    }else if(p.model==='ancestral-compound'){
      box(g,'#c6cbb8',0,.012,0,1.03,.008,.85);hall(g,0,.022,-.28,.43,.18,.17);hall(g,0,.022,.30,.29,.12,.14,'姚氏宗祠');for(const s of [-1,1]){hall(g,s*.32,.022,-.04,.14,.38,.115);hall(g,s*.49,.022,.19,.12,.15,.105);}
      loop(.55,.40);path([[0,.033,-.15],[0,.033,.22]],.065);for(const z of [-.15,.22])path([[-.55,.033,z],[.55,.033,z]],.038);
      for(const x of [-.14,.14])for(const z of [-.03,.12])box(g,'#aeb8a0',x,.014,z,.08,.008,.08);for(let i=0;i<7;i++)mesh(g,new THREE.SphereGeometry(.006,6,4),i%2?'#7d9e9d':'#c28965',-.12+i*.04,.234,-.28);grove(0,-.44,.46,.015,28,'bamboo');host(.15,.22);g.userData.courtyardAxis=true;
    }
    if(!paths.length)throw new Error('Missing Chaonan scene: '+p.model);
    for(const pts of paths)routes.push(pts.map(a=>new THREE.Vector3(...a).multiplyScalar(p.displayScale).add(g.position)));
    addExhibitInfill({group:g,place:p,paths});
    obstacles.push(...settleExhibitHosts({group:g,actors:localActors,paths}));coverage.push({id:p.id,paths:paths.length,x:p.x,z:p.z,width:1.24*p.displayScale,depth:.98*p.displayScale,offset:p.displayOffset||0});
    for(const o of dynamic)g.remove(o);batchStatic(g);for(const o of dynamic)g.add(o);g.traverse(o=>{if(o.isMesh)o.userData.landmarkId=p.id;});models.push({id:p.id,type:p.model,group:g});
  }
  const streetLife=buildWalkwayCrowd({parent:group,preparedWalkways:routes,population:routes.length*8,obstacles});
  const update=t=>{streetLife.update(t);for(const fn of animations)fn(t);};update(0);
  return {group,models,streetLife,update,stats:{places:places.length,models:models.length,people:streetLife.count+actors.length,animations:animations.length,coverage}};
}
