/** Shared paper-ink rendering for original, physically open interiors. */
import {groundHeight} from './landforms.mjs';
export function drawBuildingInteriors({THREE,root,level,box,stroke,colors,label,tagStructure}){
  const t=level.traversal;if(!t?.rooms?.length)return;
  const ink=colors.ink,trim=colors.roof??ink,paper=colors.paper??0xf4efdf;
  const clean={paperClean:true};
  for(const w of level.walls){
    if(!['traversal-wall','traversal-floor','traversal-roof'].includes(w.kind))continue;
    const baseY=groundHeight(level,w.x,w.z)+(w.groundOffset??w.baseY??0);
    const g=new THREE.Group();g.name=w.id;g.position.set(w.x,baseY,w.z);g.rotation.y=w.rotation||0;root.add(g);
    tagStructure?.(g,w.id,w.roomId);
    box(0,0,0,w.w,w.height,w.d,w.kind==='traversal-roof'?trim:w.kind==='traversal-floor'?colors.wood:paper,g,clean);
  }
  for(const ramp of t.ramps){
    if(!ramp.roomId)continue;
    const g=new THREE.Group();g.name=ramp.id;g.position.set(ramp.x,0,ramp.z);g.rotation.y=ramp.rotation||0;root.add(g);
    tagStructure?.(g,ramp.roomId);
    const count=ramp.steps||16,dz=ramp.d/count,dy=(ramp.toY-ramp.fromY)/count;
    for(let i=0;i<count;i++){
      const z=ramp.d/2-(i+.5)*dz,base=ramp.fromY+i*dy;
      // Thin riser + tread follows the continuous collision ramp. A diagonal
      // side stringer closes the underside without a noisy stack of tall boxes.
      box(0,base,z,ramp.w,.075,dz+.018,colors.wood,g,clean);
      box(0,base-dy,z+dz/2,ramp.w,dy,.045,paper,g,clean);
      stroke([[-ramp.w/2,base+.08,z+dz/2],[ramp.w/2,base+.08,z+dz/2]],g,false);
    }
    const a=[ramp.w/2+.03,ramp.fromY+.85,ramp.d/2],b=[ramp.w/2+.03,ramp.toY+.85,-ramp.d/2];
    stroke([a,b],g,false);
    for(let i=0;i<=count;i+=4){const f=i/count,y=ramp.fromY+(ramp.toY-ramp.fromY)*f,z=ramp.d/2-ramp.d*f;box(ramp.w/2+.03,y,z,.055,.85,.055,trim,g,clean);}
  }
  for(const r of t.rooms){
    const g=new THREE.Group();g.name=`${r.id}-facade-details`;g.position.set(r.x,0,r.z);g.rotation.y=r.rotation||0;root.add(g);
    tagStructure?.(g,r.id);
    for(const window of r.windows||[]){
      const {center:u,width:w,bottom:y,top,axis,plane}=window,h=top-y;
      const part=(a,b,wa,hb)=>axis==='z'?box(a,b,plane+(plane>0?.018:-.018),wa,hb,.07,trim,g,clean):box(plane+(plane>0?.018:-.018),b,a,.07,hb,wa,trim,g,clean);
      part(u-w/2-.035,y,.07,h);part(u+w/2+.035,y,.07,h);part(u,y-.055,w+.14,.055);part(u,top,w+.14,.07);
      // No glass/crossbars inside the aperture: bullets and vaults pass through.
      if(window.vaultable&&label)label('E 翻窗',axis==='z'?u:plane,y+.22,axis==='z'?plane+.12:u,1.45,ink,g);
    }
    // The roof remains visibly supported by the real segmented walls below it.
    box(0,r.roofY+.16,0,r.w+.32,.09,r.d+.30,trim,g,clean);
    if(label){
      label(r.label,-.12,r.upperY-.50,r.d/2+.14,Math.min(4,r.w-.4),ink,g);
      label('二楼补给 ↑',-r.w/2+1.025,r.groundY+1.0,r.d/2-.38,1.65,ink,g);
      label('II',r.w/2-.18,r.upperY+2.88,r.d/2+.12,.52,ink,g);
    }
    // Sparse story line is easier to read than cross-hatched large wall faces.
    stroke([[-r.w/2,r.upperY,r.d/2+.1],[r.w/2,r.upperY,r.d/2+.1]],g,false);
  }
}
