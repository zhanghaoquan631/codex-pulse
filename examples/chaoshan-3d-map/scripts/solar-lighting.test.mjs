import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSolarClock,solarPresets,solarPosition,sampleSolarLight,fitSunShadow,applyRenderQuality} from '../solar-lighting.mjs';
import {buildVegetation} from '../street-life.mjs';
import {createNightSky} from '../night-sky.mjs';
import {addUrbanArchitecture} from '../urban-architecture.mjs';

test('all preset transitions take twelve seconds without teleporting the sun; interruption starts at current pose',()=>{
 for(const from of Object.values(solarPresets))for(const to of Object.keys(solarPresets)){
  const clock=createSolarClock({hour:from,auto:false});clock.manual(to);assert.ok(Math.abs(clock.getState().hour-from)<1e-10);
  let last=solarPosition(from);for(let i=0;i<720;i++){const h=clock.update(1/60),next=solarPosition(h);assert.ok(Math.hypot(next.east-last.east,next.altitude-last.altitude)<.01);last=next;if(i===120)assert.equal(clock.getState().transitioning,true);}
  clock.update(.001);assert.ok(Math.abs(clock.getState().hour-solarPresets[to])<1e-6);
 }
 const clock=createSolarClock();clock.manual('night');for(let i=0;i<100;i++)clock.update(.05);const mid=clock.getState().hour;clock.manual('morning');assert.equal(clock.getState().hour,mid);clock.update(0);assert.equal(clock.getState().hour,mid);
 assert.equal(clock.manual('bad'),false);
});
test('automatic 24-hour light is continuous through sunrise, sunset and midnight',()=>{
 for(let h=0;h<24;h+=.01){const a=sampleSolarLight(h),b=sampleSolarLight(h+.0001);for(const k of ['bg','sun','sky','ground','water','road'])assert.ok(new THREE.Vector3(...a[k].toArray()).distanceTo(new THREE.Vector3(...b[k].toArray()))<.001);assert.ok(Math.abs(a.intensity-b.intensity)<.001);assert.ok(Math.abs(a.night-b.night)<.001);}
 const clock=createSolarClock({hour:23.99});for(let i=0;i<60;i++)clock.update(.05);assert.ok(clock.getState().hour<.05);clock.setAuto(false);const h=clock.getState().hour;clock.update(.1);assert.equal(clock.getState().hour,h);
 assert.equal(sampleSolarLight(12).night,0);assert.equal(sampleSolarLight(22).night,1);
});
test('shadow coverage follows all regions and zooms without the old fixed origin or excessive normal bias',()=>{
 const camera=new THREE.OrthographicCamera(-30,30,20,-20,.1,700),sun=new THREE.DirectionalLight();sun.shadow.mapSize.set(2048,2048);sun.userData.offset=new THREE.Vector3(-30,42,12);
 for(const x of [-70,0,70])for(const zoom of [1,10,100,600]){
  camera.zoom=zoom;const target=new THREE.Vector3(x,3,x*.4);const extent=fitSunShadow({sun,camera,target});assert.deepEqual(sun.target.position.toArray(),target.toArray());assert.ok(extent>=.35);assert.ok(sun.shadow.normalBias<=.003);assert.ok(sun.shadow.camera.far>sun.position.distanceTo(target));
  sun.shadow.updateMatrices(sun);assert.ok(new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(sun.shadow.camera.projectionMatrix,sun.shadow.camera.matrixWorldInverse)).containsPoint(target));
 }
});
test('trees cast and receive shadows in detailed and overview instance tiles',()=>{
 const parent=new THREE.Group(),accepted=Array.from({length:2200},(_,i)=>[i%50,Math.floor(i/50),0,.1]);buildVegetation({parent,accepted});let checked=0;parent.traverse(o=>{if(o.isMesh){checked++;assert.equal(o.castShadow,true);assert.equal(o.receiveShadow,true);}});assert.ok(checked>100);
});
test('road-front houses retain cast and receive shadows through both detail levels',()=>{
 const parent=new THREE.Group(),rows=Array.from({length:2200},(_,i)=>({x:i%50,z:Math.floor(i/50),y:0,angle:i*.3,h:.2,color:'#ccdbd0'}));
 addUrbanArchitecture(parent,rows);let tiles=0;parent.traverse(o=>{if(o.isMesh){tiles++;assert.ok(o.name.startsWith('urban-infill-'));assert.equal(o.castShadow,true);assert.equal(o.receiveShadow,true);}});assert.ok(tiles>4);
});
test('quality changes actual buffer density and shadow resolution without disabling shadows on light mode',()=>{
 let density,size,disposed=false;const renderer={capabilities:{maxTextureSize:4096},shadowMap:{},setPixelRatio:v=>density=v,setSize:(w,h)=>size=[w,h]},sun=new THREE.DirectionalLight();sun.shadow.map={dispose:()=>disposed=true};
 applyRenderQuality(renderer,sun,'high',{pixelRatio:3,width:1200,height:800});assert.equal(density,2);assert.equal(sun.shadow.mapSize.x,4096);assert.equal(disposed,true);
 applyRenderQuality(renderer,sun,'light',{pixelRatio:3});assert.equal(density,1);assert.equal(sun.shadow.mapSize.x,1024);assert.equal(renderer.shadowMap.enabled,true);
 applyRenderQuality(renderer,sun,'high',{pixelRatio:3,mobile:true});assert.equal(sun.shadow.mapSize.x,2048);assert.equal(applyRenderQuality(renderer,sun,'invalid'),false);assert.deepEqual(size,[1,1]);
});
test('night sky fades and is depth-tested behind scenery; stars can be turned off independently',()=>{
 const camera=new THREE.OrthographicCamera(-10,10,6,-6),sky=createNightSky(camera);sky.update({...sampleSolarLight(22),eastScreen:1,showStars:true,seconds:4});assert.equal(sky.getState().opacity,1);assert.equal(camera.children[0].material.depthTest,true);assert.equal(camera.children[0].material.depthWrite,false);
 sky.update({...sampleSolarLight(12),eastScreen:1,showStars:false,seconds:4});assert.equal(sky.getState().opacity,0);assert.equal(sky.getState().stars,0);assert.equal(sky.getState().visible,false);
});
