// Adapt the pointer-relative TiltedCard interaction used in the owner's earlier
// personal-command-center-v3 project; retain native buttons and existing layout.
const MENU_CARDS='.bestiary-entry,.animal-field-card,#chapter-grid .chapter,.record-card,.briefing-boss,.clown-gallery article,.briefing-enemies article,.briefing-kit-items article,.gear-grid article,.shop-item,.loadout-grid > button';
const HUD_CARDS='#kill-objective,.left-field-notes .location-card,#weather-card,#play-hud .status-card,.evacuation-card';
const clamp=n=>Math.max(-1,Math.min(1,n));

export function installCardTilt(){
 const fine=matchMedia('(hover: hover) and (pointer: fine) and (min-width: 761px)'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const states=new WeakMap(),moving=new Set(),hud=new Set(),marked=new Set();
 let active=null,frame=0,last=0,disposed=false,hudTimer=0;
 const enabled=()=>fine.matches&&!reduced.matches;
 const visible=node=>!!node?.isConnected&&node.getClientRects().length>0;
 function state(node){let s=states.get(node);if(!s){s={node,x:0,y:0,scale:1,tx:0,ty:0,ts:1,rect:null};states.set(node,s);}return s;}
 function paint(s){s.node.style.setProperty('--card-tilt-x',`${s.x.toFixed(3)}deg`);s.node.style.setProperty('--card-tilt-y',`${s.y.toFixed(3)}deg`);s.node.style.setProperty('--card-tilt-scale',s.scale.toFixed(4));}
 function tick(now){frame=0;const dt=Math.min(.05,Math.max(.001,(now-(last||now-16))/1000));last=now;
  for(const s of moving){if(!visible(s.node)){rest(s,true);continue;}const k=1-Math.exp(-dt/.11);s.x+=(s.tx-s.x)*k;s.y+=(s.ty-s.y)*k;s.scale+=(s.ts-s.scale)*k;
   const settled=Math.abs(s.x-s.tx)+Math.abs(s.y-s.ty)+Math.abs(s.scale-s.ts)<.008;
   if(settled){s.x=s.tx;s.y=s.ty;s.scale=s.ts;moving.delete(s);if(s.ts===1&&s.tx===0&&s.ty===0)s.node.classList.remove('ink-tilt-active');}
   paint(s);
  }
  if(moving.size)frame=requestAnimationFrame(tick);else last=0;
 }
 function target(s,x,y,scale=1){s.tx=x;s.ty=y;s.ts=scale;s.node.classList.add('ink-tilt-active');moving.add(s);if(!frame)frame=requestAnimationFrame(tick);}
 function rest(s,immediate=false){s.rect=null;if(immediate){s.x=s.y=s.tx=s.ty=0;s.scale=s.ts=1;paint(s);s.node.classList.remove('ink-tilt-active');moving.delete(s);}else target(s,0,0);}
 function reset(){if(frame)cancelAnimationFrame(frame);frame=0;last=0;clearTimeout(hudTimer);for(const s of moving)rest(s,true);for(const node of marked){const s=states.get(node);if(s)rest(s,true);}active=null;}
 function scan(root){if(!(root instanceof Element))return;for(const selector of [MENU_CARDS,HUD_CARDS]){
  const candidates=[...(root.matches(selector)?[root]:[]),...root.querySelectorAll(selector)];
  for(const node of candidates){node.classList.add('ink-tilt-card');marked.add(node);if(selector===HUD_CARDS){node.classList.add('ink-tilt-hud');hud.add(node);}}
 }}
 scan(document.body);
 const observer=new MutationObserver(records=>{let removed=false;for(const r of records){for(const node of r.addedNodes)scan(node);removed||=[...r.removedNodes].some(node=>node instanceof Element);}if(removed)for(const node of marked)if(!node.isConnected){marked.delete(node);hud.delete(node);const s=states.get(node);if(s){if(active===s)active=null;rest(s,true);}}});
 observer.observe(document.body,{childList:true,subtree:true});
 const menuAt=e=>e.target instanceof Element?e.target.closest(MENU_CARDS):null;
 function over(e){if(!enabled()||e.pointerType==='touch'||document.pointerLockElement)return;const node=menuAt(e);if(!node||node.matches(':disabled')||active?.node===node)return;
  if(active)rest(active);const s=state(node);if(!s.rect)s.rect=node.getBoundingClientRect();active=s;tiltMenu(e);
 }
 function tiltMenu(e){if(!active||e.buttons)return;const s=active,r=s.rect;if(!r||!visible(s.node)){active=null;rest(s,true);return;}
  const x=clamp((e.clientX-r.left-r.width/2)/(r.width/2)),y=clamp((e.clientY-r.top-r.height/2)/(r.height/2));
  s.node.style.setProperty('--card-light-x',`${50+x*45}%`);s.node.style.setProperty('--card-light-y',`${50+y*45}%`);target(s,-y*7,x*7,1.015);
 }
 function leave(e){if(!active||!(e.target instanceof Element)||!active.node.contains(e.target))return;if(e.relatedTarget instanceof Node&&active.node.contains(e.relatedTarget))return;rest(active);active=null;}
 function hudAvailable(){return !document.querySelector('dialog[open],#modal-layer:not([hidden]),#tactical-panel:not([hidden]),#riddle-panel:not([hidden])')&&visible(document.getElementById('play-hud'));}
 function move(e){if(!enabled()||e.pointerType==='touch')return;tiltMenu(e);
  if(!hudAvailable()){for(const node of hud){const s=states.get(node);if(s&&(s.tx||s.ty))rest(s);}return;}
  const locked=!!document.pointerLockElement,x=clamp(locked?e.movementX/45:(e.clientX/innerWidth-.5)*2),y=clamp(locked?e.movementY/45:(e.clientY/innerHeight-.5)*2);
  for(const node of hud)if(visible(node)){const s=state(node);node.style.setProperty('--card-light-x',`${50+x*35}%`);node.style.setProperty('--card-light-y',`${50+y*35}%`);target(s,-y*1.35,x*1.35);}
  if(locked){clearTimeout(hudTimer);hudTimer=setTimeout(()=>{for(const node of hud){const s=states.get(node);if(s)rest(s);}},160);}
 }
 function outside(e){if(!e.relatedTarget)reset();}
 const events=[['pointerover',over],['pointerout',leave],['pointermove',move],['pointercancel',reset],['pointerlockchange',reset],['visibilitychange',reset],['mouseout',outside]];
 for(const[name,fn]of events)document.addEventListener(name,fn,{passive:true});
 document.addEventListener('scroll',reset,{capture:true,passive:true});window.addEventListener('blur',reset);window.addEventListener('resize',reset);fine.addEventListener('change',reset);reduced.addEventListener('change',reset);
 return{dispose(){if(disposed)return;disposed=true;reset();observer.disconnect();for(const[name,fn]of events)document.removeEventListener(name,fn);document.removeEventListener('scroll',reset,true);window.removeEventListener('blur',reset);window.removeEventListener('resize',reset);fine.removeEventListener('change',reset);reduced.removeEventListener('change',reset);for(const node of marked){node.classList.remove('ink-tilt-card','ink-tilt-hud');for(const key of ['x','y','scale'])node.style.removeProperty('--card-tilt-'+key);node.style.removeProperty('--card-light-x');node.style.removeProperty('--card-light-y');}marked.clear();hud.clear();}};
}
