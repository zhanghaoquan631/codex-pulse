import * as THREE from './vendor/three.module.js';
import {updateAvatar} from './avatar.js?v=11';
import {createVehicle,VEHICLE_TYPES} from './vehicle-models.js?v=11';
import {applyRole,updateRoleAction,resetRolePose} from './character-props.js?v=11';
import {createVehicleRider} from './vehicle-rider.js?v=11';
import {applyOutfit} from './wardrobe.js?v=11';
const $=id=>document.getElementById(id),dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),clamp=THREE.MathUtils.clamp;
function box(g,w,h,d,x,y,z,color){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.78}));m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;g.add(m);return m;}
export const trafficMethods={
  makeTraffic(){
    this.trafficGraph=new Map();
    const node=p=>{const key=p[0].toFixed(2)+','+p[1].toFixed(2);if(!this.trafficGraph.has(key))this.trafficGraph.set(key,{key,x:p[0],z:p[1],edges:[]});return this.trafficGraph.get(key);};
    for(const road of this.env.roads.filter(r=>r.width>=5&&!r.tags.bridge))for(let i=1;i<road.p.length;i++){const a=node(road.p[i-1]),b=node(road.p[i]),len=dist(a,b);if(len<.2)continue;a.edges.push({a,b,len,width:road.width});b.edges.push({a:b,b:a,len,width:road.width});}
    const start=this.env.buildings.find(b=>b.name==='东1教学楼')||this.env.buildings[0],segments=[];
    for(const r of this.env.roads.filter(r=>r.width>=5&&!r.tags.bridge)){for(let i=1;i<r.p.length;i++){const a=r.p[i-1],b=r.p[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<55)continue;segments.push({a:{x:a[0],z:a[1]},b:{x:b[0],z:b[1]},len,width:r.width,x:(a[0]+b[0])/2,z:(a[1]+b[1])/2,ux:(b[0]-a[0])/len,uz:(b[1]-a[1])/len});}}
    segments.sort((a,b)=>Math.hypot(a.x-start.cx,a.z-start.cz)-Math.hypot(b.x-start.cx,b.z-start.cz));
    for(const s of segments){if(this.crossings.length>=20)break;if(this.crossings.some(c=>dist(c,s)<100))continue;
      const g=new THREE.Group();g.position.set(s.x,0,s.z);g.rotation.y=-Math.atan2(s.uz,s.ux);this.world.add(g);
      for(let i=-2;i<=2;i++)box(g,.65,.025,s.width,i*1.12,.15,0,0xe5e4d6);
      const c={...s,group:g,phase:'pedestrian-red',signals:[],offset:this.crossings.length*1.7};this.crossings.push(c);
      for(const side of [-1,1]){box(g,.12,3,.12,3.5,1.5,side*(s.width/2+1),0x48594f);box(g,.48,.9,.25,3.5,2.9,side*(s.width/2+1),0x2b413b);const red=box(g,.27,.28,.28,3.5,3.09,side*(s.width/2+1),0xdf6860),green=box(g,.27,.28,.28,3.5,2.7,side*(s.width/2+1),0x469973);c.signals.push({red,green});}
      const types=Object.keys(VEHICLE_TYPES);
      for(let k=0;k<4;k++){const side=k%2?1:-1,type=types[(this.crossings.length*4+k)%types.length],model=createVehicle(THREE,type),car=model.group;this.world.add(car);const rig=this.avatar(['blue','female-blue','green','female-orange'][k]);applyOutfit(THREE,rig,'casual',k%2?'cream':'navy');const rider=createVehicleRider(THREE,model,rig);const startNode=this.trafficGraph.get((side>0?c.a.x:c.b.x).toFixed(2)+','+(side>0?c.a.z:c.b.z).toFixed(2));const endPoint=side>0?c.b:c.a;const edge=startNode?.edges.find(e=>dist(e.b,endPoint)<.05);this.vehicles.push({...model,rider,rig,c,t:k<2?.2:.8,dir:side,edge,progress:(k<2?.2:.8)*c.len,speed:Math.min(4.5,VEHICLE_TYPES[type].recommendedSpeed),actualSpeed:0,stopped:false,parked:!edge,turns:0});}

    }
  },
  trafficBlocked(from,to){
    for(const c of this.crossings){if(dist(to,c)>15)continue;const nx=-c.uz,nz=c.ux;const along=(to.x-c.x)*c.ux+(to.z-c.z)*c.uz,across=(to.x-c.x)*nx+(to.z-c.z)*nz,old=(from.x-c.x)*nx+(from.z-c.z)*nz;
      if(Math.abs(along)<3.1&&Math.abs(across)<c.width/2+.15&&Math.abs(old)>=c.width/2+.1&&c.phase!=='pedestrian-green')return true;
    }return false;
  },
  makeStudents(){
    let index=0;
    const style=(rig,i)=>{const role=['student','student','teacher','staff','visitor','runner'][i%6];applyRole(THREE,rig,role);applyOutfit(THREE,rig,role==='teacher'?'formal':role==='runner'?'sport':'casual',['original','cream','navy','orange','blue','green'][i%6]);return rig;};
    for(const c of this.crossings){
      const n={x:-c.uz,z:c.ux};
      for(const sign of [-1,1]){const rig=style(this.avatar(index%8),index++),pos=new THREE.Vector3(c.x+n.x*sign*(c.width/2+1.2),.16,c.z+n.z*sign*(c.width/2+1.2));if([[0,0],[.4,0],[-.4,0],[0,.4],[0,-.4]].some(([dx,dz])=>this.env.blocked(pos.x+dx,pos.z+dz,true))){rig.dispose?.();continue;}this.world.add(this.root(rig));this.npcs.push({rig,pos,c,sign,kind:'crossing',waiting:true,pause:1+index*.2,speed:1.15});}
      for(let k=0;k<2;k++){const rig=style(this.avatar(index%8),index++),offset=c.width/2+1.4,sign=k===0?1:-1,a={x:c.a.x+n.x*offset*sign,z:c.a.z+n.z*offset*sign},b={x:c.b.x+n.x*offset*sign,z:c.b.z+n.z*offset*sign};if(this.env.blocked(a.x,a.z,true)||this.env.blocked(b.x,b.z,true)){rig.dispose?.();continue;}this.world.add(this.root(rig));this.npcs.push({rig,pos:new THREE.Vector3(a.x,.16,a.z),a,b,t:.2+k*.4,dir:1,kind:'sidewalk',speed:1.25,pause:0});}
    }
    const occupied=[];
    for(const road of this.env.roads.filter(r=>r.width<5&&!r.tags.bridge)){
      if(occupied.length>=150)break;
      for(let i=1;i<road.p.length;i++){const a={x:road.p[i-1][0],z:road.p[i-1][1]},b={x:road.p[i][0],z:road.p[i][1]},len=dist(a,b);if(len<12||occupied.some(p=>dist(p,a)<18))continue;let clear=true;for(let k=0;k<=10;k++)if(this.env.blocked(a.x+(b.x-a.x)*k/10,a.z+(b.z-a.z)*k/10,true))clear=false;if(!clear)continue;
       const rig=style(this.avatar(index%8),index++),t=(index%7+1)/9,pos=new THREE.Vector3(a.x+(b.x-a.x)*t,.16,a.z+(b.z-a.z)*t);this.world.add(this.root(rig));this.npcs.push({rig,pos,a,b,t,dir:index%2?1:-1,kind:'sidewalk',speed:rig.roleKey==='runner'?2.8:1.05+(index%4)*.12,pause:0});occupied.push(a);break;
      }
    }
    $('traffic-button').onclick=()=>{const c=this.crossings[0];if(!c)return;if(this.room)this.leaveBuilding();this.position.set(c.x-c.uz*(c.width/2+2),.16,c.z+c.ux*(c.width/2+2));this.yaw=Math.atan2(c.uz,c.ux);this.setMode('third');this.env.toast('行人绿灯过斑马线，红灯在路边等候；车辆按信号停车。');};
  },
  updateTraffic(dt){
    this.trafficNotice='';for(const c of this.crossings){const t=(this.time+c.offset)%20;c.phase=t>=11&&t<17?'pedestrian-green':'pedestrian-red';c.vehicleGreen=t<8;c.vehicleYellow=t>=8&&t<10;
      for(const s of c.signals){s.red.material.emissive.setHex(c.phase==='pedestrian-red'?0xc8483d:0x160806);s.green.material.emissive.setHex(c.phase==='pedestrian-green'?0x39c78b:0x031c0e);}
      if(!this.room&&dist(this.position,c)<20)this.trafficNotice=c.phase==='pedestrian-green'?'行人绿灯 · 请走斑马线':'行人红灯 · 请在路边等候';
    }
    for(const car of this.vehicles){
      car.group.visible=!this.room&&(this.mode==='aerial'||dist(this.position,car.group.position)<300);if(car.rig&&!car.nightDriver)this.root(car.rig).visible=true;
      if(car.nightParked||car.controlled||car.rental||car.parked&&car.placed){car.rider?.update(dt,0,0);continue;}
      const edge=car.edge;if(!edge)continue;const ux=(edge.b.x-edge.a.x)/edge.len,uz=(edge.b.z-edge.a.z)/edge.len;
      const lane=Math.max(.55,Math.min(edge.width*.2,edge.width/2-car.width/2-.5)),old=car.progress,front=car.bounds?.max?.z||car.length/2;
      const center={x:edge.a.x+ux*old-uz*lane,z:edge.a.z+uz*old+ux*lane};
      let allowed=car.parked?0:car.speed,travelLimit=Infinity;
      // Braking uses the current road and visible crosswalk, not a repeating shuttle segment.
      for(const c of this.crossings){const ahead=(c.x-center.x)*ux+(c.z-center.z)*uz,across=Math.abs((c.x-center.x)*(-uz)+(c.z-center.z)*ux);
        if(ahead>front+3&&ahead<front+14&&across<edge.width){const peopleCross=this.npcs.some(n=>n.kind==='crossing'&&n.c===c&&!n.waiting&&dist(n.pos,c)<c.width/2+1);const playerCross=!this.room&&!this.ride&&dist(this.position,c)<c.width/2+1;
          if(!c.vehicleGreen||peopleCross||playerCross)allowed=Math.min(allowed,Math.max(0,(ahead-front-4)*1.4));}}
      const people=[...this.npcs.map(n=>n.pos),...(!this.room&&!this.ride?[this.position]:[])];
      for(const q of people){const ahead=(q.x-center.x)*ux+(q.z-center.z)*uz,across=Math.abs((q.x-center.x)*(-uz)+(q.z-center.z)*ux);if(ahead>0&&ahead<front+5&&across<car.width/2+.55){const gap=Math.max(0,ahead-front-1.8);allowed=Math.min(allowed,gap*1.2);travelLimit=Math.min(travelLimit,gap);}}
      for(const other of this.vehicles){if(other===car||!other.placed)continue;const q=other.group.position,ahead=(q.x-center.x)*ux+(q.z-center.z)*uz,across=Math.abs((q.x-center.x)*(-uz)+(q.z-center.z)*ux),hx=Math.sin(other.group.rotation.y),hz=Math.cos(other.group.rotation.y),along=Math.abs(hx*ux+hz*uz),cross=Math.abs(hx*uz-hz*ux),halfLength=Math.max(Math.abs(other.bounds.min.z),Math.abs(other.bounds.max.z)),reach=halfLength*along+other.width/2*cross,lateral=other.width/2*along+halfLength*cross;
        if(ahead>0&&ahead<front+reach+8&&across<car.width/2+lateral+.25){const gap=Math.max(0,ahead-front-reach-1.3);allowed=Math.min(allowed,gap*1.2);travelLimit=Math.min(travelLimit,gap);}}
      car.actualSpeed=THREE.MathUtils.damp(car.actualSpeed,allowed,allowed<car.actualSpeed?10:2,dt);if(allowed===0&&car.actualSpeed<.02)car.actualSpeed=0;
      car.progress=Math.min(edge.len,old+Math.min(travelLimit,car.actualSpeed*dt));const travelled=car.progress-old;car.stopped=travelled<.0001;
      if(car.progress>=edge.len-.03&&!car.parked){
        const choices=edge.b.edges.filter(e=>e.b!==edge.a&&car.width<e.width*.65).map(e=>({...e,score:(e.b.x-e.a.x)/e.len*ux+(e.b.z-e.a.z)/e.len*uz})).filter(e=>e.score>-.65).sort((a,b)=>b.score-a.score);
        if(choices.length){car.edge=choices[0];car.progress=0;car.turns++;}else{car.parked=true;car.actualSpeed=0;}
      }
      const e=car.edge,dx=(e.b.x-e.a.x)/e.len,dz=(e.b.z-e.a.z)/e.len,offset=Math.max(.55,Math.min(e.width*.2,e.width/2-car.width/2-.5));
      const target=new THREE.Vector3(e.a.x+dx*car.progress-dz*offset,0,e.a.z+dz*car.progress+dx*offset);
      if(!car.placed){car.group.position.copy(target);car.group.rotation.y=Math.atan2(dx,dz);car.placed=true;}else{const delta=target.clone().sub(car.group.position),limit=Math.max(.04,car.speed*dt*1.4);if(delta.length()>limit)delta.setLength(limit);car.group.position.add(delta);const angle=Math.atan2(dx,dz);car.group.rotation.y+=Math.atan2(Math.sin(angle-car.group.rotation.y),Math.cos(angle-car.group.rotation.y))*Math.min(1,dt*3);}
      car.group.visible=!this.room&&(this.mode==='aerial'||dist(this.position,car.group.position)<250);
      for(const wheel of car.wheels)wheel.rotation.x+=travelled/(wheel.userData.radius||car.wheelRadius);
      car.rider.update(dt,car.actualSpeed,travelled);
    }

  },
  updateNPCs(dt){
    for(const n of this.npcs){if(this.nightResidents?.handles(n))continue;let speed=0;const old=n.pos.clone();
      if(n.kind==='crossing'){
        n.pause=Math.max(0,n.pause-dt);if(n.waiting&&n.pause===0&&n.c.phase==='pedestrian-green')n.waiting=false;
        if(!n.waiting){const target={x:n.c.x+n.c.uz*n.sign*(n.c.width/2+1.2),z:n.c.z-n.c.ux*n.sign*(n.c.width/2+1.2)},dx=target.x-n.pos.x,dz=target.z-n.pos.z,l=Math.hypot(dx,dz);if(l<.12){n.sign=-n.sign;n.waiting=true;n.pause=4;}else{n.pos.x+=dx/l*n.speed*dt;n.pos.z+=dz/l*n.speed*dt;}}
      }else{n.pause=Math.max(0,n.pause-dt);if(!n.pause){n.t+=n.dir*n.speed/dist(n.a,n.b)*dt;if(n.t>=1||n.t<=0){n.t=clamp(n.t,0,1);n.dir=-n.dir;n.pause=2.3;}const x=n.a.x+(n.b.x-n.a.x)*n.t,z=n.a.z+(n.b.z-n.a.z)*n.t;if(!this.env.blocked(x,z,true)){n.pos.x=x;n.pos.z=z;}else{n.dir=-n.dir;n.t=clamp(n.t+n.dir*.05,0,1);}}}
      speed=dist(old,n.pos)/dt;const root=this.root(n.rig);root.position.copy(n.pos);if(speed>.05)root.rotation.y=Math.atan2(n.pos.x-old.x,n.pos.z-old.z);root.visible=dist(this.room?this.doorWorld(this.room.feature.entrance,this.position.x,this.position.z-18):this.position,n.pos)<160;
      if(root.visible){resetRolePose(n.rig);updateAvatar(n.rig,dt,speed,n.waiting&&Math.sin(this.time+(n.sign||1))>.98?'wave':'idle');updateRoleAction(n.rig,dt,speed<.1&&n.rig.roleKey==='teacher'?'reading':'idle');}
    }
    this.updateIndoorPeople(dt);

  }
};
