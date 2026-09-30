import {createElement,ChevronLeft,ChevronRight,Play,Pause,Focus} from 'lucide';
import './destination-controls.css';

export function mountDestinationControls({previous,next,toggle,recenter,speed}){
 const row=document.createElement('nav');row.className='destination-controls';row.setAttribute('aria-label','地点巡游');
 for(const [id,label,icon,action] of [['previous','上一站',ChevronLeft,previous],['play','从这里巡游',Play,toggle],['next','下一站',ChevronRight,next],['recenter','重新对准此处',Focus,recenter]]){
  const b=document.createElement('button');b.id='destination-'+id;b.title=label;b.setAttribute('aria-label',label);b.append(createElement(icon));b.onclick=action;row.append(b);
 }
 const select=document.createElement('select');select.id='tour-duration';select.setAttribute('aria-label','每站停留时间');
 for(const n of [9,18,30,45,60])select.add(new Option(n+'秒',n));select.value='18';select.onchange=()=>speed(Number(select.value));row.append(select);
 const status=document.createElement('output');status.className='destination-status';row.append(status);
 document.getElementById('location-card').append(row);let prior='';
 return {sync(s){
  const b=row.querySelector('#destination-play'),label=s.running?'暂停巡游':s.total&&!s.ended?'继续巡游':s.ended?'重新巡游':'从这里巡游';
  if(label!==prior){b.replaceChildren(createElement(s.running?Pause:Play));b.title=label;b.setAttribute('aria-label',label);b.setAttribute('aria-pressed',String(s.running));prior=label;}
  const text=s.total?(s.scope+' · '+(s.index+1)+'/'+s.total+(s.ended?' · 已结束':s.suspended?' · 暂停计时':s.running?' · '+Math.max(0,Math.ceil(s.seconds-s.elapsed/1000))+'秒':'')):s.scope;
  if(status.textContent!==text)status.textContent=text;
 }};
}
