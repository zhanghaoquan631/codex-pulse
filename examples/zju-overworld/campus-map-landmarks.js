import {fieldFrame} from './sports-fields.js?v=11';
const $=id=>document.getElementById(id);
const priorityNames=['启真湖','主图书馆','求是大讲堂','艺术与考古博物馆','月牙楼','基础图书馆','体育馆','南大门','中心湖','东田径场','西田径场','医学院'];
export function registerCampusPlaces(features,buildings){
 for(const f of features){const rank=priorityNames.findIndex(n=>f.name?.includes(n));if(rank>=0)f.landmarkPriority=rank+1;}
 const college=buildings.find(f=>f.id==='way/161325315');
 if(college){Object.assign(college,{mapLabel:'竺可桢学院（东1A）',placeTitle:'竺可桢学院 · 东1教学楼',landmarkPriority:0,aliases:(college.aliases||'')+' 竺可桢学院 竺院 CKC Chu Kochen Honors College 东1A 东一A',description:'竺可桢学院办公区位于东1教学楼 A 区，党政、教学办公室在104室，学生工作办公室在112室。此地图定位到整栋教学楼，并使用现有楼栋入口导航。',placeSource:'http://ckc.zju.edu.cn/34921/list.htm',placeSourceTitle:'学院官方黄页 · 查看位置依据',fidelity:'学院地址已核对官方黄页；地图只有整栋建筑轮廓，未虚构 A 区房间坐标。'});}
 const field=features.find(f=>f.id==='way/1115890437');
 if(field){const frame=fieldFrame(field);for(const [key,name,x,z] of [['baseball','棒球打击练习',-12,15],['badminton','羽毛球对打',12,0]]){const p=frame.world(x,z);features.push({id:'game-'+key,type:'poi',name,activityKey:key,mapLabel:name,landmarkPriority:2,aliases:'运动 游戏 球场 东区 '+name,tags:{sport:key},cx:p.x,cz:p.z,p:[],h:[],box:[p.x-5,p.z-5,p.x+5,p.z+5],height:0,source:field.source,description:'东区球场范围内设置的可玩模拟练习区。J 发球、WASD 移动，鼠标左键或 K 击球；手机有独立操作按钮。',fidelity:'练习区位于现有地图运动场范围内，是本体验加入的游戏设施。'});}}
}
export const landmarkMapMethods={
 bindLandmarkMap(){
  $('map-expand').onclick=()=>this.toggleCampusMap();
  $('map-destinations').replaceChildren();
  for(const f of this.env.features.filter(f=>f.landmarkPriority!==undefined).sort((a,b)=>a.landmarkPriority-b.landmarkPriority)){
   const button=document.createElement('button');button.textContent=f.mapLabel||f.name;button.onclick=()=>this.navigateLandmark(f);$('map-destinations').append(button);
  }
 },
 toggleCampusMap(force){
  this.mapExpanded=typeof force==='boolean'?force:!this.mapExpanded;document.body.classList.toggle('map-expanded',this.mapExpanded);this.keys.clear();this.autoRun=false;
  const c=$('minimap');c.width=this.mapExpanded?Math.min(1000,Math.max(330,innerWidth-65)):220;c.height=this.mapExpanded?Math.min(700,Math.max(280,innerHeight-285)):170;
  this.env.rebuildMapBase();$('map-expand').textContent=this.mapExpanded?'收起地图 ×':'展开地点图 ⤢';$('map-expand').setAttribute('aria-expanded',String(this.mapExpanded));$('map-destinations').hidden=!this.mapExpanded;this.updateMap();return this.mapExpanded;
 },
 drawMapLabels(ctx,px,pz){
  const w=ctx.canvas.width,h=ctx.canvas.height,size=this.mapExpanded?13:9,occupied=[];this.mapLabelHits=[];ctx.save();ctx.font=`600 ${size}px "Microsoft YaHei",sans-serif`;ctx.textBaseline='middle';
  const entries=this.env.features.filter(f=>f.landmarkPriority!==undefined).sort((a,b)=>a.landmarkPriority-b.landmarkPriority);
  for(const f of entries){const x=px(f.cx),y=pz(f.cz),name=f.mapLabel||f.name;ctx.fillStyle=f.activityKey?'#b27932':'#205f56';ctx.beginPath();ctx.arc(x,y,this.mapExpanded?3.8:2.7,0,Math.PI*2);ctx.fill();
   if(!this.mapExpanded&&this.mapLabelHits.length>=6)continue;
   const width=Math.min(w-8,ctx.measureText(name).width+10),height=size+9;
   const positions=[[x+7,y-height-3],[x-width-7,y-height-3],[x-width/2,y+6],[x-width/2,y-height-7]].map(([a,b])=>({x:Math.max(3,Math.min(w-width-3,a)),y:Math.max(3,Math.min(h-height-3,b)),w:width,h:height}));
   const box=positions.find(r=>!occupied.some(o=>r.x<o.x+o.w+3&&r.x+r.w+3>o.x&&r.y<o.y+o.h+3&&r.y+r.h+3>o.y));if(!box)continue;
   ctx.fillStyle='#f8fbeeef';ctx.fillRect(box.x,box.y,box.w,box.h);ctx.strokeStyle=f.landmarkPriority===0?'#277867':'#a8bba5';ctx.lineWidth=1;ctx.strokeRect(box.x,box.y,box.w,box.h);ctx.fillStyle='#244f43';ctx.fillText(name,box.x+5,box.y+height/2);occupied.push(box);this.mapLabelHits.push({...box,feature:f});
  }ctx.restore();
 },
 mapLandmarkAt(u,v){const c=$('minimap'),x=u*c.width,y=v*c.height;return this.mapLabelHits?.find(r=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h)?.feature;},
 navigateLandmark(f){
  this.stopSportsGame();if(this.room)this.leaveBuilding();if(this.mapExpanded)this.toggleCampusMap(false);
  if(this.ride){this.quoteRide({x:f.entrance?.x??f.cx,z:f.entrance?.z??f.cz},f.mapLabel||f.name);return true;}
  this.env.selectCurrent(f);let point;
  if(f.entrance)point=this.doorWorld(f.entrance,0,3);else if(f.activityKey){const arena=this.playableArenas[f.activityKey];point=arena.model.toWorld(arena.model.anchors.player);}else if(f.type==='water'){const q=this.env.safePosition(f);point={x:q[0],z:q[1]};}else point={x:f.cx,z:f.cz};
  return this.startNavigation({...point,label:f.mapLabel||f.name});
 }
};
