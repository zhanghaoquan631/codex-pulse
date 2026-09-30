import * as THREE from './vendor/three.module.js';
import {createRooster,createEnemy,createMushroom,createRocket,createCoop} from './assets.js';
import {GameEngine} from './engine.js';

import { announceState } from './pulse-bridge.js';

const $=id=>document.getElementById(id), root=$('game');
const input={left:false,right:false,jumpPressed:false,jumpHeld:false};
let engine, renderer, scene, camera, rooster, rocket, coop, world, scenery;
let stickPointer=null,jumpPointer=null,lastViewportWidth=innerWidth;
const isHandheld=()=>matchMedia('(max-width:1100px) and (pointer:coarse)').matches||innerWidth<=600;
let paused=false, intro=0, introDone=false, soundEnabled=false, audioContext, hudCache='';
let best=0, toastTimer, previousFocus, cameraX=0, cameraY=0, lastTime=0, accumulator=0;
try{best=Number(sessionStorage.getItem('rooster-rush-local-best'))||0;}catch{}
const objects=new Map(), pools=new Map(), particles=[];
const boxGeometry=new THREE.BoxGeometry(1,1,1), sphereGeometry=new THREE.SphereGeometry(1,12,8);
const materials={};
function mat(color,options={}){const key=color+JSON.stringify(options);return materials[key]??=new THREE.MeshStandardMaterial({color,roughness:.85,...options});}
function box(w,h,d,color,x=0,y=0,z=0){const m=new THREE.Mesh(boxGeometry,mat(color));m.scale.set(w,h,d);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;return m;}
function ball(x,y,z,sx,sy,sz,color){const m=new THREE.Mesh(sphereGeometry,mat(color));m.position.set(x,y,z);m.scale.set(sx,sy,sz);return m;}
function labelTexture(text,bg,color){const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,128,128);ctx.strokeStyle=color;ctx.lineWidth=4;ctx.strokeRect(7,7,114,114);ctx.font='bold 84px Georgia';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(text,64,66);const tx=new THREE.CanvasTexture(c);tx.colorSpace=THREE.SRGBColorSpace;return tx;}
const questionMaterial=new THREE.MeshStandardMaterial({map:labelTexture('?','#edbf68','#93572a'),roughness:.8});
const usedMaterial=mat('#b79463');
const coinFace=new THREE.MeshStandardMaterial({map:labelTexture('AI','#d6a12a','#85510f'),metalness:.55,roughness:.4});
const coinEdge=mat('#b87b13',{metalness:.6,roughness:.4});
const coinGeo=new THREE.CylinderGeometry(.31,.31,.105,24), coinRingGeo=new THREE.TorusGeometry(.273,.018,5,24);
function makeCoin(){const g=new THREE.Group(), c=new THREE.Mesh(coinGeo,[coinEdge,coinFace,coinFace]);c.rotation.x=Math.PI/2;g.add(c);for(const z of [-.057,.057]){const ring=new THREE.Mesh(coinRingGeo,coinEdge);ring.position.z=z;g.add(ring);}return g;}
function makeSolid(s){const g=new THREE.Group();if(s.kind==='ground'){
  g.add(box(s.w,s.h,2,'#704323',0,-s.h/2,0));g.add(box(s.w,.16,2.08,'#935e3d',0,-.06,0));g.add(box(s.w,.13,.06,'#57331f',0,-.3,1.03));g.add(box(s.w,.055,.08,'#925f36',0,-.39,1.05));
  const seams=Math.min(9,Math.floor(s.w/3));for(let i=1;i<=seams;i++)g.add(box(.025,s.h-.4,.015,'#684121',-s.w/2+s.w*i/(seams+1),-s.h/2-.2,1.009));
}else if(s.kind==='pipe'){
  const cylinder=new THREE.CylinderGeometry(s.w*.48,s.w*.48,s.h,24),tube=new THREE.Mesh(cylinder,mat('#568751'));
  tube.position.y=-s.h/2;tube.castShadow=true;tube.receiveShadow=true;g.add(tube);g.userData.ownedGeometries=[cylinder];
  const lipGeo=new THREE.CylinderGeometry(s.w*.57,s.w*.57,.32,24),lip=new THREE.Mesh(lipGeo,mat('#739d62'));lip.position.y=-.16;g.add(lip);g.userData.ownedGeometries.push(lipGeo);
  const holeGeo=new THREE.CircleGeometry(s.w*.39,24),hole=new THREE.Mesh(holeGeo,mat('#29432c'));hole.rotation.x=-Math.PI/2;hole.position.y=.005;g.add(hole);g.userData.ownedGeometries.push(holeGeo);
}else if(s.kind==='question'){
  const q=new THREE.Mesh(boxGeometry,[mat('#c69046'),mat('#c69046'),mat('#f3d49a'),mat('#b7823f'),questionMaterial,questionMaterial]);q.scale.set(s.w,s.h,1.1);q.position.y=-s.h/2;q.castShadow=q.receiveShadow=true;g.add(q);g.userData.cube=q;
}else if(s.kind==='brick'){
  g.add(box(s.w,s.h,1.2,'#b67746',0,-s.h/2));for(let i=1;i<3;i++)g.add(box(s.w,.025,.025,'#765130',0,-s.h*i/3,.615));for(const [x,y] of [[0,-s.h/6],[-s.w/4,-s.h/2],[s.w/4,-s.h/2],[0,-s.h*5/6]])g.add(box(.023,s.h/3,.025,'#765130',x,y,.615));
}else{g.add(box(s.w,s.h,2,'#dfc39a',0,-s.h/2));g.add(box(s.w+.07,.13,2.07,'#f2e0bc',0,-.035));}
return g;}

