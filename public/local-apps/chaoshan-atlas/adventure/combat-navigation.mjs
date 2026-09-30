import {boxLocalPoint} from './camera-math.mjs';
import {groundHeight} from './landforms.mjs';
import {onMappedLand} from './map-geometry.mjs';

const cache=new WeakMap();
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function bodySpaceFree(level,p,radius=.45,height=1.8){
  const b=level.bounds,y=p.absoluteY??groundHeight(level,p.x,p.z)+(p.y||0);
  if(p.x<b.minX+radius||p.x>b.maxX-radius||p.z<b.minZ+radius||p.z>b.maxZ-radius||!onMappedLand(level,p.x,p.z,radius))return false;
  return ![...level.walls,...level.doors.filter(d=>!d.open)].some(box=>{
    if(box.kind!=='invisible'&&(y>=box.baseY+box.height-.015||y+height<=box.baseY+.015))return false;
    const q=boxLocalPoint(p,box),dx=Math.max(0,Math.abs(q.x)-box.w/2),dz=Math.max(0,Math.abs(q.z)-box.d/2);
    return dx*dx+dz*dz<radius*radius;
  });
}

const directions=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
const opposite=[1,0,3,2,7,6,5,4];
const cell=(g,n)=>({x:g.b.minX+(n%g.nx+.5)*g.step,z:g.b.minZ+(Math.floor(n/g.nx)+.5)*g.step});
const index=(g,p)=>clamp(Math.floor((p.z-g.b.minZ)/g.step),0,g.nz-1)*g.nx+clamp(Math.floor((p.x-g.b.minX)/g.step),0,g.nx-1);

// Exact planar capsule/rectangle contact, including rounded corners. Expanding
// every wall by a grid-cell width would close the original 2.2 m doorways.
function sweptBox(a,b,box,radius){
  a=boxLocalPoint(a,box);b=boxLocalPoint(b,box);
  const w=box.w/2,d=box.d/2,vx=b.x-a.x,vz=b.z-a.z;
  let near=0,far=1;
  for(const [p,v,half]of [[a.x,vx,w],[a.z,vz,d]]){
    if(Math.abs(v)<1e-9){if(p < -half || p > half){near=2;break;}}
    else {let lo=(-half-p)/v,hi=(half-p)/v;if(lo>hi)[lo,hi]=[hi,lo];near=Math.max(near,lo);far=Math.min(far,hi);}
  }
  if(near<=far)return true;
  const pointDistance=p=>Math.max(0,Math.abs(p.x)-w)**2+Math.max(0,Math.abs(p.z)-d)**2;
  const r2=radius*radius-1e-8;
  if(pointDistance(a)<r2||pointDistance(b)<r2)return true;
  const length=vx*vx+vz*vz;
  if(length<1e-12)return false;
  for(const x of [-w,w])for(const z of [-d,d]){
    const t=clamp(((x-a.x)*vx+(z-a.z)*vz)/length,0,1);
    if((a.x+vx*t-x)**2+(a.z+vz*t-z)**2<r2)return true;
  }
  return false;
}

function pathClear(level,g,a,b,radius,nearby){
  const steps=level.walkablePolygons?.length?Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.55)):1;
  for(let i=1;i<steps;i++){
    const t=i/steps;
    if(!onMappedLand(level,a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t,radius))return false;
  }
  const ay=groundHeight(level,a.x,a.z),by=groundHeight(level,b.x,b.z);
  const my=groundHeight(level,(a.x+b.x)/2,(a.z+b.z)/2),low=Math.min(ay,by,my),high=Math.max(ay,by,my);
  for(const box of nearby){
    if(box.kind!=='invisible'&&(low>=box.baseY+box.height-.015||high+1.8<=box.baseY+.015))continue;
    if(sweptBox(a,b,box,radius))return false;
  }
  return true;
}

function nearbyBoxes(g,a,b){
  const first=g.nearby[index(g,a)]||[],last=g.nearby[index(g,b)]||[];
  return first===last?first:[...new Set([...first,...last])];
}

