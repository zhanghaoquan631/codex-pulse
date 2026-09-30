/** The small and expanded maps share exactly the same world-coordinate marks. */
import {groundHeight} from './landforms.mjs';
export function drawMissionMap(canvas,level,player,{large=false,time=0,tracking=null}={}){
  const ctx=canvas.getContext('2d');if(!ctx||!level)return;
  const w=canvas.width,h=canvas.height,b=level.bounds,pad=large?65:18,scale=Math.min((w-pad*2)/(b.maxX-b.minX),(h-pad*2)/(b.maxZ-b.minZ));
  const x=n=>w/2+(n-(b.minX+b.maxX)/2)*scale,z=n=>h/2+(n-(b.minZ+b.maxZ)/2)*scale;
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#f7f1df';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#294d7620';ctx.lineWidth=1;
  for(let xx=0;xx<w;xx+=30){ctx.beginPath();ctx.moveTo(xx,0);ctx.lineTo(xx,h);ctx.stroke();}
  for(let zz=0;zz<h;zz+=30){ctx.beginPath();ctx.moveTo(0,zz);ctx.lineTo(w,zz);ctx.stroke();}
  const path=points=>{ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(x(p.x),z(p.z)):ctx.moveTo(x(p.x),z(p.z)));};
  for(const polygon of level.cartography?.water||[]){path(polygon);ctx.closePath();ctx.fillStyle='#afcadb';ctx.fill();}
  for(const road of level.cartography?.roads||[]){path(road.points);ctx.strokeStyle='#ffffff';ctx.lineWidth=Math.max(2,road.width*scale);ctx.stroke();}
  for(const wall of level.walls){
    if(wall.kind==='invisible'||wall.kind?.startsWith('traversal-'))continue;ctx.save();ctx.translate(x(wall.x),z(wall.z));ctx.rotate(-(wall.rotation||0));
    ctx.fillStyle=wall.height>5?'#8495ad88':'#a5b1c288';ctx.strokeStyle='#39517a99';ctx.lineWidth=.7;
    ctx.fillRect(-wall.w*scale/2,-wall.d*scale/2,wall.w*scale,wall.d*scale);ctx.strokeRect(-wall.w*scale/2,-wall.d*scale/2,wall.w*scale,wall.d*scale);ctx.restore();
  }
  // One clean footprint replaces the stacked floor/roof/wall rectangles. The
  // map shows an explorable room, without overprinting two storeys of panels.
  const roomStructures=new Map((level.structures||[]).filter(s=>s.roomId).map(s=>[s.roomId,s]));
  for(const room of level.traversal?.rooms||[]){
    const status=roomStructures.get(room.id)?.status,collapsed=room.collapsed||status==='collapsed',warning=status==='warning';
    ctx.save();ctx.translate(x(room.x),z(room.z));ctx.rotate(-(room.rotation||0));
    ctx.fillStyle=warning?'#d2685a50':'#e9d6b090';ctx.strokeStyle=collapsed?'#928d8170':warning?'#b4382d':'#796746';ctx.lineWidth=large?(warning?2.5:1.6):1;
    if(collapsed)ctx.setLineDash([3,4]);else ctx.fillRect(-room.w*scale/2,-room.d*scale/2,room.w*scale,room.d*scale);
    ctx.strokeRect(-room.w*scale/2,-room.d*scale/2,room.w*scale,room.d*scale);ctx.restore();
  }
  const labels=[],marks=large?[{x:x(player.x)-14,y:z(player.z)-14,w:28,h:28}]:[];
  function marker(p,text,color,size,label,priority=1,separate=false){
    const anchorX=x(p.x),anchorY=z(p.z);let px=anchorX,py=anchorY;
    // Several upstairs clues can share the footprint of one small building.
    // Fan their icons out only on the expanded map, with a leader ending at the
    // actual world position. Important clue markers are placed before supplies.
    if(large&&separate){
      let best=Infinity;
      for(let ring=0;ring<5;ring++)for(let n=0;n<(ring?12:1);n++){
        const angle=n*Math.PI/6,cx=anchorX+Math.cos(angle)*ring*25,cy=anchorY+Math.sin(angle)*ring*25;
        if(cx<size+8||cx>w-size-8||cy<size+8||cy>h-size-8)continue;
        const candidate={x:cx-size-3,y:cy-size-3,w:size*2+6,h:size*2+6};
        const overlap=marks.reduce((sum,m)=>sum+Math.max(0,Math.min(candidate.x+candidate.w,m.x+m.w)-Math.max(candidate.x,m.x))*Math.max(0,Math.min(candidate.y+candidate.h,m.y+m.h)-Math.max(candidate.y,m.y)),0);
        const score=overlap*1000+ring*25;if(score<best){best=score;px=cx;py=cy;}
      }
      const dx=px-anchorX,dy=py-anchorY,length=Math.hypot(dx,dy);
      if(length>size+2){
        ctx.save();ctx.strokeStyle=color;ctx.lineWidth=1;ctx.globalAlpha=.7;ctx.beginPath();ctx.moveTo(anchorX,anchorY);ctx.lineTo(px-dx/length*size,py-dy/length*size);ctx.stroke();
        ctx.fillStyle=color;ctx.beginPath();ctx.arc(anchorX,anchorY,2,0,Math.PI*2);ctx.fill();ctx.restore();
      }
    }
    ctx.save();ctx.translate(px,py);ctx.fillStyle='#fff7df';ctx.strokeStyle=color;ctx.lineWidth=large?2:1.4;
    ctx.beginPath();ctx.arc(0,0,size,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle=color;ctx.font=`bold ${size*1.35}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,0,.3);
    if(large){marks.push({x:px-size-3,y:py-size-3,w:size*2+6,h:size*2+6});if(label)labels.push({px,py,size,label,color,priority});}
    ctx.restore();
  }
  for(const door of level.doors)if(!door.open)marker(door,'▰','#98713b',large?6:2.5);
  for(const enemy of level.enemies){if(!enemy.alive||enemy.active===false)continue;
    if(enemy.perched)marker(enemy,'▲','#b63142',large?7:3.5);
    else{ctx.fillStyle=enemy.type==='boss'?'#6f244b':'#b63142';ctx.beginPath();ctx.arc(x(enemy.x),z(enemy.z),enemy.type==='boss'?(large?8:4):(large?3.5:2),0,Math.PI*2);ctx.fill();}
  }
  const hunt=level.hunt;
  for(const [i,s] of (level.journey?.steps||[]).entries())if(s.completed||i===level.journey.stepIndex)marker(s,s.completed?'✓':String(i+1),s.completed?'#657d65':'#76518a',large?14:6,s.completed?s.title+' · 已完成':s.title+' · E 操作',.05,true);
  for(const e of level.expedition?.evidence||[])marker(e,e.collected?'✓':'证','#567c5a',large?12:5,e.collected?e.name+' · 已记录':e.name+' · E 调查',1.2,true);
  for(const n of level.npcs||[])if(n.type==='merchant'||n.type==='shop')marker(n,n.alive===false?'×':'商',n.alive===false?'#8f8980':'#94712f',large?13:6,n.alive===false?'行商遇难 · 无法交易':`行商${n.y>1.5?' · 楼上':''}${n.fleeing?' · 奔跑避险':' · E 交易'}`,.1,true);
  if(level.evacuation){const e=level.evacuation;marker(e.safeZone,'安','#3e7b57',large?15:7,`避难处 · 已送达 ${e.delivered} / ${e.target}`,.1,true);
    for(const p of e.people)if(!p.insideVehicleId&&!p.evacuated){ctx.fillStyle=!p.alive?'#8f8980':p.following?'#27974e':'#658886';ctx.beginPath();ctx.arc(x(p.x),z(p.z),large?3:1.7,0,Math.PI*2);ctx.fill();}
    for(const v of e.vehicles){ctx.strokeStyle=v.alive?'#56788b':'#96826c';ctx.lineWidth=large?2:1;ctx.strokeRect(x(v.x)-3,z(v.z)-2,6,4);}
  }
  for(const survivor of level.survivors||[])if(survivor.alive!==false&&!survivor.rescued){
    const warning=level.structures?.find(s=>s.id===survivor.structureId)?.status==='warning';
    marker(survivor,'人',warning?'#b4382d':'#2f795b',large?12:5,warning?'幸存者 · 楼将倒塌，先救援':'幸存者 · E 救援',warning?-.1:.2,true);
  }
  for(const drop of hunt?.letterDrops||[])if(!drop.collected)marker(drop,drop.letter,'#8153a5',large?9:5,large?'字母卡 · '+drop.letter:null,2);
  (hunt?.clueIds||[]).forEach((id,i)=>{const clue=level.collectibles.find(c=>c.id===id);if(!clue)return;
    const station=id===(hunt.riddleSiteId||hunt.clueIds[0]);
    const upstairs=clue.absoluteY===true&&clue.y-groundHeight(level,clue.x,clue.z)>1.2;
    const floor=upstairs?'楼上 · ':'';
    marker(clue,station&&!hunt.riddleSolved?'谜':clue.collected?'✓':'?',clue.collected&&!station?'#658065':'#8153a5',large?14:7,
      floor+(station?(hunt.riddleSolved?'猜谜点 · 已解开':'猜谜点 · 收齐字母回来拼词'):clue.collected?`线索 ${i+1} · 已调查`:`密码芯片 ${i+1}`),upstairs ? .3 : 1,true);
  });
  if(hunt)marker(hunt.target,hunt.phase==='boss'?'!':'⚑',hunt.phase==='ready'?'#ac7321':'#466381',large?16:7,hunt.phase==='boss'?'首领战场':'任务房 · Boss',0);
  for(const room of level.traversal?.rooms||[]){
    const structure=roomStructures.get(room.id),collapsed=room.collapsed||structure?.status==='collapsed';
    if(room.entry&&!collapsed)marker(room.entry,'↑',structure?.status==='warning'?'#b4382d':'#526e63',large?10:4.5,structure?.status==='warning'?'危楼入口 · 尽快离开':'补给楼入口 · 楼梯上楼',.5,true);
    const supplies=(level.collectibles||[]).filter(c=>!c.collected&&c.kind==='supply'&&(c.roomId===room.id||(room.supplies||[]).some(s=>s.id===c.id)));
    const upstairs=supplies.some(c=>c.absoluteY===true&&c.y-groundHeight(level,c.x,c.z)>1.2);
    supplies.forEach((s,i)=>marker(s,'+','#9b6c26',large?8:3.5,large&&i===0?`${upstairs?'楼上补给':'散落补给'} · 剩余 ${supplies.length} 份`:null,.7,true));
  }
  if(tracking&&tracking.available&&!tracking.completed){ctx.save();ctx.strokeStyle='#25864c';ctx.lineWidth=large?3:2;ctx.beginPath();ctx.arc(x(tracking.x),z(tracking.z),large?22:10,0,Math.PI*2);ctx.stroke();ctx.restore();}
  ctx.save();ctx.translate(x(player.x),z(player.z));ctx.rotate(Math.atan2(player.facingX,-player.facingZ));ctx.fillStyle='#173e7b';ctx.strokeStyle='white';ctx.lineWidth=2;
  ctx.beginPath();const s=large?11:6;ctx.moveTo(0,-s);ctx.lineTo(-s*.7,s*.6);ctx.lineTo(0,s*.22);ctx.lineTo(s*.7,s*.6);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
  if(large){
    marks.push({x:16,y:8,w:52,h:26});
    drawLabels(ctx,labels,marks,w,h);
  }
  ctx.fillStyle='#294875';ctx.font=`bold ${large?18:11}px sans-serif`;ctx.textAlign='left';ctx.fillText('北 ↑',large?22:8,large?27:14);
}

/** Place mission labels before drawing them, so late markers cannot cover text. */
function drawLabels(ctx,labels,marks,width,height){
  const inset=8,gap=6,placed=[],clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
  const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.w+gap,b.x+b.w)-Math.max(a.x-gap,b.x))*Math.max(0,Math.min(a.y+a.h+gap,b.y+b.h)-Math.max(a.y-gap,b.y));
  ctx.save();ctx.font='bold 16px "Microsoft YaHei",sans-serif';ctx.textAlign='left';ctx.textBaseline='middle';
  // The flag takes its preferred position first; clue order stays deterministic.
  for(const label of labels.sort((a,b)=>a.priority-b.priority)){
    let text=label.label;const maxTextWidth=Math.max(0,width-inset*2-10);
    if(ctx.measureText(text).width>maxTextWidth){
      const chars=Array.from(text);while(chars.length&&ctx.measureText(chars.join('')+'…').width>maxTextWidth)chars.pop();text=chars.length?chars.join('')+'…':'';
    }
    const bw=Math.min(width-inset*2,ctx.measureText(text).width+10),bh=24,{px,py,size}=label;
    const preferred={x:px-bw/2,y:py+size+10};const candidates=[];
    const add=(cx,cy)=>candidates.push({x:clamp(cx,inset,width-inset-bw),y:clamp(cy,inset,height-inset-bh),w:bw,h:bh});
    // Close below/above/right/left positions, then progressively wider offsets.
    for(let ring=0;ring<5;ring++){
      const offset=10+ring*(bh+gap);
      add(px-bw/2,py+size+offset);add(px-bw/2,py-size-offset-bh);
      add(px+size+offset,py-bh/2);add(px-size-offset-bw,py-bh/2);
      for(const side of[-1,1]){const cx=side<0?px-size-offset-bw:px+size+offset;add(cx,py+size+offset);add(cx,py-size-offset-bh);}
    }
    // Dense corner groups can use the remaining canvas instead of clipping text.
    if(candidates.every(c=>placed.some(p=>overlap(c,p)>0)||marks.some(p=>overlap(c,p)>0))){
      for(let cy=inset;cy<=height-inset-bh;cy+=bh+gap)for(let cx=inset;cx<=width-inset-bw;cx+=bw+gap)add(cx,cy);
    }
    let best=null,bestScore=Infinity;
    for(const candidate of candidates){
      const labelOverlap=placed.reduce((n,p)=>n+overlap(candidate,p),0),markOverlap=marks.reduce((n,p)=>n+overlap(candidate,p),0);
      const distance=Math.hypot(candidate.x+bw/2-px,candidate.y+bh/2-py);
      const score=labelOverlap*1e6+markOverlap*1e3+distance;
      if(score<bestScore){bestScore=score;best=candidate;}
    }
    if(best)placed.push({...best,...label,text,displaced:Math.abs(best.x-preferred.x)>.5||Math.abs(best.y-preferred.y)>.5});
  }
  // Leaders go underneath the label backgrounds and stop at the marker edge.
  for(const p of placed){
    if(!p.displaced)continue;const ex=clamp(p.px,p.x,p.x+p.w),ey=clamp(p.py,p.y,p.y+p.h),dx=ex-p.px,dy=ey-p.py,length=Math.hypot(dx,dy);
    if(length<=p.size+2)continue;ctx.strokeStyle=p.color;ctx.globalAlpha=.65;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(p.px+dx/length*(p.size+2),p.py+dy/length*(p.size+2));ctx.lineTo(ex,ey);ctx.stroke();
  }
  ctx.globalAlpha=1;
  for(const p of placed){ctx.fillStyle='#fff8e9f5';ctx.fillRect(p.x,p.y,p.w,p.h);ctx.fillStyle=p.color;ctx.fillText(p.text,p.x+5,p.y+p.h/2);}
  ctx.restore();
}
