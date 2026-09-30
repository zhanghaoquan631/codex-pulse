import {layouts,composeFrame,normalizeLayoutSettings} from './live-composition.mjs';
let running=false,cameraReader,screenReader,writer,latestScreen,screenTask;
let activeLayoutId,settings;
async function stop(){
  running=false;
  await Promise.allSettled([cameraReader?.cancel(),screenReader?.cancel()]);
  latestScreen?.close();latestScreen=null;
  try{await writer?.close();}catch{}
}
self.onmessage=async event=>{
  if(event.data.type==='stop'){await stop();self.postMessage({type:'stopped'});return;}
  if(event.data.type==='layout'){if(running)settings=normalizeLayoutSettings(activeLayoutId,event.data.settings);return;}
  if(event.data.type!=='start'||running)return;
  const {layoutId,camera,screen,output}=event.data,layout=layouts[layoutId];
  try{
    if(!layout)throw Error('画面布局无效');
    activeLayoutId=layoutId;settings=normalizeLayoutSettings(layoutId,event.data.settings);
    running=true;cameraReader=camera.getReader();writer=output.getWriter();
    const canvas=new OffscreenCanvas(layout.width,layout.height),context=canvas.getContext('2d',{alpha:false});
    if(screen){
      screenReader=screen.getReader();
      const first=await screenReader.read();if(first.done)throw Error('屏幕共享已结束');latestScreen=first.value;
      screenTask=(async()=>{while(running){const next=await screenReader.read();if(next.done)break;const old=latestScreen;latestScreen=next.value;old?.close();}})();
      screenTask.catch(error=>{if(running)self.postMessage({type:'error',message:'共享画面中断，请停止并重新录制。'});});
    }
    let ready=false,lastTime=-1,frames=0;
    while(running){
      const next=await cameraReader.read();if(next.done)break;const frame=next.value;
      let composed;
      try{
        composeFrame(context,layoutId,frame,latestScreen,settings);
        const timestamp=Math.max(lastTime+1,frame.timestamp);lastTime=timestamp;
        composed=new VideoFrame(canvas,{timestamp});
        if(!ready){ready=true;self.postMessage({type:'ready',width:layout.width,height:layout.height});}
        await writer.write(composed);frames++;
        if(frames%5===0)self.postMessage({type:'frame',timestamp,frames});
      }finally{frame.close();composed?.close();}
    }
    if(running)self.postMessage({type:'error',message:'摄像头画面已结束，请重新选择设备。'});
  }catch(error){if(running)self.postMessage({type:'error',message:'录制画面无法合成，请重新选择设备。'});}
  finally{await stop();}
};
