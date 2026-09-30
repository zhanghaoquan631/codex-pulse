import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'});
 await page.route('**/app.js*',async route=>{
  const response=await route.fetch(),body=await response.text();
  await route.fulfill({response,body:body+`\nwindow.drawAudit=()=>{const counts={},restore=[];scene.children.forEach(root=>root.traverse(o=>{if(!o.isMesh)return;const original=o.onBeforeRender;let name=root.name||root.type;for(let p=o.parent;p&&p!==root;p=p.parent)if(p.name&&!['static-visibility-cell'].includes(p.name)){name+=' / '+p.name;break;}o.onBeforeRender=function(...args){const c=counts[name]??={calls:0,triangles:0};c.calls++;c.triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);original.apply(this,args);};restore.push(()=>o.onBeforeRender=original);}));renderer.render(scene,camera);restore.forEach(fn=>fn());return Object.entries(counts).map(([name,c])=>({name,...c})).sort((a,b)=>b.calls-a.calls);};`});
 });
 await page.goto('http://127.0.0.1:5242/');await page.waitForFunction(()=>window.chaoshanAtlas?.getState().ready,null,{timeout:240000});
 const place=await page.evaluate(()=>window.chaoshanAtlas.getState().places.find(p=>p.name==='普宁市'));
 await page.evaluate(i=>window.chaoshanAtlas.focusPlace(i),place.index);await page.waitForTimeout(500);
 const rows=await page.evaluate(()=>window.drawAudit());await fs.writeFile('RECON/population/draws.json',JSON.stringify(rows,null,2));console.log(JSON.stringify(rows.slice(0,15)));
}finally{await browser.close();}
