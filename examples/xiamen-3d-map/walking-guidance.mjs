import {distanceMeters} from './geo-utils.mjs';

export function projectToSegment(ll,a,b){
 const k=Math.cos(ll[1]*Math.PI/180),dx=(b[0]-a[0])*k,dy=b[1]-a[1];
 const t=Math.max(0,Math.min(1,((ll[0]-a[0])*k*dx+(ll[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
 const point=[a[0]+(b[0]-a[0])*t,a[1]+dy*t];return {point,t,distance:distanceMeters(ll,point)};
}
const bearing=(a,b)=>Math.atan2((b[0]-a[0])*Math.cos(a[1]*Math.PI/180),b[1]-a[1])*180/Math.PI;
export function turnBetween(a,b){
 const angle=(bearing(b.from,b.to)-bearing(a.from,a.to)+540)%360-180;
 if(Math.abs(angle)>150)return '折返';
 if(Math.abs(angle)<28)return '继续直行';
 return angle>0?(angle<60?'向右前方':'右转'):(angle>-60?'向左前方':'左转');
}
export function buildDirections(segments){
 const result=[];let at=0;
 for(let i=0;i<segments.length;i++){
  const s=segments[i],last=result.at(-1),turn=i?turnBetween(segments[i-1],s):'从起点出发';
  const name=s.name||(s.kind==='steps'?'未命名楼梯':'未命名步道');
  if(last&&last.name===name&&last.kind===s.kind&&(turn==='继续直行'||s.kind==='steps')){last.meters+=s.meters;last.points.push(s.to);last.end=at+s.meters;}
  else result.push({name,kind:s.kind,turn,meters:s.meters,start:at,end:at+s.meters,points:[s.from,s.to]});
  at+=s.meters;
 }
 return result;
}
export function routeProgress(plan,position,status='active'){
 if(status!=='active'||!position||position.accuracy>35)return {status:'uncertain'};
 let best=null,total=0;
 for(let i=0;i<(plan?.legs||[]).length;i++){
  const leg=plan.legs[i];if(leg.kind!=='walk')continue;let along=0;
  for(const s of leg.segments||[]){
   const projected=projectToSegment(position.ll,s.from,s.to);
   if(!best||projected.distance<best.distance)best={...projected,leg:i,along:along+s.meters*projected.t,overall:total+along+s.meters*projected.t};
   along+=s.meters;
  }
  total+=leg.meters;
 }
 if(!best)return {status:'unavailable'};
 const leg=plan.legs[best.leg],index=leg.directions.findIndex(s=>best.along<s.end+.1),direction=leg.directions[Math.max(0,index)];
 const off=best.distance>Math.max(25,position.accuracy*1.8);
 return {...best,status:off?'off-route':'on-route',direction:Math.max(0,index),next:direction?Math.max(0,direction.end-best.along):0,remaining:Math.max(0,total-best.overall)};
}
