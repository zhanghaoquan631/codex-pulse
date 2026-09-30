import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'vite';
const here=dirname(fileURLToPath(import.meta.url));
const output=resolve(here,'../../public/local-apps/chaoshan-atlas');
const base='/local-apps/chaoshan-atlas/';
const baselinePath=resolve(output,'assets/index-responsive-b78981934e80.js');
let runtime=await readFile(baselinePath,'utf8');
const baselineHash=createHash('sha256').update(runtime).digest('hex');
if(!baselineHash.startsWith('b78981934e80'))throw new Error('Reviewed responsive runtime changed; inspect before integration.');
function once(before,after){if(runtime.split(before).length!==2)throw new Error('Runtime target changed: '+before);runtime=runtime.replace(before,after);}
let bridge=await readFile(resolve(here,'src/atlas-community-bridge.mjs'),'utf8');
bridge=bridge.replace("import * as THREE from 'three';",'const THREE={Vector3:$};').replaceAll('export function ','function ');
runtime+='\nlet opcBridge;\nfunction opcInstallBridge(){\n'+bridge+`\n
 opcBridge=createAtlasCommunityBridge({camera:Kt,layer:zt('labels'),toWorld:gn,inBounds:Oy,heightAt:se,labelsVisible:()=>ko,focus:p=>{
  ei();xn=-1;Hd=undefined;mi=false;th();$d();eh();zt('district').value='';
  rc(Ie(p.x,se(p.x,p.z)+.04,p.z),Math.min(28,Math.max(5,ki/1.75)),Ie(14,16,20),1400);
  Yd(p.name,'COMMUNITY PLACE','社区地点 · 地图定位',[p.lng,p.lat],'OPC');
 }});
 const original=window.chaoshanAtlas.getState;
 Object.assign(window.chaoshanAtlas,{focusCoordinates:opcBridge.focusCoordinates,setCustomPlaces:opcBridge.setCustomPlaces,getCustomPlaces:opcBridge.getCustomPlaces,getState:()=>({...original(),customPlaces:opcBridge.getState()})});
 window.dispatchEvent(new CustomEvent('atlas:ready'));
}\n`;
once('tM().then(()=>pulseStatus("ready","地图已就绪"))','tM().then(()=>{opcInstallBridge();pulseStatus("ready","地图已就绪")})');
once('pulseUpdateLabels(i),ln.render(ge,Kt)','pulseUpdateLabels(i),opcBridge?.update(),ln.render(ge,Kt)');
once('if(pulsePaused||document.documentElement.hasAttribute','if(document.body.classList.contains("opc-hub-open")||pulsePaused||document.documentElement.hasAttribute');
// Clear community selection when original region/home controls are used.
once('function po(i,t=!1,e){','function po(i,t=!1,e){opcBridge?.clearSelection();');
once('function cc(){','function cc(){opcBridge?.clearSelection();');
const runtimeName='index-community-'+createHash('sha256').update(runtime).digest('hex').slice(0,12)+'.js';
await writeFile(resolve(output,'assets',runtimeName),runtime);
await build({root:resolve(here,'src'),configFile:false,base:base+'community/',publicDir:false,build:{outDir:resolve(output,'community'),emptyOutDir:true,manifest:true,rollupOptions:{input:resolve(here,'src/pulse-entry.mjs'),output:{entryFileNames:'community-[hash].js',assetFileNames:'community-[hash][extname]'}}}});
const manifest=JSON.parse(await readFile(resolve(output,'community/.vite/manifest.json'),'utf8'));
const entry=manifest['pulse-entry.mjs'];
let html=await readFile(resolve(here,'atlas-template.html'),'utf8');
html=html.replace(/<script type="module" crossorigin src="[^"]+"><\/script>/,`<script type="module" crossorigin src="${base}community/${entry.file}"></script>`);
html=html.replace('</head>',entry.css.map(file=>`<link rel="stylesheet" href="${base}community/${file}">`).join('\n')+'\n</head>');
html=html.replace('<body data-time="day">',`<body data-time="day" data-atlas-runtime="${base}assets/${runtimeName}">`);
html=html.replace('<title>潮汕 · CHAOSHAN 3D Atlas v5</title>','<title>潮汕共创地图 · 社区、榜单与城市机会</title>');
await writeFile(resolve(output,'index.html'),html);
await writeFile(resolve(here,'build-report.json'),JSON.stringify({baselineHash,runtimeName,entry,base,contentSnapshot:'2026-09-26',communities:24,policies:439,activities:2},null,2)+'\n');
console.log('Integrated community portal and custom markers with the preserved responsive 3D runtime.');
