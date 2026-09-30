import * as THREE from 'three';
import {communityActors} from './community-actors.mjs';
import {inCrowdView} from './scene-view-budget.mjs';
import {outfitTypes,personGeometry,treeGeometry,treeTypes} from './street-life.mjs';
import {spreadRoutes} from './route-distribution.mjs';
import {sidewalkOffset} from './traffic-rules.mjs';
import {buildNeighborhood} from './neighborhoods.mjs';
import {buildWalkwayCrowd} from './walkway-crowds.mjs';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const randomSource=seed=>()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
export const activityTypes=['walk','jog','wave','stretch','dance','football'];

function roadClearance(routes,minimum=.205){
  const cells=new Map(),step=.5;
  for(const points of routes)for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    for(let x=Math.floor((Math.min(a.x,b.x)-.22)/step);x<=Math.floor((Math.max(a.x,b.x)+.22)/step);x++)for(let z=Math.floor((Math.min(a.z,b.z)-.22)/step);z<=Math.floor((Math.max(a.z,b.z)+.22)/step);z++){
      const key=`${x},${z}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push([a,b]);
    }
  }
  return p=>(cells.get(`${Math.floor(p.x/step)},${Math.floor(p.z/step)}`)||[]).every(([a,b])=>{
    const dx=b.x-a.x,dz=b.z-a.z,t=THREE.MathUtils.clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
    return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz)>minimum;
  });
}

export function landClearance({heightAt,waterAt,buildings=[]}){
  const cells=new Map(),step=.5;
  for(const b of buildings){const key=`${Math.floor(b[0]/step)},${Math.floor(b[1]/step)}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(b);}
  return (x,z,r=.012)=>{
    if(waterAt(x,z)!==null)return false;
    const h=heightAt(x,z);
    if(h<0||Math.abs(heightAt(x+r,z)-h)>.06||Math.abs(heightAt(x,z+r)-h)>.06)return false;
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)for(const b of cells.get(`${Math.floor(x/step)+dx},${Math.floor(z/step)+dz}`)||[]){
      const radius=Math.hypot(b[2],b[3])*.5;
      if(Math.hypot(x-b[0],z-b[1])<radius+r)return false;
    }
    return true;
  };
}

function sampleTrack(points,heightAt,clear,prepared=false){
  const path=new THREE.CurvePath();for(let i=1;i<points.length;i++)path.add(new THREE.LineCurve3(points[i-1],points[i]));
  const length=path.getLength();if(length<.10)return null;
  let run=[],best=[];
  const n=Math.min(140,Math.max(8,Math.ceil(length/.025)));
  for(let i=0;i<=n;i++){
    const t=i/n,p=path.getPoint(t),d=path.getTangent(t);
    if(!prepared){p.x+=d.z*sidewalkOffset;p.z-=d.x*sidewalkOffset;p.y=heightAt(p.x,p.z)+.026;}
    if(clear(p.x,p.z)){run.push(p);}else {if(run.length>best.length)best=run;run=[];}
  }
  if(run.length>best.length)best=run;
  if(best.length<5)return null;
  const walk=new THREE.CurvePath();for(let i=1;i<best.length;i++)walk.add(new THREE.LineCurve3(best[i-1],best[i]));
  const total=walk.getLength();if(total<.075)return null;
  const samples=Array.from({length:65},(_,i)=>walk.getPoint(i/64));
  return {samples,length:total,mid:samples[32],links:[[],[]]};
}

