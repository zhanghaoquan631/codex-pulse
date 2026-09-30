export const TRACKS={lagunaSeca:'Laguna Seca',apexCircuit:'APEX Circuit'};
const PREFIX='mezip:racing:competition:v1:';
export const $=(selector,root=document)=>root.querySelector(selector);
export function session(roomId){try{return JSON.parse(localStorage.getItem(PREFIX+roomId)||'null')}catch{return null}}
export function remember(roomId,value){const previous=session(roomId);const next=previous?.playerId===value.playerId?{...previous,...value}:value;localStorage.setItem(PREFIX+roomId,JSON.stringify(next));localStorage.setItem(PREFIX+'name',next.name||'车手');return next;}
export function savedName(){try{return localStorage.getItem(PREFIX+'name')||''}catch{return ''}}
export function inviteUrl(roomId){const u=new URL('/racing/competition/',location.origin);u.searchParams.set('room',roomId);return u.href;}
export function playUrl(room){const u=new URL('/racing/',location.origin);u.searchParams.set('mode','competition');u.searchParams.set('room',room.id);u.searchParams.set('track',room.trackId);return u.href;}
export function invitation(room){return `简笔画 · 极限竞技\n我在 ${TRACKS[room.trackId]} 等你争第一！6 辆车、3 圈、噩梦级 AI，来抢下领奖台。\n${inviteUrl(room.id)}`;}
export async function copyInvite(room){await navigator.clipboard.writeText(invitation(room));}
export function time(ms){if(!Number.isFinite(ms)||ms<0)return '—';const s=ms/1000;return `${Math.floor(s/60)}:${(s%60).toFixed(3).padStart(6,'0')}`;}
export function pose(player,room,network){const p=player.position||[0,0,0],q=player.quaternion||[0,0,0,1];return {...player,rank:player.place,trackId:room?.trackId,status:room?.status,raceNumber:room?.raceNumber,startAt:room?.startAt,laps:room?.laps,serverNow:room?.serverNow,simAt:room?.simAt,receivedAt:network?.receivedAt,requestRoundTripMs:network?.requestRoundTripMs,position:Array.isArray(p)?{x:p[0],y:p[1],z:p[2]}:p,quaternion:Array.isArray(q)?{x:q[0],y:q[1],z:q[2],w:q[3]}:q};}
export async function request(roomId,action,body,credentials=session(roomId),options={}){
 const method=body===undefined?'GET':'POST';
 const url='/api/racing/rooms'+(roomId?'/'+encodeURIComponent(roomId):'')+(action?'/'+action:'');
 const headers={'Accept':'application/json'};
 if(method==='POST'){headers['Content-Type']='application/json';headers['Idempotency-Key']=options.idempotencyKey||crypto.randomUUID();}
 if(credentials?.token)headers.Authorization='Bearer '+credentials.token;
 for(let attempt=0;attempt<2;attempt++){
  try{
   const started=performance.now();
   const response=await fetch(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(9000)});
   const result=await response.json().catch(()=>({error:'服务器暂时没有响应，请稍后重试。'}));
   if(!response.ok){const e=new Error(result.message||result.error?.message||'操作未完成，请重试。');e.status=response.status;e.code=result.code||result.error;throw e;}
   result._network={receivedAt:performance.now(),requestRoundTripMs:performance.now()-started};return result;
  }catch(error){if(attempt===1||error.status&&error.status<500)throw error;}
 }
}
export function showStatus(element,message,error=false){element.textContent=message;element.classList.toggle('is-error',error);}
export function rankRows(container,room,myId){
 container.replaceChildren();
 for(const p of [...room.players].sort((a,b)=>a.place-b.place)){
  const row=document.createElement('li');row.className='grid-seat'+(p.id===myId?' is-you':'');
  const rank=document.createElement('span');rank.className='grid-seat__number';rank.textContent=String(p.place||room.players.indexOf(p)+1).padStart(2,'0');
  const line=document.createElement('span');line.className='grid-seat__driver';const name=document.createElement('strong');name.textContent=p.name+(p.id===myId?' · 你':'');
  const detail=document.createElement('small');detail.textContent=p.dnf?'未完赛':p.finishedAt?'已冲线 · '+time(p.finishedAt-room.startAt):p.isBot?'噩梦级 AI':p.connected?'真人车手':'车手离线';
  line.append(name,detail);const tag=document.createElement('span');tag.className='grid-seat__tag';tag.textContent=p.finishedAt?'完赛':room.status==='racing'?`${p.lap||1} / ${room.laps} 圈`:p.id===room.hostId?'房主':p.isBot?'AI':'READY';
  row.append(rank,line,tag);container.append(row);
 }
}
