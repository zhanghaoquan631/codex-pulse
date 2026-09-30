import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const out='qa/mainland-diagnosis';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});
 await page.route('**/assets/*.js',async route=>{const r=await route.fetch();const body=(await r.text()).replaceAll('.receiveShadow=!0','.receiveShadow=!1').replaceAll('.castShadow=!0','.castShadow=!1');await route.fulfill({response:r,body});});
 await page.goto('http://127.0.0.1:5243/');await page.waitForFunction(()=>window.xiamenAtlas?.getState().ready,null,{timeout:90000});
 await page.locator('#district').selectOption('1');await page.waitForTimeout(2000);await page.screenshot({path:out+'/oldtown-no-shadows.png'});
 await page.locator('#district').selectOption('10');await page.waitForTimeout(2000);await page.screenshot({path:out+'/jimei-no-shadows.png'});
 await writeFile(out+'/state.json',JSON.stringify(await page.evaluate(()=>window.xiamenAtlas.getState()),null,2));
}finally{await browser.close();}
