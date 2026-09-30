import {detailContent,safeSource} from './detail-content.mjs';
import {createRegionalFactsView} from './regional-facts-view.mjs';
import './place-detail-viewer.css';

const element=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text)node.textContent=text;return node;};
const button=(text,label)=>{const node=element('button','',text);node.type='button';node.setAttribute('aria-label',label||text);node.title=label||text;return node;};
export function createPlaceDetailViewer(){
 const dialog=element('dialog','place-detail-viewer');dialog.setAttribute('aria-labelledby','photo-detail-title');
 const header=element('header'),heading=element('div'),eyebrow=element('p','photo-eyebrow'),title=element('h2');title.id='photo-detail-title';
 const close=button('×','关闭图文详情');heading.append(eyebrow,title);header.append(heading,close);
 const dishes=element('nav','detail-dishes');dishes.setAttribute('aria-label','选择美食');
 const body=element('div','photo-detail-body'),visual=element('section','detail-visual'),frame=element('div','detail-photo-frame');
 const status=element('p','photo-status');status.setAttribute('role','status');const zoom=button('','放大图片');zoom.className='photo-zoom';zoom.hidden=true;
 const attribution=element('p','photo-attribution'),gallery=element('div','detail-gallery');gallery.setAttribute('aria-label','选择图片');
 const retry=button('重新加载','重新加载图片');retry.className='photo-retry';retry.hidden=true;
 frame.append(status,zoom);visual.append(frame,retry,attribution,gallery);
 const copy=element('section','detail-copy'),introTitle=element('h3','','介绍'),intro=element('p'),introCredit=element('p','photo-attribution'),lookTitle=element('h3','','细节'),look=element('p'),sceneTitle=element('h3','','地图场景'),scene=element('p'),links=element('div','detail-source-links');
 copy.append(introTitle,intro,introCredit,lookTitle,look,sceneTitle,scene,links);body.append(visual,copy);
 const regionalFacts=createRegionalFactsView();
 dialog.append(header,dishes,regionalFacts.element,body);document.body.append(dialog);
 const lightbox=element('dialog','detail-lightbox'),lightClose=button('×','关闭大图'),large=element('img');lightbox.setAttribute('aria-label','图片大图');lightbox.append(lightClose,large);document.body.append(lightbox);
 let catalogPromise,returnFocus,place,dish,epoch=0,timer,photoEpoch=0;
 function loadCatalog(){
  if(!catalogPromise)catalogPromise=fetch('/data/detail-photos.json',{signal:AbortSignal.timeout(10000)}).then(r=>{if(!r.ok)throw new Error('catalog');return r.json();}).catch(()=>{catalogPromise=null;return null;});
  return catalogPromise;
 }
 function link(label,url,parent=links){if(!safeSource(url))return;const a=element('a','',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';parent.append(a);}
 function showPhoto(photo){
  const photoRequest=++photoEpoch;
  clearTimeout(timer);retry.hidden=true;zoom.replaceChildren();zoom.hidden=true;status.hidden=false;status.textContent='图片加载中';attribution.replaceChildren();
  const image=element('img');image.alt=photo.caption;image.decoding='async';image.referrerPolicy='no-referrer';let settled=false;
  const fail=()=>{if(settled||photoRequest!==photoEpoch)return;settled=true;clearTimeout(timer);image.onload=null;image.onerror=null;status.textContent='图片暂时无法加载，可查看原图来源。';zoom.hidden=true;retry.hidden=false;retry.onclick=()=>showPhoto(photo);};
  image.onload=()=>{if(settled||photoRequest!==photoEpoch)return;settled=true;clearTimeout(timer);status.hidden=true;zoom.hidden=false;};image.onerror=fail;
  zoom.append(image);image.src=photo.src;timer=setTimeout(fail,12000);
  attribution.append(document.createTextNode(`${photo.caption} · ${photo.author||'作者见来源'} · ${photo.change||''} `));
  link('图片来源',photo.source,attribution);link(photo.license,photo.licenseUrl,attribution);
  if(!photo.licenseUrl)attribution.append(document.createTextNode(' '+(photo.license||'')));
  zoom.onclick=()=>{large.src=image.src;large.alt=image.alt;lightbox.showModal();};
 }
 function render(catalog){
  const data=detailContent(place,dish,catalog);title.textContent=data.name;intro.textContent=data.intro;look.textContent=data.look;look.hidden=lookTitle.hidden=!data.look;scene.textContent=data.scene;
  introCredit.replaceChildren();if(data.introSource){link(data.introCredit,data.introSource,introCredit);if(data.introCredit==='资料摘要：维基百科')link('CC BY-SA 4.0','https://creativecommons.org/licenses/by-sa/4.0/',introCredit);}
  links.replaceChildren();link('资料原文',data.article);link('搜索实拍图片',data.search);link('地图位置（近似）',data.map);
  gallery.replaceChildren();photoEpoch++;clearTimeout(timer);retry.hidden=true;zoom.replaceChildren();zoom.hidden=true;attribution.replaceChildren();
  if(data.photos.length){
   data.photos.forEach((photo,index)=>{const b=button(String(index+1),photo.caption+'，图片 '+(index+1));b.onclick=()=>{for(const sibling of gallery.children)sibling.setAttribute('aria-pressed',String(sibling===b));showPhoto(photo);};b.setAttribute('aria-pressed',String(index===0));gallery.append(b);});
   gallery.hidden=data.photos.length<2;showPhoto(data.photos[0]);
  }else{gallery.hidden=true;status.hidden=false;status.textContent=place.kind==='activity'||place.kind==='transport'&&!data.article?'此处为地图演绎场景，暂无对应实拍。':'暂未收录已核对的对应实拍图片。';link('查找 '+data.name+' 的实拍',data.search,attribution);}
 }
 async function choose(nextDish){
  dish=nextDish;const request=++epoch;
  for(const b of dishes.children)b.setAttribute('aria-pressed',String(b.textContent===dish));
  render({});const hasLocalPhoto=!!detailContent(place,dish).photos.length;
  if(!hasLocalPhoto)status.textContent='图文资料加载中';
  const catalog=await loadCatalog();if(request!==epoch||!dialog.open)return;
  if(catalog)render(catalog);
  else{if(!hasLocalPhoto)status.textContent='图文资料暂时无法读取，请重新加载。';retry.hidden=false;retry.onclick=()=>choose(dish);}
 }
 close.onclick=()=>dialog.close();lightClose.onclick=()=>lightbox.close();
 const outside=(e,d)=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();};
 dialog.addEventListener('click',e=>outside(e,dialog));lightbox.addEventListener('click',e=>outside(e,lightbox));
 dialog.addEventListener('close',()=>{if(dialog.open)return;epoch++;photoEpoch++;clearTimeout(timer);zoom.replaceChildren();if(lightbox.open)lightbox.close();const target=returnFocus?.isConnected&&returnFocus.getClientRects().length?returnFocus:document.querySelector('.photo-inspect:not([hidden])');target?.focus({preventScroll:true});});
 lightbox.addEventListener('close',()=>{if(lightbox.open)return;large.removeAttribute('src');if(dialog.open)zoom.focus({preventScroll:true});});
 return {open(nextPlace){
  if(!nextPlace)return;place=nextPlace;returnFocus=document.activeElement;
  regionalFacts.render(place);
  eyebrow.textContent=place.region||place.area||place.en||'潮汕';dishes.replaceChildren();
  for(const name of place.dishes||[]){const b=button(name);b.onclick=()=>choose(name);dishes.append(b);}dishes.hidden=!place.dishes?.length;
  if(!dialog.open)dialog.showModal();dialog.scrollTop=0;choose(place.dishes?.[0]);
 }};
}
