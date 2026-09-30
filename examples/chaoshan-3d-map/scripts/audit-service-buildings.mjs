import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const street=process.argv.includes('--street'),civic=process.argv.includes('--civic'),homes=process.argv.includes('--homes'),out=homes?'RECON/coastal-homes':street?'RECON/street-services':civic?'RECON/civic-services':'RECON/services';await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));const samples=[];
 for(const variant of civic?[0,1,2,3]:[0,1]){await page.goto('http://127.0.0.1:5242/scripts/service-fixture.html?variant='+variant+(homes?'&collection=homes':street?'&collection=street':civic?'&collection=civic':''));await page.waitForFunction(()=>window.serviceAudit?.ready);assert.equal(await page.evaluate(()=>window.serviceAudit.framed()),true);samples.push(PNG.sync.read(await page.screenshot({path:out+'/layout-'+variant+'.png'})));}
 let changed=0;for(let i=0;i<samples[0].data.length;i+=4)if(Math.abs(samples[0].data[i]-samples[1].data[i])+Math.abs(samples[0].data[i+1]-samples[1].data[i+1])>30)changed++;assert.ok(changed>10000);
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>window.serviceAudit.framed());const mobile=PNG.sync.read(await page.screenshot({path:out+'/mobile.png'})),colors=new Set();for(let i=0;i<mobile.data.length;i+=4)colors.add(mobile.data.subarray(i,i+3).toString('hex'));assert.ok(colors.size>500);assert.equal(errors.length,0);
 console.log(JSON.stringify({pass:true,changedPixels:changed,mobileColors:colors.size,errors}));
}finally{await browser.close();}
