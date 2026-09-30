import {MathUtils} from 'three';

export function streetClearance(routes){
  const cells=new Map(),step=.5;
  for(const path of routes)for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],segment=[a,b];
    for(let x=Math.floor(Math.min(a.x,b.x)/step);x<=Math.floor(Math.max(a.x,b.x)/step);x++)for(let z=Math.floor(Math.min(a.z,b.z)/step);z<=Math.floor(Math.max(a.z,b.z)/step);z++){
      const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(segment);
    }
  }
  return (x,z,r)=>{
    for(let ix=Math.floor((x-r)/step);ix<=Math.floor((x+r)/step);ix++)for(let iz=Math.floor((z-r)/step);iz<=Math.floor((z+r)/step);iz++)for(const [a,b] of cells.get(ix+','+iz)||[]){
      const dx=b.x-a.x,dz=b.z-a.z,t=MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
      if(Math.hypot(x-a.x-t*dx,z-a.z-t*dz)<r)return false;
    }
    return true;
  };
}
