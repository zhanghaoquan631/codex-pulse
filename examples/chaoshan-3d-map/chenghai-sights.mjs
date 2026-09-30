import * as THREE from 'three';
import {box,disc,tree,sign,material,person,vehicle} from './scene-miniatures.mjs';
import {batchStatic} from './static-batch.mjs';
import {addExhibitInfill} from './exhibit-infill.mjs';
import {buildWalkwayCrowd,settleExhibitHosts} from './walkway-crowds.mjs';
import {chenghaiPlaces} from './chenghai-places.mjs';

export function buildChenghaiSights({parent,places=chenghaiPlaces,heightAt,waterAt}){
  const group=new THREE.Group();group.name='chenghai-heritage-toys-and-hanjiang';parent.add(group);
  const models=[],routes=[],actors=[],animations=[],coverage=[],obstacles=[];
  const mesh=(g,geo,color,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geo,material(color));m.position.set(x,y,z);g.add(m);return m;};
  const oval=(g,c,x,y,z,rx,rz)=>{const m=disc(g,c,x,y,z,1,.006);m.scale.set(rx,1,rz);return m;};
  const beam=(g,a,b,c='#7d8e82',r=.004)=>{const u=new THREE.Vector3(...a),v=new THREE.Vector3(...b).sub(u);const m=mesh(g,new THREE.CylinderGeometry(r,r,v.length(),6),c);m.position.copy(u).addScaledVector(v,.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return m;};
  const roof=(g,x,y,z,w,d)=>{
    const geo=new THREE.BufferGeometry(),points=[];
    for(const s of [-1,1])for(const v of [[-w/2,0,s*d/2],[-w/2,.034,0],[w/2,0,s*d/2],[w/2,0,s*d/2],[-w/2,.034,0],[w/2,.034,0]])points.push(...v);
    geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geo.computeVertexNormals();const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#42645e',side:THREE.DoubleSide}));m.position.set(x,y,z);g.add(m);
    box(g,'#ba8068',x,y+.034,z,w,.007,.009);for(const s of [-1,1])beam(g,[x+s*w/2,y+.038,z],[x+s*(w/2+.012),y+.052,z],'#ba8068');
  };
  const house=(g,x,z,w=.18,d=.14,h=.12,western=false)=>{
    box(g,western?'#e0d3b3':'#d2d7c7',x,.016,z,w,h,d);
    if(western){box(g,'#ece5cf',x,h+.016,z,w+.02,.016,d+.02);box(g,'#c39b80',x,h+.032,z,w+.014,.020,.014);}
    else roof(g,x,h+.017,z,w+.018,d+.02);
    const front=z+d/2+.005;
    for(let row=0;row<(h>.17?2:1);row++)for(const s of [-1,1]){box(g,'#518d8d',x+s*w*.29,.05+row*.085,front,w*.19,.038,.006);box(g,'#f1e8d0',x+s*w*.29,.051+row*.085,front+.004,.003,.037,.004);}
    box(g,'#7b5c49',x,.017,front,.032,.052,.006);
    if(western)for(let i=0;i<4;i++){
      const xx=x-w*.39+i*w*.26;beam(g,[xx,.018,front+.019],[xx,h+.014,front+.019],'#eee6cd',.004);
      if(i<3){const arch=mesh(g,new THREE.TorusGeometry(w*.13,.003,4,12,Math.PI),'#eee6cd',xx+w*.13,h-.02,front+.019);arch.rotation.z=0;}
    }
  };
  for(const [index,p] of places.entries()){
    const g=new THREE.Group();g.name=p.id;g.scale.setScalar(p.displayScale);group.add(g);
    const heights=[];for(let i=0;i<=12;i++)for(let j=0;j<=10;j++)heights.push(heightAt(p.x+(-.62+i*.103)*p.displayScale,p.z+(-.5+j*.1)*p.displayScale));
    const ground=Math.max(...heights,waterAt(p.x,p.z)??-Infinity)+.025,depth=Math.max(.03,(ground-Math.min(...heights))/p.displayScale);
    g.position.set(p.x,ground,p.z);p.sceneY=ground;box(g,'#8fa58e',0,-depth,0,1.24,depth,.98);box(g,'#9fb789',0,0,0,1.22,.010,.96);
    const paths=[],dynamic=[],localActors=[];
    const path=(pts,width=.046,rail=false)=>{
      paths.push(pts);
      for(let i=1;i<pts.length;i++){
        const a=new THREE.Vector3(...pts[i-1]),b=new THREE.Vector3(...pts[i]),v=b.clone().sub(a),len=v.length();if(len<1e-6)continue;
        const m=box(g,'#c4cbbb',0,0,0,width,.008,len);m.position.copy(a).add(b).multiplyScalar(.5);m.position.y-=.004;m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),v.clone().normalize());
        if(rail){const n=Math.hypot(v.x,v.z);for(const s of [-1,1]){const dx=v.z/n*width*.6*s,dz=-v.x/n*width*.6*s;beam(g,[a.x+dx,a.y+.026,a.z+dz],[b.x+dx,b.y+.026,b.z+dz]);for(let k=0;k<=Math.ceil(len/.07);k++){const q=a.clone().lerp(b,k/Math.ceil(len/.07));beam(g,[q.x+dx,q.y,q.z+dz],[q.x+dx,q.y+.027,q.z+dz]);}}}
      }return pts;
    };
    const host=(x,z,state='look',y=.028)=>{
      const a=person(g,index+actors.length,{scale:.015});a.root.position.set(x,y,z);actors.push(a);localActors.push(a);dynamic.push(a.root);
      animations.push(t=>a.pose(t*.45,state==='wave'?(Math.sin(t*.28+index)>.94?'wave':'look'):state));return a;
    };
    const grove=(cx,cz,rx,rz,count=25,type='broadleaf',surface=()=>.016)=>{for(let i=0;i<count;i++){const a=i*2.399,r=Math.sqrt((i+.5)/count),x=cx+Math.cos(a)*rx*r,z=cz+Math.sin(a)*rz*r;tree(g,x,surface(x,z),z,.046+(i%5)*.009,type);}};
    const rock=(x,z,r=.05,y=.019,h=1)=>{const m=mesh(g,new THREE.DodecahedronGeometry(r,0),'#aab4a4',x,y+r*h*.6,z);m.scale.set(1,h,.83);m.rotation.y=x*11+z*3;};
    const garden=()=>{grove(-.55,0,.025,.38,22);grove(.55,0,.025,.38,22,'palm');};
    const loop=(rx=.49,rz=.37,y=.028)=>path([[-rx,y,rz],[-rx,y,-rz],[rx,y,-rz],[rx,y,rz],[-rx,y,rz]]);
    const tea=(x,z)=>{disc(g,'#a48762',x,.025,z,.033,.027);for(let i=0;i<3;i++)disc(g,'#ede4cc',x-.018+i*.018,.054,z,.005,.006);disc(g,'#a66e50',x,.054,z-.012,.008,.012);host(x-.053,z,'sit');host(x+.053,z,'sit');};
    const pavilion=(x,z,y=.018)=>{for(const sx of [-1,1])for(const sz of [-1,1])beam(g,[x+sx*.046,y,z+sz*.038],[x+sx*.046,y+.12,z+sz*.038],'#9d785d',.005);roof(g,x,y+.12,z,.15,.13);};
    const water=(x,z,w,d)=>{box(g,'#5b9fa7',x,.014,z,w,.006,d);for(let row=0;row<3;row++){const pts=[];for(let k=0;k<20;k++)pts.push(new THREE.Vector3(x-w*.40+k*w*.8/19,.024,z+(row-1)*d*.23+Math.sin(k*.5)*.006));const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:'#bfdfd9',transparent:true,opacity:.43}));g.add(line);dynamic.push(line);animations.push(t=>line.position.z=Math.sin(t*.6+row)*.005);}};
    const boat=(cx,cz,rx,rz,red=false)=>{
      const b=new THREE.Group();g.add(b);dynamic.push(b);b.userData.vessel=true;
      const shape=new THREE.Shape();shape.moveTo(-.032,-.061);shape.lineTo(.032,-.061);shape.lineTo(.04,.033);shape.lineTo(0,.088);shape.lineTo(-.04,.033);shape.closePath();
      const geo=new THREE.ExtrudeGeometry(shape,{depth:.022,bevelEnabled:false});geo.rotateX(-Math.PI/2);mesh(b,geo,red?'#965c42':'#527b80');box(b,'#bc956d',0,.023,0,.053,.006,.094);
      if(red){const bow=mesh(b,new THREE.ConeGeometry(.039,.036,3),'#bd5146',0,.032,-.066);bow.rotation.x=-Math.PI/2;beam(b,[0,.024,.01],[0,.22,.01],'#99754f',.004);for(let i=0;i<4;i++){const sail=box(b,'#e4d7b2',0,.07+i*.032,.014,.10-i*.013,.029,.004);sail.rotation.y=-.20;}beam(b,[-.05,.21,.008],[.05,.075,.008],'#968164',.0015);}
      else box(b,'#e7e3d2',0,.03,-.018,.037,.03,.032);
      animations.push(t=>{const a=t*.12+index;b.position.set(cx+Math.cos(a)*rx,.029,cz+Math.sin(a)*rz);b.rotation.y=Math.atan2(-Math.sin(a)*rx,Math.cos(a)*rz);b.rotation.z=Math.sin(t*1.2)*.009;});return b;
    };
    const terrain=(f)=>{const geo=new THREE.PlaneGeometry(1.2,.94,32,28);geo.rotateX(-Math.PI/2);const v=geo.attributes.position,colors=[];for(let i=0;i<v.count;i++){const y=f(v.getX(i),v.getZ(i));v.setY(i,y);const c=new THREE.Color(y>.23?'#8fa579':y>.10?'#71986a':'#a1b789');colors.push(c.r,c.g,c.b);}geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();g.add(new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true})));};
    g.userData.program=p.model;
    if(p.model==='heritage-village'){
      box(g,'#c2c9b6',0,.011,-.05,1.08,.006,.69);
      for(const x of [-.36,-.17,.17,.36])for(let j=0;j<3;j++)house(g,x,-.29+j*.19,.145,.125,.10+(j%2)*.035,j===0);
      path([[0,.03,-.39],[0,.03,.26],[.48,.03,.26]],.061);for(const x of [-.265,.265])path([[x,.03,-.39],[x,.03,.26]],.03);
      path([[-.5,.03,-.195],[.5,.03,-.195]],.028);path([[-.5,.03,.26],[0,.03,.26]]);
      oval(g,'#6ba4a0',-.20,.02,.37,.20,.06);pavilion(.35,.37);garden();tea(.1,.36);
    }else if(p.model==='diaspora-mansion'){
      box(g,'#c8cdbb',0,.011,0,1.1,.008,.87);
      for(const z of [-.28,.09]){house(g,0,z,.52,.13,.19,true);for(const s of [-1,1])house(g,s*.33,z+.065,.12,.22,.16,true);}
      for(const z of [-.075,.30])for(let ix=0;ix<9;ix++)for(let iz=0;iz<3;iz++)box(g,(ix+iz)%2?'#6c9c9b':'#e4d9bd',-.18+ix*.045,.022,z+iz*.032,.042,.003,.029);
      path([[-.46,.032,.4],[-.46,.032,-.4],[.46,.032,-.4],[.46,.032,.4],[-.46,.032,.4]]);
      path([[-.46,.032,-.075],[.46,.032,-.075]],.045);path([[-.46,.032,.31],[.46,.032,.31]],.045);garden();host(.18,-.075);host(-.16,.31);g.userData.arcadedCourts=2;
    }else if(p.model==='fortress'){
      box(g,'#c1c8b3',0,.013,0,1.06,.008,.84);
      for(const s of [-1,1]){box(g,'#aeb7a0',s*.51,.02,0,.024,.13,.84);box(g,'#aeb7a0',s*.30,.02,.41,.38,.13,.023);house(g,s*.45,-.33,.12,.12,.23);house(g,s*.28,-.13,.18,.15,.13);house(g,s*.28,.16,.18,.15,.12);}
      box(g,'#aeb7a0',0,.02,-.41,1.04,.13,.024);roof(g,0,.18,.40,.22,.09);loop(.12,.32);path([[0,.03,.32],[0,.03,.45]]);disc(g,'#859684',0,.022,0,.033,.045);oval(g,'#5b9295',0,.068,0,.023,.023);host(.09,.11);
    }else if(p.model==='garden-villa'){
      house(g,-.21,-.17,.38,.25,.23,true);house(g,.27,-.22,.19,.19,.13,true);oval(g,'#609f9b',.26,.017,.10,.17,.13);pavilion(.35,.34);
      path([[-.48,.03,.35],[-.48,.03,-.38],[.48,.03,-.38],[.48,.03,.35],[-.48,.03,.35]]);path([[-.48,.03,.08],[.04,.03,.08],[.04,.03,.35]]);
      grove(-.19,.24,.20,.06,17,'flowering');tea(-.20,.36);garden();
    }else if(['paddy-country','orchard-farm'].includes(p.model)){
      const orchard=p.model==='orchard-farm';house(g,-.32,-.28,.28,.17,.14);house(g,.29,-.28,.26,.16,.11);garden();
      for(let i=0;i<8;i++){const x=-.39+i%4*.26,z=-.02+Math.floor(i/4)*.22;box(g,orchard?'#829d62':'#bac36e',x,.014,z,.20,.014,.15);
        if(orchard){tree(g,x,.03,z,.085,'broadleaf');for(let j=0;j<4;j++)mesh(g,new THREE.SphereGeometry(.006,5,4),'#d9af54',x+Math.sin(j*2)*.025,.096,z+Math.cos(j*2)*.025);}
        else for(let k=0;k<6;k++)box(g,'#729650',x-.08+k*.03,.03,z,.008,.012,.13);
      }
      path([[-.52,.032,.36],[-.52,.032,-.12],[.52,.032,-.12],[.52,.032,.36],[-.52,.032,.36]]);path([[-.52,.032,.105],[.52,.032,.105]],.035);
      box(g,'#679e9c',0,.015,.43,1.08,.008,.027);path([[0,.032,-.39],[0,.032,-.12]]);pavilion(.37,.36);host(-.30,.35);host(.23,.10);g.userData.fields=8;
    }else if(p.model==='mountain-trails'){
      const f=(x,z)=>.018+.31*Math.exp(-((x+.18)**2+(z+.15)**2)/.065)+.22*Math.exp(-((x-.29)**2+(z+.12)**2)/.035);terrain(f);
      grove(-.35,.03,.18,.29,55,'broadleaf',f);grove(.33,.02,.17,.30,50,'pine',f);
      const pts=[];for(let i=0;i<45;i++){const z=.38-i*.015,x=Math.sin(i*.115)*.15;pts.push([x,f(x,z)+.014,z]);}path(pts,.041,true);const end=pts.at(-1);pavilion(end[0],end[2],end[1]);host(pts[12][0],pts[12][2],'look',pts[12][1]);
      for(let i=0;i<7;i++)rock(-.24+i*.03,-.20,.029,f(-.24+i*.03,-.20),1.8);
    }else if(p.model==='thermal-garden'){
      house(g,0,-.29,.55,.16,.12);for(const [x,z,r] of [[-.25,-.02,.10],[.23,.04,.13],[-.20,.23,.08]]){oval(g,'#babd9f',x,.018,z,r+.022,r*.75+.022);oval(g,'#8ec3ba',x,.026,z,r,r*.75);for(let k=0;k<5;k++)rock(x+Math.cos(k*1.25)*(r+.019),z+Math.sin(k*1.25)*(r*.75+.019),.015);}
      loop(.45,.35);path([[-.45,.033,.12],[.03,.033,.12],[.03,.033,-.16],[.45,.033,-.16]]);garden();grove(0,-.42,.44,.026,24,'bamboo');pavilion(.25,.31);tea(-.10,.37);
    }else if(p.model==='temple-lake'){
      house(g,-.22,-.24,.40,.17,.16);house(g,.30,-.24,.20,.16,.12);oval(g,'#609f9d',.19,.017,.12,.25,.18);pavilion(.36,.35);
      for(let j=0;j<4;j++){box(g,'#b7baa2',-.30,.02+j*.063,.12,.11-j*.017,.064,.10-j*.016);roof(g,-.30,.083+j*.063,.12,.15-j*.019,.13-j*.016);}
      loop(.49,.38);path([[-.49,.032,-.10],[.49,.032,-.10]],.045);path([[-.10,.032,-.10],[-.10,.032,.38]],.045);garden();grove(-.20,-.40,.27,.025,23,'pine');host(-.10,.19);
    }else if(p.model==='memorial-court'){
      house(g,0,-.23,.47,.18,.17);house(g,-.36,-.03,.14,.27,.13);house(g,.36,-.03,.14,.27,.13);sign(g,'唐伯元纪念馆',0,.14,-.132,.30,.031);
      loop(.48,.36);path([[-.48,.031,.20],[.48,.031,.20]]);for(const x of [-.20,0,.20]){box(g,'#9c8264',x,.024,.10,.10,.036,.036);box(g,'#e7e0c8',x,.061,.10,.056,.003,.025);host(x,.15,'look');}grove(0,-.40,.43,.027,24,'pine');garden();
    }else if(p.model==='rocky-beach'){
      water(0,.17,1.2,.59);oval(g,'#d9ceab',-.11,.025,-.12,.51,.19);grove(-.1,-.33,.44,.06,32,'palm');
      path([[-.53,.05,-.15],[-.23,.05,-.21],[.20,.05,-.19],[.51,.05,-.05]],.053,true);pavilion(-.4,-.28);for(let i=0;i<13;i++)rock(.28+(i%4)*.065,-.10+Math.floor(i/4)*.066,.023+i%3*.014,.019,1.5);
      boat(-.10,.28,.27,.07);host(-.25,-.24);host(.12,-.23);g.userData.coastal=true;
    }else if(p.model==='folk-stage'){
      house(g,0,-.29,.43,.16,.14);box(g,'#b2a185',0,.02,-.12,.4,.06,.15);roof(g,0,.23,-.12,.46,.19);
      for(let i=0;i<3;i++)host(-.1+i*.1,-.13,'wave',.08);
      for(let row=0;row<3;row++)for(const x of [-.15,.15]){box(g,'#9f8c68',x,.023,.06+row*.10,.20,.024,.024);host(x,.06+row*.10,'sit');}
      loop(.48,.37);for(const s of [-1,1]){house(g,s*.37,-.16,.14,.19,.10);sign(g,'民俗工艺',s*.37,.093,-.057,.12,.024);}garden();
    }else if(p.model==='botanic-garden'){
      for(const [x,z,type] of [[-.30,-.20,'broadleaf'],[.28,-.20,'palm'],[-.30,.20,'flowering'],[.28,.20,'bamboo']]){oval(g,'#7fa479',x,.015,z,.20,.145);grove(x,z,.16,.105,18,type);}
      loop(.51,.38);path([[-.51,.033,0],[.51,.033,0]]);path([[0,.033,-.38],[0,.033,.38]]);oval(g,'#659f97',.28,.02,.20,.08,.04);
      house(g,0,-.31,.15,.10,.11,true);sign(g,'千树园',0,.11,-.251,.12,.026);host(0,.11);g.userData.treeCollections=4;
    }else if(p.model==='toy-campus'){
      box(g,'#bfcabb',0,.012,0,1.12,.009,.88);house(g,0,-.27,.61,.18,.20,true);sign(g,'宝奥 · 玩具展馆',0,.16,-.161,.45,.040);
      for(const s of [-1,1])house(g,s*.40,-.03,.15,.25,.13,true);
      for(let i=0;i<5;i++){const x=-.22+i*.11,z=.13;box(g,['#cc6c62','#e0ba56','#71a1ac','#8fac73','#b7a0bf'][i],x,.025,z,.085,.065,.074);for(const dx of [-.02,.02])for(const dz of [-.018,.018])disc(g,'#e7d7a9',x+dx,.09,z+dz,.009,.009);}
      const robot=new THREE.Group();g.add(robot);dynamic.push(robot);robot.position.set(0,.025,-.03);box(robot,'#739aa5',0,.02,0,.066,.08,.045);box(robot,'#d3b75f',0,.105,0,.068,.047,.05);for(const s of [-1,1]){box(robot,'#4b676e',s*.023,0,0,.020,.025,.026);disc(robot,'#d3b75f',s*.052,.07,0,.013,.025);box(robot,'#345862',s*.016,.124,.027,.009,.009,.004);}animations.push(t=>robot.rotation.y=Math.sin(t*.5)*.35);
      loop(.51,.38);path([[-.51,.031,-.14],[.51,.031,-.14]]);path([[-.51,.031,.28],[.51,.031,.28]]);host(.24,.27);host(-.23,.27);garden();g.userData.toyBlocks=5;
    }else if(['river-quays','river-farmland'].includes(p.model)){
      const rural=p.model==='river-farmland';water(0,0,.38,.94);
      for(const s of [-1,1]){path([[s*.245,.043,-.41],[s*.245,.043,.41]],.056,true);for(let j=0;j<4;j++){const z=-.31+j*.21;if(rural){box(g,j%2?'#89a66e':'#b6be73',s*.43,.014,z,.22,.010,.15);for(let k=0;k<5;k++)box(g,'#6d985b',s*.43-.08+k*.04,.025,z,.01,.013,.13);}else house(g,s*.44,z,.20,.15,.12+j%2*.05,j%2===0);tree(g,s*.30,.026,z,.057,'broadleaf');}}
      boat(0,0,.08,.29);if(rural){path([[-.26,.13,.29],[.26,.13,.29]],.05,true);for(const s of [-1,1])beam(g,[s*.17,.02,.29],[s*.17,.13,.29]);}else tea(-.41,.41);g.userData.channelWidth=.38;
    }else if(p.model==='urban-blocks'){
      box(g,'#bfc9b9',0,.012,0,1.12,.008,.87);for(const x of [-.29,0,.29]){house(g,x,-.27,.21,.16,.22+Math.abs(x)*.23,true);sign(g,'玩具商店',x,.09,-.178,.15,.025);}
      for(const x of [-.29,.29])house(g,x,.07,.21,.18,.17,true);pavilion(0,.07);loop(.48,.35);path([[-.48,.032,-.12],[.48,.032,-.12]]);path([[0,.032,-.12],[0,.032,.35]]);
      box(g,'#637a7b',0,.014,.43,1.14,.008,.067);for(let i=0;i<10;i++)box(g,'#e4e6cd',-.50+i*.11,.023,.43,.043,.002,.004);
      for(let i=0;i<3;i++){const car=vehicle(g,['sedan','taxi','van'][i],.014);dynamic.push(car);animations.push(t=>{const u=(t*.024+i/3)%1;car.position.set(-.55+u*1.1,.024,.432);car.rotation.y=Math.PI/2;});}garden();g.userData.separatedTraffic=true;
    }else if(p.model==='port-street'){
      water(0,.30,1.20,.33);for(let i=0;i<5;i++){house(g,-.43+i*.215,-.22,.18,.17,.15+i%2*.055,true);sign(g,i%2?'侨乡茶铺':'古港货栈',-.43+i*.215,.09,-.129,.14,.023);}
      path([[-.53,.038,.08],[.53,.038,.08]],.062,true);path([[-.53,.032,-.10],[.53,.032,-.10]],.045);for(const x of [-.53,0,.53])path([[x,.038,.08],[x,.032,-.1]]);boat(0,.31,.32,.025);tea(-.30,.0);grove(0,-.38,.48,.03,28,'palm');
    }else if(p.model==='shellfish-village'){
      water(.20,.12,.77,.63);for(let i=0;i<5;i++){const z=-.11+i*.11;for(let j=0;j<7;j++){disc(g,'#d1bb79',-.07+j*.083,.029,z,.006,.005);}beam(g,[-.07,.03,z],[.43,.03,z],'#769691',.0015);}
      house(g,-.40,-.24,.22,.17,.13);house(g,.05,-.32,.32,.16,.12);path([[-.26,.044,-.36],[-.26,.044,.38],[-.50,.044,.38]],.052,true);path([[-.26,.044,-.21],[.51,.044,-.21]],.05);
      for(let i=0;i<3;i++){box(g,'#ab9873',-.43,.021,.03+i*.10,.14,.035,.05);for(let j=0;j<5;j++)oval(g,'#788d75',-.475+j*.022,.06,.03+i*.10,.008,.006);}host(-.32,.08);grove(-.56,0,.018,.33,20,'palm');boat(.45,.30,.055,.03);g.userData.aquacultureRows=5;
    }else if(p.model==='red-sail-harbour'){
      water(0,.12,1.20,.70);house(g,-.29,-.33,.34,.15,.14,true);house(g,.27,-.33,.34,.15,.13,true);sign(g,'红头船 · 侨批记忆',0,.14,-.244,.30,.032);
      path([[-.54,.044,-.17],[.54,.044,-.17]],.066,true);path([[-.44,.044,-.17],[-.44,.044,.26]],.061,true);for(let i=0;i<6;i++)box(g,'#a0805b',-.35,.025,-.11+i*.056,.045,.036,.038);
      boat(.03,.11,.23,.13,true);host(-.43,.09);host(.27,-.17);grove(0,-.44,.49,.015,20,'palm');g.userData.redHeadedVessel=true;
    }
    if(!paths.length)throw new Error('Missing Chenghai model: '+p.model);
    for(const pts of paths)routes.push(pts.map(a=>new THREE.Vector3(...a).multiplyScalar(p.displayScale).add(g.position)));
    addExhibitInfill({group:g,place:p,paths});
    obstacles.push(...settleExhibitHosts({group:g,actors:localActors,paths}));coverage.push({id:p.id,paths:paths.length});
    for(const o of dynamic)g.remove(o);batchStatic(g);for(const o of dynamic)g.add(o);g.traverse(o=>{if(o.isMesh)o.userData.landmarkId=p.id;});models.push({id:p.id,type:p.model,group:g});
  }
  const streetLife=buildWalkwayCrowd({parent:group,preparedWalkways:routes,population:routes.length*8,obstacles});
  const update=t=>{streetLife.update(t);for(const fn of animations)fn(t);};update(0);
  return {group,models,streetLife,update,stats:{places:places.length,models:models.length,people:streetLife.count+actors.length,animations:animations.length,coverage}};
}
