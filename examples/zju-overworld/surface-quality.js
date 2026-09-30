import * as THREE from './vendor/three.module.js';

// Smooth, world-scaled colour variation; no enlarged random pixel texture.
export function lawnMaterial(){
 const m=new THREE.MeshStandardMaterial({color:0x98aa7a,roughness:1});
 m.onBeforeCompile=s=>{
  s.vertexShader='varying vec3 lawnWorld;\n'+s.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nlawnWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
  s.fragmentShader='varying vec3 lawnWorld;\n'+s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
  float broad=sin(lawnWorld.x*.075+sin(lawnWorld.z*.093))*sin(lawnWorld.z*.081);
  float fine=sin(lawnWorld.x*1.9+sin(lawnWorld.z*2.3))*sin(lawnWorld.z*1.6);
  float fade=1.-smoothstep(.08,.65,max(length(dFdx(lawnWorld.xz)),length(dFdy(lawnWorld.xz))));
  diffuseColor.rgb*=1.+broad*.045+fine*.009*fade;`);
 };m.customProgramCacheKey=()=> 'smooth-lawn-v8';return m;
}
