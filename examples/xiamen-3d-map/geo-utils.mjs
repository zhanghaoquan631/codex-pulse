const radians=value=>value*Math.PI/180;
export function distanceMeters(a,b){
 const p=radians(b[1]-a[1]),l=radians(b[0]-a[0]);
 const s=Math.sin(p/2)**2+Math.cos(radians(a[1]))*Math.cos(radians(b[1]))*Math.sin(l/2)**2;
 return 6371000*2*Math.atan2(Math.sqrt(s),Math.sqrt(Math.max(0,1-s)));
}
export function bearingDegrees(a,b){
 const p1=radians(a[1]),p2=radians(b[1]),l=radians(b[0]-a[0]);
 return (Math.atan2(Math.sin(l)*Math.cos(p2),Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(l))*180/Math.PI+360)%360;
}
export const inGeoBounds=(ll,bbox)=>ll[0]>=bbox[0]&&ll[0]<=bbox[2]&&ll[1]>=bbox[1]&&ll[1]<=bbox[3];

export function createLocationSession({geolocation,onChange,bbox,now=()=>Date.now()}){
 let watchId=null,generation=0,state={enabled:false,status:'off',position:null,heading:null,headingSource:null,trail:[],receivedAt:0};
 const emit=()=>onChange({...state,trail:[...state.trail]});
 function clearWatch(){if(watchId!==null){geolocation?.clearWatch(watchId);watchId=null;}generation++;}
 function stop(){clearWatch();state={enabled:false,status:'off',position:null,heading:null,headingSource:null,trail:[],receivedAt:0};emit();}
 function start(){
  clearWatch();if(!geolocation){state.status='unsupported';emit();return;}
  state.enabled=true;state.status='requesting';emit();const current=generation;
  watchId=geolocation.watchPosition(p=>{
   if(current!==generation||!state.enabled)return;
   const c=p.coords,ll=[c.longitude,c.latitude];
   if(!ll.every(Number.isFinite)||Math.abs(ll[0])>180||Math.abs(ll[1])>90||!Number.isFinite(c.accuracy)||c.accuracy<0)return;
   if(p.timestamp&&now()-p.timestamp>30000){state.status='stale';emit();return;}
   const last=state.trail.at(-1),inside=inGeoBounds(ll,bbox),reliable=c.accuracy<=100;
   state.position={ll,accuracy:c.accuracy,speed:Number.isFinite(c.speed)?c.speed:null,at:p.timestamp&&p.timestamp<=now()+10000?p.timestamp:now()};state.receivedAt=now();
   state.status=!inside?'outside':!reliable?'imprecise':'active';
   if(Number.isFinite(c.heading)&&Number.isFinite(c.speed)&&c.speed>=.5){state.heading=(c.heading+360)%360;state.headingSource='course';}
   else if(state.headingSource==='course'||state.headingSource==='track'&&Number.isFinite(c.speed)&&c.speed<.5){state.heading=null;state.headingSource=null;}
   if(inside&&reliable){
    const distance=last?distanceMeters(last.ll,ll):0,seconds=last?(now()-last.at)/1000:0;
    if(!last||distance>=Math.max(5,c.accuracy*.7)){
     if(last&&distance>Math.max(250,seconds*60)){state.trail=[];state.heading=null;state.headingSource=null;}
     else if(last&&distance>Math.max(12,c.accuracy*1.5)&&seconds>1&&!Number.isFinite(c.heading)){state.heading=bearingDegrees(last.ll,ll);state.headingSource='track';}
     state.trail.push({ll,at:now()});if(state.trail.length>1000)state.trail.shift();
    }
   }
   emit();
  },error=>{
   if(current!==generation||!state.enabled)return;
   state.status=error.code===1?'denied':error.code===3?'timeout':'unavailable';
   if(error.code===1){clearWatch();state.enabled=false;state.position=null;state.trail=[];state.heading=null;state.headingSource=null;}
   emit();
  },{enableHighAccuracy:true,maximumAge:0,timeout:15000});
 }
 return {start,stop,suspend(){if(!state.enabled)return;clearWatch();state.status='suspended';state.heading=null;emit();},resume(){if(state.enabled)start();},compass(heading){if(state.enabled&&Number.isFinite(heading)){state.heading=(heading+360)%360;state.headingSource='compass';emit();}},tick(){if(state.enabled&&state.receivedAt&&now()-state.receivedAt>30000&&['active','imprecise'].includes(state.status)){state.status='stale';state.heading=null;emit();}},getState:()=>({...state,trail:[...state.trail]})};
}
