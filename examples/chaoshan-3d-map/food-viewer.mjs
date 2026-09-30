import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {buildDish} from './food-models.mjs';
import {batchStatic} from './static-batch.mjs';

export function createFoodViewer(){
  const dialog=document.createElement('dialog');dialog.className='food-viewer';
  const header=document.createElement('header'),title=document.createElement('h2'),close=document.createElement('button');
  title.id='food-viewer-title';dialog.setAttribute('aria-labelledby',title.id);
  close.textContent='×';close.title='关闭';close.setAttribute('aria-label','关闭美食近看');
  const stage=document.createElement('div');stage.className='food-viewer-stage';
  const nav=document.createElement('div');nav.className='food-viewer-tabs';nav.setAttribute('role','tablist');
  header.append(title,close);dialog.append(header,stage,nav);document.body.append(dialog);
  let renderer,controls,scene,camera,model,observer,returnFocus;
  function frameModel(){
    if(!model)return;
    const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3());
    const direction=new THREE.Vector3(.65,1,1.15).normalize();
    camera.position.copy(center).add(direction);camera.lookAt(center);camera.updateMatrixWorld();
    const inverse=camera.quaternion.clone().invert(),tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
    let distance=0;
    // Fit all eight corners in camera space, including portrait viewports.
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
      const p=new THREE.Vector3(x,y,z).sub(center).applyQuaternion(inverse);
      distance=Math.max(distance,p.z+Math.max(Math.abs(p.y)/tan,Math.abs(p.x)/(tan*camera.aspect)));
    }
    distance*=1.18;controls.target.copy(center);camera.position.copy(center).addScaledVector(direction,distance);
    controls.minDistance=distance*.55;controls.maxDistance=distance*3;controls.update();
  }
  function releaseModel(){if(!model)return;model.traverse(o=>{if(o.isMesh&&o.geometry)o.geometry.dispose();});model.removeFromParent();model=null;}
  function cleanup(){renderer?.setAnimationLoop(null);observer?.disconnect();controls?.dispose();releaseModel();renderer?.dispose();renderer?.forceContextLoss();stage.replaceChildren();renderer=null;returnFocus?.focus();}
  function choose(name){
    releaseModel();model=buildDish(scene,name);batchStatic(model);title.textContent=name;
    for(const b of nav.children)b.setAttribute('aria-selected',String(b.textContent===name));
    frameModel();
  }
  close.onclick=()=>dialog.close();dialog.addEventListener('close',cleanup);
  return {open(place){
    returnFocus=document.activeElement;dialog.showModal();
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor('#d9e6e3');renderer.outputColorSpace=THREE.SRGBColorSpace;stage.append(renderer.domElement);
    renderer.domElement.setAttribute('aria-label','可旋转的美食三维模型');
    scene=new THREE.Scene();scene.add(new THREE.HemisphereLight('#ffffff','#7e8d8c',2.4));const light=new THREE.DirectionalLight('#fff5e2',3);light.position.set(1,3,2);scene.add(light);
    camera=new THREE.PerspectiveCamera(36,1,.001,10);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=.12;controls.maxDistance=.65;controls.maxPolarAngle=Math.PI*.49;controls.enablePan=false;
    nav.replaceChildren();for(const name of place.dishes){const b=document.createElement('button');b.textContent=name;b.setAttribute('role','tab');b.onclick=()=>choose(name);nav.append(b);}
    choose(place.dishes[0]);observer=new ResizeObserver(()=>{const {width,height}=stage.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();frameModel();});observer.observe(stage);
    renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
  }};
}
