import * as THREE from 'three';
import {spatialQuery} from './spatial-query.mjs';
import {placeSetting} from './place-setting.mjs';
import {serviceFor,addServiceSigns} from './neighborhood-services.mjs';
import {serviceBuilding} from './service-buildings.mjs';
import {addAmenityPeople} from './amenity-life.mjs';
import {chooseServiceResidents,addServiceResident} from './service-life.mjs';
import {planExhibitGardens,addExhibitGardens} from './exhibit-gardens.mjs';
import {addSoftLandscape} from './landscape-planting.mjs';

const noise=(x,z,seed)=>{const n=Math.sin(x*127.1+z*311.7+seed)*43758.5453;return n-Math.floor(n);};
export function pathDistance(x,z,paths){
 let distance=Infinity,point;
 for(const line of paths)for(let i=1;i<line.length;i++){
  const a=line[i-1],b=line[i],dx=b[0]-a[0],dz=b[2]-a[2],t=THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz||1),0,1);
  const px=a[0]+dx*t,pz=a[2]+dz*t,d=Math.hypot(x-px,z-pz);
  if(d<distance){distance=d;point=[px,pz];}
 }
 return {distance,point};
}

export function reachableExhibitEntrance({x,z,y,setback,paths,ground,parcels=[],maxDistance=.20}){
 const candidates=[];
 for(const line of paths)for(let i=1;i<line.length;i++){
  const candidate=pathDistance(x,z,[[line[i-1],line[i]]]);
  if(candidate.point&&candidate.distance<=maxDistance&&!candidates.some(p=>Math.hypot(p.point[0]-candidate.point[0],p.point[1]-candidate.point[1])<.008))candidates.push(candidate);
 }
 candidates.sort((a,b)=>a.distance-b.distance);
 for(const candidate of candidates.slice(0,8)){
  const angle=Math.atan2(candidate.point[0]-x,candidate.point[1]-z);
  const start=[x+Math.sin(angle)*setback,y+.003,z+Math.cos(angle)*setback];
  const link=planExhibitAccess({start,end:candidate.point,ground,parcels});
  if(link)return {angle,link};
 }
 return null;
}

