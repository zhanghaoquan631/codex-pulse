export const laneOffset=.020;
export const sidewalkOffset=.065;
export const followingGap=.035;

export function signalGreen(seconds,axis=0){
  const phase=((seconds%24)+24)%24;
  return axis===0?phase<9:phase>=12&&phase<21;
}

export function roadJunctions(routes){
  const cells=new Map(),cross=(x,z,u,v)=>x*v-z*u;
  for(const route of routes){let distance=0;route.junctions=[];
    for(const edge of route.curve.curves){
      const a=edge.v1,b=edge.v2,length=edge.getLength(),dx=b.x-a.x,dz=b.z-a.z;
      const seen=new Set();
      for(let x=Math.floor(Math.min(a.x,b.x)/.5);x<=Math.floor(Math.max(a.x,b.x)/.5);x++)for(let z=Math.floor(Math.min(a.z,b.z)/.5);z<=Math.floor(Math.max(a.z,b.z)/.5);z++){
        const key=x+','+z,others=cells.get(key)||[];
        for(const other of others){if(other.route===route||seen.has(other))continue;seen.add(other);
          const ux=other.b.x-other.a.x,uz=other.b.z-other.a.z,den=cross(dx,dz,ux,uz);if(Math.abs(den)<1e-8)continue;
          const qx=other.a.x-a.x,qz=other.a.z-a.z,t=cross(qx,qz,ux,uz)/den,u=cross(qx,qz,dx,dz)/den;
          if(t<0||t>1||u<0||u>1||Math.abs((a.y+(b.y-a.y)*t)-(other.a.y+(other.b.y-other.a.y)*u))>.035)continue;
          const ownDistance=distance+t*length,otherDistance=other.distance+u*other.length;
          const ownAxis=Math.abs(dx)>Math.abs(dz)?0:1,otherAxis=1-ownAxis;
          if(!route.junctions.some(j=>Math.abs(j.distance-ownDistance)<.08))route.junctions.push({distance:ownDistance,axis:ownAxis});
          if(!other.route.junctions.some(j=>Math.abs(j.distance-otherDistance)<.08))other.route.junctions.push({distance:otherDistance,axis:otherAxis});
        }
        if(!cells.has(key))cells.set(key,[]);cells.get(key).push({a,b,route,distance,length});
      }
      distance+=length;
    }
  }
}

// Distances are kilometres, advanced with bounded steps after background suspension.
export function advanceLane(cars,length,dt,seconds,stops=[],maxStep=.05){
  dt=Math.max(0,Math.min(maxStep,dt));
  const ordered=[...cars].sort((a,b)=>a.distance-b.distance);
  const moves=ordered.map((car,i)=>{
    const leader=ordered[(i+1)%ordered.length];
    const gap=ordered.length>1?(leader.distance-car.distance+length)%length-(car.size+leader.size)/2-followingGap:Infinity;
    let room=Math.max(0,gap);
    for(const stop of stops){
      const ahead=stop.distance-car.distance-car.size/2;
      if(!signalGreen(seconds,stop.axis)&&ahead>=-.00001)room=Math.min(room,Math.max(0,ahead));
    }
    const desired=Math.min(car.cruise,Math.sqrt(2*.08*room));
    car.speed=Math.min(desired,car.speed+.04*dt);
    return Math.min(room,car.speed*dt);
  });
  ordered.forEach((car,i)=>{car.distance=(car.distance+moves[i])%length;});
}
