import * as THREE from 'three';
import {createPhotographicSky} from './photographic-sky.mjs';
import {createSolarClock,sampleSolarLight,applyRenderQuality} from './solar-lighting.mjs';
import {createNightSky} from './night-sky.mjs';
import {createSceneTools} from './scene-tools.mjs';
export {solarPosition} from './solar-lighting.mjs';

export function createLivingSky({scene,camera,sun,hemisphere,renderer,materials,floor,nightGroup,starField,landmarkMaterials,localLandmarks,regionalEnvironment,setPeriod,reducedMotion=false}){
 if(!camera.parent)scene.add(camera);
 const photograph=createPhotographicSky(camera),stars=createNightSky(camera),clockModel=createSolarClock({auto:!reducedMotion});
 let showClouds=true,showStars=true,period='day',quality='balanced',state=sampleSolarLight(9),seconds=0;
 try{const saved=localStorage.getItem('xiamen-render-quality');if(['high','balanced','light'].includes(saved))quality=saved;}catch{}
 const controls=document.createElement('div');controls.className='sky-options';controls.setAttribute('aria-label','天空');
 const clock=document.createElement('output');clock.setAttribute('aria-label','地图演绎时间');
 function toggle(text,checked,change){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=checked;input.onchange=()=>change(input.checked);label.append(input,text);controls.append(label);return input;}
 const cycle=toggle('日夜流转',!reducedMotion,v=>clockModel.setAuto(v));toggle('云朵',true,v=>showClouds=v);toggle('星辰',true,v=>showStars=v);controls.append(clock);
 document.querySelector('.top-actions').append(controls);
 function setQuality(value){if(!applyRenderQuality(renderer,sun,value,{pixelRatio:devicePixelRatio,mobile:innerWidth<=650,width:innerWidth,height:innerHeight}))return false;quality=value;regionalEnvironment?.setQuality?.(value);try{localStorage.setItem('xiamen-render-quality',value);}catch{}return true;}
 const tools=createSceneTools({renderer,scene,camera,reducedMotion,setQuality,quality});setQuality(quality);
 window.addEventListener('resize',()=>setQuality(quality));
 const nightMaterials=[];nightGroup.traverse(o=>{if(o.material){for(const mat of Array.isArray(o.material)?o.material:[o.material]){if(!nightMaterials.some(m=>m.mat===mat)){nightMaterials.push({mat,opacity:mat.opacity});mat.transparent=true;}}}});
 const dark=new THREE.Color('#000000'),waterEmission=new THREE.Color('#154356'),ivoryEmission=new THREE.Color('#c58a47'),landmarkEmission=new THREE.Color('#235258');
 function manual(mode){if(!clockModel.manual(mode))return false;cycle.checked=false;return true;}
 function update(dt){
  const step=tools.paused?0:dt;seconds+=step;const hour=clockModel.update(clockModel.getState().transitioning?dt:step);state=sampleSolarLight(hour);
  if(period!==state.period&&!clockModel.getState().transitioning){period=state.period;setPeriod(period);}
  scene.background.copy(state.bg);scene.fog.color.copy(state.bg);floor.material.color.copy(state.bg);
  sun.color.copy(state.sun);sun.intensity=state.intensity;hemisphere.color.copy(state.sky);hemisphere.groundColor.copy(state.ground);hemisphere.intensity=state.ambient;renderer.toneMappingExposure=state.exposure;
  // At night the same directional source represents soft moonlight, never light from beneath the terrain.
  sun.userData.offset??=new THREE.Vector3();sun.userData.offset.set(state.east*42*(1-2*state.night),Math.max(2,Math.abs(state.altitude)*46),12);
  if(materials.water){materials.water.color.copy(state.water);materials.water.emissive.copy(dark).lerp(waterEmission,state.night);materials.water.emissiveIntensity=.3;}
  if(materials.road)materials.road.color.copy(state.road);
  if(materials.cars)materials.cars.emissiveIntensity=1.8*state.night;
  if(materials.ivory)materials.ivory.emissive.copy(dark).lerp(ivoryEmission,state.night);
  for(const m of landmarkMaterials){m.emissive.copy(dark).lerp(landmarkEmission,state.night);m.emissiveIntensity=.48;}
  nightGroup.visible=state.night>.001;for(const {mat,opacity} of nightMaterials)mat.opacity=opacity*state.night;
  starField.visible=false;localLandmarks?.setLight?.(state.night,state.dusk);regionalEnvironment?.setLight?.(state.night);
  const eastVector=new THREE.Vector3(1,0,0).transformDirection(camera.matrixWorldInverse),eastScreen=Math.sign(eastVector.x)||1;
  photograph.update({hour,...state,eastScreen,showClouds,seconds,reducedMotion});stars.update({hour,...state,eastScreen,showStars,seconds,reducedMotion});
  clock.value=String(Math.floor(hour)).padStart(2,'0')+':'+String(Math.floor(hour%1*60)).padStart(2,'0');
 }
 return {update,manual,setQuality,get paused(){return tools.paused;},getState:()=>({...clockModel.getState(),clouds:showClouds,stars:showStars,period,quality,paused:tools.paused,light:{night:state.night,sun:state.sun.getHexString(),background:state.bg.getHexString(),intensity:state.intensity,offset:sun.userData.offset?.toArray(),shadowExtent:sun.userData.shadowExtent,shadowSize:sun.shadow.mapSize.x,pixelRatio:renderer.getPixelRatio()},photography:photograph.getState(),nightSky:stars.getState(),tools:tools.getState()})};
}
