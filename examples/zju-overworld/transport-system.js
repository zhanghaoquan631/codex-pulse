import * as THREE from './vendor/three.module.js';
import {createRoadNetwork} from './road-network.js?v=11';
import {createTransportVehicle,createPassenger} from './transport-models.js?v=11';
import {createVehicleRider} from './vehicle-rider.js?v=11';
import {createBoat,createPlane,createBoatOccupant,makeWaterRoute} from './water-air.js?v=11';
import {installConnectedTraffic} from './connected-traffic.js?v=11';
import {rectanglesOverlap} from './berth-routes.js?v=11';
const $=id=>document.getElementById(id),dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),clamp=THREE.MathUtils.clamp;
const SERVICES={taxi:'出租车',shuttle:'校园巴士','shared-bike':'共享单车','shared-ebike':'共享电动车',sedan:'汽车',bicycle:'自行车','e-bike':'电动车',van:'后勤车',cart:'校园服务车',ferry:'游湖船',rowboat:'小船'};
const profile=car=>['bicycle','e-bike'].includes(car.type)?'cycle':'car';
const moving=car=>Math.abs(car.actualSpeed||0)>.15;
function readCredits(){try{const n=Number(localStorage.getItem('campus-simulated-credits'));return localStorage.getItem('campus-simulated-credits')!==null&&Number.isFinite(n)&&n>=0?n:200;}catch{return 200;}}
function placeOnPath(path,meters){let left=meters;for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],d=dist(a,b);if(left<=d||i===path.length-1){const t=clamp(left/(d||1),0,1);return {x:THREE.MathUtils.lerp(a.x,b.x,t),z:THREE.MathUtils.lerp(a.z,b.z,t),y:THREE.MathUtils.lerp(a.y??.16,b.y??.16,t),heading:Math.atan2(b.x-a.x,b.z-a.z)};}left-=d;}return {...path[0],heading:0};}
function lengthOf(path){return path.slice(1).reduce((n,p,i)=>n+dist(path[i],p),0);}
export const transportMethods={
  makeTransport(){
    this.credits=readCredits();this.transportReceipt=null;this.ride=null;this.pickup=null;this.rideQuote=null;this.rideCounter=0;this.boats=[];this.docks=[];
    this.roadNetwork=createRoadNetwork(this.env.roads,{bounds:this.env.bounds,containsBlocked:(x,z,ctx)=>this.env.buildings.some(f=>this.env.contains(f,x,z))||(!ctx?.bridge&&this.env.waters.some(f=>this.env.contains(f,x,z)))});
    let sequence=0;for(const v of this.vehicles){v.id='vehicle-'+sequence++;v.serviceType=v.type;v.displayName=SERVICES[v.type];v.traffic=true;}
    const edges=[...this.trafficGraph.values()].flatMap(n=>n.edges).filter(e=>e.len>45&&e.a.key<e.b.key);
    const add=(type,e,t,parked=false)=>{const car=createTransportVehicle(THREE,type);car.id='vehicle-'+sequence++;car.edge=e;car.progress=e.len*t;car.speed=['bicycle','e-bike'].includes(car.type)?4.6:6;car.actualSpeed=0;car.parked=parked;car.traffic=!parked;car.turns=0;car.stopped=true;car.placed=false;
      const dx=(e.b.x-e.a.x)/e.len,dz=(e.b.z-e.a.z)/e.len,lane=parked?Math.max(.5,e.width/2-.45):Math.max(.55,Math.min(e.width*.2,e.width/2-car.width/2-.5));car.group.position.set(e.a.x+dx*car.progress-dz*lane,.16,e.a.z+dz*car.progress+dx*lane);car.group.rotation.y=Math.atan2(dx,dz);this.world.add(car.group);
      if(!parked){car.rig=this.avatar(sequence%8);car.rider=createVehicleRider(THREE,car,car.rig);}else car.rental=true;
      this.vehicles.push(car);return car;};
    for(let i=0;i<18&&edges.length;i++)add('taxi',edges[Math.floor(i*edges.length/18)],.2+(i%3)*.24);
    // Rental bikes and cars stand still at racks throughout both campus halves.
    const homes=this.env.buildings.filter(f=>f.entrance&&f.name).filter((f,i)=>i%4===0).slice(0,45);
    for(const [i,f] of homes.entries()){
      const home={x:f.cx,z:f.cz},nearest=edges.slice().sort((a,b)=>dist(home,{x:(a.a.x+a.b.x)/2,z:(a.a.z+a.b.z)/2})-dist(home,{x:(b.a.x+b.b.x)/2,z:(b.a.z+b.b.z)/2}));
      let placed=false;for(const edge of nearest.slice(0,12)){if(placed)break;for(const t of [.12,.3,.48,.66,.84]){const dx=(edge.b.x-edge.a.x)/edge.len,dz=(edge.b.z-edge.a.z)/edge.len,lane=Math.max(.5,edge.width/2-.45),point={x:edge.a.x+dx*edge.len*t-dz*lane,z:edge.a.z+dz*edge.len*t+dx*lane};if(this.env.blocked(point.x,point.z,true)||this.vehicles.some(v=>dist(v.group.position,point)<6))continue;const car=add(i%7===0?'sedan':i%2?'shared-ebike':'shared-bike',edge,t,true);car.homeName=f.name;placed=true;break;}}
    }
    this.makeWaterAndAir();this.bindTransport();installConnectedTraffic(this,{activeRadius:220,maxUpdates:24});
  },
  bindTransport(){
    $('transport-button').onclick=()=>this.openTransport();$('transport-close').onclick=()=>{$('transport-panel').hidden=true;};
    $('hail-taxi').onclick=()=>this.hailTaxi();$('find-bike').onclick=()=>this.findTransport('shared-bike');$('find-ebike').onclick=()=>this.findTransport('shared-ebike');$('find-car').onclick=()=>this.findTransport('sedan');$('find-boat').onclick=()=>this.findTransport('boat');
    $('board-vehicle').onclick=()=>this.boardVehicle();$('drive-vehicle').onclick=()=>this.boardVehicle(true);$('leave-vehicle').onclick=()=>this.leaveVehicle();$('vehicle-cruise').onclick=()=>{if(this.ride?.mode==='manual')this.ride.cruise=!this.ride.cruise;};
    $('ride-map').onclick=()=>{$('transport-panel').hidden=true;this.env.toast('点击右下角地图选择乘车目的地。');};$('ride-destination').onchange=()=>this.quoteSelectedDestination();$('boat-tour').onclick=()=>this.quoteRide(this.ride?.car.group.position||this.position,'游湖一圈');$('ride-pay').onclick=()=>this.payAndGo();$('ride-cancel').onclick=()=>this.cancelRideRoute();$('topup-credits').onclick=()=>{this.credits+=100;this.saveCredits();this.env.toast('已补充 100 元模拟余额。');};
    const select=$('ride-destination');for(const f of this.env.buildings.filter(f=>f.name&&f.entrance).sort((a,b)=>a.name.localeCompare(b.name,'zh'))){const o=document.createElement('option');o.value=f.id;o.textContent=f.name;select.append(o);}
    this.updateTransportUI();
  },
  openTransport(){$('campus-life-menu').hidden=true;$('campus-life-toggle').setAttribute('aria-expanded','false');if(this.room&&!this.ride){this.env.toast('先走出建筑，再到路边乘车。');}$('transport-panel').hidden=false;this.updateTransportUI();},
  findTransport(kind){
    if(this.ride)return false;if(this.room)this.leaveBuilding();
    if(kind==='boat'){const dock=this.docks.slice().sort((a,b)=>dist(this.position,a.shore)-dist(this.position,b.shore))[0];if(!dock)return false;this.transportTarget=dock.boat;this.startNavigation(dock.shore);$('transport-panel').hidden=false;this.env.toast('正在步行前往码头，沿栈桥走到船边按 E 上船。');return true;}
    const car=this.vehicles.filter(v=>v.rental&&(v.serviceType===kind||kind==='sedan'&&v.type==='sedan')).sort((a,b)=>dist(this.position,a.group.position)-dist(this.position,b.group.position))[0];if(!car||car.nightDriver)return false;
    this.transportTarget=car;this.startNavigation({x:car.group.position.x,z:car.group.position.z});$('transport-panel').hidden=false;this.env.toast(`正在前往${car.displayName}停放处。到车边按 E 骑行或驾驶。`);return true;
  },
  hailTaxi(){
    if(this.ride)return false;if(this.pickup||this.waitingTaxi)this.cancelRideRoute();if(this.room)this.leaveBuilding();this.cancelNavigation();
    const cars=this.vehicles.filter(v=>v.serviceType==='taxi'&&!v.controlled&&v.rider).map(car=>({car,planned:this.planRoadTrip(car,this.position)})).filter(q=>q.planned&&q.planned.reachedDistance<=45).sort((a,b)=>a.planned.length-b.planned.length);
    for(const {car,planned} of cars){
      car.controlled=true;car.parked=false;car.route=planned;car.route.index=1;car.route.purpose='pickup';this.pickup=car;this.transportTarget=car;this.pickupPoint=planned.destination;
      $('transport-panel').hidden=false;this.env.toast('出租车已接单，正在开往你附近的路边上车点。');return true;}
    this.env.toast('附近暂时没有可到达的出租车，请到连通的校园道路旁再招车。');return false;
  },
  planRoadTrip(car,destination){
    const raw=this.roadNetwork.route(car.group.position,destination,{mode:profile(car)});if(!raw?.path?.length||raw.status==='unreachable')return null;
    const path=raw.path.map((p,i,all)=>{const a=all[Math.max(0,i-1)],b=all[Math.min(all.length-1,i+1)],len=dist(a,b)||1,offset=Math.max(.38,Math.min((p.width||5.5)*.2,(p.width||5.5)/2-car.width/2-.5));return {x:p.x-(b.z-a.z)/len*offset,z:p.z+(b.x-a.x)/len*offset,y:p.y??.16,width:p.width};});
    if(dist(car.group.position,path[0])>.05)path.unshift({x:car.group.position.x,z:car.group.position.z,y:car.group.position.y});
    return {...raw,path,index:1,length:lengthOf(path),remaining:lengthOf(path),destination:path.at(-1),requestedDestination:{x:destination.x,z:destination.z},wait:0};
  },
  nearestVehicle(){
    if(this.room||this.ride)return null;return [...this.vehicles,...this.boats].filter(v=>!v.nightDriver&&v.group.visible&&Math.abs(this.position.y-v.group.position.y)<2.5&&dist(this.position,v.group.position)<Math.max(3.4,v.length*.65)).sort((a,b)=>dist(this.position,a.group.position)-dist(this.position,b.group.position))[0]||null;
  },
  boardVehicle(manual=false){
    if(this.buildMode)this.toggleBuilding(false);
    if(this.ride)return false;const car=this.nearVehicle||this.nearestVehicle();if(!car||car.nightDriver)return false;
    this.releaseTaxiReservations(car);
    if(moving(car)){car.hailed=true;car.hailExpires=this.time+30;car.parked=true;car.controlled=true;car.route=null;car.actualSpeed=0;this.env.toast('车辆已停车，请再按 E 上车。');return false;}
    if(this.seated)this.stand();if(this.climbing)return false;
    const own=manual||car.rental||car.serviceType==='rowboat'||!car.boat&&!car.rider||['bicycle','e-bike'].includes(car.type);
    if(own&&car.rider){car.rider.dispose();car.rider=null;const rig=car.rig;car.rig=null;if(rig){const p=this.safeDisembark(car);this.world.add(this.root(rig));this.root(rig).position.copy(p);const heading=car.group.rotation.y;const a={x:p.x,z:p.z},b={x:p.x+Math.cos(heading)*9,z:p.z-Math.sin(heading)*9};this.npcs.push({rig,pos:p.clone(),a,b,t:0,dir:1,kind:'sidewalk',speed:1.1,pause:5,name:'同学'});}}
    this.cancelNavigation();this.autoRun=false;this.activity=null;this.keys.clear();this.resetMotion();this.stopLecture();car.controlled=true;car.parked=true;car.actualSpeed=0;car.route=null;if(this.pickup===car)this.pickup=null;if(this.waitingTaxi===car)this.waitingTaxi=null;car.hailed=false;
    const controller=car.boat?createBoatOccupant(THREE,car,this.player,{driver:own,seatIndex:own?0:1}):own?createVehicleRider(THREE,car,this.player):createPassenger(THREE,car,this.player,{seatIndex:car.type==='shuttle'?0:1});
    document.body.classList.add('riding');this.transportTarget=null;this.ride={car,mode:own?'manual':'passenger',controller,cruise:false,paid:!car.rental,boardingFee:car.rental?car.type==='sedan'?5:1:0,trip:null};
    this.setMode('third');this.yaw=Math.atan2(Math.sin(car.group.rotation.y),-Math.cos(car.group.rotation.y));this.pitch=.3;this.syncVehiclePlayer(0);this.transportReceipt=null;$('transport-panel').hidden=false;$('ride-destination').value='';
    this.rideQuote=car.rental?{kind:'unlock',fare:this.ride.boardingFee,label:car.displayName+' · 解锁使用'}:null;this.updateTransportUI();this.env.toast(own?(car.rental?'已上车，支付模拟解锁费用后可骑行或驾驶。':'已坐到驾驶位，W 前进、S 刹车，A/D 转向。'):'已上车，选择目的地并支付模拟车费即可出发。');return true;
  },
  safeDisembark(car){
    if(car.boat&&car.dock)return new THREE.Vector3(car.dock.end.x,.22,car.dock.end.z);
    const angle=car.group.rotation.y;for(const sign of [1,-1])for(const extra of [1,1.8,2.8,4]){const x=car.group.position.x+Math.cos(angle)*(car.width/2+extra)*sign,z=car.group.position.z-Math.sin(angle)*(car.width/2+extra)*sign;if(!this.env.blocked(x,z,true))return new THREE.Vector3(x,.16,z);}
    return new THREE.Vector3(car.group.position.x,.16,car.group.position.z-car.length/2-1.5);
  },
  leaveVehicle(force=false){
    if(!this.ride)return false;const {car,controller}=this.ride;if(!force&&moving(car)){car.actualSpeed=0;this.ride.cruise=false;this.env.toast('已刹车，停稳后再按 E 下车。');return false;}
    if(car.boat&&!force&&!this.docks.some(d=>d.water===car.water&&dist(car.group.position,d.end)<6)){this.env.toast('请先把船开回码头，再下船。');return false;}
    const p=car.boat?this.docks.filter(d=>d.water===car.water).sort((a,b)=>dist(car.group.position,a.end)-dist(car.group.position,b.end))[0]?.end:null;
    const destination=p?new THREE.Vector3(p.x,.22,p.z):this.safeDisembark(car);controller.dispose();document.body.classList.remove('riding');this.ride=null;this.rideQuote=null;car.controlled=false;car.parked=true;car.placed=true;car.route=null;car.actualSpeed=0;this.world.add(this.root(this.player));this.root(this.player).visible=true;this.position.copy(destination);this.lastPosition.copy(destination);this.resetMotion();this.setMode('third');this.portalCooldown=1.5;this.updateTransportUI();this.env.toast('已下车，可以继续逛校园。');return true;
  },
  quoteSelectedDestination(){
    if(!this.ride)return false;const f=this.env.buildings.find(f=>f.id===$('ride-destination').value);if(!f)return false;return this.quoteRide({x:f.entrance?.x??f.cx,z:f.entrance?.z??f.cz},f.name);
  },
  quoteRide(point,label='地图目的地'){
    if(!this.ride)return false;$('transport-panel').hidden=false;const {car}=this.ride;
    if(car.boat){const dock=car.dock;if(!dock)return false;const path=this.boatTripPath(car,dock);this.rideQuote={fare:3,kind:'trip',label:dock.name,planned:{path,length:lengthOf(path),destination:dock.end},dock};this.updateTransportUI();return true;}
    const planned=this.planRoadTrip(car,point);if(!planned||point.x<this.env.bounds[0]||point.x>this.env.bounds[2]||point.z<this.env.bounds[1]||point.z>this.env.bounds[3]){this.env.toast('这里没有连通的车辆道路，请选附近的道路或校园地点。');return false;}
    const fare=(this.ride.paid?0:this.ride.boardingFee)+(car.serviceType==='taxi'?Math.ceil(6+planned.length/1000*2):car.type==='shuttle'?2:this.ride.mode==='manual'?0:3);
    this.rideQuote={kind:'trip',planned,label,fare};this.updateTransportUI();return true;
  },
  payAndGo(){
    const q=this.rideQuote,r=this.ride;if(!q||!r)return false;if(this.credits<q.fare){this.env.toast('模拟余额不足，可免费补充模拟余额。');return false;}
    this.credits=Math.round((this.credits-q.fare)*100)/100;this.saveCredits();this.transportReceipt={id:++this.rideCounter,label:q.label,amount:q.fare};r.paid=true;
    if(q.kind==='unlock'){this.rideQuote=null;this.env.toast('模拟费用已支付，可以开始驾驶。');this.updateTransportUI();return true;}
    r.trip={...q.planned,label:q.label,index:1,travelled:0,purpose:'passenger',dock:q.dock};r.car.route=r.trip;r.car.parked=false;r.cruise=false;this.rideQuote=null;this.env.toast('已支付模拟车费，正在前往 '+q.label+'。');this.updateTransportUI();return true;
  },
  saveCredits(){try{localStorage.setItem('campus-simulated-credits',String(this.credits));}catch{}},
  releaseTaxiReservations(except=null){for(const key of ['pickup','waitingTaxi']){const car=this[key];if(!car||car===except)continue;car.route=null;car.controlled=false;car.parked=!car.rider;car.hailed=false;car.actualSpeed=0;if(this.transportTarget===car)this.transportTarget=null;this[key]=null;}if(!this.pickup&&!this.waitingTaxi)this.pickupPoint=null;},
  cancelRideRoute(){this.releaseTaxiReservations(this.ride?.car);if(this.ride){this.ride.car.route=null;this.ride.car.actualSpeed=0;this.ride.car.parked=true;this.ride.trip=null;this.ride.cruise=false;}this.rideQuote=null;this.updateTransportUI();},
  vehicleRoadClear(car,x,z,heading){
    if(car.boat){if(this.boats.some(other=>other!==car&&rectanglesOverlap({x,z},heading,car.serviceType,other.group.position,other.group.rotation.y,other.serviceType,.1)))return false;const c=Math.cos(heading),s=Math.sin(heading);return [[0,0],[-car.width/2,car.length/2],[car.width/2,car.length/2],[-car.width/2,-car.length/2],[car.width/2,-car.length/2]].every(([a,b])=>{const px=x+a*c+b*s,pz=z-a*s+b*c;return car.waterRoute?.contains(px,pz)??this.env.contains(car.water,px,pz);});}
    const c=Math.cos(heading),s=Math.sin(heading),half=Math.min(car.length/2,2.8);
    for(const [sx,sz] of [[0,0],[-car.width*.42,half],[car.width*.42,half],[-car.width*.42,-half],[car.width*.42,-half]]){const px=x+sx*c+sz*s,pz=z-sx*s+sz*c;
      if(this.env.buildings.some(f=>this.env.contains(f,px,pz))||this.waterAt(px,pz))return false;}
    const b=this.env.bounds;if(x<b[0]||x>b[2]||z<b[1]||z>b[3])return false;
    if(profile(car)==='car'){const near=this.roadNetwork.nearest({x,z},'car');if(!near||near.distance>near.width/2-.15)return false;}
    return true;
  },
  vehicleTrafficSpeed(car,wanted){
    if(car.boat){const p=car.group.position,h=car.group.rotation.y,ux=Math.sin(h),uz=Math.cos(h);let allowed=wanted;for(const other of this.boats){if(other===car)continue;const dx=other.group.position.x-p.x,dz=other.group.position.z-p.z,ahead=dx*ux+dz*uz,across=Math.abs(dx*uz-dz*ux);if(ahead>0&&across<(car.width+other.width)/2+.35)allowed=Math.min(allowed,Math.max(0,(ahead-(car.length+other.length)/2-.6)*1.2));}return allowed;}const p=car.group.position,h=car.group.rotation.y,ux=Math.sin(h),uz=Math.cos(h),front=car.bounds.max.z;
    let allowed=wanted;for(const c of this.crossings){const ahead=(c.x-p.x)*ux+(c.z-p.z)*uz,across=Math.abs((c.x-p.x)*(-uz)+(c.z-p.z)*ux);if(ahead>0&&ahead<front+13&&across<c.width/2+1&&!c.vehicleGreen)allowed=Math.min(allowed,Math.max(0,(ahead-front-4)*1.2));}
    for(const n of this.npcs){const ahead=(n.pos.x-p.x)*ux+(n.pos.z-p.z)*uz,across=Math.abs((n.pos.x-p.x)*(-uz)+(n.pos.z-p.z)*ux);if(ahead>0&&ahead<front+5&&across<car.width/2+.5)allowed=Math.min(allowed,Math.max(0,(ahead-front-1.3)*1.4));}
    for(const other of this.vehicles){if(other===car)continue;const q=other.group.position,ahead=(q.x-p.x)*ux+(q.z-p.z)*uz,across=Math.abs((q.x-p.x)*(-uz)+(q.z-p.z)*ux);if(ahead>0&&ahead<front+other.length/2+7&&across<(car.width+other.width)/2+.2)allowed=Math.min(allowed,Math.max(0,(ahead-front-other.length/2-1.3)*1.3));}
    return allowed;
  },
  moveControlledVehicle(car,dt,desired,heading){
    if(!this.vehicleRoadClear(car,car.group.position.x,car.group.position.z,heading))heading=car.group.rotation.y;const old=car.group.position.clone(),rate=desired<Math.abs(car.actualSpeed||0)?9:2.5;car.actualSpeed=THREE.MathUtils.damp(car.actualSpeed||0,desired,rate,dt);
    if(Math.abs(car.actualSpeed)<.015)car.actualSpeed=0;const travel=car.actualSpeed*dt,steps=Math.max(1,Math.ceil(Math.abs(travel)/.12));
    for(let i=0;i<steps;i++){const x=car.group.position.x+Math.sin(heading)*travel/steps,z=car.group.position.z+Math.cos(heading)*travel/steps;if(!this.vehicleRoadClear(car,x,z,heading)){car.actualSpeed=0;break;}car.group.position.x=x;car.group.position.z=z;}
    car.group.rotation.y=heading;const near=!car.boat&&this.roadNetwork.nearest(car.group.position,profile(car));if(near)car.group.position.y=near.y??.16;
    const moved=dist(old,car.group.position);for(const wheel of car.wheels||[])wheel.rotation.x+=moved/(wheel.userData.radius||car.wheelRadius||.3);car.rider?.update(dt,car.actualSpeed,moved);car.update?.(dt,car.actualSpeed,this.time);return moved;
  },
  followVehicleRoute(car,dt){
    const route=car.route;if(!route)return;
    while(route.index<route.path.length&&dist(car.group.position,route.path[route.index])<(route.purpose==='pickup'&&route.index===route.path.length-1?3.5:.5))route.index++;
    if(route.index>=route.path.length){car.route=null;car.actualSpeed=0;car.parked=true;if(route.purpose==='pickup'){car.hailed=true;car.hailExpires=this.time+40;this.waitingTaxi=car;this.pickupPoint=car.group.position.clone();this.pickup=null;this.env.toast('出租车已到路边，请走近后按 E 上车。');}else if(this.ride?.car===car){this.ride.trip=null;if(route.dock)car.dock=route.dock;this.transportReceipt={...this.transportReceipt,arrived:true};this.env.toast('已到达 '+route.label+'，按 E 下车。');}return;}
    const p=route.path[route.index],dx=p.x-car.group.position.x,dz=p.z-car.group.position.z,d=Math.hypot(dx,dz),wanted=Math.atan2(dx,dz),angle=Math.atan2(Math.sin(wanted-car.group.rotation.y),Math.cos(wanted-car.group.rotation.y));
    const heading=car.group.rotation.y+clamp(angle,-dt*2.8,dt*2.8),max=car.boat?2.4:profile(car)==='cycle'?5.5:9;
    let speed=Math.min(max,d/dt);if(Math.abs(angle)>.6)speed=0;else speed=Math.min(speed,Math.max(.3,d*2.5));speed=this.vehicleTrafficSpeed(car,speed);
    const moved=this.moveControlledVehicle(car,dt,speed,heading);route.travelled=(route.travelled||0)+moved;route.remaining=d+lengthOf(route.path.slice(route.index));route.wait=moved<.005?(route.wait||0)+dt:0;
  },
  syncVehiclePlayer(dt){
    if(!this.ride)return;const r=this.ride;r.controller.update(dt,r.car.actualSpeed||0,(r.car.actualSpeed||0)*dt);r.car.group.updateWorldMatrix(true,true);this.root(this.player).getWorldPosition(this.position);this.heading=r.car.group.rotation.y;this.speed=Math.abs(r.car.actualSpeed||0);this.grounded=true;this.swimming=false;this.wasSwimming=false;this.velocityY=0;this.root(this.player).visible=this.mode!=='walk';
  },
  updateTransport(dt){
    this.updateWaterAndAir(dt);for(const v of [...this.vehicles,...this.boats]){if(v.hailed&&v!==this.ride?.car&&v!==this.pickup&&this.time>(v.hailExpires||Infinity)&&dist(this.position,v.group.position)>10){v.hailed=false;v.controlled=false;v.parked=!v.rider;if(this.waitingTaxi===v)this.waitingTaxi=null;}}
    if(this.pickup?.route)this.followVehicleRoute(this.pickup,dt);
    if(this.ride){const r=this.ride,car=r.car;
      if(car.route)this.followVehicleRoute(car,dt);else if(r.mode==='manual'&&r.paid){const forward=this.keys.has('KeyW')||this.keys.has('ArrowUp')||r.cruise,brake=this.keys.has('KeyS')||this.keys.has('ArrowDown')||this.keys.has('Space'),steer=(this.keys.has('KeyA')||this.keys.has('ArrowLeft')?1:0)-(this.keys.has('KeyD')||this.keys.has('ArrowRight')?1:0);const heading=car.group.rotation.y+steer*dt*1.5;const max=car.boat?2.8:profile(car)==='cycle'?7:11;let wanted=brake?0:forward?max:0;wanted=this.vehicleTrafficSpeed(car,wanted);this.moveControlledVehicle(car,dt,wanted,heading);}
      this.syncVehiclePlayer(dt);
    }
    this.nearVehicle=this.nearestVehicle();if(this.frame%6===0)this.updateTransportUI();return !!this.ride;
  },
  updateTransportCamera(dt){
    if(!this.ride)return false;const car=this.ride.car;
    const eye=this.position.clone().add(new THREE.Vector3(0,1.25,0));
    if(this.mode==='walk'){this.camera.position.copy(eye);this.camera.lookAt(eye.x+Math.sin(this.yaw)*Math.cos(this.pitch),eye.y+Math.sin(this.pitch),eye.z-Math.cos(this.yaw)*Math.cos(this.pitch));return true;}
    const distance=Math.max(6.5,car.length*1.8),pitch=clamp(this.pitch,.2,1),wanted=new THREE.Vector3(car.group.position.x-Math.sin(this.yaw)*distance*Math.cos(pitch),car.group.position.y+1.6+Math.sin(pitch)*distance,car.group.position.z+Math.cos(this.yaw)*distance*Math.cos(pitch));
    this.camera.position.lerp(wanted,1-Math.exp(-dt*7));this.camera.lookAt(car.group.position.x,car.group.position.y+1.1,car.group.position.z);return true;
  },
  updateTransportUI(){
    if(!$('transport-panel'))return;const r=this.ride,n=this.nearVehicle,q=this.rideQuote;
    if(r){$('navigation-status').textContent=r.trip?'正在乘车前往 '+r.trip.label:r.car.boat?'游湖后返回码头下船':'点击地图选择乘车目的地';$('minimap').setAttribute('aria-label',r.car.boat?'校园地图与码头':'点击地图选择乘车目的地');}else if(!this.navigation&&!this.navigationWorker){$('navigation-status').textContent='点击地图自动步行 · R 切换跑步';$('minimap').setAttribute('aria-label','点击地图自动步行，按R切换跑步');}$('transport-balance').textContent=`模拟余额 ¥${this.credits.toFixed(0)}`;
    $('transport-summary').textContent=r?`${r.car.displayName||SERVICES[r.car.serviceType]||'船'} · ${r.mode==='manual'?'驾驶位':'乘客位'} · ${Math.round((r.car.actualSpeed||0)*3.6)} km/h`:this.pickup?`出租车正在接你 · 约 ${Math.round(this.pickup.route?.remaining||0)} 米`:this.waitingTaxi?`出租车已到路边 · 距离 ${Math.round(dist(this.position,this.waitingTaxi.group.position))} 米`:n?`附近：${n.displayName||SERVICES[n.serviceType]||'船'}`:'在路边招车，或前往共享车辆停放处。';
    $('transport-discovery').hidden=!!r;$('ride-controls').hidden=!r;$('vehicle-nearby').hidden=!!r||!n;$('board-vehicle').textContent=moving(n||{})?'招停车辆 · E':n?.rental?'解锁骑行 / 驾驶 · E':'上车 · E';$('drive-vehicle').hidden=!n||!!n.rental;
    $('vehicle-cruise').hidden=!r||r.mode!=='manual';$('vehicle-cruise').textContent=r?.cruise?'关闭定速 · H':'定速前进 · H';$('ride-map').hidden=!!r?.car.boat;$('ride-destination').hidden=!!r?.car.boat;$('boat-tour').hidden=!r?.car.boat;
    $('ride-help').textContent=r?.mode==='manual'?'W 前进 · S / 空格刹车 · A/D 转向 · H 定速 · E 下车':'选择地点或点击地图，查看模拟车费后出发。';
    $('ride-quote').textContent=q?`${q.label} · ${q.planned?Math.round(q.planned.length)+' 米 · ':''}模拟车费 ¥${q.fare}${q.planned?.reachedDistance>8?' · 路边下车后步行约 '+Math.round(q.planned.reachedDistance)+' 米':''}`:r?.trip?`前往 ${r.trip.label} · 剩余 ${Math.round(r.trip.remaining||r.trip.length)} 米${r.trip.wait>2?' · 等候通行':''}`:this.transportReceipt?.arrived?'已到达，停稳后按 E 下车':this.transportReceipt?`已支付模拟费用 ¥${this.transportReceipt.amount}`:'';
    $('ride-pay').hidden=!q;$('ride-pay').textContent=q?.kind==='unlock'?`支付 ¥${q.fare} 并解锁`:`支付 ¥${q?.fare??0} 并出发`;$('ride-cancel').hidden=!r?.trip&&!this.pickup&&!this.waitingTaxi;
    if(r)$('interact-button').textContent='E · 停车 / 下车';else if(n){$('interact-button').disabled=false;$('interact-button').textContent=moving(n)?`E · 招停${n.displayName||SERVICES[n.type]}`:`E · 使用${n.displayName||SERVICES[n.type]||'船'}`;}
    if(this.transportTarget&&!r&&dist(this.position,this.transportTarget.group.position)<8){$('transport-panel').hidden=false;this.transportTarget=null;}
  },
  drawTransport(ctx,px,pz){
    ctx.save();for(const car of [...this.vehicles,...this.boats]){const p=car.group.position;ctx.fillStyle=car===this.ride?.car?'#e0a229':car.serviceType==='taxi'?'#c98718':car.boat?'#337ca0':'#537c6b';ctx.fillRect(px(p.x)-1.6,pz(p.z)-1.6,3.2,3.2);}
    if(this.transportTarget){const p=this.transportTarget.group.position;ctx.strokeStyle='#c37a17';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(px(p.x),pz(p.z),7,0,Math.PI*2);ctx.stroke();}const route=this.ride?.car.route||this.pickup?.route||this.rideQuote?.planned;if(route?.path){ctx.strokeStyle='#c68a23';ctx.lineWidth=3;ctx.beginPath();route.path.forEach((p,i)=>i?ctx.lineTo(px(p.x),pz(p.z)):ctx.moveTo(px(p.x),pz(p.z)));ctx.stroke();}ctx.restore();
  },
  getTransportState(){return {credits:this.credits,ride:this.ride?{vehicleId:this.ride.car.id,type:this.ride.car.serviceType,mode:this.ride.mode,paid:this.ride.paid,speed:this.ride.car.actualSpeed,trip:this.ride.trip?{label:this.ride.trip.label,remaining:this.ride.trip.remaining,travelled:this.ride.trip.travelled}:null}:null,quote:this.rideQuote?{fare:this.rideQuote.fare,label:this.rideQuote.label,kind:this.rideQuote.kind}:null,pickup:this.pickup?{id:this.pickup.id,remaining:this.pickup.route?.remaining}:null,nearVehicle:this.nearVehicle?{id:this.nearVehicle.id,type:this.nearVehicle.serviceType,distance:dist(this.position,this.nearVehicle.group.position)}:null,receipt:this.transportReceipt,boatCount:this.boats?.length||0,dockCount:this.docks?.length||0,planeVisible:this.planes?.filter(p=>p.group.visible).length||0,transportTypes:[...new Set([...(this.vehicles||[]).map(v=>v.serviceType),...(this.boats||[]).map(v=>v.serviceType)])]};}
};
