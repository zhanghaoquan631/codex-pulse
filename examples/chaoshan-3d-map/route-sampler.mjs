import {Vector3,LineCurve3} from 'three';

// Arc-length lookup avoids scanning every road vertex for every moving instance.
export function routeSampler(points){
  const curves=[],ends=[];let length=0;
  for(let i=1;i<points.length;i++){
    const edge=new LineCurve3(points[i-1],points[i]),size=edge.getLength();
    if(size<1e-9)continue;curves.push(edge);length+=size;ends.push(length);
  }
  function edgeAt(t){
    const distance=Math.min(1,Math.max(0,t))*length;let lo=0,hi=ends.length-1;
    while(lo<hi){const mid=(lo+hi)>>1;if(ends[mid]<distance)lo=mid+1;else hi=mid;}
    return [lo,(distance-(ends[lo-1]||0))/((ends[lo]||1)-(ends[lo-1]||0))];
  }
  return {curves,length,getLength:()=>length,
    getPoint(t,target=new Vector3()){if(!curves.length)return target.copy(points[0]||new Vector3());const [i,u]=edgeAt(t);return target.copy(curves[i].v1).lerp(curves[i].v2,u);},
    getTangent(t,target=new Vector3()){if(!curves.length)return target.set(0,0,1);const [i]=edgeAt(t);return target.subVectors(curves[i].v2,curves[i].v1).normalize();}
  };
}
