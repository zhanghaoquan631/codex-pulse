const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
function clip(poly,a,b){
    const out=[];
    for(let i=0;i<poly.length;i++){
      const p=poly[i],q=poly[(i+1)%poly.length],dp=cross(a,b,p),dq=cross(a,b,q);
      if(dp>=-1e-10)out.push(p);
      if((dp<0&&dq>0)||(dp>0&&dq<0)){
        const t=dp/(dp-dq);out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);
      }
    }
    return out;
}

// Clip pavement to the same grid triangles as the terrain so slopes cannot cut through it.
export function terrainPaving(terrain, heightAt) {
  const [[x0,z0],[x1,z1]]=terrain.bounds;
  const sx=(x1-x0)/terrain.nx,sz=(z1-z0)/terrain.nz;
  return function pave(output,a,b,width,{offset=.017,endOffset=offset,side=0}={}){
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
    if(length<1e-9||width<=0)return;
    const nx=-dz/length,nz=dx/length;
    const at=(p,d)=>[p[0]+nx*d,p[1]+nz*d];
    const poly=[at(a,side-width/2),at(b,side-width/2),at(b,side+width/2),at(a,side+width/2)];
    const xs=poly.map(p=>p[0]),zs=poly.map(p=>p[1]);
    const loX=Math.max(0,Math.floor((Math.min(...xs)-x0)/sx)),hiX=Math.min(terrain.nx-1,Math.floor((Math.max(...xs)-x0)/sx));
    const loZ=Math.max(0,Math.floor((Math.min(...zs)-z0)/sz)),hiZ=Math.min(terrain.nz-1,Math.floor((Math.max(...zs)-z0)/sz));
    // A narrow diagonal road touches a strip of cells, not its entire bounding rectangle.
    for(let ix=loX;ix<=hiX;ix++){
      const x=x0+ix*sx;
      const column=clip(clip(poly,[x,1],[x,0]),[x+sx,0],[x+sx,1]);
      if(!column.length)continue;
      const columnZ=column.map(p=>p[1]);
      const first=Math.max(loZ,Math.floor((Math.min(...columnZ)-z0-1e-10)/sz));
      const last=Math.min(hiZ,Math.floor((Math.max(...columnZ)-z0+1e-10)/sz));
      for(let iz=first;iz<=last;iz++){
      const z=z0+iz*sz;
      for(const tri of [[[x,z],[x+sx,z],[x,z+sz]],[[x+sx,z],[x+sx,z+sz],[x,z+sz]]]){
        let cut=poly;
        for(let edge=0;edge<3&&cut.length;edge++)cut=clip(cut,tri[edge],tri[(edge+1)%3]);
        for(let i=1;i<cut.length-1;i++){
          if(Math.abs(cross(cut[0],cut[i],cut[i+1]))<1e-12)continue;
          for(const p of [cut[0],cut[i+1],cut[i]]){
            const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(length*length)));
            output.push(p[0],heightAt(p[0],p[1])+offset+(endOffset-offset)*t,p[1]);
          }
        }
      }
      }
    }
  };
}

export function terrainTriangle(terrain,heightAt,triangle,{offset=.002,accept=()=>true}={}) {
  const [[x0,z0],[x1,z1]]=terrain.bounds,sx=(x1-x0)/terrain.nx,sz=(z1-z0)/terrain.nz,output=[];
  const xs=triangle.map(p=>p[0]),zs=triangle.map(p=>p[1]);
  const loX=Math.max(0,Math.floor((Math.min(...xs)-x0)/sx)),hiX=Math.min(terrain.nx-1,Math.floor((Math.max(...xs)-x0)/sx));
  const loZ=Math.max(0,Math.floor((Math.min(...zs)-z0)/sz)),hiZ=Math.min(terrain.nz-1,Math.floor((Math.max(...zs)-z0)/sz));
  for(let ix=loX;ix<=hiX;ix++)for(let iz=loZ;iz<=hiZ;iz++){
    const x=x0+ix*sx,z=z0+iz*sz;
    for(const cell of [[[x,z],[x+sx,z],[x,z+sz]],[[x+sx,z],[x+sx,z+sz],[x,z+sz]]]){
      let cut=triangle;
      for(let edge=0;edge<3&&cut.length;edge++)cut=clip(cut,cell[edge],cell[(edge+1)%3]);
      for(let i=1;i<cut.length-1;i++){
        const a=cut[0],b=cut[i],c=cut[i+1],winding=cross(a,b,c);
        if(Math.abs(winding)<1e-12||![a,b,c].every(p=>accept(...p)))continue;
        for(const p of winding>0?[a,c,b]:[a,b,c])output.push(p[0],heightAt(...p)+offset,p[1]);
      }
    }
  }
  return output;
}

// Segment quads leave a wedge at turns. Rounded joints retain the mapped centerline.
export function terrainRoadJoint(terrain,heightAt,point,radius,options={}){
  if(!Number.isFinite(radius)||radius<=0)return [];
  const output=[],sectors=16;
  for(let i=0;i<sectors;i++){
    const at=angle=>[point[0]+Math.cos(angle)*radius,point[1]+Math.sin(angle)*radius];
    output.push(...terrainTriangle(terrain,heightAt,[point,at(i*Math.PI*2/sectors),at((i+1)*Math.PI*2/sectors)],options));
  }
  return output;
}
