import {createElement,ChevronLeft,ChevronRight,Play,Pause,Focus,Route,BookOpen,Search} from 'lucide';

export function mountDestinationControls({previous,next,toggle,recenter,speed,scope}){
  const row=document.createElement('nav');row.className='destination-controls';row.setAttribute('aria-label','地点巡游');
  for(const [id,label,icon,action] of [['previous','上一站',ChevronLeft,previous],['play','从这里巡游',Play,toggle],['next','下一站',ChevronRight,next],['recenter','重新对准此处',Focus,recenter]]){
    const b=document.createElement('button');b.id=`destination-${id}`;b.title=label;b.setAttribute('aria-label',label);b.append(createElement(icon));b.onclick=action;row.append(b);
  }
  const select=document.createElement('select');select.id='tour-duration';select.setAttribute('aria-label','每站停留时间');
  for(const n of [9,18,30,45,60])select.add(new Option(n+'秒',n));select.value='9';select.onchange=()=>speed(Number(select.value));row.append(select);
  const status=document.createElement('output');status.className='destination-status';status.textContent='全市巡游';row.append(status);
  if(scope){const range=document.createElement('select');range.id='tour-scope';range.setAttribute('aria-label','巡游范围');for(const [id,label] of [['context','当前片区'],['all','全市地点'],['island','仅鼓浪屿']])range.add(new Option(label,id));range.onchange=()=>scope(range.value);row.append(range);}
  document.getElementById('location-card').append(row);
  // Keep the existing itinerary and local-guide dialogs, with a compact toolbar.
  const shortcuts=document.createElement('div');shortcuts.className='explore-shortcuts';
  for(const [selector,label,icon] of [['.route-open','行程',Route],['.guide-open','在地指南',BookOpen]]){
    const button=document.querySelector(selector);if(!button)continue;button.replaceChildren(createElement(icon),document.createTextNode(label));shortcuts.append(button);
  }
  document.querySelector('.explore-heading').after(shortcuts);
  const search=document.querySelector('.place-search'),wrap=document.createElement('div');wrap.className='place-search-wrap';
  search.before(wrap);wrap.append(createElement(Search),search);
  let prior='';
  return {sync({running,scope,index,total,ended,elapsed=0,seconds=9,suspended}){
    select.value=String(seconds);
    const button=row.querySelector('#destination-play'),label=running?'暂停巡游':total&&!ended?'继续巡游':ended?'重新巡游':'从这里巡游';
    if(prior!==label){button.replaceChildren(createElement(running?Pause:Play));button.title=label;button.setAttribute('aria-label',label);button.setAttribute('aria-pressed',String(running));prior=label;}
    const text=total?`${scope} · ${index+1}/${total}`+(ended?' · 已结束':suspended?' · 暂停计时':running?' · '+Math.max(0,Math.ceil(seconds-elapsed/1000))+'秒':''):scope;
    if(status.textContent!==text)status.textContent=text;
  }};
}
