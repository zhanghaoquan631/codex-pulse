import * as THREE from 'three';
import {box,disc,tree,sign,material,person} from './scene-miniatures.mjs';
import {batchStatic} from './static-batch.mjs';
import {addExhibitInfill} from './exhibit-infill.mjs';
import {buildWalkwayCrowd,settleExhibitHosts} from './walkway-crowds.mjs';
import {huilaiPlaces} from './huilai-places.mjs';
import {localHouse} from './local-architecture.mjs';
import {placeSetting} from './place-setting.mjs';

export function buildHuilaiSights({parent,places=huilaiPlaces,heightAt,waterAt}){
  const group=new THREE.Group();group.name='huilai-coastal-world';parent.add(group);
  const models=[],routes=[],animations=[],coverage=[],actors=[],obstacles=[];
  const mesh=(g,geo,color,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geo,material(color));m.position.set(x,y,z);g.add(m);return m;};
  const beam=(g,a,b,color='#879080',r=.005)=>{const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),d=to.clone().sub(from),m=mesh(g,new THREE.CylinderGeometry(r,r,d.length(),6),color);m.position.copy(from).add(to).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return m;};
  const rock=(g,x,y,z,r=.06,tall=1)=>{const m=mesh(g,new THREE.DodecahedronGeometry(r,1),'#a1a99e',x,y+r*tall*.5,z);m.rotation.y=x*17+z*8;m.scale.set(.82,tall,.72);return m;};
  const roof=(g,x,y,z,w,d,color='#546d64')=>{
    const v=[];for(const s of [-1,1]){const a=[x-w/2,y,z+s*d/2],b=[x+w/2,y,z+s*d/2],c=[x-w*.42,y+.05,z],e=[x+w*.42,y+.05,z];for(const p of [a,c,b,b,c,e])v.push(...p);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geo.computeVertexNormals();const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide}));g.add(m);box(g,'#a07058',x,y+.049,z,w*.86,.012,.013);
  };
  const house=(g,x,z,w=.17,d=.13,h=.15,y=0,c)=>localHouse(g,x,z,w,d,h,y,c);
  const path=(g,line,w=.04)=>{for(let i=1;i<line.length;i++){const a=new THREE.Vector3(...line[i-1]),b=new THREE.Vector3(...line[i]),d=b.clone().sub(a);const m=box(g,'#c9cfc3',0,0,0,w,.008,d.length()+.006);m.position.copy(a).add(b).multiplyScalar(.5);m.position.y-=.005;m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),d.normalize());}};
  const rail=(g,line)=>{for(const [x,y,z] of line)box(g,'#657f75',x,y,z,.006,.044,.006);for(let i=1;i<line.length;i++)beam(g,[line[i-1][0],line[i-1][1]+.04,line[i-1][2]],[line[i][0],line[i][1]+.04,line[i][2]]);};
  for(const [index,p] of places.entries()){
    const g=new THREE.Group();g.name=p.id;g.userData.setting=placeSetting(p);group.add(g);g.scale.setScalar(p.displayScale);
    const heights=[];for(let i=0;i<=12;i++)for(let j=0;j<=10;j++)heights.push(heightAt(p.x+(-.63+i*.105)*p.displayScale,p.z+(-.50+j*.10)*p.displayScale));
    const groundY=Math.max(...heights,waterAt(p.x,p.z)??-Infinity)+.022;g.position.set(p.x,groundY,p.z);p.sceneY=groundY;
    const depth=Math.max(.035,(Math.max(...heights)-Math.min(...heights))/p.displayScale+.035),dynamic=[];
    const coast=['sea-rocks','striped-lighthouse','battery','fish-market','crescent-bay','beach-resort','fishing-bay','working-port','quiet-bay'].includes(p.model);
    box(g,coast?'#749ca0':'#93a890',0,-depth,0,1.24,depth,.98);
    box(g,coast?'#4c9daa':'#95b085',0,0,0,1.22,.004,.96);
    if(coast)box(g,'#bcc8a5',0,.004,-.25,1.20,.012,.45);
    let paths=coast?[[[-.53,.022,-.11],[-.28,.022,-.14],[.02,.022,-.12],[.31,.022,-.15],[.52,.022,-.12]]]:[[[-.51,.015,.33],[.49,.015,.33],[.51,.015,-.35],[-.51,.015,-.35],[-.51,.015,.33]]];
    const ellipse=(color,x,z,rx,rz,y=.008)=>{const m=disc(g,color,x,y,z,1,.005);m.scale.set(rx,1,rz);return m;};
    const addHost=(x,y,z,activity='wave')=>{const phase=actors.length*.71,a=person(g,index+actors.length,{scale:.015});a.root.position.set(x,y,z);dynamic.push(a.root);actors.push(a);animations.push(t=>{const greeting=activity==='wave'&&(t+phase)%17<2;a.pose(t*.45,greeting?'wave':activity==='wave'?'look':activity);if(activity==='sit')a.root.children[4].rotation.x=-.35-Math.max(0,Math.sin(t*.65+phase))*.3;});};
    const boat=(x,z,id,travel=false)=>{
      const b=new THREE.Group();g.add(b);dynamic.push(b);const hull=mesh(b,new THREE.CylinderGeometry(.044,.025,.028,6),['#bf7251','#366b8b','#77966c'][id%3]);hull.scale.z=2.7;
      box(b,'#ece8d9',0,.013,-.014,.064,.037,.065);box(b,'#4e6e7b',0,.031,.021,.045,.014,.003);
      beam(b,[0,.024,-.03],[0,.135,-.03],'#666b60',.003);beam(b,[0,.12,-.03],[.065,.076,.035],'#747c72',.003);
      for(let j=0;j<3;j++)box(b,'#aa9770',(j-1)*.021,.018,.058,.014,.014,.022);
      animations.push(t=>{b.position.set(x+(travel?Math.sin(t*.1+id)*.065:0),.028+Math.sin(t*1.3+id)*.003,z+(travel?Math.cos(t*.1+id)*.027:0));b.rotation.set(Math.sin(t+id)*.018,travel?Math.PI/2+Math.cos(t*.1+id)*.15:Math.PI/2,Math.cos(t*.9+id)*.018);});
      return b;
    };
    const waves=()=>{for(let row=0;row<4;row++){
      const line=[];for(let i=0;i<=28;i++)line.push(new THREE.Vector3(-.55+i*.039,.012,.17+row*.071+Math.sin(i*.28)*.013));
      const m=new THREE.Line(new THREE.BufferGeometry().setFromPoints(line),new THREE.LineBasicMaterial({color:'#b9dfdb',transparent:true,opacity:.34}));g.add(m);dynamic.push(m);animations.push(t=>{m.position.z=Math.sin(t*.6+row)*.014;m.material.opacity=.18+Math.sin(t*.6+row)*.10;});
    }};
    const canopy=(x,z,color='#ad8e56')=>{for(const s of [-1,1])beam(g,[x+s*.06,.014,z],[x+s*.06,.11,z],'#7d8d7e');box(g,color,x,.108,z,.15,.006,.11);};
    const stoneWall=(x,z,w,h=.12)=>{box(g,'#969f96',x,.012,z,w,h,.035);for(let i=0;i<Math.floor(w/.037);i++)box(g,'#adb6a7',x-w/2+.023+i*.037,.012+h,z,.021,.023,.036);};
    if(p.model==='sea-rocks'){
      const trail=[[-.47,.047,-.05],[-.38,.047,.09],[-.05,.047,.17],[.20,.047,.07],[.47,.047,.12]];
      for(let i=0;i<46;i++){
        const x=Math.sin(i*13.17)*.49,z=.035+(Math.sin(i*9.31)+1)*.16,r=.023+(i%4)*.008;
        const blocked=trail.slice(1).some((b,j)=>{const a=trail[j],dx=b[0]-a[0],dz=b[2]-a[2],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a[0]-dx*t,z-a[2]-dz*t)<r+.033;});
        if(!blocked)rock(g,x,.006,z,r,1.5+(i%5)*.36);
      }
      ellipse('#75b9b6',-.20,.12,.12,.065);paths.push([[-.47,.047,-.05],[-.38,.047,.09],[-.05,.047,.17],[.20,.047,.07],[.47,.047,.12]]);rail(g,[[-.47,.047,-.08],[-.38,.047,.06],[-.05,.047,.14],[.20,.047,.04],[.47,.047,.09]]);waves();addHost(-.34,.047,.09);
    }else if(p.model==='sweet-spring'){
      box(g,'#c9cfbf',0,.007,.015,.55,.015,.48);
      for(let k=0;k<3;k++)disc(g,'#b2b9a8',0,.012+k*.009,0,.13-k*.013,.01);
      mesh(g,new THREE.CylinderGeometry(.074,.081,.079,16),'#bec6b5',0,.081,0);
      const well=new THREE.Mesh(new THREE.RingGeometry(.043,.075,24),material('#e3e1ce'));well.rotation.x=-Math.PI/2;well.position.y=.123;g.add(well);ellipse('#335e60',0,0,.042,.042,.121);
      box(g,'#8a9685',.15,.020,-.075,.085,.15,.025);sign(g,'海角甘泉',.15,.12,-.061,.080,.025,'#6b7f71');
      for(const s of [-1,1])house(g,s*.35,-.24,.23,.17,.18);
      paths.push([[-.25,.026,.22],[-.25,.026,-.09],[.26,.026,-.09],[.26,.026,.22]]);rail(g,[[-.12,.025,.11],[.12,.025,.11]]);addHost(.19,.026,.18,'look');
    }else if(p.model==='striped-lighthouse'){
      ellipse('#aebaa0',0,.01,.25,.22,.008);
      for(let i=0;i<8;i++)rock(g,Math.cos(i)*.23,.009,Math.sin(i)*.18,.055);
      for(let i=0;i<8;i++)disc(g,i%2?'#344b50':'#edf0e6',0,.025+i*.048,0,.046-i*.002,.048);
      disc(g,'#e0e6db',0,.41,0,.078,.012);disc(g,'#567f87',0,.422,0,.039,.055);disc(g,'#344b50',0,.477,0,.061,.012);
      mesh(g,new THREE.ConeGeometry(.065,.045,20),'#334f52',0,.511,0);
      for(let i=0;i<12;i++){const a=i*Math.PI/6;beam(g,[Math.cos(a)*.069,.42,Math.sin(a)*.069],[Math.cos(a)*.069,.453,Math.sin(a)*.069],'#506968',.002);}
      const lamp=mesh(g,new THREE.SphereGeometry(.013,10,8),'#e2d59e',0,.45,0);dynamic.push(lamp);lamp.material=new THREE.MeshStandardMaterial({color:'#e9dfb0',emissive:'#e0c46a',emissiveIntensity:.5});animations.push(t=>lamp.material.emissiveIntensity=.2+(Math.cos(t*.9)+1)*.35);
      paths.push([[-.34,.022,-.12],[-.18,.035,-.09],[-.08,.035,.10],[.13,.035,.10]]);house(g,.32,-.31,.19,.14,.11);
      house(g,-.38,-.32,.20,.12,.09);sign(g,'灯塔守望',-.38,.095,-.253,.13,.024);
      paths.push([[-.52,.027,-.22],[-.22,.027,-.24],[.05,.027,-.24],[.33,.027,-.21],[.52,.027,-.20]]);
      for(let i=0;i<13;i++)tree(g,-.22+i*.036,.02,-.38,.045+(i%3)*.008,i%3?'broadleaf':'palm');
      for(const x of [-.43,.44]){box(g,'#ab916b',x,.025,-.14,.08,.013,.025);addHost(x,.038,-.14,'sit');}
      for(let i=0;i<7;i++)rock(g,-.46+i*.07,.013,.018+Math.sin(i)*.018,.025,1.3);
      waves();addHost(.12,.026,.10);
    }else if(p.model==='walled-city'){
      box(g,'#c8cdbd',0,.007,0,.95,.01,.69);
      stoneWall(-.28,.22,.34);stoneWall(.28,.22,.34);stoneWall(0,-.31,.9);
      for(const s of [-1,1]){const wall=box(g,'#9da799',s*.45,.015,-.05,.035,.14,.55);for(let i=0;i<13;i++)box(g,'#b2b9a9',s*.45,.155,-.29+i*.042,.038,.025,.023);}
      for(const x of [-.076,.076])box(g,'#909e8f',x,.012,.22,.055,.15,.075);
      box(g,'#aab4a1',0,.16,.22,.23,.037,.10);roof(g,0,.22,.22,.27,.17);sign(g,'靖海',0,.187,.272,.10,.024);
      for(const x of [-.29,.27])for(let i=0;i<3;i++)house(g,x,-.22+i*.13,.20,.105,.11+(i%2)*.035);
      paths.push([[0,.020,.38],[0,.020,.04],[0,.020,-.27]]);addHost(.09,.020,.09);
    }else if(p.model==='battery'){
      ellipse('#aab698',0,.035,.43,.29,.008);box(g,'#b3bba9',0,.017,-.01,.67,.055,.31);
      stoneWall(0,.18,.71,.13);for(const s of [-1,1])stoneWall(s*.30,-.14,.14,.13);
      for(let i=0;i<4;i++){const x=-.23+i*.155;box(g,'#807d62',x,.075,.07,.07,.035,.055);const c=beam(g,[x,.118,.07],[x,.15,.205],'#3e5255',.014);c.userData.artifact=true;}
      paths.push([[-.38,.081,-.09],[.37,.081,-.09]]);for(let i=0;i<7;i++)box(g,'#cbd0bd',-.40,.011+i*.009,-.25+i*.018,.10,.009,.025);waves();addHost(.20,.081,-.09,'look');
    }else if(['fish-market','working-port','fishing-bay'].includes(p.model)){
      const working=p.model==='working-port',bay=p.model==='fishing-bay';
      box(g,'#b3c3b8',-.40,.016,.12,.067,.015,.44);box(g,'#b3c3b8',.42,.016,.12,.055,.015,.44);
      for(let i=0;i<(bay?3:6);i++)boat(-.26+(i%3)*.21,.05+Math.floor(i/3)*.19,index+i,bay);
      paths.push([[-.40,.034,-.10],[-.40,.034,.32]]);rail(g,[[-.435,.034,-.08],[-.435,.034,.12],[-.435,.034,.32]]);
      if(bay){for(let i=0;i<4;i++)house(g,-.36+i*.23,-.32,.17,.12,.12);for(let i=0;i<3;i++)for(let j=0;j<3;j++){const ring=mesh(g,new THREE.TorusGeometry(.022,.003,5,12),'#526b67',.22+i*.055,.014,.25+j*.055);ring.rotation.x=Math.PI/2;}}
      else for(let i=0;i<4;i++){
        const x=-.31+i*.21;
        if(!working){canopy(x,-.30,i%2?'#cc9e68':'#659787');for(let j=0;j<3;j++){box(g,'#c3caba',x+(j-1)*.043,.03,-.265,.039,.028,.045);for(let k=0;k<3;k++){const fish=mesh(g,new THREE.SphereGeometry(.009,6,4),k%2?'#769aa3':'#d2c7b3',x+(j-1)*.043,.063,-.28+k*.013);fish.scale.set(1.6,.5,.55);}}addHost(x,.021,-.21,i%2?'wave':'look');}
        else {box(g,'#d2d8c5',x,.012,-.30,.13,.04,.10);for(let j=0;j<5;j++)beam(g,[x-.06,.055,-.34+j*.019],[x+.06,.055,-.34+j*.019],'#74877b',.002);for(let j=0;j<5;j++)beam(g,[x-.055+j*.026,.057,-.34],[x-.055+j*.026,.057,-.26],'#74877b',.002);addHost(x,.021,-.19,'look');}
      }
      waves();
    }else if(['crescent-bay','beach-resort','quiet-bay'].includes(p.model)){
      const beach=new THREE.Shape();beach.moveTo(-.60,-.22);beach.lineTo(.60,-.22);for(let i=0;i<=32;i++){const x=.60-i*.0375;beach.lineTo(x,.03+.18*(x*x/.36));}beach.closePath();const geo=new THREE.ShapeGeometry(beach);geo.rotateX(-Math.PI/2);const sand=mesh(g,geo,'#d9d2ad',0,.010,.025);sand.rotation.y=Math.PI;
      if(p.model==='beach-resort'){for(let i=0;i<4;i++){house(g,-.35+i*.23,-.33,.18,.12,.10);canopy(-.35+i*.23,-.04,i%2?'#d4ac73':'#77a3a5');}}
      else if(p.model==='crescent-bay'){boat(.22,.25,index,true);for(let i=0;i<3;i++){const x=-.30+i*.26;beam(g,[x,.015,-.06],[x,.12,-.06]);mesh(g,new THREE.ConeGeometry(.061,.025,10),'#c8a272',x,.128,-.06);}}
      else {for(let i=0;i<12;i++)rock(g,-.45+(i%4)*.055,.008,.11+Math.floor(i/4)*.055,.027);for(let i=0;i<9;i++)tree(g,-.40+i*.1,.022,-.36,.09,'pine');}
      waves();addHost(.32,.022,-.12,'sit');
    }else if(['flower-peak','rock-sanctuary','red-mountain'].includes(p.model)){
      const peaks=p.model==='flower-peak'?[[-.2,-.1,.24,.22],[.10,-.2,.24,.29]]:[[-.23,-.22,.21,.22],[.22,-.21,.23,.25]];
      for(const [x,z,r,h] of peaks)mesh(g,new THREE.ConeGeometry(r,h,12),'#7f9b6c',x,h/2,z);
      for(let i=0;i<55;i++){const x=-.44+(i%11)*.083,z=-.30+Math.floor(i/11)*.10,h=Math.max(0,...peaks.map(([px,pz,r,hh])=>hh*Math.max(0,1-Math.hypot(x-px,z-pz)/r)));if(Math.abs(x)<.07)continue;tree(g,x,h,z,.045+(i%4)*.012,p.model==='flower-peak'&&i%3===0?'flowering':'pine');}
      if(p.model==='flower-peak'){box(g,'#a1af91',.08,.02,-.19,.10,.28,.10);roof(g,.08,.39,-.19,.18,.14);for(const x of [.02,.14])beam(g,[x,.30,-.19],[x,.39,-.19]);paths.push([[-.36,.016,.21],[-.10,.10,.10],[.27,.18,-.02],[.08,.31,-.19]]);}
      if(p.model==='rock-sanctuary'){for(let i=0;i<6;i++)rock(g,-.24+i*.084,.013,.06,.05,1.2+(i%3)*.5);house(g,.20,.03,.22,.18,.15);paths.push([[.39,.016,.25],[.38,.016,-.02],[.11,.016,-.03]]);}
      if(p.model==='red-mountain'){house(g,-.22,.17,.24,.15,.12);box(g,'#a56659',.21,.01,.08,.22,.13,.028);sign(g,'大南山红色记忆',.21,.09,.096,.20,.031);paths.push([[-.38,.016,.29],[.34,.016,.29],[.34,.016,.06]]);}
      addHost(.31,.015,.33,'look');
    }else if(p.model==='buddhist-temple'){
      for(let i=0;i<3;i++)box(g,'#c3cab3',0,.005+i*.032,-.12-i*.03,.83-i*.12,.032,.58-i*.08);
      house(g,0,-.10,.42,.23,.18,.104,'#d5bd8a');for(const s of [-1,1])house(g,s*.34,.055,.12,.30,.11,.015,'#ceb996');
      const statue=new THREE.Group();g.add(statue);statue.position.set(0,.10,-.32);disc(statue,'#bcac72',0,0,0,.094,.025);mesh(statue,new THREE.SphereGeometry(.059,14,10),'#b9a463',0,.079,0).scale.set(.87,1.13,.65);mesh(statue,new THREE.SphereGeometry(.032,14,10),'#b9a463',0,.158,0);mesh(statue,new THREE.SphereGeometry(.019,10,8),'#a28d58',0,.187,0);for(const s of [-1,1])mesh(statue,new THREE.SphereGeometry(.044,12,8),'#b9a463',s*.042,.034,.027).scale.set(1,.42,.8);
      paths.push([[-.20,.016,.28],[-.20,.12,.01],[.21,.12,.01],[.21,.016,.28]]);addHost(.35,.02,.28,'look');
    }else if(p.model==='botanical'){
      for(let zone=0;zone<4;zone++){const x=zone%2? .25:-.25,z=zone>1?.16:-.20;ellipse('#a9bc86',x,z,.20,.15);for(let i=0;i<12;i++){const a=i*2.4,r=.035+(i%3)*.046;tree(g,x+Math.cos(a)*r,.015,z+Math.sin(a)*r,.05+(i%3)*.015,['palm','bamboo','flowering','broadleaf'][zone]);}}
      paths.push([[0,.016,-.39],[0,.016,.36]],[[-.49,.016,-.015],[.49,.016,-.015]]);sign(g,'滨海植物园',0,.12,.39,.24,.036);addHost(.07,.016,.22);
    }
    for(let i=0;i<6;i++)if(coast)tree(g,-.49+i*.19,.021,-.44,.065+(i%3)*.01,i%2?'palm':'broadleaf');
    for(const line of paths){path(g,line);const points=[];for(let i=1;i<line.length;i++){const a=new THREE.Vector3(...line[i-1]),b=new THREE.Vector3(...line[i]),n=Math.max(2,Math.ceil(a.distanceTo(b)/.024));for(let j=i===1?0:1;j<=n;j++)points.push(a.clone().lerp(b,j/n).multiplyScalar(p.displayScale).add(g.position));}routes.push(points);}
    addExhibitInfill({group:g,place:p,paths});
    obstacles.push(...settleExhibitHosts({group:g,actors:actors.filter(a=>a.root.parent===g),paths}));
    coverage.push({id:p.id,paths:paths.length});for(const o of dynamic)g.remove(o);batchStatic(g);for(const o of dynamic)g.add(o);g.traverse(o=>{if(o.isMesh)o.userData.landmarkId=p.id;});models.push({id:p.id,type:p.model,group:g});
  }
  const streetLife=buildWalkwayCrowd({parent:group,preparedWalkways:routes,population:routes.length*10,obstacles});
  const update=t=>{streetLife.update(t);for(const animate of animations)animate(t);};update(0);
  return {group,models,streetLife,update,stats:{places:places.length,models:models.length,people:streetLife.count+actors.length,coverage,animations:animations.length}};
}
