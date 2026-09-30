import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PNG} from 'pngjs';

const out='RECON/sky-cycle';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[],samples={};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5242/scripts/sky-fixture.html');await page.waitForFunction(()=>window.skyAudit?.state().photography.ready);
 for(const hour of [12,17.5,22,6,9]){
  const state=await page.evaluate(h=>window.skyAudit.advance(h),hour);samples[hour]=state;
  await page.screenshot({path:`${out}/hour-${hour}.png`});
 }
 assert.ok(samples[6].sun.x>0&&Math.abs(samples[12].sun.x)<.001&&samples[17.5].sun.x<0);
 assert.ok(samples[12].sun.y>samples[6].sun.y);assert.equal(samples[22].sun.visible,false);
 const noon=PNG.sync.read(await fs.readFile(out+'/hour-12.png'));
 const sunX=Math.round(noon.width*.5),sunY=Math.round(noon.height*(1-samples[12].sun.y));
 let bright=0;
 for(let y=sunY-7;y<=sunY+7;y++)for(let x=sunX-7;x<=sunX+7;x++){const i=(y*noon.width+x)*4;if(noon.data[i]>235&&noon.data[i+1]>225&&noon.data[i+2]>200)bright++;}
 assert.ok(bright>4,'captured solar disk must render at its predicted location, not just update state');
 assert.deepEqual([...new Set(samples[9].periods)].sort(),['day','night','sunset']);
 await page.evaluate(()=>window.skyAudit.advance(17.5));
 await page.getByRole('checkbox',{name:'云朵'}).uncheck();await page.evaluate(()=>window.skyAudit.render());
 const disk=PNG.sync.read(await page.locator('canvas').screenshot());
 let diskPixels=0;
 for(let i=0;i<disk.data.length;i+=4)if(disk.data[i]>240&&disk.data[i+1]>230&&disk.data[i+2]>210)diskPixels++;
 assert.ok(diskPixels<disk.width*disk.height*.003,'sunset highlights must stay local to the sun instead of forming bright cloud patches');
 await page.evaluate(()=>window.skyAudit.advance(9));await page.getByRole('checkbox',{name:'云朵'}).check();await page.evaluate(()=>window.skyAudit.render());
 const before=await page.locator('canvas').screenshot();await page.getByRole('checkbox',{name:'云朵'}).uncheck();await page.evaluate(()=>window.skyAudit.render());
 assert.equal((await page.evaluate(()=>window.skyAudit.state())).photography.clouds,0);
 const after=await page.locator('canvas').screenshot(),a=PNG.sync.read(before),b=PNG.sync.read(after);let changed=0;
 for(let i=0;i<a.data.length;i+=4)if(Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+Math.abs(a.data[i+2]-b.data[i+2])>30)changed++;
 assert.ok(changed>1000,'cloud toggle must visibly change rendered pixels');
 // Foreground geometry must completely occlude the photographic background.
 await page.evaluate(()=>{window.skyAudit.advance(12);window.skyAudit.foreground(true);});
 const bare=PNG.sync.read(await page.locator('canvas').screenshot());
 await page.getByRole('checkbox',{name:'云朵'}).check();await page.evaluate(()=>window.skyAudit.render());
 const covered=PNG.sync.read(await page.locator('canvas').screenshot({path:out+'/foreground-contrast.png'}));
 const level=(png,x,y)=>{const i=(Math.round(y*png.height)*png.width+Math.round(x*png.width))*4;return(png.data[i]+png.data[i+1]+png.data[i+2])/3;};
 const retained=[];
 for(const y of [.02,.08,.15])for(const x of [.0125,.0625,.1125,.1625]){
  const baseline=Math.abs(level(bare,x,y)-level(bare,x+.025,y));
  const contrast=Math.abs(level(covered,x,y)-level(covered,x+.025,y));
  assert.ok(baseline>100);retained.push(contrast/baseline);assert.equal(contrast,baseline,'sky must not wash out foreground geometry');
 }
 await page.evaluate(()=>window.skyAudit.foreground(false));
 await page.setViewportSize({width:390,height:844});await page.getByRole('checkbox',{name:'云朵'}).check();await page.evaluate(()=>window.skyAudit.render());await page.screenshot({path:out+'/mobile.png'});
 await page.goto('http://127.0.0.1:5242/scripts/sky-fixture.html?reduced');await page.waitForFunction(()=>window.skyAudit?.state().photography.ready);
 const frozen=await page.evaluate(()=>window.skyAudit.state()),later=await page.evaluate(()=>window.skyAudit.tick(40));
 assert.equal(later.hour,frozen.hour);assert.equal(later.photography.drift,frozen.photography.drift);assert.equal(errors.length,0);
 await fs.writeFile(out+'/results.json',JSON.stringify({samples,cloudPixelsChanged:changed,minimumForegroundContrast:Math.min(...retained),reducedFrozen:true,errors},null,2));
 console.log('PASS full sunrise/sunset/night cycle, cloud pixels, portrait rendering and reduced motion');
}finally{await browser.close();}
