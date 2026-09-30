import * as THREE from 'three';
import {personGeometry,outfitTypes,vehicleGeometry,vehicleTypes,treeGeometry,treeTypes} from './street-life.mjs';
import {advanceLane,laneOffset} from './traffic-rules.mjs';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const surface=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.83});
const limbMaterial=new THREE.MeshStandardMaterial({color:'#4f6674',roughness:.9});
const limbGeometry=new THREE.CylinderGeometry(.10,.09,1,5);limbGeometry.translate(0,-.5,0);

function makePerson(index,scale,parent){
  const root=new THREE.Group();root.scale.setScalar(scale);root.add(new THREE.Mesh(personGeometry(outfitTypes[index%8],index%8),surface));
  const limbs=[];
  for(const [x,y,length] of [[-.2,.88,.8],[.2,.88,.8],[-.47,1.6,.67],[.47,1.6,.67]]){
    const limb=new THREE.Mesh(limbGeometry,limbMaterial);limb.position.set(x,y,0);limb.scale.y=length;root.add(limb);limbs.push(limb);
  }
  parent.add(root);return {root,limbs,phase:index*1.618,index,clock:index*.75};
}

export function extendLandmarkLife(base,{models,heightAt,waterAt,roads=[],mobile=false}){
  const groups=[],cars=[],people=[],balls=[],coverage={};
  for(const model of models){
    const {spec}=model;if(!['guangji','lighthouse'].includes(spec.id))continue;
    model.group.updateWorldMatrix(true,false);
    const inverse=model.group.matrixWorld.clone().invert(),center=model.group.getWorldPosition(V());
    const group=new THREE.Group();group.name='street-life-'+spec.id;model.group.add(group);groups.push(group);
    const bridge=spec.id==='guangji',count=bridge?(mobile?32:56):(mobile?16:28);
    coverage[spec.id]={people:0,vehicles:0,trees:0};
    for(let i=0;i<count;i++){
      const w=makePerson(i,bridge?2.05:(.67+(i%3)*.07),group);
      w.kind=bridge?'bridge':i%2?'promenade':'approach';w.landmark=spec.id;w.side=i%2?1:-1;
      people.push(w);coverage[spec.id].people++;
    }

    // Transform nearby source-road fragments into this landmark's coordinate frame.
    // Water and distant portions are removed before animating cars or finding shore sites.
    const fragments=[];
    for(const [kind,isBridge,path] of roads){
      if(kind==='rail'||isBridge)continue;
      let run=[];
      const flush=()=>{if(run.length>1){const curve=new THREE.CurvePath();for(let i=1;i<run.length;i++)curve.add(new THREE.LineCurve3(run[i-1],run[i]));const length=curve.getLength();if(length>.025)fragments.push({curve,length,points:run});}run=[];};
      for(let i=1;i<path.length;i++){
        const a=path[i-1],b=path[i],steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.015));
        // Skip segments outside the local search box without resampling the whole map.
        const limit=bridge?.52:.50;
        if(Math.min(a[0],b[0])>center.x+limit||Math.max(a[0],b[0])<center.x-limit||Math.min(a[1],b[1])>center.z+limit||Math.max(a[1],b[1])<center.z-limit){flush();continue;}
        for(let j=0;j<steps;j++){
          const t=j/steps,x=THREE.MathUtils.lerp(a[0],b[0],t),z=THREE.MathUtils.lerp(a[1],b[1],t);
          if(Math.hypot(x-center.x,z-center.z)>limit||waterAt(x,z)!==null){flush();continue;}
          const point=V(x,heightAt(x,z)+.020,z);
          // The decorative pedestrian deck and lighthouse base are not traffic lanes.
          const local=point.clone().applyMatrix4(inverse);
          if(bridge?Math.abs(local.x)<265&&Math.abs(local.z)<15:Math.hypot(local.x,local.z)<13){flush();continue;}
          if(!run.length||point.distanceTo(run.at(-1))>.001)run.push(point);
        }
      }
      flush();
    }
    fragments.sort((a,b)=>a.curve.getPoint(.5).distanceToSquared(center)-b.curve.getPoint(.5).distanceToSquared(center));
    const routes=fragments.filter(r=>r.length>.22).slice(0,8);for(const r of routes)r.lanes=[[],[]];
    if(routes.length)for(let i=0;i<(mobile?7:14);i++){
      const vehicle=new THREE.Mesh(vehicleGeometry(vehicleTypes[i%7]),surface);vehicle.scale.setScalar((bridge?.0035:.007)/spec.scale);group.add(vehicle);
      const route=routes[i%routes.length],lane=i%2,actor={vehicle,route,inverse,landmark:spec.id,direction:lane===0?1:-1,distance:0,size:.065,speed:0,cruise:.020};
      route.lanes[lane].push(actor);cars.push(actor);coverage[spec.id].vehicles++;
    }
    for(const r of routes)for(const lane of r.lanes)lane.forEach((c,i)=>c.distance=(i+.3)*r.length/lane.length);

    const shoreSites=[];
    for(const route of routes){
      for(const t of [.2,.5,.8])for(const side of [-1,1]){
        const p=route.curve.getPoint(t),d=route.curve.getTangent(t);p.x+=d.z*.060*side;p.z-=d.x*.060*side;
        if(shoreSites.some(q=>q.distanceTo(p)<.10))continue;
        const valid=Array.from({length:12},(_,i)=>{const x=p.x+Math.sin(i*Math.PI/6)*.045,z=p.z+Math.cos(i*Math.PI/6)*.045;return waterAt(x,z)===null&&Math.abs(heightAt(x,z)-heightAt(p.x,p.z))<.018;}).every(Boolean);
        if(!valid||waterAt(p.x,p.z)!==null)continue;
        const local=p.clone().applyMatrix4(inverse);
        if(bridge?Math.abs(local.x)<265&&Math.abs(local.z)<18:Math.hypot(local.x,local.z)<14)continue;
        p.y=heightAt(p.x,p.z)+.008;shoreSites.push(p);
      }
    }
    for(const [i,p] of shoreSites.slice(0,6).entries()){
      if(i===Math.min(2,shoreSites.length-1))continue;
      const tree=new THREE.Mesh(treeGeometry(treeTypes[(i+(bridge?0:3))%6]),surface);tree.scale.setScalar((bridge?.020:.065)/spec.scale);tree.position.copy(p).applyMatrix4(inverse);group.add(tree);coverage[spec.id].trees++;
    }
    if(shoreSites.length){
      const p=shoreSites[Math.min(2,shoreSites.length-1)],localCenter=p.clone().applyMatrix4(inverse),r=.038/spec.scale;
      // A compact shore gathering, with loose ball play kept off the bridge and walkway.
      const positions=[];
      for(let i=0;i<=32;i++){const a=i/32*Math.PI*2,world=V(p.x+Math.sin(a)*.040,0,p.z+Math.cos(a)*.040);world.y=heightAt(world.x,world.z)+.010;positions.push(world.applyMatrix4(inverse));}
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(positions),new THREE.LineBasicMaterial({color:'#d5b46d',transparent:true,opacity:.65})));
      for(let i=0;i<8;i++){
        const w=makePerson(i+3,(bridge?.0042:.018)/spec.scale,group);w.kind='shore';w.landmark=spec.id;w.center=localCenter;w.radius=r;w.inverse=inverse;w.transform=model.group.matrixWorld;w.state=['wave','stretch','dance','jog','football','football','wave','stretch'][i];w.slot=i;people.push(w);coverage[spec.id].people++;
      }
      const ball=new THREE.Mesh(new THREE.IcosahedronGeometry((bridge?.003:.007)/spec.scale,1),new THREE.MeshStandardMaterial({color:'#f2d56b',roughness:.8}));group.add(ball);balls.push({ball,center:localCenter,radius:r,bridge});
    }
    group.traverse(o=>{if(o.isMesh){o.userData.landmarkId=spec.id;o.castShadow=true;o.receiveShadow=true;}});
  }
  let previous=0;
  function update(seconds){
    base.update(seconds);const dt=Math.max(0,Math.min(.1,seconds-previous));previous=seconds;
    for(const w of people){
      const cycle=(seconds+w.phase*3)%23;
      let action=w.kind==='shore'?w.state:cycle<3?'wave':cycle<5?'stretch':w.index%4===0?'jog':'walk';
      if(action==='walk'||action==='jog')w.clock+=dt*(action==='jog'?1.55:1);
      const a=w.phase+w.clock*.11;
      if(w.kind==='bridge'){
        const x=w.side*(76+(Math.sin(a)*.5+.5)*174);
        const pavilion=Math.min(...Array.from({length:6},(_,i)=>Math.abs(Math.abs(x)-(88+i*31))));
        const y=pavilion<10?9.22:8.04;
        w.root.position.set(x,y,w.index%4<2?5.7:-5.7);w.root.rotation.y=Math.cos(a)*w.side>0?Math.PI/2:-Math.PI/2;
      }else if(w.kind==='promenade'){
        w.root.position.set(Math.sin(a)*8.1,.52,Math.cos(a)*8.1);w.root.rotation.y=a+Math.PI/2;
      }else if(w.kind==='approach'){
        w.root.position.set(w.index%4<2?-2.5:2.5,.035,11+(Math.sin(a)*.5+.5)*20);w.root.rotation.y=Math.cos(a)>0?0:Math.PI;
      }else{
        const angle=w.slot*Math.PI/4+(action==='jog'?seconds*.30:0),r=w.radius*(action==='football'?.5:.85);
        w.root.position.copy(w.center).add(V(Math.sin(angle)*r,0,Math.cos(angle)*r));w.root.rotation.y=action==='jog'?angle+Math.PI/2:angle+Math.PI;
        const ground=w.root.position.clone().applyMatrix4(w.transform);ground.y=heightAt(ground.x,ground.z)+.008;w.root.position.copy(ground).applyMatrix4(w.inverse);
      }
      const moving=['walk','jog','football'].includes(action),stride=Math.sin(seconds*(action==='jog'?8:4)+w.phase);
      for(let i=0;i<4;i++){
        w.limbs[i].rotation.set(moving?stride*(i%2?-.48:.48):0,0,0);
        if(i===3&&action==='wave')w.limbs[i].rotation.z=-2.35+.30*Math.sin(seconds*6+w.phase);
        if(i>1&&action==='stretch')w.limbs[i].rotation.z=(i%2?-1:1)*(1.6+.6*Math.sin(seconds+w.phase));
        if(action==='dance'){w.limbs[i].rotation.x=stride*.55;if(i>1)w.limbs[i].rotation.z=(i%2?-1:1)*1.25;}
        if(action==='football'&&i===0)w.limbs[i].rotation.x=-Math.max(0,stride)*.95;
      }
      w.action=action;
    }
    for(const r of new Set(cars.map(c=>c.route)))for(const lane of r.lanes)advanceLane(lane,r.length,dt,seconds);
    for(const c of cars){let t=c.distance/c.route.length,dir=c.direction;if(dir<0)t=1-t;const p=c.route.curve.getPoint(t),d=c.route.curve.getTangent(t);p.x-=d.z*laneOffset*dir;p.z+=d.x*laneOffset*dir;c.vehicle.position.copy(p).applyMatrix4(c.inverse);const heading=d.clone().transformDirection(c.inverse);c.vehicle.rotation.y=Math.atan2(heading.x*dir,heading.z*dir);}
    for(const {ball,center,radius,bridge} of balls){ball.position.copy(center).add(V(Math.sin(seconds*1.4)*radius*.4,(bridge?.75:.3)+Math.abs(Math.cos(seconds*1.4))*radius*.10,Math.cos(seconds*.7)*radius*.22));ball.rotation.y=seconds;}
  }
  update(0);
  return {...base,groups:[...base.groups,...groups],people:base.people+people.length,vehicles:base.vehicles+cars.length,vehicleNodes:[...base.vehicleNodes,...cars.map(c=>c.vehicle)],coverage,update,
    snapshot:()=>people.map(w=>({landmark:w.landmark,kind:w.kind,action:w.action,position:w.root.position.toArray()}))};
}
