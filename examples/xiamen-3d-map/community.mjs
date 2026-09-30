export function mountCommunity({getPlace,stopTour}){
 const button=document.createElement('button');button.textContent='街坊互动';button.id='community-open';document.querySelector('.scene-settings').append(button);
 const dialog=document.createElement('dialog');dialog.className='detail-dialog community-dialog';
 dialog.innerHTML='<div class="dialog-top"><span class="eyebrow">XIAMEN · STREET LIFE</span><button aria-label="关闭街坊互动">×</button></div><h2>街坊互动</h2><p class="community-setting"></p><p class="about-note">以下人物和对话为虚构的街区体验。</p><div class="community-characters" aria-label="选择街坊"></div><p class="community-speech" role="status" aria-live="polite"></p><div class="community-actions"><button class="chat-next">聊一聊</button><button class="game-start">比比反应</button></div><button class="reaction-pad" hidden>等待信号</button><p class="reaction-result" role="status" aria-live="polite"></p>';
 document.body.append(dialog);
 const people=[{name:'散步的阿姨',lines:['沿着海边慢慢走，风景要停下来才看得清。','逛老街时，抬头看看骑楼的窗和屋檐。','今天想走哪一段？别把一天排得太满。']},{name:'年轻旅人',lines:['我想把海岛和老城分开逛，留些时间发呆。','我喜欢先看地图，再挑一条短路线步行。','换个时段回来，海边的颜色会不一样。']},{name:'街边店主',lines:['先坐一会儿，慢慢逛不着急。','小吃可以少量尝几种，留点胃口。','街区里还有许多小巷，看看路牌再往里走。']}];
 let selected=0,line=0,timer,timeout,readyAt=0,state='idle';
 const speech=dialog.querySelector('.community-speech'),pad=dialog.querySelector('.reaction-pad'),result=dialog.querySelector('.reaction-result'),start=dialog.querySelector('.game-start');
 const reset=()=>{clearTimeout(timer);clearTimeout(timeout);state='idle';pad.hidden=true;start.disabled=false;};
 function say(){speech.textContent=`${people[selected].name}：${people[selected].lines[line++%3]}`;}
 people.forEach((p,i)=>{const b=document.createElement('button');b.textContent=p.name;b.setAttribute('aria-pressed',String(i===selected));b.onclick=()=>{reset();result.textContent='';selected=i;line=0;for(const [j,item]of [...b.parentNode.children].entries())item.setAttribute('aria-pressed',String(j===i));say();};dialog.querySelector('.community-characters').append(b);});
 dialog.querySelector('.chat-next').onclick=say;
 const finish=text=>{reset();result.textContent=text;};
 start.onclick=()=>{reset();state='waiting';start.disabled=true;result.textContent='等按钮变绿再按，提前按会重新开始。';pad.hidden=false;pad.classList.remove('ready');pad.textContent='等待绿色信号';timer=setTimeout(()=>{state='ready';readyAt=performance.now();pad.classList.add('ready');pad.textContent='现在按！';timeout=setTimeout(()=>finish('这次没有作答，准备好可以再来一局。'),5000);},1200+Math.random()*1800);};
 pad.onclick=()=>{if(state==='waiting'){finish('按早了。等绿色信号出现再试一次。');return;}if(state==='ready'){const ms=Math.round(performance.now()-readyAt),opponent=260+Math.round(Math.random()*220);finish(`你的反应 ${ms} 毫秒，${people[selected].name} ${opponent} 毫秒。${ms<opponent?'你赢了！':'下次再挑战！'}`);}};
 dialog.querySelector('[aria-label="关闭街坊互动"]').onclick=()=>dialog.close();dialog.addEventListener('close',reset);
 button.onclick=()=>{stopTour();reset();result.textContent='';dialog.querySelector('.community-setting').textContent=`在${getPlace()?.name||'厦门街区'}，找个地方歇一会儿。`;say();dialog.showModal();};
}
