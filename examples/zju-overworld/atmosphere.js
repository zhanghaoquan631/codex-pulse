import * as THREE from './vendor/three.module.js';
import {WeatherEffects} from './weather-effects.js?v=11';
import {outsideCamera} from './interior-view.js?v=11';
const $=id=>document.getElementById(id),clamp=THREE.MathUtils.clamp;
const PRESETS={
 sunny:{name:'晴朗',icon:'☀',temp:26,sky:'#78add0',horizon:'#dce9dc',fog:'#c0d6d6',light:3.4},
 cloudy:{name:'阴天',icon:'☁',temp:21,sky:'#8b9ca9',horizon:'#c8d1cf',fog:'#aab9b9',light:1.35},
 rain:{name:'下雨',icon:'☂',temp:18,sky:'#60788a',horizon:'#a5b8bb',fog:'#92a8ae',light:1.2},
 storm:{name:'暴风雨',icon:'⛈',temp:16,sky:'#354751',horizon:'#70858d',fog:'#758a94',light:.7},
 hot:{name:'炎热',icon:'☀',temp:37,sky:'#85b5d1',horizon:'#f3d4a0',fog:'#decfae',light:4.2},
 cold:{name:'寒冷',icon:'❄',temp:-4,sky:'#93b5cf',horizon:'#e2ebee',fog:'#c8dce6',light:2.2},
 snow:{name:'下雪',icon:'❄',temp:-2,sky:'#8fa6b7',horizon:'#e3e9e9',fog:'#cddce2',light:1.4}
};
export class Atmosphere{
 constructor(life){this.life=life;this.env=life.env;this.hour=13;this.key='sunny';this.autoTime=true;this.autoWeather=false;this.cycle=0;this.lastShadowHour=-10;this.currentTop=new THREE.Color();this.currentHorizon=new THREE.Color();this.currentFog=new THREE.Color();this.effects=new WeatherEffects({scene:this.env.scene,camera:this.env.camera});this.effects.setPreset(this.key);this.bindUI();}
 bindUI(){
   $('light-button').onclick=()=>$('weather-panel').hidden=!$('weather-panel').hidden;
   $('weather-close').onclick=()=>$('weather-panel').hidden=true;
   $('weather-select').onchange=()=>{this.setWeather($('weather-select').value);this.autoWeather=false;$('weather-auto').checked=false;};
   $('sun-hour').oninput=()=>{this.setHour(Number($('sun-hour').value));this.autoTime=false;$('time-auto').checked=false;};
   $('time-auto').onchange=()=>this.autoTime=$('time-auto').checked;
   $('weather-auto').onchange=()=>{this.autoWeather=$('weather-auto').checked;this.cycle=0;};
 }
 setWeather(key){if(!PRESETS[key])return false;this.key=key;this.effects.setPreset(key);$('weather-select').value=key;this.cycle=0;this.lastShadowHour=-10;return true;}
 setHour(hour){if(!Number.isFinite(hour))return false;this.hour=(hour%24+24)%24;this.effects.setHour(this.hour);$('sun-hour').value=this.hour;return true;}
 update(dt){
   this.effects.camera=this.life.room?outsideCamera(this.env.camera,this.life.room.feature.entrance,this.effectsExteriorCamera||(this.effectsExteriorCamera=this.env.camera.clone())):this.env.camera;
   if(this.autoTime)this.hour=(this.hour+dt/45)%24;
   if(this.autoWeather&&(this.cycle+=dt)>60){const keys=Object.keys(PRESETS);this.setWeather(keys[(keys.indexOf(this.key)+1)%keys.length]);}
   const p=PRESETS[this.key],angle=(this.hour-6)/24*Math.PI*2,height=Math.sin(angle),day=clamp((height+.12)/.5,0,1),night=1-day;
   this.effects.setHour(this.hour);const outside=this.life.room?this.life.doorWorld(this.life.room.feature.entrance,this.life.position.x,this.life.position.z-18):null;const weatherPosition=outside?{x:outside.x,y:this.life.position.y,z:outside.z}:this.life.mode==='aerial'?this.env.camera.position:this.life.position;this.effects.update(dt,{position:weatherPosition,indoors:false});
   const nightSky=new THREE.Color('#122638'),nightHorizon=new THREE.Color('#526975');
   const top=new THREE.Color(p.sky).lerp(nightSky,night*.88),horizon=new THREE.Color(p.horizon).lerp(nightHorizon,night*.87),fog=new THREE.Color(p.fog).lerp(nightHorizon,night*.85);
   if(height>-.05&&height<.3){horizon.lerp(new THREE.Color('#d8a779'),.35);}
   const ease=Math.min(1,dt*2);this.env.sky.material.uniforms.top.value.lerp(top,ease);this.env.sky.material.uniforms.bottom.value.lerp(horizon,ease);this.env.scene.fog.color.lerp(fog,ease);
   this.env.scene.fog.near=this.key==='storm'?80:this.key==='rain'||this.key==='snow'?350:1100;this.env.scene.fog.far=this.key==='storm'?1300:this.key==='rain'||this.key==='snow'?2200:3900;
   this.env.sun.intensity=(.18+day*p.light);this.env.hemi.intensity=.75+day*(this.key==='storm'?.7:1.6);this.env.sun.color.set(height<.3?'#ffd3a1':this.key==='cold'||this.key==='snow'?'#d9edff':'#fff0d6');
   const nearView=this.life.mode!=='aerial'&&!this.life.room,span=nearView?125:1250,target=this.env.sun.target,shadow=this.env.sun.shadow,focus=nearView?this.life.position:{x:0,z:0};
   const sx=Math.round(focus.x/12)*12,sz=Math.round(focus.z/12)*12;
   if(target.position.x!==sx||target.position.z!==sz||shadow.camera.right!==span){target.position.set(sx,0,sz);Object.assign(shadow.camera,{left:-span,right:span,top:span,bottom:-span});shadow.camera.updateProjectionMatrix();this.env.renderer.shadowMap.needsUpdate=true;}
   shadow.normalBias=nearView?.12:.8;
   this.env.sun.position.copy(this.effects.sunDirection).multiplyScalar(1000).add(target.position);this.env.sun.position.y=Math.max(80,this.env.sun.position.y);
   if(Math.abs(this.hour-this.lastShadowHour)>.3){this.env.renderer.shadowMap.needsUpdate=true;this.lastShadowHour=this.hour;}
   if(this.life.room){this.life.room.scene.background.copy(fog);for(const l of this.life.room.scene.children)if(l.isHemisphereLight)l.intensity=1.35+day*1.35;}
   if(this.life.frame%10===0){const time=`${String(Math.floor(this.hour)).padStart(2,'0')}:${String(Math.floor(this.hour%1*60)).padStart(2,'0')}`;const temp=Math.round(p.temp-night*5);$('light-button').textContent=`${p.icon} ${temp}°`;$('weather-summary').textContent=`${p.name} · ${temp}°C · ${time}`;$('sun-time').textContent=time;if(this.autoTime)$('sun-hour').value=this.hour;$('temperature-vignette').dataset.weather=this.key;}
 }
 getState(){const daylight=clamp((Math.sin((this.hour-6)/24*Math.PI*2)+.12)/.5,0,1);return {weather:this.key,hour:this.hour,temperature:Math.round(PRESETS[this.key].temp-(1-daylight)*5),autoTime:this.autoTime,autoWeather:this.autoWeather};}
}
