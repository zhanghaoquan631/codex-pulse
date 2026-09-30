/**
 * Input-driven sports controllers. No DOM, rendering, timers, imports or network.
 * Metres; +Y up. Player is on +Z, facing -Z. All coordinates are court-local.
 * createSportsGame(type,{seed}) -> {state,getState,update,serve,hit,reset,consumeEvents}
 * update(dt,{x,z},{x,z} optional aim), serve(player?), hit(player?,aim?).
 * A hit return value means a swing was accepted. Contact is evaluated during the
 * short animation window; use lastEvent / consumeEvents for actual hit/miss.
 * Neither controller moves the player: input positions are always authoritative.
 */

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),hypot=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const finite=(v,fallback)=>Number.isFinite(v)?v:fallback;
const copy=value=>JSON.parse(JSON.stringify(value));
function randomGenerator(seed){let value=(Number(seed)||1)>>>0;return()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};}
const ball=(x=0,y=0,z=0)=>({x,y,z,vx:0,vy:0,vz:0,visible:false});
const pose=()=>({action:'idle',phase:0});
function baseState(type){return{type,phase:'ready',time:0,ball:ball(),player:{x:0,y:0,z:type==='badminton'?4.5:0},opponent:{x:0,y:0,z:type==='badminton'?-4.5:-16,heading:0,action:'idle',phase:0},score:{player:0,opponent:0},stats:{},message:'',canServe:true,canHit:false,inReach:false,recommendedPosition:{x:0,z:type==='badminton'?4.5:0},playerBounds:type==='badminton'?{minX:-3.05,maxX:3.05,minZ:.35,maxZ:6.7}:{minX:-2,maxX:2,minZ:-1,maxZ:2},landing:null,animation:{player:pose(),opponent:pose()},lastEvent:null,finished:false};}

function shell(type,options){
 const game={state:baseState(type)},events=[];let sequence=0,random=randomGenerator(options.seed??1),aim=null;
 game.getState=()=>copy(game.state);game.consumeEvents=()=>events.splice(0);
 game._event=(type,text,details={})=>{const event={id:++sequence,type,text,...details};game.state.lastEvent=event;game.state.message=text;events.push(event);if(events.length>64)events.shift();return event;};
 game._player=(p,a)=>{const s=game.state;if(p){s.player.x=finite(p.x,s.player.x);s.player.z=finite(p.z,s.player.z);}if(a&&Number.isFinite(a.x)&&Number.isFinite(a.z))aim={x:a.x,z:a.z,...a};};
 game._aim=()=>aim;game._random=()=>random();game._reset=()=>{game.state=baseState(type);random=randomGenerator(options.seed??1);aim=null;events.length=0;sequence=0;};
 return game;
}

export function createSportsGame(type,options={}){
 if(type==='baseball')return createBaseballGame(options);
 if(type==='badminton')return createBadmintonGame(options);
 throw new RangeError(`Unknown playable sport: ${type}`);
}

