import * as THREE from 'three';
import {box,disc,sign,tree,person,residentOutfit} from './scene-miniatures.mjs';
import {batchStatic} from './static-batch.mjs';
import {landClearance} from './regional-life.mjs';
import {streetClearance} from './street-clearance.mjs';
import {insidePlace} from './place-footprints.mjs';
import {spatialQuery,placeBounds} from './spatial-query.mjs';

export const civicThemes=['school','market','library','clinic','workshop','tea','bus','playground','orchard','gallery','square','bicycle'];
export const civicPersonScale=.018;
const names=['社区学堂','街坊市集','社区书屋','社区卫生站','手作工坊','街角茶院','公交候车庭','儿童游园','果木小园','文化展廊','邻里广场','骑行驿站'];
const hash=s=>Array.from(s).reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0);

export function planCivicNeighborhoods({places,sites=[],routes=[],roadRoutes=routes,heightAt,waterAt,buildings=[]}){
  const land=landClearance({heightAt,waterAt,buildings}),offRoad=streetClearance([...routes,...roadRoutes]);
  const protectedSites=[...places.filter(p=>p.span||['activity','food'].includes(p.kind)),...sites];
  const protectedNear=spatialQuery(protectedSites,placeBounds);
  const frontageRoutes=[...new Set([...routes,...roadRoutes])];
  const segments=frontageRoutes.flatMap(route=>route.slice(1).map((b,i)=>[route[i],b]));
  const roadsNear=spatialQuery(segments,([a,b])=>[Math.min(a.x,b.x),Math.max(a.x,b.x),Math.min(a.z,b.z),Math.max(a.z,b.z)],2);
  const facilities=[],coverage=[];
  const dry=(x,z,r)=>land(x,z,r)&&[-1,0,1].every(dx=>[-1,0,1].every(dz=>waterAt(x+dx*r,z+dz*r)===null&&Math.abs(heightAt(x+dx*r,z+dz*r)-heightAt(x,z))<.04));
  for(const [index,p] of places.entries()){
    const radius=Math.max(1.3,p.span||0,p.views?.[0]?.span||0)+(p.kind==='district'?2:.35);
    const candidates=[];
    for(const [a,b] of roadsNear(p.x,p.z,radius)){
      const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.001)continue;
      const t=THREE.MathUtils.clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(len*len),0,1);
      const rx=a.x+t*dx,rz=a.z+t*dz;if(Math.hypot(rx-p.x,rz-p.z)>radius)continue;
      for(const scale of [1,.65,.45])for(const side of [-1,1]){
        const setback=.245*scale+.035,nx=dz/len*side,nz=-dx/len*side,x=rx+nx*setback,z=rz+nz*setback;
        candidates.push({x,z,rx,rz,nx,nz,scale,setback,d:Math.hypot(x-p.x,z-p.z)+(1-scale)*.5});
      }
    }
    candidates.sort((a,b)=>a.d-b.d);const start=facilities.length;
    for(const c of candidates){
      if(facilities.length-start>=3)break;
      if(!dry(c.x,c.z,.225*c.scale)||!offRoad(c.x,c.z,.225*c.scale+.025)||protectedNear(c.x,c.z,.23*c.scale).some(q=>insidePlace(q,c.x,c.z,.23*c.scale)))continue;
      if(facilities.some(q=>Math.hypot(q.x-c.x,q.z-c.z)<.27*(q.scale+c.scale)+.025))continue;
      const path=Array.from({length:9},(_,i)=>{const r=.035+(c.setback-.145*c.scale-.035)*i/8;const x=c.rx+c.nx*r,z=c.rz+c.nz*r;return [x,heightAt(x,z)+.012,z];});
      if(path.some(v=>!dry(v[0],v[2],.021)||protectedNear(v[0],v[2],.023).some(q=>insidePlace(q,v[0],v[2],.023))))continue;
      const islandThemes={beach:['bicycle','market','square'],gate:['gallery','tea','square'],lighthouse:['gallery','bicycle','tea'],square:['tea','bus','gallery'],bridge:['bicycle','bus','square'],forest:['orchard','tea','bicycle'],wind:['bicycle','orchard','tea'],courtyard:['gallery','tea','workshop'],well:['gallery','tea','market'],rocks:['bicycle','gallery','tea'],pass:['gallery','tea','bicycle'],temple:['orchard','tea','gallery'],harbour:['market','workshop','tea'],cove:['bicycle','tea','orchard'],town:['market','clinic','library'],'old-town':['workshop','tea','library'],aquaculture:['market','workshop','orchard']};
      const local=facilities.length-start,theme=['island','shantou','jiexi','huilai','raoping','chaoan','chenghai','chaoyang','chaonan','puning','jieyang'].includes(p.kind)?(islandThemes[p.contextModel||p.model]||islandThemes.square)[local]:p.kind==='mountain'?['orchard','bicycle','tea'][local]:p.id==='guangji'?['gallery','square','tea'][local]:civicThemes[(index*5+local*3)%civicThemes.length];
      facilities.push({...c,y:heightAt(c.x,c.z),angle:Math.atan2(-c.nx,-c.nz),path,theme,variant:hash(p.id||p.name)%4,owner:p.id||p.name});
    }
    coverage.push({id:p.id||p.name,name:p.name,facilities:facilities.length-start,themes:facilities.slice(start).map(f=>f.theme)});
  }
  for(const c of coverage){const p=places.find(p=>(p.id||p.name)===c.id);c.nearby=facilities.filter(f=>Math.hypot(f.x-p.x,f.z-p.z)<Math.max(1.3,p.span||0,p.views?.[0]?.span||0)).length;}
  return {facilities,coverage};
}

