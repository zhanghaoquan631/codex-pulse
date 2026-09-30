import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {detailKey} from '../detail-content.mjs';
const root=new URL('../',import.meta.url),path=new URL('public/data/detail-photos.json',root);
const catalog=JSON.parse(await fs.readFile(path,'utf8')),names=new Set(Object.keys(catalog));
for(const file of ['shantou','nanao','jiexi','huilai','raoping','chaoan','chenghai','chaoyang','chaonan','puning','jieyang']){
 try{const module=await import(`../${file}-places.mjs`);for(const value of Object.values(module))if(Array.isArray(value))for(const p of value)if(p?.name)names.add(detailKey(p));}catch{}
}
const titles=[...names].filter(n=>!/[·与]|一带|元素/.test(n));
for(let start=0;start<titles.length;start+=12){
 const batch=titles.slice(start,start+12);
 try{
  const url='https://zh.wikipedia.org/w/api.php?'+new URLSearchParams({action:'query',format:'json',titles:batch.join('|'),redirects:'1',prop:'extracts|pageprops',exintro:'1',explaintext:'1',exchars:'260',exlimit:'max'});
  const result=JSON.parse(execFileSync('curl.exe',[...(process.env.ATLAS_PHOTO_PROXY?['--proxy',process.env.ATLAS_PHOTO_PROXY]:[]),'--fail','--max-time','25','--silent','--show-error',url],{encoding:'utf8',maxBuffer:3000000,windowsHide:true}));
  const redirects=new Map([...(result.query.normalized||[]),...(result.query.redirects||[])].map(p=>[p.from,p.to]));
  for(const name of batch){
   let title=name;for(let i=0;i<5&&redirects.has(title);i++)title=redirects.get(title);
   const page=Object.values(result.query.pages).find(p=>p.title===title),text=page?.extract?.replace(/\s+/g,' ').trim();
   if(!text||page.pageprops?.disambiguation!==undefined||(!catalog[name]&&!/潮州|汕头|汕頭|揭阳|揭陽|普宁|普寧|南澳|饶平|饒平|惠来|惠來|揭西|潮汕/.test(text)))continue;
   // Keep a short attributed excerpt, ending at a sentence when available.
   const excerpt=text.slice(0,220),last=excerpt.lastIndexOf('。');
   catalog[name]||={title:name,photos:[]};catalog[name].intro=last>35?excerpt.slice(0,last+1):excerpt+'…';
   catalog[name].article='https://zh.wikipedia.org/wiki/'+encodeURIComponent(title);console.log('TEXT '+name);
  }
 }catch(e){console.log('TEXT UNAVAILABLE '+batch[0]+' '+e.message.slice(0,100));}
 await new Promise(r=>setTimeout(r,2000));
}
for(const name of ['小公园开埠区','中山纪念亭'])catalog[name]={title:name,photos:[],intro:'小公园以中山纪念亭为中心，街道呈放射状展开，周围分布着连续骑楼。纪念亭始建于1934年；如今的建筑延续了传统木结构与重檐轮廓。夜间灯光勾勒屋檐，周边街巷则保留了汕头开埠时期的商业街区记忆。',article:'https://www.shantou.gov.cn/hqsyq/hqxx/content/post_2199904.html',introCredit:'汕头市政府资料整理'};
await fs.writeFile(path,JSON.stringify(catalog,null,2));console.log('ENTRIES '+Object.keys(catalog).length);
