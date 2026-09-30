import * as THREE from 'three';
import {box,tree,sign} from './scene-miniatures.mjs';
import {batchStatic} from './static-batch.mjs';
import {insidePlace} from './place-footprints.mjs';
import {streetClearance} from './street-clearance.mjs';

export function planNatureApproaches({places,heightAt,waterAt,routes=[]}){
  const offRoad=streetClearance(routes),paths=[];
  for(const p of places.filter(p=>p.kind==='mountain'||p.id==='lighthouse')){
    const radius=p.id==='lighthouse'?1.1:.65,points=[];
    for(let i=0;i<=120;i++){
      const a=i/120*Math.PI*2,x=p.x+Math.cos(a)*radius,z=p.z+Math.sin(a)*radius*.7,y=heightAt(x,z);
      const valid=y>=0&&waterAt(x,z)===null&&[-1,1].every(s=>waterAt(x+s*.026,z)===null&&waterAt(x,z+s*.026)===null)&&offRoad(x,z,.075)&&!insidePlace({...p,span:0},x,z,.03);
      points.push(valid?[x,y+.014,z]:null);
    }
    let run=[];const keep=()=>{if(run.length>=8)paths.push({owner:p.id,name:p.id==='lighthouse'?'海岸观景步道':p.id==='western-valleys'?'山谷林径':'山岭登高步道',points:run});run=[];};
    for(const point of points){if(!point||(run.length&&Math.abs(point[1]-run.at(-1)[1])>.065)){keep();if(point)run.push(point);}else run.push(point);}keep();
  }
  return paths;
}

export function buildNatureApproaches({parent,...options}){
  const paths=planNatureApproaches(options),group=new THREE.Group();group.name='nature-contour-approaches';parent.add(group);let steps=0;
  for(const path of paths){
    for(let i=1;i<path.points.length;i++){
      const a=path.points[i-1],b=path.points[i],length=Math.hypot(b[0]-a[0],b[2]-a[2]),angle=Math.atan2(b[0]-a[0],b[2]-a[2]),rise=b[1]-a[1];
      const n=Math.max(1,Math.ceil(Math.abs(rise)/.009));steps+=n>1?n:0;
      for(let j=0;j<n;j++){const t=(j+.5)/n;const block=box(group,n>1?'#a4b3ad':'#b5c1b0',a[0]+(b[0]-a[0])*t,a[1]+rise*t-.009,a[2]+(b[2]-a[2])*t,.045,.012,length/n+.001);block.rotation.y=angle;}
      if(i%8===0){
        for(const s of [-1,1])box(group,'#708980',a[0]+Math.cos(angle)*s*.025,a[1],a[2]-Math.sin(angle)*s*.025,.004,.04,.004);
      }
      if(i%23===0){const x=a[0]+Math.cos(angle)*.065,z=a[2]-Math.sin(angle)*.065;if(options.waterAt(x,z)===null&&options.heightAt(x,z)>=0)tree(group,x,options.heightAt(x,z),z,.055,'broadleaf');}
    }
    const p=path.points[Math.floor(path.points.length/2)];sign(group,path.name,p[0],p[1]+.10,p[2],.18,.028,'#66877a');
  }
  batchStatic(group);
  return {group,stats:{paths:paths.length,steps,owners:[...new Set(paths.map(p=>p.owner))]}};
}
