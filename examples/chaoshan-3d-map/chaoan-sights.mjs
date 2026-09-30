import * as THREE from 'three';
import {box,disc,tree,sign,material,person} from './scene-miniatures.mjs';
import {batchStatic} from './static-batch.mjs';
import {addExhibitInfill} from './exhibit-infill.mjs';
import {buildWalkwayCrowd,settleExhibitHosts} from './walkway-crowds.mjs';
import {chaoanPlaces} from './chaoan-places.mjs';

export function buildChaoanSights({parent,places=chaoanPlaces,heightAt,waterAt}){
  const group=new THREE.Group();group.name='chaoan-tea-mountains-and-water-villages';parent.add(group);
  const models=[],routes=[],animations=[],coverage=[],actors=[],obstacles=[];
  const mesh=(g,geo,color,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geo,material(color));m.position.set(x,y,z);g.add(m);return m;};
  const ellipse=(g,color,x,y,z,rx,rz)=>{const m=disc(g,color,x,y,z,1,.006);m.scale.set(rx,1,rz);return m;};
  const beam=(g,a,b,color='#809080',r=.004)=>{const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),v=to.clone().sub(from);const m=mesh(g,new THREE.CylinderGeometry(r,r,v.length(),6),color);m.position.copy(from).add(to).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return m;};
  const roof=(g,x,y,z,w,d)=>{
    const vertices=[];for(const s of [-1,1])for(const p of [[-w/2,0,s*d/2],[-w/2,.037,0],[w/2,0,s*d/2],[w/2,0,s*d/2],[-w/2,.037,0],[w/2,.037,0]])vertices.push(...p);
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();
    const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#50665f',side:THREE.DoubleSide}));m.position.set(x,y,z);g.add(m);
    box(g,'#a47760',x,y+.037,z,w,.008,.009);
    for(const s of [-1,1])beam(g,[x+s*w/2,y+.04,z],[x+s*(w/2+.018),y+.055,z],'#a47760',.004);
  };
  const house=(g,x,z,w=.17,d=.13,h=.13,y=.016)=>{
    box(g,'#d6d5c4',x,y,z,w,h,d);roof(g,x,y+h,z,w+.016,d+.023);
    box(g,'#85634e',x,y,z+d/2+.003,.03,.06,.006);
    for(const s of [-1,1]){box(g,'#66928d',x+s*w*.30,y+.045,z+d/2+.004,w*.17,.04,.005);box(g,'#eee9d1',x+s*w*.30,y+.062,z+d/2+.008,.003,.04,.004);}
  };
  const drawTrail=(g,line,width=.034,rail=false)=>{
    for(let i=1;i<line.length;i++){
      const a=new THREE.Vector3(...line[i-1]),b=new THREE.Vector3(...line[i]),v=b.clone().sub(a),len=v.length();if(len<1e-6)continue;
      const m=box(g,'#c4c8b5',0,0,0,width,.008,len);m.position.copy(a).add(b).multiplyScalar(.5);m.position.y-=.004;m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),v.clone().normalize());
      if(rail){const n=Math.hypot(v.x,v.z),dx=v.z/n*width*.55,dz=-v.x/n*width*.55;for(const s of [-1,1]){
        const c=[a.x+s*dx,a.y+.028,a.z+s*dz],d=[b.x+s*dx,b.y+.028,b.z+s*dz];beam(g,c,d);
        for(let j=0;j<=Math.ceil(len/.05);j++){const p=a.clone().lerp(b,j/Math.ceil(len/.05));beam(g,[p.x+s*dx,p.y,p.z+s*dz],[p.x+s*dx,p.y+.028,p.z+s*dz]);}
      }}
    }
  };
  for(const [index,p] of places.entries()){
    const g=new THREE.Group();g.name=p.id;g.scale.setScalar(p.displayScale);group.add(g);
    const heights=[];for(let i=0;i<=12;i++)for(let j=0;j<=10;j++)heights.push(heightAt(p.x+(-.62+i*.103)*p.displayScale,p.z+(-.5+j*.1)*p.displayScale));
    const ground=Math.max(...heights,waterAt(p.x,p.z)??-Infinity)+.025;g.position.set(p.x,ground,p.z);p.sceneY=ground;
    const depth=Math.max(.03,(ground-Math.min(...heights))/p.displayScale),dynamic=[],paths=[];
    box(g,'#91a28c',0,-depth,0,1.24,depth,.98);box(g,'#a4b78d',0,0,0,1.22,.008,.96);
    const path=(points,width=.037,rail=false)=>{drawTrail(g,points,width,rail);paths.push(points);return points;};
    const host=(x,y,z,action='wave')=>{
      const a=person(g,index+actors.length,{scale:.020});a.root.position.set(x,y,z);dynamic.push(a.root);actors.push(a);
      animations.push(t=>{a.pose(t,action==='pick'?'wave':action);if(action==='pick'){a.root.rotation.x=.12+Math.sin(t*1.5+x)*.11;a.root.rotation.y=-Math.PI/2;}});return a;
    };
    const rock=(x,y,z,r=.05,h=1)=>{const m=mesh(g,new THREE.DodecahedronGeometry(r,1),'#a4ae9a',x,y+r*h*.55,z);m.scale.set(1,h,.83);m.rotation.y=x*13+z*7;return m;};
    const grove=(cx,cz,rx,rz,count=22,type='broadleaf',surface=()=>.016)=>{for(let i=0;i<count;i++){const a=i*2.399,r=Math.sqrt((i+.5)/count),x=cx+Math.cos(a)*rx*r,z=cz+Math.sin(a)*rz*r;tree(g,x,surface(x,z),z,.045+(i%5)*.009,type);}};
    const hill=(x,z,cx,cz,r,h)=>h*Math.exp(-((x-cx)**2+(z-cz)**2)/r**2);
    const terrain=(surface)=>{
      const geo=new THREE.PlaneGeometry(1.20,.94,36,30);geo.rotateX(-Math.PI/2);const pos=geo.attributes.position,colors=[];
      for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i),y=surface(x,z);pos.setY(i,y);const c=new THREE.Color(y>.26?'#a5b494':y>.13?'#83a070':'#a0b58b');colors.push(c.r,c.g,c.b);}
      geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));g.add(m);return surface;
    };
    const mist=(y=.22)=>{
      const geo=new THREE.PlaneGeometry(.85,.075,22,1);geo.rotateX(-Math.PI/2);const a=geo.attributes.position;
      for(let i=0;i<a.count;i++)a.setY(i,Math.sin(a.getX(i)*10)*.012);
      const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:'#edf3e6',transparent:true,opacity:.17,depthWrite:false,side:THREE.DoubleSide}));m.position.set(0,y,-.09);g.add(m);dynamic.push(m);animations.push(t=>{m.position.x=Math.sin(t*.12)*.09;m.material.opacity=.10+.06*(1+Math.sin(t*.16));});
    };
    const ripples=(cx,y,cz,rx,rz)=>{
      for(let j=0;j<3;j++){const pts=[];for(let i=0;i<20;i++)pts.push(new THREE.Vector3(cx-rx+i*rx*2/19,y,cz+(j-1)*rz*.55+Math.sin(i*.4)*.008));const m=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:'#c1e4d9',transparent:true,opacity:.35}));g.add(m);dynamic.push(m);animations.push(t=>{m.position.z=Math.sin(t*.8+j)*.006;});}
    };
    const teaTable=(x,y,z)=>{disc(g,'#a07c57',x,y+.028,z,.035,.008);box(g,'#836c4f',x,y,z,.012,.028,.012);for(let i=0;i<3;i++)disc(g,'#e7ddc5',x-.018+i*.018,y+.037,z+.008,.005,.006);disc(g,'#a15e43',x,y+.037,z-.012,.01,.015);host(x-.052,y,z,'sit');host(x+.052,y,z,'sit');};
    const gate=(x,z,label,w=.18)=>{for(const s of [-1,1])box(g,'#b8bba7',x+s*w*.4,.016,z,.025,.14,.06);roof(g,x,.16,z,w+.04,.10);sign(g,label,x,.134,z+.036,w*.75,.026);};
    const gardenEdge=()=>{grove(-.52,0,.035,.31,19);grove(.52,0,.035,.31,19,'bamboo');};
    if(['summit','granite-ridge'].includes(p.model)){
      const granite=p.model==='granite-ridge',surface=terrain((x,z)=>.018+hill(x,z,-.19,-.12,.24,.28)+hill(x,z,.23,-.21,.18,granite?.31:.40));
      grove(-.24,.04,.22,.28,45,'pine',surface);grove(.34,.04,.17,.29,38,'broadleaf',surface);
      for(let i=0;i<12;i++){const x=.07+(i%4)*.064,z=-.28+Math.floor(i/4)*.063;rock(x,surface(x,z),z,.026,granite?2.4:1.4);}
      const line=[];for(let i=0;i<=40;i++){const z=.36-i*.0135,x=Math.sin(i*.13)*.23;line.push([x,surface(x,z)+.013,z]);}path(line,.032,true);
      const end=line.at(-1);host(...[end[0],end[1],end[2]]);if(!granite)mist(.31);else{gate(-.32,.31,'桑浦山');path([[-.32,.024,.31],[0,surface(0,.36)+.013,.36]]);}
    }else if(p.model==='crater-lake'){
      const surface=terrain((x,z)=>{const r=Math.hypot(x/.42,z/.31);return .13+.15*Math.exp(-(((r-1.08)/.23)**2));});
      ellipse(g,'#4d969d',0,.145,0,.35,.235);ripples(0,.154,0,.25,.13);
      const line=[];for(let i=0;i<=48;i++){const a=i/48*Math.PI*2,x=Math.cos(a)*.47,z=Math.sin(a)*.34;line.push([x,surface(x,z)+.014,z]);}path(line,.025,true);
      for(let i=0;i<22;i++){const a=i*2.4,x=Math.cos(a)*.39,z=Math.sin(a)*.28;rock(x,surface(x,z),z,.014+(i%3)*.007,1.2);}
      grove(-.51,-.04,.04,.25,17,'pine',surface);host(line[7][0],line[7][1],line[7][2]);mist(.32);g.userData.lakeBasin=true;
    }else if(p.model==='ridge-tea'){
      const surface=terrain((x,z)=>.025+hill(x,z,-.08,-.11,.38,.26));
      for(let row=0;row<7;row++){
        const line=[];for(let i=0;i<=28;i++){const x=-.46+i*.032,z=-.30+row*.091+Math.sin(x*5)*.026,y=surface(x,z);const m=mesh(g,new THREE.SphereGeometry(.019,6,4),row%2?'#57834f':'#759c5b',x,y+.013,z);m.scale.y=.68;line.push([x,surface(x,z+.033)+.012,z+.033]);}path(line,.021);
        if(row%2===0){const pt=line[20];host(...pt,'pick');disc(g,'#af996f',pt[0]+.021,pt[1],pt[2],.012,.017);}
      }
      const edge=[];for(let i=0;i<30;i++){const z=-.3+i*.025;edge.push([-.5,surface(-.5,z)+.013,z]);}path(edge,.026);grove(.53,-.12,.025,.23,12,'pine',surface);mist(.34);g.userData.teaRows=7;
    }else if(p.model==='old-tea-garden'){
      for(let i=0;i<15;i++){const x=-.39+(i%5)*.19,z=-.27+Math.floor(i/5)*.20;ellipse(g,'#c2c8a1',x,.015,z,.056,.045);tree(g,x,.019,z,.105+(i%3)*.013,'broadleaf');if(i%4===0)host(x+.062,.024,z,'pick');}
      path([[-.51,.027,.34],[.50,.027,.34],[.50,.027,-.38],[-.51,.027,-.38],[-.51,.027,.34]]);
      path([[-.50,.027,.02],[.5,.027,.02]]);teaTable(.22,.025,.39);sign(g,'单丛 · 古茶树',-.27,.11,.39,.22,.032);
    }else if(p.model==='tea-town'){
      box(g,'#c9cbb7',0,.009,0,1.1,.009,.86);
      for(let i=0;i<4;i++)for(const s of [-1,1]){const x=-.38+i*.25;house(g,x,s*.27,.19,.14,.12+(i%2)*.045);sign(g,s<0?'单丛茶坊':'茶馆',x,.085,s*.27+.075,.11,.025);}
      path([[-.51,.028,0],[.51,.028,0]],.075);path([[0,.028,-.37],[0,.028,.39]],.055);
      for(let i=0;i<6;i++){const x=-.4+i*.08;disc(g,'#bb9c67',x,.019,.12,.028,.006);disc(g,'#779856',x,.027,.12,.023,.003);}host(-.25,.025,.08,'pick');teaTable(.30,.023,.12);gardenEdge();
    }else if(['cascade-gorge','canopy-stream'].includes(p.model)){
      const falls=p.model==='cascade-gorge',surface=terrain((x,z)=>.013+.22*Math.exp(-(((Math.abs(x)-.43)/.11)**2)));
      box(g,'#619b9c',0,.024,0,.16,.006,.9);ripples(0,.035,.22,.065,.14);
      if(falls){
        for(let i=0;i<3;i++){const z=-.32+i*.17,y=.27-i*.082;box(g,'#879b87',0,.025,z,.24,y-.025,.095);box(g,'#8bbdb6',0,y,z,.14,.007,.095);const sheet=box(g,'#afd9ce',0,y-.08,z+.05,.10,.083,.008);dynamic.push(sheet);animations.push(t=>sheet.scale.x=.93+Math.sin(t*3+i)*.04);}
        path([[-.19,.047,.36],[-.19,.047,.10],[.19,.047,.10],[.19,.13,-.12],[.19,.30,-.34]],.034,true);
      }else{path([[-.22,.043,.37],[-.22,.043,-.26],[.22,.043,-.26],[.22,.043,.24]],.032,true);for(let i=0;i<12;i++)rock((i%2?1:-1)*.095,.028,-.35+i*.06,.022,1.1);}
      grove(-.43,0,.1,.36,43,falls?'pine':'broadleaf',surface);grove(.43,0,.1,.36,43,'bamboo',surface);host(-.19,.047,.2);
    }else if(p.model==='reservoir'){
      ellipse(g,'#5a9eaa',0,.015,0,.52,.39);ripples(0,.025,.03,.32,.22);
      for(let i=0;i<8;i++){const a=Math.PI*.12+i*.36,x=Math.cos(a)*.48,z=-Math.sin(a)*.31;rock(x,.019,z,.09,1.8);grove(x,z,.05,.04,6,'pine',()=>.11);}
      box(g,'#b7c0ac',0,.018,.29,.85,.07,.035);path([[-.49,.097,.29],[.49,.097,.29]],.046,true);path([[.49,.097,.29],[.51,.032,.41],[-.49,.032,.41]],.035);host(.31,.097,.29);g.userData.dam=true;
    }else if(p.model==='walled-village'){
      box(g,'#c4c8b7',0,.01,0,1.07,.009,.86);
      for(const x of [-.39,-.19,.19,.39])for(let row=0;row<4;row++)house(g,x,-.30+row*.19,.15,.135,.10+(row%2)*.024);
      path([[0,.028,-.39],[0,.028,.43]],.075);for(const x of [-.29,.29])path([[x,.028,-.39],[x,.028,.39]],.029);
      for(const z of [-.205,.175])path([[-.49,.028,z],[.49,.028,z]],.028);gate(0,.41,'龙湖古寨');teaTable(-.43,.028,.38);g.userData.parallelLanes=3;
    }else if(['ancestral-courts','fortified-courts','scholar-hall'].includes(p.model)){
      const fortified=p.model==='fortified-courts',scholar=p.model==='scholar-hall';box(g,'#c9cbbb',0,.009,0,1.02,.01,.85);
      for(const z of [-.28,.035]){house(g,0,z,.43,.13,.15);for(const s of [-1,1])house(g,s*.26,z+.08,.10,.20,.095);}
      path([[0,.028,.39],[0,.028,.26],[.37,.028,.26],[.37,.028,-.38],[-.37,.028,-.38],[-.37,.028,.26],[0,.028,.26]],.036);
      for(const z of [-.07,.26]){path([[-.36,.028,z],[.36,.028,z]],.032);ellipse(g,'#a4b585',-.12,.022,z+.038,.028,.022);}
      gate(0,.4,fortified?'象埔寨':scholar?'庵埠文祠':'龙湖古建筑');
      if(fortified){for(const s of [-1,1]){box(g,'#adb59d',s*.51,.019,0,.025,.12,.86);house(g,s*.44,-.34,.12,.12,.23);}disc(g,'#8c9b86',.17,.02,.27,.025,.034);ellipse(g,'#4f7f7d',.17,.055,.27,.017,.017);}
      else if(scholar){for(const x of [-.12,.12]){box(g,'#94785d',x,.026,.27,.09,.033,.035);box(g,'#e8e4cd',x,.06,.27,.052,.003,.023);host(x,.028,.31,'sit');}gardenEdge();}
      else{for(const s of [-1,1]){box(g,'#a88a66',s*.43,.024,.25,.065,.065,.015);host(s*.43,.025,.30);}gardenEdge();}
    }else if(p.model==='canal-village'){
      box(g,'#bfc8ad',0,.009,0,1.16,.008,.91);box(g,'#619e9b',0,.022,0,.21,.005,.87);ellipse(g,'#619e9b',.16,.022,.19,.26,.20);
      for(let i=0;i<3;i++)for(const s of [-1,1])house(g,s*.39,-.29+i*.23,.20,.16,.11);
      for(const s of [-1,1])path([[s*.15,.036,-.39],[s*.15,.036,-.08],[s*.19,.036,.06],[s*.45,.036,.09],[s*.45,.036,.39]],.031,true);
      path([[-.20,.08,-.08],[.20,.08,-.08]],.063,true);roof(g,0,.20,-.08,.37,.1);for(const s of [-1,1])beam(g,[s*.13,.08,-.08],[s*.13,.20,-.08]);
      ripples(.20,.032,.23,.12,.09);teaTable(-.26,.028,.34);g.userData.coveredBridge=true;
    }else if(p.model==='ceramic-town'){
      box(g,'#c4cbb6',0,.009,0,1.1,.008,.88);house(g,0,-.29,.48,.19,.17);sign(g,'陶瓷工坊',0,.12,-.19,.27,.035);
      for(const x of [-.37,.37]){house(g,x,.0,.18,.31,.12);for(let row=0;row<2;row++){box(g,'#a5896c',x,.03+row*.06,.17,.17,.012,.05);for(let i=0;i<4;i++){const pts=[new THREE.Vector2(.006,0),new THREE.Vector2(.015,.008),new THREE.Vector2(.013,.025),new THREE.Vector2(.005,.034)];mesh(g,new THREE.LatheGeometry(pts,10),i%2?'#8daeb0':'#e5dfcd',x-.062+i*.04,.045+row*.06,.17);}}}
      path([[-.20,.026,.4],[-.20,.026,-.13],[.20,.026,-.13],[.20,.026,.4]],.048);path([[-.48,.026,.34],[.48,.026,.34]],.04);
      for(const x of [-.1,.1]){const wheel=disc(g,'#a8b1a0',x,.032,.17,.035,.012);dynamic.push(wheel);box(g,'#bd9671',x,.046,.17,.026,.035,.027);animations.push(t=>wheel.rotation.y=t*2);host(x,.026,.23,'pick');}
    }else if(p.model==='river-life'){
      box(g,'#539ca5',0,.016,0,.48,.006,.94);ripples(0,.027,0,.20,.28);
      for(const s of [-1,1]){box(g,'#bac4ac',s*.28,.014,0,.048,.027,.94);path([[s*.31,.05,-.40],[s*.31,.05,.40]],.058,true);for(let i=0;i<4;i++){house(g,s*.47,-.32+i*.21,.16,.14,.11+(i%2)*.06);tree(g,s*.35,.032,-.36+i*.23,.055,'broadleaf');}}
      for(let i=0;i<2;i++){const b=new THREE.Group();g.add(b);dynamic.push(b);b.userData.vessel=true;const hull=mesh(b,new THREE.CylinderGeometry(.025,.017,.022,6),i?'#a77956':'#608e93');hull.scale.z=2.1;box(b,'#e8e1c9',0,.01,0,.037,.026,.04);animations.push(t=>{const phase=t*.14+i*Math.PI;b.position.set(i?.10:-.10,.038,Math.sin(phase)*.30);b.rotation.y=Math.cos(phase)>=0?0:Math.PI;b.rotation.z=Math.sin(t*1.2)*.012;});}
      teaTable(-.42,.026,.39);host(.32,.05,.24);g.userData.channelHalfWidth=.24;
    }else if(p.model==='orchard-village'){
      house(g,-.31,-.23,.28,.18,.14);house(g,.30,-.24,.27,.17,.12);
      for(let i=0;i<12;i++){const x=-.4+(i%4)*.25,z=-.03+Math.floor(i/4)*.12;tree(g,x,.018,z,.074,'broadleaf');for(let j=0;j<3;j++)mesh(g,new THREE.SphereGeometry(.006,5,4),'#d7ad55',x+Math.sin(j*2)*.025,.072,z+Math.cos(j*2)*.023);}
      path([[0,.026,-.37],[0,.026,.35],[-.51,.026,.35],[-.51,.026,-.1]],.04);path([[0,.026,.35],[.5,.026,.35],[.5,.026,-.1]],.037);
      for(const x of [-.34,.34]){box(g,'#ae8c63',x,.024,.35,.10,.031,.045);for(let i=0;i<4;i++)disc(g,'#7c9d60',x-.032+i*.021,.056,.35,.008,.013);}host(.32,.026,.41);gardenEdge();
    }else if(p.model==='stream-greenway'){
      const pts=[];for(let i=0;i<=40;i++){const z=-.46+i*.023;pts.push([Math.sin(z*6)*.09,z]);}
      const s=new THREE.Shape();pts.forEach(([x,z],i)=>i?s.lineTo(x-.056,-z):s.moveTo(x-.056,-z));for(const [x,z] of [...pts].reverse())s.lineTo(x+.056,-z);s.closePath();const geo=new THREE.ShapeGeometry(s);geo.rotateX(-Math.PI/2);mesh(g,geo,'#619f99',0,.023,0);
      for(const side of [-1,1])path(pts.map(([x,z])=>[x+side*.115,.037,z]),.035,true);
      path([[-.18,.065,0],[.18,.065,0]],.045,true);grove(-.42,-.08,.12,.29,33,'bamboo');
      for(let row=0;row<6;row++)for(let i=0;i<9;i++)mesh(g,new THREE.SphereGeometry(.013,6,4),'#6e995c',.25+i*.028,.035,-.29+row*.11);host(.22,.029,.35,'pick');
    }else if(p.model==='memorial-garden'){
      box(g,'#c7ccbb',0,.01,0,.85,.01,.78);box(g,'#aaaf9b',0,.022,-.21,.22,.023,.17);box(g,'#b6bba9',0,.045,-.21,.11,.25,.09);sign(g,'凤凰山革命纪念公园',0,.31,-.155,.34,.031);
      house(g,-.33,-.18,.15,.29,.13);path([[-.27,.031,.33],[-.27,.031,.01],[.27,.031,.01],[.27,.031,.33],[-.27,.031,.33]],.05);path([[0,.031,.33],[0,.031,.43]],.05);
      for(let i=0;i<4;i++){box(g,'#9f8971',.37,.025,-.29+i*.14,.016,.10,.10);host(.32,.029,-.29+i*.14);}gardenEdge();grove(0,-.4,.4,.035,23,'pine');
    }else if(p.model==='culture-village'){
      box(g,'#c5cbb4',0,.009,0,1.03,.009,.87);house(g,0,-.29,.39,.18,.13);house(g,-.37,-.10,.20,.18,.11);house(g,.37,-.10,.20,.18,.11);sign(g,'畲乡文化 · 茶与织作',0,.095,-.192,.33,.03);
      path([[-.43,.028,.33],[-.20,.028,.18],[-.20,.028,-.14],[.20,.028,-.14],[.20,.028,.18],[.43,.028,.33]],.038);path([[-.43,.028,.33],[.43,.028,.33]],.044);
      for(const x of [-.38,.38]){beam(g,[x-.047,.02,.10],[x-.047,.13,.10]);beam(g,[x+.047,.02,.10],[x+.047,.13,.10]);beam(g,[x-.047,.13,.10],[x+.047,.13,.10]);box(g,'#658d91',x,.048,.10,.081,.076,.004);for(let i=0;i<5;i++)box(g,i%2?'#c2935d':'#d4d7b6',x,.06+i*.012,.104,.080,.004,.004);host(x,.026,.17,'sit');}
      teaTable(.0,.026,.06);for(let i=0;i<4;i++){const a=host(-.12+i*.08,.026,.25,'wave');animations.push(t=>a.root.rotation.y=Math.sin(t*.5+i)*.2);}
      grove(-.51,-.29,.035,.12,15);grove(.51,-.29,.035,.12,15);g.userData.culturalInterpretation=true;
    }
    if(!paths.length)throw new Error('Missing Chaoan walkway: '+p.model);
    for(const line of paths){const points=[];for(let i=1;i<line.length;i++){const a=new THREE.Vector3(...line[i-1]),b=new THREE.Vector3(...line[i]),n=Math.max(2,Math.ceil(a.distanceTo(b)/.025));for(let j=i===1?0:1;j<=n;j++)points.push(a.clone().lerp(b,j/n).multiplyScalar(p.displayScale).add(g.position));}routes.push(points);}
    addExhibitInfill({group:g,place:p,paths});
    obstacles.push(...settleExhibitHosts({group:g,actors:actors.filter(a=>a.root.parent===g),paths}));
    coverage.push({id:p.id,paths:paths.length});for(const o of dynamic)g.remove(o);batchStatic(g);for(const o of dynamic)g.add(o);g.traverse(o=>{if(o.isMesh)o.userData.landmarkId=p.id;});models.push({id:p.id,type:p.model,group:g});
  }
  const streetLife=buildWalkwayCrowd({parent:group,preparedWalkways:routes,population:routes.length*8,obstacles});
  const update=t=>{streetLife.update(t);for(const animate of animations)animate(t);};update(0);
  return {group,models,streetLife,update,stats:{places:places.length,models:models.length,people:streetLife.count+actors.length,coverage,animations:animations.length}};
}
