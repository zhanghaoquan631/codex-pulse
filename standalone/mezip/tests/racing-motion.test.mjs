import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.env.RACING_TEST_ROOT ? pathToFileURL(path.resolve(process.env.RACING_TEST_ROOT) + path.sep) : new URL('../', import.meta.url);
const motionUrl = process.env.RACING_MOTION_FILE ? pathToFileURL(path.resolve(process.env.RACING_MOTION_FILE)) : new URL('apps/racing/assets/race-motion.mjs', root);
const { createMotionSystem } = await import(motionUrl);
const { default: tracks } = await import(new URL('apps/racing/competition/shared/tracks.mjs', root));
const { prepareTrack, sampleTrack, speedLimit, createRoomState, advanceRoom, projectTrack } = await import(new URL('server/racing/race-engine.mjs', root));
const BASE=1_700_000_000_000, DT=1000/60;
const xyz=p=>Array.isArray(p)?{x:p[0],y:p[1],z:p[2]}:p;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
function roomFor(trackId) {
 const track=prepareTrack(tracks[trackId]);
 const room=createRoomState({id:'test',trackId,playerId:'driver',name:'Test',authHash:'x',createKeyHash:'x',now:BASE},track);
 room.startAt=BASE;room.status='racing';for(const p of room.players){p.control='ai';p.takeoverAt=BASE;}
 return {room,track};
}
function packet(room,p,serverMs,receivedAt,rtt) {
 return {...structuredClone(p),trackId:room.trackId,status:room.status,serverNow:BASE+serverMs,simAt:room.simAt,
 startAt:room.startAt,laps:3,raceNumber:room.raceNumber,resetAt:p.resetAt??null,receivedAt,requestRoundTripMs:rtt};
}
for(const trackId of Object.keys(tracks)) {
 test(`${trackId}: cached predictor reproduces the server speed envelope and banked route`,()=>{
  const {track}=roomFor(trackId),system=createMotionSystem(tracks),prepared=system.courseFor(trackId);
  assert.equal(system.courseFor(trackId),prepared);
  assert.ok(Math.abs(prepared.length-track.length)<1e-8);
  for(let i=0;i<prepared.limits.length;i++)assert.ok(Math.abs(prepared.limits[i]-track.speedProfile.limits[i])<1e-6);
  const stream=system.stream();
  for(let i=0;i<200;i++){
   const d=track.length*i/199,slot=2,s=sampleTrack(track,d,Math.sin(slot*2.1)*.55);
   stream.update({position:s.position,quaternion:s.quaternion,distance:d,speed:0,slot,trackId,control:'ai',status:'racing',simAt:BASE,serverNow:BASE,receivedAt:0,startAt:BASE},0,{reset:true});
   const result=stream.sample(0);
   assert.ok(distance(result.position,xyz(s.position))<1e-7);
   assert.ok(Math.abs(Math.hypot(...Object.values(result.quaternion))-1)<1e-8);
  }
 });
 test(`${trackId}: 60fps motion survives 250–1200ms RTT, 500ms polls and out-of-order responses`,()=>{
  const {room,track}=roomFor(trackId),system=createMotionSystem(tracks),stream=system.stream(),deliveries=[];
  const rtts=[250,500,1200,350,1000,700,250,1200,450,900,300,650];
  for(let sent=0,index=0;sent<=75_000;sent+=500,index++){
   const rtt=rtts[index%rtts.length],server=sent+rtt*.5;
   deliveries.push({server,at:sent+rtt,rtt});
  }
  for(const item of [...deliveries].sort((a,b)=>a.server-b.server)){
   advanceRoom(room,track,BASE+item.server);
   item.packet=packet(room,room.players[2],item.server,item.at,item.rtt);
  }
  deliveries.sort((a,b)=>a.at-b.at);
  const truth=roomFor(trackId);let last=null,index=0,maxError=0,maxTickError=0,maxFrameSpeed=0,maxRoadError=0,stalledFrames=0,frames=0;
  for(let time=0;time<=75_000;time+=DT){
   while(index<deliveries.length&&deliveries[index].at<=time){stream.update(deliveries[index].packet,deliveries[index].at);index++;}
   const p=stream.sample(time);if(!p)continue;
   advanceRoom(truth.room,truth.track,BASE+time);
   const server=truth.room.players[2];
   const fraction=Math.max(0,(BASE+time-truth.room.simAt)/1000);
   const next=Math.min(speedLimit(track,server.distance+server.speed*.1,server.slot),server.speed+1.35);
   const bounded=Math.max(Math.max(0,server.speed-3.3),next),acceleration=(bounded-server.speed)/.1;
   const continuous=Math.min(track.length*3,server.distance+server.speed*fraction+.5*acceleration*fraction*fraction);
   maxTickError=Math.max(maxTickError,Math.abs(p.distance-server.distance));
   maxError=Math.max(maxError,Math.abs(p.distance-continuous));
   if(last){
    const frameSpeed=distance(p.position,last.position)/(DT/1000);maxFrameSpeed=Math.max(maxFrameSpeed,frameSpeed);
    if(time>3_000&&p.distance<track.length*3-5&&server.speed>8&&p.distance-last.distance<.01)stalledFrames++;
    assert.ok(p.distance>=last.distance-1e-8,'snapshot jitter must never reverse AI progress');
    assert.ok(frameSpeed<108,`frame jump exceeds physical range: ${frameSpeed}`);
   }
   if(frames%15===0){const projected=projectTrack(track,Object.values(p.position),p.distance);maxRoadError=Math.max(maxRoadError,projected.lateral);}
   last=p;frames++;
  }
  assert.equal(stalledFrames,0,'no 200ms interpolation deadline stalls');
  assert.ok(maxError<2,`prediction error ${maxError.toFixed(2)}m must stay bounded`);
  assert.ok(maxRoadError<.7,`rendered cars must follow the actual banked road: ${maxRoadError}`);
  assert.equal(system.inspect().preparedTracks,1);
  console.log(JSON.stringify({trackId,frames,maxError,maxTickError,maxFrameSpeed,maxRoadError,stalledFrames}));
 });
}
test('AI crosses laps without resetting distance and permanently stops at three laps',()=>{
 const trackId='apexCircuit',{room,track}=roomFor(trackId),stream=createMotionSystem(tracks).stream(),p=room.players[2];
 p.distance=3*track.length-12;p.speed=25;Object.assign(p,sampleTrack(track,p.distance,Math.sin(p.slot*2.1)*.55));
 stream.update(packet(room,p,0,0,0),0);let previous=p.distance;
 for(let time=DT;time<5000;time+=DT){
  if(time>900&&room.status!=='finished'){
   advanceRoom(room,track,BASE+time);room.status='finished';stream.update(packet(room,p,time,time,0),time);
  }
  const out=stream.sample(time);assert.ok(out.distance>=previous-1e-8);assert.ok(out.distance<=3*track.length);previous=out.distance;
 }
 const stopped=stream.sample(10000);assert.equal(stopped.distance,3*track.length);assert.equal(stopped.speed,0);
 assert.deepEqual(stream.sample(100000).position,stopped.position);
});
test('DNF stops locally and explicit resetAt reseeds without false lap or poll teleports',()=>{
 const trackId='lagunaSeca',{room,track}=roomFor(trackId),stream=createMotionSystem(tracks).stream(),p=room.players[2];
 advanceRoom(room,track,BASE+20000);stream.update(packet(room,p,20000,20000,0),20000);
 stream.sample(20100);const before=stream.sample(20200);
 p.dnf=true;p.speed=0;stream.update(packet(room,p,20200,20200,0),20200);
 const stopped=stream.sample(20300);assert.equal(stopped.speed,0);assert.equal(stopped.distance,before.distance);
 assert.equal(stream.sample(50000).distance,stopped.distance);
 p.dnf=false;p.resetAt=BASE+50000;p.takeoverAt=BASE+50000;p.distance=120;p.speed=0;room.simAt=BASE+50000;
 Object.assign(p,sampleTrack(track,120,Math.sin(p.slot*2.1)*.55));
 const result=stream.update(packet(room,p,50000,50000,0),50000);assert.equal(result.hardReset,true);assert.equal(stream.sample(50000).distance,120);
 assert.ok(stream.sample(50100).distance>120);
});
test('real bots follow the server tick and ignore obsolete human takeover timestamps',()=>{
 const trackId='apexCircuit',{room,track}=roomFor(trackId),p=room.players[2],stream=createMotionSystem(tracks).stream();
 p.takeoverAt=BASE+55;p.distance=120;p.speed=10;room.simAt=BASE;
 Object.assign(p,sampleTrack(track,120,0));
 stream.update(packet(room,p,150,150,0),150);
 advanceRoom(room,track,BASE+150);
 const fullNext=speedLimit(track,p.distance+p.speed*.1,p.slot),a=(Math.min(fullNext,p.speed+1.35)-p.speed)/.1;
 const expected=p.distance+p.speed*.05+.5*a*.05*.05;
 assert.ok(Math.abs(stream.sample(150).distance-expected)<1e-7);
});
test('human snapshots extrapolate past 200ms, cap stale drift and smooth long packet gaps',()=>{
 const stream=createMotionSystem(tracks).stream();
 const base={trackId:'apexCircuit',control:'human',status:'racing',distance:0,position:[0,0,0],quaternion:[0,0,0,1],speed:30,simAt:BASE,serverNow:BASE,receivedAt:0,raceNumber:1};
 stream.update(base,0);let prev=stream.sample(0),lastTime=0,after200,after500,maxSpeed=0;
 for(let t=DT;t<5000;t+=DT){const p=stream.sample(t);maxSpeed=Math.max(maxSpeed,distance(p.position,prev.position)/((t-lastTime)/1000));lastTime=t;if(t>200&&!after200)after200=p;if(t>500&&!after500)after500=p;prev=p;}
 assert.ok(after500.position.z-after200.position.z>5);assert.ok(prev.position.z<29);assert.ok(prev.speed<.01);
 stream.update({...base,position:[0,0,100],receivedAt:5000,serverNow:BASE+5000,simAt:BASE+5000},5000);
 for(let t=5000+DT;t<6000;t+=DT){const p=stream.sample(t);maxSpeed=Math.max(maxSpeed,distance(p.position,prev.position)/((t-lastTime)/1000));lastTime=t;prev=p;}
 assert.ok(maxSpeed<=115.0001);
});