export function civicVisitorPose(theme,t,index){
  const period=22+index%9,phase=((t+index*3.71)%period+period)%period/period;
  // Seat coordinates and hip heights match the furniture below, in facility-local units.
  if(['tea','bus','clinic'].includes(theme)){
    const seats=theme==='tea'?[-.10,.10]:theme==='bus'?[-.03,.035,.10]:[-.105,-.055,.055,.105];
    return {u:seats[index%seats.length],v:theme==='tea'?.078:theme==='bus'?-.03:.09,
      y:.039-.8*civicPersonScale,yaw:theme==='tea'?Math.PI:0,state:'sit',
      gesture:theme==='tea'?(phase<.25?'drink':phase<.5?'talk':null):phase>.78?'wave':null,
      strength:theme==='tea'&&phase<.25?Math.sin(phase/.25*Math.PI)**2:1};
  }
  if(theme==='market'){
    const stops=[-.125,0,.125,0],leg=Math.floor(phase*4),progress=phase*4-leg;
    const from=stops[leg],to=stops[(leg+1)%4],next=stops[(leg+2)%4];
    const direction=Math.sign(to-from)*Math.PI/2,nextDirection=Math.sign(next-to)*Math.PI/2;
    const turn=(a,b,q)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*(.5-.5*Math.cos(q*Math.PI));
    if(progress<.6)return {u:from+(to-from)*(.5-.5*Math.cos(progress/.6*Math.PI)),v:.122,y:.024,yaw:direction,state:'walk'};
    const pause=(progress-.6)/.4;
    return {u:to,v:.122,y:.024,yaw:pause<.25?turn(direction,Math.PI,pause*4):pause>.75?turn(Math.PI,nextDirection,(pause-.75)*4):Math.PI,
      state:'idle',gesture:pause>.25&&pause<.75?'talk':null};
  }
  const action={school:'wave',market:'talk',library:'photo',clinic:'idle',workshop:'talk',tea:'talk',bus:'idle',playground:'clap',orchard:'photo',gallery:'photo',square:'stretch',bicycle:'wave'}[theme]||'idle';
  let u,yaw,state;
  if(phase<.35){u=-.12+.24*(.5-.5*Math.cos(phase/.35*Math.PI));yaw=Math.PI/2;state='walk';}
  else if(phase<.5){u=.12;yaw=0;state=action;}
  else if(phase<.85){u=.12-.24*(.5-.5*Math.cos((phase-.5)/.35*Math.PI));yaw=-Math.PI/2;state='walk';}
  else{u=-.12;yaw=Math.PI;state=index%2?'wave':action;}
  return {u,v:.122,y:.024,yaw,state};
}

