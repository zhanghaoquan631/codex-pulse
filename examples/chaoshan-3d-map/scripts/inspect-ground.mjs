import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const out='RECON/ground-diagnosis';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await page.route('**/app.js*',async route=>{
  const response=await route.fetch();let body=await response.text();
  body=body.replace('window.chaoshanAtlas={','window.inspectScene=()=>scene;window.chaoshanAtlas={');
  await route.fulfill({response,body});
 });
 await page.goto('http://127.0.0.1:5242/');await page.waitForFunction(()=>window.chaoshanAtlas?.getState().ready,null,{timeout:240000});
 await page.locator('#loading').waitFor({state:'hidden'});
 await page.evaluate(()=>{const a=window.chaoshanAtlas;a.focusPlace(a.getState().places.find(p=>p.id==='jieyang-jinxian').index);});
 await page.waitForTimeout(3000);console.log(await page.evaluate(()=>window.inspectScene().children.map(o=>({name:o.name,type:o.type,children:o.children.length}))));
 await page.screenshot({path:out+'/baseline.png'});
 for(const name of ['tour-street-fabric','intro-gardens-and-walks','illustrative-urban-infill','riverbanks-and-shallows']){
  await page.evaluate(name=>{window.inspectScene().getObjectByName(name).visible=false;},name);
  await page.waitForTimeout(500);await page.screenshot({path:out+'/without-'+name+'.png'});
 }
}finally{await browser.close();}