export function createBaseballGame(options={}){
 const game=shell('baseball',options),gravity=9.81,roundPitches=Math.max(1,Math.floor(options.pitches??10));
 let windup=0,swing=-1,swingUsed=false,hitContact=false,hitOrigin=null,pitchAge=0,pitchFlight=.95,resultTime=0;
 const refresh=()=>{
  const s=game.state,b=s.ball,p=s.player;
  s.inReach=s.phase==='pitch'&&Math.abs(b.x-p.x)<1.03&&Math.abs(b.z-(p.z-.45))<.82&&b.y>.48&&b.y<1.92&&b.z> -1.8&&b.z<1.4;
  const predictedZ=b.z+b.vz*.075,predictedY=b.y+b.vy*.075-.5*gravity*.075*.075;
  s.canHit=s.phase==='pitch'&&!swingUsed&&Math.abs(b.x+b.vx*.075-p.x)<1.03&&Math.abs(predictedZ-(p.z-.45))<.66&&predictedY>.48&&predictedY<1.92;s.canServe=['ready','result'].includes(s.phase)&&!s.finished;
  s.recommendedPosition={x:0,z:0};
  if(s.phase==='pitch'&&swing<0)s.message=s.canHit?'现在击球！鼠标左键 / K 挥棒':'看准来球，接近本垒时挥棒';
  s.opponent.action=s.animation.opponent.action;s.opponent.phase=s.animation.opponent.phase;
 };
 const finishMiss=(reason)=>{
  const s=game.state;s.stats.misses++;s.score.opponent=s.stats.misses;s.phase='result';resultTime=0;s.ball.vx=s.ball.vy=s.ball.vz=0;s.ball.visible=false;
  s.finished=s.stats.pitches>=roundPitches;
  game._event('miss',`${reason}。${s.finished?'本轮结束，点击重新开始。':'按 J 接下一球。'}`,{reason});refresh();
 };
 function launchPitch(){
  const s=game.state,b=s.ball;pitchFlight=.94+game._random()*.1;const targetX=(game._random()-.5)*.3,targetY=.94+game._random()*.22;
  Object.assign(b,{x:0,y:1.48,z:-16,vx:targetX/pitchFlight,vy:(targetY-1.48+.5*gravity*pitchFlight*pitchFlight)/pitchFlight,vz:16/pitchFlight,visible:true});
  s.phase='pitch';pitchAge=0;s.landing=null;game._event('pitch','来球了！接近本垒时按鼠标左键 / K');
 }
 function contact(){
  const s=game.state,b=s.ball,p=s.player;refresh();if(!s.inReach||hitContact)return false;
  hitContact=true;s.stats.hits++;const error=b.z-(p.z-.45),quality=clamp(1-Math.abs(error)/.95-Math.abs(b.x-p.x)*.22,.12,1),a=game._aim();
  let direction=clamp(-error*.9,-1.12,1.12);
  if(a){const dz=a.z-b.z;if(dz<-.2)direction=clamp(Math.atan2(a.x-b.x,-dz),-1.35,1.35);}
  const speed=12+21*quality,elevation=(19+21*quality)*Math.PI/180;
  hitOrigin={x:b.x,y:b.y,z:b.z};b.vx=Math.sin(direction)*Math.cos(elevation)*speed;b.vz=-Math.cos(direction)*Math.cos(elevation)*speed;b.vy=Math.sin(elevation)*speed;
  s.phase='batted';s.stats.lastQuality=quality;s.stats.lastDistance=0;
  const flightTime=(b.vy+Math.sqrt(b.vy*b.vy+2*gravity*(b.y-.045)))/gravity,airFactor=(1-Math.exp(-.08*flightTime))/.08,lx=b.x+b.vx*airFactor,lz=b.z+b.vz*airFactor;
  s.landing={x:lx,y:0,z:lz,inBounds:lz<hitOrigin.z&&Math.abs(lx-hitOrigin.x)<=hitOrigin.z-lz+.1,side:'outfield',visible:true,distance:Math.hypot(lx-hitOrigin.x,lz-hitOrigin.z)};
  game._event('hit',quality>.8?'甜蜜点！漂亮的击球。':'击中了！观察落点。',{quality});return true;
 }
 function land(previous){
  const s=game.state,b=s.ball,t=clamp((previous.y-.045)/(previous.y-b.y||1),0,1),x=previous.x+(b.x-previous.x)*t,z=previous.z+(b.z-previous.z)*t;
  b.x=x;b.y=.045;b.z=z;b.vx=b.vy=b.vz=0;const distance=hypot({x,z},hitOrigin),fair=z<hitOrigin.z&&Math.abs(x-hitOrigin.x)<=hitOrigin.z-z+.1;
  s.stats.lastDistance=distance;s.stats.bestDistance=Math.max(s.stats.bestDistance,distance);s.stats.totalDistance+=distance;
  const points=fair?Math.round(distance):0;if(!fair)s.stats.fouls++;s.stats.points+=points;s.score.player=s.stats.points;s.phase='result';resultTime=0;s.finished=s.stats.pitches>=roundPitches;
  s.landing={x,y:0,z,inBounds:fair,side:'outfield',visible:true,distance};
  game._event(fair?'fair-hit':'foul',`${fair?'安打':'界外球'}！飞行 ${distance.toFixed(1)} 米${fair?'，+'+points+' 分':''}。${s.finished?'本轮结束，点击重新开始。':'按 J 接下一球。'}`,{distance,points,fair});refresh();
 }
 game.serve=(player)=>{
  game._player(player);refresh();const s=game.state;if(!s.canServe)return false;
  if(Math.abs(s.player.x)>2.2||s.player.z< -1.2||s.player.z>2.2){game._event('position','先走回本垒打击区，再按 J。');return false;}
  windup=0;swing=-1;swingUsed=false;hitContact=false;hitOrigin=null;pitchAge=0;s.phase='windup';s.stats.pitches++;s.ball=ball(0,1.4,-16);s.ball.visible=true;s.landing=null;s.animation.player=pose();s.animation.opponent={action:'throw',phase:0};game._event('serve','投手准备投球，留意出手。');refresh();return true;
 };
 game.hit=(player,aim)=>{
  game._player(player,aim);const s=game.state;if(!['windup','pitch'].includes(s.phase)||swingUsed||s.finished)return false;
  swing=0;swingUsed=true;hitContact=false;s.stats.swings++;s.animation.player={action:'swing',phase:0};game._event('swing',s.phase==='windup'?'挥得太早，球还没出手。':'挥棒！');refresh();return true;
 };
 game.update=(dt,player,aim)=>{
  game._player(player,aim);let remaining=clamp(finite(dt,0),0,1);
  while(remaining>1e-8){const h=Math.min(1/120,remaining);remaining-=h;const s=game.state;s.time+=h;
   if(swing>=0){swing+=h;s.animation.player={action:'swing',phase:clamp(swing/.43,0,1)};if(swing>.43){swing=-1;s.animation.player=pose();if(!hitContact&&s.phase==='pitch')s.message='挥空了，等本球结束后再发球。';}}
   if(s.phase==='windup'){windup+=h;s.animation.opponent={action:'throw',phase:clamp(windup/.66,0,1)};if(windup>=.66)launchPitch();}
   else if(s.phase==='pitch'||s.phase==='batted'){
    const b=s.ball,previous={x:b.x,y:b.y,z:b.z},airborne=s.phase==='batted',drag=airborne?.08:0;
    b.x+=b.vx*h;b.z+=b.vz*h;b.y+=b.vy*h-.5*gravity*h*h;b.vy-=gravity*h;
    if(drag){const factor=Math.exp(-drag*h);b.vx*=factor;b.vz*=factor;}
    if(!airborne){pitchAge+=h;s.animation.opponent={action:'throw',phase:clamp(.6+pitchAge*.7,0,1)};if(swing>=.07&&swing<=.22)contact();if(s.phase==='pitch'&&(b.z>2||b.y<.045))finishMiss(swingUsed?'挥空':'漏击');}
    else if(b.y<=.045)land(previous);
   }else if(s.phase==='result'){resultTime+=h;if(resultTime>.7)s.animation.opponent=pose();}
  }
  refresh();return game.state;
 };
 game.reset=()=>{game._reset();windup=0;swing=-1;swingUsed=false;hitContact=false;hitOrigin=null;resultTime=0;const s=game.state;s.stats={pitches:0,hits:0,misses:0,fouls:0,swings:0,points:0,bestDistance:0,lastDistance:0,totalDistance:0,lastQuality:0,roundPitches};s.message='站在本垒，J 发球 · 鼠标左键 / K 挥棒；每球只有一次挥棒机会。';refresh();return s;};
 game.reset();return game;
}

