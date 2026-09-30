import {chromium} from 'playwright';
import fs from 'node:fs/promises';

const linearBaseline=process.argv.includes('--linear');
const out=linearBaseline?'RECON/startup-profile-linear':'RECON/startup-profile-indexed';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 if(linearBaseline){
  await page.route('**/water-query.mjs*',route=>route.fulfill({contentType:'text/javascript',body:`
   function inside(x,z,ring){let ok=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])ok=!ok;}return ok;}
   export function prepareWaterContains(rings){return (x,z)=>inside(x,z,rings[0])&&!rings.slice(1).some(r=>inside(x,z,r));}
  `}));
  await page.route('**/regional-environment.mjs*',async route=>{
   const response=await route.fetch(),body=await response.text();
   if(!body.includes('bankReserved(...v)'))throw new Error('Riverbank benchmark target changed');
   await route.fulfill({response,body:body.replace('bankReserved(...v)','reservedSites.some(s=>Math.hypot(v[0]-s.x,v[1]-s.z)<s.span+.02)')});
  });
 }
 const client=await page.context().newCDPSession(page);
 await client.send('Profiler.enable');
 await client.send('Profiler.setSamplingInterval',{interval:1000});
 await client.send('Profiler.start');
 const start=Date.now();
 await page.goto('http://127.0.0.1:5242/');
 await page.waitForFunction(()=>window.chaoshanAtlas?.getState().ready,null,{timeout:240000});
 const elapsedMs=Date.now()-start,{profile}=await client.send('Profiler.stop');
 const nodes=new Map(profile.nodes.map(n=>[n.id,n])),parents=new Map(),rows=new Map();
 for(const n of profile.nodes)for(const id of n.children||[])parents.set(id,n.id);
 for(let i=0;i<(profile.samples||[]).length;i++){
  const ms=profile.timeDeltas[i]/1000;let id=profile.samples[i],first=true;
  const visited=new Set();
  while(nodes.has(id)){
   const frame=nodes.get(id).callFrame,key=[frame.url,frame.lineNumber,frame.functionName].join(':');
   if(!rows.has(key))rows.set(key,{name:frame.functionName||'(anonymous)',url:frame.url,line:frame.lineNumber+1,selfMs:0,totalMs:0});
   const row=rows.get(key);if(first)row.selfMs+=ms;if(!visited.has(key))row.totalMs+=ms;visited.add(key);
   first=false;id=parents.get(id);
  }
 }
 const hotspots=[...rows.values()].sort((a,b)=>b.selfMs-a.selfMs);
 const state=await page.evaluate(()=>window.chaoshanAtlas.getState());
 const report={at:new Date().toISOString(),linearBaseline,elapsedMs,startup:state.startup,render:state.render,life:state.life,environment:state.environment,tourContext:state.tourContext,backlotHomes:state.tourContext.backlotHomes,hotspots,errors};
 await fs.writeFile(out+'/startup.cpuprofile',JSON.stringify(profile));
 await fs.writeFile(out+'/results.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({out,elapsedMs,startup:state.startup,environment:state.environment,backlotHomes:state.tourContext.backlotHomes,hotspots:hotspots.slice(0,12),errors},null,2));
}finally{await browser.close();}
