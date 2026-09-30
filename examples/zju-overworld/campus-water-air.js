import * as THREE from './vendor/three.module.js';
import {createBoat,createPlane,createBoatOccupant,makeWaterRoute} from './water-air.js?v=11';
import {makeBerthRoutes} from './berth-routes.js?v=11';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export const waterAirMethods={
  makeWaterAndAir(){
    const waters=this.env.waters.slice().sort((a,b)=>(b.box[2]-b.box[0])*(b.box[3]-b.box[1])-(a.box[2]-a.box[0])*(a.box[3]-a.box[1]));
    for(const water of waters){if(this.docks.length>=8)break;
      const layout=makeBerthRoutes(water,{seed:this.docks.length/2+3,contains:(x,z)=>this.env.contains(water,x,z)&&!this.env.roads.some(r=>r.tags.bridge==='yes'&&this.env.nearLine(x,z,r.p)<(r.width||4)/2+2),isShoreWalkable:(x,z)=>!this.env.blocked(x,z,true)});if(!layout)continue;
      for(const berth of layout.berths){const kind=berth.type,boat=createBoat(THREE,kind),dock={...berth,name:(water.name||'校园湖泊')+(kind==='ferry'?'游湖船码头':'小船码头'),water,boat};this.docks.push(dock);this.makeDockModel(dock);
        Object.assign(boat,{boat:true,serviceType:kind,displayName:kind==='ferry'?'校园游湖船':'自驾小船',id:'boat-'+this.boats.length,water,waterRoute:berth.route,dock,actualSpeed:0,parked:kind==='rowboat',meters:0,dwell:kind==='ferry'?8:0});
        const p=boat.waterRoute.sample(0);boat.group.position.set(p.x,0,p.z);boat.group.rotation.y=p.yaw;this.world.add(boat.group);
        if(kind==='ferry'){boat.rig=this.avatar('blue');boat.rider=createBoatOccupant(THREE,boat,boat.rig,{driver:true,seatIndex:0});}this.boats.push(boat);
      }
    }
    this.planes=[createPlane(THREE),createPlane(THREE)];for(const plane of this.planes){plane.group.visible=false;this.world.add(plane.group);}this.planePasses=0;
  },
  makeDockModel(dock){
    const g=new THREE.Group(),len=dist(dock.shore,dock.end),heading=Math.atan2(dock.end.x-dock.shore.x,dock.end.z-dock.shore.z);g.position.set(dock.shore.x,0,dock.shore.z);g.rotation.y=heading;
    const material=new THREE.MeshStandardMaterial({color:0x97846a,roughness:.85}),metal=new THREE.MeshStandardMaterial({color:0x546f68,roughness:.65});
    const box=(w,h,d,x,y,z,mat)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.receiveShadow=true;g.add(m);return m;};
    box(2.4,.18,len,0,.14,len/2,material);for(let i=0;i<len;i+=1.2){box(2.38,.012,.045,0,.235,i,metal);for(const x of [-1.1,1.1])box(.1,1.15,.1,x,.6,i,metal);}for(const x of [-1.1,1.1])box(.065,.065,Math.max(0,len-1.8),x,1.13,(len-1.8)/2,metal);
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#285f65';ctx.fillRect(0,0,512,128);ctx.fillStyle='#fff2c9';ctx.font='40px Microsoft YaHei';ctx.textAlign='center';ctx.fillText('校园码头 · 乘船',256,80);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const sign=box(2.6,.65,.08,0,2.05,-.3,new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));for(const x of [-1.1,1.1])box(.09,1.8,.09,x,.9,-.3,metal);
    this.world.add(g);dock.group=g;
  },
  onDock(x,z){return (this.docks||[]).some(d=>{const dx=d.end.x-d.shore.x,dz=d.end.z-d.shore.z,l2=dx*dx+dz*dz,t=Math.max(0,Math.min(1,((x-d.shore.x)*dx+(z-d.shore.z)*dz)/l2));return Math.hypot(x-d.shore.x-t*dx,z-d.shore.z-t*dz)<d.width/2+.12;});},
  boatTripPath(car,dock){
    const route=car.waterRoute,path=[{x:car.group.position.x,z:car.group.position.z,y:.12}],samples=route.points.map(p=>({x:p[0],z:p[1],y:.12}));
    let start=0;for(let i=0;i<samples.length-1;i++)if(dist(car.group.position,samples[i])<dist(car.group.position,samples[start]))start=i;
    for(let k=1;k<samples.length;k++)path.push(samples[(start+k)%(samples.length-1)]);
    // Finish alongside the boarding pier, preserving a full round trip from it.
    if(start>0)for(let k=1;k<=samples.length-1-start;k++)path.push(samples[(start+k)%(samples.length-1)]);return path;
  },
  updateWaterAndAir(dt){
    for(const boat of this.boats||[]){boat.group.visible=!this.room&&dist(this.position,boat.group.position)<450;
      if(boat.controlled)continue;if(boat.parked||!boat.rider){boat.actualSpeed=0;boat.update(dt,0,this.time);continue;}
      if(boat.serviceType==='ferry'){
        boat.dwell=Math.max(0,boat.dwell-dt);const close=!this.room&&dist(this.position,boat.dock.end)<10&&boat.meters<.5;
        if(close)boat.dwell=Math.max(boat.dwell,3);
        boat.actualSpeed=boat.dwell?0:this.vehicleTrafficSpeed(boat,2);const last=boat.meters,next=(boat.meters+boat.actualSpeed*dt)%boat.waterRoute.length,candidate=boat.waterRoute.sample(next);if(this.vehicleRoadClear(boat,candidate.x,candidate.z,candidate.yaw))boat.meters=next;else boat.actualSpeed=0;if(boat.meters<last)boat.dwell=8;
        const p=boat.waterRoute.sample(boat.meters);boat.group.position.set(p.x,0,p.z);boat.group.rotation.y=p.yaw;boat.update(dt,boat.actualSpeed,this.time);
      }else boat.update(dt,0,this.time);
    }
    const b=this.env.bounds;
    for(const [i,plane] of (this.planes||[]).entries()){
      const phase=(this.time-i*47-18)%160,active=phase>=0&&phase<58;plane.group.visible=active&&!this.room;
      if(active){const t=phase/58,x=THREE.MathUtils.lerp(b[0]-650,b[2]+650,i%2?1-t:t),z=THREE.MathUtils.lerp(b[1]-100,b[3]+100,t),y=170+i*45;plane.group.position.set(x,y,z);plane.group.rotation.y=Math.atan2((i%2?-1:1)*(b[2]-b[0]+1300),b[3]-b[1]+200);plane.update(dt,this.time);if(!plane.wasActive)this.planePasses++;}plane.wasActive=active;
    }
  }
};
