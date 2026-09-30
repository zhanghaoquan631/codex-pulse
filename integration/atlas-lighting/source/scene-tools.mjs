import {createElement,Camera,EyeOff,Eye,Pause,Play,Volume2,VolumeX} from 'lucide';

export function createSceneTools({renderer,scene,camera,reducedMotion,setQuality,quality}){
 let paused=reducedMotion,hidden=false,audio=null,audioOn=false,audioBusy=false;
 const row=document.createElement('div');row.className='scene-tools';row.setAttribute('role','group');row.setAttribute('aria-label','观景设置');
 const select=document.createElement('select');select.id='render-quality';select.setAttribute('aria-label','渲染画质');
 for(const [value,label] of [['high','高画质'],['balanced','均衡画质'],['light','轻量模式']]){const option=new Option(label,value);select.add(option);}select.value=quality;select.onchange=()=>setQuality(select.value);row.append(select);
 const message=document.createElement('span');message.className='scene-tool-status';message.setAttribute('role','status');row.append(message);
 let messageTimer;
 function notify(text){message.textContent=text;clearTimeout(messageTimer);messageTimer=setTimeout(()=>message.textContent='',5000);}
 function icon(button,graphic,label){button.replaceChildren(createElement(graphic));button.title=label;button.setAttribute('aria-label',label);}
 function button(id,graphic,label,action){const b=document.createElement('button');b.type='button';b.id=id;icon(b,graphic,label);b.onclick=action;row.insertBefore(b,message);return b;}
 const pause=button('scene-pause',paused?Play:Pause,paused?'继续动态':'暂停动态',()=>{paused=!paused;icon(pause,paused?Play:Pause,paused?'继续动态':'暂停动态');pause.setAttribute('aria-pressed',String(paused));});pause.setAttribute('aria-pressed',String(paused));
 const sound=button('scene-audio',VolumeX,'开启环境音',async()=>{
  if(audioBusy)return;audioBusy=true;
  try{
   if(!audio){const Context=window.AudioContext||window.webkitAudioContext;if(!Context)throw new Error('unsupported');const context=new Context(),buffer=context.createBuffer(1,context.sampleRate*4,context.sampleRate),data=buffer.getChannelData(0);let last=0;
    for(let i=0;i<data.length;i++){last=(last+(Math.random()*2-1)*.018)/1.018;data[i]=last*3;}
    const noise=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();noise.buffer=buffer;noise.loop=true;filter.type='lowpass';filter.frequency.value=650;gain.gain.value=.18;noise.connect(filter).connect(gain).connect(context.destination);noise.start();audio={context};
   }
   if(audioOn){await audio.context.suspend();audioOn=false;}else{await audio.context.resume();audioOn=audio.context.state==='running';if(!audioOn)throw new Error('blocked');}
   icon(sound,audioOn?Volume2:VolumeX,audioOn?'关闭环境音':'开启环境音');sound.setAttribute('aria-pressed',String(audioOn));
  }catch{notify('环境音未能开启，请再试一次。');}finally{audioBusy=false;}
 });sound.setAttribute('aria-pressed','false');
 const capture=button('scene-capture',Camera,'保存当前画面',async()=>{
  capture.disabled=true;
  try{renderer.render(scene,camera);const blob=await new Promise(resolve=>renderer.domElement.toBlob(resolve,'image/png'));if(!blob)throw new Error('empty');const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='chaoshan-'+new Date().toISOString().replace(/[:.]/g,'-')+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);notify('画面已导出');}catch{notify('画面保存失败，请重试。');}finally{capture.disabled=false;}
 });
 const restore=document.createElement('button');restore.id='scene-restore';restore.className='scene-restore';restore.hidden=true;restore.type='button';icon(restore,Eye,'显示界面');document.body.append(restore);
 function hide(value){hidden=value;document.body.classList.toggle('scene-clean',hidden);restore.hidden=!hidden;restore.focus({preventScroll:true});if(!hidden)hideButton.focus({preventScroll:true});}
 const hideButton=button('scene-hide',EyeOff,'隐藏界面',()=>hide(true));restore.onclick=()=>hide(false);
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&hidden)hide(false);});
 document.addEventListener('visibilitychange',()=>{if(audioOn&&audio){if(document.hidden)audio.context.suspend().catch(()=>{});else audio.context.resume().catch(()=>{});}});
 document.querySelector('.top-actions').append(row);
 return {get paused(){return paused;},getState:()=>({paused,hidden,audioOn,audioState:audio?.context.state||'not-started'})};
}
