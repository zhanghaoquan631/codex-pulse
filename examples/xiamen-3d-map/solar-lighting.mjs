import * as THREE from 'three';

export const solarPresets={morning:6.8,day:12,sunset:17.6,night:22};
export const solarTransitionSeconds=12;
export const solarCycleSeconds=1440;
export const wrapHour=h=>((h%24)+24)%24;
export function solarPosition(hour){
 const h=wrapHour(hour),angle=(h-6)/12*Math.PI;
 return {east:Math.cos(angle),altitude:Math.sin(angle),period:h<5.8||h>=19?'night':h<9?'morning':h>=16.5?'sunset':'day'};
}
export function createSolarClock({hour=9,auto=true}={}){
 let current=hour,transition=null;
 return {
  manual(mode){if(!(mode in solarPresets))return false;auto=false;const target=solarPresets[mode],delta=((target-wrapHour(current)+36)%24)-12;transition={from:current,to:current+delta,elapsed:0};return true;},
  setAuto(value){auto=!!value;transition=null;},
  update(dt){dt=Math.min(1,Math.max(0,dt));if(transition){transition.elapsed=Math.min(solarTransitionSeconds,transition.elapsed+dt);const t=transition.elapsed/solarTransitionSeconds,q=t*t*(3-2*t);current=transition.from+(transition.to-transition.from)*q;if(t===1){current=wrapHour(current);transition=null;}}else if(auto)current=wrapHour(current+dt*24/solarCycleSeconds);return wrapHour(current);},
  getState:()=>({hour:wrapHour(current),auto,transitioning:!!transition,transitionProgress:transition?transition.elapsed/solarTransitionSeconds:1})
 };
}

const keys=[
 [0,'#101e31','#8aaad3','#9bafc5','#566575','#244a61','#324350',.75,1.05,1.05],
 [5,'#192838','#a8b9d6','#9daec3','#526557','#325b6b','#46524e',.5,1.0,1.02],
 [6,'#c9b6a0','#ffc69a','#b3c6c7','#647660','#6a9094','#676258',.55,.83,1],
 [7.5,'#dce6e2','#ffe3b6','#c5dfe7','#839978','#4d9195','#59635e',2.65,1.05,1.03],
 [12,'#dae8e8','#fff2da','#d5e8ef','#8da37c','#367f87','#53616a',3.05,1.1,1.04],
 [16,'#d9ded3','#ffdaa7','#d7d8cb','#80936d','#538e90','#62645b',2.7,1,1.03],
 [17.6,'#d6b9a2','#ffb47f','#c6b9be','#6d7962','#69888f','#685b57',1.9,.87,1],
 [18.5,'#647c8e','#d9a1a1','#8e9fae','#405858','#466c80','#46565d',.3,.7,.95],
 [20,'#16273b','#8aaad3','#9bafc5','#566575','#244a61','#324350',.7,1.05,1.05],
 [24,'#101e31','#8aaad3','#9bafc5','#566575','#244a61','#324350',.75,1.05,1.05],
].map(([hour,bg,sun,sky,ground,water,road,intensity,ambient,exposure])=>({hour,bg:new THREE.Color(bg),sun:new THREE.Color(sun),sky:new THREE.Color(sky),ground:new THREE.Color(ground),water:new THREE.Color(water),road:new THREE.Color(road),intensity,ambient,exposure}));
export function sampleSolarLight(hour){
 const h=wrapHour(hour),upper=keys.findIndex(k=>k.hour>h),a=keys[upper-1],b=keys[upper],t=THREE.MathUtils.smoothstep(h,a.hour,b.hour),state={...solarPosition(h)};
 for(const key of ['bg','sun','sky','ground','water','road'])state[key]=a[key].clone().lerp(b[key],t);
 for(const key of ['intensity','ambient','exposure'])state[key]=THREE.MathUtils.lerp(a[key],b[key],t);
 state.night=1-THREE.MathUtils.smoothstep(state.altitude,-.28,.07);
 state.dusk=1-THREE.MathUtils.smoothstep(state.altitude,.03,.7);
 state.sunVisibility=THREE.MathUtils.smoothstep(state.altitude,-.09,.025);
 return state;
}

// Fit the light to the current view, including districts away from the world origin.
export function fitSunShadow({sun,camera,target,worldSpan=150}){
 const h=(camera.top-camera.bottom)/(2*camera.zoom),aspect=(camera.right-camera.left)/(camera.top-camera.bottom);
 const extent=Math.max(.35,Math.min(worldSpan,h*Math.max(1,aspect)*1.55+.15));
 const direction=(sun.userData.offset||new THREE.Vector3(-25,42,12)).clone().normalize(),distance=Math.max(60,extent*2.5+30);
 sun.target.position.copy(target);sun.target.updateMatrixWorld();sun.position.copy(target).addScaledVector(direction,distance);sun.updateMatrixWorld();
 Object.assign(sun.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent,near:.1,far:distance+extent*3+40});
 sun.shadow.normalBias=Math.max(.00004,Math.min(.003,extent/sun.shadow.mapSize.x*.45));sun.shadow.bias=-.000005;sun.shadow.radius=2;
 sun.shadow.camera.updateProjectionMatrix();sun.userData.shadowExtent=extent;
 return extent;
}

export const qualityProfiles={high:{pixelRatio:2,shadow:4096},balanced:{pixelRatio:1.5,shadow:2048},light:{pixelRatio:1,shadow:1024}};
export function applyRenderQuality(renderer,sun,quality,{pixelRatio=1,mobile=false,width=1,height=1}={}){
 const profile=qualityProfiles[quality];if(!profile)return false;
 const size=Math.min(renderer.capabilities.maxTextureSize,profile.shadow,mobile?2048:4096);
 renderer.setPixelRatio(Math.min(Math.max(pixelRatio,quality==='high'&&!mobile?1.5:1),profile.pixelRatio));renderer.setSize(width,height);
 if(sun.shadow.mapSize.x!==size){sun.shadow.map?.dispose();sun.shadow.map=null;sun.shadow.mapSize.set(size,size);}
 renderer.shadowMap.enabled=true;renderer.shadowMap.needsUpdate=true;return true;
}
