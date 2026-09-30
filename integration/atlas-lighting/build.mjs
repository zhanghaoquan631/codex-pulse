import {readFile, writeFile, mkdir, cp, readdir} from 'node:fs/promises';
import {dirname, resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {build} from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, '../../public/local-apps/chaoshan-atlas');
const base = '/local-apps/chaoshan-atlas/';
const baseline = 'assets/index-community-13f5ca70f400.js';
const expectedHash = '13f5ca70f400e6a4fc5e97a1fe18f463f44663e955cc2fe33c39cf7df37b03ee';
const hash = value => createHash('sha256').update(value).digest('hex');
let runtime = await readFile(join(output, baseline), 'utf8');
if (hash(runtime) !== expectedHash) throw new Error('The reviewed community baseline changed. Reconcile before publishing.');
const changes = [];
function once(before, after) {
  if (runtime.split(before).length !== 2) throw new Error('Lighting integration target changed: ' + before.slice(0, 100));
  runtime = runtime.replace(before, after);
  changes.push(before.slice(0, 100));
}
function replaceFunction(name, replacement) {
  const ast = ts.createSourceFile('runtime.js', runtime, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const nodes = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (nodes.length !== 1) throw new Error('Expected one declaration: ' + name);
  const node = nodes[0];
  runtime = runtime.slice(0, node.getStart(ast)) + replacement + runtime.slice(node.end);
  changes.push('function ' + name);
}
replaceFunction('Jr', `function Jr(value, fromSky=false) {
 if(!['morning','day','sunset','night'].includes(value)||!ge)return false;
 if(!fromSky&&bi)bi.manual(value);
 Vd=value;document.body.dataset.time=value==='morning'?'day':value;
 for(const button of document.querySelectorAll('[data-time-choice]')){
  const active=button.dataset.timeChoice===value;
  button.classList.toggle('selected',active);button.setAttribute('aria-pressed',active);
 }
 return true;
}`);
replaceFunction('nh', `function nh(){if(qe&&Me)pulseFitSunShadow({sun:qe,camera:Kt,target:Me.target,worldSpan:Math.max(On,Bn)});}`);
// Keep existing overview/detail batching; quality selection owns the shadows.
replaceFunction('pulsePrepareRender', `function pulsePrepareRender(){for(const gate of pulseDetailGates)gate.visible=ki/Kt.zoom<10;}`);
once('const t=Math.min((i-S0)/1e3,.05);', 'const skyDt=Math.min(Math.max(0,(i-S0)/1e3),1),t=Math.min(skyDt,.05);');
once('else if(Zs&&!Us){', 'else if(Zs&&!Us&&!bi?.paused){');
once('if(Zs){const n=i-Js;', 'if(Zs&&bi?.paused)Js+=skyDt*1000;if(Zs&&!bi?.paused){const n=i-Js;');
once('if(!Us){for(const n of ky)', 'if(!bi?.paused){const i=Ge*1000;for(const n of ky)');
once('Us||(Ge+=t)', 'bi?.paused||(Ge+=t)');
once('si.update(i,Us)', 'si.update(Ge*1000,false)');
once('bi.update(Ge)', 'bi.update(skyDt)');
once('bi = y5({ scene: ge, camera: Kt, sun: qe, hemisphere: Vs, setPeriod: o => Jr(o, !0), reducedMotion: Us })', 'bi = pulseLightingInstall()');
once('sky: bi == null ? void 0 : bi.getState()', 'sky: bi == null ? void 0 : bi.getState(),sceneSeconds:Ge,lightingRelease:"2026-09-27"');
runtime = `import {createLivingSky as pulseCreateLivingSky} from './source/living-sky.mjs';
import {fitSunShadow as pulseFitSunShadow} from './source/solar-lighting.mjs';
import './source/living-world.css';
import '../host.css';\n` + runtime + '\n' + await readFile(join(here, 'host-adapter.js'), 'utf8');
const syntax = ts.createSourceFile('runtime.js', runtime, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
if (syntax.parseDiagnostics.length) throw new Error('Lighting runtime failed parsing');
await mkdir(join(here, '.build'), {recursive:true});
await writeFile(join(here, '.build/runtime.js'), runtime.replaceAll("'./source/", "'../source/"));
await build({root:here,configFile:false,base:base+'lighting/',publicDir:false,css:{postcss:{plugins:[]}},plugins:[{
 name:'atlas-lighting-subpath',enforce:'pre',transform(code,id){
  if(id.replaceAll('\\','/').includes('/atlas-lighting/source/'))return {code:code.replaceAll("'/assets/sky/", `'${base}assets/sky/`),map:null};
 }
}],build:{outDir:join(output,'lighting'),emptyOutDir:true,manifest:true,chunkSizeWarningLimit:2000,
 rollupOptions:{input:join(here,'.build/runtime.js'),output:{entryFileNames:'atlas-lighting-[hash].js',assetFileNames:'atlas-lighting-[hash][extname]'}}}});
const manifest = JSON.parse(await readFile(join(output,'lighting/.vite/manifest.json'),'utf8'));
const entry = Object.values(manifest).find(value => value.isEntry);
if (!entry) throw new Error('No built lighting entry');
let html = await readFile(join(output,'index.html'),'utf8');
html = html.replace(/data-atlas-runtime="[^"]+"/,`data-atlas-runtime="${base}lighting/${entry.file}"`);
html = html.replace(/<link[^>]+href="[^"]*\/lighting\/[^" ]+"[^>]*>\s*/g, '');
html = html.replace('</head>',entry.css.map(file=>`<link rel="stylesheet" href="${base}lighting/${file}">`).join('\n')+'\n</head>');
const localHtml = await readFile(join(here,'source/index.html'),'utf8');
const switchMarkup = localHtml.match(/<div class="time-switch glass"[\s\S]*?<\/div>/)?.[0];
if (!switchMarkup || !switchMarkup.includes('morning')) throw new Error('Missing new time controls');
html = html.replace(/<div class="time-switch glass"[\s\S]*?<\/div>/,switchMarkup);
await writeFile(join(output,'index.html'),html);
await mkdir(join(output,'assets/sky'),{recursive:true});
await cp(join(here,'source/sky'),join(output,'assets/sky'),{recursive:true});
const sources = {};
for(const file of await readdir(join(here,'source')))if(!file.includes('sky')||file.endsWith('.mjs'))sources[file]=hash(await readFile(join(here,'source',file)));
const report = {release:'2026-09-27',baseline,baselineHash:expectedHash,entry,sources,changes,
 preserved:['community portal','custom markers','rankings','policies','adventure','cooperative startup','population limits','visibility pause','detail LOD'],
 features:['four periods','12-second transitions','moving sun','starry sky','tree and building shadows','three quality modes','pause','ambient audio','PNG capture','clean view']};
await writeFile(join(here,'build-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({release:report.release,entry:entry.file,features:report.features}));
