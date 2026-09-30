// Original local game terrain in metres. Atlas ll anchors are geographic;
// these heights express each place's terrain character, not survey/DEM data.
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const smooth=n=>{const t=clamp(n);return t*t*(3-2*t);};
const lerp=(a,b,t)=>a+(b-a)*t;

/** Absolute ground Y. Player.y remains an offset for jumping in the engine. */
export function groundHeight(level,x,z){
  const kind=level?.landform?.type||level?.theme||level?.id;
  if(kind==='profile'){
    const stops=level.landform.stops||[],position=level.landform.axis==='x'?x:z;
    if(!stops.length)return 0;
    const sorted=stops; // Authored profiles are in ascending coordinate order.
    if(position<=sorted[0][0])return sorted[0][1];
    for(let i=1;i<sorted.length;i++)if(position<=sorted[i][0])return lerp(sorted[i-1][1],sorted[i][1],clamp((position-sorted[i-1][0])/(sorted[i][0]-sorted[i-1][0]||1)));
    return sorted.at(-1)[1];
  }
  if(kind==='bridge'||kind==='river-bridge'){
    // Both stone approaches meet one subtly arched, continuous walkable deck.
    if(z>=12)return 0;
    if(z>8)return (12-z)*.05;
    if(z>=-42){const t=(8-z)/50;return .2+.62*Math.sin(Math.PI*t);}
    if(z>-47)return lerp(.2,.08,(-42-z)/5);
    return .08;
  }
  if(kind==='tower'||kind==='terraced-court'){
    // The west escort cloister is a continuous accessible ramp. The broad
    // centre staircase has 12 cm risers; side routes remain sloped.
    let y=1.2*smooth((16-z)/10);
    if(Math.abs(x)<6&&z<15.7&&z>6.3)y=Math.round(y/.12)*.12;
    y+=.9*smooth((-12-z)/8);
    return y;
  }
  if(kind==='coast'||kind==='headland'){
    // A low harbour rises to the lighthouse bench, then to a level beacon
    // courtyard. A broad platform keeps the entire tower footprint grounded.
    let y=1.45*clamp((14-z)/18)+.75*clamp((-16-z)/4);
    // The eastern rock shoulder varies the approach while leaving both
    // building platforms and the harbour's flat floor intact.
    const shoulder=.16*Math.exp(-(((x-18)/12)**2+((z-5)/10)**2));
    y+=shoulder*smooth((Math.abs(x)-7)/4)*(1-smooth((-2-z)/3))*(1-smooth((z-10)/4));
    return y;
  }
  return 0; // Low coastal city street: shops and their thresholds remain level.
}

export function groundNormal(level,x,z,epsilon=.05){
  const nx=groundHeight(level,x-epsilon,z)-groundHeight(level,x+epsilon,z);
  const nz=groundHeight(level,x,z-epsilon)-groundHeight(level,x,z+epsilon);
  const ny=2*epsilon,length=Math.hypot(nx,ny,nz);
  return {x:nx/length,y:ny/length,z:nz/length};
}

/** Useful for placing a rigid building foundation across a sloped footprint. */
export function groundRange(level,x,z,w,d){
  const values=[];
  for(const dx of [-.5,0,.5])for(const dz of [-.5,0,.5])values.push(groundHeight(level,x+dx*w,z+dz*d));
  return {min:Math.min(...values),max:Math.max(...values),center:groundHeight(level,x,z)};
}

/** First positive ray/terrain crossing, distance in metres; no game state access. */
export function segmentGroundDistance(level,origin,direction,maxDistance,clearance=0){
  const length=Math.hypot(direction.x,direction.y,direction.z);
  if(!length||!(maxDistance>0))return null;
  const dx=direction.x/length,dy=direction.y/length,dz=direction.z/length;
  const gap=t=>origin.y+dy*t-groundHeight(level,origin.x+dx*t,origin.z+dz*t)-clearance;
  if(gap(0)<=0)return 0;
  const steps=Math.max(1,Math.ceil(maxDistance/.2));let previous=0;
  for(let i=1;i<=steps;i++){
    const t=maxDistance*i/steps;
    if(gap(t)<=0){let lo=previous,hi=t;for(let j=0;j<14;j++){const mid=(lo+hi)/2;if(gap(mid)>0)lo=mid;else hi=mid;}return hi;}
    previous=t;
  }
  return null;
}

export default groundHeight;
