import * as THREE from 'three';
import {box,disc,sign,tree,vehicle} from './scene-miniatures.mjs';
import {batchStatic} from './static-batch.mjs';
import {addExhibitInfill} from './exhibit-infill.mjs';
import {buildRegionalLife} from './regional-life.mjs';
import {shantouPlaces} from './shantou-places.mjs';

export function buildShantouSights({parent,places=shantouPlaces,heightAt,waterAt}){
  const group=new THREE.Group();group.name='shantou-city-sights';parent.add(group);
  const models=[],routes=[],coverage=[],animations=[],materials=new Map();
  const mat=c=>{if(!materials.has(c))materials.set(c,new THREE.MeshStandardMaterial({color:c,roughness:.85}));return materials.get(c);};
  const mesh=(g,geo,c,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geo,mat(c));m.position.set(x,y,z);g.add(m);return m;};
  const beam=(g,c,a,b,r=.008)=>{const v=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),m=mesh(g,new THREE.CylinderGeometry(r,r,v.length(),6),c);m.position.copy(new THREE.Vector3(...a).addScaledVector(v,.5));m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return m;};
  const roof=(g,x,z,w,d,y,c='#597366')=>{
    const geo=new THREE.BufferGeometry(),v=[];
    for(const side of [-1,1]){const a=[x-w/2,y-.015,z+side*d/2],b=[x+w/2,y-.015,z+side*d/2],c=[x-w*.38,y+.055,z],e=[x+w*.38,y+.055,z];for(const p of [a,c,b,b,c,e])v.push(...p);}
    geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geo.computeVertexNormals();const m=mesh(g,geo,c);m.material.side=THREE.DoubleSide;
    beam(g,'#8c7061',[x-w*.42,y+.055,z],[x+w*.42,y+.055,z],.008);
    for(const s of [-1,1])beam(g,'#9c8770',[x+s*w*.42,y+.055,z],[x+s*w*.55,y+.09,z],.006);
  };
  const arch=(g,x,y,z,w,h,c='#e7e5da')=>{
    for(const s of [-1,1])box(g,c,x+s*w/2,y,z,.012,h,.025);
    const curve=new THREE.EllipseCurve(x,y+h,w/2,.035,0,Math.PI,false);
    const path=new THREE.CatmullRomCurve3(curve.getPoints(12).map(p=>new THREE.Vector3(p.x,p.y,z)));
    mesh(g,new THREE.TubeGeometry(path,12,.007,5,false),c);
  };
  const facade=(g,{x=0,z=-.12,w=.55,d=.22,h=.30,c='#cecfc3',window='#567e83',arcade=true}={})=>{
    box(g,c,x,arcade?.08:0,z,w,h-(arcade?.08:0),d);
    for(let floor=0;floor<3;floor++){
      const y=.12+floor*(h-.12)/3;box(g,'#eee9db',x,y-.018,z+d/2+.008,w+.015,.01,.03);
      for(let i=0;i<5;i++){
        const xx=x+(i-2)*w/5.5;box(g,'#e4dec9',xx,y,z+d/2+.014,w*.13,.065,.008);box(g,window,xx,y+.006,z+d/2+.02,w*.09,.05,.003);
      }
    }
    if(arcade)for(let i=0;i<5;i++)arch(g,x+(i-2)*w/5,0,z+d/2,w/5-.015,.048);
    box(g,'#e6e0cf',x,h,z,w+.028,.012,d+.025);
    for(let i=0;i<7;i++)box(g,c,x+(i-3)*w/7,h+.012,z+d/2,.012,.04,.015);
  };
  const letters=(g,text,x,y,z,w=.5,h=.06,c='#b13e3c')=>{
    if(typeof document==='undefined')return;
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=160;const ctx=canvas.getContext('2d');ctx.fillStyle=c;ctx.font='bold 110px "Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,80,1000);
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map,transparent:true,side:THREE.DoubleSide}));m.position.set(x,y,z);m.userData.sign=true;g.add(m);
  };
  const cottage=(g,x,z,w=.18,d=.17,h=.13)=>{box(g,'#d9cbb8',x,0,z,w,h,d);box(g,'#985c51',x,.005,z+d/2,.04,.075,.008);roof(g,x,z,w+.025,d+.02,h);};
  const rock=(g,x,z,r=.11,y=0)=>{const m=mesh(g,new THREE.DodecahedronGeometry(r,0),'#999f92',x,y+r*.5,z);m.scale.set(.75,1.3,1);m.rotation.y=x*9;return m;};
  const planter=(g,x,z,c='#ba85a0')=>{box(g,'#a3b294',x,0,z,.12,.025,.09);for(let i=0;i<5;i++)mesh(g,new THREE.IcosahedronGeometry(.014,0),c,x+(i-2)*.022,.04,z);};
  const path=(g,points,y=.016,w=.045)=>{
    for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],m=box(g,'#bdcbc3',(a[0]+b[0])/2,y-.008,(a[1]+b[1])/2,w,.008,Math.hypot(dx,dz)+.01);m.rotation.y=Math.atan2(dx,dz);}
  };
  const bench=(g,x,z)=>{box(g,'#859c94',x,.012,z,.10,.02,.034);box(g,'#607c77',x,.032,z-.012,.10,.024,.009);};
  const pavilion=(g,x,z)=>{for(const dx of [-.06,.06])for(const dz of [-.05,.05])box(g,'#a76253',x+dx,0,z+dz,.01,.15,.01);roof(g,x,z,.20,.18,.17);};
  const ferry=(g,x,z,large=false)=>{
    const b=new THREE.Group();b.position.set(x,.015,z);g.add(b);
    const hull=mesh(b,new THREE.CylinderGeometry(.055,.025,.04,6),'#437887',0,0,0);hull.scale.z=large?3:2;
    box(b,'#efe9d5',0,.018,0,.08,.065,large?.23:.13);for(const side of [-1,1])box(b,'#548792',side*.041,.049,0,.003,.021,large?.16:.09);
    box(b,'#c29256',0,.085,0,.07,.013,.10);return b;
  };

  for(const p of places){
    if(p.aliasOf){p.sceneY=heightAt(p.x,p.z)+.04;continue;}
    const g=new THREE.Group();g.name=p.id;g.position.set(p.x,heightAt(p.x,p.z)+.014,p.z);g.scale.setScalar(p.displayScale);g.rotation.y=p.rotation||0;group.add(g);
    const landscape=['queshi','lotus','danying','lianhua'].includes(p.model);
    let level=g.position.y;
    if(!landscape&&p.model!=='bay'&&p.model!=='bridge')for(const dx of [-.6,0,.6])for(const dz of [-.48,0,.48])level=Math.max(level,heightAt(p.x+dx*p.displayScale,p.z+dz*p.displayScale)+.014);
    g.position.y=level;p.sceneY=level;
    let walks=[[[-.48,.30],[.48,.30]]],walkY=.018;
    const dynamic=[];
    if(p.model!=='bay'&&p.model!=='bridge'){
      const ground=new THREE.PlaneGeometry(1.16,.90,18,14);ground.rotateX(-Math.PI/2);
      if(landscape){const a=ground.attributes.position;for(let i=0;i<a.count;i++)a.setY(i,(heightAt(p.x+a.getX(i)*p.displayScale,p.z+a.getZ(i)*p.displayScale)+.01-level)/p.displayScale);ground.computeVertexNormals();}
      mesh(g,ground,['hotel','post','museum','mazu','chen','station'].includes(p.model)?'#cad2c6':'#94af88');
    }
    if(p.model==='hotel'){
      facade(g,{w:.64,h:.45,c:'#a7b0ab',window:'#627775'});letters(g,'汕头旅社',0,.11,.025,.55,.065);
      for(const x of [-.18,.18])disc(g,'#be6250',x,.035,.01,.016,.025);
      for(const x of [-.45,.45]){cottage(g,x,-.08,.17,.23,.20);planter(g,x,.18);}
    }else if(p.model==='post'){
      facade(g,{w:.68,h:.30,c:'#c3b79e',window:'#376e61',arcade:false});
      for(const x of [-.27,-.09,.09,.27])arch(g,x,.016,.02,.105,.13,'#e8dfc5');
      box(g,'#377361',.34,0,.18,.045,.095,.04);letters(g,'汕头邮政总局',0,.33,.02,.52,.04,'#426451');bench(g,-.32,.19);
    }else if(p.model==='museum'){
      facade(g,{w:.60,h:.34,c:'#d7cfbe',window:'#5e777b'});roof(g,0,-.12,.64,.26,.355,'#667571');
      sign(g,'开埠文化陈列馆',0,.095,.035,.37,.036);for(let i=0;i<3;i++)sign(g,['开埠','商埠','侨批'][i],-.31+i*.3,.10,.21,.17,.06,'#947860');
    }else if(p.model==='mazu'||p.model==='dafeng'){
      cottage(g,0,-.16,.49,.26,.18);roof(g,0,-.16,.57,.32,.22,'#b06b51');
      for(let i=0;i<9;i++)mesh(g,new THREE.IcosahedronGeometry(.009,0),['#579a9d','#c39d53','#ad665c'][i%3],(i-4)*.055,.29,-.16);
      for(const x of [-.21,.21]){box(g,'#a94f44',x,0,.0,.014,.17,.014);disc(g,'#cb7154',x,.13,.016,.021,.033);}
      if(p.model==='mazu'){facade(g,{x:.38,z:.02,w:.22,d:.20,h:.21,c:'#b47c60'});sign(g,'老妈宫戏台',.38,.19,.126,.20,.034);}
      else{pavilion(g,-.37,.05);for(const x of [-.48,.45])tree(g,x,0,-.24,.14,'broadleaf');letters(g,'大峰',0,.12,-.02,.16,.05,'#e0c792');}
      walks=[[[-.4,.25],[.28,.25]]];
    }else if(p.model==='chen'||p.model==='qianmei'){
      if(p.model==='chen'){
        for(const x of [-.34,.34])facade(g,{x,z:-.04,w:.12,d:.62,h:.22,c:'#bda98b',arcade:false});
        for(const z of [-.28,-.04,.19]){cottage(g,0,z,.50,.13,.13);for(const x of [-.15,.15])arch(g,x,0,z+.068,.08,.065);}
        for(const z of [-.19,.08])beam(g,'#c2ae91',[-.32,.18,z],[.32,.18,z],.016);
        sign(g,'陈慈黉故居',0,.115,.265,.31,.033,'#825e49');
      }else{
        for(const z of [-.26,-.03])for(let i=0;i<4;i++)cottage(g,-.39+i*.26,z,.20,.16,.11+(i%2)*.03);
        const pond=disc(g,'#679f9a',-.27,.003,.25,.11,.005);pond.scale.z=.65;pavilion(g,.29,.20);tree(g,.5,0,.02,.13,'broadleaf');
      }
      walks=p.model==='chen'?[[[-.49,.36],[.49,.36]]]:[[[-.47,.10],[.47,.10]]];
    }else if(['xidi','promenade','nanbin','east-coast','square'].includes(p.model)){
      const waterfront=p.model!=='square';
      if(waterfront){box(g,'#6eaaa7',0,-.004,.39,1.15,.008,.13);for(let i=0;i<13;i++)box(g,'#6c8580',-.54+i*.09,.02,.30,.008,.05,.008);beam(g,'#aec4be',[-.56,.07,.30],[.56,.07,.30],.004);}
      for(let i=0;i<5;i++){tree(g,-.46+i*.23,0,-.30,.12,p.model==='nanbin'?'broadleaf':'palm');bench(g,-.44+i*.22,.19);}
      if(p.model==='xidi'){for(let i=0;i<4;i++)sign(g,['侨批','家书','漂洋','归来'][i],-.36+i*.24,.12,-.05,.16,.13,['#8b7562','#5d867c'][i%2]);}
      if(p.model==='promenade'){for(let i=0;i<7;i++){const x=-.45+i*.15;box(g,'#d8d2b9',x,0,-.05,.014,.17,.014);box(g,'#d8d2b9',x,0,.04,.014,.17,.014);box(g,'#d8d2b9',x,.17,0,.02,.014,.15);}}
      if(p.model==='east-coast'){for(let i=0;i<4;i++){const x=-.34+i*.23;const sail=mesh(g,new THREE.ConeGeometry(.09,.025,3),'#e2e8d5',x,.18,-.04);sail.rotation.y=i*.3;beam(g,'#748d83',[x,0,-.04],[x,.18,-.04],.007);}box(g,'#be8d79',0,.006,.11,1.04,.005,.04);}
      if(p.model==='nanbin'){const curve=Array.from({length:17},(_,i)=>[-.48+i*.06,-.04+Math.sin(i/16*Math.PI)*.1]);path(g,curve);for(const x of [-.24,.24])planter(g,x,-.14,'#c6a467');}
      if(p.model==='square'){for(const x of [-.38,.38])for(const z of [-.25,.05])planter(g,x,z);disc(g,'#719f9d',0,0,-.08,.14,.01);beam(g,'#dadfd8',[0,.02,-.08],[0,.38,-.08],.005);box(g,'#b75e54',.035,.32,-.08,.07,.04,.002);}
      walks=[[[-.5,.10],[.5,.10]]];
    }else if(p.model==='park'){
      const pond=disc(g,'#659b9b',-.17,0,-.03,.20,.008);pond.scale.z=.75;
      for(let i=0;i<9;i++){const x=-.35+i*.045;box(g,'#dfd5bb',x,.05+Math.sin(i/8*Math.PI)*.04,-.03,.05,.015,.07);}
      for(const x of [-.12,0,.12])box(g,'#b69873',x,0,.22,.02,.20,.02);
      box(g,'#d8ccac',0,.20,.22,.35,.026,.035);roof(g,0,.22,.40,.07,.24);
      for(const [x,z] of [[-.44,-.30],[.36,-.28],[.40,.02],[-.48,.18]])tree(g,x,0,z,.16,'broadleaf');pavilion(g,.31,-.08);
      walks=[[[-.43,.36],[.43,.36]]];
    }else if(p.model==='queshi'||p.model==='lotus'){
      for(let i=0;i<(p.model==='queshi'?12:7);i++){const a=i*2.4,r=.12+(i%4)*.06,x=Math.sin(a)*r,z=Math.cos(a)*r-.1,y=(heightAt(p.x+x*p.displayScale,p.z+z*p.displayScale)-level)/p.displayScale+.014;rock(g,x,z,.07+(i%3)*.03,y);}
      for(let i=0;i<15;i++){const a=i*2.4,x=Math.sin(a)*.48,z=Math.cos(a)*.36;tree(g,x,(heightAt(p.x+x*p.displayScale,p.z+z*p.displayScale)-level)/p.displayScale+.014,z,.10+(i%3)*.02,p.model==='queshi'?'broadleaf':'palm');}
      if(p.model==='lotus')sign(g,'莲花峰',0,.22,.03,.18,.055,'#777d70');
      walks=[[[-.48,.26],[-.24,.32],[0,.28],[.25,.33],[.48,.22]]];
    }else if(p.model==='mayu'){
      for(let i=0;i<4;i++)cottage(g,-.36+i*.24,-.18,.20,.19,.13+(i%2)*.035);
      facade(g,{x:.33,z:.08,w:.19,d:.14,h:.14,c:'#719bad',arcade:false});sign(g,'海边书屋',.33,.14,.16,.18,.035,'#548c9b');
      pavilion(g,-.34,.02);for(let i=0;i<5;i++)rock(g,-.49+i*.24,.38,.052);tree(g,.50,0,-.24,.17,'broadleaf');
      box(g,'#b9c5bf',0,.004,.24,1.09,.015,.05);walks=[[[-.48,.24],[.48,.24]]];walkY=.025;
    }else if(p.model==='sports'){
      const oval=mesh(g,new THREE.TorusGeometry(.27,.055,8,48),'#dbe3da',-.12,.09,-.02);oval.rotation.x=Math.PI/2;oval.scale.x=1.4;
      const turf=disc(g,'#6d9e73',-.12,.008,-.02,.23,.01);turf.scale.x=1.4;
      for(let i=0;i<36;i++){const a=i*Math.PI/18;beam(g,'#81a6a4',[-.12+Math.cos(a)*.30,.01,Math.sin(a)*.22-.02],[-.12+Math.cos(a)*.36,.14,Math.sin(a)*.29-.02],.009);}
      const hall=mesh(g,new THREE.SphereGeometry(.17,24,12,0,Math.PI*2,0,Math.PI/2),'#bdcdc6',.39,.015,-.16);hall.scale.set(.8,.45,1.2);
      sign(g,'汕头体育中心',0,.12,.30,.40,.04);walks=[[[-.48,.37],[.48,.37]]];
    }else if(p.model==='station'){
      facade(g,{w:.9,d:.23,h:.22,c:'#c8d9d6',window:'#4d8690',arcade:false});
      for(let i=0;i<9;i++){const x=-.44+i*.11;beam(g,'#e0e7df',[x,.22,-.28],[x,.28,.01],.017);}
      letters(g,'汕头站',0,.26,.015,.30,.07);
      for(const z of [-.36,-.43]){box(g,'#586d73',0,0,z,1.1,.006,.03);for(let i=0;i<13;i++)box(g,'#a8b0a4',-.54+i*.09,.006,z,.02,.007,.045);}
      const train=new THREE.Group();g.add(train);for(let i=0;i<3;i++){box(train,'#e1e8df',i*.20,0,0,.18,.055,.06);box(train,'#537f89',i*.20,.024,-.031,.15,.021,.002);}train.position.set(-.5,.02,-.36);dynamic.push(train);animations.push(t=>{train.position.x=-.55+Math.min((t%24)/12,1)*.45;});
      for(const x of [-.39,.39])planter(g,x,.22);walks=[[[-.47,.15],[.47,.15]]];
    }else if(p.model==='port'){
      box(g,'#6b9f9f',0,0,.27,1.1,.008,.33);
      for(let i=0;i<4;i++)for(let j=0;j<3;j++)box(g,['#55818e','#b97b61','#d1b468'][(i+j)%3],-.4+i*.19,.006,-.26+j*.085,.16,.055,.065);
      for(const x of [-.33,.27]){for(const dx of [-.08,.08])beam(g,'#b58f59',[x+dx,0,.02],[x+dx,.29,.02],.012);beam(g,'#b58f59',[x-.14,.3,-.12],[x+.14,.3,.34],.014);beam(g,'#667d7e',[x+.13,.3,.30],[x+.13,.1,.30],.004);}
      const ship=ferry(g,0,.32,true);ship.rotation.y=Math.PI/2;ship.scale.set(1.3,1,2);dynamic.push(ship);animations.push(t=>{ship.rotation.z=Math.sin(t*.7)*.012;});
      walks=[[[-.47,-.035],[.47,-.035]]];
    }else if(p.model==='fantawild'){
      mesh(g,new THREE.SphereGeometry(.15,24,16,0,Math.PI*2,0,Math.PI/2),'#679ab9',-.26,0,-.12);box(g,'#8c9eaa',-.26,0,-.12,.33,.05,.30);
      for(const x of [.14,.38]){box(g,'#b79e86',x,0,-.19,.10,.23,.10);mesh(g,new THREE.ConeGeometry(.085,.13,6),'#7e91ad',x,.29,-.19);}
      const wheel=new THREE.Group();wheel.position.set(.27,.20,.06);g.add(wheel);mesh(wheel,new THREE.TorusGeometry(.14,.008,5,32),'#c3a567');for(let i=0;i<8;i++){const a=i*Math.PI/4;beam(wheel,'#d1b887',[0,0,0],[Math.sin(a)*.14,Math.cos(a)*.14,0],.004);}dynamic.push(wheel);animations.push(t=>{wheel.rotation.z=t*.15;});
      sign(g,'蓝水星',-.27,.12,.04,.23,.045,'#447f9b');walks=[[[-.48,.29],[.48,.29]]];
    }else if(p.model==='lianhua'||p.model==='danying'){
      for(let ix=0;ix<6;ix++)for(let iz=0;iz<4;iz++){
        const x=-.44+ix*.17,z=-.3+iz*.13,y=(heightAt(p.x+x*p.displayScale,p.z+z*p.displayScale)-level)/p.displayScale+.015;
        box(g,p.model==='danying'?['#c787a0','#d9b765','#b1bdd1','#91a573'][(ix+iz)%4]:'#88a477',x,y,z,.145,.01,.10);
        for(let k=0;k<3;k++)mesh(g,new THREE.IcosahedronGeometry(.013,0),p.model==='danying'?['#e1acbf','#e8ca75','#e0dfce'][ix%3]:'#789569',x+(k-1)*.04,y+.025,z);
      }
      walks=[[[-.52,.31],[.52,.31]]];
    }else if(p.model==='bridge'){
      g.position.y=Math.max(.025,waterAt(p.x,p.z)??0)+.045;p.sceneY=g.position.y;p.halfHeight=.60;p.span=2.8;
      box(g,'#607a80',0,.11,0,2.6,.025,.18);
      for(const x of [-.55,.55]){for(const z of [-.13,.13])beam(g,'#d5dcd1',[x,0,z],[x,.55,z],.022);beam(g,'#c4d2c9',[x,.43,-.13],[x,.43,.13],.017);for(let i=1;i<=6;i++)for(const s of [-1,1])for(const z of [-.11,.11])beam(g,'#c7aa70',[x,.51,z],[x+s*i*.10,.14,z],.003);}
      for(let i=0;i<15;i++)box(g,'#e7dab4',-.12*7+i*.12,.138,0,.06,.003,.005);
      for(let i=0;i<4;i++){const car=vehicle(g,['sedan','bus','taxi','van'][i],.013),direction=i%2?-1:1;dynamic.push(car);animations.push(t=>{car.position.set(direction*(((t*.06+i*.58)%2.4)-1.2),.142,direction*.039);car.rotation.y=direction*Math.PI/2;});}
      walks=[[[-1.2,-.13],[1.2,-.13]],[[1.2,.13],[-1.2,.13]]];walkY=.145;
    }else if(p.model==='bay'){
      g.position.y=Math.max(0,waterAt(p.x,p.z)??0)+.012;p.sceneY=g.position.y;p.span=1.8;p.halfHeight=.85;
      box(g,'#bac9c1',0,.025,-.30,1.05,.03,.14);box(g,'#bac9c1',-.40,.025,-.08,.09,.03,.42);sign(g,'内海湾渡轮',0,.16,-.32,.43,.05);
      for(let i=0;i<3;i++){const ship=ferry(g,-.25+i*.27,.12+i*.08,true);dynamic.push(ship);animations.push(t=>{ship.position.z=.12+i*.08+Math.sin(t*.20+i)*.05;ship.rotation.z=Math.sin(t+i)*.014;});}
      walks=[[[-.46,-.30],[.46,-.30]]];walkY=.060;
    }
    // Public approaches accompany each scene, using the established crowd engine.
    for(const line of walks){
      if(!landscape)path(g,line,walkY);
      const points=[];
      for(let i=1;i<line.length;i++){
        const a=line[i-1],b=line[i],n=Math.max(2,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.025));
        for(let j=i===1?0:1;j<=n;j++){
          const x=a[0]+(b[0]-a[0])*j/n,z=a[1]+(b[1]-a[1])*j/n,c=Math.cos(g.rotation.y),s=Math.sin(g.rotation.y),wx=p.x+(x*c+z*s)*p.displayScale,wz=p.z+(-x*s+z*c)*p.displayScale;
          points.push(new THREE.Vector3(wx,landscape?heightAt(wx,wz)+.019:g.position.y+walkY*p.displayScale,wz));
        }
      }
      routes.push(points);
    }
    if(!landscape)addExhibitInfill({group:g,place:p,paths:walks.map(line=>line.map(([x,z])=>[x,walkY,z]))});
    coverage.push({id:p.id,paths:walks.length,people:walks.length*12});
    for(const o of dynamic)g.remove(o);batchStatic(g);for(const o of dynamic)g.add(o);
    g.traverse(o=>{if(o.isMesh)o.userData.landmarkId=p.id;});models.push({id:p.id,type:p.model,group:g});
  }
  const streetLife=buildRegionalLife({parent:group,routes:[],roadRoutes:[],places:[],preparedWalkways:routes,heightAt,waterAt,population:routes.length*12});
  const update=t=>{streetLife.update(t);for(const animate of animations)animate(t);};update(0);
  return {group,models,streetLife,update,stats:{places:places.length,models:models.length,people:streetLife.count,coverage,animations:animations.length}};
}
