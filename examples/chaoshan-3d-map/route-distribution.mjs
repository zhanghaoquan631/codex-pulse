import * as THREE from 'three';

// Alternate populated centers with geographic grid cells for broad road coverage.
export function spreadRoutes(routes,places,count){
  if(!routes.length)return [];
  const cells=new Map();
  for(const r of routes){const key=`${Math.floor(r.mid.x/2)},${Math.floor(r.mid.z/2)}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(r);}
  const anchors=places.filter(p=>p.kind==='district');
  const pools=anchors.map(p=>routes.slice().sort((a,b)=>a.mid.distanceToSquared(new THREE.Vector3(p.x,a.mid.y,p.z))-b.mid.distanceToSquared(new THREE.Vector3(p.x,b.mid.y,p.z))).slice(0,32));
  const grid=[...cells.values()],result=[];
  for(let i=0;i<count;i++){
    const regional=pools.length&&i%2===0,sets=regional?pools:grid,j=Math.floor(i/2);
    const index=regional?j%sets.length:Math.floor(j*sets.length/Math.ceil(count/2))%sets.length,pool=sets[index];
    result.push(pool[Math.floor(j/sets.length)%pool.length]);
  }
  return result;
}
