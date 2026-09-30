export const layouts=Object.freeze({
  presenter:{name:'人物全屏',width:1920,height:1080,camera:{x:0,y:0,width:1920,height:1080,fit:'cover'}},
  'screen-inset':{name:'屏幕 + 人物小窗',width:1920,height:1080,screen:{x:0,y:0,width:1920,height:1080,fit:'contain'},camera:{x:28,y:772,width:380,height:280,fit:'contain'}},
  portrait:{name:'上屏幕 + 下人物',width:1080,height:1920,screen:{x:0,y:240,width:1080,height:608,fit:'contain'},camera:{x:0,y:848,width:1080,height:1072,fit:'cover'}}
});
export function defaultLayoutSettings(layoutId){
  const layout=layouts[layoutId];if(!layout)throw Error('请选择一种录制布局');
  return Object.fromEntries(['screen','camera'].filter(source=>layout[source]).map(source=>{const box=layout[source];return [source,{x:box.x/layout.width*100,y:box.y/layout.height*100,width:box.width/layout.width*100,height:box.height/layout.height*100,fit:box.fit}];}));
}
export function normalizeLayoutSettings(layoutId,settings){
  const defaults=defaultLayoutSettings(layoutId),result={};
  const finite=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  for(const [source,base] of Object.entries(defaults)){
    const box=settings?.[source]||{},width=clamp(finite(box.width,base.width),5,100),height=clamp(finite(box.height,base.height),5,100);
    result[source]={x:clamp(finite(box.x,base.x),0,100-width),y:clamp(finite(box.y,base.y),0,100-height),width,height,fit:['contain','cover'].includes(box.fit)?box.fit:base.fit};
  }
  return result;
}
export function resolveLayout(layoutId,settings){
  const layout=layouts[layoutId];if(!layout)throw Error('请选择一种录制布局');
  if(!settings)return layout;
  const result={...layout};
  for(const [source,box] of Object.entries(normalizeLayoutSettings(layoutId,settings)))result[source]={x:box.x*layout.width/100,y:box.y*layout.height/100,width:box.width*layout.width/100,height:box.height*layout.height/100,fit:box.fit};
  return result;
}
export function placement(sourceWidth,sourceHeight,box){
  if(!(sourceWidth>0&&sourceHeight>0))throw Error('画面尺寸无效');
  const ratio=box.fit==='cover'?Math.max(box.width/sourceWidth,box.height/sourceHeight):Math.min(box.width/sourceWidth,box.height/sourceHeight);
  const width=sourceWidth*ratio,height=sourceHeight*ratio;
  return {x:box.x+(box.width-width)/2,y:box.y+(box.height-height)/2,width,height};
}
export function composeFrame(context,layoutId,camera,screen,settings){
  const layout=resolveLayout(layoutId,settings);
  context.fillStyle='#000';context.fillRect(0,0,layout.width,layout.height);
  function draw(frame,box){
    if(!frame||!box)return;
    const size=placement(frame.displayWidth||frame.videoWidth||frame.width,frame.displayHeight||frame.videoHeight||frame.height,box);
    context.save();context.beginPath();context.rect(box.x,box.y,box.width,box.height);context.clip();
    context.drawImage(frame,size.x,size.y,size.width,size.height);context.restore();
  }
  draw(screen,layout.screen);draw(camera,layout.camera);
}
