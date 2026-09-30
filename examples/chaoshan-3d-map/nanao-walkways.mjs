import * as THREE from 'three';
import {buildRegionalLife} from './regional-life.mjs';

// Local paths are on the model's open paving, not through houses or vehicle lanes.
const layouts={
  beach:[[[-.32,.28],[0,.34],[.32,.28]]],
  cove:[[[-.32,.28],[0,.34],[.22,.30]]],
  gate:[[[-.28,-.18],[-.28,.12],[.28,.12],[.28,-.18]]],
  lighthouse:[[[-.27,.30],[0,.33],[.27,.30]]],
  square:[[[-.34,.31],[.34,.31]]],
  courtyard:[[[-.17,.09],[.17,.09]]],
  temple:[[[-.17,.09],[.08,.09]]],
  'old-town':[[[-.17,.09],[.17,.09]], [[-.34,.38],[.34,.38]]],
  well:[[[-.28,.15],[-.16,.15],[-.16,-.12],[.16,-.12],[.16,.15],[.28,.15]]],
  forest:[[[-.62,-.28],[-.62,0],[-.56,.28]]],
  wind:[[[-.62,-.28],[-.62,0],[-.56,.28]]],
  rocks:[[[-.28,.38],[0,.40],[.28,.38]]],
  harbour:[[[-.34,-.19],[.34,-.19]], [[-.40,-.25],[-.40,.26]]],
  aquaculture:[[[-.34,-.19],[.34,-.19]]],
  bridge:[[[-1.42,-.09],[1.42,-.09]], [[1.42,.09],[-1.42,.09]]],
  pass:[[[0,-.30],[0,.30]]],
  town:[[[-.34,.075],[.34,.075]], [[.34,-.075],[-.34,-.075]]]
};

export function nanaoLocalWalkways(type){
 const lines=(layouts[type]||[]).map(line=>line.map(([x,z])=>[x,0,z]));
 if(type==='gate')lines.push([[0,0,.35],[0,0,.12]]);
 return lines;
}

export function buildNanaoWalkways({parent,models,places,heightAt}){
  const routes=[],coverage=[];
  for(const model of models){
    const p=places.find(p=>p.id===model.id),g=model.group;
    g.updateMatrix();
    const before=routes.length;
    for(const layout of layouts[model.type]||[]){
      const points=[];
      for(let i=1;i<layout.length;i++){
        const a=layout[i-1],b=layout[i],n=Math.max(2,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.025));
        for(let j=i===1?0:1;j<=n;j++){
          const t=j/n,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t,v=new THREE.Vector3(x,0,z).applyMatrix4(g.matrix);
          const natural=['forest','wind','rocks','square'].includes(model.type);
          const deck=model.type==='bridge'?.155:['harbour','aquaculture'].includes(model.type)?.046:model.type==='pass'?.07:.016;
          v.y=natural?heightAt(v.x,v.z)+.016:g.position.y+deck;
          if(model.type==='gate')for(let step=0;step<3;step++){
            if(Math.abs(x)<(.48-step*.045)/2&&Math.abs(z)<(.4-step*.035)/2)v.y=Math.max(v.y,g.position.y+(step+1)*.018+.012);
          }
          points.push(v);
        }
      }
      routes.push(points);
    }
    coverage.push({id:p.id,paths:routes.length-before});
  }
  const life=buildRegionalLife({parent,routes:[],roadRoutes:[],places:[],preparedWalkways:routes,heightAt,waterAt:()=>null,population:routes.length*10});
  life.group.name='nanao-restored-street-life';
  return {...life,coverage:coverage.map(c=>({...c,people:c.paths*10})),routes};
}
