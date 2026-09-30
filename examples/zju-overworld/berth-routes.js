import {makeWaterRoute} from './water-air.js?v=11';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const point=v=>Array.isArray(v)?{x:+v[0],z:+v[1]}:{x:+v.x,z:+(v.z??v.y)};
function nearestEdge(p,ring){let nearest=null,min=Infinity;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],dx=b.x-a.x,dz=b.z-a.z,den=dx*dx+dz*dz,t=den?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/den)):0,q={x:a.x+dx*t,z:a.z+dz*t},d=distance(p,q);if(d<min){min=d;nearest=q;}}return{point:nearest,distance:min};}

/** Signed distance from a point to the actual rectangular pier. */
export function distanceToPier(x,z,dock){
 const dx=dock.end.x-dock.shore.x,dz=dock.end.z-dock.shore.z,len=Math.hypot(dx,dz);
 if(len<1e-6)return Math.hypot(x-dock.shore.x,z-dock.shore.z);
 const px=x-dock.shore.x,pz=z-dock.shore.z,along=(px*dx+pz*dz)/len,across=(px*dz-pz*dx)/len;
 const outsideX=Math.max(0,Math.abs(across)-dock.width/2),outsideZ=Math.max(0,-along,along-len);
 return Math.hypot(outsideX,outsideZ);
}

function polylineRoute(points,base,berth){
 const cumulative=[0];for(let i=1;i<points.length;i++)cumulative.push(cumulative.at(-1)+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
 const length=cumulative.at(-1);
 const sample=(meters=0)=>{
  const d=((Number.isFinite(meters)?meters:0)%length+length)%length;let lo=1,hi=cumulative.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(cumulative[mid]<d)lo=mid+1;else hi=mid;}
  const a=points[lo-1],b=points[lo],t=(d-cumulative[lo-1])/(cumulative[lo]-cumulative[lo-1]||1);
  return{x:a[0]+(b[0]-a[0])*t,z:a[1]+(b[1]-a[1])*t,yaw:Math.atan2(b[0]-a[0],b[1]-a[1])};
 };
 return{...base,points,length,sample,berth,closed:true,cumulative,mainCircleRadius:base.radius};
}

/**
 * Two distinct outward berths sharing a certified inner water circuit.
 * Each closed route is berth -> 4m inward branch -> full circle -> outward branch
 * -> berth. Both piers are outside the swept circle, and parked hulls clear every
 * other route. Null means this water cannot safely accommodate this layout.
 *
 * Inputs use projected {p,h} rings. contains(x,z) should include water / bridges;
 * isShoreWalkable(x,z) can reject buildings, other water bodies, or map limits.
 * Returns {baseRoute,berths:[{type,shore,end,width,berth,route}],contains,diagnostics}.
 * route.contains also excludes both physical pier rectangles for manual driving.
 * Each dock.route.sample(0) is its boat's berth. Boat groups are placed at Y=0.
 */
