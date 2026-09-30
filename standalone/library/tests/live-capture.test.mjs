import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory,IDBKeyRange} from 'fake-indexeddb';
import {LiveCapture,createMediaRecorder} from '../client/live-capture.mjs';
import {createRecordingStore,recordingFileName} from '../client/live-recording-store.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('1080p recorder lets MP4 encoder choose level and falls back when construction fails',()=>{
  const attempts=[];
  class Recorder{
    static isTypeSupported(){return true;}
    constructor(stream,{mimeType}){attempts.push(mimeType);if(mimeType.startsWith('video/mp4'))throw Error('MP4 encoder unavailable');this.mimeType=mimeType;}
  }
  assert.equal(createMediaRecorder({},Recorder).mimeType,'video/webm;codecs=vp8,opus');
  assert.deepEqual(attempts,['video/mp4;codecs=avc1,mp4a.40.2','video/mp4','video/webm;codecs=vp8,opus']);
});
function environment(){
  const events=[],tracks=[],workers=[],recorders=[],contexts=[];let locked=false;
  class Track extends EventTarget{constructor(kind){super();this.kind=kind;this.readyState='live';tracks.push(this);}stop(){this.readyState='ended';}}
  class Stream{constructor(t=[]){this.t=t;}getTracks(){return this.t;}getVideoTracks(){return this.t.filter(t=>t.kind==='video');}getAudioTracks(){return this.t.filter(t=>t.kind==='audio');}}
  class Context{constructor(){this.destination={speaker:true};this.connections=[];contexts.push(this);}resume(){return Promise.resolve();}close(){this.closed=true;return Promise.resolve();}createMediaStreamDestination(){return{stream:new Stream([new Track('audio')])};}createMediaStreamSource(){return{connect:target=>this.connections.push(target)};}createGain(){return{gain:{value:1},connect:target=>this.connections.push(target)};}}
  class Recorder{static isTypeSupported(type){return type.startsWith('video/mp4');}constructor(stream,options){this.mimeType=options.mimeType;this.state='inactive';recorders.push(this);}start(){events.push('recorder-start');this.state='recording';}pause(){this.state='paused';}resume(){this.state='recording';}stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable({data:new Blob([new Uint8Array(32)])});this.onstop();});}}
  class Worker{constructor(){workers.push(this);this.messages=[];}postMessage(message){this.messages.push(message);if(message.type==='start')queueMicrotask(()=>this.onmessage({data:{type:'ready'}}));}terminate(){this.terminated=true;}}
  const values={isSecureContext:true,indexedDB:new IDBFactory(),IDBKeyRange,MediaStream:Stream,AudioContext:Context,MediaRecorder:Recorder,Worker,OffscreenCanvas:class{},VideoFrame:class{},MediaStreamTrackProcessor:class{constructor(){this.readable={};}},MediaStreamTrackGenerator:class extends Track{constructor(){super('video');this.writable={};}},navigator:{mediaDevices:{getDisplayMedia(){events.push('display');return Promise.resolve(new Stream([new Track('video'),new Track('audio')]));},getUserMedia(options){events.push('camera');return Promise.resolve(new Stream([new Track('video'),...(options.audio?[new Track('audio')]:[])]));},enumerateDevices(){return Promise.resolve([]);}},locks:{async request(name,options,callback){if(locked)return callback(null);locked=true;try{return await callback({name});}finally{locked=false;}}}}};
  for(const [name,value] of Object.entries(values))Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});
  const store=createRecordingStore({indexedDB:values.indexedDB,IDBKeyRange});
  const capture=new LiveCapture({store});return{capture,store,events,tracks,workers,recorders,contexts};
}
test('screen permission requested in click stack, fixed pipeline records MP4 metadata and waits final chunk',async()=>{
  const e=environment(),promise=e.capture.start('portrait');assert.deepEqual(e.events,['display']);const id=await promise;
  assert.deepEqual(e.events,['display','camera','recorder-start']);assert.equal(e.capture.systemAudio,true);
  await e.capture.stop();const record=await e.store.getSession(id);
  assert.equal(record.complete,true);assert.equal(record.size,32);assert.match(record.mime,/mp4/);assert.match(recordingFileName(record),/\.mp4$/);
  assert.ok(e.tracks.every(t=>t.readyState==='ended'));assert.ok(e.workers.every(w=>w.terminated));assert.ok(e.contexts.every(c=>c.closed));assert.ok(e.contexts.every(c=>!c.connections.includes(c.destination)));await e.store.close();
});
test('encoder error still persists last dataavailable before marking interrupted',async()=>{
  const e=environment();let written=false;const append=e.store.append.bind(e.store);e.store.append=async(...args)=>{await tick();const r=await append(...args);written=true;return r;};
  const interrupted=e.store.markInterrupted.bind(e.store);e.store.markInterrupted=async(...args)=>{assert.ok(written,'last append committed before interruption metadata');return interrupted(...args);};
  const id=await e.capture.start('presenter'),rec=e.recorders[0];rec.state='inactive';rec.onerror();rec.ondataavailable({data:new Blob([new Uint8Array(64)])});rec.onstop();await e.capture.done;
  const record=await e.store.getSession(id);assert.equal(record.status,'interrupted');assert.equal(record.size,64);assert.equal(record.complete,false);await e.store.close();
});
test('cancel during session transaction never starts encoder and releases all devices',async()=>{
  const e=environment();let release,entered;const gate=new Promise(r=>release=r),waiting=new Promise(r=>entered=r),create=e.store.createSession.bind(e.store);
  e.store.createSession=async(...args)=>{entered();await gate;return create(...args);};const start=e.capture.start('screen-inset');await waiting;e.capture.stop();release();await assert.rejects(start,/取消/);
  assert.ok(!e.events.includes('recorder-start'));assert.ok(e.tracks.every(t=>t.readyState==='ended'));assert.equal((await e.store.list())[0].status,'interrupted');await e.store.close();
});
test('worker failure after first frame while storage starts is not lost',async()=>{
  const e=environment();const create=e.store.createSession.bind(e.store);e.store.createSession=async(...args)=>{e.workers[0].onmessage({data:{type:'error',message:'合成中断'}});return create(...args);};
  await assert.rejects(e.capture.start('portrait'),/合成中断/);assert.ok(!e.events.includes('recorder-start'));assert.ok(e.tracks.every(t=>t.readyState==='ended'));await e.store.close();
});
test('cancelled sharing stops startup and leaves no active camera session',async()=>{
  const e=environment();navigator.mediaDevices.getDisplayMedia=()=>Promise.reject(new DOMException('cancel','NotAllowedError'));await assert.rejects(e.capture.start('portrait'),/cancel/);assert.equal(e.capture.phase,'idle');assert.ok(!e.events.includes('camera'));assert.ok(e.contexts.every(c=>c.closed));await e.store.close();
});
test('custom layout updates while recording or paused keep the same encoder and complete recording',async()=>{
  const e=environment(),id=await e.capture.start('screen-inset',{layoutSettings:{camera:{x:70,y:5,width:25,height:20}}}),worker=e.workers[0];
  assert.equal(worker.messages[0].settings.camera.x,70);
  assert.equal(e.capture.updateLayout({camera:{x:90,y:40,width:30,height:40,fit:'cover'}}),true);
  assert.deepEqual(worker.messages.at(-1),{type:'layout',settings:{screen:{x:0,y:0,width:100,height:100,fit:'contain'},camera:{x:70,y:40,width:30,height:40,fit:'cover'}}});
  e.capture.pause();assert.equal(e.capture.updateLayout({camera:{x:0,y:0,width:50,height:50}}),true);e.capture.pause();assert.equal(e.recorders.length,1);assert.equal(e.workers.length,1);
  const stopped=e.capture.stop(),count=worker.messages.length;assert.equal(e.capture.updateLayout({}),false);assert.equal(worker.messages.length,count);await stopped;
  assert.equal((await e.store.getSession(id)).complete,true);assert.equal(e.capture.updateLayout({}),false);await e.store.close();
});
test('custom changes made during the device prompt are included in the first worker frame',async()=>{
  const e=environment();let enter,release;const waiting=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve),original=navigator.mediaDevices.getUserMedia;
  navigator.mediaDevices.getUserMedia=async options=>{enter();await gate;return original(options);};
  const started=e.capture.start('portrait');await waiting;assert.equal(e.capture.updateLayout({screen:{x:0,y:0,width:100,height:50},camera:{x:0,y:50,width:100,height:50}}),true);release();await started;
  assert.equal(e.workers[0].messages[0].settings.screen.height,50);assert.equal(e.workers[0].messages[0].settings.camera.y,50);await e.capture.stop();await e.store.close();
});
