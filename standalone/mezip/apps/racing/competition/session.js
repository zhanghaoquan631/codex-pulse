import {$,TRACKS,request,session,remember,inviteUrl,copyInvite,rankRows,time,pose,showStatus} from './api.js?v=sketch-brand-1';

const query=new URLSearchParams(location.search),roomId=query.get('room');
if(query.get('mode')==='competition'&&roomId)boot();

async function boot(){
 document.documentElement.dataset.competition='on';
 const css=document.createElement('link');css.rel='stylesheet';css.href='/racing/competition/competition.css';document.head.append(css);
 const layer=document.createElement('section');layer.id='competition-race';layer.setAttribute('aria-label','极限竞技');
 layer.innerHTML=`
  <div class="race-topbar"><strong>极限竞技</strong><span id="race-position">— / 6</span><span id="race-lap">3 圈</span><span class="red">噩梦级</span></div>
  <details class="race-board" open><summary>实时排名 <span id="race-clock">00:00</span></summary><ol id="race-ranks"></ol><button id="race-results" class="text-button" hidden>查看成绩</button></details>
  <p id="race-message" class="race-message" role="status" aria-live="polite"></p>
  <div class="race-grid" id="race-grid" hidden><p id="grid-note"></p><button id="race-start" class="primary" hidden>好友已就位 · 发车</button><a id="grid-back" class="text-button">返回房间</a></div>
  <div class="race-countdown" id="race-countdown" hidden><strong id="countdown-number"></strong><span>准备好，争夺第一名。</span></div>
  <nav class="race-actions" aria-label="比赛选项"><button id="race-invite">邀请好友</button><button id="race-ai" class="primary" disabled>挑战 AI</button></nav>
  <div class="touch-controls" aria-label="触屏驾驶" hidden><div><button data-input="left" aria-label="向左转">←</button><button data-input="right" aria-label="向右转">→</button></div><div><button class="pedal" data-input="brake" aria-label="刹车">刹车</button><button class="pedal accelerator" data-input="throttle" aria-label="加速">油门</button></div></div>
  <div id="race-share" class="race-overlay" hidden><div class="race-modal"><p class="eyebrow">RACE WITH FRIENDS</p><h2>邀请好友，一起争第一。</h2><p>把这个链接发给好友，就能加入同一场比赛。</p><input id="race-share-link" aria-label="好友邀请链接" readonly><button id="race-copy" class="cup-button">复制邀请</button><button id="race-share-close" class="cup-button secondary">返回赛道</button></div></div>
  <div id="race-loading" class="race-overlay"><div class="race-modal"><p class="eyebrow">NIGHTMARE CUP</p><h2 id="loading-title">正在准备赛车…</h2><p id="loading-message">你来驾驶自己的赛车，其余对手正在进入赛道。</p><a class="cup-button secondary" id="loading-back">返回房间</a></div></div>
  <div id="race-result" class="race-overlay" hidden><div class="race-modal"><p class="eyebrow">FINAL CLASSIFICATION</p><h2>领奖台，只留三个位置。</h2><div id="podium" class="podium"></div><p id="result-note"></p><button id="race-restart" class="cup-button" hidden>再战一场 →</button><a class="cup-button secondary" id="result-back">返回房间</a><button id="hide-results" class="cup-button secondary">继续观看赛道</button></div></div>`;
 document.body.append(layer);
 for(const id of ['grid-back','loading-back','result-back'])$('#'+id).href=inviteUrl(roomId);
 $('#race-share-link').value=inviteUrl(roomId);
 if(matchMedia('(max-width:760px)').matches)layer.querySelector('.race-board').open=false;
 const credential=session(roomId);
 let room=null,network=null,bridge=null,ready=false,running=true,busy=false,controlBusy=false;
 let seq=Date.now()*100,clockOffset=0,lastBoard='',resultShown=false,lastResult='',restarting=false,lastControl='',lastHeartbeat=-Infinity,pollTimer,lastClock=-Infinity;
 const message=$('#race-message'),touch={left:false,right:false,throttle:false,brake:false};
 const touchControls=layer.querySelector('.touch-controls');
 function my(){return room?.players.find(p=>p.id===credential?.playerId)}
 function carPose(player){return pose(player,room,network)}
 function note(text,error=false){showStatus(message,text,error)}
 function saveChoice(patch){Object.assign(credential,patch);remember(roomId,credential)}
 function manual(){return ready&&room?.status==='racing'&&my()?.control==='human'&&!my()?.finishedAt&&!my()?.dnf}
 function applyControls(){bridge?.setInput({throttle:touch.throttle?1:0,brake:touch.brake?1:0,steer:(touch.right?1:0)-(touch.left?1:0),handbrake:false})}
 function releaseTouch(){for(const key of Object.keys(touch))touch[key]=false;layer.querySelectorAll('[data-input]').forEach(button=>button.classList.remove('pressed'));applyControls()}
 function updateButtons(){
  const player=my(),started=room?.status!=='lobby',friends=room?.players.some(p=>!p.isBot&&p.id!==credential?.playerId);
  $('#race-ai').disabled=controlBusy||!ready||!player||started||room.hostId!==credential?.playerId;
  $('#race-ai').classList.toggle('is-automatic',started);
  $('#race-ai').textContent=room?.status==='finished'?'比赛已结束':started?(friends?'好友竞速中':'人机对战中'):'挑战 AI';
  $('#race-start').disabled=controlBusy;$('#race-restart').disabled=controlBusy;
 }
 for(const button of layer.querySelectorAll('[data-input]')){
  button.addEventListener('pointerdown',event=>{event.preventDefault();if(!manual())return;button.setPointerCapture(event.pointerId);touch[button.dataset.input]=true;button.classList.add('pressed');applyControls()});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>{touch[button.dataset.input]=false;button.classList.remove('pressed');applyControls()});
 }
 layer.addEventListener('keydown',event=>{if(event.target.closest('button,a,input,details'))event.stopPropagation()});
 addEventListener('blur',releaseTouch);document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseTouch()});
 function update(value){
  const next=value.room;
  if(room&&(next.revision<room.revision||next.revision===room.revision&&next.serverNow<room.serverNow))return;
  const previous=room;room=next;network=value._network||network;
  clockOffset=room.serverNow+Math.min((network?.requestRoundTripMs||0)/2,1000)-Date.now();
  const player=my();
  if(previous&&previous.raceNumber!==room.raceNumber&&ready&&!restarting){location.reload();return}
  $('#race-position').textContent=player?`${String(player.place).padStart(2,'0')} / 6`:'观赛';$('#race-lap').textContent=`${player?.lap||1} / ${room.laps} 圈`;
  const board=JSON.stringify([room.status,room.players.map(p=>[p.id,p.name,p.place,p.lap,p.control,p.connected,p.finishedAt])]);
  if(board!==lastBoard){rankRows($('#race-ranks'),room,credential?.playerId);lastBoard=board}
  $('#race-grid').hidden=!(ready&&room.status==='lobby');
  $('#race-start').hidden=room.hostId!==credential?.playerId;
  $('#grid-note').textContent=room.hostId===credential?.playerId?'邀请好友后发车，或点击「挑战 AI」开始人机赛。':'正在等待房主发车。你来驾驶，其余空位由 AI 对手补齐。';
  updateButtons();touchControls.hidden=!manual();
  if(bridge&&ready){
   bridge.renderOpponents(room.players.filter(p=>p.id!==credential?.playerId).map(carPose));
   if(player?.control==='human'&&lastControl==='ai')bridge.teleportCar(carPose(player));
   if(player?.control==='ai'&&lastControl!=='ai')releaseTouch();
   bridge.setControlEnabled(manual());
   if(player&&(player.control==='ai'||room.status==='lobby'||room.status==='countdown'))bridge.teleportCar(carPose(player),{smooth:room.status==='racing'||room.status==='finished'});
   lastControl=player?.control||'';
  }
  $('#race-results').hidden=!(room.status==='finished'||player?.finishedAt);
  if(room.status==='finished'||player?.finishedAt){
   if(!resultShown||room.status==='finished'&&previous?.status!=='finished'){showResults();resultShown=true}
   else if(!$('#race-result').hidden)showResults();
  }else if(room.podium?.length===3&&!message.classList.contains('is-error'))note('前三名已经冲线，继续跑完你的比赛。');
 }
 function showResults(){
  const key=JSON.stringify([room.podium,room.status,room.players.map(p=>[p.id,p.finishedAt,p.control,p.place,p.dnf])]);
  if(key!==lastResult){
   lastResult=key;const podium=$('#podium');podium.replaceChildren();
   for(const index of [1,0,2]){
    const player=room.players.find(p=>p.id===room.podium?.[index]);if(!player)continue;
    const box=document.createElement('div');box.className='podium-place'+(index===0?' winner':'');
    const rank=document.createElement('b');rank.textContent=String(index+1);
    const name=document.createElement('strong');name.textContent=player.name;
    const clock=document.createElement('small');clock.textContent=time(player.finishedAt-room.startAt);
    const tag=document.createElement('small');tag.textContent=player.isBot?'噩梦级 AI':'真人车手';
    box.append(rank,name,clock,tag);podium.append(box);
   }
   $('#result-note').textContent=my()?.finishedAt?`你获得第 ${my().place} 名，用时 ${time(my().finishedAt-room.startAt)}。${room.status==='finished'?'':' 其余车手仍在冲刺，排名会继续更新。'}`:my()?.dnf?'本场未完赛。下一场再争第一。':'比赛结束。下次，在第一个弯道抢回优势。';
  }
  $('#race-restart').hidden=room.status!=='finished'||room.hostId!==credential?.playerId;$('#race-result').hidden=false;
 }
 async function act(action,body){
  if(controlBusy)throw Error('操作正在进行，请稍候。');
  controlBusy=true;updateButtons();
  try{const value=await request(roomId,action,body,credential);update(value);return value}
  catch(error){note(error.message,true);throw error}
  finally{controlBusy=false;updateButtons()}
 }
 async function start(){
  if(room.status!=='lobby')return;
  await act('start',{});saveChoice({autoStart:false});
  note('倒计时开始。你驾驶自己的赛车，与对手争夺第一。');
 }
 async function challenge(){
  if(!ready||controlBusy||!my())return;
  releaseTouch();
  try{
   if(my().control!=='human')await act('control',{mode:'human'});
   saveChoice({autoDrive:false,firstEntry:false,opponentMode:'ai'});
   if(room.hostId===credential.playerId&&room.status==='lobby'){saveChoice({autoStart:true});await start()}
   else note('你来驾驶自己的赛车，正在等待房主发车。');
  }catch{}
 }
 addEventListener('apex-competition-recover',async()=>{
  if(!ready||controlBusy)return;releaseTouch();
  try{await act('reset',{});if(my()){bridge.teleportCar(carPose(my()));bridge.setControlEnabled(manual());note('已回到当前赛段。W / ↑ 继续加速。')}}
  catch{note('复位暂时失败，请稍后重试。',true)}
 });
 $('#race-start').addEventListener('click',()=>start().catch(()=>{}));
 $('#race-ai').addEventListener('click',challenge);
 $('#race-invite').addEventListener('click',()=>{$('#race-share').hidden=false;$('#race-share-link').focus();$('#race-share-link').select()});
 $('#race-copy').addEventListener('click',async()=>{try{await copyInvite(room);$('#race-copy').textContent='已复制，发给好友吧'}catch{$('#race-share-link').focus();$('#race-share-link').select();$('#race-copy').textContent='请长按或 Ctrl+C 复制链接'}});
 $('#race-share-close').addEventListener('click',()=>{$('#race-share').hidden=true});
 $('#race-restart').addEventListener('click',async()=>{
  if(controlBusy)return;restarting=true;
  saveChoice({autoStart:credential.opponentMode==='ai',autoDrive:false});
  try{await act('restart',{});location.reload()}catch{restarting=false}
 });
 $('#hide-results').addEventListener('click',()=>{$('#race-result').hidden=true});
 $('#race-results').addEventListener('click',showResults);
 async function poll(){
  if(!running)return;
  if(restarting){pollTimer=setTimeout(poll,250);return}
  const began=performance.now();
  if(!busy&&!controlBusy){
   busy=true;
   try{
    const player=my(),car=ready&&bridge?.readCar();let value;
    if(!document.hidden&&credential&&car?.ready&&manual()){
     value=await request(roomId,'state',{seq:++seq,position:[car.position.x,car.position.y,car.position.z],quaternion:[car.quaternion.x,car.quaternion.y,car.quaternion.z,car.quaternion.w],speed:Math.abs(car.speed||0)},credential);lastHeartbeat=performance.now();
    }else if(credential&&room?.status!=='finished'&&!player?.finishedAt&&performance.now()-lastHeartbeat>=1800){
     value=await request(roomId,'heartbeat',{},credential);lastHeartbeat=performance.now();
    }else value=await request(roomId);
    update(value);
    if(value.accepted===false&&value.reason==='invalid_movement'&&my()){bridge.teleportCar(carPose(my()));note('已回到服务器确认的位置，继续比赛。')}
    else if(message.classList.contains('is-error'))note('连接已恢复，你可以继续驾驶。');
   }catch(error){note('正在恢复连接，请稍候。'+error.message,true)}
   finally{busy=false}
  }
  const interval=room?.status==='finished'?2000:!document.hidden&&manual()?250:500;
  if(running)pollTimer=setTimeout(poll,Math.max(25,interval-(performance.now()-began)));
 }
 function frame(){
  if(!running)return;
  const now=Date.now()+clockOffset,stamp=Math.floor(now/100);
  if(room&&stamp!==lastClock){
   lastClock=stamp;const seconds=Math.max(0,Math.ceil((room.startAt-now)/1000));
   $('#race-countdown').hidden=room.status!=='countdown';$('#countdown-number').textContent=seconds>0?String(seconds):'GO';
   const end=room.status==='finished'?(room.players.some(p=>p.dnf)?room.startAt+1200000:Math.max(...room.players.map(p=>p.finishedAt||room.startAt))):now;
   $('#race-clock').textContent=room.startAt&&end>room.startAt?time(Math.floor((end-room.startAt)/100)*100):'发车区';
  }
  requestAnimationFrame(frame);
 }
 try{
  if(!credential){$('#loading-title').textContent='先加入这场比赛';$('#loading-message').textContent='返回房间填写车手名，即可加入好友的发车区。';return}
  update(await request(roomId,'heartbeat',{},credential));lastHeartbeat=performance.now();
  if(room.trackId!==query.get('track')){const url=new URL(location.href);url.searchParams.set('track',room.trackId);location.replace(url);return}
  $('#loading-title').textContent=TRACKS[room.trackId]+' · 准备中';
  const deadline=Date.now()+60000;
  while(!window.apexCompetitionBridge){if(Date.now()>deadline)throw Error('赛车载入超时，请返回房间重试。');await new Promise(resolve=>setTimeout(resolve,100))}
  bridge=window.apexCompetitionBridge;poll();frame();
  await bridge.startRace(room.trackId);ready=true;
  if(!my())throw Error('你的比赛席位已失效，请重新加入。');
  bridge.teleportCar(carPose(my()));update({room,_network:network});$('#race-loading').hidden=true;
  const latest=session(roomId);if(latest?.playerId===credential.playerId)Object.assign(credential,latest);
  saveChoice({autoDrive:false,firstEntry:false});
  if(my().control!=='human'&&!my().finishedAt&&room.status!=='finished')await act('control',{mode:'human'});
  if(credential.autoStart&&room.hostId===credential.playerId&&room.status==='lobby')await start();
  note(room.status==='finished'?'比赛结束，可在排名中查看成绩。':room.status==='lobby'?(room.hostId===credential.playerId?'邀请好友后发车，或点击「挑战 AI」。':'正在等待房主发车。'):'你来驾驶。W / ↑ 加速，S / ↓ 刹车，A / D 转向。');
 }catch(error){
  if(ready){$('#race-loading').hidden=true;note(error.message,true)}
  else{$('#loading-title').textContent='暂时无法进入赛道';$('#loading-message').textContent=error.message;note(error.message,true)}
 }
 addEventListener('pagehide',()=>{running=false;clearTimeout(pollTimer);releaseTouch();bridge?.dispose()});
 addEventListener('pageshow',event=>{if(event.persisted)location.reload()});
}