function buildScenery(){scenery=new THREE.Group();scene.add(scenery);
  const hillColors=['#d5bba0','#bea17a'];
  for(let layer=0;layer<2;layer++)for(let i=0;i<12;i++){
    const g=new THREE.Group(), w=8+(i*7%9),h=.5+(i*11%5)*.22,shape=new THREE.Shape();shape.moveTo(-w,-6);shape.lineTo(-w,0);shape.bezierCurveTo(-w*.5,h*1.1,w*.4,h*1.12,w,0);shape.lineTo(w,-6);shape.closePath();const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color:hillColors[layer]}));g.add(mesh);g.position.set(i*18-60,-2.4,-16+layer*8);g.userData={baseX:g.position.x,parallax:layer===0?.17:.33,span:216};scenery.add(g);
  }
  const cloudMaterial=new THREE.MeshBasicMaterial({color:'#e3e2df'});
  for(let i=0;i<9;i++){const g=new THREE.Group(),width=1.4+(i*3%4)*.27;for(let j=0;j<5;j++){const puff=ball((j-2)*.65,(j%3)*.2,0,width*.6,.5+(j%2)*.2,.3,'#e4e3de');puff.material=cloudMaterial;g.add(puff);}g.position.set(i*15-45,10+(i*7%4),-22);g.userData={baseX:g.position.x,parallax:.12,cloud:true,span:135};scenery.add(g);}
}

