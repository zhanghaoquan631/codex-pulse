import * as THREE from 'three';
import {buildAirportLife,buildRailStation} from './transport-life.mjs';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const mats=new Map();
function mat(color){if(!mats.has(color))mats.set(color,new THREE.MeshStandardMaterial({color,roughness:.75}));return mats.get(color);}
function box(parent,c,x,y,z,w,h,d){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(c));mesh.position.set(x,y+h/2,z);parent.add(mesh);return mesh;}
export function planeModel(){
  const g=new THREE.Group(),body=new THREE.Mesh(new THREE.CapsuleGeometry(.070,.62,4,8),mat('#eff3f2'));body.rotation.x=Math.PI/2;g.add(body);
  const wing=(z,w,d)=>{const shape=new THREE.Shape();shape.moveTo(-w,0);shape.lineTo(-.06,d);shape.lineTo(.06,d);shape.lineTo(w,0);shape.lineTo(.06,-.06);shape.lineTo(-.06,-.06);shape.closePath();const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.012,bevelEnabled:false}),mat('#d9e3e5'));mesh.rotation.x=-Math.PI/2;mesh.position.z=z;g.add(mesh);};
  wing(-.03,.48,.15);wing(-.32,.18,.06);
  box(g,'#29798d',0,.04,-.32,.024,.18,.14);box(g,'#426f83',0,.04,.30,.074,.025,.12);
  for(const x of [-.18,.18]){const engine=new THREE.Mesh(new THREE.CylinderGeometry(.033,.033,.14,8),mat('#516d79'));engine.rotation.x=Math.PI/2;engine.position.set(x,-.035,.06);g.add(engine);}
  return g;
}
export function trainModel(color='#268da1'){
  const g=new THREE.Group();box(g,'#ebefeb',0,.035,0,.11,.12,.37);box(g,color,0,.07,0,.114,.026,.376);box(g,'#9bb9c3',0,.155,0,.09,.012,.33);
  for(const side of [-1,1])for(let z=-.13;z<=.14;z+=.065)box(g,'#284957',side*.057,.112,z,.002,.032,.040);
  for(const z of [-.13,.13])box(g,'#37474f',0,0,z,.085,.04,.035);
  return g;
}
export function buildTransport({parent,data,places,heightAt,waterAt,toWorld,mobile=false}){
  const group=new THREE.Group();group.name='aviation-and-rail';parent.add(group);const transportPlaces=[],planes=[],trains=[],stations=[];
  const [ax,az]=toWorld(116.5033,23.5525),airport=new THREE.Group();airport.position.set(ax,heightAt(ax,az)+.03,az);airport.rotation.y=-Math.PI/4;group.add(airport);
  box(airport,'#839784',0,-.018,0,1.75,.015,3.65);box(airport,'#58666c',-.20,0,0,.22,.025,3.2);box(airport,'#a6b3b4',.48,0,.12,.96,.026,1.95);
  for(let z=-1.45;z<1.5;z+=.16)box(airport,'#f6f3de',-.20,.027,z,.018,.002,.070);
  for(const end of [-1,1])for(let x=-3;x<=3;x++)box(airport,'#eff3e9',-.20+x*.025,.027,end*1.33,.011,.002,.15);
  box(airport,'#729ea8',.90,.025,0,.23,.23,1.75);box(airport,'#d9e5e2',.90,.255,0,.32,.035,1.85);
  for(let z=-.70;z<=.71;z+=.35){box(airport,'#d3dedc',.65,.09,z,.29,.055,.060);const jet=planeModel();jet.position.set(.37,.105,z);jet.rotation.y=-Math.PI/2;jet.scale.setScalar(.36);airport.add(jet);}
  box(airport,'#dae1de',.82,.02,-1.22,.12,.35,.12);box(airport,'#365d70',.82,.37,-1.22,.23,.12,.23);box(airport,'#e1e8e1',.82,.49,-1.22,.25,.02,.25);
  const runwayLights=[];for(let z=-1.55;z<=1.56;z+=.13)for(const side of [-1,1])runwayLights.push(-.20+side*.13,.035,z);
  const lightGeo=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(runwayLights,3));airport.add(new THREE.Points(lightGeo,new THREE.PointsMaterial({color:'#f5d878',size:.022})));
  for(let i=0;i<2;i++){const plane=planeModel();plane.scale.setScalar(i?.55:.72);group.add(plane);planes.push({plane,phase:i*.5});}
  const airportLife=buildAirportLife({airport});
  transportPlaces.push({id:'chaoshan-airport',name:'揭阳潮汕国际机场',en:'Jieyang Chaoshan Airport',kind:'transport',ll:[116.5033,23.5525],x:ax,z:az,zoom:38,span:2.9,top:.45,major:true,pin:true,description:'跑道、航站楼、候机旅客、登机步道、出租车接送与机场巴士。艺术化场景，非实测机场布局或实时航班。',source:'https://www.cs-airport.com/'});
  airport.updateWorldMatrix(true,false);
  transportPlaces.at(-1).rotation=airport.rotation.y;
  transportPlaces.at(-1).footprint=[-.90,3.15,-1.90,1.90];
  for(const [id,name,x,z] of [['airport-waiting','机场 · 候机与接送',1.35,.15],['airport-boarding','机场 · 登机步道',.55,0]]){
    const p=airport.localToWorld(V(x,0,z));transportPlaces.push({id,name,en:'Airport Passenger Life',kind:'transport',ll:[data.meta.origin[0]+p.x/data.meta.sx,data.meta.origin[1]-p.z/data.meta.sz],x:p.x,z:p.z,zoom:95,top:.2,major:false,pin:true,description:'可视化旅客候机、拖行李、排队登机与接送。为便于观察采用开放式模型，不是机场实际客流。'});
  }
  const railPaths=data.roads.filter(([kind])=>kind==='rail').map(([,bridge,path])=>{
    const curve=new THREE.CurvePath();for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i];curve.add(new THREE.LineCurve3(V(a[0],Math.max(heightAt(...a),bridge?(waterAt(...a)??0):0)+.042,a[1]),V(b[0],Math.max(heightAt(...b),bridge?(waterAt(...b)??0):0)+.042,b[1])));}
    return {curve,length:curve.getLength()};
  }).filter(r=>r.length>1.4).sort((a,b)=>b.length-a.length);
  const rails=[],sleepers=[];
  for(const r of railPaths){
    for(let distance=0;distance<r.length;distance+=.12){const p=r.curve.getPoint(distance/r.length),q=r.curve.getPoint(Math.min(1,(distance+.12)/r.length)),d=q.clone().sub(p).normalize();
      for(const side of [-1,1])rails.push(p.x+d.z*.035*side,p.y,p.z-d.x*.035*side,q.x+d.z*.035*side,q.y,q.z-d.x*.035*side);
      sleepers.push(p.x+d.z*.052,p.y-.005,p.z-d.x*.052,p.x-d.z*.052,p.y-.005,p.z+d.x*.052);
    }
  }
  for(const [vertices,color] of [[rails,'#465763'],[sleepers,'#899084']])group.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)),new THREE.LineBasicMaterial({color})));
  const selected=railPaths.slice(0,mobile?8:16);
  for(const [i,r] of selected.entries()){
    if(i<3){const station=buildRailStation({parent:group,route:r,index:i,trainModel});stations.push(station);const p=r.curve.getPoint(.5);transportPlaces.push({id:'rail-view-'+i,name:station.title+' '+(i+1),en:'Railway Passenger Scene '+(i+1),kind:'transport',ll:[data.meta.origin[0]+p.x/data.meta.sx,data.meta.origin[1]-p.z/data.meta.sz],x:p.x,z:p.z,zoom:72,span:1.3,top:.25,major:false,pin:true,description:'列车进站停靠后，旅客排队登乘；包含候车和接站人物。场景为演示，不代表真实车站位置、名称或班次。'});}
    else {const coaches=Array.from({length:3},()=>{const train=trainModel(i%2?'#ce9752':'#278d9f');group.add(train);return train;});trains.push({route:r,coaches,phase:i*.17});}
  }
  const city=places.find(p=>p.en==='Shantou')||places.find(p=>p.kind==='district');let metro;
  if(city)outer:for(let radius=1;radius<6;radius+=.5)for(let i=0;i<12;i++){
    const x=city.x+Math.sin(i*Math.PI/6)*radius,z=city.z+Math.cos(i*Math.PI/6)*radius,h=heightAt(x,z);
    if(h>.4||![[-1,-1],[-1,1],[1,-1],[1,1],[0,0]].every(([dx,dz])=>waterAt(x+dx*.95,z+dz*.65)===null&&Math.abs(heightAt(x+dx*.95,z+dz*.65)-h)<.05))continue;
    metro=new THREE.Group();metro.position.set(x,h+.025,z);group.add(metro);
    box(metro,'#cad5d3',0,0,0,1.85,.035,1.2);box(metro,'#415d64',0,.036,0,1.6,.012,.16);
    for(const sz of [-.060,.060])box(metro,'#c4c5b7',0,.05,sz,1.60,.003,.008);
    for(const sx of [-.64,0,.64]){box(metro,'#d9dfd8',sx,.06,-.24,.35,.055,.24);box(metro,'#298b9b',sx,.25,-.24,.40,.024,.31);for(const dx of [-.13,.13])box(metro,'#788e92',sx+dx,.10,-.24,.018,.15,.018);}
    const coaches=Array.from({length:2},()=>{const t=trainModel('#bd784d');t.scale.setScalar(.65);metro.add(t);return t;});metro.userData.coaches=coaches;
    transportPlaces.push({id:'metro-concept',name:'地铁概念演示',en:'Metro / Concept Only',kind:'transport',ll:[data.meta.origin[0]+x/data.meta.sx,data.meta.origin[1]-z/data.meta.sz],x,z,zoom:55,span:1.2,top:.2,major:false,pin:true,description:'独立的地铁站台与列车概念模型。不是已运营地铁，也不代表正式规划线路。'});break outer;
  }
  airport.updateWorldMatrix(true,false);
  const flightPath=new THREE.CatmullRomCurve3([[-.2,.13,-1.5],[-.2,.13,0],[-.2,.20,1.5],[0,1.3,3.5],[3,3,6],[6,3,1],[4,2.8,-4],[0,1,-5]].map(p=>new THREE.Vector3(...p).applyMatrix4(airport.matrixWorld)),true,'centripetal');
  function update(seconds){
    airportLife.update(seconds);for(const station of stations)station.update(seconds);
    for(const {plane,phase} of planes){const t=(seconds/100+phase)%1,p=flightPath.getPointAt(t),d=flightPath.getTangentAt(t);plane.position.copy(p);plane.position.y=Math.max(airport.position.y+.13,plane.position.y);plane.rotation.set(-Math.atan2(d.y,Math.hypot(d.x,d.z)),Math.atan2(d.x,d.z),-.07*Math.sin(t*Math.PI*2));}
    for(const {route,coaches,phase} of trains)coaches.forEach((train,i)=>{const distance=((seconds*.085+phase*route.length-i*.43)%route.length+route.length)%route.length,p=route.curve.getPoint(distance/route.length),d=route.curve.getTangent(distance/route.length);train.position.copy(p);train.rotation.y=Math.atan2(d.x,d.z);});
    if(metro){const t=seconds*.12,dir=Math.cos(t)>0?1:-1;metro.userData.coaches.forEach((train,i)=>{train.position.set(Math.sin(t)*.52+(i-.5)*.25,.06,0);train.rotation.y=dir*Math.PI/2;});}
  }
  update(0);return {group,places:transportPlaces,update,snapshot:()=>({airport:airportLife.snapshot(),stations:stations.map(s=>s.snapshot())}),stats:{airport:1,animatedPlanes:planes.length,railwayTrains:trains.length+stations.length,metroConcept:!!metro,passengers:airportLife.people+stations.reduce((n,s)=>n+s.people,0),airportVehicles:airportLife.vehicles,stations:stations.length}};
}
