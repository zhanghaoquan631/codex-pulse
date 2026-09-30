import * as THREE from 'three';
import {buildTraffic} from './street-life.mjs';
import {buildWalkwayCrowd} from './walkway-crowds.mjs';
import {spatialQuery} from './spatial-query.mjs';
import {landClearance} from './regional-life.mjs';

export function planNeighborhoodPopulation({streets,plots,roadRoutes=[],heightAt,waterAt,buildings=[]}){
  const roads=streets.map(s=>({...s,points:s.points.map(p=>new THREE.Vector3(...p))}));
  const edges=[...roads,...roadRoutes.map(points=>({points,width:.08}))].flatMap(r=>r.points.slice(1).map((b,i)=>({a:r.points[i],b,width:r.width})));
  const roadNear=spatialQuery(edges,e=>[Math.min(e.a.x,e.b.x)-e.width,Math.max(e.a.x,e.b.x)+e.width,Math.min(e.a.z,e.b.z)-e.width,Math.max(e.a.z,e.b.z)+e.width],.5);
  const plotNear=spatialQuery(plots,p=>[p.x-p.size,p.x+p.size,p.z-p.size,p.z+p.size],.25);
  const land=landClearance({heightAt,waterAt,buildings}),walkways=[];
  function safe(p,own){
    if(!land(p.x,p.z,.005))return false;
    if(plotNear(p.x,p.z,.01).some(q=>q!==own&&Math.hypot(p.x-q.x,p.z-q.z)<q.size*.72+.008))return false;
    return roadNear(p.x,p.z,.1).every(({a,b,width})=>{
      const dx=b.x-a.x,dz=b.z-a.z,t=Math.min(1,Math.max(0,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
      return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t)>=width/2+.003;
    });
  }
  function add(points,owner,kind,own){
    let run=[];
    const flush=()=>{if(run.length>1&&run.slice(1).reduce((n,p,i)=>n+p.distanceTo(run[i]),0)>.035)walkways.push({points:run,owner,kind});run=[];};
    for(const p of points){if(safe(p,own))run.push(p);else flush();}flush();
  }
  // Each street gets both pavements. Crossing carriageways split a route instead of sending people into traffic.
  for(const road of roads)for(const side of [-1,1]){
    const points=road.points.map((p,i)=>{
      const a=road.points[Math.max(0,i-1)],b=road.points[Math.min(road.points.length-1,i+1)],d=b.clone().sub(a).normalize();
      const x=p.x+d.z*(road.width/2+.009)*side,z=p.z-d.x*(road.width/2+.009)*side;
      return new THREE.Vector3(x,heightAt(x,z)+.024,z);
    });add(points,road.owner,'sidewalk');
  }
  for(const plot of plots){
    if(plot.backlot){add(plot.access.map(p=>new THREE.Vector3(p[0],p[1]+.002,p[2])),plot.region,'home-access',plot);continue;}
    if(!plot.frontage)continue;
    const a=-(plot.angle||0),points=[];
    for(let i=0;i<7;i++){
      const distance=plot.size*(.68+i*.13),x=plot.x+Math.sin(a)*distance,z=plot.z+Math.cos(a)*distance;
      points.push(new THREE.Vector3(x,heightAt(x,z)+.01,z));
    }
    add(points,plot.region,'frontage',plot);
  }
  return {roads:roads.filter(r=>r.width>=.03),walkways};
}

export function buildNeighborhoodPopulation({parent,places,...options}){
  const plan=planNeighborhoodPopulation(options),group=new THREE.Group();group.name='distributed-neighborhood-life';parent.add(group);
  const traffic=buildTraffic({parent:group,routes:plan.roads,places,coverNetwork:true,localStreets:true});
  const crowd=buildWalkwayCrowd({parent:group,preparedWalkways:plan.walkways,coverEveryTrack:true,scale:.0085,laneWidth:.003});
  const byOwner={};
  for(const r of traffic.routeCoverage||[]){const key=r.owner||'unassigned';byOwner[key]??={people:0,cars:0};byOwner[key].cars+=r.cars;}
  for(const r of crowd.routeCoverage){const key=r.owner||'unassigned';byOwner[key]??={people:0,cars:0};byOwner[key].people+=r.people;}
  return {group,update(t){traffic.update(t);crowd.update(t);},snapshot:crowd.snapshot,
    diagnostics:()=>({roads:traffic.routeCoverage,walkways:crowd.routeCoverage}),
    stats:{people:crowd.count,vehicles:traffic.count,streets:traffic.routeCount,pavements:crowd.tracks,vehicleTypes:traffic.types,byOwner}
  };
}
