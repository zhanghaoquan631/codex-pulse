import * as THREE from 'three';
import {addSpatialInstances} from './spatial-instances.mjs';
import {buildVegetation} from './street-life.mjs';
import {landClearance} from './regional-life.mjs';
import {routeSampler} from './route-sampler.mjs';
import {addUrbanArchitecture,streetFacingAngle} from './urban-architecture.mjs';
import {spatialQuery} from './spatial-query.mjs';
import {addSoftLandscape} from './landscape-planting.mjs';

export function buildUrbanEnvironment({parent,routes,places,heightAt,waterAt,buildings=[],mobile=false,reserve=()=>true}){
  const group=new THREE.Group();group.name='illustrative-urban-infill';parent.add(group);
  const anchors=places.filter(p=>p.kind==='district'),activities=places.filter(p=>p.kind==='activity'),clear=landClearance({heightAt,waterAt,buildings});
  const cells=new Map(),step=.25,occupied=new Set(),rows=[],trees=[],fields=[],coverage=new Set(),fieldCells=new Set(),gardenCandidates=[],gardens=[],gardenCells=new Set();
  const exclusions=[...activities.map(p=>({...p,r:.32})),...places.filter(p=>p.kind==='landmark'||['transport','food'].includes(p.kind)&&p.span).map(p=>({...p,r:Math.max(.30,p.span||0)}))];
  const nearbyExclusions=spatialQuery(exclusions,p=>[p.x-p.r,p.x+p.r,p.z-p.r,p.z+p.r],1);
  for(const points of routes)for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];for(let x=Math.floor((Math.min(a.x,b.x)-.15)/step);x<=Math.floor((Math.max(a.x,b.x)+.15)/step);x++)for(let z=Math.floor((Math.min(a.z,b.z)-.15)/step);z<=Math.floor((Math.max(a.z,b.z)+.15)/step);z++){
      const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push([a,b]);
    }
  }
  function offRoad(x,z,r){return (cells.get(Math.floor(x/step)+','+Math.floor(z/step))||[]).every(([a,b])=>{const dx=b.x-a.x,dz=b.z-a.z,t=THREE.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(x-a.x-t*dx,z-a.z-t*dz)>r+.05;});}
  function available(x,z,r){
    return reserve(x,z,r)&&clear(x,z,r)&&offRoad(x,z,r)&&[[-1,-1],[-1,1],[1,-1],[1,1]].every(([dx,dz])=>clear(x+dx*r,z+dz*r,.008))&&nearbyExclusions(x,z,0).every(p=>Math.hypot(x-p.x,z-p.z)>p.r);
  }
  const candidates=routes.filter(p=>p.length>1).map(points=>({points,mid:points[Math.floor(points.length/2)]}));
  // All source streets participate. A fixed route quota left whole outer-city blocks empty.
  const corridorCoverage=[];
  for(const [routeIndex,{points} ] of candidates.entries()){
    const curve=routeSampler(points),length=curve.getLength(),mid=curve.getPoint(.5);
    const urban=anchors.some(a=>Math.hypot(a.x-mid.x,a.z-mid.z)<6);
    const samples=Math.max(3,Math.ceil(length/(urban?.16:.18))),before=rows.length;
    for(let i=0;i<samples;i++){
      const t=(i+.5)/samples,p=curve.getPoint(t),d=curve.getTangent(t);for(const side of [-1,1]){
        const fx=p.x+d.z*.48*side,fz=p.z-d.x*.48*side,fkey=Math.floor(fx/.6)+','+Math.floor(fz/.6);
        if(urban&&i%6===0)for(const setback of [.70,1.15])gardenCandidates.push({x:p.x+d.z*setback*side,z:p.z-d.x*setback*side});
        if(i%3===0&&!fieldCells.has(fkey)&&anchors.every(a=>Math.hypot(a.x-fx,a.z-fz)>3.4)&&heightAt(fx,fz)<.8&&available(fx,fz,.20)){
          fieldCells.add(fkey);fields.push({x:fx,z:fz,y:heightAt(fx,fz)+.004,angle:Math.atan2(d.x,d.z)});
        }
        for(const setback of urban?[.15,.29,.43]:[.15]){
        const x=p.x+d.z*setback*side,z=p.z-d.x*setback*side,key=Math.round(x/.1)+','+Math.round(z/.1);
        if(occupied.has(key)||!available(x,z,.049))continue;occupied.add(key);coverage.add(Math.floor(x/2)+','+Math.floor(z/2));
        const n=rows.length;rows.push({x,z,y:heightAt(x,z),h:.075+n%5*.025,angle:streetFacingAngle(d,side),color:['#b5c6c5','#d6dad2','#a1bfc3','#bcbfb3'][n%4]});
        if(i%2===0&&available(x+d.x*.075,z+d.z*.075,.02))trees.push([x+d.x*.075,z+d.z*.075,heightAt(x+d.x*.075,z+d.z*.075),.085]);
        }
      }
    }
    corridorCoverage.push({route:routeIndex,center:mid.toArray(),buildings:rows.length-before});
  }
  for(const [index,anchor] of anchors.entries()){
    const nearby=routes.filter(p=>p.length>1&&Math.hypot(p[0].x-anchor.x,p[0].z-anchor.z)<2.6).slice(0,mobile?65:120);
    for(const points of nearby)for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],d=b.clone().sub(a),length=d.length();d.normalize();
      for(let t=.07;t<Math.min(length,1.8);t+=.11)for(const side of [-1,1]){
        const x=a.x+d.x*t+d.z*.14*side,z=a.z+d.z*t-d.x*.14*side,key=Math.round(x/.1)+','+Math.round(z/.1);
        if(occupied.has(key)||!available(x,z,.048))continue;occupied.add(key);
        const n=rows.length,h=.045+(n%5)*.022;rows.push({x,z,y:heightAt(x,z),h,angle:streetFacingAngle(d,side),color:['#b5c6c5','#dedbd0','#a9bfca','#b7b8b0','#91adb0'][index%5]});
        if(n%3===0&&available(x+d.x*.065,z+d.z*.065,.017))trees.push([x+d.x*.065,z+d.z*.065,heightAt(x+d.x*.065,z+d.z*.065),.055]);
      }
    }
  }
  const homeNear=spatialQuery(rows,r=>[r.x-.06,r.x+.06,r.z-.06,r.z+.06],.25);
  // Interior block planting uses curved clusters, never checkerboard filler or plants on access roads.
  for(const c of gardenCandidates){
    const key=Math.floor(c.x/1.2)+','+Math.floor(c.z/1.2);if(gardenCells.has(key))continue;
    const phase=c.x*7.13+c.z*3.61,cluster=[];
    for(let i=0;i<8;i++){
      const angle=phase+i*2.399,r=.08+Math.sqrt(i)*.075,x=c.x+Math.sin(angle)*r,z=c.z+Math.cos(angle)*r;
      if(!available(x,z,.06)||homeNear(x,z,.08).length)continue;
      cluster.push({x,y:heightAt(x,z)+.002,z,radius:.065+(i%3)*.007,turn:angle,type:i%4===0?'flowers':i%3===0?'woodland':'meadow'});
    }
    if(cluster.length<4)continue;gardenCells.add(key);gardens.push(...cluster);
    for(const p of cluster.filter((_,i)=>i===1||i===5))trees.push([p.x,p.z,p.y,.07]);
  }
  const architecture=addUrbanArchitecture(group,rows,anchors),dummy=new THREE.Object3D();
  addSoftLandscape(group,gardens,'urban-block-gardens');
  buildVegetation({parent:group,accepted:trees});
  const fieldMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({roughness:1}),fields.length),furrows=[];
  fields.forEach((f,i)=>{dummy.position.set(f.x,f.y,f.z);dummy.rotation.y=f.angle;dummy.scale.set(.32,.003,.32);dummy.updateMatrix();fieldMesh.setMatrixAt(i,dummy.matrix);fieldMesh.setColorAt(i,new THREE.Color(['#92aa72','#b7b16e','#72936d'][i%3]));for(let j=-2;j<=2;j++){const a=new THREE.Vector3(j*.052,.004,-.15).applyAxisAngle(new THREE.Vector3(0,1,0),f.angle).add(dummy.position),b=new THREE.Vector3(j*.052,.004,.15).applyAxisAngle(new THREE.Vector3(0,1,0),f.angle).add(dummy.position);furrows.push(...a.toArray(),...b.toArray());}});
  fieldMesh.computeBoundingSphere();addSpatialInstances(group,fieldMesh);group.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(furrows,3)),new THREE.LineBasicMaterial({color:'#c3ce9c'})));
  return {group,buildings:rows.length,trees:trees.length,fields:fields.length,gardens:gardenCells.size,plantings:gardens.length,corridorCells:coverage.size,corridorCoverage,architecture,illustrative:true};
}