function init(){
  try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});}catch(error){$('load-error').hidden=false;announceState('error');console.error(error);return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,isHandheld()?1.5:2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;renderer.setClearColor(0x000000,0);$('scene').appendChild(renderer.domElement);
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(36,innerWidth/innerHeight,.1,200);
  scene.add(new THREE.HemisphereLight('#fff4da','#a57854',2.25));
  const sun=new THREE.DirectionalLight('#fff3d4',3);sun.position.set(-6,16,12);sun.castShadow=true;sun.shadow.mapSize.set(isHandheld()?1024:2048,isHandheld()?1024:2048);Object.assign(sun.shadow.camera,{left:-24,right:24,top:16,bottom:-15,near:1,far:65});sun.shadow.bias=-.0008;sun.shadow.normalBias=.03;scene.add(sun);scene.add(sun.target);scene.userData.sun=sun;
  world=new THREE.Group();scene.add(world);buildScenery();rooster=createRooster();scene.add(rooster);rocket=createRocket();rocket.scale.setScalar(2.15);scene.add(rocket);rocket.visible=false;coop=createCoop();coop.position.set(-11,0,-.2);coop.rotation.y=.4;world.add(coop);
  engine=new GameEngine({onEvent:handleEvent});engine.best=best;root.classList.add('intro');resize();bindControls();syncWorld();
  if(new URLSearchParams(location.search).has('test'))window.__game={engine,input,skipIntro:finishIntro,reset:resetGame,snapshot:()=>({score:engine.score,lives:engine.lives,status:engine.status,player:{...engine.player},boostTime:engine.boostTime,paused,drawCalls:renderer.info.render.calls,objects:objects.size}),renderer};
  renderer.domElement.addEventListener('pointerdown',()=>root.focus({preventScroll:true}));
  announceState('ready');
  requestAnimationFrame(frame);
}

