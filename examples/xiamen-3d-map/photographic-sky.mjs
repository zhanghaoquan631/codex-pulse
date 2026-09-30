import * as THREE from 'three';
import {RGBELoader} from 'three/addons/loaders/RGBELoader.js';

export const skyPhotographs=[
 {path:'/assets/sky/kloppenheim_03_puresky_2k.hdr',source:'https://polyhaven.com/a/kloppenheim_03_puresky',md5:'06abf490739e537e9339d619a2a3c941'},
 {path:'/assets/sky/kloppenheim_06_puresky_2k.hdr',source:'https://polyhaven.com/a/kloppenheim_06_puresky',md5:'590a829b3cf71216451655e601d542c6'}
];
export const cloudOverlayOpacity=.85;

export function photographSun({data,width,height}){
 const decode=data instanceof Uint16Array?THREE.DataUtils.fromHalfFloat:v=>v;
 let peak=0,index=0;
 for(let i=0;i<data.length;i+=4){
  const value=decode(data[i])*.2126+decode(data[i+1])*.7152+decode(data[i+2])*.0722;
  if(Number.isFinite(value)&&value>peak){peak=value;index=i/4;}
 }
 // HDRLoader flips the source's top-down scanlines when uploading the texture.
 return {u:(index%width+.5)/width,v:1-(Math.floor(index/width)+.5)/height,threshold:Math.max(2,peak*.003),peak};
}