export function buildRegionalLife({parent,routes,roadRoutes=routes,places,heightAt,waterAt,buildings=[],toLonLat,mobile=false,population,preparedWalkways,coverNetwork=false}){
  const group=new THREE.Group();group.name='regional-people';parent.add(group);
  const random=randomSource(98431),clear=landClearance({heightAt,waterAt,buildings}),offRoad=roadClearance(roadRoutes);
  const candidates=(preparedWalkways??routes).filter(p=>p.length>1).map(points=>({points,mid:points[Math.floor(points.length/2)]}));
  const selected=coverNetwork?candidates:[...new Set(spreadRoutes(candidates,places,population?population*2:mobile?700:1300))];
  const outsideTraffic=roadClearance(roadRoutes,.049);
  // Prepared walkways already follow an explicit model deck, including above-water piers.
  const tracks=(preparedWalkways?candidates:selected).map(r=>sampleTrack(r.points,heightAt,preparedWalkways?()=>true:(x,z)=>clear(x,z)&&outsideTraffic({x,z}),!!preparedWalkways)).filter(Boolean);
  const paving=[],curbs=[];
  for(const track of tracks)for(let i=1;i<track.samples.length;i++){
    const a=track.samples[i-1],b=track.samples[i],d=b.clone().sub(a).normalize(),n=V(d.z,0,-d.x).multiplyScalar(.011);
    const corners=[a.clone().add(n),a.clone().sub(n),b.clone().add(n),b.clone().sub(n)];
    for(const j of [0,1,2,1,3,2])paving.push(...corners[j].toArray());
    for(const side of [-1,1]){const p=a.clone().addScaledVector(n,side),q=b.clone().addScaledVector(n,side);p.y+=.002;q.y+=.002;curbs.push(...p.toArray(),...q.toArray());}
  }
  const sidewalk=new THREE.BufferGeometry();sidewalk.setAttribute('position',new THREE.Float32BufferAttribute(paving,3));sidewalk.computeVertexNormals();group.add(new THREE.Mesh(sidewalk,new THREE.MeshStandardMaterial({color:'#b6c3c6',side:THREE.DoubleSide,roughness:1})));
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(curbs,3)),new THREE.LineBasicMaterial({color:'#eef0e9'})));
  const anchors=places.filter(p=>p.kind==='district'),coverage={};
  for(const p of anchors)coverage[p.name]={people:0,activity:false};
  const nearest=p=>anchors.reduce((best,a)=>!best||Math.hypot(a.x-p.x,a.z-p.z)<Math.hypot(best.x-p.x,best.z-p.z)?a:best,null);
  // A small endpoint graph allows walkers to choose another sidewalk at junctions.
  const endpoints=new Map(),key=p=>`${Math.round(p.x/.06)},${Math.round(p.z/.06)}`;
  for(const t of tracks)for(const end of [0,1]){const k=key(t.samples[end?64:0]);if(!endpoints.has(k))endpoints.set(k,[]);endpoints.get(k).push({track:t,end});}
  for(const t of tracks)for(const end of [0,1])t.links[end]=(endpoints.get(key(t.samples[end?64:0]))||[]).filter(v=>v.track!==t&&v.track.samples[v.end?64:0].distanceTo(t.samples[end?64:0])<.006);
  const walkers=[],zones=[],count=population??(mobile?384:768);
  const assigned=coverNetwork?[]:preparedWalkways&&tracks.length?Array.from({length:count},(_,i)=>tracks[i%tracks.length]):spreadRoutes(tracks,places,count);
  const networkCrowd=coverNetwork?buildWalkwayCrowd({parent:group,preparedWalkways:tracks.map(t=>({points:t.samples,owner:nearest(t.mid)?.name})),coverEveryTrack:true,scale:.011}):null;
  for(const r of networkCrowd?.routeCoverage||[])if(coverage[r.owner])coverage[r.owner].people+=r.people;
  for(const [i,track] of assigned.entries()){
    const region=nearest(track.mid);if(region)coverage[region.name].people++;
    walkers.push({track,t:random(),dir:i%2?1:-1,position:V(),heading:0,state:i%5===0?'wave':i%5===1?'jog':'walk',until:2+random()*15,phase:random()*6.28,scale:.016+(i%3)*.002,region:region?.name});
  }
  for(const anchor of anchors){
    const nearby=candidates.slice().sort((a,b)=>Math.hypot(a.mid.x-anchor.x,a.mid.z-anchor.z)-Math.hypot(b.mid.x-anchor.x,b.mid.z-anchor.z)).slice(0,120);
    let center;
    outer:for(const r of nearby)for(const offset of [.24,-.24,.42,-.42,.65,-.65]){
      const i=Math.max(1,Math.floor(r.points.length/2)),a=r.points[i-1],b=r.points[i],d=b.clone().sub(a).normalize(),p=b.clone();p.x+=d.z*offset;p.z-=d.x*offset;
      if(Math.hypot(p.x-anchor.x,p.z-anchor.z)>1.5)continue;
      if(!clear(p.x,p.z,.19)||!offRoad(p))continue;
      if(!Array.from({length:12},(_,j)=>clear(p.x+Math.sin(j*Math.PI/6)*.19,p.z+Math.cos(j*Math.PI/6)*.19,.025)).every(Boolean))continue;
      center=p;break outer;
    }
    if(!center)continue;
    center.y=heightAt(center.x,center.z)+.007;
    const neighborhood=buildNeighborhood({parent:group,center,index:anchors.indexOf(anchor),heightAt});
    const zone={center,neighborhood,region:anchor.name,phase:random()*6.28,ball:null};zones.push(zone);coverage[anchor.name].activity=true;coverage[anchor.name].people++;
    for(let i=0;i<8;i++){walkers.push({zone,slot:i,position:V(),heading:0,state:i<4?(neighborhood.field?'football':neighborhood.theme.activity==='dance'?'dance':'wave'):i===4?'wave':i===5?'stretch':i===6?'dance':'jog',phase:random()*6.28,scale:.012,region:anchor.name});coverage[anchor.name].people++;}
    if(neighborhood.field){
    const ball=new THREE.Mesh(new THREE.IcosahedronGeometry(.011,1),new THREE.MeshStandardMaterial({color:'#f7df66',roughness:.8}));zone.ball=ball;group.add(ball);
    const geo=new THREE.BufferGeometry().setFromPoints([V(-.13,0,-.10),V(.13,0,-.10),V(.13,0,.10),V(-.13,0,.10),V(-.13,0,-.10)]);
    const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color:'#f7efd7',transparent:true,opacity:.65}));line.position.copy(center);group.add(line);
    const turf=new THREE.PlaneGeometry(.36,.36,8,8);turf.rotateX(-Math.PI/2);
    const vertices=turf.attributes.position;for(let i=0;i<vertices.count;i++)vertices.setY(i,heightAt(center.x+vertices.getX(i),center.z+vertices.getZ(i))-center.y+.004);turf.computeVertexNormals();
    const field=new THREE.Mesh(turf,new THREE.MeshStandardMaterial({color:'#7b9e6a',roughness:1}));field.position.copy(center);group.add(field);
    for(const side of [-1,1]){
      const goalGeo=new THREE.BufferGeometry().setFromPoints([V(side*.13,0,-.035),V(side*.13,.035,-.035),V(side*.13,.035,.035),V(side*.13,0,.035)]);
      const goal=new THREE.Line(goalGeo,new THREE.LineBasicMaterial({color:'#f6f7ee'}));goal.position.copy(center);group.add(goal);
      const tree=new THREE.Mesh(treeGeometry(treeTypes[(zones.length+(side>0?1:3))%6]),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85}));
      tree.scale.setScalar(.05);tree.position.set(center.x+side*.17,heightAt(center.x+side*.17,center.z+.16),center.z+.16);group.add(tree);
    }
    }
    const ll=toLonLat?toLonLat(center.x,center.z):[center.x,center.z];
    zone.place={id:'life-'+anchor.en,name:anchor.name+' · 街头生活',en:anchor.en+' / Street Life',kind:'activity',x:center.x,z:center.z,ll,description:neighborhood.theme.title+' · '+neighborhood.theme.shops.join(' / ')+'。商铺和品牌为场景示意，非真实门店定位。',zoom:140,top:.06,offset:[1,1.3,1.5],major:false,pin:true};
  }
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85}),limbMaterial=new THREE.MeshStandardMaterial({color:'#415d78',roughness:.85});
  const limbGeometry=new THREE.CylinderGeometry(.095,.085,1,5);limbGeometry.translate(0,-.5,0);
  const batches=[],root=new THREE.Object3D(),local=new THREE.Object3D(),matrix=new THREE.Matrix4();
  for(const w of walkers)communityActors.push({root:group,getPosition:()=>w.position.clone().applyMatrix4(group.matrixWorld),getScale:()=>w.scale,pose:(t,state)=>{w.social={state,until:t+1};}});
  for(let k=0;k<8;k++){
    const actors=walkers.filter((_,i)=>i%8===k),body=new THREE.InstancedMesh(personGeometry(outfitTypes[k],k),material,actors.length);
    const limbs=Array.from({length:4},()=>new THREE.InstancedMesh(limbGeometry,limbMaterial,actors.length));
    for(const mesh of [body,...limbs]){mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(mesh);}
    batches.push({actors,body,limbs});
  }
  let previous=0;
  function update(seconds){
    networkCrowd?.update(seconds);
    const dt=Math.min(.10,Math.max(0,seconds-previous));previous=seconds;
    for(const {body,limbs} of batches)for(const m of [body,...limbs])m.count=0;
    for(const {actors,body,limbs} of batches)for(let i=0;i<actors.length;i++){
      const w=actors[i];
      if(w.zone){
        const {center,phase}=w.zone,a=seconds*.5+phase;
        if(!w.zone.neighborhood.field){
          const angle=w.slot*Math.PI/4+(w.state==='jog'?seconds*.18:0);w.position.set(center.x+Math.sin(angle)*.140,center.y,center.z+.075+Math.cos(angle)*.056);w.heading=angle+Math.PI/2;
        }
        else if(w.slot<4){const side=w.slot%2?1:-1;w.position.set(center.x+side*(.075+.012*Math.sin(a+w.slot)),center.y,center.z+(w.slot<2?-.065:.065)+.022*Math.sin(a*.7+w.slot));w.heading=side>0?-Math.PI/2:Math.PI/2;}
        else {const angle=w.slot*1.3+(w.state==='jog'?seconds*.38:0);w.position.set(center.x+Math.sin(angle)*.15,center.y,center.z+.135+Math.cos(angle)*.02);w.heading=w.state==='jog'?angle+Math.PI/2:angle+Math.PI;}
        w.position.y=heightAt(w.position.x,w.position.z)+.007;
      }else{
        if(seconds>=w.until){w.state=['walk','walk','jog','wave','stretch','dance'][Math.floor(random()*6)];w.until=seconds+4+random()*14;}
        if(w.state==='walk'||w.state==='jog')w.t+=dt*(w.state==='jog'?.022:.011)/w.track.length*w.dir;
        if(w.t>1||w.t<0){const end=w.t>1?1:0,links=w.track.links[end],next=links[Math.floor(random()*links.length)];if(next){w.track=next.track;w.t=next.end;w.dir=next.end?-1:1;}else {w.t=THREE.MathUtils.clamp(w.t,0,1);w.dir*=-1;}}
        const u=THREE.MathUtils.clamp(w.t,0,1)*64,j=Math.min(63,Math.floor(u)),a=w.track.samples[j],b=w.track.samples[j+1];w.position.copy(a).lerp(b,u-j);w.heading=Math.atan2((b.x-a.x)*w.dir,(b.z-a.z)*w.dir);
      }
      const moving=['walk','jog','football'].includes(w.state),stride=Math.sin(seconds*(w.state==='jog'?9:5)+w.phase),dancing=w.state==='dance';
      if(!inCrowdView(w.position))continue;
      const drawIndex=body.count++;for(const m of limbs)m.count++;
      root.position.copy(w.position);root.position.y+=(moving?Math.abs(stride)*.055:dancing?.12*Math.abs(stride):0)*w.scale;root.rotation.set(0,w.heading+(dancing?Math.sin(seconds+w.phase)*.65:0),0);root.scale.setScalar(w.scale);root.updateMatrix();body.setMatrixAt(drawIndex,root.matrix);
      for(let l=0;l<4;l++){
        const arm=l>1,side=l%2?1:-1;local.position.set(side*(arm?.47:.2),arm?1.6:.88,0);local.scale.set(1,arm?.67:.8,1);local.rotation.set(moving?stride*side*.55:0,0,0);
        if(arm&&(w.state==='wave'||w.social?.until>seconds&&w.social.state==='wave')&&l===3)local.rotation.set(0,0,-2.35+Math.sin(seconds*7+w.phase)*.32);
        if(arm&&w.social?.until>seconds&&w.social.state==='talk')local.rotation.x=-.6+Math.sin(seconds*2+w.phase)*.2;
        if(arm&&w.state==='stretch')local.rotation.z=-side*(1.6+.8*Math.sin(seconds*.6+w.phase));
        if(arm&&dancing){local.rotation.z=-side*(1.1+.4*stride);local.rotation.x=Math.cos(seconds*3+w.phase);}
        if(!arm&&w.state==='football'&&l===0)local.rotation.x=-Math.max(0,Math.sin(seconds*2+w.phase))*1.15;
        local.updateMatrix();matrix.multiplyMatrices(root.matrix,local.matrix);limbs[l].setMatrixAt(drawIndex,matrix);
      }
    }
    for(const batch of batches)for(const mesh of [batch.body,...batch.limbs])mesh.instanceMatrix.needsUpdate=true;
    for(const z of zones){z.neighborhood.update(seconds);if(!z.ball)continue;const t=seconds*1.4+z.phase;z.ball.position.set(z.center.x+Math.sin(t)*.073,z.center.y+.011+Math.abs(Math.cos(t))*.024,z.center.z+Math.sin(t*.5)*.052);z.ball.rotation.set(t,t*.7,0);}
  }
  update(0);
  return {group,update,count:walkers.length+zones.length+(networkCrowd?.count||0),coverage,activityTypes,routeCoverage:networkCrowd?.routeCoverage,places:zones.map(z=>z.place),tracks:tracks.length,snapshot:()=>[...walkers.map(w=>({position:w.position.toArray(),state:w.state,region:w.region})),...(networkCrowd?.snapshot()||[])]};
}