// Read the actual, unbatched local surfaces. A water plane must hide any land below it.
export function inspectExhibitGround(group){
 group.updateWorldMatrix(true,true);
 const inverse=group.matrixWorld.clone().invert(),surfaces=[],solids=[];
 const matrix=new THREE.Matrix4(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
 group.traverse(o=>{
  if(!o.isMesh||o.userData.sign||o.material?.transparent)return;
  matrix.multiplyMatrices(inverse,o.matrixWorld);const geo=o.geometry;geo.computeBoundingBox();
  const bounds=geo.boundingBox.clone().applyMatrix4(matrix),size=bounds.getSize(new THREE.Vector3());
  if(bounds.max.y>.045&&size.y>.03){solids.push({minX:bounds.min.x,maxX:bounds.max.x,minZ:bounds.min.z,maxZ:bounds.max.z});return;}
  if(bounds.max.y>.075||size.y>.045||Math.max(size.x,size.z)<.07)return;
  const color=o.material?.color?.clone().convertLinearToSRGB();
  const wet=color&&color.r<color.g*.93&&color.b>color.g*.91;
  const position=geo.attributes.position,indices=geo.index,count=indices?.count||position.count;
  for(let i=0;i<count;i+=3){
   a.fromBufferAttribute(position,indices?indices.getX(i):i).applyMatrix4(matrix);
   b.fromBufferAttribute(position,indices?indices.getX(i+1):i+1).applyMatrix4(matrix);
   c.fromBufferAttribute(position,indices?indices.getX(i+2):i+2).applyMatrix4(matrix);
   const normal=b.clone().sub(a).cross(c.clone().sub(a));if(normal.y<=0||normal.y/normal.length()<.94)continue;
   surfaces.push({a:a.clone(),b:b.clone(),c:c.clone(),wet,minX:Math.min(a.x,b.x,c.x),maxX:Math.max(a.x,b.x,c.x),minZ:Math.min(a.z,b.z,c.z),maxZ:Math.max(a.z,b.z,c.z)});
  }
 });
 const bounds=o=>[o.minX,o.maxX,o.minZ,o.maxZ],near=spatialQuery(surfaces,bounds,.12),solidNear=spatialQuery(solids,bounds,.12);
 const ray=new THREE.Ray(new THREE.Vector3(),new THREE.Vector3(0,-1,0)),hit=new THREE.Vector3();
 const sample=(x,z)=>{ray.origin.set(x,1,z);let top;
  for(const s of near(x,z))if(ray.intersectTriangle(s.a,s.b,s.c,false,hit)&&(!top||hit.y>top.y))top={y:hit.y,wet:s.wet};
  return top;
 };
 return {sample,clear:(x,z,r)=>!solidNear(x,z,r).some(b=>x+r>b.minX&&x-r<b.maxX&&z+r>b.minZ&&z-r<b.maxZ),surfaces:surfaces.length};
}

export function planExhibitInfill({group,place,paths,bounds=[-.57,.57,-.43,.43]}){
 const ground=inspectExhibitGround(group),profile=placeSetting(place),parcels=[],plants=[],amenities=[],access=[];
 const [left,right,back,front]=bounds;
 const valid=(x,z,r)=>{
  if(x-r<left||x+r>right||z-r<back||z+r>front||!ground.clear(x,z,r))return;
  if(pathDistance(x,z,paths).distance<r+.036)return;
  const center=ground.sample(x,z);if(!center||center.wet||center.y<-.002)return;
  for(const dx of [-1,0,1])for(const dz of [-1,0,1]){const q=ground.sample(x+dx*r,z+dz*r);if(!q||q.wet||Math.abs(q.y-center.y)>.005)return;}
  if(parcels.some(p=>Math.hypot(x-p.x,z-p.z)<r+p.radius+.015))return;
  if(amenities.some(p=>Math.hypot(x-p.x,z-p.z)<r+p.radius+.008))return;
  if(access.some(line=>pathDistance(x,z,[line]).distance<r+.012))return;
  return center.y;
 };
 const natural=['forest','tea','headland','dune','lake'].includes(profile.family);
 const visitorHub=['gate','square','lighthouse','well'].includes(place.model);
 const max=natural?(visitorHub?8:4):10;
 const candidates=[];
 for(let x=left+.055;x<right-.04;x+=.067)for(let z=back+.055;z<front-.04;z+=.067){
  const score=noise(x,z,profile.seed),px=x+(score-.5)*.027,pz=z+(noise(z,x,profile.seed)-.5)*.027;
  candidates.push({x:px,z:pz,score});
 }
 candidates.sort((a,b)=>a.score-b.score);
 for(const q of candidates){
  if(parcels.length>=max)break;const size=(natural?.044:.061)+q.score*(natural?.020:.035),radius=size*.84,y=valid(q.x,q.z,radius),path=pathDistance(q.x,q.z,paths);
  if(y===undefined||path.distance>.20||!path.point)continue;
  const service=serviceFor(profile,parcels.length+Math.floor(q.score*31));
  const program=serviceBuilding(service,{size,height:.10,variant:(profile.seed+parcels.length)%4,low:true,residential:true,setting:profile.family});if(!program)continue;
  const entrance=reachableExhibitEntrance({x:q.x,z:q.z,y,setback:size*.59,paths,ground,parcels});if(!entrance)continue;
  const {angle,link}=entrance;
  access.push(link);parcels.push({...q,y,radius,size,program,service,angle,variant:(profile.seed+parcels.length)%4});
 }
 const types=visitorHub?['market','shelter','tea','bench']:natural?['shelter','tea']:['market','tea','bench'];
 for(const q of candidates){
  if(amenities.length>=(natural?4:7))break;
  const radius=.034,y=valid(q.x,q.z,radius),path=pathDistance(q.x,q.z,paths);
  if(y===undefined||path.distance>.12||!path.point)continue;
  const entrance=reachableExhibitEntrance({x:q.x,z:q.z,y,setback:radius,paths,ground,parcels:[...parcels,...amenities],maxDistance:.12});if(!entrance)continue;
  const {angle,link}=entrance;
  access.push(link);amenities.push({...q,y,radius,angle,type:types[(amenities.length+profile.seed)%types.length]});
 }
 // Preserve resting places and their residents before growing neighbouring premises.
 for(const [index,p] of parcels.entries()){
  const others=[...parcels.filter(q=>q!==p),...amenities],otherAccess=access.filter((_,i)=>i!==index);
  const maximum=natural?.09:.13;p.originalSize=p.size;
  for(let size=p.size+.008;size<=maximum+.00001;size+=.008){
   const radius=size*.84;
   if(!exhibitParcelFits({x:p.x,z:p.z,y:p.y,radius,bounds,ground,paths,parcels:others,access:otherAccess}))break;
   const entrance=reachableExhibitEntrance({x:p.x,z:p.z,y:p.y,setback:size*.59,paths,ground,parcels:others});
   if(!entrance)break;
   p.size=size;p.radius=radius;p.angle=entrance.angle;
   p.program=serviceBuilding(p.service,{size,height:.10,variant:p.variant,low:true,residential:true,setting:profile.family});
   access[index]=entrance.link;
  }
 }
 // Revisit gaps only after existing shops and resting places have their final footprints.
 const infillLimit=max+(visitorHub?2:natural?2:4),gaps=[];
 for(let x=left+.045;x<right-.04;x+=.039)for(let z=back+.045;z<front-.04;z+=.039){
  const score=noise(x,z,profile.seed+97);gaps.push({x,z,score});
 }
 gaps.sort((a,b)=>a.score-b.score);
 for(const q of gaps){
  if(parcels.length>=infillLimit)break;
  for(const size of natural?[.070,.055,.044]:[.085,.068,.052]){
   const radius=size*.84,y=valid(q.x,q.z,radius);if(y===undefined)continue;
   const entrance=reachableExhibitEntrance({x:q.x,z:q.z,y,setback:size*.59,paths,ground,parcels:[...parcels,...amenities].map(p=>({...p,radius:p.radius+.006})),maxDistance:.28});
   if(!entrance)continue;
   const service=serviceFor(profile,parcels.length+Math.floor(q.score*31)),variant=(profile.seed+parcels.length)%4;
   const program=serviceBuilding(service,{size,height:.10,variant,low:true,residential:true,setting:profile.family});if(!program)continue;
   access.push(entrance.link);
   parcels.push({...q,y,radius,size,originalSize:size,program,service,angle:entrance.angle,variant,gapInfill:true});break;
  }
 }
 for(let x=left+.04;x<right-.03;x+=.058)for(let z=back+.04;z<front-.03;z+=.058){
  const n=noise(x,z,profile.seed),px=x+(n-.5)*.017,pz=z+(noise(z,x,profile.seed)-.5)*.017;
  const field=Math.sin(px*14+profile.phase)+Math.cos(pz*11-profile.phase);
  if(n>.83||field<(natural?-.7:.25))continue;
  const radius=.018+n*.009,y=valid(px,pz,radius);if(y===undefined)continue;
  plants.push({x:px,z:pz,y,radius,rock:profile.family==='headland'&&n>.74,color:['#3f7858','#527f5b','#6b955e'][Math.floor(n*3)]});
 }
 const gardens=planExhibitGardens({ground,paths,parcels,amenities,access,bounds,profile});
 return {parcels,plants,amenities,access,profile,gardens};
}

export function exhibitParcelFits({x,z,y,radius:r,bounds,ground,paths,parcels=[],access=[]}){
 const [left,right,back,front]=bounds;
 if(x-r<left||x+r>right||z-r<back||z+r>front||!ground.clear(x,z,r))return false;
 if(pathDistance(x,z,paths).distance<r+.036)return false;
 if(parcels.some(p=>Math.hypot(x-p.x,z-p.z)<r+p.radius+.015))return false;
 if(access.some(line=>pathDistance(x,z,[line]).distance<r+.012))return false;
 for(const dx of [-1,0,1])for(const dz of [-1,0,1]){
  const q=ground.sample(x+dx*r,z+dz*r);if(!q||q.wet||Math.abs(q.y-y)>.005)return false;
 }
 return true;
}

// Follow sampled dry ground across the whole corridor, not just its endpoints.
export function planExhibitAccess({start,end,ground,parcels=[],width=.014}){
 const dx=end[0]-start[0],dz=end[1]-start[2],length=Math.hypot(dx,dz),steps=Math.max(2,Math.ceil(length/.008)),points=[];
 if(length<.001)return null;
 let previous;
 for(let i=0;i<=steps;i++){
  const t=i/steps,x=start[0]+dx*t,z=start[2]+dz*t;
  if(!ground.clear(x,z,width*.5)||parcels.some(p=>Math.hypot(x-p.x,z-p.z)<p.radius+width*.5))return null;
  const p=ground.sample(x,z);if(!p||p.wet)return null;
  if(previous!==undefined&&Math.abs(p.y-previous)>.021)return null;
  for(const side of [-1,1]){const edge=ground.sample(x+side*dz/length*width*.5,z-side*dx/length*width*.5);if(!edge||edge.wet||Math.abs(edge.y-p.y)>.009)return null;}
  points.push([x,p.y+.003,z]);previous=p.y;
 }
 return points;
}

export function addExhibitInfill(options){
 const plan=planExhibitInfill(options);toneExhibitPaving(options.group,plan.profile);
 const group=new THREE.Group();group.name='landmark-interior-life';options.group.add(group);
 addExhibitGardens(group,plan.gardens);
 const geometry={box:new THREE.BoxGeometry(1,1,1),sphere:new THREE.SphereGeometry(.5,8,6),cylinder:new THREE.CylinderGeometry(.5,.5,1,10)},materials=new Map(),signs=[];
 const material=color=>{if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.95}));return materials.get(color);};
 for(const line of plan.access)for(let i=1;i<line.length;i++){
  const a=new THREE.Vector3(...line[i-1]),b=new THREE.Vector3(...line[i]),direction=b.clone().sub(a);
  const walk=new THREE.Mesh(geometry.box,material(plan.profile.family==='harbour'?'#8c957c':'#859887'));
  walk.position.copy(a).add(b).multiplyScalar(.5);walk.scale.set(.014,.002,direction.length()+.0008);walk.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),direction.normalize());group.add(walk);
 }
 const staffed=new Set(chooseServiceResidents(plan.parcels,plan.profile.seed)),serviceResidents=[];
 for(const [index,p] of plan.parcels.entries()){
  const local=new THREE.Group();local.position.set(p.x,p.y,p.z);local.rotation.y=p.angle;group.add(local);
  for(const r of p.program.parts){const mesh=new THREE.Mesh(geometry[r.shape],material(r.color));mesh.position.set(r.x,r.y,r.z);mesh.rotation.y=r.turn;mesh.scale.set(r.w,r.h,r.d);local.add(mesh);}
  const s=p.program.sign,co=Math.cos(p.angle),si=Math.sin(p.angle);
  signs.push({x:p.x+s.x*co+s.z*si,y:p.y+s.y,z:p.z-s.x*si+s.z*co,width:s.width,height:s.height,angle:p.angle,service:p.service});
  if(staffed.has(p)){const actor=addServiceResident(local,p,plan.profile.seed%56+index);if(actor)serviceResidents.push(actor.root.userData.serviceResident);}
 }
 let people=0;
 for(const [index,p] of plan.amenities.entries()){
  const local=new THREE.Group();local.position.set(p.x,p.y,p.z);local.rotation.y=p.angle;group.add(local);
  const part=(color,x,y,z,w,h,d,shape='box')=>{const m=new THREE.Mesh(geometry[shape],material(color));m.position.set(x,y,z);m.scale.set(w,h,d);local.add(m);};
  if(p.type==='market'){
   part('#88734d',0,.012,0,.035,.024,.021);part('#577c74',0,.027,0,.04,.004,.026);
   for(let i=-1;i<=1;i++){part(['#bda555','#8e5364','#619264'][i+1],i*.011,.031,0,.008,.007,.018);part('#486c6b',i*.014,.026,-.015,.002,.052,.002);}
   part('#6f8d7b',0,.055,0,.044,.004,.034);
  }else if(p.type==='tea'){
   part('#97794e',0,.019,0,.027,.004,.027,'cylinder');part('#4a6c62',0,.009,0,.005,.018,.005);
   for(const x of [-.021,.021]){part('#688978',x,.009,0,.012,.005,.015);part('#4c6b62',x,.004,0,.008,.008,.01);}
   part('#456f65',0,.025,0,.007,.009,.007,'cylinder');for(const z of [-.007,.007])part('#b2bc9c',.006,.023,z,.005,.003,.005,'cylinder');
  }else{
   part('#91794f',0,.012,0,.038,.005,.013);part('#91794f',0,.023,-.007,.038,.018,.004);
   for(const x of [-.014,.014])part('#496a61',x,.006,0,.004,.012,.01);
   if(p.type==='shelter'){for(const x of [-.021,.021])part('#59796a',x,.033,-.012,.003,.066,.003);part('#5d7d68',0,.068,0,.05,.005,.035);}
  }
  if(index<2)people+=addAmenityPeople(local,p,(plan.profile.seed+index)%56).length;
 }
 const rock=new THREE.IcosahedronGeometry(1,0);
 for(const p of plan.plants){
  if(!p.rock)continue;
  const mesh=new THREE.Mesh(rock,material('#889987'));mesh.position.set(p.x,p.y+p.radius*.3,p.z);mesh.scale.set(p.radius*.72,p.radius*.52,p.radius*.64);group.add(mesh);
 }
 addSoftLandscape(group,plan.plants.filter(p=>!p.rock).map((p,i)=>({...p,y:p.y+.001,turn:i*2.399,type:i%4===0?'garden':'woodland'})),'exhibit-shrub-borders');
 addServiceSigns(group,signs);group.userData.infill={services:plan.parcels.length,homes:plan.parcels.filter(p=>p.service[0]==='home').length,amenities:plan.amenities.length,people,access:plan.access.length,plants:plan.plants.length,family:plan.profile.family,serviceArea:plan.parcels.reduce((sum,p)=>sum+p.size*p.size,0),addedServiceArea:plan.parcels.reduce((sum,p)=>sum+p.size*p.size-p.originalSize*p.originalSize,0),serviceSizes:plan.parcels.map(p=>p.size)};
 group.userData.infill.gapServices=plan.parcels.filter(p=>p.gapInfill).length;
 group.userData.infill.serviceResidents=serviceResidents;
 group.userData.infill.people+=serviceResidents.length;
 group.userData.infill.gardenArea=plan.gardens.area;
 options.group.userData.infill=group.userData.infill;
 return plan;
}

