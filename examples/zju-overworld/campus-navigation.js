import {findPath} from './pathfinding.js?v=11';
import {createNavigationEnvironment} from './nav-worker.js?v=11';
const $=id=>document.getElementById(id);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

export const navigationMethods={
  navigationWalkable(x,z){
    if(!this.room&&this.buildingCollision(x,.16,z))return false;
    if(this.room){
      const y=this.currentFloor*3.6;
      if(x< -15.6||x>15.6||z< -17.6||z>17.6)return false;
      return !this.room.colliders.some(c=>y+1.5>c.minY+.05&&y<c.maxY-.05&&x>c.x0-.32&&x<c.x1+.32&&z>c.z0-.32&&z<c.z1+.32);
    }
    const b=this.env.bounds;if(x<b[0]||x>b[2]||z<b[1]||z>b[3])return false;
    if(!this.navigationIndex){
      const bins=new Map();
      for(const f of [...this.env.buildings,...this.env.waters])for(let i=Math.floor((f.box[0]-1)/32);i<=Math.floor((f.box[2]+1)/32);i++)for(let j=Math.floor((f.box[1]-1)/32);j<=Math.floor((f.box[3]+1)/32);j++){const key=i+','+j;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(f);}
      this.navigationIndex=bins;
    }
    const fs=this.navigationIndex.get(Math.floor(x/32)+','+Math.floor(z/32))||[];
    for(const f of fs){
      if(f.type==='water'){
        if(this.env.contains(f,x,z)&&!this.env.roads.some(r=>r.tags.bridge==='yes'&&this.env.nearLine(x,z,r.p)<(r.width||4)/2-.45))return false;
      }else for(const [dx,dz] of [[0,0],[.4,0],[-.4,0],[0,.4],[0,-.4]])if(this.env.contains(f,x+dx,z+dz))return false;
    }
    return true;
  },
  cancelNavigation(message){this.navigationTicket=(this.navigationTicket||0)+1;this.navigationWorker?.terminate();this.navigationWorker=null;this.resolveNavigation?.(null);this.resolveNavigation=null;this.navigation=null;if($('navigation-stop'))$('navigation-stop').hidden=true;if($('navigation-status'))$('navigation-status').textContent=message||'点击地图自动步行 · R 切换跑步';},
  async startNavigation(point){
    if(this.buildMode)this.toggleBuilding(false);
    if(!Number.isFinite(point.x)||!Number.isFinite(point.z))return false;this.stopSportsGame();
    if(this.seated)this.stand();if(this.mode==='aerial'||this.mode==='fly')this.setMode('third');
    this.cancelNavigation();this.autoRun=false;this.demo=null;this.activity=null;this.keys.clear();this.runMode=false;
    let target={...point},label=point.label||(this.room?'地图位置':'校园目的地');
    if(!this.room){const feature=this.env.buildings.find(f=>this.env.contains(f,point.x,point.z));if(feature?.entrance){target=this.doorWorld(feature.entrance,0,3);label=feature.name+'入口';this.env.selectCurrent(feature);}}
    // Small map pixels span several metres: snap an obstructed tap to the nearest clear spot.
    if(!this.navigationWalkable(target.x,target.z)){
      let found=null;const max=this.room?2:12,step=this.room?.35:1;
      for(let r=step;r<=max&&!found;r+=step)for(let i=0;i<24;i++){const p={x:target.x+Math.cos(i*Math.PI/12)*r,z:target.z+Math.sin(i*Math.PI/12)*r};if(this.navigationWalkable(p.x,p.z)){found=p;break;}}
      if(!found){this.cancelNavigation('这里暂时没有可步行到达的位置');this.env.toast('这里没有可走的路线，请点击岸边、道路或建筑。');return false;}target=found;
    }
    const room=this.room,bounds=room?[-15.6,-17.6,15.6,17.6]:this.env.bounds;
    const clean=f=>({p:f.p,h:f.h,box:f.box,width:f.width,type:f.type,tags:{bridge:f.tags?.bridge}});
    const request={id:this.navigationTicket,start:{x:this.position.x,z:this.position.z},goal:target,bounds,cellSize:room?.45:2,maxVisited:300000,sampleStep:room?.15:.4};
    if(room){const leaves=room.doors.filter(d=>Math.abs(d.y-this.position.y)<1).map(d=>{const a=this.doorWorld(d,-d.width/2,0),b=this.doorWorld(d,-d.width/2+d.width*Math.cos(-Math.PI*.53),-d.width*Math.sin(-Math.PI*.53));return {x0:Math.min(a.x,b.x)-.07,x1:Math.max(a.x,b.x)+.07,z0:Math.min(a.z,b.z)-.07,z1:Math.max(a.z,b.z)+.07,minY:d.y,maxY:d.y+d.height};});request.indoor={colliders:[...room.colliders,...leaves],floor:this.currentFloor};}
    else request.world={buildings:[...this.env.buildings.map(clean),...[...this.buildBlocks.values()].filter(b=>b.y<2&&!(['door','window'].includes(b.type)&&b.open)).map(b=>({type:'building',p:[[b.x,b.z],[b.x+1,b.z],[b.x+1,b.z+1],[b.x,b.z+1],[b.x,b.z]],h:[],box:[b.x,b.z,b.x+1,b.z+1],tags:{}}))],waters:this.env.waters.map(clean),roads:this.env.roads.map(clean)};
    $('navigation-status').textContent='正在规划前往 '+label+' 的路线…';$('navigation-stop').hidden=false;
    const result=await new Promise(resolve=>{
      this.resolveNavigation=resolve;
      try{
        const worker=this.navigationWorker=new Worker(new URL('./nav-worker.js?v=11',import.meta.url),{type:'module'});
        worker.onmessage=e=>{if(e.data.id!==request.id)return;worker.terminate();this.navigationWorker=null;this.resolveNavigation=null;resolve(e.data.result);};
        worker.onerror=()=>{worker.terminate();this.navigationWorker=null;this.resolveNavigation=null;resolve({status:'error'});};worker.postMessage(request);
      }catch{
        const env=createNavigationEnvironment(request);this.resolveNavigation=null;
        resolve(findPath(request.start,target,{...request,walkable:env.walkable,cost:env.cost,maxMilliseconds:1000}));
      }
    });
    if(!result||request.id!==this.navigationTicket)return false;
    if(result.status!=='ok'){const message=result.status==='limit'?'路线较复杂，请先点击较近的路口':'没有连通路线，请换一个目的地';this.cancelNavigation(message);this.env.toast(message);return false;}
    this.navigation={path:result.path,index:1,target,label,room:room?.name||null,floor:this.currentFloor,stuck:0,length:result.length};
    $('navigation-stop').hidden=false;this.env.toast('已开始自动步行，按 R 跑过去；WASD 或停止按钮取消。');this.updateMap();return true;
  },
  navigationVector(dt){
    const nav=this.navigation;if(!nav){if(this.navigationWorker&&['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].some(k=>this.keys.has(k)))this.cancelNavigation();return null;}
    if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].some(k=>this.keys.has(k))){this.cancelNavigation();return null;}
    if(nav.room!==(this.room?.name||null)||nav.floor!==this.currentFloor){this.cancelNavigation();return null;}
    while(nav.index<nav.path.length&&distance(this.position,nav.path[nav.index])<.15)nav.index++;
    if(nav.index>=nav.path.length){this.cancelNavigation('已到达 '+nav.label);this.env.toast('已到达 '+nav.label);return {dx:0,dz:0,remaining:0};}
    const p=nav.path[nav.index],remaining=distance(this.position,p);
    if(this.room)for(const d of this.room.doors)if(Math.abs(d.y-this.position.y)<1&&distance(this.position,d)<3){d.open=true;d.target=-Math.PI*.53;d.npcUntil=this.time+2;}
    const red=this.collisionReason.includes('红灯');
    nav.stuck=this.speed<.05&&!red?nav.stuck+dt:0;
    if(nav.stuck>7){this.cancelNavigation('前方暂时被挡住，请重新点击地图');return null;}
    $('navigation-status').textContent=(red?'红灯等候':this.runMode?'自动跑步':'自动步行')+' · '+nav.label+' · '+Math.round(remaining+nav.path.slice(nav.index+1).reduce((n,q,i)=>n+distance(q,nav.path[nav.index+i]),0))+'m';
    return {dx:(p.x-this.position.x)/remaining,dz:(p.z-this.position.z)/remaining,remaining};
  },
  drawNavigation(ctx,px,pz){
    const nav=this.navigation;if(!nav)return;ctx.save();ctx.strokeStyle='#d58220';ctx.lineWidth=2.5;ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(px(this.position.x),pz(this.position.z));for(const p of nav.path.slice(nav.index))ctx.lineTo(px(p.x),pz(p.z));ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#fff';ctx.strokeStyle='#b76b12';ctx.beginPath();ctx.arc(px(nav.target.x),pz(nav.target.z),4,0,7);ctx.fill();ctx.stroke();ctx.restore();
  }
};
