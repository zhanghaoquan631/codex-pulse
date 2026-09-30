import * as THREE from 'three';
import {planCityLife,cityThemes} from './city-layout.mjs';
import {terrainPaving} from './terrain-paving.mjs';

export function createCityLife({scene,data,anchors,heightAt,waterAt,excluded,infillExcluded,createBuilder,reducedMotion=false}){
 const plan=planCityLife({data,anchors,heightAt,waterAt,excluded,infillExcluded}),districts=new THREE.Group();districts.name='用地约束的示意城市街区';districts.userData.atlasLayer='buildings';scene.add(districts);
 const buildings=createBuilder(districts,{cellSize:2,tintInstances:true}),palette=['#cfdae0','#d5cfc4','#bbd0cb','#e4e4dc','#b9c4ce'];
 for(const [i,p] of plan.infill.entries()){
  const y=Math.max(...[[-p.w/2,-p.d/2],[p.w/2,p.d/2],[0,0]].map(([x,z])=>heightAt(p.x+x,p.z+z))),c=palette[i%palette.length];
  const cAngle=Math.cos(p.angle),sAngle=Math.sin(p.angle);
  const part=(color,x,h,z,w,d,hh,rotation=p.angle)=>buildings.part('box',color,[p.x+x*cAngle+z*sAngle,y+h,p.z-x*sAngle+z*cAngle],[w,hh,d],[0,rotation,0]);
  if(p.style==='court'){
   part(c,-p.w*.31,p.height/2,0,p.w*.28,p.d,p.height);part(c,p.w*.31,p.height/2,0,p.w*.28,p.d,p.height);part(c,0,p.height*.4,-p.d*.32,p.w,p.d*.3,p.height*.8);
  }else if(p.style==='terrace'){
   part(c,0,p.height*.3,0,p.w,p.d,p.height*.6);part('#e4e9e5',0,p.height*.8,0,p.w*.66,p.d*.65,p.height*.4);
  }else{
   part(c,0,p.height/2,0,p.w,p.d,p.height);
   part(p.style==='warehouse'?'#718f9a':'#809498',0,p.height+.001,0,p.w*1.03,p.d*1.03,.002);
  }
  if(p.style!=='warehouse')for(const side of [-1,1])for(let k=-1;k<=1;k++)part('#6b95a7',k*p.w*.25,p.height*.58,side*p.d*.505,p.w*.12,.0007,p.height*.65);
  if(i%3===0)part('#6e9872',0,p.height+.002,0,p.w*.32,p.d*.28,.002);
 }
 const buildingInstances=buildings.finish(),streets=new THREE.Group();streets.name='全域街边餐饮与休憩';scene.add(streets);
 const props=createBuilder(streets,{cellSize:2,tintInstances:true}),signs=new Map();
 for(const [i,v] of plan.venues.entries()){
  const x=v.x,z=v.z,y=heightAt(x,z),color=['#568d8b','#bb756a','#c5a85c','#849d70'][v.style];
  const box=(c,dx,dy,dz,w,h,d)=>props.part('box',c,[x+dx,y+dy,z+dz],[w,h,d]);
  if(v.style===0){
   props.part('cylinder','#e2dfd6',[x,y+.003,z],[.006,.0005,.006]);props.part('cylinder','#748274',[x,y+.0015,z],[.0006,.003,.0006]);
   props.part('cone',color,[x,y+.013,z],[.009,.0028,.009]);props.part('cylinder','#78897f',[x,y+.007,z],[.00035,.013,.00035]);
  }else if(v.style===1){box(color,0,.003,0,.012,.005,.005);box('#edeadf',0,.011,0,.014,.001,.009);for(const side of [-1,1])box('#768a85',side*.006,.007,0,.0005,.009,.0005);}
  else if(v.style===2){for(const side of [-1,1])box('#859484',side*.006,.006,0,.0005,.012,.0005);box(color,0,.012,0,.017,.0015,.011);box('#dfd9ce',0,.003,0,.013,.002,.006);}
  else{box('#ece6dc',0,.003,0,.014,.006,.007);box('#6e98a6',0,.0065,.004,.014,.002,.0006);box(color,0,.009,.005,.015,.001,.009);}
  for(const side of [-1,1])box('#839a8e',side*.008,.002,0,.004,.0006,.004);
  const dishY=y+.0044;
  if(['海蛎煎','姜母鸭','海鲜'].includes(v.food)){
   props.part('cylinder','#e3e8df',[x,dishY,z],[.0035,.0003,.0035]);
   if(v.food==='海蛎煎'){props.part('cylinder','#e4b858',[x,dishY+.0003,z],[.003,.0003,.0025]);for(let j=0;j<4;j++)props.part('ball','#6d9d70',[x+(j-1.5)*.0006,dishY+.00055,z+j%2*.0006],[.0003,.00012,.0003]);}
   else for(let j=0;j<3;j++)props.part('ball',v.food==='姜母鸭'?'#956151':'#b8a6a0',[x+(j-1)*.0008,dishY+.0006,z],[.001,.0005,.00055],[0,.3*j,0]);
  }else if(['咖啡','茶'].includes(v.food)){
   for(let j=-1;j<=1;j++)props.part('cylinder',j===0?'#a9c2bf':'#efede2',[x+j*.0015,dishY+.0005,z],[.0005,.001,.0005]);
   props.part('ball','#7bafa4',[x,dishY+.0014,z],[.001,.0007,.0008]);
  }else if(v.food==='水果'){for(let j=0;j<6;j++)props.part('ball',j%2?'#e3b04e':'#c87569',[x+(j%3-1)*.001,dishY+.0006,z+Math.floor(j/3)*.001],[.00065,.00065,.00065]);}
  else{
   props.part('cylinder','#e5e6db',[x,dishY+.0004,z],[.0025,.001,.0025]);props.part('cylinder','#b9a074',[x,dishY+.001,z],[.002,.00015,.002]);
   for(let j=0;j<4;j++)box(v.food==='花生汤'?'#e5c691':'#dbd8bc',(j-1.5)*.0005,.0056,0,.00018,.00013,.0025);
  }
  if(!signs.has(v.food))signs.set(v.food,[]);signs.get(v.food).push([x,y+.015,z,v.angle]);
  for(const side of [-1,1]){props.part('ball','#659172',[x+side*.013,y+.004,z+.008],[.0035,.0028,.003]);props.part('cylinder','#819686',[x+side*.013,y+.0015,z+.008],[.0004,.003,.0004]);}
 }
 const propInstances=props.finish();
 for(const [name,positions] of signs){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillStyle='#eef1e7';ctx.fillRect(0,0,256,64);ctx.fillStyle='#315b56';ctx.font='bold 40px sans-serif';ctx.textAlign='center';ctx.fillText(name,128,47);
  const mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(.016,.004),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),side:THREE.DoubleSide}),positions.length),dummy=new THREE.Object3D();
  positions.forEach(([x,y,z,angle],i)=>{dummy.position.set(x,y,z);dummy.rotation.set(0,angle,0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.computeBoundingSphere();streets.add(mesh);
 }
 const pave=terrainPaving(data.terrain,heightAt),pavement=[];
 for(const p of plan.routes)for(let i=1;i<p.route.points.length;i++){const a=p.route.points[i-1],b=p.route.points[i];if(p.source==='mapped-sidewalk'&&(excluded(a.x,a.z)||excluded(b.x,b.z)))continue;pave(pavement,[a.x,a.z],[b.x,b.z],p.source==='plaza'?.0038:.0028,{offset:.0017});}
 if(pavement.length){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pavement,3));geo.computeVertexNormals();streets.add(new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#ccd1c7',roughness:1,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2})));}
 const peopleGroup=new THREE.Group();peopleGroup.name='全域分散行人';peopleGroup.userData.atlasLayer='people';scene.add(peopleGroup);
 const people=plan.routes.flatMap((r,routeIndex)=>Array.from({length:r.count},(_,i)=>({r,routeIndex,phase:i/r.count,color:(routeIndex+i)%6,index:i}))),count=people.length;
 const materials={skin:new THREE.MeshStandardMaterial({color:'#d9b399'}),shirt:new THREE.MeshStandardMaterial({color:'#ffffff'}),dark:new THREE.MeshStandardMaterial({color:'#526470'})};
 const mesh=(geo,mat,n,parent)=>{const m=new THREE.InstancedMesh(geo,mat,n);m.receiveShadow=true;m.frustumCulled=false;parent.add(m);return m;};
 const head=mesh(new THREE.SphereGeometry(1,6,4),materials.skin,count,peopleGroup),torso=mesh(new THREE.BoxGeometry(1,1,1),materials.shirt,count,peopleGroup),limbs=Array.from({length:4},()=>mesh(new THREE.BoxGeometry(1,1,1),materials.dark,count,peopleGroup));
 head.userData.atlasLod={detail:new THREE.SphereGeometry(1,12,8),overview:head.geometry,size:.0014};
 const social=people.map((p,i)=>p.r.source==='plaza'?i:-1).filter(i=>i>=0),socialIndex=new Map(social.map((p,i)=>[p,i]));
 const held=mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#4f6268'}),social.length,peopleGroup);
 const color=new THREE.Color(),clothes=['#bb6977','#d1b05b','#709eb2','#87a177','#8d80af','#dedad0'];people.forEach((p,i)=>torso.setColorAt(i,color.set(clothes[p.color])));
 const trafficGroup=new THREE.Group();trafficGroup.name='全域分布车辆';trafficGroup.userData.atlasLayer='traffic';scene.add(trafficGroup);
 const vehicles=plan.cars.flatMap((r,j)=>Array.from({length:r.count},(_,i)=>({r,phase:i/r.count,type:(j+i)%4}))),vehicleCount=vehicles.length;
 const carBody=mesh(new THREE.BoxGeometry(1,1,1),materials.shirt,vehicleCount,trafficGroup),carTop=mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#8cb1bd'}),vehicleCount,trafficGroup),wheels=Array.from({length:4},()=>mesh(new THREE.BoxGeometry(1,1,1),materials.dark,vehicleCount,trafficGroup));
 vehicles.forEach((p,i)=>carBody.setColorAt(i,color.set(['#d0b55d','#dae1dd','#668f9b','#b46c64'][p.type])));
 const dummy=new THREE.Object3D();let seconds=0,lastFar=-1;
 const q={x:0,y:0,z:0,yaw:0};
 const sample=(route,distance)=>{const d=((distance%route.length)+route.length)%route.length;let lo=1,hi=route.points.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(route.cumulative[mid]<d)lo=mid+1;else hi=mid;}const a=route.points[lo-1],b=route.points[lo],t=(d-route.cumulative[lo-1])/(route.cumulative[lo]-route.cumulative[lo-1]||1);q.x=a.x+(b.x-a.x)*t;q.y=a.y+(b.y-a.y)*t;q.z=a.z+(b.z-a.z)*t;q.yaw=Math.atan2(b.x-a.x,b.z-a.z);return q;};
 const put=(m,i,x,y,z,sx,sy,sz,yaw=0,swing=0)=>{dummy.position.set(x,y,z);dummy.rotation.set(swing,yaw,0);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);};
 function update(dt,target){
  seconds+=reducedMotion?0:dt;const far=Math.floor(seconds*2),refreshFar=far!==lastFar;lastFar=far;
  for(const [i,p] of people.entries()){
   const distance=(p.phase+(p.r.source==='plaza'?0:seconds*.0014/p.r.route.length))%1*p.r.route.length;sample(p.r.route,distance);
   if(dt&&!refreshFar&&Math.hypot(q.x-target.x,q.z-target.z)>3)continue;
   const y=q.y+.0018,yaw=q.yaw,cycle=seconds*5+p.routeIndex+p.index,walk=p.r.source!=='plaza',swing=walk?Math.sin(cycle)*.48:0;
   put(head,i,q.x,y+.0079,q.z,.0012,.0014,.0012,yaw);put(torso,i,q.x,y+.0051,q.z,.0028,.0032,.0018,yaw);
   for(let j=0;j<4;j++){const side=j%2?1:-1,offset=j<2?.001:.002,xx=q.x+Math.cos(yaw)*side*offset,zz=q.z-Math.sin(yaw)*side*offset;
    const pose=walk?swing*(j%2?1:-1):(p.r.activity==='photo'||p.r.activity==='read'?-.95:p.r.activity==='market'?Math.sin(cycle*.3)*.9:Math.sin(cycle*.4)*.3);
    put(limbs[j],i,xx,y+(j<2?.0022:.0053),zz,.0007,j<2?.0035:.0028,.0008,yaw,j<2?swing*(j%2?1:-1):pose);
   }
   if(socialIndex.has(i)){const j=socialIndex.get(i),active=['photo','read','tea'].includes(p.r.activity);put(held,j,q.x+Math.sin(yaw)*.002,y+.0058,q.z+Math.cos(yaw)*.002,active?.002:0,.0006,active?.0012:0,yaw);}
  }
  for(const [i,p] of vehicles.entries()){
   sample(p.r.route,(seconds*.008+p.phase*p.r.route.length)%p.r.route.length);if(dt&&!refreshFar&&Math.hypot(q.x-target.x,q.z-target.z)>3)continue;
   const y=q.y+.0014,yaw=q.yaw,length=p.type===1?.010:p.type===2?.008:.0065;
   put(carBody,i,q.x,y+.002,q.z,.0035,.0028,length,yaw);put(carTop,i,q.x,y+.0038,q.z,.003,.0014,length*.55,yaw);
   for(let k=0;k<4;k++){const dx=(k%2?1:-1)*.0018,dz=(k<2?-1:1)*length*.31;put(wheels[k],i,q.x+Math.cos(yaw)*dx+Math.sin(yaw)*dz,y+.0013,q.z-Math.sin(yaw)*dx+Math.cos(yaw)*dz,.00065,.0011,.0012,yaw);}
  }
  for(const m of [head,torso,...limbs,held,carBody,carTop,...wheels])m.instanceMatrix.needsUpdate=true;
 }
 update(0,new THREE.Vector3());
 const positions=mesh=>Array.from({length:mesh.count},(_,i)=>{const m=new THREE.Matrix4();mesh.getMatrixAt(i,m);return [m.elements[12],m.elements[14]];});
 function audit(){
  const motion=positions(torso),traffic=positions(carBody),bins=new Map();let overlaps=0;
  for(const [i,[x,z]] of motion.entries()){const cx=Math.floor(x/.003),cz=Math.floor(z/.003);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const j of bins.get((cx+dx)+','+(cz+dz))||[])if(Math.hypot(x-motion[j][0],z-motion[j][1])<.003)overlaps++;const key=cx+','+cz;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(i);}
  return {infill:plan.infill.map(p=>({x:p.x,z:p.z,zone:p.zone,height:p.height})),routes:plan.routes.map(r=>({region:r.region,source:r.source,points:r.route.points.map(p=>[p.x,p.z])})),cars:plan.cars.map(r=>({points:r.route.points.map(p=>[p.x,p.z])})),venues:plan.venues.map(v=>({x:v.x,z:v.z,region:v.region,food:v.food})),motion,safety:{overlaps,invalidPeople:motion.filter(([x,z])=>!plan.pedestrianSafe(x,z)).length,invalidCars:traffic.filter(([x,z])=>!plan.vehicleSafe(x,z)).length}};
 }
 return {update,freeAt:plan.isSafe,views:plan.views,getState:()=>({infill:plan.infill.length,people:count,cars:vehicleCount,venues:plan.venues.length,buildingInstances,propInstances,cells:new Set(plan.infill.map(p=>Math.floor(p.x)+','+Math.floor(p.z))).size,scenes:plan.scenes.map(s=>({...s,foods:cityThemes[s.index][1],localPeople:plan.views[s.index].localPeople})),note:plan.sourceNote,seconds}),audit};
}
