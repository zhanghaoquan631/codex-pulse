export function attachPhotoDetail(dialog){
 const figure=document.createElement('figure');figure.className='place-photo';figure.hidden=true;
 const image=document.createElement('img');image.loading='lazy';image.decoding='async';
 const credit=document.createElement('figcaption');figure.append(image,credit);
 dialog.querySelector('.intro').before(figure);
 const status=document.createElement('p');status.className='photo-status';status.hidden=true;figure.after(status);
 let catalogPromise,epoch=0;
 async function show(name){
  const request=++epoch;figure.hidden=true;status.hidden=false;status.textContent='正在读取景点照片…';
  try{
   catalogPromise??=fetch('/data/scene-photos.json').then(r=>{if(!r.ok)throw Error('catalog');return r.json();});
   const catalog=await catalogPromise;if(request!==epoch)return;
   const record=catalog[name];if(!record){status.textContent='这处景点暂未收录已核对许可的照片。';return;}
   image.alt=record.alt;image.src=record.src;
   await image.decode();if(request!==epoch)return;
   credit.replaceChildren(document.createTextNode(`${record.caption} · ${record.author} · ${record.license} · ${record.change} `));
   for(const [label,url]of [['图片来源',record.source],['许可条款',record.licenseUrl]]){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=label;credit.append(a);}
   figure.hidden=false;status.hidden=true;
  }catch{if(request!==epoch)return;status.textContent='照片暂时无法加载，可先阅读景点介绍。';}
 }
 dialog.addEventListener('close',()=>{epoch++;image.removeAttribute('src');});
 return{show};
}
