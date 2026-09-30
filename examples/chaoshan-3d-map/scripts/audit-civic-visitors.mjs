import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='RECON/civic-visitors';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[],results=[];
try{
 const page=await browser.newPage({viewport:{width:1200,height:900}});page.on('pageerror',e=>errors.push(e.message));
 for(const theme of ['tea','bus','clinic','market']){
  await page.goto('http://127.0.0.1:5242/scripts/civic-fixture.html?theme='+theme);await page.waitForFunction(()=>window.civicAudit?.ready);
  assert.ok(await page.evaluate(()=>window.civicAudit.framed()));
  const first=await page.evaluate(()=>window.civicAudit.tick(2.75));
  const a=PNG.sync.read(await page.screenshot({path:out+'/'+theme+'.png'}));
  const second=await page.evaluate(()=>window.civicAudit.tick(18));
  const b=PNG.sync.read(await page.screenshot({path:out+'/'+theme+'-later.png'}));
  let changed=0;for(let i=0;i<a.data.length;i+=4)if(Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+Math.abs(a.data[i+2]-b.data[i+2])>20)changed++;
  assert.ok(changed>10,theme+' must visibly animate');assert.notDeepEqual(first.limbs,second.limbs);
  if(theme!=='market'){assert.deepEqual(first.position,second.position);assert.equal(first.state,'sit');assert.equal(first.limbs[0][0],-Math.PI/2);}
  else assert.notDeepEqual(first.position,second.position);
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>window.civicAudit.framed()));
  const mobile=PNG.sync.read(await page.screenshot({path:out+'/'+theme+'-mobile.png'})),colors=new Set();for(let i=0;i<mobile.data.length;i+=4)colors.add(mobile.data.subarray(i,i+3).toString('hex'));assert.ok(colors.size>500);
  results.push({theme,changedPixels:changed,mobileColors:colors.size});await page.setViewportSize({width:1200,height:900});
 }
 assert.deepEqual(errors,[]);await fs.writeFile(out+'/results.json',JSON.stringify({pass:true,results,errors},null,2));console.log(JSON.stringify({pass:true,results,errors}));
}finally{await browser.close();}
