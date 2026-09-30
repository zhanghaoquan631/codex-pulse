import {prepareWaterContains} from './water-query.mjs';

export const coastLocations={harbor:[118.08162,24.44240],deck:[118.085142,24.435600]};
export const inRectangle=(x,z,b)=>x>=b[0]&&z>=b[1]&&x<=b[2]&&z<=b[3];
export function createCoastCoverage(detail){
  const contains=detail.water.map(rings=>prepareWaterContains(rings));
  return {covers:(x,z)=>inRectangle(x,z,detail.bounds),isWater:(x,z)=>contains.some(test=>test(x,z))};
}

// Split a line at each detailed boundary so the coarse and fine road surfaces never overlap.
export function outsideIntervals(a,b,boundsList,clip){
  let runs=[[0,1]];
  for(const bounds of boundsList){
    const cut=clip(a,b,bounds);if(!cut)continue;
    runs=runs.flatMap(([start,end])=>{
      if(cut[1]<=start||cut[0]>=end)return [[start,end]];
      const next=[];
      if(cut[0]>start)next.push([start,cut[0]]);
      if(cut[1]<end)next.push([cut[1],end]);
      return next;
    });
  }
  return runs;
}
