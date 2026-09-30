/** Horizontal map geometry shared by rendering, spawn placement and movement. */
export function inPolygon(x,z,points){
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[i],b=points[j];
    if((a.z>z)!==(b.z>z) && x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;
  }
  return inside;
}
export function onMappedLand(level,x,z,radius=0){
  if(!level.walkablePolygons?.length)return true;
  for(const [dx,dz] of [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius],[radius*.7,radius*.7],[-radius*.7,radius*.7],[radius*.7,-radius*.7],[-radius*.7,-radius*.7]]){
    const px=x+dx,pz=z+dz;
    // Existing bridges remain walkable over mapped water. Only newly opened
    // building footprints need the extra water exclusion after a collapse.
    if(level.walkablePolygons.some(p=>inPolygon(px,pz,p)))continue;
    if(!(level.collapsedGround||[]).some(p=>inPolygon(px,pz,p.points)))return false;
    if((level.cartography?.water||[]).some(p=>inPolygon(px,pz,p)))return false;
  }
  return true;
}
export function lineRectangle(a,b,width){
  const length=Math.hypot(b.x-a.x,b.z-a.z),nx=-(b.z-a.z)/length*width/2,nz=(b.x-a.x)/length*width/2;
  return [{x:a.x+nx,z:a.z+nz},{x:b.x+nx,z:b.z+nz},{x:b.x-nx,z:b.z-nz},{x:a.x-nx,z:a.z-nz}];
}
export function clipPolygon(points,bounds){
  let result=points;
  for(const [axis,limit,sign] of [['x',bounds.minX,1],['x',bounds.maxX,-1],['z',bounds.minZ,1],['z',bounds.maxZ,-1]]){
    const next=[];
    for(let i=0;i<result.length;i++){
      const a=result[i],b=result[(i+1)%result.length],ai=sign*(a[axis]-limit)>=0,bi=sign*(b[axis]-limit)>=0;
      if(ai)next.push(a);
      if(ai!==bi){const t=(limit-a[axis])/(b[axis]-a[axis]);next.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});}
    }result=next;
  }
  return result;
}
