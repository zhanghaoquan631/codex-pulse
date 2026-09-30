import * as THREE from 'three';
import {box,disc,tree,sign,material,person,vehicle} from './scene-miniatures.mjs';
import {batchStatic} from './static-batch.mjs';
import {addExhibitInfill} from './exhibit-infill.mjs';
import {buildWalkwayCrowd,settleExhibitHosts} from './walkway-crowds.mjs';
import {raopingPlaces} from './raoping-places.mjs';
import {localHouse} from './local-architecture.mjs';
import {placeSetting} from './place-setting.mjs';

export function buildRaopingSights({parent,places=raopingPlaces,heightAt,waterAt}){
  const group=new THREE.Group();group.name='raoping-bays-and-highlands';parent.add(group);
  const models=[],routes=[],animations=[],coverage=[],actors=[],obstacles=[],drawnTrails=new WeakSet();
  const mesh=(g,geo,color,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geo,material(color));m.position.set(x,y,z);g.add(m);return m;};
  const beam=(g,a,b,color='#7a897d',r=.004)=>{const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),v=to.clone().sub(from),m=mesh(g,new THREE.CylinderGeometry(r,r,v.length(),6),color);m.position.copy(from).add(to).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return m;};
  const slab=(g,color,points,y=.012)=>{const s=new THREE.Shape();points.forEach(([x,z],i)=>i?s.lineTo(x,-z):s.moveTo(x,-z));s.closePath();const geo=new THREE.ShapeGeometry(s);geo.rotateX(-Math.PI/2);return mesh(g,geo,color,0,y,0);};
  const ellipse=(g,color,x,z,rx,rz,y=.009)=>{const m=disc(g,color,x,y,z,1,.007);m.scale.set(rx,1,rz);return m;};
  const roof=(g,x,y,z,w,d)=>{const geo=new THREE.BufferGeometry(),v=[];for(const s of [-1,1])for(const a of [[-w/2,0,s*d/2],[-w/2,.04,0],[w/2,0,s*d/2],[w/2,0,s*d/2],[-w/2,.04,0],[w/2,.04,0]])v.push(...a);geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geo.computeVertexNormals();const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#536c65',side:THREE.DoubleSide}));m.position.set(x,y,z);g.add(m);box(g,'#9c7664',x,y+.039,z,w,.009,.008);};
  const house=(g,x,z,w=.16,d=.12,h=.13,y=.018)=>localHouse(g,x,z,w,d,h,y);
  const trail=(g,line,w=.039,rails=false)=>{
    if(drawnTrails.has(line))return;drawnTrails.add(line);
    for(let i=1;i<line.length;i++){
      const a=new THREE.Vector3(...line[i-1]),b=new THREE.Vector3(...line[i]),v=b.clone().sub(a),length=v.length();
      const m=box(g,'#c9cbbb',0,0,0,w,.009,length);m.position.copy(a).add(b).multiplyScalar(.5);m.position.y-=.005;m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),v.clone().normalize());
      if(rails){
        const horizontal=Math.hypot(v.x,v.z),nx=v.z/horizontal*w/2,nz=-v.x/horizontal*w/2,n=Math.ceil(length/.06);
        for(let j=0;j<=n;j++){const p=a.clone().lerp(b,j/n);beam(g,[p.x+nx,p.y,p.z+nz],[p.x+nx,p.y+.036,p.z+nz]);}
        beam(g,[a.x+nx,a.y+.036,a.z+nz],[b.x+nx,b.y+.036,b.z+nz]);
      }
    }
  };
  for(const [index,p] of places.entries()){
    const g=new THREE.Group();g.name=p.id;g.userData.setting=placeSetting(p);g.scale.setScalar(p.displayScale);group.add(g);
    const heights=[];for(let i=0;i<=12;i++)for(let j=0;j<=10;j++)heights.push(heightAt(p.x+(-.62+i*.103)*p.displayScale,p.z+(-.5+j*.1)*p.displayScale));
    const ground=Math.max(...heights,waterAt(p.x,p.z)??-Infinity)+.024;g.position.set(p.x,ground,p.z);p.sceneY=ground;
    const depth=Math.max(.035,(ground-Math.min(...heights))/p.displayScale),dynamic=[],paths=[];
    const wet=['aquaculture','island-village','dune-island','twin-island','open-beach','lake-islands','old-port','cliff-battery'].includes(p.model);
    box(g,wet?'#759d9a':'#91a589',0,-depth,0,1.24,depth,.98);box(g,wet?'#4c9daa':'#9fb48e',0,0,0,1.22,.006,.96);
    const rock=(x,z,r=.06,h=1,y=.015)=>{const m=mesh(g,new THREE.DodecahedronGeometry(r,1),'#a5afa1',x,y+r*h*.5,z);m.scale.set(1,h,.8);m.rotation.y=x*9+z*13;return m;};
    const grove=(cx,cz,rx,rz,count=22,type='broadleaf',y=.017)=>{for(let i=0;i<count;i++){const a=i*2.399,r=Math.sqrt((i+.5)/count);tree(g,cx+Math.cos(a)*rx*r,y,cz+Math.sin(a)*rz*r,.05+(i%4)*.012,type);}};
    const host=(x,y,z,state='wave')=>{const phase=actors.length*.71,a=person(g,index+actors.length,{scale:.015});a.root.position.set(x,y,z);dynamic.push(a.root);actors.push(a);animations.push(t=>{const greeting=state==='wave'&&(t+phase)%17<2;a.pose(t*.45,greeting?'wave':state==='wave'?'look':state);if(state==='sit')a.root.children[4].rotation.x=-.35-Math.max(0,Math.sin(t*.65+phase))*.3;});return a;};
    const waterMotion=()=>{for(let j=0;j<3;j++){const vertices=[];for(let i=0;i<32;i++)vertices.push(new THREE.Vector3(-.55+i*.035,.013,.24+j*.077+Math.sin(i*.35)*.012));const m=new THREE.Line(new THREE.BufferGeometry().setFromPoints(vertices),new THREE.LineBasicMaterial({color:'#b4deda',transparent:true,opacity:.3}));g.add(m);dynamic.push(m);animations.push(t=>{m.position.z=Math.sin(t*.7+j)*.014;});}};
    const boat=(x,z,id=0,moving=false,scale=1,travel=.075)=>{const b=new THREE.Group();g.add(b);dynamic.push(b);b.scale.setScalar(scale);b.userData.vessel=true;const hull=mesh(b,new THREE.CylinderGeometry(.042,.025,.029,6),id%2?'#a96350':'#538198');hull.scale.z=2.3;box(b,'#ede6ce',0,.01,-.016,.057,.038,.061);box(b,'#56787e',0,.031,.016,.043,.014,.004);beam(b,[0,.03,-.03],[0,.13,-.03],'#798075',.003);animations.push(t=>{b.position.set(x+(moving?Math.sin(t*.18+id)*travel:0),.026+Math.sin(t*1.2+id)*.0025,z);b.rotation.set(0,Math.PI/2,Math.sin(t+id)*.017);});};
    const islands=(count,cx=0,cz=-.08)=>{for(let i=0;i<count;i++){const a=i*2.4,r=.08+(i%3)*.09,x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r;ellipse(g,'#8faa78',x,z,.09+(i%2)*.035,.075,.015);rock(x,z,.051,1.7);tree(g,x+.025,.075,z,.045,'pine');}};
    const perimeter=[[-.53,.023,.39],[.53,.023,.39],[.53,.023,-.39],[-.53,.023,-.39],[-.53,.023,.39]];
    if(p.model==='aquaculture'){
      slab(g,'#b5c09c',[[-.60,-.46],[.60,-.46],[.55,-.28],[.12,-.17],[-.52,-.23]],.014);
      paths.push([[-.51,.025,-.30],[-.20,.025,-.26],[.10,.025,-.24],[.48,.025,-.34]]);
      for(let i=0;i<5;i++)for(let j=0;j<3;j++){const x=-.36+i*.115,z=-.04+j*.10;box(g,'#537f80',x,.012,z,.096,.005,.075);for(const s of [-1,1]){box(g,'#c8ac78',x+s*.052,.02,z,.009,.012,.09);box(g,'#c8ac78',x,.02,z+s*.045,.11,.012,.009);}for(let k=0;k<3;k++)disc(g,'#dee0c7',x-.035+k*.035,.033,z,.006,.006);}
      boat(.35,.33,0,true);islands(2,.34,-.11);house(g,-.38,-.37);waterMotion();host(-.12,.025,-.26);
    }else if(['island-village','dune-island','twin-island'].includes(p.model)){
      const twin=p.model==='twin-island';
      ellipse(g,'#c8c99e',twin?-.24:0,0,twin?.27:.52,.33,.014);ellipse(g,'#97b080',twin?-.24:0,-.03,twin?.23:.45,.26,.023);
      if(twin){
        ellipse(g,'#bdc49c',.31,-.02,.23,.32,.014);grove(.31,-.23,.13,.06,17);grove(-.30,-.19,.12,.06,16);
        paths.push([[-.40,.045,.12],[-.2,.045,.04],[.15,.045,.04],[.36,.045,.12]]);
        for(const [x,z] of [[-.37,-.08],[-.20,-.09],[.26,-.10],[.40,-.08]])house(g,x,z,.12,.09,.10+(x>.3?.03:0),.031);
        paths.push([[-.41,.043,.16],[-.35,.043,.23],[-.16,.043,.24],[-.09,.043,.16],[-.20,.045,.04]],[[.18,.044,.12],[.23,.044,.24],[.36,.044,.25],[.44,.044,.13]]);
        for(const x of [-.31,.29]){disc(g,'#a78a61',x,.055,.17,.023,.008);for(const dx of [-.011,.011])disc(g,'#ede4ca',x+dx,.064,.17,.004,.004);host(x-.05,.042,.17,'sit');}
        for(let i=0;i<6;i++)rock(-.43+i*.05,.25,.013,.8,.024);
        box(g,'#8fafa0',.47,.020,.26,.034,.026,.21);boat(.45,.38,2);sign(g,'渔村茶铺',-.20,.10,-.04,.09,.024);
      }
      else if(p.model==='island-village'){
        for(let i=0;i<5;i++)house(g,-.31+i*.155,-.14,.12,.09,.08+(i%2)*.03,.033);
        grove(-.32,.12,.12,.11,18);for(let i=0;i<5;i++)rock(.3+i*.023,.18,.025,1.4);
        paths.push([[-.35,.034,.015],[.30,.034,.015],[.39,.034,.13]]);host(.12,.034,.015);boat(.12,.39,1);
        for(let i=0;i<5;i++){const b=new THREE.Group();g.add(b);dynamic.push(b);b.position.set(.27+i*.025,.055,.13+(i%2)*.033);mesh(b,new THREE.SphereGeometry(.007,6,5),'#f0efe0');beam(b,[0,0,0],[.004,.014,0],'#eeeede',.002);mesh(b,new THREE.SphereGeometry(.004,6,4),'#eeefdf',.004,.017,0);animations.push(t=>b.rotation.y=Math.sin(t*.5+i)*.25);}
      }else{
        grove(0,-.19,.36,.07,32,'pine',.033);grove(-.37,-.04,.075,.1,13,'broadleaf',.033);
        paths.push([[-.39,.044,.12],[-.12,.044,.19],[.2,.044,.17],[.39,.044,.06]],[[.39,.044,.06],[.31,.044,-.03],[.10,.044,-.06],[-.15,.044,-.07],[-.27,.044,.01],[-.39,.044,.12]]);
        for(let i=0;i<3;i++){const x=-.15+i*.16;box(g,'#b18b75',x,.034,.08,.09,.004,.04);host(x,.038,.08,'sit');disc(g,'#d9d3b4',x+.015,.04,.07,.013,.003);}
        roof(g,.24,.17,-.04,.15,.11);for(const dx of [-.055,.055])beam(g,[.24+dx,.035,-.04],[.24+dx,.17,-.04]);
        for(let i=0;i<9;i++)rock(.29+i*.014,.16+(i%3)*.025,.017,1.3,.028);
        for(let i=0;i<10;i++)tree(g,-.23+i*.045,.033,-.105,.032,i%3?'broadleaf':'flowering');rock(.38,-.1,.044,1.2);
      }
      waterMotion();
    }else if(p.model==='open-beach'){
      slab(g,'#ded6b3',[[-.6,-.46],[.6,-.46],[.6,.08],[.3,-.04],[0,-.10],[-.3,-.03],[-.6,.10]],.016);
      paths.push([[-.53,.028,-.16],[-.26,.028,-.23],[0,.028,-.25],[.28,.028,-.22],[.53,.028,-.16]]);
      grove(0,-.38,.50,.065,25,'palm');roof(g,.31,.16,-.32,.16,.13);for(const s of [-1,1])beam(g,[.31+s*.05,.02,-.32],[.31+s*.05,.16,-.32]);host(-.10,.028,-.23,'sit');waterMotion();
    }else if(p.model==='inscribed-cliff'){
      for(let i=0;i<10;i++)rock(-.30+(i%5)*.12,-.15+Math.floor(i/5)*.08,.075,1.8+(i%3)*.4);
      box(g,'#a6b09f',.02,.06,.00,.28,.21,.06);sign(g,'粤东一壁',.02,.22,.032,.23,.055,'#727d70');
      grove(-.39,-.02,.08,.27,23,'pine');grove(.39,-.12,.08,.24,20,'broadleaf');
      paths.push([[-.48,.025,.31],[-.20,.025,.18],[.29,.025,.17],[.34,.10,-.03],[.30,.22,-.25]]);trail(g,paths[0],.045,true);roof(g,.30,.32,-.25,.14,.10);for(const x of [.26,.34])beam(g,[x,.22,-.25],[x,.32,-.25]);host(.25,.025,.17,'look');
    }else if(p.model==='wetland-resort'){
      ellipse(g,'#639f99',-.12,0,.38,.26,.012);grove(-.42,-.22,.07,.13,17,'bamboo');grove(.40,-.26,.09,.12,17,'bamboo');
      house(g,.3,.06,.24,.19,.13);house(g,.06,-.33,.23,.12,.10);
      paths.push([[-.42,.044,.28],[-.29,.044,.12],[-.13,.044,.10],[-.07,.044,-.12],[.19,.044,-.17],[.31,.044,-.1]],[[.33,.025,.31],[.33,.025,.21],[-.42,.044,.28]]);trail(g,paths[0],.047,true);
      for(let i=0;i<9;i++){const a=i*2.4;ellipse(g,'#91b36e',-.17+Math.cos(a)*.14,Math.sin(a)*.1,.012,.008,.022);}host(.33,.025,.21,'sit');
    }else if(p.model==='pothole-valley'){
      slab(g,'#6baba3',[[-.48,-.43],[-.26,-.42],[-.12,-.12],[.15,.04],[.32,.46],[.11,.46],[-.08,.13],[-.31,-.09]],.016);
      for(let i=0;i<15;i++){const x=-.3+(i%5)*.13,z=-.24+Math.floor(i/5)*.17,r=.035+(i%3)*.008;const ring=mesh(g,new THREE.TorusGeometry(r,.014,6,14),'#b6b6a4',x,.029,z);ring.rotation.x=-Math.PI/2;ellipse(g,'#4b8789',x,z,r-.013,r-.013,.023);}
      grove(-.48,-.05,.045,.3,25,'broadleaf');grove(.46,-.03,.055,.31,25,'bamboo');paths.push([[-.43,.061,.34],[-.36,.061,.23],[.34,.061,.23],[.37,.061,-.30]]);trail(g,paths[0],.035,true);host(.32,.061,.23,'look');
    }else if(p.model==='octagonal-tulou'){
      ellipse(g,'#cfcdb7',0,0,.49,.43,.015);
      for(let ring=0;ring<3;ring++)for(let side=0;side<8;side++){
        const a=side*Math.PI/4,r=.39-ring*.09,h=.20-ring*.061,w=2*r*Math.tan(Math.PI/8)-.012;
        const wing=new THREE.Group();wing.position.set(Math.sin(a)*r,.02,Math.cos(a)*r);wing.rotation.y=a;g.add(wing);
        if(side===0){for(const s of [-1,1]){box(wing,'#c1ac83',s*(w+.06)/4,0,0,(w-.06)/2,h,.055);}box(wing,'#c1ac83',0,.075,0,.063,h-.075,.055);}
        else box(wing,'#c1ac83',0,0,0,w,h,.055);
        roof(wing,0,h,0,w+.015,.072);
        for(let j=0;j<5;j++){const x=-w*.4+j*w*.2;for(let floor=0;floor<(ring===0?3:1);floor++)if(!(side===0&&Math.abs(x)<.035))box(wing,'#617064',x,.024+floor*.055,-.029,.014,.027,.005);}
      }
      for(const x of [-.08,.08]){disc(g,'#8f9e8e',x,.021,.015,.021,.025);ellipse(g,'#3e7379',x,.015,.014,.014,.048);}
      sign(g,'道韵楼',0,.18,.423,.12,.03);paths.push([[0,.023,.45],[0,.023,.15],[0,.023,-.10]],[[0,.023,.10],[-.12,.023,.10],[-.12,.023,-.11],[.12,.023,-.11],[.12,.023,.10],[0,.023,.10]]);host(.10,.023,-.08,'wave');
      g.userData.octagonalRings=3;
    }else if(['old-lanes','coastal-fort'].includes(p.model)){
      box(g,'#cbd0bc',0,.007,0,1.07,.009,.85);
      for(let i=0;i<3;i++)for(const s of [-1,1])house(g,s*.27,-.28+i*.22,.27,.16,.095+(i%2)*.04);
      paths.push([[0,.026,-.38],[0,.026,.40]],[[-.48,.026,.03],[.48,.026,.03]]);
      if(p.model==='coastal-fort'){
        for(const z of [-.43,.43]){for(const s of [-1,1])box(g,'#969f8c',s*.29,.018,z,.48,.105,.034);box(g,'#a3ad98',0,.096,z,.11,.05,.06);roof(g,0,.19,z,.20,.12);}
        for(const s of [-1,1])box(g,'#969f8c',s*.54,.018,0,.03,.105,.88);
        for(let i=0;i<24;i++)for(const z of [-.43,.43])box(g,'#acb49e',-.51+i*.045,.124,z,.025,.02,.04);
      }else{for(const s of [-1,1])box(g,'#aeb8a3',s*.07,.02,.32,.024,.16,.024);roof(g,0,.19,.32,.25,.075);sign(g,'三饶古城',0,.155,.34,.18,.029);for(const x of [-.42,.42]){disc(g,'#998363',x,.043,.15,.03,.01);host(x,.023,.19,'sit');}}
    }else if(['memorial-hall','island-temple'].includes(p.model)){
      box(g,'#c8cbb6',0,.007,0,.88,.012,.73);house(g,0,-.19,.43,.20,.16);for(const s of [-1,1])house(g,s*.33,.0,.13,.30,.11);
      paths.push([[-.2,.025,.26],[-.2,.025,-.06],[.2,.025,-.06],[.2,.025,.26]],[[0,.025,.4],[0,.025,.23]]);
      if(p.model==='memorial-hall'){sign(g,'茂芝会议旧址',0,.15,-.083,.32,.032,'#9a6053');for(let i=0;i<3;i++){box(g,'#a97a65',-.13+i*.13,.02,.11,.085,.08,.015);host(-.13+i*.13,.024,.17,'look');}}
      else{sign(g,'隆福寺',0,.14,-.083,.16,.035);disc(g,'#778376',0,.021,.10,.035,.047);for(const x of [-.47,.47])tree(g,x,.02,-.16,.14,'broadleaf');host(.13,.025,.24,'look');}
    }else if(p.model==='lake-islands'){
      islands(8);grove(-.53,-.24,.035,.18,14,'pine');
      slab(g,'#91a77c',[[-.6,-.48],[.6,-.48],[.6,-.31],[-.40,-.31],[-.47,.48],[-.6,.48]],.014);
      paths.push([[-.53,.034,.39],[-.51,.034,-.29],[.49,.034,-.36]]);trail(g,paths[0],.04,true);
      box(g,'#afb7a5',.40,.015,.29,.34,.07,.045);for(let i=0;i<5;i++)box(g,'#e0dec9',.27+i*.065,.087,.29,.014,.035,.05);
      boat(.19,.36,0,true);waterMotion();host(-.51,.034,.19,'look');
    }else if(p.model==='old-port'){
      box(g,'#b6c4ae',0,.009,-.24,1.20,.01,.46);
      for(let i=0;i<5;i++){house(g,-.44+i*.21,-.31,.16,.15,.14);sign(g,i%2?'鱼市':'茶铺',-.44+i*.21,.09,-.23,.09,.022);}
      paths.push([[-.52,.027,-.12],[.51,.027,-.12]],[[.43,.035,-.12],[.43,.035,.36]]);trail(g,paths[1],.05,true);
      for(let i=0;i<4;i++)boat(-.35+i*.2,.12,i);host(.20,.027,-.12);waterMotion();
    }else if(p.model==='stone-pagoda'){
      ellipse(g,'#a3b487',0,0,.35,.31,.012);
      for(let i=0;i<6;i++){const r=.092-i*.009,y=.023+i*.061;mesh(g,new THREE.CylinderGeometry(r,r+.003,.052,8),'#b6b9a4',0,y+.026,0);mesh(g,new THREE.CylinderGeometry(r+.015,r+.024,.01,8),'#7d8e7d',0,y+.055,0);for(const s of [-1,1])box(g,'#4c6461',s*r*.68,y+.012,r*.72,.015,.027,.007);}
      mesh(g,new THREE.ConeGeometry(.025,.06,8),'#819482',0,.43,0);grove(-.39,-.05,.08,.23,21,'pine');grove(.38,-.05,.09,.23,20,'pine');paths.push([[-.37,.024,.28],[-.18,.024,.20],[.16,.024,.20],[.28,.024,.03],[.19,.024,-.23]]);host(.13,.024,.20,'look');
    }else if(p.model==='cliff-battery'){
      slab(g,'#a8b193',[[-.59,-.48],[.59,-.48],[.5,.1],[.25,.19],[-.2,.15],[-.5,.05]],.02);
      for(let i=0;i<9;i++)rock(-.45+i*.11,.13,.05,1.4);
      box(g,'#aeb39c',0,.022,-.1,.72,.06,.33);box(g,'#8d9c8a',0,.082,.075,.78,.065,.04);
      for(let i=0;i<3;i++){const x=-.23+i*.23;box(g,'#758271',x,.083,-.03,.085,.03,.06);beam(g,[x,.123,-.03],[x,.146,.11],'#3e5658',.016);}
      paths.push([[-.37,.085,-.18],[.35,.085,-.18]]);grove(0,-.36,.4,.045,24);host(.31,.085,-.18,'look');waterMotion();
    }else if(p.model==='river-town'){
      const banks=[];for(let i=0;i<=20;i++){const z=-.47+i*.047,x=Math.sin(z*5)*.1;banks.push([x-.105,z]);}for(let i=20;i>=0;i--){const z=-.47+i*.047;banks.push([Math.sin(z*5)*.1+.105,z]);}slab(g,'#529ca4',banks,.015);
      for(const s of [-1,1]){const line=[];for(let i=0;i<=16;i++){const z=-.4+i*.05;line.push([Math.sin(z*5)*.1+s*.145,.029,z]);}paths.push(line);trail(g,line,.038,true);for(let i=0;i<4;i++){house(g,s*.39,-.33+i*.22,.17,.13,.14+(i%2)*.08);tree(g,s*.24,.02,-.33+i*.21,.05,'broadleaf');}}
      paths.push([[-.24,.063,.0],[.24,.063,.0]]);trail(g,paths[2],.065,true);for(const s of [-1,1])box(g,'#8fa99c',s*.13,.016,0,.025,.04,.09);boat(.10,.29,1,true,.55,.025);host(.23,.029,.27);
    }else if(p.model==='civic-centre'){
      box(g,'#cbd0bf',0,.006,0,1.18,.01,.91);box(g,'#607378',0,.018,0,1.18,.006,.11);box(g,'#607378',0,.018,0,.11,.006,.91);
      for(const s of [-1,1])for(const z of [-.3,.25]){house(g,s*.31,z,.27,.18,s<0?.21:.14);sign(g,z<0?'餐厅':'商店',s*.31,.07,z+.095,.13,.026);}
      for(let i=0;i<8;i++)if(Math.abs(-.52+i*.15)>.09)box(g,'#dde2d3',-.52+i*.15,.025,0,.06,.002,.006);
      for(const z of [-.11,.11])for(let i=0;i<6;i++)box(g,'#e8e7d6',-.049+i*.019,.025,z,.011,.002,.055);
      paths.push(perimeter,[[-.48,.027,.09],[-.13,.027,.09],[-.13,.027,.36]],[[.13,.027,-.36],[.13,.027,-.09],[.48,.027,-.09]]);
      const bus=vehicle(g,'bus',.034);bus.position.set(.35,.026,.025);dynamic.push(bus);box(g,'#6a9187',.40,.026,.14,.15,.11,.017);box(g,'#95ae9c',.40,.14,.11,.18,.006,.08);host(.36,.027,.10,'look');host(-.21,.027,.10,'wave');
    }else if(p.model==='tea-terraces'){
      for(let row=0;row<7;row++){const z=-.34+row*.09,y=.025+(6-row)*.027,w=.43+row*.07;box(g,'#8f9c6f',-.03,y-.027,z,w,.027,.087);for(let i=0;i<12;i++){const x=-w/2+.02+i*(w-.04)/11;const m=mesh(g,new THREE.SphereGeometry(.022,6,4),row%2?'#668e59':'#789e61',x,y+.016,z);m.scale.set(1,.60,.9);}paths.push([[-w/2+.009,y+.027,z+.04],[w/2-.009,y+.027,z+.04]]);if(row%2===0){host(w*.26,y+.027,z+.04,'look');disc(g,'#a58f65',w*.26+.025,y+.028,z+.04,.012,.015);}}
      house(g,.39,-.32,.18,.12,.10);grove(-.48,-.30,.045,.12,16,'pine');paths.push([[-.50,.025,.34],[.49,.025,.34],[.49,.22,-.22]]);host(.15,.025,.34,'sit');
    }
    if(!paths.length)paths.push(perimeter);
    for(const line of paths){trail(g,line);const points=[];for(let i=1;i<line.length;i++){const a=new THREE.Vector3(...line[i-1]),b=new THREE.Vector3(...line[i]),n=Math.max(2,Math.ceil(a.distanceTo(b)/.025));for(let j=i===1?0:1;j<=n;j++)points.push(a.clone().lerp(b,j/n).multiplyScalar(p.displayScale).add(g.position));}routes.push(points);}
    addExhibitInfill({group:g,place:p,paths});
    obstacles.push(...settleExhibitHosts({group:g,actors:actors.filter(a=>a.root.parent===g),paths}));
    coverage.push({id:p.id,paths:paths.length});for(const o of dynamic)g.remove(o);batchStatic(g);for(const o of dynamic)g.add(o);g.traverse(o=>{if(o.isMesh)o.userData.landmarkId=p.id;});models.push({id:p.id,type:p.model,group:g});
  }
  const streetLife=buildWalkwayCrowd({parent:group,preparedWalkways:routes,population:routes.length*9,obstacles});
  const update=t=>{streetLife.update(t);for(const animate of animations)animate(t);};update(0);
  return {group,models,streetLife,update,stats:{places:places.length,models:models.length,people:streetLife.count+actors.length,coverage,animations:animations.length}};
}
