import * as THREE from 'three';
import {communityActors} from './community-actors.mjs';
import {placeSetting} from './place-setting.mjs';

const language={
 greeting:['你好，今天也出来走走？','嗨，见到你真好。','有闲来坐，喝杯茶。','你好，走累了就坐一会儿。'],
 chat:['我刚从街角的小店过来。','这条路的树荫很凉快。','等会儿一起去逛逛吧。','慢慢走，这里还有不少小巷。'],
 contest:['来比一比反应速度？','准备好了，这次认真比。','别急，等信号再出手。','友谊第一，再来一局。'],
 review:['你刚才反应真快！','这一局配合得不错。','再练一轮，肯定更熟练。','今天的街区很热闹。']
};
export function speech(kind,random=Math.random){const lines=language[kind]||language.chat;return lines[Math.min(lines.length-1,Math.floor(random()*lines.length))];}
const conversations=[
 ['你好，也来这边散步？','是啊，走一会儿再去喝茶。'],
 ['街角那家汤铺，你吃过吗？','吃过，等会儿可以一起去。'],
 ['今天这条街比昨天热闹。','花店和小吃店都开门了。'],
 ['要不要找个树荫坐一会儿？','好，慢慢逛，不用着急。'],
 ['刚才经过的咖啡店挺香。','我更想喝茶，坐下来聊聊吧。'],
 ['这边的风真舒服。','沿着步道再走一段吧。'],
 ['下次约个时间出来运动？','可以，先散步热热身。'],
 ['你拍到好看的照片了吗？','拍了几张，换个角度再看看。']
];
const themedConversations={
 tea:[['山上的茶园一层接一层。','走慢一点，看看茶树的样子。'],['闻到茶香了吗？','坐下来，慢慢喝一杯。'],['你喜欢清香一点的茶吗？','我想先闻闻香，再尝一口。'],['这段山路走得有点累了。','到前面的茶桌边歇一会儿。']],
 nature:[['树下比路中间凉快些。','我们沿着树荫走吧。'],['先看看脚下的台阶。','好，山路慢慢走。'],['这里的树叶颜色不太一样。','换个角度拍下来看看。'],['走累了要不要休息？','坐一会儿，再往前逛。']],
 waterside:[['沿着岸边走一段吧。','好，在步道里走，别靠太外。'],['你看水面的光。','等一下，我想拍张照片。'],['前面有地方坐。','歇一会儿，看看水上的船。'],['我们走到那个转角就回来？','可以，慢慢走就好。']],
 heritage:[['抬头看，这一排屋檐很有意思。','窗框上的细节也值得看看。'],['这条巷子从哪里出去？','先看路口的指示，再往里逛。'],['你拍到门楼了吗？','拍了，还想看看另一侧。'],['逛完古街再找个地方喝茶？','好，留点时间慢慢走。']],
 transport:[['先看看指示牌再走。','好，把行李带上。'],['我们在这边等一会儿吧。','可以，别挡住通道。'],['下一段路怎么走？','先到路口看看站牌。'],['过马路要等绿灯。','好，我们一起走人行横道。']],
 food:[['这份小吃闻起来很香。','慢慢尝，看看口感有什么不同。'],['你想先尝哪一种？','先选一份，再分享着吃。'],['这一口要不要蘸酱？','我先试原味。'],['找个座位再吃吧。','好，别挡住摊位前的路。']]
};
export function conversationTheme(place){
 if(!place)return 'street';if(place.kind==='food')return 'food';
 if(/courtyard|old-town/.test(place.contextModel||'')||/academy|heritage|mansion|temple|ancestral|tulou|pagoda|古建筑|古寨|古镇|古城|书院|学宫|祠堂|故居/.test([place.model,place.name].join(' ')))return 'heritage';
 const family=placeSetting(place).family;
 return family==='tea'?'tea':['forest','farmland'].includes(family)?'nature':['fishing','harbour','river','lake','headland','dune'].includes(family)?'waterside':['courtyard','arcade'].includes(family)?'heritage':family==='transport'?'transport':'street';
}
export function conversationPair(index,place){const lines=themedConversations[conversationTheme(place)]||conversations;return lines[((index%lines.length)+lines.length)%lines.length];}
export function chooseConversation(place,previous,random=Math.random){
 const lines=themedConversations[conversationTheme(place)]||conversations,n=lines.length;
 const roll=Math.min(1-Number.EPSILON,Math.max(0,random()));
 const index=previous===undefined?Math.floor(roll*n):(previous+1+Math.floor(roll*(n-1)))%n;
 return {index,lines:lines[index]};
}
export function reactionResult({pressed,ready,opponent}){if(pressed===null)return {result:'timeout',reaction:null};if(pressed<ready)return {result:'early',reaction:0};const reaction=Math.round(pressed-ready);return {result:reaction<opponent?'win':'lose',reaction};}
export function gameReview(result,random=Math.random){
 const lines={early:['抢先了，要等绿色信号。','别急，等绿灯亮起来再按。','这一局按早了，调整一下节奏。'],win:['你刚才反应真快！','这一局你赢了，再挑战一次？','眼疾手快，这次你领先了。'],lose:['街坊这次更快，再来一局吧。','差一点点，再试一次。','别着急，下一轮集中注意力。'],timeout:['这一轮没有作答，准备好再开始。','错过信号了，歇一下再来。','这局等得太久了，下一轮重新开始。']}[result];
 return lines?lines[Math.min(lines.length-1,Math.floor(random()*lines.length))]:speech('chat',random);
}
export function chooseEncounter({place,previous,mayInvite=false,review},random=Math.random){
 if(review){
  const replies={win:'这次你领先，下次再切磋。',lose:'下一局还有机会，慢慢来。',early:'等信号亮了再按就好。',timeout:'准备好了再开始，我们不着急。'};
  return {kind:'review',lines:[gameReview(review,random),replies[review]]};
 }
 if(mayInvite&&random()<.25){
  const invitations=[['歇一会儿，来比比反应？','好呀，等绿灯再出手。'],['要不要来一局街坊反应赛？','友谊第一，准备好了再开始。'],['看看谁眼疾手快，来挑战吗？','我来加油，你准备好了吗？']];
  return {kind:'invite',lines:invitations[Math.min(2,Math.floor(random()*3))]};
 }
 return {kind:'chat',...chooseConversation(place,previous,random)};
}
export function companionFor(a,nearby,allowed=()=>true){let nearest,distance=Infinity;for(const v of nearby){if(v===a||!allowed(v))continue;const d=v.position.distanceTo(a.position),scale=Math.max(a.scale,v.scale);if(d<scale*9&&d>scale*1.3&&d<distance){nearest=v;distance=d;}}return nearest;}
export function createEncounterMemory(cooldown=24){
 const pairs=new WeakMap();
 const remembered=(a,b,t)=>{if(!pairs.has(a))pairs.set(a,new WeakMap());pairs.get(a).set(b,t);};
 return {available(a,b,t){const last=pairs.get(a)?.get(b);return last===undefined||t<last||t-last>=cooldown;},remember(a,b,t){remembered(a,b,t);remembered(b,a,t);}};
}

