// Numeric cells avoid rebuilding nine string keys for every walker on every frame.
export function createPedestrianOccupancy(){
  const columns=new Map(),locations=new WeakMap(),cell=.05;
  function add(walker){
    const x=Math.floor(walker.pos.x/cell),z=Math.floor(walker.pos.z/cell),previous=locations.get(walker);
    if(previous?.x===x&&previous.z===z)return;
    if(previous){
      previous.bucket.delete(walker);
      if(!previous.bucket.size){const column=columns.get(previous.x);column.delete(previous.z);if(!column.size)columns.delete(previous.x);}
    }
    let column=columns.get(x);if(!column){column=new Map();columns.set(x,column);}
    let bucket=column.get(z);if(!bucket){bucket=new Set();column.set(z,bucket);}
    bucket.add(walker);locations.set(walker,{x,z,bucket});
  }
  function free(pos,self){
    const x=Math.floor(pos.x/cell),z=Math.floor(pos.z/cell);
    for(let dx=-1;dx<=1;dx++){
      const column=columns.get(x+dx);if(!column)continue;
      for(let dz=-1;dz<=1;dz++){
        const bucket=column.get(z+dz);if(!bucket)continue;
        for(const walker of bucket){
          if(walker===self||Math.abs(pos.y-walker.pos.y)>.04)continue;
          const xx=pos.x-walker.pos.x,zz=pos.z-walker.pos.z,r=walker.stationary?.030:.019;
          if(xx*xx+zz*zz<r*r)return false;
        }
      }
    }
    return true;
  }
  return {add,free};
}