// Exact constant-gravity + linear-air-drag step. A shuttle slows visibly after a hit.
export function advanceShuttle(position,velocity,dt,{gravity=9.81,drag=.65}={}){
 const h=Math.max(0,finite(dt,0));
 if(drag<1e-8)return{position:{x:position.x+velocity.x*h,y:position.y+velocity.y*h-.5*gravity*h*h,z:position.z+velocity.z*h},velocity:{x:velocity.x,y:velocity.y-gravity*h,z:velocity.z}};
 const e=Math.exp(-drag*h),f=(1-e)/drag;
 return{position:{x:position.x+velocity.x*f,y:position.y+(velocity.y+gravity/drag)*f-gravity*h/drag,z:position.z+velocity.z*f},velocity:{x:velocity.x*e,y:(velocity.y+gravity/drag)*e-gravity/drag,z:velocity.z*e}};
}
export function shuttleLaunchVelocity(from,to,duration,{gravity=9.81,drag=.65}={}){
 const time=Math.max(.1,duration),factor=drag<1e-8?time:(1-Math.exp(-drag*time))/drag;
 return{x:(to.x-from.x)/factor,y:drag<1e-8?(to.y-from.y+.5*gravity*time*time)/time:(to.y-from.y+gravity*time/drag)/factor-gravity/drag,z:(to.z-from.z)/factor};
}
function descendingAt(from,velocity,height){
 const peak=velocity.y>0?Math.log(1+.65*velocity.y/9.81)/.65:0;
 if(advanceShuttle(from,velocity,peak).position.y<height)return null;
 let lo=peak,hi=Math.max(.2,peak+.2);for(let i=0;i<8&&advanceShuttle(from,velocity,hi).position.y>height;i++)hi*=1.7;
 if(advanceShuttle(from,velocity,hi).position.y>height)return null;
 for(let i=0;i<36;i++){const mid=(lo+hi)/2;if(advanceShuttle(from,velocity,mid).position.y>height)lo=mid;else hi=mid;}
 return{...advanceShuttle(from,velocity,hi).position,time:hi};
}

