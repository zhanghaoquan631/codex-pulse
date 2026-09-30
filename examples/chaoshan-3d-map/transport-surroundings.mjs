import * as THREE from 'three';
import {box,sign,tree,vehicle} from './scene-miniatures.mjs';
import {batchStatic} from './static-batch.mjs';
import {serviceBuilding} from './service-buildings.mjs';
import {services,addServiceSigns} from './neighborhood-services.mjs';

function bench(g,x,z){box(g,'#b99875',x,.047,z,.09,.012,.038);box(g,'#698c88',x,.068,z-.018,.09,.03,.006);for(const dx of [-.033,.033])box(g,'#546b70',x+dx,.023,z,.006,.025,.026);}
function garden(g,x,z,w,d){
  box(g,'#a5b996',x,.018,z,w,.012,d);
  box(g,'#719977',x,.031,z,w*.8,.012,d*.8);
  for(const side of [-1,1]){box(g,'#d4ddd1',x+side*w*.47,.030,z,.018,.023,d);box(g,'#d4ddd1',x,.030,z+side*d*.47,w,.023,.018);}
  for(let i=0;i<4;i++)box(g,i%2?'#d3b177':'#c58f8f',x+(i%2-.5)*w*.35,.054,z+(Math.floor(i/2)-.5)*d*.35,.023,.012,.023);
}
export function buildAirportSurroundings(airport){
  const g=new THREE.Group();g.name='airport-landside-surroundings';airport.add(g);
  // All facilities remain landside, beyond the existing pickup lanes and apron.
  box(g,'#b3c8bb',2.65,.002,0,.92,.024,2.85);
  box(g,'#cad5ca',2.64,.027,0,.86,.009,.16);
  for(const z of [-1.38,1.38])box(g,'#c4d0cc',2.28,.015,z,1.75,.018,.16);
  for(const z of [-1.65,1.65]){
    box(g,'#bacbc4',1.67,.012,z,1.08,.022,.42);
    garden(g,1.56,z,.56,.28);bench(g,1.94,z+.07);
    tree(g,1.9,.035,z-.09,.12,'palm');
  }
  for(const z of [-.99,-.61,.57,.98]){
    garden(g,2.39,z,.26,.27);bench(g,2.6,z);
    tree(g,2.36,.04,z,.09,'umbrella');
  }
  box(g,'#748d91',2.88,.028,-.65,.33,.012,1.18);
  for(let i=0;i<7;i++){
    const z=-1.16+i*.17;
    box(g,'#e2e7d8',2.86,.043,z,.24,.002,.004);
    if(i<6&&i!==2){const car=vehicle(g,['sedan','suv','van','taxi'][i%4],.024);car.position.set(2.86,.046,z+.08);car.rotation.y=Math.PI/2;}
  }
  sign(g,'P · 停车区',2.88,.15,-1.25,.23,.04);
  for(let i=0;i<3;i++){
    const z=.30+i*.29,local=new THREE.Group();local.position.set(2.86,.030,z);local.rotation.y=-Math.PI/2;g.add(local);
    const service=services.find(s=>s[0]===['coffee','supermarket','kfc'][i]),program=serviceBuilding(service,{size:.20,height:.15,variant:i,low:true});
    const shapes={box:new THREE.BoxGeometry(1,1,1),sphere:new THREE.SphereGeometry(.5,8,6),cylinder:new THREE.CylinderGeometry(.5,.5,1,10)};
    for(const r of program.parts){const m=new THREE.Mesh(shapes[r.shape],new THREE.MeshStandardMaterial({color:r.color,roughness:.9}));m.position.set(r.x,r.y,r.z);m.scale.set(r.w,r.h,r.d);local.add(m);}
    addServiceSigns(local,[{...program.sign,angle:0,service}]);tree(g,3.04,.035,z,.09,'palm');
  }
  sign(g,'机场前广场',2.48,.17,1.24,.32,.04);
  // Crosswalk continuation meets the existing terminal crossing at z=.79.
  box(g,'#ccd8d1',2.34,.028,.79,.38,.008,.1);
  g.traverse(o=>{if(o.userData.sign&&o.parent===g)o.rotation.y=Math.PI/2;});batchStatic(g);return g;
}

export function buildStationSurroundings(station,index=0){
  const g=new THREE.Group();g.name='station-forecourt';station.add(g);
  box(g,'#b8cabe',.99,-.006,0,.69,.022,2.25);
  box(g,'#ced8d0',.78,.02,0,.18,.007,2.14);
  for(const z of [-.95,-.52,0,.52,.95]){
    box(g,'#ced8d0',1.0,.02,z,.6,.007,.08);
    if(Math.abs(z)>.1){garden(g,1.12,z+.10,.25,.18);bench(g,.92,z-.06);tree(g,1.18,.05,z+.1,.07,index%2?'palm':'umbrella');}
  }
  box(g,'#63858a',1.2,.03,-1.03,.19,.13,.16);box(g,'#d5ded2',1.2,.16,-1.03,.22,.017,.2);
  sign(g,index?'便民服务':'车站服务',1.2,.18,-.93,.19,.033);
  for(let i=0;i<5;i++){const z=.72+i*.05;box(g,'#58797d',1.19,.028,z,.006,.04,.03);box(g,'#698e8f',1.17,.055,z,.045,.004,.006);}
  g.traverse(o=>{if(o.userData.sign)o.rotation.y=Math.PI/2;});batchStatic(g);return g;
}
