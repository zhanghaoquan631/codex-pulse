import {createMissionTracker,trackingDirection} from './mission-tracking.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function installMissionTracking({getState,getYaw,redrawMap}){
 const tracker=createMissionTracker(),panel=document.getElementById('tactical-panel');let category='main';
 const controls=document.createElement('section');controls.className='tracking-panel';controls.innerHTML='<div class="tracking-toolbar"><label>选择要去的地方 <select id="tracking-category"><option value="main">主线与字母</option><option value="rescue">救援</option><option value="supplies">商人与补给</option><option value="exploration">地区调查</option></select></label><button class="quiet" data-tracking="auto">自动提示主线</button><button class="quiet" data-tracking="off">停止追踪</button></div><div id="tracking-targets" class="tracking-targets"></div><p id="tracking-details" role="status"></p>';
 panel.querySelector('.dialog-heading').after(controls);
 const mapButton=document.getElementById('tactical-open'),mapLabel=document.createElement('span');mapLabel.innerHTML=mapButton.innerHTML;mapButton.replaceChildren(mapLabel);
 const compass=document.createElement('span');compass.id='tracking-compass';compass.className='tracking-compass';compass.hidden=true;compass.innerHTML='<span class="tracking-arrow" aria-hidden="true">↑</span><span><b></b><small></small></span>';mapButton.append(compass);
 const select=controls.querySelector('select');select.addEventListener('change',()=>{category=select.value;render();});
 controls.addEventListener('click',event=>{const button=event.target.closest('[data-tracking]');if(button){tracker.select(getState().level,button.dataset.tracking);render();redrawMap();update();}});
 function status(t){return !t.available?'不可用':t.completed?'已完成':t.urgent?'危急 · 先救人':'';}
 function render(){const s=getState(),r=tracker.resolve(s.level,s.player);controls.hidden=!s.level?.hunt;if(controls.hidden)return;
  controls.querySelector('#tracking-targets').innerHTML=r.items.filter(t=>t.category===category).map(t=>{const d=trackingDirection(s.level,s.player,t,getYaw()),selected=t.id===r.target?.id;return `<button class="tracking-target ${selected?'selected':''}" data-tracking="${esc(t.id)}" aria-pressed="${selected}"><b>${esc(t.label)}</b><small>${status(t)||`${Math.ceil(d.distance)} 米 · ${d.floor}`}</small></button>`;}).join('')||'<p>目前没有这类目标。</p>';
  const t=r.target;controls.querySelector('#tracking-details').textContent=t?`${r.selection==='auto'?'自动建议':'正在追踪'}：${t.label}。${t.instruction} 标记与距离表示直线方位，请沿道路、门和楼梯前进。`:'已停止追踪，地图上的任务仍可查看。';
 }
 function update(){const s=getState(),r=tracker.resolve(s.level,s.player),t=r.target;compass.hidden=s.status!=='playing'||!t;mapLabel.hidden=!compass.hidden;mapButton.classList.toggle('is-tracking',!compass.hidden);if(compass.hidden){mapButton.removeAttribute('aria-label');return;}
  const d=trackingDirection(s.level,s.player,t,getYaw());compass.classList.toggle('inactive',!t.available||t.completed);compass.querySelector('.tracking-arrow').style.transform=`rotate(${d.angle}rad)`;
  compass.querySelector('b').textContent=t.label;compass.querySelector('small').textContent=status(t)||`${d.bearing} · 直线 ${Math.ceil(d.distance)} 米\n${d.floor} · 地图 Tab`;
  compass.title=t.instruction+' 点击打开地图选择目标。';mapButton.setAttribute('aria-label',`追踪 ${t.label}，${compass.querySelector('small').textContent}，点击打开地图`);
 }
 return {render,update,target(){const s=getState();return tracker.resolve(s.level,s.player).target;},select(id){const s=getState(),ok=tracker.select(s.level,id);if(ok){const t=tracker.resolve(s.level,s.player).target;if(t){category=t.category;select.value=category;}}update();return ok;},dispose(){controls.remove();mapButton.innerHTML=mapLabel.innerHTML;mapButton.classList.remove('is-tracking');mapButton.removeAttribute('aria-label');}};
}
