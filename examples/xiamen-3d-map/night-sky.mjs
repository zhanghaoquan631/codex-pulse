import * as THREE from 'three';

export function createNightSky(camera){
 const uniforms={opacity:{value:0},aspect:{value:1},seconds:{value:0},moon:{value:new THREE.Vector2(.68,.78)},stars:{value:1}};
 const material=new THREE.ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,toneMapped:false,uniforms,
  vertexShader:'varying vec2 screenUV; void main(){screenUV=uv; gl_Position=vec4(position.xy,0.999998,1.0);}',
  fragmentShader:`varying vec2 screenUV;uniform float opacity,aspect,seconds,stars;uniform vec2 moon;
   float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   void main(){vec2 p=screenUV*vec2(aspect,1.);vec2 cell=floor(p*95.);vec2 offset=vec2(hash(cell),hash(cell+71.));vec2 d=fract(p*95.)-(.15+offset*.7);
    float dotStar=(1.-smoothstep(.025,.11,length(d)))*step(.965,hash(cell+11.));
    float twinkle=.8+.2*sin(seconds*.6+hash(cell+31.)*6.28);float starAlpha=dotStar*twinkle*stars;
    float m=length((screenUV-moon)*vec2(aspect,1.));float disk=1.-smoothstep(.012,.014,m);float halo=exp(-m*80.)*.1;
    vec3 color=mix(vec3(.76,.86,1.),vec3(.94,.93,.79),disk);gl_FragColor=vec4(color,opacity*max(starAlpha,disk*.85+halo));}`});
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);mesh.name='night-stars-and-moon';mesh.frustumCulled=false;mesh.renderOrder=901;camera.add(mesh);
 return {update({night,east,altitude,eastScreen,showStars,seconds,reducedMotion}){uniforms.opacity.value=night;uniforms.stars.value=showStars?1:0;uniforms.seconds.value=reducedMotion?0:seconds;uniforms.aspect.value=(camera.right-camera.left)/(camera.top-camera.bottom);uniforms.moon.value.set(.5-east*.28*eastScreen,.22+Math.max(0,-altitude)*.6);mesh.visible=night>.001;},getState:()=>({opacity:uniforms.opacity.value,stars:uniforms.stars.value,visible:mesh.visible,moon:uniforms.moon.value.toArray()})};
}