function finishIntro(){introDone=true;intro=5;root.classList.remove('intro');$('intro-bubble').hidden=true;}
function resetGame(){closeModal(true);clearInput();clearTimeout(toastTimer);$('toast').classList.remove('show');for(const q of particles)scene.remove(q.m);particles.length=0;for(const el of document.querySelectorAll('.flying-coin')){el.getAnimations().forEach(a=>a.cancel());el.remove();}for(const obj of objects.values()){world.remove(obj);obj.userData.ownedGeometries?.forEach(g=>g.dispose());}objects.clear();engine.reset();root.dataset.playing='false';engine.best=best;paused=false;finishIntro();cameraX=engine.player.x;cameraY=0;$('begin-hint').hidden=false;syncWorld();updateHUD();root.focus({preventScroll:true});}
function clearInput(){input.left=input.right=input.jumpPressed=input.jumpHeld=false;for(const [id,pointer] of [['joystick',stickPointer],['jump',jumpPointer]]){const el=$(id);if(pointer!==null&&el.hasPointerCapture(pointer))el.releasePointerCapture(pointer);}stickPointer=jumpPointer=null;$('stick').style.transform='';}
function startGame(){finishIntro();engine.start();root.dataset.playing='true';$('begin-hint').hidden=true;root.focus({preventScroll:true});}
function jump(){startGame();input.jumpPressed=true;input.jumpHeld=true;}
function showToast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),1800);}
function handleEvent(e){
  if(e.type==='coin'){burst(e.x,e.y,0,'#f6bd3f',5);flyCoin(e.x,e.y);beep(900,1400,.06);}
  if(e.type==='jump'){beep(220,420,.13);}
  if(e.type==='bump'){const solid=engine.solids.find(s=>Math.abs(s.x-e.x)<.8&&s.kind!=='ground');const obj=solid&&objects.get('s'+solid.id);if(obj)obj.userData.bump=.16;beep(170,90,.09);}
  if(e.type==='stomp'){burst(e.x,e.y,.1,'#dbb67b',10);beep(130,360,.1);}
  if(e.type==='grow'){showToast('MUSHROOM!  ·  SIZE UP');burst(e.x,e.y,.1,'#d35442',16);beep(300,1000,.32);}
  if(e.type==='hit'){showToast('OUCH!  ·  KEEP GOING');beep(250,65,.26);}
  if(e.type==='death'){showToast(`${engine.lives} ${engine.lives===1?'LIFE':'LIVES'} LEFT`);beep(300,70,.35);}
  if(e.type==='boost'){showToast('✦  ROCKET BOOST');beep(180,1100,.55);}
  if(e.type==='boostend')showToast('NICE FLIGHT!');
  if(e.type==='gameover'){beep(300,50,.6);setTimeout(()=>{if(engine.status==='gameover')showEnd(false);},300);}
  if(e.type==='win'){showEnd(true);beep(500,1400,.5);}
}
function beep(start,end,duration){if(!soundEnabled)return;try{audioContext??=new AudioContext();if(audioContext.state==='suspended')audioContext.resume();const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),now=audioContext.currentTime;oscillator.type='sine';oscillator.frequency.setValueAtTime(start,now);oscillator.frequency.exponentialRampToValueAtTime(end,now+duration);gain.gain.setValueAtTime(.045,now);gain.gain.exponentialRampToValueAtTime(.001,now+duration);oscillator.connect(gain).connect(audioContext.destination);oscillator.start();oscillator.stop(now+duration);}catch{}}
function burst(x,y,z,color,count){for(let i=0;i<count;i++){const m=new THREE.Mesh(sphereGeometry,mat(color));m.scale.setScalar(.04+Math.random()*.035);m.position.set(x,y,z);scene.add(m);particles.push({m,vx:(Math.random()-.5)*4,vy:2+Math.random()*3,vz:(Math.random()-.5)*2,life:.55});}}
function flyCoin(x,y){if(!camera)return;const point=new THREE.Vector3(x,y,0).project(camera),sx=(point.x+1)/2*root.clientWidth,sy=(1-point.y)/2*root.clientHeight,rect=$('score-pill').getBoundingClientRect(),dx=rect.left+rect.width/2-sx,dy=rect.top+rect.height/2-sy;
  const el=document.createElement('span');el.className='flying-coin';el.textContent='AI';el.style.left=sx+'px';el.style.top=sy+'px';root.appendChild(el);el.animate([{transform:'translate(-50%,-50%) rotate(0deg) scale(1)',opacity:1},{transform:`translate(calc(-50% + ${dx*.45}px),calc(-50% + ${dy*.6-65}px)) rotate(250deg) scale(.9)`,opacity:1},{transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) rotate(540deg) scale(.35)`,opacity:0}],{duration:680,easing:'cubic-bezier(.3,.05,.4,1)'}).onfinish=()=>{el.remove();$('score-pill').animate([{transform:'scale(1.12)'},{transform:'scale(1)'}],{duration:200});};}

function getObject(key,kind,build){let obj=objects.get(key);if(!obj){obj=pools.get(kind)?.pop()||build();obj.userData.poolKind=kind;objects.set(key,obj);world.add(obj);}return obj;}
function syncWorld(){const alive=new Set();
  for(const s of engine.solids){const key='s'+s.id;alive.add(key);const obj=getObject(key,'solid:'+s.id,()=>makeSolid(s));obj.position.set(s.x,s.y+(obj.userData.bump||0),0);if(s.used&&obj.userData.cube)obj.userData.cube.material=usedMaterial;}
  for(const c of engine.coins){if(!c.active)continue;const key='c'+c.id;alive.add(key);const obj=getObject(key,'coin',makeCoin);obj.position.set(c.x,c.y+Math.sin(engine.time*2.7+c.x)*.08,.08);obj.rotation.y=engine.time*1.9+c.x*.15;}
  for(const e of engine.enemies){if(!e.alive)continue;const key='e'+e.id;alive.add(key);const obj=getObject(key,'enemy:'+e.type,()=>createEnemy(e.type));obj.position.set(e.x,e.y,0);obj.rotation.y=e.vx>=0?0:Math.PI;obj.rotation.z=Math.sin(engine.time*10+e.x)*.04;obj.scale.y=1+Math.sin(engine.time*10)*.025;}
  for(const m of engine.mushrooms){if(!m.active)continue;const key='m'+m.id;alive.add(key);const obj=getObject(key,'mushroom',createMushroom);obj.position.set(m.x,m.y,0);}
  for(const [key,obj] of objects){if(alive.has(key))continue;world.remove(obj);objects.delete(key);const kind=obj.userData.poolKind;if(kind.startsWith('solid:')){obj.userData.ownedGeometries?.forEach(g=>g.dispose());continue;}const pool=pools.get(kind)||[];if(pool.length<60)pool.push(obj);pools.set(kind,pool);}
}

function updateHUD(){const score=engine.score,boosted=engine.boostTime>0,cache=[score,engine.lives,engine.player.big,engine.boostGoal,engine.boostCharge,Math.floor(engine.boostTime*10)].join(':');if(cache===hudCache)return;hudCache=cache;$('score').textContent=String(score).padStart(4,'0');if(score>best){best=score;try{sessionStorage.setItem('rooster-rush-local-best',String(best));}catch{}}$('best').textContent=String(best).padStart(4,'0');$('percent').textContent=Math.min(100,Math.round(score/100));$('lives').innerHTML=Array.from({length:3},(_,i)=>`<span style="opacity:${i<engine.lives?1:.2}">♥</span>`).join('');$('lives').setAttribute('aria-label',`${engine.lives} lives remaining`);$('charge').textContent=boosted?'BOOST':`${Math.floor(engine.boostCharge)}/${engine.boostGoal}`;$('meter-fill').style.width=(boosted?engine.boostTime/5:engine.boostCharge/engine.boostGoal)*100+'%';$('meter-fill').style.background=boosted?'#e4a123':'#22180f';$('big-tag').hidden=!engine.player.big;}
function showModal(id){previousFocus=document.activeElement;paused=true;clearInput();$('modal-layer').hidden=false;for(const el of document.querySelectorAll('.modal'))el.hidden=el.id!==id;$(id).querySelector('button')?.focus();}
function closeModal(force=false){if($('modal-layer').hidden)return;if(engine.status==='gameover'&&force!==true)return;if(engine.status==='won')engine.status='playing';$('modal-layer').hidden=true;clearInput();paused=false;root.focus({preventScroll:true});}
function showEnd(won){$('end-title').textContent=won?'You’re hired.':'Game over.';$('end-eyebrow').textContent=won?'10,000 POINTS. ONE VERY GOOD CHICKEN.':'ONE MORE RUN?';$('end-copy').textContent=won?'You did it! 10,000 points and a very impressive résumé. careers@notrealcompany.com — a fictional company, a very real achievement.':`You scored ${engine.score.toLocaleString()} points. Best this session: ${best.toLocaleString()}. The next adventure is one jump away.`;$('continue').hidden=!won;$('restart').textContent=won?'New adventure ↗':'Try again ↗';showModal('end-modal');}
function bindControls(){
  $('start').onclick=()=>{jump();setTimeout(()=>input.jumpHeld=false,130);};$('reset').onclick=resetGame;$('mobile-reset').onclick=resetGame;$('help').onclick=()=>{finishIntro();showModal('help-modal');};document.querySelector('.close').onclick=closeModal;$('restart').onclick=resetGame;$('continue').onclick=()=>{engine.status='playing';closeModal();};$('resume').onclick=closeModal;$('pause').onclick=()=>{finishIntro();paused?closeModal():showModal('pause-modal');};$('sound').onclick=()=>{soundEnabled=!soundEnabled;$('sound').textContent=soundEnabled?'♫':'♪';$('sound').setAttribute('aria-label',soundEnabled?'Mute sound':'Enable sound');beep(660,880,.12);root.focus({preventScroll:true});};
  window.addEventListener('keydown',e=>{const keys=['ArrowLeft','ArrowRight','ArrowUp','Space','KeyA','KeyD','KeyW','KeyP','KeyR','Escape'];if(!keys.includes(e.code))return;if(e.target instanceof HTMLButtonElement&&e.code==='Space')return;e.preventDefault();if(e.repeat)return;if(e.code==='Escape'){if(!$('modal-layer').hidden&&engine.status!=='gameover')closeModal();return;}if(e.code==='KeyR'){resetGame();return;}if(e.code==='KeyP'){paused?closeModal():showModal('pause-modal');return;}if(paused)return;if(['ArrowLeft','KeyA'].includes(e.code)){startGame();input.left=true;}if(['ArrowRight','KeyD'].includes(e.code)){startGame();input.right=true;}if(['ArrowUp','KeyW','Space'].includes(e.code))jump();});
  window.addEventListener('keyup',e=>{if(['ArrowLeft','KeyA'].includes(e.code))input.left=false;if(['ArrowRight','KeyD'].includes(e.code))input.right=false;if(['ArrowUp','KeyW','Space'].includes(e.code))input.jumpHeld=false;});
  window.addEventListener('blur',()=>{clearInput();if(engine.status==='playing'&&!paused)showModal('pause-modal');});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();if(engine.status==='playing'&&!paused)showModal('pause-modal');}});
  const stick=$('joystick');const moveStick=e=>{const r=stick.getBoundingClientRect(),dx=Math.max(-30,Math.min(30,e.clientX-r.left-r.width/2));$('stick').style.transform=`translateX(${dx}px)`;input.left=dx<-8;input.right=dx>8;};stick.onpointerdown=e=>{e.preventDefault();if(paused||stickPointer!==null)return;startGame();stickPointer=e.pointerId;stick.setPointerCapture(stickPointer);moveStick(e);};stick.onpointermove=e=>{if(!paused&&e.pointerId===stickPointer)moveStick(e);};const release=e=>{if(e.pointerId!==stickPointer)return;stickPointer=null;input.left=input.right=false;$('stick').style.transform='';};stick.onpointerup=release;stick.onpointercancel=release;stick.onlostpointercapture=release;
  $('jump').onpointerdown=e=>{e.preventDefault();if(paused||jumpPointer!==null)return;jumpPointer=e.pointerId;$('jump').setPointerCapture(jumpPointer);jump();};for(const type of ['pointerup','pointercancel','lostpointercapture'])$('jump').addEventListener(type,e=>{if(e.pointerId===jumpPointer){jumpPointer=null;input.jumpHeld=false;}});
  $('modal-layer').addEventListener('keydown',e=>{if(e.key!=='Tab')return;const list=[...document.querySelector('.modal:not([hidden])').querySelectorAll('button:not([hidden])')];if(e.shiftKey&&document.activeElement===list[0]){e.preventDefault();list.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===list.at(-1)){e.preventDefault();list[0].focus();}});
  window.addEventListener('resize',()=>{if(isHandheld()&&Math.abs(innerWidth-lastViewportWidth)>2){clearInput();if(engine.status==='playing'&&!paused)showModal('pause-modal');}lastViewportWidth=innerWidth;resize();});
}
function resize(){if(!renderer)return;const w=root.clientWidth,h=root.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();const mobile=isHandheld();root.classList.toggle('mobile-game',mobile);$('begin-hint').innerHTML=mobile?'<span>点击右下角「跳跃」开始</span>':'<kbd>SPACE</kbd><span>TO BEGIN</span>';if(mobile){$('start').textContent='开始游戏';$('help').textContent='玩法';$('reset').textContent='重开';$('jump').textContent='跳跃';$('pause').setAttribute('aria-label','暂停游戏');$('resume').textContent='继续游戏';$('restart').textContent='再玩一次';$('continue').textContent='继续游戏';$('modal-title').textContent='移动、跳跃、收集金币';$('pause-title').textContent='休息一下';}if(coop)coop.position.x=w/h<.85?-3:-11;}
function smooth(a,b,t){return a+(b-a)*(1-Math.exp(-t));}
function frame(now){requestAnimationFrame(frame);const dt=Math.min(.05,(now-lastTime)/1000||0);lastTime=now;if(document.hidden)return;
  if(!introDone){intro+=dt;if(intro>3.7)finishIntro();}
  if(!paused&&introDone){accumulator+=dt;while(accumulator>=1/120){engine.step(1/120,input);input.jumpPressed=false;accumulator-=1/120;}}
  syncWorld();updateHUD();const p=engine.player,mobile=camera.aspect<.85;
  const desiredScale=(p.big?1.44:.96),targetX=p.x+(mobile?4.3:1.15);
  cameraX=smooth(cameraX,targetX,dt*5);cameraY=smooth(cameraY,Math.max(0,p.y-(mobile?2.5:3.4))*.65,dt*3);
  let cz=mobile?41.7:25.9,lookY=(mobile?10.24:7.49)+cameraY;
  camera.fov=mobile?42:36;camera.position.set(cameraX,lookY+cz*.0875,cz);camera.lookAt(cameraX,lookY,0);
  rooster.position.set(p.x,p.y,0);rooster.scale.setScalar(smooth(rooster.scale.x,desiredScale,dt*12));let heading=p.facing<0?Math.PI:0;rooster.rotation.y=smooth(rooster.rotation.y,heading,dt*14);rooster.rotation.z=smooth(rooster.rotation.z,p.grounded?Math.sin(engine.time*13)*Math.min(Math.abs(p.vx)*.008,.05):-.1*(p.facing||1),dt*9);
  rooster.visible=p.invincible<=0||Math.floor(engine.time*12)%2===0;
  const parts=rooster.userData,run=Math.min(1,Math.abs(p.vx)/4),swing=Math.sin(engine.time*17)*.65*run;
  if(parts.leftLeg)parts.leftLeg.rotation.z=swing;if(parts.rightLeg)parts.rightLeg.rotation.z=-swing;
  if(parts.leftWing)parts.leftWing.rotation.x=p.grounded?.08:Math.sin(engine.time*24)*.5;if(parts.rightWing)parts.rightWing.rotation.x=p.grounded?-.08:-Math.sin(engine.time*24)*.5;
  if(!introDone){const t=Math.max(0,Math.min(1,(intro-2)/1.7)),ease=t*t*(3-2*t);world.visible=t>0;scenery.visible=t>0;const introZ=mobile?15:9.3;camera.position.set(0,4.2*(1-ease)+(lookY+cz*.0875)*ease,introZ*(1-ease)+cz*ease);camera.lookAt(cameraX*ease,3.9*(1-ease)+lookY*ease,0);rooster.position.set(p.x,2.3*(1-ease),0);rooster.scale.setScalar(2.05*(1-ease)+desiredScale*ease);rooster.rotation.y=-Math.PI/2*(1-ease);$('intro-bubble').style.opacity=String(1-Math.min(1,t*2));}else{world.visible=scenery.visible=true;}
  camera.updateProjectionMatrix();const sun=scene.userData.sun;sun.position.x=cameraX-6;sun.target.position.set(cameraX,0,0);rocket.visible=engine.boostTime>0;rocket.position.set(p.x,p.y-.85,0);if(rocket.visible){rooster.rotation.z=-.14;if(Math.random()<.5)burst(p.x-1.55,p.y-.4,0,'#efa842',1);}
  for(const obj of scenery.children){const data=obj.userData,base=data.baseX+cameraX*data.parallax;obj.position.x=base+Math.floor((cameraX-base+data.span/2)/data.span)*data.span;}
  for(const obj of objects.values())if(obj.userData.bump)obj.userData.bump=Math.max(0,obj.userData.bump-dt*.6);
  for(let i=particles.length-1;i>=0;i--){const q=particles[i];q.life-=dt;q.vy-=dt*12;q.m.position.x+=q.vx*dt;q.m.position.y+=q.vy*dt;q.m.position.z+=q.vz*dt;q.m.scale.multiplyScalar(Math.max(.85,1-dt*2));if(q.life<=0){scene.remove(q.m);particles.splice(i,1);}}
  renderer.render(scene,camera);
}
init();