export function buildCivicNeighborhoods({parent,plan}){
  const group=new THREE.Group();group.name='connected-civic-neighborhoods';parent.add(group);const people=[],models=[];
  for(const [index,f] of plan.facilities.entries()){
    const g=new THREE.Group();g.position.set(f.x,f.y+.008,f.z);g.rotation.y=f.angle;g.scale.setScalar(f.scale);group.add(g);
    const tint=['#80a9ad','#aa887c','#7f9c76','#928fa8'][f.variant];
    box(g,'#a5b4ac',0,0,0,.40,.013,.31);
    box(g,'#cbd2ca',0,.013,0,.37,.009,.28);
    // Broad stair and adjacent step-free slope join the raised courtyard to its approach.
    for(let i=0;i<3;i++)box(g,'#d8ddd5',-.018,0,.165-i*.009,.13,.006+i*.008,.013);
    const ramp=box(g,'#b0bcb8',.082,.007,.148,.04,.007,.072);ramp.rotation.x=-.24;
    const building=(x,z,w,d,h,color=tint)=>{
      box(g,color,x,.023,z,w,h,d);box(g,'#425f69',x,.023+h,z,w+.014,.007,d+.014);
      for(let k=0;k<Math.max(2,Math.floor(w/.038));k++)for(let floor=0;floor<Math.max(1,Math.floor(h/.04));floor++)box(g,'#457f90',x-w*.36+k*.031,.046+floor*.037,z+d/2+.001,.020,.019,.003);
      box(g,'#e1e4d9',x,.023,z+d/2+.01,.030,.038,.008);
    };
    if(f.theme==='school'){
      building(0,-.075,.30,.075,.115);building(-.133,.02,.05,.12,.09);
      box(g,'#729f95',.027,.024,.045,.20,.003,.09);
      for(const z of [.016,.045,.075])box(g,'#e5e3c4',.027,.028,z,.185,.001,.002);
      box(g,'#596e76',.145,.026,.035,.002,.11,.002);box(g,'#c96555',.13,.10,.035,.03,.02,.002);
    }else if(f.theme==='market'){
      for(const x of [-.125,0,.125])for(const z of [-.075,.045]){
        box(g,'#c6b897',x,.024,z,.08,.035,.05);box(g,tint,x,.09,z,.095,.006,.075);
        for(const s of [-1,1])box(g,'#657d78',x+s*.035,.024,z,.004,.066,.004);
        for(let k=0;k<3;k++)disc(g,['#d7855e','#e2c96f','#7da36a'][k],x+(k-1)*.023,.060,z,.009,.009);
      }
    }else if(f.theme==='library'){
      building(-.08,-.035,.13,.17,.09);building(.075,-.08,.15,.075,.065);
      for(const x of [.02,.10]){box(g,'#b9a581',x,.024,.035,.045,.028,.038);box(g,'#e4ddbe',x,.055,.035,.027,.003,.021);}
      for(const x of [-.16,-.13,-.1,-.07,-.04])box(g,'#d5ba80',x,.034,.056,.012,.041,.012);
    }else if(f.theme==='clinic'){
      building(0,-.045,.27,.14,.082,'#d8e3df');box(g,'#bd6464',0,.092,.028,.009,.035,.004);box(g,'#bd6464',0,.105,.029,.032,.009,.004);
      for(const x of [-.105,-.055,.055,.105])box(g,'#7fa2af',x,.024,.090,.026,.015,.024);
    }else if(f.theme==='workshop'){
      for(const x of [-.11,.09])building(x,-.07,.145,.09,.075);
      for(const x of [-.10,.0,.10]){box(g,'#b59973',x,.024,.050,.055,.027,.055);for(let k=0;k<3;k++)disc(g,'#c98e76',x+(k-1)*.014,.052,.05,.005,.015);}
    }else if(f.theme==='tea'){
      building(0,-.085,.27,.065,.066);
      for(const x of [-.10,.10]){disc(g,'#b1a17f',x,.024,.035,.026,.025);for(const z of [-.008,.078])box(g,'#7f9a8e',x,.024,z,.026,.015,.024);disc(g,'#4d7979',x,.051,.035,.006,.007);}
    }else if(f.theme==='bus'){
      building(-.13,-.07,.065,.07,.058);box(g,'#72969b',.035,.086,-.055,.23,.01,.13);
      for(const x of [-.06,.135])box(g,'#677f81',x,.024,-.10,.007,.065,.008);
      for(const x of [-.03,.035,.10])box(g,'#a0b9ae',x,.024,-.03,.035,.015,.025);
      box(g,'#d2b55a',.12,.024,.07,.032,.10,.008);
    }else if(f.theme==='playground'){
      disc(g,'#c0a086',0,.024,0,.12,.003);
      for(const x of [-.075,.075])box(g,'#6faaa5',x,.024,0,.04,.057,.04);
      box(g,'#c3ab69',0,.079,0,.16,.009,.030);const slide=box(g,'#77a9bc',.07,.041,.055,.028,.006,.12);slide.rotation.x=.45;
    }else if(f.theme==='orchard'){
      for(const x of [-.12,0,.12])for(const z of [-.075,.07]){box(g,'#83a27b',x,.024,z,.075,.005,.08);tree(g,x,.025,z,.050,'broadleaf');}
    }else if(f.theme==='gallery'){
      building(-.125,-.025,.065,.17,.07);for(const x of [-.05,.035,.12]){box(g,'#d9dfd5',x,.024,-.07,.058,.055,.01);box(g,['#7ab1af','#d49e74','#8d91b7'][Math.round((x+.05)/.085)],x,.038,-.063,.04,.03,.002);}
      box(g,'#9caca4',.045,.024,.055,.18,.017,.034);
    }else if(f.theme==='square'){
      for(let i=0;i<4;i++)box(g,'#c6ccc1',0,.024+i*.01,-.095+i*.015,.26,.01,.028);
      disc(g,'#7ca6a2',0,.024,.02,.07,.006);disc(g,'#bacac1',0,.028,.02,.028,.035);
      for(const x of [-.14,.14])tree(g,x,.024,.075,.065,'broadleaf');
    }else{
      building(-.115,-.06,.095,.095,.063);
      for(let k=0;k<5;k++){const x=-.025+k*.036;for(const z of [-.05,.015]){const wheel=new THREE.Mesh(new THREE.TorusGeometry(.013,.002,4,10),new THREE.MeshStandardMaterial({color:'#496b73'}));wheel.rotation.y=Math.PI/2;wheel.position.set(x,.038,z);g.add(wheel);}box(g,'#ad9272',x,.042,-.018,.004,.015,.07);}
    }
    sign(g,names[civicThemes.indexOf(f.theme)],0,.15,-.12,.23,.034,tint);
    for(const x of [-.18,.18]){box(g,'#6f857f',x,.024,.115,.004,.078,.004);box(g,'#dfdab3',x,.102,.115,.017,.008,.017);}
    batchStatic(g);
    models.push({group:g});
    const p=person(group,index,{scale:civicPersonScale*f.scale,outfit:residentOutfit(f.theme,index)});people.push({actor:p,facility:f,index});
    p.root.userData.civicTheme=f.theme;
    if(f.theme==='tea'){
      const cup=new THREE.Mesh(new THREE.CylinderGeometry(.17,.13,.21,8),new THREE.MeshStandardMaterial({color:'#c7b685',roughness:.8}));
      cup.position.set(0,-.65,.08);p.root.children[4].add(cup);
    }
    const positions=[];for(let i=1;i<f.path.length;i++){
      const a=f.path[i-1],b=f.path[i],nx=-f.nz*.02,nz=f.nx*.02;
      for(const v of [[a[0]-nx,a[1],a[2]-nz],[b[0]+nx,b[1],b[2]+nz],[a[0]+nx,a[1],a[2]+nz],[a[0]-nx,a[1],a[2]-nz],[b[0]-nx,b[1],b[2]-nz],[b[0]+nx,b[1],b[2]+nz]])positions.push(...v);
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.computeVertexNormals();group.add(new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#b4c4bc',side:THREE.DoubleSide})));
  }
  function update(t){
    for(const {actor,facility:f,index} of people){
      const pose=civicVisitorPose(f.theme,t,index),u=pose.u*f.scale,v=pose.v*f.scale;
      actor.root.position.set(f.x+u*Math.cos(f.angle)+v*Math.sin(f.angle),f.y+.008+pose.y*f.scale,f.z-u*Math.sin(f.angle)+v*Math.cos(f.angle));
      actor.root.rotation.y=f.angle+pose.yaw;actor.pose(t,pose.state);
      if(pose.gesture==='drink'){
        actor.root.children[4].rotation.x=(-2+Math.sin(t*.8+index)*.11)*pose.strength;
        actor.root.children[4].rotation.z=-.2*pose.strength;
      }else if(pose.gesture)actor.gesture(t,pose.gesture);
    }
  }
  update(0);
  const nearby=spatialQuery(plan.facilities,f=>{const r=.25*f.scale;return [Math.min(f.x-r,...f.path.map(p=>p[0]-.03)),Math.max(f.x+r,...f.path.map(p=>p[0]+.03)),Math.min(f.z-r,...f.path.map(p=>p[2]-.03)),Math.max(f.z+r,...f.path.map(p=>p[2]+.03))];});
  return {group,models,update,clear:(x,z,r)=>nearby(x,z,r).every(f=>Math.hypot(x-f.x,z-f.z)>.25*f.scale+r&&f.path.every(p=>Math.hypot(x-p[0],z-p[2])>r+.03)),stats:{facilities:plan.facilities.length,people:people.length,coverage:plan.coverage,types:[...new Set(plan.facilities.map(f=>f.theme))]}};
}