export function createCommunitySocial({camera,root=document.body}){
 const bubbles=document.createElement('div');bubbles.className='community-bubbles';bubbles.setAttribute('aria-hidden','true');root.append(bubbles);
 const nodes=Array.from({length:2},()=>{const b=document.createElement('span');b.hidden=true;bubbles.append(b);return b;});
 const invite=document.createElement('button');invite.type='button';invite.className='community-invite';invite.textContent='接受挑战';invite.setAttribute('aria-label','接受附近街坊的反应赛邀请');invite.hidden=true;root.append(invite);
 let active=[],next=0,serial=0,total=0,place,lastDialogue,nextInvite=0,pendingReview,invitationCount=0;const encounters=createEncounterMemory();
 const point=new THREE.Vector3(),responders=new Set(),ambientActors=communityActors.filter(a=>a.ambientUpdate);
 function clearResponses(){for(const actor of responders)actor.clearResponse?.();responders.clear();}
 function visible(actor){if(actor.isInView&&!actor.isInView())return false;for(let o=actor.root;o;o=o.parent)if(!o.visible)return false;return !!actor.root.parent;}
 function update(t){
  clearResponses();
  for(const actor of ambientActors){
   if(!actor.ambientUpdate||!visible(actor))continue;
   point.setFromMatrixPosition(actor.root.matrixWorld).project(camera);
   if(Math.abs(point.x)<1.1&&Math.abs(point.y)<1.1&&point.z>=-1&&point.z<=1)actor.ambientUpdate(t);
  }
  if(dialog.open){nodes.forEach(n=>n.hidden=true);invite.hidden=true;return;}
  if(active[0]?.kind==='invite'&&(document.activeElement===invite||invite.matches(':hover')))active.forEach(a=>a.until=Math.max(a.until,t+2));
  if(t>=next){next=t+1;const nearby=[];
   for(const actor of communityActors){if(!visible(actor))continue;const scale=actor.getScale?.()??new THREE.Vector3().setFromMatrixScale(actor.root.matrixWorld).x;
    if(scale*3*innerHeight*camera.zoom/(camera.top-camera.bottom)<5)continue;
    const position=actor.getPosition?.()??new THREE.Vector3().setFromMatrixPosition(actor.root.matrixWorld);point.copy(position).project(camera);if(Math.abs(point.x)>.68||point.y<-.40||point.y>.45||point.z>1||point.z< -1)continue;
    nearby.push({actor,position,scale});if(nearby.length>90)break;}
   if(!active.length||t>active[0].until){active=[];
    for(let i=serial%Math.max(1,nearby.length),count=0;count<nearby.length;count++,i=(i+1)%nearby.length){const a=nearby[i],b=companionFor(a,nearby,v=>encounters.available(a.actor,v.actor,t));
     if(b){
      const chosen=chooseEncounter({place,previous:lastDialogue,mayInvite:!!place&&t>=nextInvite,review:pendingReview});
      if(chosen.kind==='chat')lastDialogue=chosen.index;
      if(chosen.kind==='invite'){nextInvite=t+45;invitationCount++;}
      if(chosen.kind==='review')pendingReview=undefined;
      encounters.remember(a.actor,b.actor,t);const until=t+(chosen.kind==='invite'?12:5);
      active=[{...a,text:chosen.lines[0],kind:chosen.kind,started:t,until},{...b,text:chosen.lines[1],kind:chosen.kind,started:t,until}];serial++;total++;break;
     }}
   }
  }
  for(const a of active){if(a.actor.getPosition)a.position.copy(a.actor.getPosition());else a.position.setFromMatrixPosition(a.actor.root.matrixWorld);}
  if(active.length&&(t>active[0].until||active.some(a=>!visible(a.actor))||active[0].position.distanceTo(active[1].position)>Math.max(active[0].scale,active[1].scale)*12))active=[];
  let showInvitation=false;
  if(!active.length){invite.hidden=true;nodes.forEach(n=>{n.hidden=true;});return;}
  const obstacles=[...document.querySelectorAll('.explore,.location-card,.top-actions,.bottom-center,.map-label:not([hidden])')].map(e=>e.getBoundingClientRect());
  active.forEach((a,i)=>{const speaking=t-a.started>=i*1.2;
   if(a.actor.respondTo){a.actor.respondTo(t,active[1-i].position,{elapsed:t-a.started,remaining:a.until-t,speaker:i});responders.add(a.actor);}
   else if(speaking)(a.actor.gesture||a.actor.pose).call(a.actor,t,!i&&t-a.started<1.2?'wave':'talk');
   if(a.actor.getPosition)point.copy(a.actor.getPosition());else point.setFromMatrixPosition(a.actor.root.matrixWorld);point.y+=a.scale*3.5;point.project(camera);const x=(point.x*.5+.5)*innerWidth,y=(-point.y*.5+.5)*innerHeight-i*38;
   const extra=a.kind==='invite'&&!i?40:0;
   const blocked=obstacles.some(r=>x+95>r.left&&x-95<r.right&&y+22+extra>r.top&&y-48<r.bottom);
   nodes[i].hidden=!speaking||t>a.until||blocked||!visible(a.actor)||a.scale*3*innerHeight*camera.zoom/(camera.top-camera.bottom)<5||x<100||x>innerWidth-100||y<100||y>innerHeight-100;
   if(!nodes[i].hidden){
    if(nodes[i].textContent!==a.text)nodes[i].textContent=a.text;nodes[i].style.transform=`translate(${x}px,${y}px) translate(-50%,-100%)`;
    if(i&&!nodes[0].hidden){
     const first=nodes[0].getBoundingClientRect(),second=nodes[i].getBoundingClientRect();
     if(second.right>first.left&&second.left<first.right&&second.bottom>first.top-8&&second.top<first.bottom+8){
      const shifted={left:second.left,right:second.right,top:first.top-8-second.height,bottom:first.top-8};
      if(shifted.top<90||obstacles.some(r=>shifted.right>r.left&&shifted.left<r.right&&shifted.bottom>r.top&&shifted.top<r.bottom))nodes[i].hidden=true;
      else nodes[i].style.transform=`translate(${x}px,${shifted.bottom}px) translate(-50%,-100%)`;
     }
    }
   }
   if(!i&&a.kind==='invite'&&!nodes[i].hidden){showInvitation=true;if(document.activeElement!==invite&&!invite.matches(':hover'))invite.style.transform=`translate(${x}px,${y+5}px) translateX(-50%)`;}
  });invite.hidden=!showInvitation;for(let i=active.length;i<nodes.length;i++)nodes[i].hidden=true;
 }
 const dialog=document.createElement('dialog');dialog.className='community-game';dialog.setAttribute('aria-labelledby','community-title');
 const header=document.createElement('header'),title=document.createElement('h2');title.id='community-title';title.textContent='街坊反应赛';
 const close=document.createElement('button');close.textContent='×';close.setAttribute('aria-label','关闭街坊互动');header.append(title,close);
 const venue=document.createElement('p'),line=document.createElement('p');line.className='community-line';line.setAttribute('role','status');
 const result=document.createElement('output'),signal=document.createElement('button');signal.className='reaction-signal';signal.textContent='开始比拼';
 const chat=document.createElement('button');chat.className='community-chat';chat.textContent='和街坊聊聊';
 dialog.append(header,venue,line,signal,result,chat);root.append(dialog);
 let state='idle',timer,finishTimer,ready=0,opponent=0,score=0,round=0,restore,lastResult;
 const clear=()=>{clearTimeout(timer);clearTimeout(finishTimer);};
 function finish(pressed){if(state!=='waiting'&&state!=='ready')return;clear();const answer=reactionResult({pressed,ready,opponent});state='done';round++;if(answer.result==='win')score++;
  lastResult=answer.result;pendingReview=answer.result;line.textContent=gameReview(answer.result);
  result.textContent=`胜场 ${score} / ${round}`+(answer.result==='early'||answer.result==='timeout'?'':` · 你的反应 ${answer.reaction} 毫秒 · 对手 ${opponent} 毫秒`);signal.textContent='再来一局';signal.dataset.state='done';
 }
 signal.onclick=()=>{
  if(state==='waiting'||state==='ready'){finish(performance.now());return;}
  clear();state='waiting';line.textContent=speech('contest');signal.textContent='等待绿灯';signal.dataset.state='waiting';ready=Infinity;opponent=600+Math.floor(Math.random()*550);
  timer=setTimeout(()=>{state='ready';ready=performance.now();signal.textContent='现在点击';signal.dataset.state='ready';finishTimer=setTimeout(()=>finish(null),Math.max(2400,opponent+500));},1400+Math.random()*1900);
 };
 chat.onclick=()=>{line.textContent=lastResult&&Math.random()<.35?gameReview(lastResult):conversationPair(Math.floor(Math.random()*24),place)[0];};close.onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{clear();state='idle';active=[];next=0;invite.hidden=true;(restore===invite?document.querySelector('.community-open'):restore)?.focus({preventScroll:true});});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){clear();if(dialog.open){state='idle';signal.textContent='继续比拼';signal.dataset.state='idle';line.textContent='已暂停，回来后再开始。';}}});
 function open(value){place=value;clear();clearResponses();restore=document.activeElement;state='idle';venue.textContent=place?.name||'潮汕街坊';line.textContent=speech('greeting');signal.textContent='开始比拼';signal.dataset.state='idle';result.textContent=`胜场 ${score} / ${round}`;invite.hidden=true;if(!dialog.open)dialog.showModal();}
 invite.onclick=()=>open(place);
 return {update,setPlace(value){clearResponses();if(place?.id!==value?.id)pendingReview=undefined;place=value;lastDialogue=undefined;active=[];next=0;invite.hidden=true;nodes.forEach(n=>n.hidden=true);},open,getState:()=>({conversations:total,visibleBubbles:nodes.filter(n=>!n.hidden).length,respondingActors:responders.size,actors:communityActors.length,round,score,game:state,lastResult,theme:conversationTheme(place),encounter:active[0]?.kind||null,invitations:invitationCount,invitationVisible:!invite.hidden})};
}
