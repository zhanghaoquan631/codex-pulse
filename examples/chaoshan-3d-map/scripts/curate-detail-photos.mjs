import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),path=new URL('public/data/detail-photos.json',root);
const catalog=JSON.parse(await fs.readFile(path,'utf8'));
// Reject different regional preparations instead of implying they are local examples.
for(const key of ['蚝烙','面线','肠粉','擂茶'])delete catalog[key];
const captions={
 '潮州市':'潮州 · 牌坊街','揭阳市':'揭阳 · 揭阳学宫大成门','普宁市':'普宁 · 铁山兰城徽雕塑','南澳县':'南澳县 · 南澳大桥',
 '潮阳区':'潮阳 · 文光塔（2009年）','潮南区':'潮南 · 下山虎传统民居','澄海区':'澄海 · 陈慈黉故居',
 '潮安区':'潮安人民公园牌坊','饶平县':'饶平 · 新圩镇豪光古庙','惠来县':'惠来 · 奎光阁',
 '妈屿岛':'妈屿岛 · 历史影像，非当代街景','红桃粿':'红桃粿 · 马来西亚潮州风味实拍',
 '酿豆腐':'客家酿豆腐 · 惠州做法参考，非揭西店铺','双峰寺':'揭阳双峰寺 · 匾额细节'
};
for(const [key,caption] of Object.entries(captions))if(catalog[key])catalog[key].photos[0].caption=caption;
const extra=[
 ['广济桥','Guangji Bridge.JPG','广济桥 · 韩江与桥亭（2008年）'],
 ['蚝烙','Oyster omelette 蚝烙.jpg','潮汕蚝烙'],
 ['普宁豆干','普宁豆干.png','普宁豆干'],
 ['鸭母捻','鸭母捻.jpg','潮州 · 胡荣泉鸭母捻'],
 ['卤鹅','潮汕非遗卤鹅.jpg','潮汕卤鹅'],
 ['肠粉','Chaoshan rice noodle roll.jpg','潮汕肠粉'],
 ['潮汕砂锅粥','Chiu Chow oyster congee.jpg','潮州鲜蚝粥 · 海鲜粥做法示例'],
 ['进贤门','进贤门-3.jpg','揭阳 · 进贤门城楼'],
 ['德安里',"Puning Hongyang De'anli 2014.01.19 13-32-16.jpg",'普宁 · 德安里'],
 ['德安里',"Puning Hongyang De'anli 2014.01.19 14-17-55.jpg",'德安里 · 石桥与建筑细节'],
 ['文光塔','Chaoyang wenguangta 2009.jpg','潮阳 · 文光塔（2009年）']
].filter((v,i,a)=>a.findIndex(x=>x[1]===v[1])===i);
const plain=s=>(s||'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').trim();
const get=(url,binary=false)=>execFileSync('curl.exe',[...(process.env.ATLAS_PHOTO_PROXY?['--proxy',process.env.ATLAS_PHOTO_PROXY]:[]),'--fail','--location','--max-time','25','--silent','--show-error',url],{encoding:binary?undefined:'utf8',maxBuffer:12*1024*1024,windowsHide:true});
await fs.writeFile(path,JSON.stringify(catalog,null,2));
const url='https://commons.wikimedia.org/w/api.php?'+new URLSearchParams({action:'query',format:'json',titles:extra.map(v=>'File:'+v[1]).join('|'),prop:'imageinfo',iiprop:'url|extmetadata|mime',iiurlwidth:'1280'});
try{
 const result=JSON.parse(get(url));
 for(const [key,file,caption] of extra){
  try{
   const p=Object.values(result.query.pages).find(p=>p.title.replaceAll('_',' ')===('File:'+file).replaceAll('_',' ')),info=p?.imageinfo?.[0],m=info?.extmetadata;
   if(!info||!/CC BY|CC0|Public domain/i.test(m?.LicenseShortName?.value||'')||!/^image\/(jpeg|png|webp)$/.test(info.mime))continue;
   const local='photos/'+createHash('sha256').update(file).digest('hex').slice(0,16)+(info.mime==='image/png'?'.png':'.jpg');
   await fs.writeFile(new URL('public/'+local,root),get((info.thumburl||info.url).split('?')[0],true));
   catalog[key]||={title:key,article:'https://zh.wikipedia.org/wiki/'+encodeURIComponent(key),photos:[]};
   catalog[key].photos=catalog[key].photos.filter(photo=>photo.file!==file);
   catalog[key].photos.push({src:'/'+local,caption,author:plain(m.Artist?.value),license:plain(m.LicenseShortName?.value),licenseUrl:m.LicenseUrl?.value||'',source:info.descriptionurl,file,change:'缩放预览，未裁剪'});
   console.log('CURATED '+key+' | '+file);
  }catch(e){console.log('UNAVAILABLE '+key+' '+e.message.slice(0,100));}
  await new Promise(r=>setTimeout(r,1500));
 }
}finally{
 await fs.writeFile(path,JSON.stringify(catalog,null,2));
 const credits=Object.values(catalog).flatMap(entry=>entry.photos.map(p=>`${p.src}\n${p.caption}\n${p.author}\n${p.license} ${p.licenseUrl}\n${p.source}\n${p.change}\n`));
 await fs.writeFile(new URL('public/photos/CREDITS.txt',root),credits.join('\n')+'\nsmall-park-user.jpg: User-provided original. No public reuse license granted.\n');
 console.log('CATALOG '+Object.keys(catalog).length);
}
