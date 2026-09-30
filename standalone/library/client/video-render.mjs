import {Input,ALL_FORMATS,BlobSource,CanvasSink,AudioBufferSink,Output,Mp4OutputFormat,WebMOutputFormat,BufferTarget,StreamTarget,CanvasSource,AudioBufferSource,Quality,getFirstEncodableVideoCodec,getFirstEncodableAudioCodec} from 'mediabunny';

export async function inspect(file){
  const input=new Input({source:new BlobSource(file),formats:ALL_FORMATS});
  try{
    const video=await input.getPrimaryVideoTrack();
    if(!video||!await video.canDecode())throw Error('这个视频的编码暂时无法在当前浏览器剪辑，请选择 H.264 MP4 或 WebM 视频。');
    const audio=await input.getPrimaryAudioTrack();
    if(audio&&!await audio.canDecode())throw Error('当前浏览器不能解码这个视频的声音，请换用支持此编码的浏览器。');
    const origin=Math.max(0,await video.getFirstTimestamp()),end=await video.computeDuration();
    if(!Number.isFinite(end)||end-origin<=0)throw Error('视频时长无法读取。');
    return {duration:end-origin,origin,width:await video.getDisplayWidth(),height:await video.getDisplayHeight(),hasAudio:Boolean(audio)};
  }finally{input.dispose();}
}
export function dimensions(first,ratio,resolution){
  const r=ratio==='original'?first.width/first.height:ratio==='portrait'?9/16:ratio==='square'?1:16/9;
  const short=Number(resolution)||720;
  return r>=1?{width:Math.round(short*r/2)*2,height:short}:{width:short,height:Math.round(short/r/2)*2};
}
export function paint(canvas,image,clip,settings){
  const ctx=canvas.getContext('2d',{alpha:false}),w=canvas.width,h=canvas.height;
  ctx.fillStyle='#111018';ctx.fillRect(0,0,w,h);
  const iw=image.videoWidth||image.width,ih=image.videoHeight||image.height;
  if(iw&&ih){const scale=settings.fit==='cover'?Math.max(w/iw,h/ih):Math.min(w/iw,h/ih);ctx.drawImage(image,(w-iw*scale)/2,(h-ih*scale)/2,iw*scale,ih*scale);}
  if(clip.text){
    const size=Math.round(Math.min(w,h)*(clip.textSize||5)/100),max=w*.86;
    ctx.font=`600 ${size}px system-ui, sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
    const lines=[];for(const paragraph of clip.text.split('\n')){let line='';for(const char of paragraph){if(line&&ctx.measureText(line+char).width>max){lines.push(line);line='';}line+=char;}lines.push(line);}
    const lh=size*1.3,base=clip.textPosition==='top'?h*.12:clip.textPosition==='center'?h/2-(lines.length-1)*lh/2:h*.88-(lines.length-1)*lh;
    ctx.lineJoin='round';ctx.lineWidth=Math.max(2,size*.12);ctx.strokeStyle='rgba(0,0,0,.8)';ctx.fillStyle=clip.textColor||'#ffffff';
    lines.slice(0,8).forEach((line,i)=>{ctx.strokeText(line,w/2,base+i*lh);ctx.fillText(line,w/2,base+i*lh);});
  }
}

// Normalize each small output block to stereo 48 kHz, retaining the original
// media timestamps so leading gaps, trims and silent clips remain synchronized.
async function* audioBlocks(track,start,end,volume,signal){
  const rate=48000,total=Math.round((end-start)*rate);
  const it=track&&volume?new AudioBufferSink(track).buffers(start,end)[Symbol.asyncIterator]():null;
  let next=it?await it.next():{done:true};
  try{for(let offset=0;offset<total;offset+=rate){
    signal.throwIfAborted();const length=Math.min(rate,total-offset),out=new AudioBuffer({length,numberOfChannels:2,sampleRate:rate});
    const a=start+offset/rate,b=a+length/rate;
    while(!next.done){
      const {buffer,timestamp,duration}=next.value;if(timestamp>=b)break;
      const lo=Math.max(0,Math.ceil((timestamp-a)*rate-1e-6)),hi=Math.min(length,Math.ceil((timestamp+duration-a)*rate-1e-6));
      for(let ch=0;ch<2;ch++){const src=buffer.getChannelData(Math.min(ch,buffer.numberOfChannels-1)),dst=out.getChannelData(ch);for(let i=lo;i<hi;i++){const p=(a+i/rate-timestamp)*buffer.sampleRate,j=Math.max(0,Math.min(src.length-1,Math.floor(p))),f=Math.max(0,Math.min(1,p-j));dst[i]=(src[j]*(1-f)+src[Math.min(j+1,src.length-1)]*f)*volume;}}
      if(timestamp+duration>=b-1e-8)break;next=await it.next();
    }
    yield out;
  }}finally{await it?.return?.();}
}

export async function renderMovie(clips,settings,{signal,onProgress=()=>{},onStatus=()=>{}}={}){
  const size=dimensions(clips[0],settings.ratio,settings.resolution),canvas=document.createElement('canvas');Object.assign(canvas,size);
  const hasAudio=clips.some(x=>x.hasAudio),quality=new Quality({bitrate:settings.resolution==='1080'?6000000:3000000});
  onStatus('正在准备视频编码…');let format=new WebMOutputFormat(),videoCodec=await getFirstEncodableVideoCodec(['vp8','vp9'],size),audioCodec=hasAudio?await getFirstEncodableAudioCodec(['opus'],{numberOfChannels:2,sampleRate:48000}):null,ext='webm';
  if(settings.format==='mp4'){format=new Mp4OutputFormat({fastStart:false});videoCodec=await getFirstEncodableVideoCodec(['avc'],size);audioCodec=hasAudio?await getFirstEncodableAudioCodec(['aac'],{numberOfChannels:2,sampleRate:48000}):null;ext='mp4';}
  if(!videoCodec||hasAudio&&!audioCodec){format=new WebMOutputFormat();ext='webm';videoCodec=await getFirstEncodableVideoCodec(['vp9','vp8'],size);audioCodec=hasAudio?await getFirstEncodableAudioCodec(['opus'],{numberOfChannels:2,sampleRate:48000}):null;}
  if(!videoCodec||hasAudio&&!audioCodec)throw Error('当前浏览器无法导出视频，请在新版 Chrome 或 Edge 中打开此页面。');
  const total=clips.reduce((n,x)=>n+x.end-x.start,0);let target,handle,dir,temporary='',output,input;
  const abort=()=>{input?.dispose();void output?.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
  try{
    onStatus('正在准备成品文件…');if(navigator.storage?.getDirectory){dir=await navigator.storage.getDirectory();temporary='lingan-export-'+crypto.randomUUID();handle=await dir.getFileHandle(temporary,{create:true});target=new StreamTarget(await handle.createWritable(),{chunked:true});}
    else{if(total*(settings.resolution==='1080'?6e6:3e6)/8>256*1024*1024)throw Error('当前浏览器的导出内存有限，请缩短片段或在新版 Chrome / Edge 中打开。');target=new BufferTarget();}
    output=new Output({format,target});const videoSource=new CanvasSource(canvas,{codec:videoCodec,quality,latencyMode:'realtime',alpha:'discard'});output.addVideoTrack(videoSource,{frameRate:30});
    const audioSource=hasAudio?new AudioBufferSource({codec:audioCodec,quality:new Quality({bitrate:128000})}):null;if(audioSource)output.addAudioTrack(audioSource);
    await output.start();onStatus('正在处理视频画面和声音…');let time=0;
    for(const clip of clips){
      signal.throwIfAborted();input=new Input({source:new BlobSource(clip.file),formats:ALL_FORMATS});const track=await input.getPrimaryVideoTrack(),audio=await input.getPrimaryAudioTrack();
      const start=clip.origin+clip.start,end=clip.origin+clip.end,duration=clip.end-clip.start,frames=Math.ceil(duration*30-1e-8);
      const sink=new CanvasSink(track,{poolSize:2,decoderOptions:{hardwareAcceleration:'prefer-software',optimizeForLatency:true}});
      const blocks=audioSource?audioBlocks(audio,start,end,clip.volume/100,signal):null;let frame=0;
      try{for(let block=0;block<Math.ceil(duration);block++){
        const until=Math.min(duration,block+1);
        await Promise.all([
          (async()=>{while(frame<frames&&frame/30<until-1e-8){signal.throwIfAborted();const next=await sink.getCanvas(start+frame/30);if(!next)throw Error('视频画面解码失败，素材和剪辑设置已保留。');paint(canvas,next.canvas,clip,settings);await videoSource.add(time+frame/30,Math.min(1/30,duration-frame/30));frame++;if(frame%10===0)onProgress((time+frame/30)/total);}})(),
          (async()=>{if(blocks){const next=await blocks.next();if(next.value)await audioSource.add(next.value);}})()
        ]);
        onProgress((time+until)/total);await new Promise(resolve=>setTimeout(resolve,0));
      }}finally{await blocks?.return?.();input.dispose();input=null;}
      time+=duration;
    }
    onStatus('正在完成视频文件…');await output.finalize();const blob=handle?await handle.getFile():new Blob([target.buffer],{type:ext==='mp4'?'video/mp4':'video/webm'});
    return {blob,ext,duration:total,cleanup:async()=>{if(dir&&temporary)await dir.removeEntry(temporary).catch(()=>{});}};
  }catch(error){input?.dispose();await output?.cancel().catch(()=>{});if(dir&&temporary)await dir.removeEntry(temporary).catch(()=>{});throw error;}finally{signal.removeEventListener('abort',abort);}
}