export function createBadmintonGame(options={}){
 const game=shell('badminton',options),court={halfWidth:3.05,halfLength:6.7,netHeight:1.55},targetScore=Math.max(2,Math.floor(options.winningScore??7)),maxScore=Math.max(targetScore,Math.floor(options.maxScore??30)),aiSpeed=Math.max(.5,finite(options.aiSpeed,3.05));
 let lastHitter=null,flight=null,serveTimer=0,pointTimer=0,swing=-1,swingContact=false,aiSwing=-1,aiReaction=0,serveOwner='player',roundMessage='',previousPlayer={x:0,z:4.5},playerVelocity={x:0,z:0};
 const validCourt=(p)=>Math.abs(p.x)<=court.halfWidth+.015&&Math.abs(p.z)<=court.halfLength+.015;
 const validPlayer=(p)=>Math.abs(p.x)<=court.halfWidth+.1&&p.z>=.25&&p.z<=court.halfLength+.1;
 const refresh=()=>{
  const s=game.state,b=s.ball;s.inReach=s.phase==='rally'&&lastHitter==='opponent'&&b.z>.05&&b.y>=.22&&b.y<=2.72&&hypot(b,s.player)<=1.28;
  s.canHit=s.inReach&&swing<0;s.canServe=s.phase==='ready'&&!s.finished;
  if(s.phase==='rally')s.message=s.canHit?'现在击球！鼠标左键 / K 挥拍':lastHitter==='opponent'?'用 WASD 靠近落点，等球到身旁再挥拍':'球已过来，准备对手的回球';
  if(s.phase==='ready')s.message=(roundMessage?roundMessage+' ':'')+(s.server==='opponent'?'对手发球回合，按 J 开球。':'按 J 发球；WASD 移动，鼠标左键 / K 击球。');
  s.opponent.action=s.animation.opponent.action;s.opponent.phase=s.animation.opponent.phase;
 };
 function scorePoint(winner,reason){
  const s=game.state;if(s.phase!=='rally')return;s.score[winner]++;s.stats.rallies++;s.stats.longestRally=Math.max(s.stats.longestRally,s.stats.currentRally);s.server=winner;
  const other=winner==='player'?'opponent':'player';s.finished=(s.score[winner]>=targetScore&&s.score[winner]-s.score[other]>=2)||s.score[winner]>=maxScore;
  s.phase=s.finished?'finished':'point';pointTimer=0;roundMessage=`${winner==='player'?'你':'对手'}得分：${reason}。`;
  const b=s.ball;b.vx=b.vy=b.vz=0;if(b.y<.04)b.y=.04;s.landing=s.landing?{...s.landing,visible:true}:null;
  game._event('point',roundMessage+(s.finished?`${winner==='player'?'你赢得了':'对手赢得了'}本场比赛！点击重新开始。`:''),{winner,reason,score:{...s.score}});refresh();
 }
 function launch(owner,origin,target,style='clear'){
  const s=game.state;let duration=style==='serve'?1.42:style==='smash'?Math.max(.54,Math.abs(target.z-origin.z)/12):style==='drop'?1.07:style==='lift'?1.8:1.58;
  if(style==='clear')duration+=Math.max(0,Math.abs(target.z-origin.z)-8)*.055;
  const velocity=shuttleLaunchVelocity(origin,{...target,y:.035},duration);
  s.ball={...origin,vx:velocity.x,vy:velocity.y,vz:velocity.z,visible:true};lastHitter=owner;s.lastHitter=owner;s.phase='rally';s.stats.currentRally++;if(owner==='player')s.stats.playerHits++;else s.stats.opponentHits++;
  const landing=descendingAt(origin,velocity,.035),intercept=descendingAt(origin,velocity,1.22)||landing;
  s.landing=landing?{x:landing.x,y:0,z:landing.z,inBounds:validCourt(landing),side:landing.z>0?'player':'opponent',visible:true}:null;
  flight={origin:{...origin},velocity,intercept,age:0};aiReaction=.12+game._random()*.09;
  if(owner==='opponent'&&intercept)s.recommendedPosition={x:clamp(intercept.x,-3.05,3.05),z:clamp(intercept.z,.35,6.7)};
  else s.recommendedPosition={x:0,z:4.3};
  game._event(owner==='player'?'hit':'opponent-hit',owner==='player'?'击球成功，准备下一拍。':'对手回球了，用 WASD 靠近落点。',{owner,style});
 }
 function returnPlayer(){
  const s=game.state,b=s.ball;refresh();if(!s.inReach||swingContact)return false;
  swingContact=true;const a=game._aim(),defaultX=clamp(-s.player.x*.65+playerVelocity.x*.32,-2.7,2.7),target={x:a?clamp(a.x,-7,7):defaultX,z:a?clamp(a.z,-12,12):-4.8};
  let style=a?.shot||'clear';if(!['clear','smash','drop','lift'].includes(style))style='clear';
  if(style==='drop'&&!a?.z)target.z=-1.15;if(style==='smash'&&!a?.z)target.z=-3.7;
  launch('player',{x:b.x,y:b.y,z:b.z},target,style);return true;
 }
 function returnAI(){
  const s=game.state,b=s.ball,o=s.opponent;
  if(s.phase!=='rally'||lastHitter!=='player'||b.z>=-.05||b.y<.24||b.y>2.5||b.vy>1.2||hypot(b,o)>1.1||aiSwing>=0)return false;
  const side=game._random()<.5?-1:1,target={x:side*(.9+game._random()*1.65),z:3.55+game._random()*2.15};
  aiSwing=0;s.animation.opponent={action:'swing',phase:0};launch('opponent',{x:b.x,y:b.y,z:b.z},target,'clear');return true;
 }
 function launchServe(){
  const s=game.state,owner=serveOwner,source=owner==='player'?s.player:s.opponent,origin={x:source.x,y:.95,z:source.z+(owner==='player'?-.35:.35)};
  const target=owner==='player'?{x:clamp(-source.x*.7+.45,-2.4,2.4),z:-4.9}:{x:(game._random()-.5)*3.8,z:4.2+game._random()*.8};
  launch(owner,origin,target,'serve');game._event('serve',owner==='player'?'发球！准备对手回球。':'对手发球，移动到落点附近接球。',{owner});
 }
 game.serve=(player)=>{
  game._player(player);refresh();const s=game.state;if(!s.canServe)return false;
  if(!validPlayer(s.player)){game._event('position','请回到自己半场的边线内，再按 J 发球。');return false;}
  s.phase='serve';serveTimer=0;swing=-1;aiSwing=-1;swingContact=false;flight=null;s.stats.currentRally=0;serveOwner=s.server;s.ball=ball(serveOwner==='player'?s.player.x:s.opponent.x,.95,serveOwner==='player'?s.player.z-.35:s.opponent.z+.35);s.ball.visible=true;s.landing=null;s.animation[serveOwner]={action:'serve',phase:0};game._event('serve-ready',serveOwner==='player'?'准备发球。':'对手准备发球。');refresh();return true;
 };
 game.hit=(player,aim)=>{
  game._player(player,aim);const s=game.state;if(s.phase!=='rally'||swing>=0||s.finished)return false;
  swing=0;swingContact=false;s.stats.swings++;s.animation.player={action:'swing',phase:0};game._event('swing','挥拍！');refresh();return true;
 };
 game.update=(dt,player,aim)=>{
  const delta=clamp(finite(dt,0),0,1);game._player(player,aim);const s0=game.state;playerVelocity={x:clamp((s0.player.x-previousPlayer.x)/Math.max(delta,.001),-6,6),z:clamp((s0.player.z-previousPlayer.z)/Math.max(delta,.001),-6,6)};previousPlayer={x:s0.player.x,z:s0.player.z};let remaining=delta;
  while(remaining>1e-8){const h=Math.min(1/120,remaining);remaining-=h;const s=game.state;s.time+=h;
   if(swing>=0){swing+=h;s.animation.player={action:'swing',phase:clamp(swing/.36,0,1)};if(swing>.36){if(!swingContact){s.stats.misses++;game._event('miss','挥空了，靠近来球再挥拍。');}swing=-1;s.animation.player=pose();}}
   if(aiSwing>=0){aiSwing+=h;s.animation.opponent={action:'swing',phase:clamp(aiSwing/.4,0,1)};if(aiSwing>.4){aiSwing=-1;s.animation.opponent=pose();}}
   if(s.phase==='serve'){serveTimer+=h;s.animation[serveOwner]={action:'serve',phase:clamp(serveTimer/.5,0,1)};if(serveTimer>=.5)launchServe();}
   else if(s.phase==='rally'){
    const b=s.ball,previous={x:b.x,y:b.y,z:b.z},next=advanceShuttle(previous,{x:b.vx,y:b.vy,z:b.vz},h);Object.assign(b,next.position,{vx:next.velocity.x,vy:next.velocity.y,vz:next.velocity.z});if(flight)flight.age+=h;
    if(previous.z*b.z<=0&&Math.abs(previous.z-b.z)>1e-8){const t=clamp(-previous.z/(b.z-previous.z),0,1),x=previous.x+(b.x-previous.x)*t,y=previous.y+(b.y-previous.y)*t;
     if(Math.abs(x)<=court.halfWidth+.05&&y<=court.netHeight+.035){b.x=x;b.y=Math.max(.04,y);b.z=0;scorePoint(lastHitter==='player'?'opponent':'player','触网');}
     else{s.stats.netCrossings++;game._event('net-clear','球越过球网。',{height:y});}
    }
    if(s.phase==='rally'&&b.y<=.035){const t=clamp((previous.y-.035)/(previous.y-b.y||1),0,1);b.x=previous.x+(b.x-previous.x)*t;b.z=previous.z+(b.z-previous.z)*t;b.y=.035;const ownSide=lastHitter==='player'?b.z>=0:b.z<=0,out=!validCourt(b)||ownSide;s.landing={x:b.x,y:0,z:b.z,inBounds:!out,side:b.z>0?'player':'opponent',visible:true};scorePoint(out?(lastHitter==='player'?'opponent':'player'):lastHitter,out?'界外 / 未过网':'球落地');}
    if(s.phase==='rally'){
     aiReaction=Math.max(0,aiReaction-h);const o=s.opponent,target=lastHitter==='player'&&flight?.intercept?{x:clamp(flight.intercept.x,-2.85,2.85),z:clamp(flight.intercept.z,-6.35,-.4)}:{x:0,z:-4.4};
     const d=hypot(o,target);let moved=0;if(aiReaction<=0&&d>.025){moved=Math.min(d,aiSpeed*h);o.x+=(target.x-o.x)/d*moved;o.z+=(target.z-o.z)/d*moved;}
     o.heading=Math.atan2(s.ball.x-o.x,s.ball.z-o.z);if(aiSwing<0)s.animation.opponent=moved?{action:'run',phase:(s.time*2)%1}:pose();
     if(swing>=.025&&swing<=.19)returnPlayer();returnAI();
    }
   }else if(s.phase==='point'){pointTimer+=h;if(pointTimer>=.85){s.phase='ready';s.animation.player=pose();s.animation.opponent=pose();swing=-1;aiSwing=-1;}}
  }
  refresh();return game.state;
 };
 game.reset=()=>{game._reset();lastHitter=null;flight=null;serveTimer=0;pointTimer=0;swing=-1;aiSwing=-1;swingContact=false;aiReaction=0;serveOwner='player';roundMessage='';previousPlayer={x:0,z:4.5};playerVelocity={x:0,z:0};const s=game.state;s.server='player';s.lastHitter=null;s.court={...court};s.targetScore=targetScore;s.stats={rallies:0,currentRally:0,longestRally:0,playerHits:0,opponentHits:0,swings:0,misses:0,netCrossings:0};refresh();return s;};
 game.reset();return game;
}
