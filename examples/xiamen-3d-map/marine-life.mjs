import * as THREE from 'three';
import {seededRandom} from './world-layout.mjs';

// Analytic, derivative-filtered waves stay crisp without enlarging a bitmap tile.
export function animateWater(material){
  const clock={value:0};
  material.onBeforeCompile=shader=>{
    shader.uniforms.waterSeconds=clock;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 atlasWaterPosition;').replace('#include <begin_vertex>','#include <begin_vertex>\natlasWaterPosition=(modelMatrix*vec4(position,1.0)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      uniform float waterSeconds;
      varying vec3 atlasWaterPosition;
      float ripple(vec2 p,vec2 direction,float frequency,float speed){
        float phase=dot(p,direction)*frequency-waterSeconds*speed;
        return sin(phase)*exp(-.65*length(fwidth(p))*frequency);
      }`)
      .replace('#include <color_fragment>',`#include <color_fragment>
        vec2 wp=atlasWaterPosition.xz;
        float a=ripple(wp+vec2(sin(wp.y*37.0)*.009,0.0),vec2(.8,.6),120.0,1.6);
        float b=ripple(wp,vec2(-.4,.92),220.0,2.2);
        float swell=ripple(wp,vec2(.6,.8),25.0,.5);
        float glint=smoothstep(.55,.95,a*.85+b*.15);
        diffuseColor.rgb*=.98+swell*.035+a*.045;
        diffuseColor.rgb+=vec3(.06,.10,.10)*glint*.65;`)
      .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        vec3 rippleNormal=normalize(vec3(a*.016,1.0,b*.016));
        normal=normalize(mix(normal,mat3(viewMatrix)*rippleNormal,.4));`);
  };
  material.customProgramCacheKey=()=> 'xiamen-filtered-water-v2';material.needsUpdate=true;
  return {update(dt){clock.value+=dt;},getState:()=>({seconds:clock.value,method:'continuous-filtered-waves'})};
}

