import * as THREE from 'three';
import {spatialQuery} from './spatial-query.mjs';
import {planSoftLandscape,addSoftLandscape} from './landscape-planting.mjs';

const palette={dune:['#718d53','#8c9d65'],headland:['#587853','#7b9062'],fishing:['#4e8264','#759655'],harbour:['#597e68','#74936f'],courtyard:['#4c7858','#7c925d'],tea:['#527b42','#80a057'],forest:['#426e4c','#638350']};

// One continuous surface, sharing edge heights and colours; no separate tiled pads.
export function planExhibitGardens({ground,paths,parcels,amenities,access,bounds,profile}){
 const [left,right,back,front]=bounds,step=.026,positions=[],colors=[];
 const lots=[...parcels,...amenities],lotsNear=spatialQuery(lots,p=>[p.x-p.radius,p.x+p.radius,p.z-p.radius,p.z+p.radius],.12);
 const segments=[...paths,...access].flatMap((line,li)=>line.slice(1).map((b,i)=>({a:line[i],b,margin:li<paths.length?.033:.013})));
 const routeNear=spatialQuery(segments,({a,b,margin})=>[Math.min(a[0],b[0])-margin,Math.max(a[0],b[0])+margin,Math.min(a[2],b[2])-margin,Math.max(a[2],b[2])+margin],.12);
 const shades=(palette[profile.family]||['#527b60','#819669']).map(c=>new THREE.Color(c));
 const columns=Math.floor((right-left)/step),rows=Math.floor((front-back)/step),nodes=[];
 let area=0;
 for(let iz=0;iz<=rows;iz++)for(let ix=0;ix<=columns;ix++){
  const x=left+ix*step,z=back+iz*step,margin=step*.72;
  let allowed=x>left+margin&&x<right-margin&&z>back+margin&&z<front-margin;
  if(allowed)allowed=ground.clear(x,z,margin)&&!lotsNear(x,z,margin).some(p=>Math.hypot(x-p.x,z-p.z)<p.radius+margin+.003);
  if(allowed)allowed=!routeNear(x,z,margin).some(({a,b,margin:m})=>{
   const dx=b[0]-a[0],dz=b[2]-a[2],t=THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz||1),0,1);
   return Math.hypot(x-a[0]-t*dx,z-a[2]-t*dz)<m+margin;
  });
  const p=allowed?ground.sample(x,z):null;
  if(!p||p.wet||p.y<-.002||p.y>.025)allowed=false;
  // Keep open forecourts; coast and woodland retain broader, irregular planted areas.
  const phase=profile.phase,field=Math.sin(x*9+phase)+Math.cos(z*8-phase)+Math.sin((x+z)*5+phase)*.4;
  const natural=['forest','tea','headland','dune','fishing'].includes(profile.family);
  allowed=allowed&&field>(natural?-1.25:-.35);
  const color=shades[0].clone().lerp(shades[1],THREE.MathUtils.clamp((field+2.4)/4.8,0,1));
  nodes.push({x,z,y:p?.y??0,allowed,color});
 }
 const cells=new Map();
 for(let iz=0;iz<rows;iz++)for(let ix=0;ix<columns;ix++){
  const a=nodes[iz*(columns+1)+ix],b=nodes[iz*(columns+1)+ix+1],c=nodes[(iz+1)*(columns+1)+ix],d=nodes[(iz+1)*(columns+1)+ix+1];
  if(![a,b,c,d].every(p=>p.allowed)||Math.max(a.y,b.y,c.y,d.y)-Math.min(a.y,b.y,c.y,d.y)>.006)continue;
  // Interior checks prevent a narrow stream or a stair from falling between corners.
  const mid=ground.sample((a.x+d.x)/2,(a.z+d.z)/2);
  if(!mid||mid.wet||Math.abs(mid.y-(a.y+b.y+c.y+d.y)/4)>.004)continue;
  cells.set(iz*columns+ix,{a,b,c,d,ix,iz});
 }
 const visited=new Set(),retained=new Map();
 for(const [key,cell] of cells){
  if(visited.has(key))continue;
  const cluster=[cell];visited.add(key);
  for(let i=0;i<cluster.length;i++)for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const x=cluster[i].ix+dx,z=cluster[i].iz+dz,k=z*columns+x;
   if(x<0||x>=columns||z<0||z>=rows||visited.has(k)||!cells.has(k))continue;
   visited.add(k);cluster.push(cells.get(k));
  }
  if(cluster.length>=3)for(const p of cluster)retained.set(p.iz*columns+p.ix,p);
 }
 for(const {a,b,c,d,ix,iz} of retained.values()){
  const has=(x,z)=>x>=0&&x<columns&&z>=0&&z<rows&&retained.has(z*columns+x);
  const corners=[[0,0,!has(ix-1,iz)&&!has(ix,iz-1)],[0,1,!has(ix-1,iz)&&!has(ix,iz+1)],[1,1,!has(ix+1,iz)&&!has(ix,iz+1)],[1,0,!has(ix+1,iz)&&!has(ix,iz-1)]],outline=[];
  corners.forEach(([u,v,bevel],i)=>{
   if(!bevel){outline.push([u,v]);return;}
   for(const other of [corners[(i+3)%4],corners[(i+1)%4]])outline.push([u+(other[0]-u)*.24,v+(other[1]-v)*.24]);
  });
  const vertex=([u,v])=>{
   const weights=[(1-u)*(1-v),u*(1-v),(1-u)*v,u*v],points=[a,b,c,d],color=new THREE.Color(0,0,0);
   let y=0;points.forEach((p,i)=>{y+=p.y*weights[i];color.r+=p.color.r*weights[i];color.g+=p.color.g*weights[i];color.b+=p.color.b*weights[i];});
   positions.push(a.x+(b.x-a.x)*u,y+.0012,a.z+(c.z-a.z)*v);colors.push(color.r,color.g,color.b);
  };
  for(let i=0;i<outline.length;i++){
   const p=outline[i],q=outline[(i+1)%outline.length];
   for(const point of [[.5,.5],p,q])vertex(point);
   area+=Math.abs((p[0]-.5)*(q[1]-.5)-(q[0]-.5)*(p[1]-.5))*step*step*.5;
  }
 }
 const plantingCells=[...retained.values()].map(({a,b,c,d,ix,iz})=>({x:(a.x+d.x)/2,z:(a.z+d.z)/2,y:(a.y+b.y+c.y+d.y)/4+.0012,size:step*.88,kind:'garden',profile,seed:ix*137+iz*31,owner:profile.key}));
 const planting=planSoftLandscape(plantingCells);
 return {positions,colors,area,planting};
}

export function addExhibitGardens(parent,plan){
 if(!plan.positions.length)return;
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(plan.positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(plan.colors,3));geometry.computeVertexNormals();
 const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));mesh.name='exhibit-continuous-gardens';mesh.receiveShadow=true;parent.add(mesh);
 addSoftLandscape(parent,plan.planting||[],'exhibit-flowerbeds');return mesh;
}
