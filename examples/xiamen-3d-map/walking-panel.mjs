import {createElement,ArrowUp,ArrowUpLeft,ArrowUpRight,ArrowLeft,ArrowRight,CornerDownLeft,Footprints,Ship,MapPin} from 'lucide';
const icons={'从起点出发':Footprints,'继续直行':ArrowUp,'左转':ArrowLeft,'右转':ArrowRight,'向左前方':ArrowUpLeft,'向右前方':ArrowUpRight,'折返':CornerDownLeft};
const element=(tag,text,className)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(className)e.className=className;return e;};
const metres=n=>Math.max(1,Math.round(n));
export function renderWalkingPanel(host,plan,onSelect){
 if(!host)return;host.replaceChildren();if(!plan?.legs?.length)return;
 host.append(element('h4','分段步行指引'));
 const stairs=plan.legs.reduce((n,l)=>n+(l.stairsSections||0),0),meters=plan.legs.reduce((n,l)=>n+(l.meters||0),0);
 const summary=element('p',`步行约 ${Math.round(meters)} 米 · ${stairs?stairs+'段已标注楼梯':'此路线未检出已标注楼梯'}`,'walking-summary');host.append(summary);
 host.append(element('p','绿线 步行 · 砖红 楼梯 · 橙色虚线 轮渡','walking-legend'));
 const live=element('p','','walking-live');live.setAttribute('role','status');live.setAttribute('aria-live','polite');host.append(live);
 const list=element('ol',null,'walking-steps');host.append(list);
 for(let li=0;li<plan.legs.length;li++){
  const leg=plan.legs[li];
  if(leg.error){list.append(element('li',leg.error,'walking-missing'));continue;}
  if(leg.kind==='ferry'){const row=element('li',null,'walking-ferry');row.append(createElement(Ship),element('span',leg.name+' · 按船票与码头指引乘船'));list.append(row);continue;}
  for(let di=0;di<(leg.directions||[]).length;di++){
   const d=leg.directions[di],item=element('li'),button=element('button'),text=element('span');button.type='button';button.dataset.walkStep=`${li}:${di}`;
   button.append(createElement(icons[d.turn]||ArrowUp));
   text.append(element('strong',d.turn+' · '+d.name),element('small',`约 ${metres(d.meters)} 米${d.kind==='steps'?' · 楼梯，级数及上下行待现场核对':''}${d.surface?' · '+d.surface:''}`));button.append(text);
   button.setAttribute('aria-label',`${d.turn}，${d.name}，约${metres(d.meters)}米，查看此段`);
   button.onclick=()=>onSelect(d);item.append(button);list.append(item);
  }
 }
 const end=element('li',null,'walking-end');end.append(createElement(MapPin),element('span','到达路线终点附近，按现场标识寻找景点入口'));list.append(end);
 host.append(element('p','按公开路网计算，非现场测绘导航。未标注楼梯不等于无障碍；台阶级数、坡度、院门和临时封路仍需现场核对。','travel-notice'));
}
export function updateWalkingPanel(host,progress,plan){
 if(!host)return;const live=host.querySelector('.walking-live');if(!live)return;
 let text='开启实时定位后显示路线进度。';
 if(progress.status==='uncertain')text='位置精度不足或尚未定位，暂不判断当前路段。';
 else if(progress.status==='off-route')text=`当前位置距路线约 ${metres(progress.distance)} 米。请先核对路口，可重新计算路线。`;
 else if(progress.status==='on-route'){
  const d=plan.legs[progress.leg].directions[progress.direction],next=plan.legs[progress.leg].directions[progress.direction+1];
  text=`当前参考：${d?.name||'步道'} · 本段剩余约 ${metres(progress.next)} 米${next?'，然后'+next.turn+'进入'+next.name:'，然后核对下一段或景点入口'}。`;
 }
 if(live.textContent!==text)live.textContent=text;
 host.querySelectorAll('[data-walk-step]').forEach(b=>{
  const active=progress.status==='on-route'&&b.dataset.walkStep===`${progress.leg}:${progress.direction}`;
  if(active)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');
 });
}