test('terminal packets stay terminal if an equal-tick racing response arrives late',()=>{
 const {room,track}=roomFor('apexCircuit'),p=room.players[2],stream=createMotionSystem(tracks).stream();
 advanceRoom(room,track,BASE+2000);
 const old=packet(room,p,2000,2000,0);stream.update(old,2000);stream.sample(2050);
 p.dnf=true;p.speed=0;room.status='finished';const final=packet(room,p,2000,2050,50);
 stream.update(final,2050);const stationary=stream.sample(2100);
 assert.equal(stream.update({...old,receivedAt:2200},2200).accepted,false);
 assert.equal(stream.sample(3000).distance,stationary.distance);
});
test('mobile frame-rate changes and database-heavy asymmetric RTT stay continuous',()=>{
 const {room,track}=roomFor('lagunaSeca'),system=createMotionSystem(tracks),stream=system.stream(),deliveries=[];
 const waits=[20,40,180,600,850,1050,100,300],downlinks=[75,90,60,125,80,75,110,85];
 for(let sent=0,i=0;sent<45000;sent+=500,i++){
  const up=75,processing=waits[i%waits.length],down=downlinks[i%downlinks.length],server=sent+up+processing;
  deliveries.push({server,at:server+down,rtt:up+processing+down});
 }
 for(const item of [...deliveries].sort((a,b)=>a.server-b.server)){
  advanceRoom(room,track,BASE+item.server);item.packet=packet(room,room.players[4],item.server,item.at,item.rtt);
 }
 deliveries.sort((a,b)=>a.at-b.at);let i=0,prev=null,stalls=0,maxSpeed=0,maxError=0;
 const truth=roomFor('lagunaSeca'),dts=[1000/60,1000/30,1000/20,1000/45];
 for(let time=0,frame=0;time<45000;frame++){
  const dt=dts[Math.floor(frame/70)%dts.length];time+=dt;
  while(i<deliveries.length&&deliveries[i].at<=time){stream.update(deliveries[i].packet,deliveries[i].at);i++;}
  const p=stream.sample(time);if(!p)continue;
  advanceRoom(truth.room,truth.track,BASE+time);
  if(prev){const speed=distance(p.position,prev.position)/(dt/1000);maxSpeed=Math.max(maxSpeed,speed);assert.ok(speed<105);if(time>3000&&p.distance-prev.distance<.01)stalls++;}
  maxError=Math.max(maxError,Math.abs(p.distance-truth.room.players[4].distance));prev=p;
 }
 assert.equal(stalls,0);assert.ok(maxError<13);assert.ok(system.inspect().bestRtt<250);
 console.log(JSON.stringify({asymmetricRtt:true,mobileFps:'20–60',maxSpeed,maxTickError:maxError,stalls}));
});
test('eight seconds of missing responses causes no freeze or greater-than-80m snap on recovery',()=>{
 const {room,track}=roomFor('apexCircuit'),stream=createMotionSystem(tracks).stream(),p=room.players[2];
 advanceRoom(room,track,BASE+12000);stream.update(packet(room,p,12000,12000,0),12000);
 let last=stream.sample(12000),maxJump=0;
 for(let now=12000+DT;now<24000;now+=DT){
  if(now>20000){advanceRoom(room,track,BASE+now);stream.update(packet(room,p,now,now,0),now);}
  const pose=stream.sample(now),jump=distance(last.position,pose.position);maxJump=Math.max(maxJump,jump);
  assert.ok(jump>.01);assert.ok(jump<2);last=pose;
 }
 assert.ok(maxJump<2);
});


test('explicit human seats never follow an old AI control flag',()=>{
 const stream=createMotionSystem(tracks).stream();
 stream.update({trackId:'apexCircuit',control:'ai',isBot:false,status:'racing',position:[10,5,20],quaternion:[0,0,0,1],distance:2000,speed:0,serverNow:BASE,simAt:BASE,receivedAt:0},0);
 const p=stream.sample(1000);assert.deepEqual(p.position,{x:10,y:5,z:20});assert.equal(p.speed,0);
});
