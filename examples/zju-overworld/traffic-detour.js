import {createRoadNetwork} from './road-network.js?v=11';

/** Build a rare, temporary detour around a verified stationary vehicle queue.
 * No movement, fare change or collision bypass. Requires planRoadTrip's optional
 * third argument {network}, supplied by connected-traffic-helper.js.
 */
export function planAroundTraffic(life,car) {
  const origin=car.group.position,previous=car.route,destination=previous?.requestedDestination;
  if(!destination||car.boat)return {planned:null,reason:'no-road-destination'};
  const blockedAreas=life.vehicles.filter(v=>v!==car&&!v.boat&&Math.abs(v.actualSpeed||0)<.12&&
    (v.parked||(v.route?.wait||0)>15)).map(v=>({id:v.id,x:v.group.position.x,z:v.group.position.z,
      distance:Math.hypot(v.group.position.x-origin.x,v.group.position.z-origin.z),length:v.length,width:v.width}))
    .filter(q=>q.distance>2.2&&q.distance<35).sort((a,b)=>a.distance-b.distance).slice(0,6)
    .map(q=>({...q,radius:Math.max(1.2,Math.min(q.length/2+car.width/2+1.2,q.distance-1.25))}));
  if(!blockedAreas.length)return {planned:null,reason:'no-stationary-vehicle-queue'};
  let addedVertices=0;
  const roads=life.env.roads.map(road=>{
    const p=[];
    for(let i=1;i<road.p.length;i++){
      const a=road.p[i-1],b=road.p[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),cuts=[0,1];
      if(length<.001)continue;
      for(const c of blockedAreas){
        const t=((c.x-a[0])*dx+(c.z-a[1])*dz)/(length*length),px=a[0]+dx*t,pz=a[1]+dz*t,
          perpendicular2=(px-c.x)**2+(pz-c.z)**2;
        if(perpendicular2>=c.radius*c.radius)continue;
        const half=Math.sqrt(c.radius*c.radius-perpendicular2)/length;
        for(const edge of [t-half,t+half])for(const offset of [-.65/length,.65/length]){
          const cut=edge+offset;if(cut>0&&cut<1)cuts.push(cut);
        }
      }
      cuts.sort((a,b)=>a-b);
      for(const t of cuts) {
        const q=[a[0]+dx*t,a[1]+dz*t],last=p.at(-1);
        if(!last||Math.hypot(last[0]-q[0],last[1]-q[1])>.01)p.push(q);
      }
      addedVertices+=cuts.length-2;
    }
    return {...road,p};
  });
  const occupied=(x,z)=>blockedAreas.some(c=>(x-c.x)**2+(z-c.z)**2<c.radius*c.radius);
  const start=performance.now(),temporary=createRoadNetwork(roads,{bounds:life.env.bounds,containsBlocked:(x,z,ctx)=>
    occupied(x,z)||life.env.buildings.some(f=>life.env.contains(f,x,z))||(!ctx?.bridge&&life.env.waters.some(f=>life.env.contains(f,x,z)))});
  const planned=life.planRoadTrip(car,destination,{network:temporary}),buildMs=performance.now()-start,
    mode=['bicycle','e-bike'].includes(car.type)?'cycle':'car',nearest=life.roadNetwork.nearest(origin,mode);
  if(!planned||planned.startDistance>(nearest?.width||5.5)/2+1)return {planned:null,reason:'start-cannot-connect-safely',buildMs,blockedAreas,addedVertices};
  if(planned.reachedDistance>Math.max(5,(previous.reachedDistance||0)+3))return {planned:null,reason:'destination-disconnected',buildMs,blockedAreas,addedVertices};
  if(planned.length>Math.max(12000,(previous.remaining||previous.length||0)*6))return {planned:null,reason:'detour-too-long',buildMs,blockedAreas,addedVertices};
  return {planned,reason:'detour-found',buildMs,blockedAreas,addedVertices};
}
