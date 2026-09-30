import * as THREE from 'three';
import {box,disc,sign,tree,person,vehicle,polyline,follow} from './scene-miniatures.mjs';
import {buildAirportSurroundings,buildStationSurroundings} from './transport-surroundings.mjs';

export function journeyPhase(seconds,offset=0){
  const t=((seconds+offset)%48+48)%48;
  if(t<12)return {state:'wait',progress:0};
  if(t<30)return {state:'walk',progress:(t-12)/18};
  if(t<40)return {state:'aboard',progress:1};
  return {state:'return',progress:1-(t-40)/8};
}

export function buildAirportLife({airport}){
  buildAirportSurroundings(airport);
  const group=new THREE.Group();group.name='airport-passenger-life';airport.add(group);const people=[],cars=[];
  // Open-sided viewing hall keeps the passenger activities visible from the atlas camera.
  box(group,'#b8c9c4',1.48,.014,0,1.13,.018,2.25);
  box(group,'#d7e4df',1.30,.04,0,.51,.03,1.64);
  box(group,'#a3c4cb',1.055,.07,0,.025,.23,1.65);
  for(let z=-.8;z<=.81;z+=.2){box(group,'#e8eeea',1.05,.07,z,.04,.26,.024);box(group,'#dce6e3',1.30,.30,z,.55,.025,.026);}
  box(group,'#e7eee9',1.30,.33,-.81,.58,.032,.05);
  sign(group,'揭阳潮汕国际机场',1.3,.40,.83,.56,.065);
  sign(group,'出发 DEPARTURES',1.30,.21,.73,.37,.045);
  sign(group,'候机 · WAITING',1.27,.22,-.26,.29,.038);
  sign(group,'到达 · 接机',1.34,.20,-.68,.29,.038,'#887543');
  for(const z of [-.50,-.38,.03,.15])for(const x of [1.17,1.32,1.47]){
    box(group,'#537e8c',x,.075,z,.074,.026,.055);box(group,'#537e8c',x,.10,z-.029,.074,.07,.008);
    for(const dx of [-.028,.028])box(group,'#9faead',x+dx,.07,z,.007,.025,.04);
  }
  for(let i=0;i<14;i++){const p=person(group,i,{scale:.019,luggage:i%3===0});p.root.position.set(1.17+i%3*.15,.077,[-.50,-.38,.03,.15][Math.floor(i/3)%4]);people.push({actor:p,state:'sit'});}
  for(let i=0;i<4;i++){box(group,'#548b95',1.17+i*.095,.07,.56,.074,.06,.06);const staff=person(group,i+3,{scale:.021});staff.root.position.set(1.17+i*.095,.07,.52);people.push({actor:staff,state:'wave'});}
  // Check-in queue and gate walkway stay on passenger paving, away from the apron road.
  for(const x of [1.13,1.46])for(let z=.26;z<.55;z+=.08){box(group,'#697a7e',x,.07,z,.008,.045,.008);box(group,'#a83e50',x,.108,z+.03,.004,.004,.065);}
  for(let i=0;i<12;i++){const p=person(group,i,{scale:.022,luggage:true}),start=[1.20+(i%3)*.09,.075,.43-Math.floor(i/3)*.065],path=polyline([start,[1.55,.075,.17],[1.55,.075,-.22],[1.45,.075,-.57]]);people.push({actor:p,path,offset:i*2});}
  for(const z of [-.7,0,.7]){
    box(group,'#b8c8c8',.56,.032,z,.25,.014,.13);sign(group,'登机 GATE',.62,.18,z+.064,.17,.03);
    for(let i=0;i<6;i++){const p=person(group,i+2,{scale:.018,luggage:true});people.push({actor:p,path:polyline([[.69,.047,z+.04+i*.009],[.58,.047,z+.04],[.48,.080,z],[.39,.108,z]]),offset:i*1.7+z*9,boarding:true});}
  }
  // A one-way landside loop separates drop-off, pickup, buses and pedestrian waiting.
  box(group,'#465c65',1.87,.032,0,.22,.012,2.45);box(group,'#75898d',2.07,.022,0,.13,.012,2.45);
  for(let z=-1.15;z<1.2;z+=.16)box(group,'#ecebd6',1.89,.047,z,.012,.002,.07);
  for(let j=-4;j<=4;j++)box(group,'#eeeedd',1.76+j*.025,.048,.79,.014,.002,.10);
  sign(group,'即停即走 · DROP OFF',1.82,.21,.65,.37,.04);
  sign(group,'出租车 / TAXI',1.85,.21,-.43,.27,.04,'#967b39');
  sign(group,'机场巴士',2.09,.22,-.84,.24,.04);
  for(const z of [-.9,-.6,-.3,0,.3,.6,.9]){tree(group,2.18,.035,z,.13);box(group,'#d1ded4',1.65,.036,z,.05,.022,.05);}
  for(let i=0;i<6;i++){const scale=i===3?.022:.026,car=vehicle(group,['taxi','sedan','van','bus','suv','taxi'][i],scale);cars.push({car,scale,lane:i<3?1.87:2.07,phase:i%3*32});}
  for(let i=0;i<8;i++){const p=person(group,i+1,{scale:.023,luggage:true}),z=-.7+i*.18;p.root.position.set(1.68,.055,z);people.push({actor:p,state:i%3?'wave':'wait'});}
  for(let i=0;i<6;i++){const p=person(group,i,{scale:.022,luggage:true}),z=i%2?.65:-.4;people.push({actor:p,path:polyline([[1.75,.055,z],[1.58,.055,z],[1.52,.075,z-.12]]),offset:i*6});}
  const updates=seconds=>{
    for(const p of people){if(!p.path){p.actor.pose(seconds,p.state);continue;}const phase=journeyPhase(seconds,p.offset);follow(p.actor.root,p.path,phase.progress);p.actor.root.visible=phase.state!=='aboard';p.actor.pose(seconds,phase.state==='walk'||phase.state==='return'?'walk':'wait');}
    for(const {car,scale,phase,lane} of cars){const t=(seconds+phase)%96;const z=t<30?1.10-t/30*1.55:t<46?-.45:-.45-(t-46)/50*.70;car.position.set(lane,.05,z);car.rotation.y=Math.PI;car.userData.state=t>=30&&t<46?'pickup':'drive';car.scale.setScalar(scale*Math.min(1,(96-t)*2,t*2));}
  };
  group.traverse(o=>{if(o.userData.sign)o.rotation.y=Math.PI/2;});
  updates(0);return {group,update:updates,people:people.length,vehicles:cars.length,snapshot:()=>people.map(p=>({state:p.actor.root.userData.state,position:p.actor.root.position.toArray(),visible:p.actor.root.visible}))};
}

