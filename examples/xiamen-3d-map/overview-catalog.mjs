import * as THREE from 'three';
import {createElement,List,X,Search} from 'lucide';
import './overview-catalog.css';

// Each node belongs to exactly one screen cluster; collisions never discard membership.
export function clusterProjected(points,radius=72){
 const result=[];
 for(const p of points){
  let group=result.find(g=>g.area===p.area&&Math.hypot(g.x-p.x,g.y-p.y)<radius);
  if(!group){group={area:p.area,x:p.x,y:p.y,members:[]};result.push(group);}
  group.members.push(p);group.x=group.members.reduce((s,p)=>s+p.x,0)/group.members.length;group.y=group.members.reduce((s,p)=>s+p.y,0)/group.members.length;
 }
 return result;
}

export function mountOverviewCatalog({catalog,camera,toWorld,heightAt,waterAt,labelsVisible,selectedName}){
 const layer=document.createElement('div');layer.className='overview-labels';document.body.append(layer);
 const badge=document.createElement('button');badge.id='overview-catalog';badge.className='overview-catalog glass';badge.append(createElement(List));document.body.append(badge);
 const islandCount=catalog.filter(p=>p.island).length,summary=`${catalog.length}处游览节点 · 鼓浪屿${islandCount}处`;
 badge.append(document.createTextNode(summary));badge.title='查看全部已收录地点';badge.setAttribute('aria-label',summary+'，打开地点目录');
 const dialog=document.createElement('dialog');dialog.className='catalog-dialog';dialog.setAttribute('aria-label','全图地点目录');document.body.append(dialog);
 const heading=document.createElement('header'),title=document.createElement('h2'),close=document.createElement('button');close.title='关闭地点目录';close.setAttribute('aria-label',close.title);close.append(createElement(X));close.onclick=()=>dialog.close();heading.append(title,close);
 const search=document.createElement('input');search.type='search';search.placeholder='搜索地点名称';search.setAttribute('aria-label','搜索地点目录');const rows=document.createElement('div');dialog.append(heading,search,rows);
 let shown=catalog,last=0,drawn=[];const nodes=new Map();
 function renderRows(){rows.replaceChildren();const matched=shown.filter(p=>p.name.includes(search.value.trim()));for(const p of matched){const button=document.createElement('button');button.className='catalog-row';const name=document.createElement('strong'),area=document.createElement('small');name.textContent=p.name;area.textContent=p.group;button.append(name,area);button.onclick=()=>{dialog.close();p.visit(false);};rows.append(button);}if(!matched.length)rows.textContent='没有匹配地点';}
 function open(list=catalog){shown=list;title.textContent=`${list.length}处游览节点`;search.value='';renderRows();dialog.showModal();}
 badge.onclick=()=>open();search.oninput=renderRows;
 const points=catalog.map(p=>{const [x,z]=toWorld(...p.ll);return {p,pos:new THREE.Vector3(x,Math.max(heightAt(x,z),waterAt(x,z)??-1)+.025,z)};});
 const rect=r=>[r.left,r.top,r.right,r.bottom],intersects=(a,b)=>a[0]<b[2]+4&&a[2]>b[0]-4&&a[1]<b[3]+4&&a[3]>b[1]-4;
 return {open,getState:()=>({total:catalog.length,island:islandCount,clusters:drawn.map(g=>({names:g.members.map(p=>p.item.name),count:g.members.length})),catalog:catalog.map(p=>({id:p.id,name:p.name,group:p.group,island:!!p.island}))}),update(now=performance.now()){
  if(now-last<140)return;last=now;layer.hidden=!labelsVisible();if(layer.hidden)return;
  const projected=points.map(({p,pos})=>{const v=pos.clone().project(camera);return {item:p,area:p.group,x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2,z:v.z};}).filter(p=>p.z>=-1&&p.z<=1&&p.x>=0&&p.x<=innerWidth&&p.y>=0&&p.y<=innerHeight);
  const groups=clusterProjected(projected,innerWidth<=650?85:72).sort((a,b)=>Number(b.members.some(p=>p.item.name===selectedName()))-Number(a.members.some(p=>p.item.name===selectedName()))||b.members.length-a.members.length);
  const blockers=[...document.querySelectorAll('.brand,.top-actions,.scene-settings,.scene-tools,.sky-options,.explore,.location-card,.bottom-center,.map-controls,.travel-launch,.travel-drawer,.travel-tour-bar.floating,.overview-catalog,footer')].filter(el=>el.offsetWidth&&getComputedStyle(el).visibility!=='hidden').map(el=>rect(el.getBoundingClientRect()));
  const occupied=[...blockers],alive=new Set();drawn=[];
  for(const g of groups){
   const names=g.members.map(p=>p.item.name),key=g.members.map(p=>p.item.id).join('|');alive.add(key);
   let node=nodes.get(key);if(!node){const button=document.createElement('button'),line=document.createElement('span');button.className='overview-label';button.dataset.count=g.members.length;line.className='overview-leader';const name=document.createElement('strong');name.textContent=g.members.length===1?names[0]:`${g.area} · ${g.members.length}处`;button.append(name);if(g.members.length>1){const small=document.createElement('small');small.textContent=names.slice(0,2).join(' · ');button.append(small);}button.title=names.join('、');button.setAttribute('aria-label',g.members.length===1?names[0]+'，查看地点':g.area+'，'+g.members.length+'处：'+names.join('、'));button.onclick=()=>g.members.length===1?g.members[0].item.visit(false):open(g.members.map(p=>p.item));layer.append(line,button);node={button,line};nodes.set(key,node);}
   const {button,line}=node;button.hidden=false;
   const w=button.offsetWidth,h=button.offsetHeight,tryRect=(x,y)=>[x-w/2,y-h/2,x+w/2,y+h/2];let position=null;
   for(const distance of [0,40,80,120,160,200,260,340]){for(let step=0;step<(distance?16:1);step++){const angle=step*Math.PI/8,x=Math.max(8+w/2,Math.min(innerWidth-w/2-8,g.x+Math.cos(angle)*distance)),y=Math.max(8+h/2,Math.min(innerHeight-h/2-8,g.y+Math.sin(angle)*distance)),r=tryRect(x,y);if(!occupied.some(o=>intersects(r,o))){position={x,y,r};break;}}if(position)break;}
   if(!position){button.hidden=true;line.hidden=true;continue;}
   button.style.left=position.x+'px';button.style.top=position.y+'px';occupied.push(position.r);drawn.push(g);
   const dx=g.x-position.x,dy=g.y-position.y,length=Math.hypot(dx,dy);line.hidden=length<=25;if(length>25)line.style.cssText=`left:${position.x}px;top:${position.y}px;width:${length}px;transform:rotate(${Math.atan2(dy,dx)}rad)`;
  }
  for(const [key,node] of nodes)if(!alive.has(key)){node.button.remove();node.line.remove();nodes.delete(key);}
 }};
}
