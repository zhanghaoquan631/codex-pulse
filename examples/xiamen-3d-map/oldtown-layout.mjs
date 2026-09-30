import {createSpatialIndex,distanceToSegment} from './world-layout.mjs';

export const oldTownBounds=[118.0682,24.4526,118.0816,24.4634];
export const oldTownCenter=[118.0736517906189,24.45645224252944];
export function clipSegmentToBounds(a,b,[minX,minZ,maxX,maxZ]){
  let start=0,end=1;
  for(const [p,q] of [[a[0]-b[0],a[0]-minX],[b[0]-a[0],maxX-a[0]],[a[1]-b[1],a[1]-minZ],[b[1]-a[1],maxZ-a[1]]]){
    if(Math.abs(p)<1e-12){if(q<0)return null;continue;}
    const t=q/p;if(p<0)start=Math.max(start,t);else end=Math.min(end,t);if(start>end)return null;
  }
  return [start,end];
}
export function oldTownWorldBounds(meta){
  const [west,south,east,north]=oldTownBounds;
  return [(west-meta.origin[0])*meta.sx,(meta.origin[1]-north)*meta.sz,(east-meta.origin[0])*meta.sx,(meta.origin[1]-south)*meta.sz];
}
export function oldTownCoverage(meta){
  const [west,south,east,north]=oldTownBounds;
  return (x,z)=>{const lon=x/meta.sx+meta.origin[0],lat=meta.origin[1]-z/meta.sz;return lon>=west&&lon<=east&&lat>=south&&lat<=north;};
}
export const streetWidth=path=>path.kind==='pedestrian'?.020:path.kind==='secondary'?.020:path.kind==='tertiary'?.012:['footway','path','steps'].includes(path.kind)?.004:.007;
export function footprintCorners({x,z,w,d,angle},pad=0){
  const c=Math.cos(angle),s=Math.sin(angle);
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>[x+u*(w/2+pad)*c+v*(d/2+pad)*s,z-u*(w/2+pad)*s+v*(d/2+pad)*c]);
}
export function footprintsOverlap(a,b,pad=0){
  const ac=footprintCorners(a,pad),bc=footprintCorners(b);
  for(const angle of [a.angle,b.angle])for(const axis of [[Math.cos(angle),-Math.sin(angle)],[Math.sin(angle),Math.cos(angle)]]){
    const ap=ac.map(p=>p[0]*axis[0]+p[1]*axis[1]),bp=bc.map(p=>p[0]*axis[0]+p[1]*axis[1]);
    if(Math.max(...ap)<=Math.min(...bp)||Math.max(...bp)<=Math.min(...ap))return false;
  }
  return true;
}
export function createStreetLayout(paths,{land,heightAt,existingAt=()=>false}){
  const streetIndex=createSpatialIndex(.05),buildingIndex=createSpatialIndex(.05),footprints=[];
  for(const path of paths)for(let i=1;i<path.points.length;i++){
    const a=path.points[i-1],b=path.points[i],width=streetWidth(path),edge={a,b,width,path};
    streetIndex.insert(edge,Math.min(a[0],b[0])-.05,Math.min(a[1],b[1])-.05,Math.max(a[0],b[0])+.05,Math.max(a[1],b[1])+.05);
  }
  function roadNear(x,z,pad=0){return streetIndex.at(x,z).some(s=>distanceToSegment(x,z,s.a,s.b)<s.width/2+pad);}
  function buildingAt(x,z,pad=0){return buildingIndex.at(x,z).some(b=>{
    const dx=x-b.x,dz=z-b.z,c=Math.cos(b.angle),s=Math.sin(b.angle);
    return Math.abs(dx*c-dz*s)<b.w/2+pad&&Math.abs(dx*s+dz*c)<b.d/2+pad;
  });}
  function footprintFits(b){
    const corners=footprintCorners(b),points=[[b.x,b.z],...corners];
    for(let i=0;i<4;i++)points.push([(corners[i][0]+corners[(i+1)%4][0])/2,(corners[i][1]+corners[(i+1)%4][1])/2]);
    if(points.some(([x,z])=>!land(x,z)||roadNear(x,z,.002)||existingAt(x,z,.003)))return false;
    if(points.some(([x,z])=>Math.abs(heightAt(x,z)-heightAt(b.x,b.z))>.018))return false;
    // Test the entire oriented envelope, including narrow roads crossing between samples.
    const reach=Math.hypot(b.w,b.d)/2+.004,near=new Set();
    for(const [x,z] of points)for(const item of buildingIndex.at(x,z))near.add(item);
    if([...near].some(other=>footprintsOverlap(b,other,.001)))return false;
    for(const edge of streetIndex.at(b.x,b.z)){
      const angle=-Math.atan2(edge.b[1]-edge.a[1],edge.b[0]-edge.a[0]),length=Math.hypot(edge.b[0]-edge.a[0],edge.b[1]-edge.a[1]);
      if(distanceToSegment(b.x,b.z,edge.a,edge.b)>reach+edge.width)continue;
      if(footprintsOverlap(b,{x:(edge.a[0]+edge.b[0])/2,z:(edge.a[1]+edge.b[1])/2,w:length,d:edge.width+.004,angle}))return false;
    }
    return true;
  }
  function reserve(b){const r=Math.hypot(b.w,b.d)/2+.006;footprints.push(b);buildingIndex.insert(b,b.x-r,b.z-r,b.x+r,b.z+r);}
  return {roadNear,buildingAt,footprintFits,reserve,footprints};
}
