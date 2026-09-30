import {Vector3} from 'three';

export function measureRoute(points) {
  const cumulative=[0];
  for(let i=1;i<points.length;i++)cumulative.push(cumulative[i-1]+points[i].distanceTo(points[i-1]));
  return {points,cumulative,length:cumulative.at(-1)};
}

export function sampleRoute(route,distance) {
  const d=((distance%route.length)+route.length)%route.length;
  let lo=1,hi=route.points.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(route.cumulative[mid]<d)lo=mid+1;else hi=mid;}
  const a=route.points[lo-1],b=route.points[lo];
  const t=(d-route.cumulative[lo-1])/(route.cumulative[lo]-route.cumulative[lo-1]||1);
  return {point:a.clone().lerp(b,t),direction:b.clone().sub(a).normalize()};
}

// Rounded return lanes keep opposing walkers apart, including at both ends.
export function makeWalkingLoop(path,lane,isSafe) {
  const center=measureRoute(path.map(p=>new Vector3(p.x,0,p.z)));
  if(center.length<lane*8)return null;
  const points=[];
  if(path[0].distanceTo(path.at(-1))<lane*2){
    points.push(...center.points);
  }else{
    const trim=lane*1.8,start=trim,end=center.length-trim;
    const count=Math.max(4,Math.ceil((end-start)/(lane*.7)));
    const frames=Array.from({length:count+1},(_,i)=>sampleRoute(center,start+(end-start)*i/count));
    const normal=d=>new Vector3(-d.z,0,d.x);
    for(const frame of frames)points.push(frame.point.clone().addScaledVector(normal(frame.direction),lane));
    const last=frames.at(-1),first=frames[0];
    for(let i=1;i<=12;i++){
      const angle=Math.PI*i/12;
      points.push(last.point.clone().addScaledVector(normal(last.direction),Math.cos(angle)*lane).addScaledVector(last.direction,Math.sin(angle)*lane));
    }
    for(let i=frames.length-2;i>=0;i--)points.push(frames[i].point.clone().addScaledVector(normal(frames[i].direction),-lane));
    for(let i=1;i<=12;i++){
      const angle=Math.PI*i/12;
      points.push(first.point.clone().addScaledVector(normal(first.direction),-Math.cos(angle)*lane).addScaledVector(first.direction,-Math.sin(angle)*lane));
    }
  }
  points.push(points[0].clone());
  for(let i=1;i<points.length;i++){
    const steps=Math.max(1,Math.ceil(points[i].distanceTo(points[i-1])/(lane*.35)));
    for(let j=0;j<=steps;j++)if(!isSafe(points[i-1].clone().lerp(points[i],j/steps)))return null;
  }
  return measureRoute(points);
}
