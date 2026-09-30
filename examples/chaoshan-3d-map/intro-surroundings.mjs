import * as THREE from 'three';
import {addSpatialInstances} from './spatial-instances.mjs';
import {overviewTree} from './overview-vegetation.mjs';
import {streetClearance} from './street-clearance.mjs';
import {landClearance} from './regional-life.mjs';
import {insidePlace} from './place-footprints.mjs';
import {treeGeometry} from './street-life.mjs';
import {placeSetting,settingCell} from './place-setting.mjs';
import {spatialQuery,placeBounds} from './spatial-query.mjs';
import {planSoftLandscape,addSoftLandscape} from './landscape-planting.mjs';

export function planIntroSurroundings({places,sites=[],routes=[],heightAt,waterAt,buildings=[],plots=[],facilities=[]}){
  const offRoad=streetClearance(routes),land=landClearance({heightAt,waterAt,buildings});
  const protectedSites=[...places.filter(p=>p.span||p.kind==='activity'||p.kind==='food'),...sites];
  const protectedNear=spatialQuery(protectedSites,placeBounds);
  const facilitiesNear=spatialQuery(facilities,f=>{const r=.26*f.scale;return [Math.min(f.x-r,...f.path.map(p=>p[0]-.03)),Math.max(f.x+r,...f.path.map(p=>p[0]+.03)),Math.min(f.z-r,...f.path.map(p=>p[2]-.03)),Math.max(f.z+r,...f.path.map(p=>p[2]+.03))];});
  const profiles=new Map(places.map(p=>[p,placeSetting(p)]));
  const plotIndex=new Map();for(const p of plots){const k=Math.floor(p.x/.5)+','+Math.floor(p.z/.5);if(!plotIndex.has(k))plotIndex.set(k,[]);plotIndex.get(k).push(p);}
  const nearPlot=(x,z,size)=>{for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const q of plotIndex.get((Math.floor(x/.5)+dx)+','+(Math.floor(z/.5)+dz))||[])if(Math.abs(x-q.x)<q.size+size*.7&&Math.abs(z-q.z)<q.size+size*.7)return true;return false;};
  const cells=[],coverage=[],keys=new Set(),gardens=[];
  const parcelNear=spatialQuery(plots,p=>[p.x-p.size,p.x+p.size,p.z-p.size,p.z+p.size],.3),gardenNear=new Map();
  for(const [index,p] of plots.entries()){
    const angle=-(p.angle||0),co=Math.cos(angle),si=Math.sin(angle),radius=.013;
    // Side and rear planting leaves the whole front entrance corridor open.
    const reach=p.size*.84+.022,candidates=[[-reach,-p.size*.28],[reach,-p.size*.28],[-p.size*.3,-reach],[p.size*.3,-reach]];
    for(let i=0;i<candidates.length;i++){
      if(gardens.length&&gardens.at(-1).owner===index)break;
      const [u,v]=candidates[(i+(p.variant||0))%candidates.length],x=p.x+u*co+v*si,z=p.z-u*si+v*co,y=heightAt(x,z);
      if(!land(x,z,radius)||!offRoad(x,z,radius+.04)||protectedNear(x,z,radius).some(q=>insidePlace(q,x,z,radius)))continue;
      if(parcelNear(x,z,radius).some(q=>Math.hypot(x-q.x,z-q.z)<q.size*.84+radius))continue;
      if(facilitiesNear(x,z,radius).some(q=>Math.hypot(x-q.x,z-q.z)<.26*q.scale+radius||q.path.some(a=>Math.hypot(x-a[0],z-a[2])<.03+radius)))continue;
      if([-1,0,1].some(dx=>[-1,0,1].some(dz=>waterAt(x+dx*radius,z+dz*radius)!==null||Math.abs(heightAt(x+dx*radius,z+dz*radius)-y)>.008)))continue;
      const gx=Math.floor(x/.05),gz=Math.floor(z/.05);let occupied=false;
      for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)if((gardenNear.get(`${gx+dx},${gz+dz}`)||[]).some(q=>Math.hypot(x-q.x,z-q.z)<radius*2+.008))occupied=true;
      if(occupied)continue;
      const key=`${gx},${gz}`,garden={x,y,z,radius,angle,owner:index,family:p.profile?.family||'urban',variant:p.variant||0};
      gardens.push(garden);if(!gardenNear.has(key))gardenNear.set(key,[]);gardenNear.get(key).push(garden);
    }
  }
  const regional=places.filter(p=>['raoping','huilai','chaoan','chenghai','chaoyang','chaonan','puning','jieyang'].includes(p.kind));
  for(const p of [...places,...sites.map(s=>({...s,id:s.id+'-recreation',kind:'recreation'}))]){
    const wide=['district','mountain'].includes(p.kind),step=['landmark','island','shantou'].includes(p.kind)?.04:.10;
    const radius=wide?3.2:Math.max(1.3,(p.span||.2)+.8,p.views?.[0]?.span||0),n=Math.ceil(radius/step),before=cells.length;
    for(let ix=-n;ix<=n;ix++)for(let iz=-n;iz<=n;iz++){
      const x=Math.round((p.x+ix*step)/step)*step,z=Math.round((p.z+iz*step)/step)*step;
      const d=Math.hypot(x-p.x,z-p.z),size=step*.94,key=x.toFixed(2)+','+z.toFixed(2);
      if(d>radius||keys.has(key)||!offRoad(x,z,size*.75+.025)||!land(x,z,size*.75))continue;
      if(protectedNear(x,z,size*.8).some(q=>insidePlace(q,x,z,size*.8)))continue;
      if(facilitiesNear(x,z,size*.8).some(q=>Math.hypot(x-q.x,z-q.z)<.26*q.scale+size*.8||q.path.some(v=>Math.hypot(x-v[0],z-v[2])<.03+size*.8)))continue;
      const h=heightAt(x,z),corners=[[-1,-1],[-1,1],[1,1],[1,-1]].map(([dx,dz])=>[x+dx*size/2,z+dz*size/2]);
      if(h<0||corners.some(v=>waterAt(...v)!==null||Math.abs(heightAt(...v)-h)>.035))continue;
      const profile=profiles.get(p)||placeSetting(p),setting=settingCell(profile,x-p.x,z-p.z,size),seed=setting.value,kind=nearPlot(x,z,size)?'lawn':setting.path?'walk':'lawn';
      cells.push({x,z,y:h,size,kind,seed,corners,profile,setting,owner:p.id||p.name,nearBuilding:nearPlot(x,z,size)});keys.add(key);
    }
    coverage.push({id:p.id||p.name,name:p.name,kind:p.kind,cells:cells.length-before,x:p.x,z:p.z,radius});
  }
  // Thin dry riverbanks need smaller tiles than the normal roadside planting grid.
  // No furniture is placed here: the narrow strip remains a continuous soft bank.
  for(const p of places.filter(p=>p.id==='guangji')){
    const step=.012;
    for(let ix=-65;ix<=65;ix++)for(let iz=-65;iz<=65;iz++){
      const x=p.x+ix*step,z=p.z+iz*step,size=step*.98;
      if(!land(x,z,.009)||!offRoad(x,z,.043+size*.5)||insidePlace(p,x,z,.009))continue;
      if(![[.045,0],[-.045,0],[0,.045],[0,-.045]].some(([dx,dz])=>waterAt(x+dx,z+dz)!==null))continue;
      if(facilities.some(f=>Math.hypot(x-f.x,z-f.z)<.26*f.scale+.009))continue;
      const corners=[[-1,-1],[-1,1],[1,1],[1,-1]].map(([dx,dz])=>[x+dx*size/2,z+dz*size/2]);
      if(corners.some(v=>waterAt(...v)!==null))continue;
      cells.push({x,z,y:heightAt(x,z),size,kind:'bank',seed:Math.abs(ix+iz),corners,owner:p.id});
    }
  }
  // Shared cells may have been generated by an earlier district. Apply regional planting by proximity.
  const regionalNear=spatialQuery(regional,p=>[p.x-1.95,p.x+1.95,p.z-1.95,p.z+1.95]);
  for(const c of cells){
    let nearest,distance=1.95;
    for(const p of regionalNear(c.x,c.z)){const d=Math.hypot(c.x-p.x,c.z-p.z);if(d<distance){distance=d;nearest=p;}}
    if(nearest){c.regionalTheme=nearest.contextModel;c.regionalOwner=nearest.id;c.profile=profiles.get(nearest);c.setting=settingCell(c.profile,c.x-nearest.x,c.z-nearest.z,c.size);}
  }
  // Count visible/shared surroundings as well as newly owned tiles; later stops overlap earlier ones.
  const cellsNear=spatialQuery(cells,c=>[c.x,c.x,c.z,c.z]);
  for(const c of coverage)c.nearbyCells=cellsNear(c.x,c.z,c.radius).filter(v=>Math.hypot(v.x-c.x,v.z-c.z)<=c.radius).length;
  return {cells,coverage,gardens};
}

