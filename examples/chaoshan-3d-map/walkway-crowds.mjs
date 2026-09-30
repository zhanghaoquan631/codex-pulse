import * as THREE from 'three';
import {inCrowdView,crowdDetail,uploadVisibleInstances} from './scene-view-budget.mjs';
import {personGeometry,personOverviewGeometry} from './street-life.mjs';
import {routeSampler} from './route-sampler.mjs';
import {disc,box} from './scene-miniatures.mjs';
import {createPedestrianOccupancy} from './pedestrian-occupancy.mjs';
import {communityActors} from './community-actors.mjs';

// Keep stationary visitors beside the walking lanes, rather than in their centre.
export function settleExhibitHosts({group,actors,paths}){
  group.updateWorldMatrix(true,true);const inverse=group.matrixWorld.clone().invert(),placed=[];
  for(const {root} of actors){
    const original=root.position.clone();let nearest;
    for(const line of paths)for(let i=1;i<line.length;i++){
      const a=new THREE.Vector3(...line[i-1]),b=new THREE.Vector3(...line[i]),v=b.clone().sub(a),t=THREE.MathUtils.clamp(original.clone().sub(a).dot(v)/v.lengthSq(),0,1),q=a.clone().addScaledVector(v,t),d=q.distanceTo(original);
      if(!nearest||d<nearest.d)nearest={q,v,d};
    }
    if(!nearest||nearest.d>.05){placed.push(root.position.clone());continue;}
    const n=new THREE.Vector3(nearest.v.z,0,-nearest.v.x).normalize();let best;
    for(const side of [-1,1])for(const distance of [.071,.095,.12]){
      const q=nearest.q.clone().addScaledVector(n,side*distance);
      if(Math.abs(q.x)>.55||Math.abs(q.z)>.43||placed.some(p=>p.distanceTo(q)<.065))continue;
      let blocked=false;
      group.children.forEach(o=>{if(!o.isMesh||o.userData.sign||blocked)return;const b=new THREE.Box3().setFromObject(o).applyMatrix4(inverse);if(b.max.y<q.y+.045)return;if(q.x>b.min.x-.022&&q.x<b.max.x+.022&&q.z>b.min.z-.022&&q.z<b.max.z+.022)blocked=true;});
      if(!blocked&&(!best||q.distanceToSquared(original)<best.distanceToSquared(original)))best=q;
    }
    if(best){root.position.copy(best);disc(group,'#c4cbb7',best.x,best.y-.008,best.z,.032,.007);if(root.userData.state==='sit')box(group,'#a18c6c',best.x,best.y,best.z-.014,.04,.011,.014);}
    placed.push(root.position.clone());
  }
  return placed.map(p=>p.multiplyScalar(group.scale.x).add(group.position));
}

