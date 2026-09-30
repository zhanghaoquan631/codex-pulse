import {$,TRACKS,request,session,remember,savedName,inviteUrl,playUrl,copyInvite,rankRows,showStatus} from './api.js?v=sketch-brand-1';
import {qrDataUrl} from './qr.js';

const launch=new URLSearchParams(location.search);
let roomId=launch.get('room'),room=null,busy=false,qrRoom='',pollError=false;
let createdEntry=null;
const pendingKeys=new Map();
const status=$('#lobby-status');
$('#driver-name').value=savedName()||'玩家';
$('#join-name').value=savedName()||'玩家';
if(Object.hasOwn(TRACKS,launch.get('track')))$('#track').value=launch.get('track');

function player(){const own=session(roomId);return room?.players.find(p=>p.id===own?.playerId&&!p.isBot)}
function keyFor(operation){if(!pendingKeys.has(operation))pendingKeys.set(operation,crypto.randomUUID());return pendingKeys.get(operation)}
function saveEntry(value,name,intent){
 const previous=session(value.room.id),same=previous?.playerId===value.playerId;
 return remember(value.room.id,{...(same?previous:{}),playerId:value.playerId,token:value.token,name,firstEntry:true,autoDrive:false,autoStart:intent==='ai',opponentMode:intent==='ai'?'ai':'friends'});
}
function refreshActions(){
 for(const button of $('#create-form').querySelectorAll('button[type="submit"]'))button.disabled=busy;
 for(const button of $('#join-form').querySelectorAll('button[type="submit"]'))button.disabled=busy;
 const mine=player();
 $('#copy-link').disabled=busy||!room;
 $('#choose-ai').disabled=busy||!mine||room?.status==='finished'||!!mine?.finishedAt;
 $('#choose-ai').textContent='挑战 AI';
 $('#choose-ai').title=!mine?'先填写名字加入比赛':'你亲自驾驶，与噩梦级 AI 对手争夺名次';
 $('#enter-race').setAttribute('aria-disabled',busy?'true':'false');
}
function render(value){
 if(room&&value.id===room.id&&(value.revision<room.revision||value.revision===room.revision&&value.serverNow<room.serverNow))return;
 room=value;roomId=room.id;
 const previousChoice=session(roomId);
 if(previousChoice?.autoDrive)remember(roomId,{...previousChoice,autoDrive:false,firstEntry:true});
 $('#create-panel').hidden=true;$('#room-panel').hidden=false;$('#new-room').hidden=false;
 $('#room-heading').textContent=TRACKS[room.trackId]||'极限竞技';
 $('#room-meta').textContent=`6 辆车 · ${room.laps} 圈 · 噩梦级 AI`;
 $('#room-stage').textContent=({lobby:'等待发车',countdown:'即将发车',racing:'比赛进行中',finished:'比赛已结束'})[room.status]||'发车区';
 const own=session(roomId),mine=player();rankRows($('#starting-grid'),room,own?.playerId);
 $('#join-form').hidden=!!mine||room.status==='finished';$('#enter-race').hidden=!mine;
 $('#enter-race').textContent=room.status==='finished'?'查看领奖台 →':room.status==='lobby'?'进入起跑区 →':'进入比赛 →';
 $('#enter-race').href=playUrl(room);
 $('#room-help').textContent=room.status==='finished'?'本场比赛已结束，可进入领奖台查看名次。':room.hostId===own?.playerId?'你亲自驾驶。邀请朋友一起参赛，或挑战其余车位的噩梦级 AI 对手。':'你亲自驾驶，与好友和 AI 对手同场竞争，由房主统一发车。';
 $('#invite-link').value=inviteUrl(roomId);
 if(qrRoom!==roomId){$('#invite-qr').src=qrDataUrl(inviteUrl(roomId));qrRoom=roomId;}
 document.title=`${TRACKS[room.trackId]} · 极限竞技`;
 refreshActions();
}
function rememberRoomInUrl(){const u=new URL(location.href);u.searchParams.set('room',roomId);u.searchParams.delete('intent');history.replaceState(null,'',u)}
async function share(copy=true){
 if(!room)return;$('#invite-card').hidden=false;
 const own=session(roomId);if(own)remember(roomId,{...own,autoDrive:false,autoStart:false,opponentMode:'friends'});
 if(!copy){$('#invite-link').focus();$('#invite-link').select();showStatus(status,'邀请链接和二维码已准备好，发给好友即可加入。');return}
 try{await copyInvite(room);showStatus(status,'邀请已复制。打开微信，粘贴给好友即可。')}
 catch{$('#invite-link').focus();$('#invite-link').select();showStatus(status,'邀请链接和二维码已准备好。长按或选中链接复制给好友。')}
}
async function challengeAI(){
 const own=session(roomId),mine=player();if(!own||!mine)throw Error('请先填写名字加入比赛。');
 if(room.status==='finished'||mine.finishedAt)throw Error('本场已结束，请进入领奖台查看结果。');
 // AI refers to the opponents. The participant always drives their own car;
 // clear legacy delegation preferences before entering the game session.
 remember(roomId,{...own,autoDrive:false,autoStart:true,firstEntry:true,opponentMode:'ai'});
 showStatus(status,'正在进入赛道。你亲自驾驶，挑战噩梦级 AI 对手。');
 location.href=playUrl(room);
}
async function submit(form,create,intent='invite'){
 if(busy)return;busy=true;refreshActions();
 showStatus(status,create?'正在准备比赛…':'正在预留发车位…');
 try{
  const name=(create?$('#driver-name'):$('#join-name')).value.trim()||'玩家';
  const trackId=$('#track').value;
  const operation=create?`create:${name}:${trackId}`:`join:${roomId}:${name}`;
  // Keep the creation receipt if the later navigation/share step fails. The
  // stable key also lets the API retry an unobserved successful POST safely.
  const value=create&&createdEntry?createdEntry:await request(create?null:roomId,create?'':'join',create?{name,trackId}:{name},undefined,{idempotencyKey:keyFor(operation)});
  if(create)createdEntry=value;
  saveEntry(value,name,create?intent:'invite');
  render(value.room);rememberRoomInUrl();
  if(create&&intent==='ai')await challengeAI();
  else if(create)await share(false);
  else showStatus(status,'发车位已就绪。你亲自驾驶，可以邀请好友或挑战 AI 对手。');
 }catch(error){showStatus(status,error.message,true)}
 finally{busy=false;refreshActions()}
}
$('#create-form').addEventListener('submit',e=>{e.preventDefault();submit(e.currentTarget,true,e.submitter?.value==='ai'?'ai':'invite')});
$('#join-form').addEventListener('submit',e=>{e.preventDefault();submit(e.currentTarget,false)});
$('#enter-race').addEventListener('click',e=>{if(busy||!room)e.preventDefault()});
$('#copy-link').addEventListener('click',()=>{if(!busy)share()});
$('#choose-ai').addEventListener('click',async()=>{
 if(busy)return;busy=true;refreshActions();showStatus(status,'正在准备 AI 对战…');
 try{await challengeAI()}catch(error){showStatus(status,error.message,true)}finally{busy=false;refreshActions()}
});
async function poll(){
 if(roomId&&!busy){
  try{const result=session(roomId)?await request(roomId,'heartbeat',{}):await request(roomId);render(result.room);if(pollError){showStatus(status,'已重新连接。');pollError=false}}
  catch(error){pollError=true;showStatus(status,error.message,true);$('#new-room').hidden=false}
 }
 setTimeout(poll,1500);
}
if(roomId){$('#create-panel').hidden=true;showStatus(status,'正在打开好友的房间…')}
else if(['ai','invite'].includes(launch.get('intent')))submit($('#create-form'),true,launch.get('intent'));
poll();
