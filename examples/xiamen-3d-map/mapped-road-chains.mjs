// Join only degree-two endpoints within the same road class and bridge level.
export function mappedRoadChains(roads){
 const nodes=new Map(),edges=[],seen=new Set();
 const node=(kind,bridge,p)=>{
  const key=`${kind}:${Number(bridge)}:${p[0].toFixed(6)},${p[1].toFixed(6)}`;
  if(!nodes.has(key))nodes.set(key,{point:p,edges:[]});
  return nodes.get(key);
 };
 for(const [kind,bridge,path] of roads)for(let i=1;i<path.length;i++){
  const a=node(kind,bridge,path[i-1]),b=node(kind,bridge,path[i]);if(a===b)continue;
  const key=kind+':'+Number(bridge)+':'+[a.point.join(','),b.point.join(',')].sort().join(';');
  if(seen.has(key))continue;seen.add(key);
  const edge={a,b,kind,bridge,visited:false};edges.push(edge);a.edges.push(edge);b.edges.push(edge);
 }
 const result=[];
 function trace(start,edge){
  const points=[start.point];let current=start;
  const {kind,bridge}=edge;
  while(edge&&!edge.visited){
   edge.visited=true;current=edge.a===current?edge.b:edge.a;points.push(current.point);
   if(current.edges.length!==2)break;
   edge=current.edges.find(e=>!e.visited);
  }
  result.push([kind,bridge,points]);
 }
 for(const n of nodes.values())if(n.edges.length!==2)for(const edge of n.edges)if(!edge.visited)trace(n,edge);
 for(const edge of edges)if(!edge.visited)trace(edge.a,edge);
 return result;
}