export function buildIntroSurroundings({parent,...options}){
  const plan=planIntroSurroundings(options),group=new THREE.Group();group.name='intro-gardens-and-walks';parent.add(group);
  const decor=new Map(),plants=new Map(),planted=new Map();
  const understory=planSoftLandscape(plan.cells,{heightAt:options.heightAt});
  const add=(color,x,y,z,w,h,d)=>{if(!decor.has(color))decor.set(color,[]);decor.get(color).push({x,y,z,w,h,d});};
  for(const c of plan.cells){
    const regional=!!c.profile;
    // Planting cells are sampling locations, not stacked square ground meshes.
    // The continuous elevation mesh owns the ground colour and all its normals.
    if(regional&&c.setting?.plant&&c.kind!=='walk'&&!c.nearBuilding){
      const step=.075,kx=Math.floor(c.x/step),kz=Math.floor(c.z/step);let close=false;
      for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const q of planted.get(`${kx+dx},${kz+dz}`)||[])if(Math.hypot(q.x-c.x,q.z-c.z)<.07)close=true;
      if(!close){
        const type=c.setting.tree;
        const scale=Math.min(c.size*.9,.055)+(c.seed%3)*.009;
        if(!plants.has(type))plants.set(type,[]);plants.get(type).push({...c,scale});
        const key=`${kx},${kz}`;if(!planted.has(key))planted.set(key,[]);planted.get(key).push(c);
      }
    }
    if(c.setting?.treatment==='crop'&&!c.nearBuilding&&c.seed%3===0){
      for(const side of [-1,1])add(c.profile.family==='tea'?'#447957':'#b3bc6f',c.x,c.y+.012,c.z+side*c.size*.2,c.size*.82,.006,c.size*.15);
    }
    if(c.kind==='garden'&&!regional){
      const unit=c.size/.1;
      add('#d6ddd2',c.x,c.y+.013,c.z,c.size*.52,.012,c.size*.52);
      for(const dx of [-1,1])for(const dz of [-1,1])add('#578b67',c.x+dx*c.size*.12,c.y+.018+.01*unit,c.z+dz*c.size*.12,c.size*.2,.016*unit,c.size*.2);
      if(c.seed%3===0)add('#dbaa98',c.x,c.y+.020+.020*unit,c.z,c.size*.14,.004,c.size*.14);
    }
    if(c.kind==='walk'&&c.seed%17===0){
      add('#759897',c.x,c.y+.026,c.z,c.size*.6,.013,c.size*.18);
      add('#526d74',c.x,c.y+.041,c.z-c.size*.085,c.size*.6,.018,.004);
      add('#536d70',c.x+c.size*.35,c.y+.013+c.size*.5,c.z,.003,c.size,.003);
      add('#e7deb4',c.x+c.size*.35,c.y+.013+c.size,c.z,.012,.006,.012);
    }
  }
  const dummy=new THREE.Object3D();
  if(plan.gardens.length){
    addSoftLandscape(group,plan.gardens.map(g=>({...g,y:g.y+.001,turn:g.angle,type:['forest','tea','farmland'].includes(g.family)?'woodland':['headland','dune','fishing'].includes(g.family)?'coastal':'garden'})),'roadside-frontage-gardens');
  }
  for(const [color,items] of decor){const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color,roughness:.9}),items.length);items.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,0,0);dummy.scale.set(p.w,p.h,p.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.computeBoundingSphere();group.add(mesh);}
  const softLandscape=addSoftLandscape(group,understory);
  for(const [type,items] of plants){const mesh=new THREE.InstancedMesh(treeGeometry(type),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9}),items.length);items.forEach((p,i)=>{dummy.position.set(p.x,p.y+.012,p.z);dummy.rotation.set(0,p.seed*2.399,0);dummy.scale.setScalar(p.scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.computeBoundingSphere();addSpatialInstances(group,mesh,4,overviewTree(type));}
  return {group,stats:{cells:plan.cells.length,coverage:plan.coverage,frontageGardens:plan.gardens.length,understory:understory.length,plantingTypes:softLandscape.userData.planting.types,regionalPlants:[...plants.values()].reduce((n,p)=>n+p.length,0)}};
}
