import * as THREE from 'three';
import {box,disc,tree,sign,material,person} from './scene-miniatures.mjs';
import {batchStatic} from './static-batch.mjs';
import {addExhibitInfill} from './exhibit-infill.mjs';
import {buildWalkwayCrowd,settleExhibitHosts} from './walkway-crowds.mjs';
import {puningPlaces} from './puning-places.mjs';

export function buildPuningSights({parent,places=puningPlaces,heightAt,waterAt}){
  const group=new THREE.Group();group.name='puning-heritage-waterways-and-yingge';parent.add(group);
  const models=[],routes=[],actors=[],animations=[],coverage=[],obstacles=[],performers=[];
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

    const vessel=(x,z,{dragon=false,rx=0,rz=0,phase=0,covered=true}={})=>{
      const b=new THREE.Group();g.add(b);dynamic.push(b);b.userData.vessel=dragon?'dragonboat':'canopy-boat';
      const length=dragon?.29:.15,hull=mesh(b,new THREE.CylinderGeometry(.034,.024,.024,8),dragon?'#996b48':'#6d8682');hull.scale.z=length/.068;
      box(b,'#c99c6a',0,.014,0,.042,.006,length*.83);
      const paddles=[];
      if(dragon){
        for(const s of [-1,1]){beam(b,[0,.018,s*length*.43],[0,.048,s*length*.59],'#c59449',.007);}
        mesh(b,new THREE.SphereGeometry(.014,8,6),'#bb9b43',0,.047,length*.59);box(b,'#ac5f40',0,.050,length*.63,.013,.009,.026);
        for(let i=0;i<5;i++)for(const s of [-1,1]){
          const zz=-.105+i*.051;box(b,i%2?'#ad554b':'#dcbd75',s*.017,.022,zz,.017,.023,.017);mesh(b,new THREE.SphereGeometry(.008,6,5),'#d3b28b',s*.017,.053,zz);
          const paddle=new THREE.Group();paddle.position.set(s*.034,.043,zz);b.add(paddle);beam(paddle,[0,0,0],[s*.045,-.036,.012],'#98744f',.002);box(paddle,'#ae865a',s*.045,-.043,.012,.012,.02,.005);paddles.push(paddle);
        }
      }else if(covered){const canopy=mesh(b,new THREE.CylinderGeometry(.024,.024,.075,12,1,true,Math.PI/2,Math.PI),'#4e6867',0,.029,-.015);canopy.rotation.x=Math.PI/2;box(b,'#d2b78c',0,.025,.045,.018,.025,.019);}
      animations.push(t=>{const a=t*.12+phase;b.position.set(x+Math.cos(a)*rx,.034,z+Math.sin(a)*rz);b.rotation.y=rx||rz?Math.atan2(-Math.sin(a)*rx,Math.cos(a)*rz):0;b.rotation.z=Math.sin(t*1.1+phase)*.009;paddles.forEach((o,i)=>o.rotation.x=Math.sin(t*2.4+Math.floor(i/2)*.12)*.55);});
      return b;
    };
    const gate=(x,z,label,w=.24)=>{for(const s of [-1,1])box(g,'#b2bdaa',x+s*w*.43,.019,z,.024,.145,.037);roof(g,x,.165,z,w+.035,.073);sign(g,label,x,.133,z+.025,w*.75,.027);};
    const dancer=(x,z,row,col)=>{
      const d=new THREE.Group();d.userData.yinggeDancer=true;g.add(d);dynamic.push(d);performers.push(d);
      box(d,col%2?'#354b58':'#923f40',0,.019,0,.021,.026,.014);box(d,'#e1b861',0,.021,.008,.023,.007,.003);
      mesh(d,new THREE.SphereGeometry(.011,8,6),'#eee5cd',0,.057,0);
      for(const s of [-1,1]){box(d,'#384c55',s*.004,.057,.010,.003,.003,.002);box(d,col%2?'#a6423c':'#344b5e',s*.007,.052,.009,.004,.011,.002);}
      box(d,'#384651',0,.067,0,.024,.008,.016);const arms=[],legs=[];
      for(const s of [-1,1]){
        const arm=new THREE.Group();arm.position.set(s*.014,.041,0);d.add(arm);box(arm,'#ceaa7c',0,-.019,0,.006,.020,.006);box(arm,'#bc9860',0,-.022,.008,.006,.006,.037);arms.push(arm);
        const leg=new THREE.Group();leg.position.set(s*.007,.021,0);d.add(leg);box(leg,'#334a52',0,-.019,0,.007,.019,.008);box(leg,'#344451',0,-.021,.002,.009,.004,.014);legs.push(leg);
      }
      animations.push(t=>{const beat=t*3.2+row*.12,a=Math.sin(beat),b=Math.cos(beat);d.position.set(x+Math.sin(t*.5)*.006,.032+Math.max(0,a)*.003,z+Math.sin(beat)*.008);d.rotation.y=Math.sin(t*.8+row)*.14;arms[0].rotation.x=-.8+a*.8;arms[1].rotation.x=-.8-a*.8;arms[0].rotation.z=-.55+b*.35;arms[1].rotation.z=.55-b*.35;legs[0].rotation.x=a*.35;legs[1].rotation.x=-a*.35;});
      return d;
    };

    if(p.model==='linked-mansion-courts'){
      water(0,-.405,1.14,.085);water(-.565,0,.055,.84);water(.565,0,.055,.84);
      box(g,'#c8cdb8',0,.013,0,1.03,.009,.76);
      for(const cx of [-.33,0,.33]){
        hall(g,cx,.023,-.25,.25,.13,.14);hall(g,cx,.023,.17,.25,.10,.105);
        for(const s of [-1,1])hall(g,cx+s*.108,.023,-.035,.067,.23,.105);
        path([[cx,.033,-.16],[cx,.033,.10]],.032);disc(g,'#9aa987',cx-.045,.024,-.03,.018,.023);
      }
      loop(.51,.34);path([[-.51,.033,.09],[.51,.033,.09]],.035);grove(0,.43,.47,.012,28,'broadleaf');sign(g,'德安里',0,.106,.229,.16,.027);host(-.19,.28);g.userData.linkedCompounds=3;
    }else if(p.model==='academy-and-pond'){
      box(g,'#c4cdb9',0,.012,0,1.05,.009,.86);hall(g,0,.024,-.29,.43,.15,.17);
      for(const s of [-1,1])hall(g,s*.34,.024,-.08,.13,.29,.115);
      oval('#6d9e9e',0,.024,.13,.21,.11);path([[0,.063,.29],[0,.063,-.07]],.055,true);gate(0,.34,'普宁学宫');
      loop(.49,.39);path([[-.49,.033,-.15],[.49,.033,-.15]],.038);edgeTrees();host(.25,.22);g.userData.academyPond=true;
    }else if(p.model==='scholar-residence'){
      hall(g,0,.025,-.27,.43,.18,.16,'文昌阁');for(const s of [-1,1])hall(g,s*.35,.025,-.015,.14,.34,.12);
      box(g,'#c5ccba',0,.013,.08,.48,.008,.47);for(const x of [-.13,.13]){box(g,'#a18768',x,.022,.035,.14,.039,.06);box(g,'#e8e2ca',x,.062,.035,.09,.003,.038);}
      loop(.50,.38);path([[-.5,.033,.22],[.5,.033,.22]],.055);grove(0,-.43,.43,.02,27,'bamboo');tea(.27,.33);g.userData.scholarTables=2;
    }else if(p.model==='heritage-cross-streets'){
      box(g,'#c1cbbc',0,.013,0,1.10,.009,.88);
      for(const s of [-1,1])for(let i=0;i<3;i++)shop(s*.33,-.28+i*.28,['洪阳茶铺','古镇书局','粿品小铺'][i],i);
      path([[0,.033,-.43],[0,.033,.43]],.085);path([[-.53,.033,.14],[.53,.033,.14]],.05);path([[-.53,.033,-.14],[.53,.033,-.14]],.05);
      tree(g,0,.015,.34,.13,'broadleaf');edgeTrees();host(.12,.22,'wave');g.userData.crossStreets=true;
    }else if(p.model==='canals-and-dragonboat'){
      water(0,0,.45,.94);water(0,.06,1.2,.19);
      for(const s of [-1,1]){
        for(const z of [-.29,.31]){hall(g,s*.42,.024,z,.24,.18,.135);tree(g,s*.55,.017,z+s*.09,.085,'broadleaf');}
        path([[s*.29,.04,-.41],[s*.29,.106,-.06]],.053,true);path([[s*.29,.106,.18],[s*.29,.04,.43]],.053,true);
      }
      for(const z of [-.06,.18])path([[-.52,.04,z],[-.24,.12,z],[.24,.12,z],[.52,.04,z]],.044,true);
      vessel(-.105,-.25,{covered:true,rz:.035});vessel(.10,.255,{dragon:true,rz:.006});
      host(-.33,.26);g.userData.dragonboat=true;g.userData.connectedChannels=true;
    }else if(p.model==='waterbus-wharf'){
      water(0,.10,1.20,.72);hall(g,-.23,.024,-.33,.44,.15,.125,'大港码头');pavilion(.32,-.32);
      path([[-.53,.053,-.18],[.53,.053,-.18]],.073,true);
      for(const x of [-.37,.04,.39])path([[x,.053,-.18],[x,.053,.27]],.047,true);
      vessel(-.25,.06,{phase:1});vessel(.17,.05,{phase:3});vessel(.17,.29,{covered:false,phase:4});
      for(const x of [-.38,-.23,-.08])box(g,'#a58e65',x,.022,-.22,.09,.02,.025);
      grove(0,-.44,.46,.013,28);host(.30,-.19);g.userData.separateBerths=3;
    }else if(p.model==='terraced-spa-gardens'){
      hall(g,0,.023,-.30,.57,.18,.16,'盘龙湾');for(const s of [-1,1])hall(g,s*.42,.023,-.14,.16,.14,.11);
      const pools=[[-.27,.06,.11,.078],[.16,.02,.13,.085],[-.11,.29,.13,.08],[.33,.28,.08,.055]];
      for(const [x,z,rx,rz] of pools){oval('#b3b59f',x,.014,z,rx+.019,rz+.019);oval('#73b1b1',x,.023,z,rx,rz);for(let i=0;i<3;i++){const pts=[];for(let k=0;k<16;k++)pts.push(new THREE.Vector3(x+(i-1)*.028+Math.sin(k*.4)*.006,.03+k*.004,z));const steam=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:'#eef3e6',transparent:true,opacity:.25}));g.add(steam);dynamic.push(steam);animations.push(t=>{steam.position.y=(Math.sin(t*.6+i)+1)*.008;});}}
      loop(.52,.40);path([[-.52,.033,-.065],[.52,.033,-.065]],.045);path([[-.52,.033,.18],[.52,.033,.18]],.034);edgeTrees();host(.39,-.05);g.userData.hotPools=4;
    }else if(p.model==='orchards-and-farmwalks'){
      const f=(x,z)=>.015+.16*Math.exp(-((x+.16)**2+(z+.24)**2)/.14);terrain(f);
      for(let row=0;row<6;row++){const z=-.38+row*.06;for(let i=0;i<10;i++){const x=-.46+i*.058;box(g,'#72925f',x,f(x,z),z,.042,.018,.025);}}
      for(let i=0;i<4;i++){const x=.24+i%2*.17,z=-.26+Math.floor(i/2)*.22;tree(g,x,f(x,z),z,.1,'broadleaf');}
      box(g,'#89b6af',-.28,.02,.24,.37,.10,.20);roof(g,-.28,.12,.24,.39,.22);
      hall(g,.31,.024,.25,.30,.17,.12,'农产小站');
      path([[-.54,.033,.40],[.54,.033,.40]],.052);const pts=[];for(let i=0;i<32;i++){const z=.38-i*.025;pts.push([.10,f(.10,z)+.014,z]);}path(pts,.041,true);grove(-.56,-.17,.016,.22,27,'pine',f);host(.4,.35);g.userData.terraceRows=6;
    }else if(p.model==='riverside-ancestral-village'){
      water(0,.32,1.20,.25);hall(g,0,.024,-.29,.36,.16,.15,'新溪古村');
      for(const s of [-1,1]){hall(g,s*.36,.024,-.22,.21,.16,.12);hall(g,s*.36,.024,.01,.21,.15,.13);path([[s*.17,.034,-.39],[s*.17,.04,.16]],.045);}
      path([[-.54,.04,.16],[.54,.04,.16]],.068,true);grove(0,-.43,.48,.016,26,'broadleaf');tea(.31,.16);vessel(0,.32,{rx:.27,rz:0,covered:false});g.userData.riversideVillage=true;
    }else if(p.model==='village-culture-terraces'){
      hall(g,-.23,.024,-.27,.48,.19,.14,'登峰乡村文化');pavilion(.35,-.25);
      box(g,'#b8c3aa',-.27,.014,.12,.34,.012,.26);box(g,'#a18768',-.27,.027,.04,.27,.025,.13);roof(g,-.27,.15,.04,.29,.15);
      for(let i=0;i<5;i++){const z=-.04+i*.08;box(g,i%2?'#a8bb79':'#83a56a',.29,.013+i*.005,z,.32,.018,.065);for(let j=0;j<6;j++)box(g,'#648b57',.17+j*.044,.035+i*.005,z,.015,.014,.05);}
      loop(.53,.40);path([[0,.034,-.39],[0,.034,.40]],.051);edgeTrees();host(-.28,.23);g.userData.ruralStage=true;
    }else if(p.model==='historic-command-courtyard'){
      hall(g,0,.024,-.29,.45,.16,.16,'八一馆');for(const s of [-1,1])hall(g,s*.35,.024,-.06,.15,.30,.12);
      box(g,'#c6ccba',0,.012,.08,.47,.009,.47);box(g,'#a78969',0,.024,-.06,.24,.034,.075);
      for(let i=0;i<5;i++){box(g,'#eee5cb',-.084+i*.042,.059,-.06,.031,.002,.038);box(g,'#ab9473',-.084+i*.042,.022,.025,.027,.026,.024);}
      loop(.50,.39);path([[-.50,.034,.24],[.50,.034,.24]],.058);for(const x of [-.2,0,.2]){box(g,'#93a48d',x,.022,.17,.12,.075,.015);host(x,.28);}
      grove(0,-.43,.45,.017,29,'pine');edgeTrees();g.userData.historyExhibits=3;
    }else if(p.model==='yingge-training-ground'){
      box(g,'#bec9b5',0,.013,0,1.06,.009,.85);hall(g,0,.024,-.31,.54,.16,.16,'南山英歌传承基地');
      box(g,'#c8b99e',0,.023,.055,.72,.005,.47);
      for(let row=0;row<4;row++)for(let col=0;col<6;col++)dancer(-.275+col*.11,-.11+row*.105,row,col);
      const drum=new THREE.Group();g.add(drum);dynamic.push(drum);drum.position.set(.41,.04,-.21);disc(drum,'#ab6450',0,0,0,.029,.032);disc(drum,'#dbc399',0,.033,0,.030,.003);
      loop(.51,.395);path([[-.51,.034,-.21],[.51,.034,-.21]],.035);grove(-.56,0,.015,.34,26);grove(.56,0,.015,.34,26,'bamboo');
      for(const x of [-.31,-.1,.1,.31])host(x,.35,'look');g.userData.formation=[4,6];g.userData.danceGround=[-.36,.36,-.18,.29];
    }else if(p.model==='mountain-stream-valley'){
      const f=(x,z)=>.018+.29*Math.exp(-((x+.30)**2+(z+.18)**2)/.055)+.24*Math.exp(-((x-.31)**2+(z+.22)**2)/.05);terrain(f);
      grove(-.35,-.18,.18,.22,65,'pine',f);grove(.34,-.20,.17,.20,58,'broadleaf',f);grove(-.36,.25,.14,.11,35,'bamboo',f);grove(.37,.25,.13,.11,30,'broadleaf',f);
      const pts=[];for(let i=0;i<44;i++){const z=.4-i*.019,x=-.11+Math.sin(i*.14)*.025;pts.push([x,f(x,z)+.014,z]);}path(pts,.036,true);
      for(let i=0;i<35;i++){const z=-.41+i*.024,x=.07+Math.sin(i*.13)*.014;box(g,'#71acaa',x,f(x,z)+.002,z,.045,.008,.026);}
      path([[-.11,f(-.11,.2)+.045,.2],[.14,f(.14,.2)+.045,.2]],.035,true);pavilion(-.12,-.36,f(-.12,-.36)+.013);g.userData.streamValley=true;
    }else if(p.model==='civic-pond-park'){
      oval('#70a7a4',-.15,.017,-.06,.26,.23);pavilion(-.33,-.26);
      const pts=[];for(let i=0;i<=40;i++){const a=i/40*Math.PI*2;pts.push([-.12+Math.cos(a)*.38,.033,-.015+Math.sin(a)*.33]);}path(pts,.045);
      path([[.20,.034,.16],[.46,.034,.16],[.46,.034,-.33]],.05);grove(.4,-.21,.085,.1,22);grove(-.5,0,.04,.3,33);grove(.07,.4,.30,.018,23,'flowering');tea(.33,.31);host(.35,-.32,'wave');g.userData.ovalParkLoop=true;
    }else if(p.model==='city-fountain-square'){
      box(g,'#c6ccbc',0,.013,0,1.07,.009,.86);oval('#aebcaa',0,.023,-.03,.17,.15);oval('#75b1ae',0,.03,-.03,.14,.12);
      for(let i=0;i<9;i++){const a=i/9*Math.PI*2;const jet=mesh(g,new THREE.CylinderGeometry(.002,.004,.09,5),'#c0e3dc',Math.cos(a)*.095,.076,-.03+Math.sin(a)*.082);dynamic.push(jet);animations.push(t=>{jet.scale.y=.7+Math.sin(t*1.6+i)*.25;jet.position.y=.034+.045*jet.scale.y;});}
      loop(.50,.38);for(const z of [-.24,.20])path([[-.50,.034,z],[.50,.034,z]],.055);
      for(const x of [-.37,.37]){shop(x,-.28,x<0?'广场书店':'街角咖啡',1);for(let i=0;i<3;i++)oval('#94ad7b',x,.018,.04+i*.1,.065,.031);}
      grove(0,.44,.45,.013,29,'broadleaf');host(.19,.21,'wave');g.userData.fountainJets=9;
    }else if(p.model==='trade-market-arcades'){
      box(g,'#c4cbbb',0,.013,0,1.10,.009,.87);
      for(const s of [-1,1])for(let i=0;i<3;i++){const x=s*.32,z=-.29+i*.28;box(g,'#cdd6c7',x,.023,z,.28,.15,.19);box(g,'#629995',x,.158,z,.30,.024,.21);box(g,'#86b5b1',x,.055,z+.098,.23,.081,.007);sign(g,['服饰展厅','商贸服务','生活集市'][i],x,.141,z+.11,.23,.025);for(let j=0;j<3;j++)box(g,['#b96762','#d6b874','#5b858e'][j],x-.08+j*.08,.025,z+.135,.027,.039,.013);}
      path([[0,.034,-.43],[0,.034,.43]],.09);for(const z of [-.15,.14])path([[-.52,.034,z],[.52,.034,z]],.043);
      edgeTrees();host(.09,.30);g.userData.tradeHalls=6;
    }else if(p.model==='rail-station-platforms'){
      for(const z of [-.37,-.27]){box(g,'#7c8b83',0,.017,z,1.18,.012,.054);for(let i=0;i<30;i++)box(g,'#64736e',-.57+i*.039,.029,z,.008,.004,.05);for(const s of [-1,1])box(g,'#b4c0b8',0,.034,z+s*.016,1.18,.004,.003);}
      box(g,'#b3c1b1',0,.017,-.17,1.15,.027,.1);path([[-.52,.056,-.17],[.52,.056,-.17]],.041);
      box(g,'#d3d9cc',0,.025,.01,.69,.17,.24);box(g,'#80afa9',0,.038,.134,.56,.12,.009);box(g,'#628b90',0,.195,.01,.79,.019,.29);sign(g,'普宁站',0,.165,.152,.24,.034);
      for(const x of [-.46,.46])path([[x,.034,.40],[x,.034,.16],[x,.056,-.17]],.058,true);path([[-.46,.034,.36],[.46,.034,.36]],.07);
      const train=new THREE.Group();train.userData.train=true;g.add(train);dynamic.push(train);const doors=[];
      for(let i=0;i<3;i++){const x=(i-1)*.18;box(train,'#e2e7d8',x,0,0,.165,.042,.041);box(train,'#62999f',x,.016,.022,.138,.014,.004);for(const s of [-1,1]){const door=box(train,'#99b8b2',x+s*.059,.003,.024,.020,.031,.003);doors.push({door,x:x+s*.059,s});}}
      animations.push(t=>{const q=t%40;const x=q<7?-.30+.30*(1-Math.cos(q/7*Math.PI))/2:q<13?0:q<20?.30*(1-Math.cos((q-13)/7*Math.PI))/2:q<23?.30:q<37?.30-.60*(1-Math.cos((q-23)/14*Math.PI))/2:-.30;train.position.set(x,.04,-.27);doors.forEach(({door,x,s})=>door.position.x=x+(q>=8&&q<=12?s*.009:0));});
      grove(0,.44,.46,.015,30);host(.3,.30,'look');g.userData.railPlatforms=1;
    }else if(p.model==='riverfront-neighborhood'){
      water(0,0,.29,.94);for(const s of [-1,1]){path([[s*.205,.04,-.42],[s*.205,.04,.42]],.055,true);for(let i=0;i<3;i++)hall(g,s*.41,.024,-.29+i*.28,.24,.17,.145+i%2*.025);grove(s*.56,0,.014,.34,28,'broadleaf');}
      path([[-.205,.064,-.11],[.205,.064,-.11]],.058,true);path([[-.205,.064,.28],[.205,.064,.28]],.049,true);vessel(0,.08,{rz:.06,covered:false});host(.24,.1,'wave');g.userData.riverBridges=2;
    }else if(p.model==='village-library-courts'){
      hall(g,0,.024,-.29,.40,.17,.155,'泥沟古村');for(const s of [-1,1])hall(g,s*.35,.024,-.045,.16,.32,.115);
      oval('#7fab9f',-.26,.018,.28,.16,.075);hall(g,.30,.024,.27,.23,.13,.105,'乡村书屋');
      path([[0,.034,-.17],[0,.034,.42]],.06);loop(.51,.40);path([[-.51,.034,.11],[.51,.034,.11]],.045);grove(0,-.43,.46,.014,29,'bamboo');tea(-.18,.10);g.userData.villageLibrary=true;
    }else if(p.model==='seven-storey-earth-pagoda'){
      oval('#c5cab3',0,.013,0,.32,.30);
      for(let i=0;i<7;i++){const y=.024+i*.066,r=.117-i*.008;mesh(g,new THREE.CylinderGeometry(r,r+.004,.056,8),'#b5b19b',0,y+.028,0).rotation.y=Math.PI/8;mesh(g,new THREE.CylinderGeometry(r+.011,r+.014,.009,8),'#909b87',0,y+.056,0).rotation.y=Math.PI/8;
        for(let k=0;k<8;k++){const a=k*Math.PI/4;const win=box(g,'#5a7165',Math.sin(a)*r*.93,y+.016,Math.cos(a)*r*.93,.020,.026,.003);win.rotation.y=a;}}
      mesh(g,new THREE.ConeGeometry(.045,.065,8),'#82917c',0,.51,0);
      const pts=[];for(let i=0;i<=40;i++){const a=i/40*Math.PI*2;pts.push([Math.cos(a)*.27,.033,Math.sin(a)*.27]);}path(pts,.05);path([[0,.033,.27],[0,.033,.43]],.06);
      grove(-.46,-.02,.083,.29,45,'pine');grove(.46,-.04,.079,.29,40,'broadleaf');grove(0,-.41,.34,.024,30);host(.17,.26);g.userData.towerLevels=7;g.userData.towerSides=8;
    }
    if(!paths.length)throw new Error('Missing Puning scene: '+p.model);
    for(const pts of paths)routes.push(pts.map(a=>new THREE.Vector3(...a).multiplyScalar(p.displayScale).add(g.position)));
    addExhibitInfill({group:g,place:p,paths});
    obstacles.push(...settleExhibitHosts({group:g,actors:localActors,paths}));coverage.push({id:p.id,paths:paths.length,x:p.x,z:p.z,width:1.24*p.displayScale,depth:.98*p.displayScale,offset:p.displayOffset||0});
    for(const o of dynamic)g.remove(o);batchStatic(g);for(const o of dynamic)g.add(o);g.traverse(o=>{if(o.isMesh)o.userData.landmarkId=p.id;});models.push({id:p.id,type:p.model,group:g});
  }
  const streetLife=buildWalkwayCrowd({parent:group,preparedWalkways:routes,population:routes.length*8,obstacles});
  const update=t=>{streetLife.update(t);for(const fn of animations)fn(t);};update(0);
  return {group,models,streetLife,update,stats:{places:places.length,models:models.length,people:streetLife.count+actors.length+performers.length,animations:animations.length,coverage}};
}
