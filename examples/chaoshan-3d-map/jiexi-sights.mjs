import * as THREE from 'three';
import {box,disc,tree,sign,material,person} from './scene-miniatures.mjs';
import {batchStatic} from './static-batch.mjs';
import {addExhibitInfill} from './exhibit-infill.mjs';
import {buildRegionalLife} from './regional-life.mjs';
import {jiexiPlaces} from './jiexi-places.mjs';

export function buildJiexiSights({parent,places=jiexiPlaces,heightAt,waterAt}){
  const group=new THREE.Group();group.name='jiexi-mountain-world';parent.add(group);
  const models=[],routes=[],animations=[],coverage=[];
  const rock=(g,x,y,z,r=.09)=>{const m=new THREE.Mesh(new THREE.DodecahedronGeometry(r,0),material('#839186'));m.position.set(x,y,z);m.scale.set(1,.8,.7);g.add(m);return m;};
  const roof=(g,x,y,z,w,d)=>{
    const geo=new THREE.BufferGeometry(),v=[];
    for(const s of [-1,1]){const a=[x-w/2,y,z+s*d/2],b=[x+w/2,y,z+s*d/2],c=[x-w/2,y+.055,z],e=[x+w/2,y+.055,z];for(const p of [a,c,b,b,c,e])v.push(...p);}
    geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geo.computeVertexNormals();const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#4e665b',side:THREE.DoubleSide}));g.add(m);
    box(g,'#aa795c',x,y+.05,z,w+.015,.012,.013);
  };
  const house=(g,x,z,w=.19,d=.15,h=.16,color='#dddcd0',y=0)=>{
    box(g,color,x,y,z,w,h,d);roof(g,x,y+h,z,w+.025,d+.025);
    box(g,'#955d49',x,y+.002,z+d/2+.003,.04,.073,.008);
    for(const s of [-1,1])for(const floor of [.085,.135]){box(g,'#54777b',x+s*w*.30,y+floor,z+d/2+.004,w*.15,.025,.005);box(g,'#eee6d3',x+s*w*.30,y+floor+.012,z+d/2+.008,.003,.025,.003);}
  };
  const walkway=(g,line,w=.045)=>{
    for(let i=1;i<line.length;i++){
      const a=new THREE.Vector3(...line[i-1]),b=new THREE.Vector3(...line[i]),d=b.clone().sub(a),m=box(g,'#c5cabc',0,0,0,w,.009,d.length()+.008);m.position.copy(a).add(b).multiplyScalar(.5);m.position.y-=.005;m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),d.normalize());
    }
  };
  const rail=(g,line)=>{for(const [x,y,z] of line)box(g,'#6e8171',x,y,z,.008,.06,.008);for(let i=1;i<line.length;i++){const a=new THREE.Vector3(...line[i-1]),b=new THREE.Vector3(...line[i]);a.y+=.052;b.y+=.052;const d=b.clone().sub(a),m=box(g,'#6e8171',0,0,0,.006,.006,d.length());m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),d.normalize());}};
  for(let index=0;index<places.length;index++){
    const p=places[index],g=new THREE.Group(),dynamic=[];g.name=p.id;group.add(g);
    // A shallow terrain-coloured foundation prevents mountainous terrain clipping the paths.
    const heights=[];for(let ix=0;ix<=12;ix++)for(let iz=0;iz<=10;iz++)heights.push(heightAt(p.x+(-.59+ix*.0984)*p.displayScale,p.z+(-.46+iz*.092)*p.displayScale));
    g.position.set(p.x,Math.max(...heights)+.012,p.z);g.scale.setScalar(p.displayScale);p.sceneY=g.position.y;
    const foundationDepth=Math.max(.04,(Math.max(...heights)-Math.min(...heights)) / p.displayScale+.025);
    box(g,'#8faca0',0,-foundationDepth,0,1.16,foundationDepth-.005,.90);box(g,'#91ad77',0,-.007,0,1.14,.01,.88);
    const loop=[[-.47,.013,.30],[-.16,.013,.34],[.30,.013,.30],[.47,.013,.12],[.43,.013,-.31],[-.45,.013,-.32],[-.47,.013,.30]];
    let paths=[loop];
    const water=(x,z,rx,rz,y=.009)=>{const m=disc(g,'#459ba6',x,y,z,1,.006);m.scale.set(rx,1,rz);return m;};
    const trees=(count=24)=>{for(let i=0;i<count;i++){const angle=i*2.39996,r=.33+(i%3)*.05,x=Math.cos(angle)*r,z=Math.sin(angle)*r*.79;if(Math.abs(z-.30)<.055||Math.abs(x)>.49)continue;tree(g,x,.005,z,.06+(i%4)*.012,['pine','broadleaf','pine'][i%3]);}};
    const seat=(x,z)=>{box(g,'#8b735a',x,.025,z,.08,.012,.034);for(const dx of [-.027,.027])box(g,'#677b70',x+dx,0,z,.009,.025,.025);};
    const ripple=(x,z,r,y)=>{const m=new THREE.Mesh(new THREE.RingGeometry(r*.86,r,32),new THREE.MeshBasicMaterial({color:'#d0eeea',transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(x,y,z);g.add(m);dynamic.push(m);animations.push(t=>{const phase=(t*.36+index*.13)%1;m.scale.setScalar(.5+phase*.8);m.material.opacity=(1-phase)*.65;});};
    if(['cascade','plunge','potholes'].includes(p.model)){
      const n=p.model==='cascade'?5:p.model==='plunge'?2:4;
      for(let i=0;i<n;i++){
        const z=-.27+i*.105,y=(n-i)*.060,x=Math.sin(i*.8)*.035;
        box(g,'#839483',x,y-.06,z,.36,.06,.16);
        for(const s of [-1,1])rock(g,x+s*.17,y+.025,z,.065);
        water(x,z,.105,.075,y+.002);
        if(p.model==='potholes'){
          for(const s of [-1,1]){const ring=new THREE.Mesh(new THREE.TorusGeometry(.045,.016,6,16),material('#a5afa0'));ring.rotation.x=Math.PI/2;ring.position.set(x+s*.055,y+.010,z);g.add(ring);}
        }else{
          box(g,'#6fbec3',x,y-.063,z+.086,p.model==='plunge'?.043:.11,.07,.008);
          for(let j=0;j<7;j++){const drop=box(g,'#d3f5ef',x+(j-3)*(p.model==='plunge'?.005:.012),y,z+.092,.004,.018,.003);dynamic.push(drop);animations.push(t=>{drop.position.y=y-((t*.11+j*.008)% .06);});}
        }
      }
      water(0,.23,.20,.095);ripple(0,.23,.075,.018);trees(35);
      const hiking=[[-.27,.015,.29],[-.27,.11,.06],[-.26,.20,-.13],[-.21,n*.06+.02,-.30],[.23,n*.06+.02,-.30]];paths.push(hiking);rail(g,hiking.map(([x,y,z])=>[x-.035,y,z]));
    }else if(['forest','highland','grotto','hill-temple'].includes(p.model)){
      const peaks=p.model==='forest'?[[-.23,-.12,.21,.18],[.02,-.21,.22,.26],[.26,-.13,.18,.18]]:p.model==='highland'?[[-.23,-.22,.19,.15],[.07,-.24,.20,.18]]:[[-.22,-.20,.20,.17],[.12,-.25,.22,.20]];
      for(const [x,z,r,h] of peaks){const m=new THREE.Mesh(new THREE.ConeGeometry(r,h,10,2),material('#799568'));m.position.set(x,h/2,z);g.add(m);}
      const slopeY=(x,z)=>Math.max(0,...peaks.map(([px,pz,r,h])=>h*Math.max(0,1-Math.hypot(x-px,z-pz)/r)));
      for(let i=0;i<74;i++){
        const x=-.42+(i%11)*.082,z=-.31+Math.floor(i/11)*.074;
        if(z>.09||Math.abs(x-.02)<.085&&z<-.13)continue;
        tree(g,x,slopeY(x,z),z,.045+(i%4)*.015,i%3?'pine':'broadleaf');
      }
      const trail=[[-.38,.02,.24],[-.18,.10,.06],[.18,.18,-.07],[.02,.29,-.20]];paths.push(trail);rail(g,trail.map(([x,y,z])=>[x+.035,y,z]));
      if(p.model==='highland'){water(-.12,.18,.17,.08);for(let i=0;i<3;i++)house(g,.17+i*.09,.15,.075,.07,.06);}
      else if(p.model==='grotto'){for(const s of [-1,1])rock(g,s*.085,.16,.055,.085);rock(g,0,.225,.055,.10);box(g,'#304f45',0,.08,.02,.085,.12,.01);}
      else if(p.model==='hill-temple'){box(g,'#9da98e',0,.04,-.18,.25,.23,.19);house(g,0,-.18,.23,.17,.11,'#cdb78f',.27);}
      else {box(g,'#9da98e',.015,.04,-.20,.15,.26,.12);for(const x of [-.04,.07])box(g,'#8f7052',x,.30,-.20,.009,.095,.009);roof(g,.015,.40,-.20,.18,.13);}
    }else if(['resort','river-spring','garden-spring'].includes(p.model)){
      const count=p.model==='resort'?5:p.model==='river-spring'?3:4;
      for(let i=0;i<count;i++){
        const x=(i%3-1)*.18,z=Math.floor(i/3)*.18-.06;
        disc(g,'#abb4a2',x,.005,z,.071,.02);water(x,z,.058,.055,.026);ripple(x,z,.038,.035);
        for(let j=0;j<3;j++){const steam=new THREE.Mesh(new THREE.RingGeometry(.015,.017,16),new THREE.MeshBasicMaterial({color:'#ecf5ed',transparent:true,opacity:.2,side:THREE.DoubleSide,depthWrite:false}));g.add(steam);dynamic.push(steam);animations.push(t=>{const phase=(t*.16+j*.33)%1;steam.position.set(x+Math.sin(t+j)*.006,.035+phase*.12,z);steam.rotation.y=t*.1;steam.scale.setScalar(.7+phase);steam.material.opacity=Math.sin(phase*Math.PI)*.22;});}
      }
      if(p.model==='resort')for(let i=0;i<4;i++)house(g,-.3+i*.20,-.25,.15,.11,.13);
      if(p.model==='river-spring'){water(.36,0,.065,.29);house(g,-.28,-.24,.18,.13,.10);}
      if(p.model==='garden-spring')for(let i=0;i<12;i++)box(g,'#8d9867',-.36+i*.062,.01,-.25,.014,.10,.012);
      trees(18);paths.push([[-.40,.013,.18],[.36,.013,.18]]);
    }else if(['old-town','residence','heritage-village','village'].includes(p.model)){
      const town=p.model==='old-town',residence=p.model==='residence';
      for(let i=0;i<(residence?3:4);i++)for(const s of [-1,1])house(g,s*(residence?.23:.25),-.23+i*.13,residence?.16:.19,.105,town?.20:residence?.28:.12,['#d9d4bd','#c3cbbd','#d6bb9c'][i%3]);
      paths.push([[0,.013,-.34],[0,.013,.31]]);
      if(town){for(let i=0;i<6;i++)box(g,'#b26043',i%2?-.145:.145,.09,-.22+Math.floor(i/2)*.15,.04,.025,.08);}
      if(residence){house(g,0,-.29,.35,.12,.26);box(g,'#d5cfc0',0,.0,.25,.52,.065,.015);}
      if(p.model==='village'){water(0,.20,.13,.055);for(let i=0;i<7;i++)box(g,i%2?'#acc079':'#729553',-.19+i*.06,-.002,-.32,.048,.009,.08);}
      if(p.model==='heritage-village'){box(g,'#a45a50',0,.01,-.28,.27,.10,.012);sign(g,'火炬记忆',0,.07,-.27,.24,.033);}
    }else if(['academy','temple','street-temple','memorial'].includes(p.model)){
      box(g,'#cccfbf',0,.004,0,.73,.01,.57);
      const temple=p.model==='temple',museum=p.model==='memorial';
      if(museum){box(g,'#c4c7bf',0,.012,-.14,.53,.20,.23);box(g,'#734d44',0,.014,-.019,.10,.12,.008);sign(g,'大北山革命历史纪念馆',0,.15,-.018,.45,.037);}
      else {house(g,0,-.19,.42,.18,temple?.22:.16,temple?'#bda777':'#d7ccb2');for(const s of [-1,1])house(g,s*.26,-.03,.10,.29,.11);if(temple){house(g,0,.19,.25,.11,.10);for(let i=0;i<7;i++)disc(g,['#bb715c','#507e76','#c5aa5a'][i%3],(i-3)*.047,.283,-.19,.016,.015);}}
      if(p.model==='academy'){for(let i=0;i<7;i++)box(g,['#667952','#ae8160','#617b8b'][i%3],-.27+i*.012,.08,.11,.008,.034,.018);}
      if(p.model==='street-temple'){roof(g,0,.12,.19,.30,.13);for(const x of [-.1,.1])box(g,'#ad6250',x,.02,.19,.009,.10,.009);}
      paths.push([[-.18,.02,.27],[-.18,.02,-.04],[.17,.02,-.04],[.17,.02,.27]]);
    }else if(p.model==='flowers'){
      for(let row=0;row<5;row++)for(let i=0;i<10;i++){
        const x=-.31+i*.068,z=-.25+row*.09,y=.01+row*.01;
        box(g,'#809d69',x,y-.01,z,.058,.014,.066);
        for(let j=0;j<3;j++){const flower=new THREE.Mesh(new THREE.IcosahedronGeometry(.012,0),material(['#d797ae','#e9dbab','#f0c9d1'][row%3]));flower.position.set(x+(j-1)*.015,y+.025,z);g.add(flower);}
      }
      tree(g,-.37,0,.15,.12,'flowering');tree(g,.37,0,.15,.11,'flowering');
    }else if(p.model==='river'){
      const riverPath=[];for(let i=0;i<30;i++)riverPath.push(new THREE.Vector3(-.55+i*.038,.01,Math.sin(i*.15)*.09));
      for(let i=1;i<riverPath.length;i++){const a=riverPath[i-1],b=riverPath[i],m=box(g,'#4f9ca5',(a.x+b.x)/2,.007,(a.z+b.z)/2,.049,.008,.15);m.rotation.y=-Math.atan2(b.z-a.z,b.x-a.x);}
      box(g,'#c8ccba',.14,.06,.08,.065,.012,.31);for(const x of [.106,.174])rail(g,[[x,.07,-.07],[x,.07,.23]]);
      paths.push([[-.47,.02,.22],[.14,.07,.23],[.14,.07,-.08],[.43,.02,-.23]]);trees(26);house(g,-.29,-.23,.23,.12,.11);
    }
    for(const x of [-.35,.35]){seat(x,.25);tree(g,x,.005,.39,.085,'broadleaf');}
    // Local ground and elevated paths share the same transformed points as their walkers.
    for(const line of paths){walkway(g,line);const points=[];for(let i=1;i<line.length;i++){const a=new THREE.Vector3(...line[i-1]),b=new THREE.Vector3(...line[i]),n=Math.max(2,Math.ceil(a.distanceTo(b)/.025));for(let j=i===1?0:1;j<=n;j++){const q=a.clone().lerp(b,j/n).multiplyScalar(p.displayScale).add(g.position);points.push(q);}}routes.push(points);}
    const host=person(g,index,{scale:.018});host.root.position.set(.35,.039,.25);dynamic.push(host.root);animations.push(t=>host.pose(t,index%2?'wave':'sit'));
    addExhibitInfill({group:g,place:p,paths});
    coverage.push({id:p.id,paths:paths.length});for(const o of dynamic)g.remove(o);batchStatic(g);for(const o of dynamic)g.add(o);
    g.traverse(o=>{if(o.isMesh)o.userData.landmarkId=p.id;});models.push({id:p.id,type:p.model,group:g});
  }
  const streetLife=buildRegionalLife({parent:group,routes:[],roadRoutes:[],places:[],preparedWalkways:routes,heightAt,waterAt,population:routes.length*10});
  const update=t=>{streetLife.update(t);for(const a of animations)a(t);};update(0);
  return {group,models,streetLife,update,stats:{places:places.length,models:models.length,people:streetLife.count+models.length,coverage,animations:animations.length}};
}
