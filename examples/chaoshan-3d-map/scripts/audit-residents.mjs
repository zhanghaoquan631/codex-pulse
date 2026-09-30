import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='RECON/residents';await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5242/scripts/resident-fixture.html');await page.waitForFunction(()=>window.residentAudit?.ready);
 assert.equal(await page.evaluate(()=>window.residentAudit.framed()),true);
 const first=PNG.sync.read(await page.screenshot({path:out+'/outfits.png'}));
 await page.evaluate(()=>window.residentAudit.tick(1.7));const second=PNG.sync.read(await page.screenshot({path:out+'/gestures.png'}));
 let changed=0;for(let i=0;i<first.data.length;i+=4)if(Math.abs(first.data[i]-second.data[i])+Math.abs(first.data[i+1]-second.data[i+1])>20)changed++;assert.ok(changed>500);
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>window.residentAudit.framed());
 const mobile=PNG.sync.read(await page.screenshot({path:out+'/mobile.png'})),colors=new Set();for(let i=0;i<mobile.data.length;i+=4)colors.add(mobile.data.subarray(i,i+3).toString('hex'));assert.ok(colors.size>500);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({pass:true,changed,mobileColors:colors.size,errors}));
}finally{await browser.close();}
