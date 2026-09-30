import {layouts,normalizeLayoutSettings} from './live-composition.mjs';

// Let the encoder choose a profile/level for the fixed 1080p canvas.
// H.264 level 3.0 (avc1.42E01E) is too small for these layouts at 30 fps.
const codecs=['video/mp4;codecs=avc1,mp4a.40.2','video/mp4','video/webm;codecs=vp8,opus','video/webm'];
export function createMediaRecorder(stream,Recorder=MediaRecorder){
  for(const mimeType of codecs){if(!Recorder.isTypeSupported(mimeType))continue;try{return new Recorder(stream,{mimeType,videoBitsPerSecond:5_000_000,audioBitsPerSecond:160_000});}catch{}}
  throw Error('当前浏览器无法编码录像，请使用新版 Chrome 或 Edge。');
}
export function captureSupported(scope=globalThis){
  return Boolean(scope.isSecureContext&&scope.navigator?.mediaDevices?.getUserMedia&&scope.navigator.mediaDevices.getDisplayMedia&&scope.MediaRecorder&&(scope.AudioContext||scope.webkitAudioContext)&&scope.MediaStreamTrackProcessor&&scope.MediaStreamTrackGenerator&&scope.OffscreenCanvas&&scope.VideoFrame&&scope.Worker&&scope.indexedDB);
}
export async function recordingLock(){
  if(!navigator.locks)throw Error('请用新版 Chrome 或 Edge 打开网站录制。');
  return new Promise((resolve,reject)=>{
    navigator.locks.request('lingan-live-recording',{mode:'exclusive',ifAvailable:true},async lock=>{
      if(!lock){resolve(null);return;}
      let release;const held=new Promise(done=>release=done);resolve(release);await held;
    }).catch(reject);
  });
}
export class LiveCapture{
  constructor({store,onState=()=>{},onComplete=()=>{},onDevices=()=>{},onPreview=()=>{}}){
    Object.assign(this,{store,onState,onComplete,onDevices,onPreview});this.phase='idle';this.streams=[];
  }
  emit(phase,message){this.phase=phase;this.onState({phase,message,layoutId:this.layoutId,sessionId:this.sessionId,systemAudio:this.systemAudio,elapsed:this.elapsed()});}
  elapsed(){return this.startAt?Math.max(0,((this.pauseAt||performance.now())-this.startAt-this.pausedMs)/1000):0;}
  start(layoutId,options={}){
    if(this.phase!=='idle')return Promise.resolve();
    if(!layouts[layoutId])return Promise.reject(Error('请选择一种画面布局'));
    if(!captureSupported())return Promise.reject(Error('网页录制需要电脑上的新版 Chrome 或 Edge。请用这些浏览器打开网站。'));
    this.layoutId=layoutId;this.layoutSettings=normalizeLayoutSettings(layoutId,options.layoutSettings);this.options=options;this.streams=[];this.cancelled=false;this.sessionId=null;this.writeError=null;this.interrupted=null;this.finishPromise=null;this.recorder=null;this.startupError=null;this.startAt=0;this.pausedMs=0;this.pauseAt=0;this.pending=Promise.resolve();this.systemAudio=false;
    this.emit('starting',layoutId==='presenter'?'请允许摄像头和麦克风，随后自动开始录制。':'请选择共享的屏幕或窗口；想录电脑声音，请勾选共享声音。');
    // Screen capture must be requested in the original click, before any await.
    let displayRequest;
    try{displayRequest=layoutId==='presenter'?Promise.resolve(null):navigator.mediaDevices.getDisplayMedia({video:{frameRate:30},audio:options.systemAudio!==false,systemAudio:'include',selfBrowserSurface:'exclude',surfaceSwitching:'exclude'});}catch(error){this.emit('idle','屏幕共享未开始。');return Promise.reject(error);}
    displayRequest.catch(()=>{});
    try{this.audioContext=new (globalThis.AudioContext||globalThis.webkitAudioContext)({sampleRate:48000});}catch(error){this.cancelled=true;displayRequest.then(stream=>stream?.getTracks().forEach(track=>track.stop())).catch(()=>{});this.emit('idle','声音设备未准备好，请重新点击布局。');return Promise.reject(error);}
    this.audioContext.resume().catch(()=>{});
    displayRequest=displayRequest.then(stream=>{if(stream){this.streams.push(stream);if(this.cancelled)stream.getTracks().forEach(track=>track.stop());}return stream;});
    return this.prepare(displayRequest,options).catch(async error=>{
      this.cancelled=true;await this.cleanup();
      if(this.sessionId){try{await this.store.markInterrupted(this.sessionId,{reason:'启动未完成',endedAt:new Date().toISOString()});}catch{}}
      this.emit('idle',error.name==='NotAllowedError'?'录制未开始：设备或屏幕共享尚未授权。可以重新点击布局。':error.name==='NotFoundError'?'未找到摄像头或麦克风，请连接设备，或关闭麦克风后重新选择。':error.name==='NotReadableError'?'摄像头或麦克风正在被其他程序占用，请关闭占用后重试。':error.message||'录制未开始，请重新选择设备。');
      throw error;
    });
  }
  async prepare(displayRequest,options){
    this.releaseLock=await recordingLock();
    if(!this.releaseLock){this.cancelled=true;displayRequest.then(stream=>stream?.getTracks().forEach(track=>track.stop())).catch(()=>{});throw Error('另一页正在录制，请先在那一页停止。');}
    const display=await displayRequest;if(this.cancelled)throw Error('已取消录制。');
    const camera=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:30,max:30},...(options.cameraId?{deviceId:{exact:options.cameraId}}:{})},audio:options.microphone===false?false:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,...(options.microphoneId?{deviceId:{exact:options.microphoneId}}:{})}});
    this.streams.push(camera);if(this.cancelled)throw Error('已取消录制。');
    this.onDevices(await navigator.mediaDevices.enumerateDevices());
    const destination=this.audioContext.createMediaStreamDestination();this.destinationStream=destination.stream;this.gains={};let audioTracks=0;
    for(const [key,stream,volume] of [['microphone',camera,options.microphoneVolume??1],['system',display,options.systemVolume??0.5]]){
      const tracks=stream?.getAudioTracks()||[];if(!tracks.length)continue;
      const source=this.audioContext.createMediaStreamSource(new MediaStream(tracks)),gain=this.audioContext.createGain();gain.gain.value=volume;source.connect(gain);gain.connect(destination);this.gains[key]=gain;audioTracks+=tracks.length;if(key==='system')this.systemAudio=true;
    }
    await this.audioContext.resume();
    const cameraVideo=camera.getVideoTracks()[0];if(!cameraVideo)throw Error('摄像头未提供画面。');
    const processor=new MediaStreamTrackProcessor({track:cameraVideo}),generator=new MediaStreamTrackGenerator({kind:'video'});
    const displayVideo=display?.getVideoTracks()[0],screen=displayVideo?new MediaStreamTrackProcessor({track:displayVideo}).readable:null;
    this.output=new MediaStream([generator,...(audioTracks?destination.stream.getAudioTracks():[])]);
    this.worker=new Worker('/live-render-worker.js',{type:'module',name:'灵感库录制画面'});
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('画面准备超时，请确认摄像头正常。')),20000);
      this.worker.onerror=()=>{clearTimeout(timeout);this.startupError=Error('画面合成未启动，请刷新网站后重试。');reject(this.startupError);};
      this.worker.onmessage=event=>{
        if(event.data.type==='ready'){clearTimeout(timeout);resolve();}
        if(event.data.type==='error'){clearTimeout(timeout);this.startupError=Error(event.data.message);reject(this.startupError);}
      };
      const transfers=[processor.readable,generator.writable,...(screen?[screen]:[])];
      this.worker.postMessage({type:'start',layoutId:this.layoutId,settings:this.layoutSettings,camera:processor.readable,screen,output:generator.writable},transfers);
    });
    if(this.cancelled)throw Error('已取消录制。');
    this.recorder=createMediaRecorder(this.output);const mime=this.recorder.mimeType;
    const at=new Date();
    this.sessionId=await this.store.createSession({layout:this.layoutId,title:options.title?.trim()||layouts[this.layoutId].name+' · '+at.toLocaleString(),platform:options.platform||'douyin',mime,startedAt:at.toISOString()});
    if(this.cancelled)throw Error('已取消录制。');
    if(this.startupError)throw this.startupError;
    if([cameraVideo,displayVideo,generator].filter(Boolean).some(track=>track.readyState==='ended'))throw Error('输入画面已停止，请重新选择。');
    this.recorder.ondataavailable=event=>{if(!event.data.size)return;this.pending=this.pending.then(()=>this.store.append(this.sessionId,event.data)).catch(error=>{this.writeError=error;this.interrupted='本机存储写入失败';this.stop();});};
    this.done=new Promise(resolve=>this.resolveDone=resolve);
    this.recorder.onstop=()=>{this.finish();};
    this.recorder.onerror=()=>{this.interrupted='浏览器编码中断';this.stop();};
    this.worker.onerror=()=>{this.interrupted='画面合成中断';this.stop();};
    this.worker.onmessage=event=>{if(event.data.type==='error'){this.interrupted=event.data.message;this.stop();}if(event.data.type==='frame')this.lastFrameAt=performance.now();};
    for(const track of [...camera.getVideoTracks(),...(display?.getVideoTracks()||[])])track.addEventListener('ended',()=>this.stop(),{once:true});
    this.recorder.start(2000);this.startAt=performance.now();this.lastFrameAt=this.startAt;
    this.onPreview(this.output);this.emit('recording',this.layoutId!=='presenter'&&!this.systemAudio&&options.systemAudio!==false?'正在录制。未收到电脑声音；下次共享时勾选共享声音。':'正在按固定画面录制。停止后自动保存回放。');
    return this.sessionId;
  }
  volume(key,value){if(this.gains?.[key])this.gains[key].gain.value=Math.max(0,Math.min(1.5,Number(value)||0));}
  updateLayout(settings){
    if(!['starting','recording','paused'].includes(this.phase))return false;
    this.layoutSettings=normalizeLayoutSettings(this.layoutId,settings);
    this.worker?.postMessage({type:'layout',settings:this.layoutSettings});return true;
  }
  pause(){if(this.phase==='recording'){this.recorder.pause();this.pauseAt=performance.now();this.emit('paused','已暂停录制，点击继续后接着保存同一段回放。');}else if(this.phase==='paused'){this.recorder.resume();this.pausedMs+=performance.now()-this.pauseAt;this.pauseAt=0;this.emit('recording','正在按固定画面录制。');}}
  stop(){
    if(this.phase==='starting'){this.cancelled=true;for(const stream of this.streams)stream.getTracks().forEach(track=>track.stop());return;}
    if(!['recording','paused'].includes(this.phase))return this.done;
    this.emit('finishing','正在结束录制并保存最后一段…');
    // Even an encoder error dispatches its final dataavailable before stop.
    // Finalize only from onstop so all chunks are included in this.pending.
    if(this.recorder.state!=='inactive')this.recorder.stop();
    return this.done;
  }
  async finish(){
    if(this.finishPromise)return this.finishPromise;
    this.finishPromise=(async()=>{
      const sessionId=this.sessionId;this.emit('finishing','正在保存录制…');
      try{
        await this.pending;await this.cleanup();
        if(this.writeError||this.interrupted){await this.store.markInterrupted(sessionId,{reason:this.interrupted||'录制中断',endedAt:new Date().toISOString()});throw Error(this.writeError?.code==='QUOTA_EXCEEDED'?'本机存储空间不足，已停止。已写入的片段留在下方本机录制中。':'录制中断，已保留写入的片段。请在下方下载检查。');}
        await this.store.markComplete(sessionId,{endedAt:new Date().toISOString()});
        this.emit('idle','录制已完整保存在本机，正在上传到待处理与回放历史。');this.onComplete(sessionId);
      }catch(error){try{await this.store.markInterrupted(sessionId,{reason:this.interrupted||'录制未完成',endedAt:new Date().toISOString()});}catch{}this.emit('idle',error.message||'录制未完成，已保留本机片段。');}
      finally{this.resolveDone?.(sessionId);}
      return sessionId;
    })();return this.finishPromise;
  }
  async cleanup(){
    try{
      for(const stream of this.streams)for(const track of stream.getTracks())track.stop();
      this.output?.getTracks().forEach(track=>track.stop());this.destinationStream?.getTracks().forEach(track=>track.stop());this.worker?.terminate();this.worker=null;
      try{await this.audioContext?.close();}catch{}
      this.onPreview(null);
    }finally{this.releaseLock?.();this.releaseLock=null;}
  }
}