export function makeBerthRoutes(water,{contains,seed=1,isShoreWalkable,maxRadius=50,minRadius=12,clearance=12,berthOffset=4,maxPierLength=60}={}){
 const raw=water?.p??water?.outer??water;if(!Array.isArray(raw)||raw.length<3)return null;
 const outer=raw.map(point),base=makeWaterRoute(water,{contains,seed,maxRadius,minRadius,clearance:Math.max(12,clearance)});if(!base||base.radius<minRadius)return null;
 const C=base.center,offset=Math.max(4,berthOffset),steps=Math.max(64,Math.ceil(base.length/1.25)),rings=[outer,...(water.h??water.holes??[]).map(r=>r.map(point))];
 const safeDisk=(p,radius)=>{
  if(!base.contains(p.x,p.z))return false;
  for(const ring of rings)if(nearestEdge(p,ring).distance<radius+.1)return false;
  for(let i=0;i<32;i++){const a=i/32*Math.PI*2;if(!base.contains(p.x+Math.sin(a)*radius,p.z+Math.cos(a)*radius))return false;}return true;
 };
 function makeBerth(type,phase){
  const contact=base.sample(phase*base.length),vx=(contact.x-C.x)/base.radius,vz=(contact.z-C.z)/base.radius,berth={x:contact.x+vx*offset,z:contact.z+vz*offset},nearest=nearestEdge(berth,outer);
  if(!nearest.point||nearest.distance>maxPierLength||nearest.distance<3.4||!safeDisk(berth,2.7))return null;
  const ux=(nearest.point.x-berth.x)/nearest.distance,uz=(nearest.point.z-berth.z)/nearest.distance;
  const shore={x:nearest.point.x+ux*2.2,z:nearest.point.z+uz*2.2},end={x:berth.x+ux*3,z:berth.z+uz*3};
  if(base.contains(shore.x,shore.z)||(isShoreWalkable&&!isShoreWalkable(shore.x,shore.z)))return null;
  const points=[[berth.x,berth.z],[contact.x,contact.z]];
  for(let i=1;i<=steps;i++){const p=base.sample(phase*base.length+i/steps*base.length);points.push([p.x,p.z]);}
  points[points.length-1]=[contact.x,contact.z];points.push([berth.x,berth.z]);
  const route=polylineRoute(points,base,berth),dock={type,shore,end,berth,route,width:2.4,phase};route.dock={shore,water:route.sample(0),distance:distance(shore,berth)};
  return dock;
 }
 // Try several shore-facing separations when one projected shore is obstructed.
 for(const phases of [[0,.1],[0,-.1],[-.04,.08],[.04,-.08],[0,.16],[0,-.16]]){
  const berths=[makeBerth('rowboat',phases[0]),makeBerth('ferry',phases[1])];if(berths.some(b=>!b))continue;
  let valid=true,minPierGap=Infinity,minParkedCenterDistance=Infinity;
  for(const dock of berths){
   const radius=dock.type==='ferry'?2.6:2.25,other=berths.find(b=>b!==dock),samples=Math.ceil(dock.route.length/.35);
   for(let i=0;i<samples&&valid;i++){
    const p=dock.route.sample(i/samples*dock.route.length);
    for(const pier of berths){const gap=distanceToPier(p.x,p.z,pier)-radius;minPierGap=Math.min(minPierGap,gap);if(gap<.05){valid=false;break;}}
    const parkedDistance=distance(p,other.berth),parkedGap=parkedDistance-(radius+(other.type==='ferry'?2.6:2.25));minParkedCenterDistance=Math.min(minParkedCenterDistance,parkedDistance);
    // The broad circles overlap conservatively at the main circuit, but a parked
    // berth is tangent to it: test oriented hull rectangles before rejecting.
    if(parkedGap<.05&&rectanglesOverlap(p,p.yaw,dock.type,other.berth,other.route.sample(0).yaw,other.type,.2)){valid=false;break;}
   }
  }
  if(!valid)continue;
  const navigationContains=(x,z)=>base.contains(x,z)&&berths.every(pier=>distanceToPier(x,z,pier)>.05);
  for(const dock of berths)dock.route.contains=navigationContains;
  return{baseRoute:base,berths,contains:navigationContains,diagnostics:{radius:base.radius,minPierGap,minParkedCenterDistance,phaseSeparation:Math.abs(phases[1]-phases[0]),clearance:Math.max(12,clearance)}};
 }
 return null;
}

/** Conservative 2D separating-axis test; useful for collision checks in the world. */
export function rectanglesOverlap(a,angleA,typeA,b,angleB,typeB,margin=0){
 const size=type=>type==='ferry'?[.99,2.34]:[.75,1.72];
 const [wa,la]=size(typeA),[wb,lb]=size(typeB),ua={x:Math.cos(angleA),z:-Math.sin(angleA)},va={x:Math.sin(angleA),z:Math.cos(angleA)},ub={x:Math.cos(angleB),z:-Math.sin(angleB)},vb={x:Math.sin(angleB),z:Math.cos(angleB)},dx=b.x-a.x,dz=b.z-a.z,dot=(u,v)=>u.x*v.x+u.z*v.z;
 for(const axis of [ua,va,ub,vb]){const projection=Math.abs(dx*axis.x+dz*axis.z),spanA=(wa+margin)*Math.abs(dot(ua,axis))+(la+margin)*Math.abs(dot(va,axis)),spanB=(wb+margin)*Math.abs(dot(ub,axis))+(lb+margin)*Math.abs(dot(vb,axis));if(projection>spanA+spanB)return false;}return true;
}
