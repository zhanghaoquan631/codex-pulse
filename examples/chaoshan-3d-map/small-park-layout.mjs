// Reserve the editorial miniature independently of the map's source streets.
export const smallParkHalfSize=1.08;
export const smallParkPocketGardens=Array.from({length:14},(_,i)=>{
 const sector=Math.floor(i/2),angle=(sector+.5)*Math.PI/4+(i%2?1:-1)*.22;
 return {x:Math.sin(angle)*54,z:Math.cos(angle)*54,angle,width:3.5,length:16,sector};
});
export const smallParkCornerLots=[
 {x:-74,z:-74,service:'florist',angle:Math.PI/4},
 {x:74,z:-74,service:'soup',angle:-Math.PI/4},
 {x:-74,z:74,service:'tea',angle:Math.PI*3/4},
 {x:74,z:74,service:'coffee',angle:-Math.PI*3/4}
];
// The eighth sector stays low, preserving a clear approach to the pavilion.
export const smallParkMarketLots=[['tea',35,7],['florist',49,8],['soup',63,7]].map(([service,r,size],i)=>{
 const sector=7.5*Math.PI/4,x=Math.sin(sector)*r,z=Math.cos(sector)*r;
 const road=i===1?7*Math.PI/4:Math.PI*2,nx=Math.cos(road),nz=-Math.sin(road),projection=x*Math.sin(road)+z*Math.cos(road);
 const side=Math.sign(x*nx+z*nz),end=[Math.sin(road)*projection+nx*side*4.1,Math.cos(road)*projection+nz*side*4.1];
 const angle=Math.atan2(end[0]-x,end[1]-z);
 return {service,x,z,size,angle,end,start:[x+Math.sin(angle)*size*.59,z+Math.cos(angle)*size*.59]};
});
export function outsideSmallParkRoads(roads,park){
  if(!park)return roads;
  const radius=smallParkHalfSize+.065,out=[];
  for(const record of roads){
    const [kind,bridge,path]=record;
    if(kind==='rail'){out.push(record);continue;}
    let run=[];
    const flush=()=>{if(run.length>1)out.push([kind,bridge,run]);run=[];};
    for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i],dx=b[0]-a[0],dz=b[1]-a[1];let enter=0,leave=1,hit=true;
      for(const [v,d,c] of [[a[0],dx,park.x],[a[1],dz,park.z]]){
        if(Math.abs(d)<1e-12){if(Math.abs(v-c)>radius)hit=false;continue;}
        const t0=(c-radius-v)/d,t1=(c+radius-v)/d;enter=Math.max(enter,Math.min(t0,t1));leave=Math.min(leave,Math.max(t0,t1));
      }
      const point=t=>[a[0]+dx*t,a[1]+dz*t];
      if(!hit||enter>=leave){if(!run.length)run.push(a);run.push(b);continue;}
      if(enter>0){if(!run.length)run.push(a);run.push(point(enter));}flush();
      if(leave<1)run=[point(leave),b];
    }
    flush();
  }
  return out;
}

// Smooth progress with an actual dwell, not an instantaneous reversal.
export function parkWalkerPose(seconds,phase,speed,index){
  const duration=18,walk=12,t=seconds+index*1.37,cycles=Math.floor(t/duration),local=t%duration;
  const moving=local<walk,angle=phase+(cycles*walk+Math.min(local,walk))*speed;
  return {angle,moving,state:moving?'walk':index%3===0?'wave':index%3===1?'look':'rest',gesture:Math.sin((local-walk)*3)};
}
