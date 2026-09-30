import {MathUtils} from 'three';
import {spatialQuery} from './spatial-query.mjs';
import {streetClearance} from './street-clearance.mjs';

export function hillsideFoundation({x,z,size,angle},heightAt){
 const a=-angle,c=Math.cos(a),s=Math.sin(a),half=size*.54,heights=[];
 for(const u of [-half,0,half])for(const v of [-half,0,half])heights.push(heightAt(x+u*c+v*s,z-u*s+v*c));
 if(!heights.every(Number.isFinite))return null;
 const bottom=Math.min(...heights)-.004,top=Math.max(...heights)+.004;
 return {bottom,top,width:half*2,depth:half*2};
}

export function raisedHousingAccess(access,floor){
 const rise=Math.max(0,floor+.009-access[0][1]);
 const result=access.map(([x,y,z],i)=>[x,y+rise*(1-i/(access.length-1))**2,z]);
 for(let i=1;i<result.length;i++){
  const a=result[i-1],b=result[i];
  if(Math.abs(b[1]-a[1])>Math.hypot(b[0]-a[0],b[2]-a[2])*.5+1e-9)return null;
 }
 return result;
}

// Secondary homes use real roadside gaps and a sampled door-to-pavement corridor.
export function planBacklotHousing({plots,roads,heightAt,waterAt,clear}){
 const result=[],cells=new Map(),pathCells=new Map(),cellSize=.25;
 const key=(x,z)=>`${Math.floor(x/cellSize)},${Math.floor(z/cellSize)}`;
 const insert=(map,x,z,value)=>{const k=key(x,z);if(!map.has(k))map.set(k,[]);map.get(k).push(value);};
 const nearby=(map,x,z,r)=>{
  const found=new Set();
  for(let ix=Math.floor((x-r)/cellSize);ix<=Math.floor((x+r)/cellSize);ix++)for(let iz=Math.floor((z-r)/cellSize);iz<=Math.floor((z+r)/cellSize);iz++)for(const p of map.get(`${ix},${iz}`)||[])found.add(p);
  return [...found];
 };
 plots.forEach(p=>insert(cells,p.x,p.z,p));
 const segments=roads.flatMap(line=>line.slice(1).map((b,i)=>[line[i],b])).filter(([a,b])=>Math.hypot(a.x-b.x,a.z-b.z)>.001);
 const roadNear=spatialQuery(segments,([a,b])=>[Math.min(a.x,b.x),Math.max(a.x,b.x),Math.min(a.z,b.z),Math.max(a.z,b.z)],.5);
 const offRoad=streetClearance(roads);
 const dry=(x,z,r,limit=.012)=>{
  const y=heightAt(x,z);
  return Number.isFinite(y)&&y>=0&&clear(x,z,r)&&[-1,0,1].every(dx=>[-1,0,1].every(dz=>{
   const px=x+dx*r,pz=z+dz*r,h=heightAt(px,pz);
   return waterAt(px,pz)===null&&Number.isFinite(h)&&Math.abs(h-y)<limit;
  }));
 };
 const vacant=(x,z,r)=>!nearby(cells,x,z,r+.17).some(p=>Math.hypot(x-p.x,z-p.z)<r+p.size*.84+.012);
 const pathFree=(x,z,r)=>!nearby(pathCells,x,z,r+.024).some(p=>Math.hypot(x-p[0],z-p[2])<r+.024);
 for(const stage of [0,1,2])for(const [index,parent] of plots.entries()){
  if(!parent.frontage)continue;
  if(stage===1&&!['urban','arcade','courtyard','fishing','harbour','river','transport'].includes(parent.profile?.family))continue;
  // Coastal visitor streets may have a second row; untouched bays and mountain forests do not.
  if(stage===2&&(!parent.profile?.visitorHub||!['dune','headland'].includes(parent.profile.family)))continue;
  const a=-(parent.angle||0),fx=Math.sin(a),fz=Math.cos(a),rx=Math.cos(a),rz=-Math.sin(a);
  const size=stage===0?.082+(index%3)*.006:.112+(index%3)*.008,radius=size*.84,depth=(parent.size+size)*.84+.055;
  const sides=index%2?[-1,1]:[1,-1],offsets=stage===0?sides.map(side=>({side,lateral:.145,depth})):sides.flatMap(side=>[{side,lateral:.245,depth},{side,lateral:.22,depth:depth+.075}]);
  for(const candidate of offsets){
   const {side,lateral,depth}=candidate;
   const x=parent.x-fx*depth+rx*lateral*side,z=parent.z-fz*depth+rz*lateral*side;
   if(!dry(x,z,radius,stage===2?.06:.012)||!vacant(x,z,radius)||!pathFree(x,z,radius)||!offRoad(x,z,radius+.036))continue;
   const targets=[];
   for(const [a,b] of roadNear(x,z,stage?.65:.55)){
    const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),ux=dx/length,uz=dz/length;
    const t=((x-a.x)*ux+(z-a.z)*uz)/length;
    const side=Math.sign((x-a.x)*-uz+(z-a.z)*ux)||1;
    for(const offset of [0,-.09,.09]){
     const u=MathUtils.clamp(t+offset/length,0,1),px=a.x+dx*u-uz*.045*side,pz=a.z+dz*u+ux*.045*side;
     const distance=Math.hypot(px-x,pz-z);
     if(distance>.07&&distance<(stage?.50:.4))targets.push({x:px,z:pz,distance});
    }
   }
   targets.sort((a,b)=>a.distance-b.distance);
   let access,angle,foundation;
   for(const target of targets.slice(0,18)){
    const ux=(target.x-x)/target.distance,uz=(target.z-z)/target.distance,start=size*.48;
    const n=Math.ceil((target.distance-start)/.008),line=[];let previous;
    for(let i=0;i<=n;i++){
     const distance=start+(target.distance-start)*i/n,px=x+ux*distance,pz=z+uz*distance,y=heightAt(px,pz);
     if(!dry(px,pz,.010)||!vacant(px,pz,.008)||!offRoad(px,pz,.030)||(previous!==undefined&&Math.abs(y-previous)>.008))break;
     line.push([px,y+.009+.014*i/n,pz]);previous=y;
    }
    if(line.length===n+1){
     angle=-Math.atan2(ux,uz);
     if(stage===2){
      foundation=hillsideFoundation({x,z,size,angle},heightAt);
      if(!foundation)continue;
      access=raisedHousingAccess(line,foundation.top);
      if(!access)continue;
     }else access=line;
     break;
    }
   }
   if(!access)continue;
   const p={x,z,y:foundation?foundation.top:heightAt(x,z),size,originalSize:size,h:.09,color:parent.color,region:parent.region,profile:parent.profile,angle,variant:(index+stage)%4,backlot:true,secondaryLane:stage>0,visitorLane:stage===2,access,...(foundation?{foundation}:{})};
   result.push(p);insert(cells,x,z,p);access.forEach(point=>insert(pathCells,point[0],point[2],point));
   break;
  }
 }
 return result;
}