export function createMarineLife({scene,toWorld,waterAt}){
  const group=new THREE.Group();group.name='厦门湾帆船与客轮';group.userData.atlasLayer='boats';scene.add(group);
  const rng=seededRandom(97024),boats=[],materials=new Map(),geometries=new Map();
  const material=color=>{if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.55,side:THREE.DoubleSide}));return materials.get(color);};
  const box=new THREE.BoxGeometry(1,1,1),cylinder=new THREE.CylinderGeometry(1,1,1,12);
  function piece(parent,geo,color,position,scale){const mesh=new THREE.Mesh(geo,material(color));mesh.position.set(...position);mesh.scale.set(...scale);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
  function hull(){
    if(geometries.has('hull'))return geometries.get('hull');
    const shape=new THREE.Shape();shape.moveTo(-.48,-.18);shape.quadraticCurveTo(.25,-.29,.62,0);shape.quadraticCurveTo(.25,.29,-.48,.18);shape.closePath();
    const geo=new THREE.ExtrudeGeometry(shape,{depth:.11,bevelEnabled:true,bevelThickness:.03,bevelSize:.025,bevelSegments:3,steps:1,curveSegments:12});geo.rotateX(-Math.PI/2);geometries.set('hull',geo);return geo;
  }
  function makeBoat(kind,index){
    const boat=new THREE.Group(),length=kind==='ferry'?.050:kind==='sail'?.025:.021;
    piece(boat,hull(),['#f1eee0','#247f91','#a75740'][index%3],[0,.0007,0],[length,length*.5,length]);
    piece(boat,box,'#b49d77',[-length*.06,.0035,0],[length*.82,.001,length*.34]);
    const sails=[];
    if(kind==='sail'){
      piece(boat,cylinder,'#b9bcb1',[0,.016,0],[.00045,.030,.00045]);
      for(const side of [-1,1]){
        const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.Float32BufferAttribute([0,.029,0,side*.012,.007,.001,0,.006,0],3));geom.computeVertexNormals();
        const sail=piece(boat,geom,side===1?'#f5e9c9':'#e2b77c',[0,0,0],[1,1,1]);sails.push(sail);
      }
      piece(boat,box,'#f0eee2',[-.004,.006,0],[.007,.004,.006]);
    }else{
      piece(boat,box,'#efeee4',[-length*.06,.006,0],[length*.55,.006,length*.26]);
      piece(boat,box,'#286077',[-length*.015,.007,0],[length*.50,.0022,length*.27]);
      piece(boat,box,kind==='ferry'?'#da7157':'#658578',[-length*.06,.0095,0],[length*.61,.0013,length*.30]);
      if(kind==='ferry'){
        for(let j=0;j<7;j++)for(const side of [-1,1])piece(boat,box,'#e5e4d1',[-length*.28+j*length*.075,.007,side*length*.139],[.0007,.0028,.0005]);
        for(const side of [-1,1])piece(boat,box,'#e39451',[-.017,.006,side*.006],[.006,.002,.0014]);
      }else piece(boat,cylinder,'#8e6f45',[-.004,.015,0],[.0003,.020,.0003]);
    }
    const wakeGeometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-length*.4,0,0),new THREE.Vector3(-length*2.4,0,length*.5),new THREE.Vector3(-length*.7,0,0),new THREE.Vector3(-length*2.4,0,-length*.5)]);
    const wake=new THREE.Line(wakeGeometry,new THREE.LineBasicMaterial({color:'#c7e0d9',transparent:true,opacity:.45}));wake.position.y=.0003;boat.add(wake);
    group.add(boat);return {boat,sails,wake,length};
  }
  const areas=[{name:'鼓浪屿东侧航道',ll:[118.078,24.454],radius:.42,count:7},{name:'鼓浪屿西侧海面',ll:[118.049,24.450],radius:.3,count:4},{name:'鼓浪屿南侧海面',ll:[118.061,24.434],radius:.45,count:5},{name:'鹭江北段',ll:[118.065,24.471],radius:.45,count:4},{name:'演武海面',ll:[118.092,24.429],radius:.3,count:3},{name:'环岛路外海',ll:[118.146,24.421],radius:.5,count:4},{name:'海沧湾外海',ll:[118.054,24.479],radius:.5,count:3}];
  for(const area of areas){const [cx,cz]=toWorld(...area.ll);let made=0;
    for(let attempt=0;attempt<120&&made<area.count;attempt++){
      const x=cx+(rng()-.5)*area.radius*2,z=cz+(rng()-.5)*area.radius*2,rx=.035+rng()*.065,rz=.025+rng()*.04;
      // Full hull clearance, not just endpoints, protects beaches and island channels.
      const safe=Array.from({length:96},(_,i)=>i/96*Math.PI*2).every(a=>[-.035,0,.035].every(dx=>[-.035,0,.035].every(dz=>{const h=waterAt(x+Math.cos(a)*rx+dx,z+Math.sin(a)*rz+dz);return h!==null&&Math.abs(h-.012)<.002;})));
      if(!safe||boats.some(b=>Math.hypot(b.x-x,b.z-z)<rx+b.rx+.035))continue;
      const kind=made%3===0?'ferry':made%3===1?'sail':'fishing',model=makeBoat(kind,boats.length);
      boats.push({...model,x,z,rx,rz,kind,area:area.name,phase:rng()*Math.PI*2,speed:.0028+rng()*.0015,angle:0});made++;
    }
  }
  let seconds=0;
  function update(dt){seconds+=dt;for(const b of boats){const a=b.phase+seconds*b.speed/Math.max(b.rx,b.rz);b.boat.position.set(b.x+Math.cos(a)*b.rx,.012+Math.sin(seconds*1.5+b.phase)*.0004,b.z+Math.sin(a)*b.rz);b.boat.rotation.set(Math.sin(seconds*.9+b.phase)*.016,-Math.atan2(Math.cos(a)*b.rz,-Math.sin(a)*b.rx),Math.sin(seconds*1.2+b.phase)*.02);b.wake.material.opacity=.32+Math.sin(seconds*2+b.phase)*.06;for(const sail of b.sails)sail.rotation.y=Math.sin(seconds*.8+b.phase)*.05;}}
  update(0);
  return {update,getState:()=>({seconds,boats:boats.length,sailboats:boats.filter(b=>b.kind==='sail').length,ferries:boats.filter(b=>b.kind==='ferry').length,fishingBoats:boats.filter(b=>b.kind==='fishing').length,invalidBoats:boats.filter(b=>waterAt(b.boat.position.x,b.boat.position.z)===null).length,motion:boats.map(b=>({kind:b.kind,area:b.area,position:b.boat.position.toArray()})),routes:'illustrative-water-only-loops'})};
}
