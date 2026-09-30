import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {addSpatialInstances} from './spatial-instances.mjs';

export const URBAN_STYLES=['terrace','arcade','apartment','warehouse','gable'];
const cache=new Map();
const wall='#e1e5dc',roof='#667f7c',trim='#bbc8be';

export function streetFacingAngle(tangent,side){
  return Math.atan2(-tangent.z*side,tangent.x*side);
}

export function urbanStyleAt(row,anchors=[]){
  const seed=Math.abs(Math.round(row.x*7919+row.z*4729));
  const urban=anchors.some(a=>Math.hypot(a.x-row.x,a.z-row.z)<2.6);
  return (urban?['arcade','apartment','terrace','arcade','apartment']:['terrace','gable','warehouse','terrace','gable'])[seed%5];
}

export function urbanPrototype(style,overview=false){
  if(!URBAN_STYLES.includes(style))throw new Error('Unknown urban architecture style');
  const key=style+':'+overview;if(cache.has(key))return cache.get(key);
  const parts=[];
  function decorate(geometry,color,facade=false){
    const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv');
    const colors=[],faces=[],c=new THREE.Color(color);
    for(let i=0;i<p.count;i++){
      colors.push(c.r,c.g,c.b);
      const vertical=Math.abs(n.getY(i))<.1;
      faces.push(uv?.getX(i)??0,p.getY(i),facade&&vertical?(n.getZ(i)>.5?1:n.getZ(i)<-.5?3:2):0);
    }
    geometry.deleteAttribute('uv');
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geometry.setAttribute('facade',new THREE.Float32BufferAttribute(faces,3));parts.push(geometry);
  }
  function box(x,y,z,w,h,d,color=wall,facade=false){
    decorate(new THREE.BoxGeometry(w,h,d).translate(x,y+h/2,z),color,facade);
  }
  function pitched(y,w,d,rise){
    const positions=[-w/2,y,-d/2,w/2,y,-d/2,0,y+rise,-d/2,-w/2,y,d/2,w/2,y,d/2,0,y+rise,d/2];
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setIndex([0,2,1,3,4,5,0,3,5,0,5,2,2,5,4,2,4,1]);
    // Separate roof normals retain the folded ridge without faceted foliage-like noise.
    const flat=g.toNonIndexed();g.dispose();flat.computeVertexNormals();
    flat.setIndex(Array.from({length:flat.getAttribute('position').count},(_,i)=>i));decorate(flat,roof);
  }
  if(style==='terrace'){
    box(0,0,0,.88,.78,.88,wall,true);
    box(-.20,.78,-.16,.46,.22,.52,wall,true);
    if(!overview){box(.24,.78,.12,.36,.025,.60,trim);box(.43,.80,.1,.035,.09,.69,trim);box(.23,.80,.43,.42,.09,.035,trim);}
  }else if(style==='arcade'){
    box(0,0,-.06,.88,.25,.68,wall,true);
    box(0,.25,0,.90,.69,.88,wall,true);
    if(!overview){for(const side of [-1,1])box(side*.37,0,.37,.07,.25,.075,trim);box(0,.94,0,.95,.035,.94,roof);}
  }else if(style==='apartment'){
    box(0,0,0,.94,.22,.94,wall,true);
    box(-.04,.22,-.03,.68,.70,.69,wall,true);
    if(!overview){box(.1,.92,-.12,.24,.08,.30,trim);for(const y of [.47,.7])box(-.04,y,.35,.73,.022,.11,trim);}
  }else if(style==='warehouse'){
    box(0,0,0,.94,.70,.88,wall,true);pitched(.70,.96,.96,.25);
    if(!overview)box(0,.47,.40,.56,.027,.16,trim);
  }else{
    box(0,0,0,.80,.72,.86,wall,true);pitched(.72,.92,.96,.25);
    if(!overview)box(-.22,.81,-.19,.09,.19,.11,trim);
  }
  const geometry=mergeGeometries(parts);parts.forEach(p=>p.dispose());geometry.computeBoundingBox();geometry.computeBoundingSphere();
  geometry.userData={style,overview};cache.set(key,geometry);return geometry;
}

