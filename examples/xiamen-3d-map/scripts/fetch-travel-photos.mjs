import fs from 'node:fs/promises';
const selected={
  huangrongyuan:'File:鼓浪屿黄荣远堂.jpg',
  'union-chapel':'File:Union Church, Gulangyu.jpg',
  'sunlight-temple':'File:05656-Xiamen (32680752750).jpg',
  trinity:'File:Trinity Church, Kulangsu, 2019-09-26 01.jpg',
  catholic:'File:Catholic Church, Gulangyu.jpg',
  neicuo:'File:鼓浪屿内厝澳码头 2.jpg',
  dongdu:'File:Xiamen International Cruise Terminal - DSCF9296.JPG',
  sunlight:'File:Sunlight Rock (20170120131114).jpg',
  shuzhuang:'File:Shuzhuang Garden, 2019-09-26 23.jpg',
  piano:'File:Gu Lang Yu Piano Museum 20161231.jpg',
  haoyue:'File:Haoyue Park, Xiamen, China.JPG',
  bagua:'File:Bagua Mansion, Kulangsu, 2019-09-26 19.jpg',
  haitiantang:'File:Hai Tian Tang Gou Mansion, 2019-09-26 36.jpg',
  yuyuan:'File:厦门鼓浪屿，毓园 - panoramio.jpg',
  beach:'File:港仔后海滩 2.jpg',
  longtou:'File:Longtou Rd in Kulangsu (20170120161108).jpg',
  zhenbang:'File:镇邦路001.jpg',
  xinjie:'File:Xinjie Christian Church in Xiamen 2013-06.JPG',
  sanqiutian:'File:Sanqiutian Ferry Terminal Arrivals 20230827.jpg',
  lundu:'File:厦门轮渡码头.jpg',
  diyi:'File:厦门第一客运码头 - panoramio.jpg',
  lujiang:'File:鷺江道 Lujiang Road - panoramio.jpg'
};
await fs.mkdir('public/photos/travel',{recursive:true});
const result=JSON.parse(await fs.readFile('public/data/travel-photos.json','utf8').catch(()=>'{}'));
const text=html=>(html||'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').trim();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(url){
 for(let attempt=0;attempt<4;attempt++){
  const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
  if(response.ok)return response;
  if(![429,502,503,504].includes(response.status))throw new Error('Photo HTTP '+response.status);
  await pause(Math.min(60000,Math.max(Number(response.headers.get('retry-after'))*1000||0,5000*2**attempt)));
 }
 throw new Error('Photo provider temporarily unavailable');
}
const url=new URL('https://commons.wikimedia.org/w/api.php');url.search=new URLSearchParams({action:'query',format:'json',titles:Object.values(selected).join('|'),prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'960'});
const metadata=await (await request(url)).json();
const pages=Object.values(metadata.query.pages);
for(const [id,title] of Object.entries(selected)){
 const info=pages.find(p=>p.title===title)?.imageinfo?.[0];if(!info){console.log(id,'no verified photo');continue;}
 const m=info.extmetadata,license=text(m.LicenseShortName?.value);if(!/^CC BY|^CC0|Public domain/.test(license))throw new Error('Unverified license: '+license);
 if(!await fs.stat(`public/photos/travel/${id}.jpg`).catch(()=>false)){
  await pause(1500);
  const file=await request(info.thumburl||info.url);
  await fs.writeFile(`public/photos/travel/${id}.jpg`,Buffer.from(await file.arrayBuffer()));
 }
 result[id]={src:`/photos/travel/${id}.jpg`,alt:text(m.ImageDescription?.value),author:text(m.Artist?.value),license,licenseUrl:m.LicenseUrl?.value||'',source:info.descriptionurl,captured:text(m.DateTimeOriginal?.value),change:'Commons 缩略图；未作内容修改'};
 console.log(id,license);
 await fs.writeFile('public/data/travel-photos.json',JSON.stringify(result,null,2));
}
const old=JSON.parse(await fs.readFile('public/data/scene-photos.json','utf8'));
result.zhongshan=old['中山路'];
await fs.writeFile('public/data/travel-photos.json',JSON.stringify(result,null,2));
