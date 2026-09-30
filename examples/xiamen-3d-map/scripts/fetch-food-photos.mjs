import fs from 'node:fs/promises';

const selected={
  shacha:'File:Mr Lin seafood shachamian.jpg',
  tusun:'File:Tusundong Xiamen.jpg',
  oyster:"File:A oyster omelette stall in Zeng Cuo'an.jpg",
  peanut:'File:Huang Zehe peanut soup.jpg',
  'peanut-reference':'File:Peanut soup.jpg',
  'oyster-reference':'File:Oyster omelette.jpg'
};
const text=html=>(html||'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').trim();
async function request(url){
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
      if(response.ok)return response;
      if(![429,502,503,504].includes(response.status))throw new Error('Photo HTTP '+response.status);
    }catch(error){if(attempt===2)throw error;}
    await new Promise(resolve=>setTimeout(resolve,3000*2**attempt));
  }
  throw new Error('Photo service unavailable');
}
await fs.mkdir('public/photos/food',{recursive:true});
const url=new URL('https://commons.wikimedia.org/w/api.php');
url.search=new URLSearchParams({action:'query',format:'json',titles:Object.values(selected).join('|'),prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'960'});
const pages=Object.values((await (await request(url)).json()).query.pages),result={};
for(const [id,title] of Object.entries(selected)){
  const info=pages.find(p=>p.title===title)?.imageinfo?.[0];
  if(!info)throw new Error('Photo missing: '+id);
  const m=info.extmetadata,license=text(m.LicenseShortName?.value);
  if(!/^CC BY|^CC0|Public domain/.test(license))throw new Error('Unverified license: '+id);
  const response=await request(info.thumburl||info.url);
  if(!response.headers.get('content-type')?.startsWith('image/'))throw new Error('Invalid image: '+id);
  await fs.writeFile(`public/photos/food/${id}.jpg`,Buffer.from(await response.arrayBuffer()));
  result[id]={src:`/photos/food/${id}.jpg`,author:text(m.Artist?.value),license,licenseUrl:m.LicenseUrl?.value||'',source:info.descriptionurl,captured:text(m.DateTimeOriginal?.value),change:'Commons 缩略图；未作内容修改'};
  console.log(id,license);
}
await fs.writeFile('public/data/food-photos.json',JSON.stringify(result,null,2));