export function createPhotographicSky(camera){
 const uniforms={day:{value:null},evening:{value:null},daySun:{value:new THREE.Vector2()},eveningSun:{value:new THREE.Vector2()},solarThreshold:{value:new THREE.Vector2(2,2)},sunScreen:{value:new THREE.Vector2(.5,.5)},dusk:{value:0},clouds:{value:1},drift:{value:0},aspect:{value:1.6},cloudOpacity:{value:cloudOverlayOpacity},fade:{value:1}};
 const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthTest:true,depthWrite:false,fog:false,toneMapped:false,
  vertexShader:'varying vec2 screenUV; void main(){screenUV=uv; gl_Position=vec4(position.xy,0.999999,1.0);}',
  fragmentShader:`
   uniform sampler2D day,evening;
   uniform vec2 daySun,eveningSun,solarThreshold,sunScreen;
   uniform float dusk,clouds,drift,aspect,cloudOpacity,fade;
   varying vec2 screenUV;
   vec4 photograph(sampler2D image,vec2 sun,float threshold){
    float panelY=screenUV.y;
    vec2 uv=sun+vec2((screenUV.x-sunScreen.x)*aspect,(panelY-sunScreen.y))*.32;
    vec2 solarUV=vec2(fract(uv.x),clamp(uv.y,.001,.999));
    vec3 original=texture2D(image,solarUV).rgb*.6;
    original+=texture2D(image,vec2(fract(solarUV.x-.0003),solarUV.y)).rgb*.1;
    original+=texture2D(image,vec2(fract(solarUV.x+.0003),solarUV.y)).rgb*.1;
    original+=texture2D(image,vec2(solarUV.x,clamp(solarUV.y-.0003,.001,.999))).rgb*.1;
    original+=texture2D(image,vec2(solarUV.x,clamp(solarUV.y+.0003,.001,.999))).rgb*.1;
    // Soften photographic cloud detail without blurring the captured solar disk.
    vec2 cloudUV=vec2(fract(uv.x+drift),clamp(uv.y,.001,.999));
    vec3 moving=texture2D(image,cloudUV).rgb*.4;
    moving+=texture2D(image,vec2(fract(cloudUV.x-.002),cloudUV.y)).rgb*.15;
    moving+=texture2D(image,vec2(fract(cloudUV.x+.002),cloudUV.y)).rgb*.15;
    moving+=texture2D(image,vec2(cloudUV.x,clamp(cloudUV.y-.001,.001,.999))).rgb*.15;
    moving+=texture2D(image,vec2(cloudUV.x,clamp(cloudUV.y+.001,.001,.999))).rgb*.15;
    float solar=smoothstep(threshold*.5,threshold*2.,dot(original,vec3(.2126,.7152,.0722)));
    // Bright cloud edges in sunset photographs are not part of the solar disk.
    float solarDistance=length(vec2((screenUV.x-sunScreen.x)*aspect,panelY-sunScreen.y));
    solar*=1.-smoothstep(.006,.025,solarDistance);
    moving*=min(1.,threshold/max(threshold,dot(moving,vec3(.2126,.7152,.0722))));
    vec3 radiance=mix(moving,original,solar);
    // Compress photographic contrast and blend toward the miniature's soft atmospheric palette.
    vec3 color=pow(radiance/(radiance+vec3(.8)),vec3(.4545));
    float grey=dot(color,vec3(.2126,.7152,.0722));
    color=mix(vec3(grey),color,.74);
    // Lift grey HDR midtones toward daylight blue, while retaining warmer dusk contrast.
    vec3 atmosphere=mix(vec3(.78,.87,.93),vec3(.87,.80,.75),dusk);
    color=mix(color,atmosphere,mix(.32,.20,dusk));
    color=mix(color,vec3(1.,.97,.87),solar*.85);
    float band=smoothstep(.12,.65,panelY);
    // Far-depth compositing keeps photographed light behind all map geometry.
    return vec4(color,max(solar*.9,band*cloudOpacity*clouds));
   }
   void main(){
    vec4 a=photograph(day,daySun,solarThreshold.x),b=photograph(evening,eveningSun,solarThreshold.y);
    gl_FragColor=mix(a,b,dusk);gl_FragColor.a*=fade;
   }`
 });
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);
 mesh.name='photographic-sky';mesh.frustumCulled=false;mesh.renderOrder=900;mesh.visible=false;camera.add(mesh);
 let ready=false,error=null,desired=true,sourceSuns=[];
 const loader=new RGBELoader();
 Promise.allSettled(skyPhotographs.map(p=>loader.loadAsync(p.path))).then(results=>{
  if(results.some(r=>r.status==='rejected')){
   results.forEach(r=>{if(r.status==='fulfilled')r.value.dispose();});
   error='sky-photo-load-failed';mesh.visible=false;return;
  }
  const loaded=results.map(r=>r.value);
  loaded.forEach(t=>{t.wrapS=THREE.RepeatWrapping;t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter;t.generateMipmaps=false;});
  sourceSuns=loaded.map(t=>photographSun(t.image));
  uniforms.day.value=loaded[0];uniforms.evening.value=loaded[1];
  uniforms.daySun.value.set(sourceSuns[0].u,sourceSuns[0].v);uniforms.eveningSun.value.set(sourceSuns[1].u,sourceSuns[1].v);
  uniforms.solarThreshold.value.set(sourceSuns[0].threshold,sourceSuns[1].threshold);
  ready=true;mesh.visible=desired;
 }).catch(()=>{error='sky-photo-load-failed';mesh.visible=false;});
 return {
  update({hour,altitude,east,eastScreen,showClouds,seconds,reducedMotion,sunVisibility=THREE.MathUtils.smoothstep(altitude,-.09,.025)}){
   uniforms.fade.value=sunVisibility;desired=sunVisibility>.001;mesh.visible=ready&&desired;
   // Keep the illustrative horizon above the diorama's foreground, with depth occlusion intact.
   uniforms.sunScreen.value.set(.5+east*.28*eastScreen,.61+altitude*.30);
   uniforms.dusk.value=THREE.MathUtils.smoothstep(Math.abs(hour-12),3,6);
   uniforms.clouds.value=showClouds?1:0;uniforms.drift.value=reducedMotion?0:Math.sin(seconds*.003)*.006;
   uniforms.aspect.value=camera.isOrthographicCamera?(camera.right-camera.left)/(camera.top-camera.bottom):camera.aspect;
  },
  getState:()=>({ready,error,visible:mesh.visible,fade:uniforms.fade.value,sunScreen:uniforms.sunScreen.value.toArray(),dusk:uniforms.dusk.value,clouds:uniforms.clouds.value,cloudOpacity:uniforms.cloudOpacity.value,drift:uniforms.drift.value,sourceSuns,sources:skyPhotographs.map(p=>p.source)})
 };
}
