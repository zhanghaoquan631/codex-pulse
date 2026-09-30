export const coreCities=['汕头市','潮州市','揭阳市'];
export function labelPriority(place,selected){
  return place===selected?100:coreCities.includes(place.name)?90:place.kind==='district'?40:place.major?10:0;
}
export function labelPosition({x,y,width,height,mobile,important,occupied,labelWidth=128,labelHeight=36}){
  const offsets=important?[[0,0],[0,-44],[0,44],[0,-88],[0,88],[90,0],[-90,0],[90,-44],[-90,-44]]:[[0,0]];
  for(const [dx,dy] of offsets){
    const left=x+dx,top=y+dy;
    if(left<labelWidth/2+4||left>width-labelWidth/2-4||top<Math.max(120,labelHeight+4)||top>height-155)continue;
    if(!mobile&&left-64< (width<850?240:295)&&top>145)continue;
    if(left>width-300&&top<110)continue;
    const box={x:left-labelWidth/2,y:top-labelHeight,w:labelWidth,h:labelHeight};
    if(occupied.some(b=>box.x<b.x+b.w+4&&box.x+box.w+4>b.x&&box.y<b.y+b.h+4&&box.y+box.h+4>b.y))continue;
    return {x:left,y:top,box};
  }
  return null;
}
