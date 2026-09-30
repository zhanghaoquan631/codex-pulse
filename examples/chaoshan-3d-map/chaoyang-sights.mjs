import * as THREE from 'three';
import {box,disc,tree,sign,material,person} from './scene-miniatures.mjs';
import {batchStatic} from './static-batch.mjs';
import {addExhibitInfill} from './exhibit-infill.mjs';
import {buildWalkwayCrowd,settleExhibitHosts} from './walkway-crowds.mjs';
import {chaoyangPlaces} from './chaoyang-places.mjs';

export function buildChaoyangSights({parent,places=chaoyangPlaces,heightAt,waterAt}){
  const group=new THREE.Group();group.name='chaoyang-old-city-mountains-and-coast';parent.add(group);
  const models=[],routes=[],actors=[],animations=[],coverage=[],obstacles=[];
  const mesh=(g,geo,c,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geo,material(c));m.position.set(x,y,z);g.add(m);return m;};
  const oval=(g,c,x,y,z,rx,rz)=>{const m=disc(g,c,x,y,z,1,.006);m.scale.set(rx,1,rz);return m;};
  const beam=(g,a,b,c='#8c9984',r=.004)=>{const start=new THREE.Vector3(...a),v=new THREE.Vector3(...b).sub(start);const m=mesh(g,new THREE.CylinderGeometry(r,r,v.length(),6),c);m.position.copy(start).addScaledVector(v,.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return m;};
  const roof=(g,x,y,z,w,d)=>{
    const vertices=[];for(const s of [-1,1])for(const v of [[-w/2,0,s*d/2],[-w/2,.035,0],[w/2,0,s*d/2],[w/2,0,s*d/2],[-w/2,.035,0],[w/2,.035,0]])vertices.push(...v);
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#48675d',side:THREE.DoubleSide}));m.position.set(x,y,z);g.add(m);
    box(g,'#ba7d65',x,y+.035,z,w,.007,.01);for(const s of [-1,1])beam(g,[x+s*w/2,y+.039,z],[x+s*(w/2+.015),y+.055,z],'#bb8567');
  };
  const hall=(g,x,y,z,w=.25,d=.15,h=.14,arcade=false)=>{
    box(g,'#d8d8c4',x,y,z,w,h,d);roof(g,x,y+h,z,w+.022,d+.027);
    const front=z+d/2+.005;box(g,'#805b47',x,y,front,.036,h*.55,.007);
    for(const s of [-1,1]){box(g,'#729c96',x+s*w*.29,y+h*.30,front,w*.17,h*.32,.006);box(g,'#eee4c8',x+s*w*.29,y+h*.30,front+.004,.003,h*.32,.004);}
    if(arcade)for(let i=0;i<4;i++){const xx=x-w*.39+i*w*.26;beam(g,[xx,y,front+.025],[xx,y+h,front+.025],'#eee7d0',.004);if(i<3)mesh(g,new THREE.TorusGeometry(w*.13,.003,4,12,Math.PI),'#eee7d0',xx+w*.13,y+h-.023,front+.025);}
    else for(const s of [-1,1])beam(g,[x+s*w*.43,y,front+.018],[x+s*w*.43,y+h,front+.018],'#a9715c',.004);
  };
  for(const [index,p] of places.entries()){
    const g=new THREE.Group();g.name=p.id;g.scale.setScalar(p.displayScale);group.add(g);
    const heights=[];for(let i=0;i<=12;i++)for(let j=0;j<=10;j++)heights.push(heightAt(p.x+(-.62+i*.103)*p.displayScale,p.z+(-.5+j*.1)*p.displayScale));
    const ground=Math.max(...heights,waterAt(p.x,p.z)??-Infinity)+.025,depth=Math.max(.03,(ground-Math.min(...heights))/p.displayScale);
    g.position.set(p.x,ground,p.z);p.sceneY=ground;box(g,'#8fa68e',0,-depth,0,1.24,depth,.98);box(g,'#a3b892',0,0,0,1.22,.01,.96);
    const paths=[],dynamic=[],localActors=[];
    const path=(pts,width=.045,rail=false)=>{
      paths.push(pts);for(let i=1;i<pts.length;i++){
        const a=new THREE.Vector3(...pts[i-1]),b=new THREE.Vector3(...pts[i]),v=b.clone().sub(a),len=v.length();if(len<1e-6)continue;
        const m=box(g,'#c8cebb',0,0,0,width,.008,len);m.position.copy(a).add(b).multiplyScalar(.5);m.position.y-=.004;m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),v.clone().normalize());
        if(rail){const norm=Math.hypot(v.x,v.z);for(const s of [-1,1]){const dx=v.z/norm*width*.59*s,dz=-v.x/norm*width*.59*s;beam(g,[a.x+dx,a.y+.026,a.z+dz],[b.x+dx,b.y+.026,b.z+dz]);for(let j=0;j<=Math.ceil(len/.065);j++){const q=a.clone().lerp(b,j/Math.ceil(len/.065));beam(g,[q.x+dx,q.y,q.z+dz],[q.x+dx,q.y+.026,q.z+dz]);}}}
      }return pts;
    };
    const loop=(rx=.49,rz=.37,y=.029)=>path([[-rx,y,rz],[-rx,y,-rz],[rx,y,-rz],[rx,y,rz],[-rx,y,rz]]);
    const host=(x,z,state='look',y=.03)=>{const a=person(g,index+actors.length,{scale:.015});a.root.position.set(x,y,z);a.pose(0,state);actors.push(a);localActors.push(a);dynamic.push(a.root);animations.push(t=>a.pose(t*.4,state==='wave'?(Math.sin(t*.3+index)>.94?'wave':'look'):state));return a;};
    const rock=(x,z,r=.055,y=.018,h=1)=>{const m=mesh(g,new THREE.DodecahedronGeometry(r,0),'#aab09b',x,y+r*h*.60,z);m.scale.set(1,h,.82);m.rotation.y=x*9+z*13;return m;};
    const grove=(cx,cz,rx,rz,count=24,type='broadleaf',surface=()=>.017)=>{for(let i=0;i<count;i++){const a=i*2.399,r=Math.sqrt((i+.5)/count),x=cx+Math.cos(a)*rx*r,z=cz+Math.sin(a)*rz*r;tree(g,x,surface(x,z),z,.046+i%5*.01,type);}};
    const garden=()=>{grove(-.55,0,.024,.35,22);grove(.55,0,.024,.35,22,'palm');};
    const pavilion=(x,z,y=.022)=>{for(const sx of [-1,1])for(const sz of [-1,1])beam(g,[x+sx*.047,y,z+sz*.035],[x+sx*.047,y+.11,z+sz*.035],'#a17b61',.005);roof(g,x,y+.11,z,.15,.12);};
    const tea=(x,z)=>{disc(g,'#ac8764',x,.027,z,.034,.023);disc(g,'#a96e50',x,.052,z-.01,.009,.013);for(let i=0;i<3;i++)disc(g,'#ede5cc',x-.02+i*.02,.052,z+.01,.005,.006);host(x-.055,z,'sit');host(x+.055,z,'sit');};
    const ripples=(cx,cz,w,d)=>{for(let j=0;j<3;j++){const pts=[];for(let k=0;k<25;k++)pts.push(new THREE.Vector3(cx-w*.43+k*w*.86/24,.026,cz+(j-1)*d*.24+Math.sin(k*.5)*.006));const m=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:'#c2e4dc',opacity:.44,transparent:true}));g.add(m);dynamic.push(m);animations.push(t=>m.position.z=Math.sin(t*.65+j)*.005);}};
    const water=(x,z,w,d)=>{box(g,'#599ca6',x,.014,z,w,.007,d);ripples(x,z,w,d);};
    const boat=(x,z,rx=0,rz=0,phase=0)=>{
      const b=new THREE.Group();b.userData.vessel=true;g.add(b);dynamic.push(b);const hull=mesh(b,new THREE.CylinderGeometry(.029,.019,.026,6),'#527c83');hull.scale.z=2;box(b,'#d2a471',0,.014,0,.04,.006,.085);box(b,'#ece2cc',0,.02,-.016,.035,.028,.036);beam(b,[0,.04,.012],[0,.10,.012],'#a17c54',.002);
      animations.push(t=>{const a=t*.12+phase;b.position.set(x+Math.cos(a)*rx,.034,z+Math.sin(a)*rz);b.rotation.y=rx||rz?Math.atan2(-Math.sin(a)*rx,Math.cos(a)*rz):0;b.rotation.z=Math.sin(t*1.2+phase)*.012;});return b;
    };
    const gate=(x,z,label,w=.22)=>{for(const s of [-1,1])box(g,'#b5bda8',x+s*w*.42,.02,z,.026,.15,.046);roof(g,x,.173,z,w+.05,.09);sign(g,label,x,.146,z+.027,w*.81,.03);};
    const terrain=(surface)=>{const geo=new THREE.PlaneGeometry(1.2,.94,36,30);geo.rotateX(-Math.PI/2);const pos=geo.attributes.position,colors=[];for(let i=0;i<pos.count;i++){const y=surface(pos.getX(i),pos.getZ(i));pos.setY(i,y);const c=new THREE.Color(y>.24?'#95a884':y>.1?'#77996d':'#a3b68d');colors.push(c.r,c.g,c.b);}geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();g.add(new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true})));};
    const statue=(x,z,scale=1)=>{
      const s=new THREE.Group();s.position.set(x,.02,z);s.scale.setScalar(scale);g.add(s);s.userData.monument=true;
      for(let i=0;i<6;i++){const a=i*Math.PI/3,m=mesh(s,new THREE.DodecahedronGeometry(.065,0),'#a9aea0',Math.cos(a)*.052,.035,Math.sin(a)*.045);m.scale.y=1.1;}
      mesh(s,new THREE.CylinderGeometry(.046,.082,.21,9),'#bfc1ae',0,.17,0);mesh(s,new THREE.SphereGeometry(.033,8,6),'#bec0ae',0,.324,0);
      box(s,'#a9ac9a',0,.349,0,.073,.021,.043);box(s,'#a9ac9a',0,.357,-.01,.05,.028,.039);
      beam(s,[-.045,.259,0],[-.025,.223,.048],'#bdc0ad',.018);beam(s,[.043,.259,0],[.004,.227,.05],'#bdc0ad',.019);
      for(const dx of [-.032,0,.032])beam(s,[dx,.263,.041],[dx*1.7,.067,.071],'#a8ae9d',.002);
      mesh(s,new THREE.ConeGeometry(.012,.035,5),'#a2a997',0,.279,.024).rotation.x=.22;sign(s,'文天祥',0,.055,.094,.105,.025,'#807d69');return s;
    };
    g.userData.program=p.model;
    if(p.model==='lotus-coast'){
      water(0,.24,1.2,.45);oval(g,'#d2c8a7',-.08,.025,-.055,.52,.23);
      for(let i=0;i<9;i++){const a=i/9*Math.PI*2,m=rock(-.08+Math.cos(a)*.11,-.12+Math.sin(a)*.09,.058,.026,2.0+(i%3)*.3);m.rotation.z=Math.cos(a)*.32;m.rotation.x=Math.sin(a)*.32;}
      rock(-.08,-.12,.055,.09,3.1);path([[-.52,.04,-.08],[-.32,.04,-.27],[.20,.04,-.29],[.42,.04,-.12],[.49,.04,.06]],.05,true);
      grove(-.16,-.39,.36,.026,26,'pine');pavilion(.36,-.33);boat(.05,.31,.28,.045);host(.24,-.29);g.userData.petalRocks=9;
    }else if(p.model==='octagonal-pagoda'){
      box(g,'#c8cbb9',0,.012,0,.77,.009,.70);const base=mesh(g,new THREE.CylinderGeometry(.145,.156,.027,8),'#a8af9b',0,.033,0);base.rotation.y=Math.PI/8;
      for(let level=0;level<7;level++){
        const y=.047+level*.063,r=.105-level*.006;mesh(g,new THREE.CylinderGeometry(r,r+.005,.052,8),'#c4bea7',0,y+.026,0).rotation.y=Math.PI/8;
        mesh(g,new THREE.CylinderGeometry(r+.019,r+.024,.012,8),'#859585',0,y+.052,0).rotation.y=Math.PI/8;
        for(let j=0;j<8;j++){const a=j*Math.PI/4,x=Math.sin(a)*r*.93,z=Math.cos(a)*r*.93;const opening=box(g,'#536e66',x,y+.012,z,.018,.026,.004);opening.rotation.y=a;
          beam(g,[Math.sin(a)*(r+.014),y+.064,Math.cos(a)*(r+.014)],[Math.sin(a+Math.PI/4)*(r+.014),y+.064,Math.cos(a+Math.PI/4)*(r+.014)],'#a0a991',.002);}
      }
      mesh(g,new THREE.ConeGeometry(.049,.058,8),'#718777',0,.52,0);mesh(g,new THREE.SphereGeometry(.015,8,6),'#b17058',0,.555,0);mesh(g,new THREE.SphereGeometry(.009,8,6),'#b17058',0,.576,0);
      const pts=[];for(let i=0;i<=32;i++){const a=i/32*Math.PI*2;pts.push([Math.sin(a)*.245,.03,Math.cos(a)*.245]);}path(pts,.055);path([[0,.03,.245],[0,.03,.43]]);
      for(const x of [-.41,.41])for(const z of [-.28,.02,.30])hall(g,x,.017,z,.16,.17,.13,true);grove(0,-.41,.30,.027,24);host(.20,.19);g.userData.towerLevels=7;g.userData.towerSides=8;
    }else if(p.model==='dafeng-precinct'){
      box(g,'#c6ccba',0,.012,0,1.08,.008,.87);hall(g,0,.08,-.26,.46,.18,.18);for(let i=0;i<5;i++)box(g,'#b8bea9',0,.02+i*.012,-.13+i*.025,.24,.012,.027);
      for(const s of [-1,1]){hall(g,s*.35,.02,-.06,.15,.29,.12);grove(s*.49,-.24,.033,.11,12,'pine');}
      path([[-.46,.031,.36],[-.46,.031,.14],[.46,.031,.14],[.46,.031,.36],[-.46,.031,.36]]);path([[0,.031,.43],[0,.031,.14]]);
      oval(g,'#729f95',-.22,.023,.25,.11,.047);path([[-.36,.055,.25],[-.08,.055,.25]],.035,true);sign(g,'大峰文化',.22,.10,.27,.18,.026);host(.22,.31);garden();g.userData.terracedHall=true;
    }else if(p.model==='woodland-monastery'){
      box(g,'#c6cdb8',0,.011,0,.87,.009,.83);for(const [z,y,w] of [[-.30,.045,.48],[-.015,.026,.33],[.30,.02,.24]])hall(g,0,y,z,w,.13,.13);
      for(const s of [-1,1])hall(g,s*.31,.02,-.08,.12,.35,.10);
      path([[-.43,.032,.38],[-.43,.032,-.38],[.43,.032,-.38],[.43,.032,.38],[-.43,.032,.38]]);for(const z of [-.16,.15])path([[-.43,.032,z],[.43,.032,z]]);
      pavilion(-.27,.28);mesh(g,new THREE.CylinderGeometry(.02,.03,.045,10),'#a98e5d',-.27,.099,.28);grove(-.55,-.05,.028,.35,30,'pine');grove(.55,-.05,.028,.35,30,'bamboo');grove(0,-.43,.44,.025,25);host(.23,.15);g.userData.hallSequence=3;
    }else if(p.model==='clan-courts'){
      box(g,'#c6cdb7',0,.011,0,1.10,.008,.87);hall(g,0,.02,-.31,.28,.15,.16);
      for(const s of [-1,1])for(let row=0;row<4;row++){const x=s*.30,z=-.30+row*.195;hall(g,x,.02,z,.17,.125,.105);for(let k=0;k<5;k++)box(g,k%2?'#76a69a':'#c79068',x-.056+k*.028,.16,z,.014,.009,.014);}
      path([[0,.032,-.18],[0,.032,.42]],.065);for(const z of [-.195,0,.195])path([[-.50,.032,z],[.50,.032,z]],.03);garden();tea(0,.31);g.userData.residentialCourts=8;
    }else if(p.model==='urban-hill'){
      const f=(x,z)=>.019+.28*Math.exp(-((x+.16)**2+(z+.15)**2)/.06);terrain(f);grove(-.34,-.08,.19,.28,56,'pine',f);grove(.20,-.20,.15,.14,32,'broadleaf',f);
      const pts=[];for(let i=0;i<38;i++){const z=.37-i*.016,x=Math.sin(i*.13)*.12;pts.push([x,f(x,z)+.014,z]);}path(pts,.042,true);const end=pts.at(-1);pavilion(end[0],end[2],end[1]);
      for(let i=0;i<4;i++)hall(g,.42,f(.42,-.23+i*.17),-.23+i*.17,.14,.115,.13+i%2*.04,true);host(pts[10][0],pts[10][2],'look',pts[10][1]);
    }else if(p.model==='heritage-farm'){
      hall(g,-.28,.02,-.26,.32,.17,.15);hall(g,.27,.02,-.25,.28,.16,.12);sign(g,'桥陈历史展馆',-.28,.124,-.164,.24,.028);
      for(let i=0;i<6;i++){const x=-.36+i%3*.36,z=.04+Math.floor(i/3)*.21;box(g,i%2?'#aabe75':'#7c9e65',x,.014,z,.28,.013,.15);for(let j=0;j<6;j++)box(g,'#5f8d55',x-.10+j*.04,.028,z,.013,.013,.12);}
      loop(.53,.39);path([[-.53,.032,-.12],[.53,.032,-.12]]);path([[-.53,.032,.145],[.53,.032,.145]],.03);grove(0,-.42,.46,.025,28,'pine');host(.13,-.12);garden();
    }else if(p.model==='old-city-streets'){
      box(g,'#c5cab9',0,.011,0,1.1,.008,.86);for(const s of [-1,1])for(let i=0;i<4;i++){const z=-.30+i*.205;hall(g,s*.31,.02,z,.24,.15,.15+i%2*.035,true);sign(g,i%2?'棉城茶铺':'古城街巷',s*.31,.09,z+.083,.15,.023);}
      path([[0,.032,-.42],[0,.032,.43]],.084);for(const z of [-.197,.212])path([[-.51,.032,z],[.51,.032,z]],.036);gate(0,-.38,'棉城');tea(-.10,.1);garden();
    }else if(p.model==='academy-axis'){
      box(g,'#c7ccbb',0,.011,0,1.07,.008,.88);hall(g,0,.025,-.28,.45,.17,.17);for(const s of [-1,1])hall(g,s*.36,.02,-.01,.14,.44,.115);
      oval(g,'#78a8a1',0,.023,.13,.19,.095);path([[0,.06,.30],[0,.06,-.10]],.058,true);gate(0,.36,'潮阳学宫',.24);loop(.49,.40);path([[-.49,.035,-.13],[.49,.035,-.13]]);garden();host(.23,.23);g.userData.academyPond=true;
    }else if(p.model==='classical-garden'){
      oval(g,'#75a5a0',-.07,.017,.025,.29,.23);hall(g,-.27,.02,-.29,.36,.16,.13);hall(g,.36,.02,-.18,.16,.24,.11);pavilion(.27,.29);
      for(let i=0;i<10;i++)rock(-.35+i%3*.047,.04+Math.floor(i/3)*.065,.027,.02,1.4+i%2);
      loop(.5,.39);path([[-.50,.035,-.16],[.18,.035,-.16],[.18,.035,.34]],.032);path([[-.1,.063,-.16],[-.1,.063,.30]],.045,true);
      const moon=mesh(g,new THREE.TorusGeometry(.052,.014,5,24),'#d5d7bf',.37,.08,.12);moon.rotation.y=Math.PI/2;grove(.48,-.32,.027,.04,9,'bamboo');grove(-.29,.38,.14,.018,14,'flowering');host(.18,.21);g.userData.moonGate=true;
    }else if(p.model==='coastal-town'){
      water(0,.34,1.20,.27);for(let i=0;i<5;i++)hall(g,-.44+i*.22,.02,-.29,.18,.15,.14+i%2*.03,true);
      for(const s of [-1,1])hall(g,s*.38,.02,-.04,.18,.16,.105);path([[-.53,.04,.15],[.53,.04,.15]],.07,true);path([[-.53,.032,-.16],[.53,.032,-.16]]);path([[0,.032,-.16],[0,.04,.15]],.065);
      for(let i=0;i<4;i++){box(g,'#a88662',-.19+i*.125,.02,.03,.09,.035,.04);for(let j=0;j<3;j++)oval(g,'#839d8d',-.21+i*.125+j*.022,.057,.03,.010,.005);}host(-.13,.08);tea(.27,.13);grove(0,-.43,.49,.018,28,'palm');boat(0,.34,.34,.018);
    }else if(p.model==='working-harbour'){
      water(0,.10,1.20,.73);hall(g,-.24,.02,-.34,.52,.14,.12);hall(g,.32,.02,-.34,.30,.14,.11);path([[-.54,.05,-.20],[.53,.05,-.20]],.067,true);
      for(let i=0;i<3;i++){const x=-.39+i*.34;path([[x,.05,-.20],[x,.05,.24]],.05,true);boat(x+.10,.05,0,0,i);boat(x+.10,.24,0,0,i+1);}
      box(g,'#a7b5a4',0,.019,.43,1.18,.035,.038);for(let i=0;i<20;i++)rock(-.55+i*.058,.43,.017,.035);
      beam(g,[.43,.05,-.14],[.43,.20,-.14],'#ae9761',.008);beam(g,[.43,.20,-.14],[.25,.20,-.02],'#ae9761',.006);beam(g,[.25,.20,-.02],[.25,.08,-.02],'#6c7c70',.0015);host(-.15,-.20);g.userData.berths=6;
    }else if(p.model==='river-meets-sea'){
      water(0,0,1.2,.94);const strip=new THREE.Shape();strip.moveTo(-.11,.47);strip.lineTo(.11,.47);strip.lineTo(.32,-.15);strip.lineTo(.46,-.47);strip.lineTo(-.46,-.47);strip.lineTo(-.32,-.15);strip.closePath();const geo=new THREE.ShapeGeometry(strip);geo.rotateX(-Math.PI/2);mesh(g,geo,'#70afa6',0,.023,0);
      for(const s of [-1,1]){const shape=new THREE.Shape();shape.moveTo(s*.60,.47);shape.lineTo(s*.16,.47);shape.lineTo(s*.31,-.04);shape.lineTo(s*.52,-.30);shape.lineTo(s*.60,-.30);shape.closePath();const land=new THREE.ShapeGeometry(shape);land.rotateX(-Math.PI/2);mesh(g,land,'#bfc8a0',0,.033,0);
        path([[s*.22,.046,-.39],[s*.29,.046,-.10],[s*.44,.046,.17],[s*.55,.046,.24]],.043,true);grove(s*.45,-.31,.10,.08,20,'palm');}
      oval(g,'#d8cfab',.16,.026,.28,.10,.04);boat(0,.08,.055,.31);g.userData.continuousEstuary=true;
    }else if(p.model==='coastal-temple'){
      water(0,.31,1.20,.33);hall(g,0,.022,-.25,.42,.16,.15);for(const s of [-1,1])hall(g,s*.34,.022,-.08,.14,.30,.105);
      path([[-.48,.035,-.38],[.48,.035,-.38],[.48,.041,.10],[-.48,.041,.10],[-.48,.035,-.38]]);path([[0,.035,-.14],[0,.041,.10]],.052);pavilion(-.40,-.31);grove(.51,-.18,.025,.18,20,'pine');for(let i=0;i<12;i++)rock(-.51+i*.09,.145,.025,.019);host(.18,.10);
    }else if(p.model==='scholar-memorial'){
      box(g,'#c7ccba',0,.012,0,1.09,.009,.87);hall(g,0,.02,-.27,.46,.17,.16);for(const s of [-1,1])hall(g,s*.35,.02,-.055,.15,.29,.11);sign(g,'莲峰书院 · 忠贤祠',0,.13,-.174,.34,.03);
      loop(.49,.37);path([[-.49,.035,.15],[.49,.035,.15]]);for(const x of [-.18,0,.18]){box(g,'#a18a64',x,.025,.055,.11,.035,.047);box(g,'#eee4c9',x,.061,.055,.061,.003,.031);host(x,.1,'sit');}
      for(const x of [-.27,.27]){box(g,'#959f88',x,.022,.29,.085,.11,.021);host(x,.34);}grove(0,-.42,.47,.023,29,'pine');garden();
    }else if(p.model==='inscribed-cliffs'){
      water(0,.31,1.2,.32);for(let i=0;i<8;i++){const x=-.42+i*.12,z=-.14+(i%2)*.033;rock(x,z,.078,.018,1.6+i%3*.3);}
      // Printed interpretation panels reference inscriptions without pretending to trace calligraphy.
      for(const [x,label] of [[-.26,'莲花峰'],[.13,'终南']])sign(g,label,x,.16,-.045,.16,.040,'#8c937f');
      path([[-.52,.038,-.02],[-.30,.038,.07],[.20,.038,.07],[.53,.038,-.03]],.057,true);grove(0,-.35,.49,.055,32,'pine');pavilion(.40,-.34);host(-.15,.07);g.userData.inscriptionPanels=2;
    }else if(p.model==='granite-monument'){
      oval(g,'#c7cbb5',0,.013,0,.34,.30);statue(0,-.05,1.23);
      const pts=[];for(let i=0;i<=36;i++){const a=i/36*Math.PI*2;pts.push([Math.sin(a)*.29,.032,-.05+Math.cos(a)*.25]);}path(pts,.052);path([[0,.032,.20],[0,.032,.43]],.065);
      for(const s of [-1,1]){grove(s*.44,-.09,.09,.23,32);for(let i=0;i<3;i++){box(g,'#a78d68',s*.43,.022,.19+i*.066,.11,.021,.025);host(s*.43,.19+i*.066,'sit');}}grove(0,-.42,.37,.025,25,'pine');g.userData.stoneStatue=true;
    }else if(p.model==='coastal-battery'){
      water(0,.31,1.2,.32);box(g,'#acb49d',0,.018,-.03,.96,.037,.37);box(g,'#adb49f',0,.054,.135,.96,.060,.036);
      for(let i=0;i<3;i++){const x=-.31+i*.31;box(g,'#81917f',x,.055,-.035,.14,.031,.13);beam(g,[x,.10,-.08],[x,.12,.095],'#4e655f',.017);for(const s of [-1,1]){const wheel=mesh(g,new THREE.CylinderGeometry(.025,.025,.01,12),'#677969',x+s*.035,.087,-.03);wheel.rotation.z=Math.PI/2;}}
      path([[-.52,.04,.08],[-.52,.04,-.28],[.52,.04,-.28],[.52,.04,.08]],.052,true);hall(g,.33,.02,-.37,.23,.11,.09);grove(-.26,-.39,.21,.020,18,'pine');host(-.15,-.28);g.userData.displayCannons=3;
    }else if(p.model==='village-crafts'){
      hall(g,0,.02,-.30,.35,.15,.15);for(const s of [-1,1])for(let i=0;i<3;i++)hall(g,s*.35,.02,-.24+i*.23,.23,.16,.105+i%2*.035);
      path([[0,.032,-.18],[0,.032,.42]],.073);for(const z of [-.125,.335])path([[-.51,.032,z],[.51,.032,z]],.033);garden();
      for(const s of [-1,1]){box(g,'#a38760',s*.16,.023,.04,.13,.036,.05);for(let i=0;i<3;i++)box(g,'#c1a779',s*.16-.04+i*.04,.06,.04,.028,.024,.028);host(s*.16,.095,'look');}tea(.24,.36);g.userData.craftTables=2;
    }else if(p.model==='town-and-bridge'){
      water(0,0,.25,.94);for(const s of [-1,1]){for(let i=0;i<3;i++)hall(g,s*.40,.02,-.29+i*.28,.24,.19,.13+i%2*.035,true);path([[s*.19,.037,-.41],[s*.19,.037,.41]],.052,true);}
      const bridge=[];for(let i=0;i<=24;i++){const x=-.24+i*.02;bridge.push([x,.043+.05*Math.sin(i/24*Math.PI),.01]);}path(bridge,.061,true);boat(0,-.23,.045,.08);tea(-.37,.40);sign(g,'大峰文化展厅',.40,.13,-.177,.19,.027);grove(-.56,0,.017,.34,24);grove(.56,0,.017,.34,24,'palm');g.userData.stoneBridge=true;
    }
    if(!paths.length)throw new Error('Missing Chaoyang scene: '+p.model);
    for(const pts of paths)routes.push(pts.map(a=>new THREE.Vector3(...a).multiplyScalar(p.displayScale).add(g.position)));
    addExhibitInfill({group:g,place:p,paths});
    obstacles.push(...settleExhibitHosts({group:g,actors:localActors,paths}));coverage.push({id:p.id,paths:paths.length,x:p.x,z:p.z,width:1.24*p.displayScale,depth:.98*p.displayScale,offset:p.displayOffset||0});
    for(const o of dynamic)g.remove(o);batchStatic(g);for(const o of dynamic)g.add(o);g.traverse(o=>{if(o.isMesh)o.userData.landmarkId=p.id;});models.push({id:p.id,type:p.model,group:g});
  }
  const streetLife=buildWalkwayCrowd({parent:group,preparedWalkways:routes,population:routes.length*8,obstacles});
  const update=t=>{streetLife.update(t);for(const fn of animations)fn(t);};update(0);
  return {group,models,streetLife,update,stats:{places:places.length,models:models.length,people:streetLife.count+actors.length,animations:animations.length,coverage}};
}