// Static occupancy and eight swept neighbor links are computed together. A
// narrow wall between open cell centers removes links, not walkable floor.
// Doors rebuild this graph; moving players only refresh the reverse field.
function field(level,target,radius){
  const bucket=radius>.8?1.05:radius>.51?.76:.49,doors=level.doors.map(d=>d.open?1:0).join('')+`:${level.structureRevision||0}`;
  let maps=cache.get(level);if(!maps){maps=new Map();cache.set(level,maps);}
  let g=maps.get(bucket);
  if(!g||g.doors!==doors){
    const b=level.bounds,step=Math.max(1.5,Math.sqrt((b.maxX-b.minX)*(b.maxZ-b.minZ)/24000));
    const nx=Math.ceil((b.maxX-b.minX)/step),nz=Math.ceil((b.maxZ-b.minZ)/step),size=nx*nz;
    g={doors,b,step,nx,nz,open:new Uint8Array(size),links:new Uint8Array(size),nearby:new Array(size),dist:new Int32Array(size),queue:new Int32Array(size),goal:-1,bucket};
    const obstacles=[...level.walls,...level.doors.filter(d=>!d.open)];
    // Spatial broad phase includes two neighboring cells for connector checks.
    for(const box of obstacles){
      const c=Math.abs(Math.cos(box.rotation||0)),s=Math.abs(Math.sin(box.rotation||0)),pad=bucket+step*2;
      const rx=c*box.w/2+s*box.d/2+pad,rz=s*box.w/2+c*box.d/2+pad;
      const x0=clamp(Math.floor((box.x-rx-b.minX)/step),0,nx-1),x1=clamp(Math.floor((box.x+rx-b.minX)/step),0,nx-1);
      const z0=clamp(Math.floor((box.z-rz-b.minZ)/step),0,nz-1),z1=clamp(Math.floor((box.z+rz-b.minZ)/step),0,nz-1);
      for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)(g.nearby[z*nx+x]??=[]).push(box);
    }
    for(let n=0;n<size;n++){
      const p=cell(g,n),y=groundHeight(level,p.x,p.z);
      if(p.x<b.minX+bucket||p.x>b.maxX-bucket||p.z<b.minZ+bucket||p.z>b.maxZ-bucket||!onMappedLand(level,p.x,p.z,bucket))continue;
      g.open[n]=1;
      for(const box of g.nearby[n]||[]){
        if(box.kind!=='invisible'&&(y>=box.baseY+box.height-.015||y+1.8<=box.baseY+.015))continue;
        const q=boxLocalPoint(p,box),dx=Math.max(0,Math.abs(q.x)-box.w/2),dz=Math.max(0,Math.abs(q.z)-box.d/2);
        if(dx*dx+dz*dz<bucket*bucket){g.open[n]=0;break;}
      }
    }
    for(let n=0;n<size;n++)if(g.open[n]){
      const x=n%nx,z=Math.floor(n/nx),a=cell(g,n);
      for(const direction of [1,3,6,7]){
        const [dx,dz]=directions[direction],xx=x+dx,zz=z+dz;
        if(xx<0||xx>=nx||zz<0||zz>=nz)continue;
        const k=zz*nx+xx;
        if(g.open[k]&&pathClear(level,g,a,cell(g,k),bucket,g.nearby[n]||[])){
          g.links[n]|=1<<direction;g.links[k]|=1<<opposite[direction];
        }
      }
    }
    maps.set(bucket,g);
  }
  if(g.targetX===target.x&&g.targetZ===target.z)return g.goal>=0?g:null;
  g.targetX=target.x;g.targetZ=target.z;
  // Never snap a target across a wall to the nearest nominally open cell.
  // A zero-radius final sight connector permits a player standing close to a
  // wall; graph nodes themselves still fit the whole pursuing enemy body.
  const middle=index(g,target),cx=middle%g.nx,cz=Math.floor(middle/g.nx);
  let goal=-1,best=Infinity;
  for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){
    const x=cx+dx,z=cz+dz;if(x<0||x>=g.nx||z<0||z>=g.nz)continue;
    const n=z*g.nx+x,p=cell(g,n),distance=(p.x-target.x)**2+(p.z-target.z)**2;
    if(g.open[n]&&distance<best&&pathClear(level,g,target,p,0,nearbyBoxes(g,target,p))){goal=n;best=distance;}
  }
  if(goal<0){g.goal=-1;return null;}
  if(goal!==g.goal){
    g.goal=goal;g.dist.fill(-1);g.dist[goal]=0;let head=0,tail=1;g.queue[0]=goal;
    while(head<tail){const n=g.queue[head++];
      for(let d=0;d<8;d++)if(g.links[n]&(1<<d)){
        const [dx,dz]=directions[d],k=n+dz*g.nx+dx;
        if(g.dist[k]<0){g.dist[k]=g.dist[n]+1;g.queue[tail++]=k;}
      }
    }
  }
  return g;
}

export function groundRoute(level,from,target,radius=.45){
  const g=field(level,target,radius);if(!g)return null;
  const middle=index(g,from),cx=middle%g.nx,cz=Math.floor(middle/g.nx);
  let n=-1,nearest=Infinity;
  // A spawn point is not necessarily a cell center. Its real body also needs
  // an unobstructed connector, otherwise a thin wall inside that cell leaks.
  for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){
    const x=cx+dx,z=cz+dz;if(x<0||x>=g.nx||z<0||z>=g.nz)continue;
    const k=z*g.nx+x,p=cell(g,k),distance=(p.x-from.x)**2+(p.z-from.z)**2;
    if(g.dist[k]>=0&&distance<nearest&&pathClear(level,g,from,p,radius,nearbyBoxes(g,from,p))){n=k;nearest=distance;}
  }
  if(n<0)return null;
  let best=n;
  for(let d=0;d<8;d++)if(g.links[n]&(1<<d)){
    const [dx,dz]=directions[d],k=n+dz*g.nx+dx,p=cell(g,k);
    if(g.dist[k]<g.dist[best]&&pathClear(level,g,from,p,radius,nearbyBoxes(g,from,p)))best=k;
  }
  return {...cell(g,best),distance:g.dist[n]*g.step};
}
