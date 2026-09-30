import * as THREE from 'three';
import {seededRandom} from './world-layout.mjs';

// A small instanced crowd stays on its assigned mapped walking surfaces.
export function createMappedCrowd({group,paths,heightAt,valid,limit=160,seed=752,scale=.48,groundOffset=.026}){
  const rng=seededRandom(seed),people=[],clearance=.005*scale;
  const routes=paths.filter(p=>p.points.length>1).map(p=>{
    const cumulative=[0];for(let i=1;i<p.points.length;i++)cumulative.push(cumulative.at(-1)+Math.hypot(p.points[i][0]-p.points[i-1][0],p.points[i][1]-p.points[i-1][1]));
    return {...p,cumulative,length:cumulative.at(-1)};
  }).filter(p=>p.length>.025);
  const sample=(route,t,sign=1)=>{const d=t*route.length;let i=1;while(i<route.cumulative.length-1&&d>route.cumulative[i])i++;const a=route.points[i-1],b=route.points[i],u=THREE.MathUtils.clamp((d-route.cumulative[i-1])/(route.cumulative[i]-route.cumulative[i-1]||1),0,1),angle=Math.atan2(b[0]-a[0],b[1]-a[1]);const p={x:a[0]+(b[0]-a[0])*u,z:a[1]+(b[1]-a[1])*u,angle};
    // Opposing walkers use separate sides; stair flights remain single file.
    const lane=route.kind==='steps'?0:Math.min(.0015,(route.width||.007)*.2)*sign*Math.min(1,d/.012,(route.length-d)/.012);
    const next={...p,x:p.x+Math.cos(angle)*lane,z:p.z-Math.sin(angle)*lane};return valid(next.x,next.z,route)?next:p;};
  const length=routes.reduce((sum,p)=>sum+p.length,0);
  const priority=routes.filter(r=>r.kind==='pier'||r.kind==='beach');
  for(let attempt=0;attempt<limit*8&&routes.length&&people.length<limit;attempt++){
    let pick=rng()*length,route=routes.at(-1);for(const candidate of routes){pick-=candidate.length;if(pick<=0){route=candidate;break;}}
    if(attempt<priority.length*3)route=priority[attempt%priority.length];
    const progress=.04+rng()*.92,sign=rng()<.5?1:-1,p=sample(route,progress,sign);
    if(!valid(p.x,p.z,route)||people.some(o=>Math.hypot(o.x-p.x,o.z-p.z)<clearance*1.5))continue;
    people.push({...p,route,progress,sign,heading:p.angle+(sign<0?Math.PI:0),phase:rng()*6.28,stride:rng()*6.28,pause:people.length%5===0?rng()*2:0,nextPause:14+rng()*35,speed:.0015+rng()*.001,waiting:0,walking:false,activity:people.length%6,moved:0});
  }
  const sizes={torso:[.0034,.0046,.0023],head:[.0017,.0017,.0017],hair:[.0018,.001,.0018],leftArm:[.0011,.0043,.0011],rightArm:[.0011,.0043,.0011],leftLeg:[.0012,.0045,.0014],rightLeg:[.0012,.0045,.0014],bag:[.0028,.0035,.0013],hat:[.0031,.00055,.0031],camera:[.0022,.0013,.0011]};
  const batches={},object=new THREE.Object3D(),heading=new THREE.Quaternion(),local=new THREE.Quaternion(),rotation=new THREE.Quaternion(),axis=new THREE.Vector3(0,1,0),position=new THREE.Vector3(),pivot=new THREE.Vector3(),matrix=new THREE.Matrix4();
  for(const [name,size] of Object.entries(sizes)){
    const mesh=new THREE.InstancedMesh(name==='head'||name==='hair'?new THREE.SphereGeometry(1,16,10):name==='hat'?new THREE.CylinderGeometry(1,1,1,16):new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.87}),people.length);
    mesh.name='mapped-people-'+name;mesh.userData.atlasLayer='people';mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    people.forEach((p,i)=>mesh.setColorAt(i,new THREE.Color(name==='head'?['#c9906e','#dfaf85','#ad7758'][i%3]:name==='hair'?'#354040':name.includes('Leg')?'#485c66':['#5d929b','#bf735b','#d8b35a','#8f769f','#e0d8c8','#618c70'][i%6])));
    group.add(mesh);batches[name]={mesh,size:new THREE.Vector3(...size).multiplyScalar(scale)};
  }
  let seconds=0,frame=0;
  function update(dt){
    // The scene controller owns reduced-motion and pause. Explicit resume must work.
    const elapsed=Math.max(0,Math.min(dt,.1));seconds+=elapsed;
    const occupied=new Map(),cell=clearance*1.5,key=(x,z)=>Math.floor(x/cell)+','+Math.floor(z/cell);
    const add=p=>{const k=key(p.x,p.z);if(!occupied.has(k))occupied.set(k,[]);occupied.get(k).push(p);};people.forEach(add);
    for(let order=0;order<people.length;order++){
      const index=(order+frame)%people.length,p=people[index];
      p.pause-=elapsed;p.walking=false;
      if(seconds>p.nextPause){p.pause=1.3+index%3*.6;p.nextPause=seconds+23+index%17;}
      if(p.pause<=0&&elapsed>0){
        const progress=p.progress+elapsed*p.sign*p.speed/p.route.length;
        if(progress<.025||progress>.975){p.sign*=-1;p.pause=.6+index%3*.35;}
        else{
          const next=sample(p.route,progress,p.sign),gx=Math.floor(next.x/cell),gz=Math.floor(next.z/cell);let collision=false;
          for(let x=gx-1;x<=gx+1;x++)for(let z=gz-1;z<=gz+1;z++)if((occupied.get(x+','+z)||[]).some(o=>o!==p&&Math.hypot(o.x-next.x,o.z-next.z)<clearance))collision=true;
          if(!collision&&valid(next.x,next.z,p.route)){
            const bucket=occupied.get(key(p.x,p.z));bucket.splice(bucket.indexOf(p),1);const moved=Math.hypot(next.x-p.x,next.z-p.z);p.stride+=moved/(.0018*scale)*Math.PI;p.moved+=moved;Object.assign(p,next,{progress,walking:true,waiting:0});add(p);
          }else{p.waiting+=elapsed;if(p.waiting>1.7+index%3){p.sign*=-1;p.waiting=0;p.pause=.7;}}
        }
      }
      const desired=p.angle+(p.sign<0?Math.PI:0);p.heading+=Math.atan2(Math.sin(desired-p.heading),Math.cos(desired-p.heading))*Math.min(1,elapsed*9);
      heading.setFromAxisAngle(axis,p.heading);const swing=p.walking?Math.sin(p.stride)*.5:0;
      for(const [name,{mesh,size}] of Object.entries(batches)){
        const left=name.startsWith('left'),arm=name.includes('Arm'),leg=name.includes('Leg'),x=(arm?.0026:leg?.00095:0)*(left?-1:1);
        position.set(x,name==='torso'?.0074:name==='head'?.0114:name==='hair'?.0125:arm?.0073:.0025,0);
        object.rotation.set((leg?swing:arm?-swing:0)*(left?1:-1),0,0);
        if(arm&&!p.walking){if(p.activity===0)object.rotation.z=left?-1.6+Math.sin(seconds*3+p.phase)*.3:0;if(p.activity===1)object.rotation.x=-1.1;if(p.activity===2&&!left)object.rotation.x=-.5-Math.sin(seconds*2)*.15;if(p.activity===4)object.rotation.x=-.8;}
        if(arm||leg){pivot.set(x,arm?.0093:.0047,0);position.sub(pivot).applyEuler(object.rotation).add(pivot);}
        let shown=true;
        if(name==='bag'){position.set(0,.0073,-.0018);shown=index%3===0;}
        if(name==='hat'){position.set(0,.0128,0);shown=index%4===0;}
        if(name==='camera'){position.set(0,!p.walking&&p.activity===1?.0105:.0078,.002);shown=p.activity===1;}
        position.y+=p.walking?Math.abs(Math.sin(p.stride))*.00018:Math.sin(seconds*1.8+p.phase)*.00004;
        position.multiplyScalar(scale).applyQuaternion(heading);position.x+=p.x;position.z+=p.z;position.y+=heightAt(p.x,p.z,p.route)+groundOffset;
        local.setFromEuler(object.rotation);rotation.copy(heading).multiply(local);matrix.compose(position,rotation,shown?size:new THREE.Vector3(0,0,0));mesh.setMatrixAt(index,matrix);
      }
    }
    frame++;
    for(const {mesh} of Object.values(batches))mesh.instanceMatrix.needsUpdate=true;
  }
  function getState(){let overlaps=0,invalidPeople=0;people.forEach((p,i)=>{if(!valid(p.x,p.z,p.route))invalidPeople++;for(let j=i+1;j<people.length;j++)if(Math.hypot(p.x-people[j].x,p.z-people[j].z)<clearance*.8)overlaps++;});return {people:people.length,overlaps,invalidPeople,seconds,walking:people.filter(p=>p.walking).length,travelled:people.reduce((s,p)=>s+p.moved,0),activities:['walk','wave','photograph','talk','look','read'],motion:people.slice(0,8).map(p=>[p.x,p.z]),samples:people.map(p=>({x:p.x,z:p.z,walking:p.walking,kind:p.route.kind||'walk',name:p.route.name||'',travelled:p.moved}))};}
  update(0);return {update,getState};
}
