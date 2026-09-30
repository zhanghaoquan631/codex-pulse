import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='RECON/frame-profile';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[],reports=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/app.js*',async route=>{
  const response=await route.fetch(),body=await response.text(),start=body.indexOf('function animate(now){'),end=body.indexOf('const startup={};',start);assert.ok(start>=0&&end>start);
  let frame=body.slice(start,end);
  for(const name of ['traffic','transport','cuisine','communityActivities','tourContext','nanaoSights','shantouSights','jiexiSights','huilaiSights','raopingSights','chaoanSights','chenghaiSights','chaoyangSights','chaonanSights','puningSights','jieyangSights','streetLife','regionalLife','livingSky','communitySocial']){
   const call=`${name}?.update(lifeSeconds)`;assert.ok(frame.includes(call));frame=frame.replace(call,`frameProbe('${name}',()=>${call})`);
  }
  for(const [name,call] of [['labels','updateLabels()'],['render','renderer.render(scene,camera)'],['regionalEnvironment','regionalEnvironment?.update(lifeSeconds,camera.zoom)'],['exhibitCulling','exhibitVisibility?.update(camera)'],['landmarks','localLandmarks?.update(now,reducedMotion)']]){
   assert.ok(frame.includes(call));frame=frame.replace(call,`frameProbe('${name}',()=>${call})`);
  }
  const probe=`const frameSamples={};function frameProbe(name,fn){const start=performance.now();try{return fn();}finally{(frameSamples[name]??=[]).push(performance.now()-start);}}
window.frameProbe={graph(){return scene.children.map(root=>{let nodes=0,meshes=0,visible=0;root.traverse(o=>{nodes++;if(o.isMesh)meshes++;});root.traverseVisible(()=>visible++);return {name:root.name||root.type,nodes,meshes,visible};}).sort((a,b)=>b.nodes-a.nodes);},reset(){for(const key of Object.keys(frameSamples))frameSamples[key]=[];},read(){return Object.entries(frameSamples).map(([name,a])=>{a.sort((x,y)=>x-y);return {name,count:a.length,mean:a.reduce((sum,n)=>sum+n,0)/a.length,p95:a[Math.floor(a.length*.95)]};}).sort((a,b)=>b.mean-a.mean);}};
`;
  await route.fulfill({response,body:body.slice(0,start)+probe+frame+body.slice(end)});
 });
 const started=Date.now();await page.goto('http://127.0.0.1:5242/');await page.waitForFunction(()=>window.chaoshanAtlas?.getState().ready,null,{timeout:240000});await page.locator('#loading').waitFor({state:'hidden'});
 const loadMs=Date.now()-started,initial=await page.evaluate(()=>window.chaoshanAtlas.getState());console.log(JSON.stringify({loadMs,startup:initial.startup}));
 await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),initial.places.find(p=>p.id==='nanao-nature-gate').index);await page.waitForTimeout(2500);
 const graph=await page.evaluate(()=>window.frameProbe.graph());await fs.writeFile(`${out}/scene-graph.json`,JSON.stringify(graph,null,2));
 if(process.argv.includes('--graph-only')){await browser.close();process.exit(0);}
 const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});
 for(const id of ['nanao-nature-gate','普宁市']){
  await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),initial.places.find(p=>p.id===id||p.name===id).index);await page.waitForTimeout(3000);
  await page.evaluate(()=>window.frameProbe.reset());if(!process.argv.includes('--timings-only'))await cdp.send('Profiler.start');
  const frames=await page.evaluate(()=>new Promise(resolve=>{let count=0,start=performance.now();const tick=now=>{count++;if(now-start<7000)requestAnimationFrame(tick);else resolve({fps:count/((now-start)/1000),count});};requestAnimationFrame(tick);}));
  const {profile}=process.argv.includes('--timings-only')?{profile:{nodes:[],samples:[]}}:await cdp.send('Profiler.stop'),rows=await page.evaluate(()=>window.frameProbe.read()),samples=new Map(),nodes=new Map(profile.nodes.map(n=>[n.id,n]));
  profile.samples.forEach((id,i)=>{const n=nodes.get(id),key=[n.callFrame.functionName,n.callFrame.url.split('/').pop(),n.callFrame.lineNumber+1].join(' ');samples.set(key,(samples.get(key)||0)+(profile.timeDeltas[i]||0));});
  const report={id,frames,rows,render:(await page.evaluate(()=>window.chaoshanAtlas.getState())).render,topCPU:[...samples].map(([name,us])=>({name,ms:us/1000})).sort((a,b)=>b.ms-a.ms).slice(0,30)};
  reports.push(report);await fs.writeFile(`${out}/${id}.cpuprofile`,JSON.stringify(profile));console.log(JSON.stringify(report,null,2));
 }
 assert.deepEqual(errors,[]);await fs.writeFile(`${out}/results.json`,JSON.stringify({loadMs,reports,errors},null,2));
}finally{await browser.close();}
