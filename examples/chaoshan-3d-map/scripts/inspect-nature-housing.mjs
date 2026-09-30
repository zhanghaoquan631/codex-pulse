import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const out='RECON/nature-housing';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.route('**/app.js*',async route=>{const response=await route.fetch(),body=await response.text();await route.fulfill({response,body:body.replace('window.chaoshanAtlas={','window.inspectMap=()=>({scene,camera,places});window.chaoshanAtlas={')});});
 await page.route('**/tour-context.mjs*',async route=>{const response=await route.fetch(),body=await response.text();await route.fulfill({response,body:body.replace('const roadsideGrowth=','globalThis.inspectTourPlan=plan;const roadsideGrowth=')});});
 await page.goto('http://127.0.0.1:5242/');await page.waitForFunction(()=>window.chaoshanAtlas?.getState().ready,null,{timeout:240000});await page.locator('#loading').waitFor({state:'hidden'});
 await page.evaluate(()=>{const a=window.chaoshanAtlas;a.focusPlace(a.getState().places.find(p=>p.id==='nanao-nature-gate').index);});await page.waitForTimeout(3000);
 const report=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js'),{scene,camera,places}=window.inspectMap(),p=places.find(p=>p.id==='nanao-nature-gate');
  const screen=(x,y,z)=>{const v=new THREE.Vector3(x,y,z).project(camera);return [(v.x+1)*innerWidth/2,(1-v.y)*innerHeight/2];};
  const parcels=window.inspectTourPlan.plots.filter(q=>Math.hypot(q.x-p.x,q.z-p.z)<1.5).map(q=>({...q,screen:screen(q.x,q.y+.05,q.z),profile:q.profile.key,access:undefined}));
  const ray=new THREE.Raycaster(),hits=[];for(const [x,y] of [[923,369],[914,306],[932,230]]){
   ray.setFromCamera(new THREE.Vector2(x/innerWidth*2-1,1-y/innerHeight*2),camera);
   const found=ray.intersectObjects(scene.children,true).filter(h=>{for(let o=h.object;o;o=o.parent)if(!o.visible)return false;return h.distance>0;})[0];if(!found)continue;
   const o=found.object,ancestors=[];for(let n=o;n;n=n.parent)if(n.name)ancestors.push(n.name);
   let instance;
   if(found.instanceId!==undefined){const m=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),quaternion=new THREE.Quaternion(),color=new THREE.Color();o.getMatrixAt(found.instanceId,m);m.decompose(position,quaternion,scale);if(o.instanceColor)o.getColorAt(found.instanceId,color);instance={position:position.toArray(),scale:scale.toArray(),color:color.getHexString()};}
   hits.push({pixel:[x,y],point:found.point.toArray(),ancestors,geometry:o.geometry.type,instance});
  }
  return {place:{x:p.x,z:p.z,span:p.span},parcels,hits};
 });
 await page.screenshot({path:out+'/before.png'});await fs.writeFile(out+'/inspection.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
