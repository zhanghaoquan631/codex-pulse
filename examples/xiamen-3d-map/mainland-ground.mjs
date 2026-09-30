// Reduce lowland DEM sampling noise without replacing the source shoreline or hill profile.
// This is display smoothing, not new surveyed terrain.
export function smoothMainlandGround(terrain,boundsList,{isWater=()=>false}={}){
 const [[x0,z0],[x1,z1]]=terrain.bounds,dx=(x1-x0)/terrain.nx,dz=(z1-z0)/terrain.nz;
 const source=terrain.heights,output=source.slice();let changed=0,maxChange=0;
 for(let j=2;j<terrain.nz-1;j++)for(let i=2;i<terrain.nx-1;i++){
  const k=j*(terrain.nx+1)+i,h=source[k],x=x0+i*dx,z=z0+j*dz;
  if(h<=0||h>=45)continue;
  const b=boundsList.find(b=>x>b[0]&&x<b[2]&&z>b[1]&&z<b[3]);if(!b)continue;
  if(isWater(x,z))continue;
  const edge=Math.min(x-b[0],b[2]-x,z-b[1],b[3]-z),blend=Math.min(1,edge/.12,Math.max(0,(45-h)/15));
  let total=0,weight=0;
  for(let v=-2;v<=2;v++)for(let u=-2;u<=2;u++){
   const value=source[(j+v)*(terrain.nx+1)+i+u];if(value<=0||value>55||isWater(x+u*dx,z+v*dz))continue;
   const w=Math.exp(-(u*u+v*v)/3);total+=value*w;weight+=w;
  }
  if(!weight)continue;
  const next=h+(total/weight-h)*blend;output[k]=next;
  if(Math.abs(next-h)>.01)changed++;maxChange=Math.max(maxChange,Math.abs(next-h));
 }
 return {terrain:{...terrain,heights:output},changed,maxChange};
}