export function urbanFacadeMaterial(style){
  const key='material:'+style;if(cache.has(key))return cache.get(key);
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.88});
  material.customProgramCacheKey=()=>`urban-facade-v1:${style}`;
  material.onBeforeCompile=shader=>{
    shader.uniforms.urbanStyle={value:URBAN_STYLES.indexOf(style)};
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute vec3 facade;
varying vec3 vFacade;
varying float vStoreys;`).replace('#include <begin_vertex>',`#include <begin_vertex>
vFacade=facade;
vStoreys=2.;
#ifdef USE_INSTANCING
vStoreys=clamp(floor(length(instanceMatrix[1].xyz)/.034),1.,5.);
#endif`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
uniform float urbanStyle;
varying vec3 vFacade;
varying float vStoreys;
float facadeBand(float value,float low,float high){
  float aa=max(fwidth(value),.001);
  return smoothstep(low-aa,low+aa,value)*(1.-smoothstep(high-aa,high+aa,value));
}
float facadeTileBand(float value,float low,float high){
  // Derivatives must precede fract, otherwise floor boundaries produce ghost stripes.
  float aa=max(fwidth(value),.001),cell=fract(value);
  return smoothstep(low-aa,low+aa,cell)*(1.-smoothstep(high-aa,high+aa,cell));
}`).replace('#include <color_fragment>',`#include <color_fragment>
if(vFacade.z>.5){
  bool front=vFacade.z<1.5;
  float bays=urbanStyle==2.?4.:3.;
  float row=vFacade.y*vStoreys;
  float u=vFacade.x*bays;
  float pane=facadeTileBand(u,.25,.75)*facadeTileBand(row,.29,.71);
  float frame=facadeTileBand(u,.18,.82)*facadeTileBand(row,.23,.77);
  float ground=1.-step(1.,row);
  float door=front?ground*facadeBand(vFacade.x,.40,.60)*(1.-smoothstep(.70,.74,row)):0.;
  if(urbanStyle==3.){
    frame=facadeBand(vFacade.y,.53,.65)*facadeTileBand(u,.12,.88);
    pane=frame*.84;
    door=front?facadeBand(vFacade.x,.25,.75)*(1.-smoothstep(.49,.51,vFacade.y)):0.;
  }
  diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.69,.76,.72),frame);
  diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.12,.26,.28),pane);
  float mullion=facadeTileBand(u,.485,.515)*pane;
  diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.45,.59,.57),mullion);
  vec3 doorColor=urbanStyle==3.?vec3(.31,.41,.39):vec3(.22,.30,.28);
  if(urbanStyle==3.)doorColor*=.88+.12*smoothstep(.1,.3,fract(vFacade.y*55.));
  diffuseColor.rgb=mix(diffuseColor.rgb,doorColor,door);
}`);
  };
  cache.set(key,material);return material;
}

export function addUrbanArchitecture(parent,rows,anchors=[]){
  const batches=new Map(URBAN_STYLES.map(s=>[s,[]])),dummy=new THREE.Object3D(),tint=new THREE.Color(),white=new THREE.Color('#ffffff');
  for(const row of rows)batches.get(urbanStyleAt(row,anchors)).push(row);
  const counts={};let detailTriangles=0,overviewTriangles=0;
  for(const [style,batch] of batches){
    counts[style]=batch.length;if(!batch.length)continue;
    const geometry=urbanPrototype(style),overview=urbanPrototype(style,true);
    const source=new THREE.InstancedMesh(geometry,urbanFacadeMaterial(style),batch.length);source.name='urban-infill-'+style;
    batch.forEach((r,i)=>{
      dummy.position.set(r.x,r.y,r.z);dummy.rotation.set(0,r.angle,0);dummy.scale.set(.078,r.h,.078);dummy.updateMatrix();source.setMatrixAt(i,dummy.matrix);
      source.setColorAt(i,tint.set(r.color).lerp(white,.65));
    });
    source.castShadow=true;source.receiveShadow=true;source.computeBoundingSphere();addSpatialInstances(parent,source,4,overview);
    detailTriangles+=geometry.index.count/3*batch.length;overviewTriangles+=overview.index.count/3*batch.length;
  }
  const stats={counts,total:rows.length,detailTriangles,overviewTriangles};parent.userData.architecture=stats;return stats;
}
