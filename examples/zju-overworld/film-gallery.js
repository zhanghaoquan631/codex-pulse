import * as THREE from './vendor/three.module.js';
import {FILM_CAST} from './film-cast-models.js?v=11';
import {updateAvatar} from './avatar.js?v=11';
const $=id=>document.getElementById(id);
let closePreview=null;

export function openFilmGallery(life){
  closePreview?.();
  const dialog=$('film-gallery'),canvas=$('film-preview-canvas');
  life.keys.clear();life.autoRun=false;document.exitPointerLock?.();
  dialog.showModal();
  const scene=new THREE.Scene();scene.background=new THREE.Color('#d9d6cc');
  scene.add(new THREE.HemisphereLight('#fff5df','#5e7581',2.5));
  const sun=new THREE.DirectionalLight('#fff4e5',3);sun.position.set(-3,4,5);scene.add(sun);
  const rim=new THREE.DirectionalLight('#cbdde9',1.8);rim.position.set(3,2,-3);scene.add(rim);
  const camera=new THREE.PerspectiveCamera(32,1,.05,20);
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  let rig,selected,detail=false,walking=false,angle=.13,drag=null,last=performance.now(),frame=0,closed=false;
  let references=[];
  const updateInfo=()=>{
    const info=references.find(r=>r.id===selected.id)||{};
    $('film-cast-english').textContent=selected.englishName||selected.english||info.englishName||'';
    $('film-cast-name').textContent=selected.name;
    $('film-cast-description').textContent=selected.description||selected.features||info.features||'独立制作的立体脸型、五官和发型。';
    $('film-cast-movies').textContent=info.movies?.length?'相关电影 · '+info.movies.join(' / '):'';
    const link=$('film-cast-source');link.hidden=!info.source;link.href=info.source||'#';
    $('film-cast-use').textContent='使用 '+selected.name+' 的形象';
    for(const b of $('film-cast-list').children){const active=b.dataset.cast===selected.id;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}
  };
  const select=id=>{selected=FILM_CAST.find(c=>c.id===id)||FILM_CAST[0];rig?.dispose();rig=life.avatar(selected.id,{original:true});scene.add(rig.group);angle=.13;updateInfo();};
  $('film-cast-list').replaceChildren();
  for(const [i,cast] of FILM_CAST.entries()){
    const button=document.createElement('button');button.dataset.cast=cast.id;
    const number=document.createElement('small');number.textContent=String(i+1).padStart(2,'0');
    const name=document.createElement('span');name.textContent=cast.name;
    button.append(number,name);button.onclick=()=>select(cast.id);$('film-cast-list').append(button);
  }
  select(life.player.variant);
  fetch('./film-cast-references.json?v=11').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{if(closed)return;references=data;updateInfo();}).catch(()=>{});
  const resize=()=>{const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  $('film-preview-detail').onclick=()=>{detail=!detail;$('film-preview-detail').textContent=detail?'查看全身':'查看面部';};
  $('film-preview-action').onclick=()=>{walking=!walking;$('film-preview-action').textContent=walking?'站立预览':'行走演示';};
  $('film-preview-detail').textContent='查看面部';$('film-preview-action').textContent='行走演示';
  canvas.onpointerdown=e=>{drag=e.clientX;canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{if(drag!==null){angle+=(e.clientX-drag)*.012;drag=e.clientX;}};
  canvas.onpointerup=canvas.onpointercancel=()=>drag=null;
  const tick=now=>{
    if(closed)return;const dt=Math.min((now-last)/1000,.08);last=now;
    updateAvatar(rig,dt,walking?1.3:0,'auto');rig.group.rotation.y=angle;
    camera.position.set(0,detail?1.43:1.1,detail?1.14:3.6);camera.lookAt(0,detail?1.38:.85,0);
    renderer.render(scene,camera);frame=requestAnimationFrame(tick);
  };
  frame=requestAnimationFrame(tick);
  const cleanup=()=>{if(closed)return;closed=true;cancelAnimationFrame(frame);observer.disconnect();rig?.dispose();renderer.dispose();canvas.onpointerdown=canvas.onpointermove=canvas.onpointerup=canvas.onpointercancel=null;dialog.removeEventListener('close',cleanup);closePreview=null;life.keys.clear();life.env.canvas.focus();};
  closePreview=()=>{dialog.close();cleanup();};dialog.addEventListener('close',cleanup,{once:true});
  $('film-gallery-close').onclick=()=>dialog.close();
  $('film-cast-use').onclick=()=>{life.createPlayer(selected.id);dialog.close();life.env.toast('已换成 '+selected.name+' 的校园形象。');};
}
