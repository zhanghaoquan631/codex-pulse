// A shelter is a bounded, roofed interior, not merely a block above the player.
// Door/window frames count as its boundary even when open: this game's indoor
// protection explicitly keeps creatures outside rooms, including open entrances.
const barriers=new Set(['wood','brick','stone','white','roof','glass','door','window']);
export function createShelterIndex(blocks){
 const columns=new Map(),cache=new Map();
 for(const b of blocks){const k=b.x+','+b.z;if(!columns.has(k))columns.set(k,[]);columns.get(k).push(b);}
 const col=(x,z)=>columns.get(x+','+z)||[];
 const covered=(x,z,y)=>col(x,z).some(b=>barriers.has(b.type)&&b.y<=y&&b.y+(b.type==='door'?2:1)>y);
 function find(p){
  const x=Math.floor(p.x),z=Math.floor(p.z),y=Math.floor(p.y-.16+.08),key=x+','+y+','+z;if(cache.has(key))return cache.get(key);
  // Flood on one standing level; low furniture must not seal a wall or roof.
  const ceiling=(x,z)=>Math.min(...col(x,z).filter(b=>barriers.has(b.type)&&!['door','window'].includes(b.type)&&b.y>=y+1.6&&b.y<=y+8).map(b=>b.y));
  const wall=(x,z,top)=>{if(!Number.isFinite(top))return false;for(let h=y+.1;h<top;h+=.4)if(!covered(x,z,h))return false;return true;};
  if(covered(x,z,y+.25)&&covered(x,z,y+1.35)){cache.set(key,null);return null;}
  const seen=new Set([x+','+z]),queue=[[x,z]];let valid=true;
  for(let i=0;i<queue.length;i++){
   const [cx,cz]=queue[i];
   if(queue.length>225||Math.abs(cx-x)>18||Math.abs(cz-z)>18){valid=false;break;}
   const top=ceiling(cx,cz);if(!Number.isFinite(top)){valid=false;break;}
   for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=cx+dx,nz=cz+dz,k=nx+','+nz;if(!seen.has(k)&&!wall(nx,nz,top)){seen.add(k);queue.push([nx,nz]);}}
  }
  const room=valid?{id:key,level:y,cells:seen,area:seen.size}:null;
  // Cache failed starts individually: a missing roof beyond them may not belong
  // to a neighbouring enclosed room. Valid flood regions can share one result.
  if(room)for(const [cx,cz] of queue)cache.set(cx+','+y+','+cz,room);else cache.set(key,null);
  return room;
 }
 return {find,columns};
}
