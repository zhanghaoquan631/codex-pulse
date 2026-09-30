import {createSpatialIndex,distanceToSegment} from './world-layout.mjs';
import {prepareWaterContains} from './water-query.mjs';
import {inRectangle} from './coast-layout.mjs';

// Source elevation is coarse and exaggerated. Local building terraces keep walls grounded;
// the refinement is illustrative, not additional surveyed elevation information.
export function createCampusTerrain(detail,baseHeightAt,{cellSize=.006}={}){
  const b=detail.bounds,nx=Math.ceil((b[2]-b[0])/cellSize),nz=Math.ceil((b[3]-b[1])/cellSize);
  const sx=(b[2]-b[0])/nx,sz=(b[3]-b[1])/nz,index=createSpatialIndex(.06),terraces=[];
  for(const building of detail.buildings){
    const ring=building.rings[0],xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]),heights=ring.map(p=>baseHeightAt(...p)).sort((a,b)=>a-b);
    const terrace={ring,contains:prepareWaterContains(building.rings),height:Math.max(.016,heights[Math.floor(heights.length/2)])};
    terraces.push(terrace);index.insert(terrace,Math.min(...xs)-.025,Math.min(...zs)-.025,Math.max(...xs)+.025,Math.max(...zs)+.025);
  }
  const heights=[];
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
    const x=b[0]+i*sx,z=b[1]+j*sz,base=baseHeightAt(x,z),candidates=index.at(x,z);
    let target=base,weight=0,total=0;
    const inside=candidates.find(p=>p.contains(x,z));
    if(inside){target=inside.height;weight=1;}
    else{
      let adjustment=0;
      for(const p of candidates){const d=Math.min(...p.ring.slice(1).map((q,k)=>distanceToSegment(x,z,p.ring[k],q)));if(d>=.025)continue;const w=(1-d/.025)**2;adjustment+=(p.height-base)*w;total+=w;weight=Math.max(weight,w);}
      if(total)target=base+adjustment/total;
    }
    const edge=Math.min(x-b[0],b[2]-x,z-b[1],b[3]-z),blend=Math.min(1,Math.max(0,edge/.025));
    heights.push(base+(target-base)*weight*blend);
  }
  const terrain={bounds:[[b[0],b[1]],[b[2],b[3]]],nx,nz};
  function heightAt(x,z){
    if(!inRectangle(x,z,b))return baseHeightAt(x,z);
    const gx=Math.min(nx-.000001,Math.max(0,(x-b[0])/sx)),gz=Math.min(nz-.000001,Math.max(0,(z-b[1])/sz));
    const ix=Math.floor(gx),iz=Math.floor(gz),a=gx-ix,c=gz-iz,k=iz*(nx+1)+ix;
    const h00=heights[k],h10=heights[k+1],h01=heights[k+nx+1],h11=heights[k+nx+2];
    return a+c<=1?h00+(h10-h00)*a+(h01-h00)*c:h11+(h01-h11)*(1-a)+(h10-h11)*(1-c);
  }
  return {heightAt,terrain,terraces,samples:heights.length};
}
