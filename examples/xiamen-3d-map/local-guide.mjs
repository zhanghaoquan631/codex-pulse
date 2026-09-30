import {createElement,ArrowLeft,ArrowUpRight,X} from 'lucide';
import {localFoods} from './food-data.mjs';
import './food-guide.css';

const transit=[
 ['鼓浪屿渡轮','上岛码头、航线和票务会调整。先在轮渡公司官网核对，再安排岛上行程。','https://xmferry.com/'],
 ['机场与铁路','进出岛接驳可结合地铁、公交或出租车查询。','https://jt.xm.gov.cn/'],
 ['城市慢行与 BRT','环岛路可选择一段慢行；跨片区出行可查询公交、地铁及 BRT。','https://jt.xm.gov.cn/tzxx/hyxw/202412/t20241218_2907516.htm']
];
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;};
const link=(label,url)=>{const a=el('a',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};

export function mountLocalGuide(){
 const trigger=el('button','在地指南 · 美食与交通','guide-open');document.querySelector('.route-open').after(trigger);
 const dialog=el('dialog',null,'detail-dialog guide-dialog');dialog.setAttribute('aria-labelledby','guide-title');
 dialog.innerHTML='<div class="dialog-top"><span class="eyebrow">XIAMEN LOCAL GUIDE</span><button aria-label="关闭在地指南" title="关闭在地指南"></button></div><h2 id="guide-title">在地指南</h2><div class="guide-tabs" aria-label="指南分类"><button aria-pressed="true">厦门味道</button><button aria-pressed="false">交通入口</button></div><div class="guide-content"></div><p class="about-note">照片为历史拍摄资料，非实时画面；菜品配方、店铺营业与交通班次以现场及官方信息为准。</p>';
 document.body.append(dialog);
 const content=dialog.querySelector('.guide-content'),tabs=[...dialog.querySelectorAll('.guide-tabs button')];
 let photos=null,requestId=0,selectedTab=0;
 function image(id,caption){
   const figure=el('figure',null,'food-photo'),photo=photos?.[id];
   if(!photo){figure.append(el('p','图片暂不可用','food-photo-missing'));return figure;}
   const img=el('img');img.src=photo.src;img.alt=caption;img.decoding='async';img.loading='lazy';
   img.onerror=()=>{img.hidden=true;figure.prepend(el('p','图片暂不可用','food-photo-missing'));};
   const credit=el('figcaption');credit.append(el('span',caption),el('span',`摄影：${photo.author} · ${photo.captured}`),link('原图来源',photo.source),document.createTextNode(' · '),link(photo.license,photo.licenseUrl),el('span',photo.change));
   figure.append(img,credit);return figure;
 }
 function detail(food){
   ++requestId;content.className='guide-content food-detail';content.replaceChildren();
   const back=el('button',null,'food-back');back.setAttribute('aria-label','返回厦门味道');back.title='返回厦门味道';back.append(createElement(ArrowLeft),document.createTextNode('厦门味道'));back.onclick=()=>{render(0);requestAnimationFrame(()=>content.querySelector(`[data-food="${food.id}"]`)?.focus());};
   const heading=el('h3',food.name);heading.tabIndex=-1;
   content.append(back,heading,el('p',food.category+' · '+food.region,'food-meta'),image(food.id,food.caption),el('p',food.description));
   const list=el('ul');food.details.forEach(text=>list.append(el('li',text)));content.append(list,el('p',food.note,'food-note'));
   if(food.reference){const more=el('details'),summary=el('summary','同类食物参考照片');more.append(summary,image(food.reference.id,food.reference.caption));content.append(more);}
   heading.focus();dialog.scrollTop=0;
 }
 function cards(){
   content.className='guide-content food-grid';content.replaceChildren();
   for(const food of localFoods){
     const button=el('button',null,'food-card');button.dataset.food=food.id;button.setAttribute('aria-label','查看'+food.name+'图片与介绍');
     const photo=photos?.[food.id];if(photo){const img=el('img');img.src=photo.src;img.alt=food.caption;img.loading='lazy';img.onerror=()=>{img.hidden=true;};button.append(img);}
     const body=el('span',null,'food-card-body');body.append(el('small',food.category),el('strong',food.name),el('span',food.summary),el('small',food.caption));button.append(body,createElement(ArrowUpRight));button.onclick=()=>detail(food);content.append(button);
   }
 }
 async function render(index){
   const token=++requestId;selectedTab=index;tabs.forEach((b,i)=>b.setAttribute('aria-pressed',String(index===i)));content.className='guide-content';content.replaceChildren();dialog.scrollTop=0;
   if(index===0){
     if(!photos){content.append(el('p','正在读取图片…','food-status'));try{const response=await fetch('/data/food-photos.json');if(!response.ok)throw new Error('Photo metadata unavailable');photos=await response.json();}catch{photos={};}}
     if(token===requestId&&selectedTab===0)cards();
   }else for(const [name,description,url]of transit){const article=el('article',null,'guide-card');article.append(el('h3',name),el('p',description),link('查看官方信息',url));content.append(article);}
 }
 tabs.forEach((b,i)=>b.onclick=()=>render(i));trigger.onclick=()=>{dialog.showModal();render(0);};
 const close=dialog.querySelector('[aria-label="关闭在地指南"]');close.append(createElement(X));close.onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>++requestId);
}
