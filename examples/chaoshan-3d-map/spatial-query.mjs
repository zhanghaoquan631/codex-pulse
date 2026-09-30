// Broad-phase lookup only: callers retain their exact collision/containment test.
export function spatialQuery(items,bounds,step=1){
 const cells=new Map();
 for(const item of items){const [x0,x1,z0,z1]=bounds(item);
  if(![x0,x1,z0,z1].every(Number.isFinite))continue;
  for(let x=Math.floor(x0/step);x<=Math.floor(x1/step);x++)for(let z=Math.floor(z0/step);z<=Math.floor(z1/step);z++){
   const k=x+','+z;if(!cells.has(k))cells.set(k,[]);cells.get(k).push(item);
  }
 }
 return (x,z,r=0)=>{
  const a=Math.floor((x-r)/step),b=Math.floor((x+r)/step),c=Math.floor((z-r)/step),d=Math.floor((z+r)/step);
  if(a===b&&c===d)return cells.get(a+','+c)||[];
  const result=new Set();for(let ix=a;ix<=b;ix++)for(let iz=c;iz<=d;iz++)for(const item of cells.get(ix+','+iz)||[])result.add(item);
  return [...result];
 };
}
export function placeBounds(p){
 const r=Math.max(p.span||0,...(p.footprint||[]).map(Math.abs),p.id==='small-park'?1.53:p.id==='lighthouse'?1:0,.3)*1.42;
 return [p.x-r,p.x+r,p.z-r,p.z+r];
}