export function buildRailStation({parent,route,index,trainModel}){
  const group=new THREE.Group();group.name='rail-passenger-station-'+index;const center=route.curve.getPoint(.5),d=route.curve.getTangent(.5);group.position.copy(center);group.rotation.y=Math.atan2(d.x,d.z);parent.add(group);
  buildStationSurroundings(group,index);
  const title=index===0?'高铁候车与登乘':'铁路候车与接站';
  box(group,'#a8b9bb',.20,0,0,.30,.025,1.80);box(group,'#d9dbcc',.055,.026,0,.015,.002,1.75);
  for(let z=-.8;z<.81;z+=.20){box(group,'#ecedda',.065,.028,z,.013,.002,.095);box(group,'#6a858d',.30,.025,z,.014,.21,.014);}
  for(const z of [-.70,.70])box(group,index===0?'#4694a5':'#ac7553',.26,.19,z,.24,.02,.34);
  box(group,'#647e82',.32,.19,0,.018,.018,1.75);
  box(group,'#cfd9d6',.52,.012,0,.27,.018,1.75);
  sign(group,title+'（演示）',.43,.30,.82,.62,.055);
  sign(group,'候车 / WAITING',.42,.16,.54,.29,.035);
  for(let z=-.6;z<=.61;z+=.3){box(group,'#4e7888',.47,.03,z,.075,.027,.16);box(group,'#537382',.51,.055,z,.012,.048,.16);}
  const people=[];
  for(let i=0;i<18;i++){const actor=person(group,i,{scale:.021,luggage:true}),z=-.62+i%6*.24;const path=polyline([[.45,.03,z],[.25,.03,z],[.09,.03,z],[.0,.07,z]]);people.push({actor,path,offset:Math.floor(i/6)*2});}
  for(let i=0;i<6;i++){const actor=person(group,i+3,{scale:.022,luggage:i%2===0});actor.root.position.set(.55,.032,-.6+i*.24);people.push({actor,state:i%2?'wave':'sit'});}
  for(let i=0;i<6;i++){const actor=person(group,i+2,{scale:.023,luggage:true});actor.root.position.set(.22,.03,-.73+i*.28);people.push({actor,state:i%3?'wait':'wave'});}
  // Dedicated stopping consist shares the source railway alignment at this viewpoint.
  const coaches=Array.from({length:3},()=>{const t=trainModel(index===0?'#328d9a':'#486c49');group.add(t);return t;});
  function update(seconds){
    const t=seconds%60,offset=t<12?-(1-t/12)*2:t<42?0:(t-42)/18*2;
    coaches.forEach((c,i)=>{c.position.set(0,.015,(i-1)*.43+offset);c.visible=t<55;c.userData.state=t<12?'arrive':t<42?'dwell':'depart';});
    for(const p of people){if(!p.path){p.actor.pose(seconds,p.state);continue;}const depart=THREE.MathUtils.clamp((t-17-p.offset)/12,0,1);follow(p.actor.root,p.path,depart);p.actor.root.visible=t<38;p.actor.pose(seconds,depart>0&&depart<1?'walk':'wait');}
  }
  group.traverse(o=>{if(o.userData.sign)o.rotation.y=Math.PI/2;});
  update(0);return {group,update,title,people:people.length,snapshot:()=>({train:coaches[0].position.toArray(),state:coaches[0].userData.state,people:people.filter(p=>p.actor.root.visible).length})};
}
