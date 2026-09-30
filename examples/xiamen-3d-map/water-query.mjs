// Bucket shoreline edges by latitude; retain the original ray-crossing arithmetic.
export function prepareRingContains(ring){
 let min=Infinity,max=-Infinity;
 for(const p of ring){min=Math.min(min,p[1]);max=Math.max(max,p[1]);}
 if(!Number.isFinite(min)||!Number.isFinite(max))return ()=>false;
 const step=Math.max(1,(max-min)/256),rows=[];
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];if(a[1]===b[1])continue;
  const first=Math.floor((Math.min(a[1],b[1])-min)/step),last=Math.floor((Math.max(a[1],b[1])-min)/step);
  for(let row=first;row<=last;row++)(rows[row]??=[]).push([a,b]);
 }
 return (x,z)=>{
  if(!Number.isFinite(x)||!Number.isFinite(z)||z<min||z>max)return false;
  const edges=rows[Math.floor((z-min)/step)];if(!edges)return false;
  let ok=false;
  for(const [a,b] of edges)if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])ok=!ok;
  return ok;
 };
}

export function prepareWaterContains(rings){
 const tests=rings.map(prepareRingContains);
 return (x,z)=>{
  if(!tests.length||!tests[0](x,z))return false;
  for(let i=1;i<tests.length;i++)if(tests[i](x,z))return false;
  return true;
 };
}