export function buildWalkwayCrowd({parent,preparedWalkways,population=100,obstacles=[],coverEveryTrack=false,scale=.011,laneWidth=.010}){
  const group=new THREE.Group();group.name='spaced-exhibit-pedestrians';parent.add(group);
  const tracks=preparedWalkways.map((source,index)=>{const points=source.points||source,curve=routeSampler(points);
    const bounds=new THREE.Box3().setFromPoints(points);
    return {curve,length:curve.getLength(),owner:source.owner||null,index,count:0,center:bounds.getCenter(new THREE.Vector3()),radius:bounds.getSize(new THREE.Vector3()).length()/2+.07,inView:true};
  }).filter(p=>p.length>(coverEveryTrack?.035:.10));
  if(coverEveryTrack)population=tracks.reduce((n,t)=>n+Math.min(6,Math.max(1,Math.floor(t.length/.12))),0);
  const sample=(track,phase)=>{
    const u=((phase%2)+2)%2,dir=u<1?1:-1,t=dir===1?u:2-u;
    const pos=track.curve.getPoint(THREE.MathUtils.clamp(t,.001,.999)),d=track.curve.getTangent(THREE.MathUtils.clamp(t,.001,.999));
    // Passing lanes converge only at the turnaround, which is protected by occupancy checks.
    const lane=laneWidth*Math.min(1,t*track.length/.024,(1-t)*track.length/.024)*dir;
    pos.x+=d.z*lane;pos.z-=d.x*lane;return {pos,heading:Math.atan2(d.x*dir,d.z*dir)};
  };
  const walkers=[],{add,free}=createPedestrianOccupancy();
  for(const p of obstacles)add({pos:p,radius:.023,stationary:true});
  // Stratified slots eliminate random co-located spawn points, including crossing routes.
  for(let round=0;round<200&&walkers.length<population;round++)for(const [ti,track] of tracks.entries()){
    if(walkers.length>=population)break;const slots=coverEveryTrack?Math.min(6,Math.max(1,Math.floor(track.length/.12))):Math.max(2,Math.floor(track.length/.075)*2);if(round>=slots)continue;
    const phase=(round+.5)/slots*2,{pos,heading}=sample(track,phase);if(!free(pos))continue;
    const i=walkers.length,w={track,phase,pos,heading,speed:.010+(i%5)*.0014,scale,step:i*.9,state:'walk',pauseUntil:0,nextPause:12+(i%13)*2,moved:0,lastUpdate:0,nextUpdate:(i%17)*.03};walkers.push(w);track.count++;add(w);
  }
  const bodyMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85}),limbMat=new THREE.MeshStandardMaterial({color:'#586a69'}),limbGeo=new THREE.CylinderGeometry(.085,.08,1,5);limbGeo.translate(0,-.5,0);
  if(coverEveryTrack)for(const w of walkers)communityActors.push({root:group,isInView:()=>w.track.inView,getPosition:()=>w.pos.clone().applyMatrix4(group.matrixWorld),getScale:()=>w.scale,pose:(t,state)=>{w.social={state,until:t+1};}});
  const batches=[],root=new THREE.Object3D(),limb=new THREE.Object3D(),matrix=new THREE.Matrix4();
  const outfits=['overalls','dress','explorer','beret','raincoat','student','senior','courier','office','shopkeeper'];
  for(const [k,outfit] of outfits.entries()){
    const actors=walkers.filter((_,i)=>i%outfits.length===k),body=new THREE.InstancedMesh(personGeometry(outfit,k),bodyMat,actors.length),limbs=Array.from({length:4},()=>new THREE.InstancedMesh(limbGeo,limbMat,actors.length));
    for(const m of [body,...limbs]){m.frustumCulled=false;m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(m);}batches.push({actors,body,limbs,detail:body.geometry,overview:personOverviewGeometry(outfit,k)});
  }
  let frame=0;
  function update(seconds){
    const detailed=crowdDetail(scale*2.4);
    for(const track of tracks)track.inView=inCrowdView(track.center,track.radius);
    // Rotate update priority so the same actor does not always win at a crossing.
    for(let j=0;j<walkers.length;j++){
      const w=walkers[(j+frame)%walkers.length],near=w.track.inView&&detailed;
      if(!near&&seconds<w.nextUpdate)continue;
      const dt=Math.min(near?.10:.55,Math.max(0,seconds-w.lastUpdate));w.lastUpdate=seconds;w.nextUpdate=seconds+.48+(j%7)*.009;w.moved=0;
      if(seconds>w.nextPause){w.pauseUntil=seconds+1.1;w.nextPause=seconds+18+(j%9);}
      const phase=w.phase+dt*w.speed/w.track.length,proposal=sample(w.track,phase);
      if(seconds>=w.pauseUntil&&free(proposal.pos,w)){
        w.moved=w.pos.distanceTo(proposal.pos);w.pos.copy(proposal.pos);w.phase=phase%2;add(w);
        const angle=Math.atan2(Math.sin(proposal.heading-w.heading),Math.cos(proposal.heading-w.heading));w.heading+=angle*Math.min(1,dt*10);w.state='walk';w.step+=w.moved*230;
      }else w.state=seconds<w.pauseUntil?'look':'yield';
    }
    frame++;
    for(const {body,limbs,detail,overview} of batches){body.geometry=detailed?detail:overview;for(const m of [body,...limbs])m.count=0;}
    for(const {actors,body,limbs} of batches)for(const [i,w] of actors.entries()){
      if(!w.track.inView||!inCrowdView(w.pos))continue;
      const drawIndex=body.count++;
      const moving=w.state==='walk'&&w.moved>1e-6,stride=moving?Math.sin(w.step):0;
      root.position.copy(w.pos);root.position.y+=Math.abs(stride)*w.scale*.035;root.rotation.set(0,w.heading,0);root.scale.setScalar(w.scale);root.updateMatrix();body.setMatrixAt(drawIndex,root.matrix);
      if(!detailed)continue;
      for(const m of limbs)m.count++;
      for(let k=0;k<4;k++){const arm=k>1,side=k%2?1:-1;limb.position.set(side*(arm?.47:.2),arm?1.6:.88,0);limb.scale.set(1,arm?.67:.8,1);limb.rotation.set(stride*side*(arm?.28:.44),0,0);
        if(arm&&k===3&&w.social?.until>seconds){if(w.social.state==='wave')limb.rotation.z=-2.2+Math.sin(seconds*6)*.2;else if(w.social.state==='talk')limb.rotation.x=-.65+Math.sin(seconds*3)*.15;}
        limb.updateMatrix();matrix.multiplyMatrices(root.matrix,limb.matrix);limbs[k].setMatrixAt(drawIndex,matrix);}
    }
    for(const b of batches)for(const m of [b.body,...b.limbs])uploadVisibleInstances(m);
  }
  update(0);
  return {group,update,count:walkers.length,tracks:tracks.length,places:[],coverage:{},routeCoverage:tracks.map(t=>({id:t.index,owner:t.owner,people:t.count,length:t.length,center:t.curve.getPoint(.5).toArray()})),activityTypes:['walk','look','yield'],snapshot:()=>walkers.map(w=>({position:w.pos.toArray(),state:w.state,heading:w.heading,route:w.track.index,owner:w.track.owner}))};
}
