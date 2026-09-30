import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import fs from 'node:fs/promises';
const chenghaiOnly=process.argv.includes('--chenghai');
const chaoyangOnly=process.argv.includes('--chaoyang');
const chaonanOnly=process.argv.includes('--chaonan');
const puningOnly=process.argv.includes('--puning');
const out=new URL(puningOnly?'../RECON/puning-qa/':chaonanOnly?'../RECON/chaonan-qa/':chaoyangOnly?'../RECON/chaoyang-qa/':chenghaiOnly?'../RECON/chenghai-qa/':'../RECON/exhibit-qa/',import.meta.url);await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
page.setDefaultTimeout(120000);
page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:5242/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.chaoshanAtlas?.getState().ready,{},{timeout:180000});
  const stats=await page.evaluate(()=>window.chaoshanAtlas.getState());console.log(JSON.stringify({counts:[stats.huilai.people,stats.raoping.people,stats.chaoan.people,stats.chenghai.people,stats.chaoyang.people,stats.chaonan.people,stats.puning.people]}));
  if(chaoyangOnly||chaonanOnly||puningOnly){
    await page.getByRole('button',{name:puningOnly?'普宁景点':chaonanOnly?'潮南景点':'潮阳景点',exact:true}).click();const visible=await page.locator('#places button:visible').count();if(visible!==20)throw new Error('Chaoyang navigation count: '+visible);
    const placement=await page.evaluate(kind=>{
      const ps=window.chaoshanAtlas.getState()[kind].coverage,overlaps=[];
      for(let i=0;i<ps.length;i++){if(!Number.isFinite(ps[i].x)||!Number.isFinite(ps[i].z))throw new Error('Nonfinite scene position');for(let j=0;j<i;j++)if(Math.abs(ps[i].x-ps[j].x)<(ps[i].width+ps[j].width)/2&&Math.abs(ps[i].z-ps[j].z)<(ps[i].depth+ps[j].depth)/2)overlaps.push([ps[i].id,ps[j].id]);}
      return {overlaps,positions:ps.map(p=>({id:p.id,x:p.x,z:p.z,offset:p.offset}))};
    },puningOnly?'puning':chaonanOnly?'chaonan':'chaoyang');await fs.writeFile(new URL('placement.json',out),JSON.stringify(placement,null,2));if(placement.overlaps.length)throw new Error('Overlapping Chaoyang scenes');
  }
  if(chenghaiOnly){await page.getByRole('button',{name:'澄海景点',exact:true}).click();const visible=await page.locator('#places button:visible').count();if(visible!==20)throw new Error('Chenghai navigation count: '+visible);}
  for(const [kind,start,count] of (puningOnly?[['puning',228,20]]:chaonanOnly?[['chaonan',208,20]]:chaoyangOnly?[['chaoyang',188,20]]:chenghaiOnly?[['chenghai',168,20]]:[['huilai',112,16],['raoping',128,20],['chaoan',148,20]])){
    const sheet=new PNG({width:1280,height:Math.ceil(count/4)*200});
    for(let i=0;i<count;i++){
      await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),start+i);await page.waitForTimeout(2800);
      if(puningOnly){const overlap=await page.evaluate(()=>{const a=document.querySelector('.map-controls').getBoundingClientRect(),b=document.getElementById('location-card').getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;});if(overlap)throw new Error('Puning controls overlap card at '+i);}
      const buffer=await page.screenshot({timeout:120000}),png=PNG.sync.read(buffer);
      for(let y=0;y<200;y++)for(let x=0;x<320;x++){const src=(Math.floor(y*png.height/200)*png.width+Math.floor(x*png.width/320))*4,dst=((Math.floor(i/4)*200+y)*1280+i%4*320+x)*4;png.data.copy(sheet.data,dst,src,src+4);}
      if(puningOnly||[0,1,2,3,11,12,13,15,16,17,19].includes(i))await fs.writeFile(new URL(`${kind}-${i}.png`,out),buffer);
    }
    await fs.writeFile(new URL(`${kind}-sheet.png`,out),PNG.sync.write(sheet));console.log(kind+' captured');
  }
  await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),puningOnly?239:chaonanOnly?224:chaoyangOnly?200:chenghaiOnly?187:131);await page.waitForTimeout(2800);
  const pixels=await page.evaluate(async()=>{
    const canvas=document.querySelector('canvas'),c=document.createElement('canvas');c.width=160;c.height=100;const ctx=c.getContext('2d');
    const sample=()=>new Promise(resolve=>requestAnimationFrame(()=>{ctx.drawImage(canvas,0,0,160,100);resolve(Array.from(ctx.getImageData(0,0,160,100).data));}));
    const a=await sample();await new Promise(r=>setTimeout(r,1400));const b=await sample();let changed=0;const colors=new Set();for(let i=0;i<b.length;i+=4){colors.add(b.slice(i,i+3).join(','));if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>20)changed++;}return {changed,colors:colors.size};
  });
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(2800);await fs.writeFile(new URL(puningOnly?'mobile-yingge.png':chaonanOnly?'mobile-lianjiang.png':chaoyangOnly?'mobile-estuary.png':chenghaiOnly?'mobile-redboat.png':'mobile-raoping.png',out),await page.screenshot());
  await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),puningOnly?247:chaonanOnly?210:chaoyangOnly?189:chenghaiOnly?181:150);await page.waitForTimeout(2800);await fs.writeFile(new URL(puningOnly?'mobile-peifeng.png':chaonanOnly?'mobile-cuihu.png':chaoyangOnly?'mobile-wenguang.png':chenghaiOnly?'mobile-baoao.png':'mobile-chaoan.png',out),await page.screenshot());
  const mobile=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,selected:window.chaoshanAtlas.getState().selected,canvas:[document.querySelector('canvas').width,document.querySelector('canvas').height]}));
  if(puningOnly){
    for(const [width,height,label] of [[900,700,'tablet-bayi'],[390,844,'mobile-bayi']]){
      await page.setViewportSize({width,height});await page.evaluate(()=>window.chaoshanAtlas.focusPlace(238));await page.waitForTimeout(2800);
      const checks=await page.evaluate(()=>{const c=document.getElementById('location-card'),a=c.getBoundingClientRect(),b=document.querySelector('.map-controls').getBoundingClientRect(),t=document.getElementById('location-en');return {overlap:a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top,overflow:document.documentElement.scrollWidth>innerWidth||t.scrollWidth>t.clientWidth+1};});
      if(checks.overlap||checks.overflow)throw new Error(label+' layout failure: '+JSON.stringify(checks));await fs.writeFile(new URL(label+'.png',out),await page.screenshot());
    }
  }
  console.log(JSON.stringify({pixels,mobile,errors}));await fs.writeFile(new URL('results.json',out),JSON.stringify({pixels,mobile,errors},null,2));
  if(errors.length||mobile.overflow||pixels.colors<100||pixels.changed<1)throw new Error('Exhibit browser verification failed');
}finally{await browser.close();}
