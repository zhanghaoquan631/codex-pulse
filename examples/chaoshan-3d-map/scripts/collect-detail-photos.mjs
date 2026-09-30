import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Explicit article identities only; never substitute the first fuzzy search result.
const titles=['汕头市','潮州市','揭阳市','普宁市','南澳县','潮阳区','潮南区','澄海区','潮安区','饶平县','惠来县','揭西县','广济桥','揭阳楼','小公园开埠区','中山纪念亭','汕头老妈宫','汕头邮政总局大楼','汕头开埠文化陈列馆','西堤公园','中山公园 (汕头)','礐石风景名胜区','礐石大桥','妈屿岛','陈慈黉故居','南澳大桥','青澳湾','北回归线标志塔 (南澳)','南澳总兵府','宋井','黄花山','石碑山灯塔','靖海古城','道韵楼','汤溪水库','海山岛','黄冈河','凤凰山 (潮州)','龙湖古寨','象埔寨','桑浦山','韩江','文光塔','灵山寺 (汕头)','潮阳学宫','德安里','普宁学宫','培风塔','进贤门','揭阳学宫','揭阳城隍庙','双峰寺','黄岐山','榕江','揭阳潮汕国际机场','汕头站','潮汕站','普宁站','牛肉丸','蚝烙','红桃粿','鸭母捻','腐乳饼','工夫茶','乒乓粿','普宁豆干','面线','粿汁','鱼饭','潮汕砂锅粥','肠粉','卤鹅','擂茶','酿豆腐'];
const root=new URL('../',import.meta.url),out=new URL('public/data/detail-photos.json',root);
const proxy=process.env.ATLAS_PHOTO_PROXY;
function get(url,binary=false){return execFileSync('curl.exe',[...(proxy?['--proxy',proxy]:[]),'--fail','--location','--max-time','25','--retry','1','--silent','--show-error',url],{encoding:binary?undefined:'utf8',maxBuffer:12*1024*1024,windowsHide:true});}
function api(host,params){return JSON.parse(get(`https://${host}/w/api.php?${new URLSearchParams({action:'query',format:'json',...params})}`));}
const plain=s=>(s||'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').trim();
const catalog={},reports=[];
await fs.mkdir(new URL('public/photos/',root),{recursive:true});
for(let start=0;start<titles.length;start+=8){
 const batch=titles.slice(start,start+8);
 try{
  const result=api('zh.wikipedia.org',{titles:batch.join('|'),redirects:'1',prop:'pageimages',piprop:'name',pilicense:'free'});
  const redirects=new Map([...(result.query.normalized||[]),...(result.query.redirects||[])].map(p=>[p.from,p.to]));
  for(const input of batch){
   let canonical=input;for(let i=0;i<5&&redirects.has(canonical);i++)canonical=redirects.get(canonical);
   const page=Object.values(result.query.pages).find(p=>p.title===canonical);
   if(!page?.pageimage){reports.push({name:input,status:'no-free-photo'});continue;}
   try{
    const info=api('commons.wikimedia.org',{titles:'File:'+page.pageimage,prop:'imageinfo',iiprop:'url|extmetadata|mime',iiurlwidth:'1280'});
    const file=Object.values(info.query.pages)[0]?.imageinfo?.[0],m=file?.extmetadata;
    if(!file||!/^image\/(jpeg|png|webp)$/.test(file.mime)||!/CC BY|CC0|Public domain/i.test(m?.LicenseShortName?.value||'')){reports.push({name:input,status:'license-or-format',file:page.pageimage});continue;}
    const extension=file.mime==='image/jpeg'?'jpg':file.mime.split('/')[1];
    const path=`photos/${createHash('sha256').update(page.pageimage).digest('hex').slice(0,16)}.${extension}`;
    const remote=(file.thumburl||file.url).split('?')[0];
    await fs.writeFile(new URL('public/'+path,root),get(remote,true));
    catalog[input]={title:input,article:`https://zh.wikipedia.org/wiki/${encodeURIComponent(canonical)}`,photos:[{src:'/'+path,caption:input,author:plain(m.Artist?.value),license:plain(m.LicenseShortName?.value),licenseUrl:m.LicenseUrl?.value||'',source:file.descriptionurl,description:plain(m.ImageDescription?.value),file:page.pageimage,change:'缩放预览，未裁剪'}]};
    reports.push({name:input,status:'saved',file:page.pageimage,description:plain(m.ImageDescription?.value)});console.log('PHOTO '+input+' | '+page.pageimage);
   }catch(e){reports.push({name:input,status:'error',error:e.message.slice(0,150)});}
  }
 }catch(e){reports.push({names:batch,status:'error',error:e.message.slice(0,150)});}
 await fs.writeFile(out,JSON.stringify(catalog,null,2));
}
await fs.mkdir(new URL('RECON/detail-photos/',root),{recursive:true});
await fs.writeFile(new URL('RECON/detail-photos/sources.json',root),JSON.stringify(reports,null,2));
console.log(JSON.stringify({photos:Object.keys(catalog).length,requested:titles.length}));