export function toneExhibitPaving(group,profile){
 const colors={urban:'#90a5a5',arcade:'#99a59a',courtyard:'#a3aa93',transport:'#8ca6ad',harbour:'#87a6a3',fishing:'#9cb296',river:'#98b29d',lake:'#91ae92',forest:'#88a184',tea:'#91a67e',farmland:'#9bac87',headland:'#a5ad93',dune:'#b9ba95'};
 group.updateWorldMatrix(true,true);const inverse=group.matrixWorld.clone().invert(),matrix=new THREE.Matrix4();let count=0;
 group.traverse(o=>{
  if(!o.isMesh||o.userData.sign||Array.isArray(o.material)||o.material.map||o.material.transparent||!o.material.color)return;
  o.geometry.computeBoundingBox();matrix.multiplyMatrices(inverse,o.matrixWorld);
  const b=o.geometry.boundingBox.clone().applyMatrix4(matrix),s=b.getSize(new THREE.Vector3()),c=o.material.color.clone().convertLinearToSRGB();
  if(b.max.y>.075||s.y>.045||s.x*s.z<.025||Math.min(c.r,c.g,c.b)<.64||Math.max(c.r,c.g,c.b)-Math.min(c.r,c.g,c.b)>.23)return;
  o.material=o.material.clone();o.material.color.set(colors[profile.family]||colors.urban);o.material.roughness=.98;count++;
 });
 return count;
}
