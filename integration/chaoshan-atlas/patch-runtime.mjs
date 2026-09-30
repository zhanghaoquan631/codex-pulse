// Patch the exact published map, without importing unrelated changes from the
// separately maintained local atlas. Keep its complete map, scenes and game.
import ts from 'typescript';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../public/local-apps/chaoshan-atlas');
const sourcePath = resolve(here, 'runtime-baseline.js');
const originalPath = resolve(root, 'assets/index-DRfLEKGS.js');
try { await readFile(sourcePath); } catch { await copyFile(originalPath, sourcePath); }
let source = await readFile(sourcePath, 'utf8');
const hash = text => createHash('sha256').update(text).digest('hex');
const baseline = await readFile(resolve(here, 'runtime-baseline.sha256'), 'utf8');
if (hash(source) !== baseline.trim()) throw new Error('Published atlas baseline changed; review before patching.');
const edits = [];
function replaceOnce(before, after) {
  if (source.split(before).length !== 2) throw new Error(`Atlas patch target changed: ${before.slice(0,90)}`);
  source = source.replace(before, after); edits.push(before.slice(0,90));
}

// The network branch previously ignored the configured population (20,171
// vehicle slots instead of 2,016). Preserve every route; spread active actors
// across the districts using the atlas's existing spatial distribution.
replaceOnce('const b=s?c.flatMap(m=>Array.from({length:Math.min(12,Math.max(a?2:1,Math.ceil(m.length/(a?.35:1.5))))},()=>m)):f0(c,e,f)', 'const b=f0(c,e,s?Math.min(f,c.reduce((sum,m)=>sum+Math.min(12,Math.max(a?2:1,Math.ceil(m.length/(a?.35:1.5)))),0)):f)');
replaceOnce('population:e=100,obstacles:n=[]', 'population:e=600,obstacles:n=[]');
replaceOnce('o&&(e=c.reduce((w,C)=>w+Math.min(6,Math.max(1,Math.floor(C.length/.12))),0))', 'o&&(e=Math.min(e,c.reduce((w,C)=>w+Math.min(6,Math.max(1,Math.floor(C.length/.12))),0)))');
replaceOnce('coverEveryTrack:!0,scale:.011', 'coverEveryTrack:!0,population:N,scale:.011');
// Visit tracks in a deterministic shuffled order, so a bounded population is
// not concentrated in the first district. Track IDs and the full route table stay intact.
replaceOnce('for(const[C,z]of c.entries())', 'for(const[C,z]of pulseTrackOrder(c).entries())');
replaceOnce('ln.setPixelRatio(Math.min(devicePixelRatio,We()?1.6:1.8))', 'ln.setPixelRatio(Math.min(devicePixelRatio,window.parent!==window?1.25:We()?1.6:1.8))');
replaceOnce('if(Gd||(requestAnimationFrame(Zd),document.hidden||!ac))return;', 'if(Gd)return;requestAnimationFrame(Zd);if(document.hidden||!ac)return;if(pulsePaused||document.documentElement.hasAttribute("data-chaoshan-adventure-open")){const elapsed=Math.max(0,i-S0);if(Tn)Tn.start+=elapsed;Js+=elapsed;S0=i;return;}if(i-pulseLastFrame<1000/30)return;pulseLastFrame=i;');
replaceOnce('Qy(),ln.render(ge,Kt)', 'pulseUpdateLabels(i),ln.render(ge,Kt)');
replaceOnce('nh(),No==null||No.update(Kt,[qe])', 'nh(),pulsePrepareRender(),No==null||No.update(Kt,[qe])');
replaceOnce('s.visible=e.intersectsSphere(a)', 's.visible=e.intersectsSphere(a)&&o.zoom>2&&a.radius*Math.abs(o.projectionMatrix.elements[5])*innerHeight>=(s.visible?72:96)');
// Apply the existing visibility rules before the very first render as well;
// and avoid compiling the entire scene, including hidden detail, in one task.
replaceOnce('ln.render(ge,Kt),zt("loading-bar").style.width="100%"', 'pulsePrepareRender(),qr?.update(Kt),No?.update(Kt,[qe]),ln.render(ge,Kt),zt("loading-bar").style.width="100%"');
replaceOnce('geometryBudget:()=>', 'renderGroups:()=>pulseDrawGroups(ge,Kt),geometryBudget:()=>');
replaceOnce('tM().catch(Xd)', 'tM().then(()=>pulseStatus("ready","地图已就绪")).catch(error=>{pulseStatus("error","地图暂时无法加载，请重试。");Xd(error)})');

// Preserve full instance matrices while batching the overview in larger cells.
replaceOnce('s.elements[12]/(e*3)', 's.elements[12]/(e*12)');
replaceOnce('s.elements[14]/(e*3)', 's.elements[14]/(e*12)');
replaceOnce('nn("spatialSurfaces",()=>R5(ge))', 'nn("spatialSurfaces",async()=>{R5(ge);await pulseCompactSurfaces(ge)})');
replaceOnce('No=nn("staticVisibility",()=>h5(ge))', 'pulseInstallDetailLOD(ge),No=nn("staticVisibility",()=>h5(ge))');
// Convert only the known startup chain to cooperative async work. Functions
// called by animation/UI remain synchronous; assertions below prevent promises
// leaking into another, unreviewed call site.
const asyncNames = new Set(['Cv','Rv','Wy','qy','tM','Fo','Hb','kb','zb','mc','Cb','Sb','O5','Ed','xc','Ti','pv','nv','iy','sv','tv','Qb','jb','Vb','Fb','Lb','Pb','Rb','Eb','Mb','Nv','Xv','wv','vv','Mv','Tv','gv','mv','Uv','jv','Av','_v','Lv']);
const file = ts.createSourceFile('runtime.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const f = ts.factory;
const makeAwait = expression => f.createAwaitExpression(expression);
const call = (name, args=[]) => f.createCallExpression(f.createIdentifier(name), undefined, args);
const checkpoint = () => f.createIfStatement(call('pulseNeedsYield'), f.createExpressionStatement(makeAwait(call('pulseYield'))));
function flatten(expr) { return ts.isBinaryExpression(expr) && expr.operatorToken.kind===ts.SyntaxKind.CommaToken ? [...flatten(expr.left),...flatten(expr.right)] : [expr]; }
const changedFunctions = [];
const result = ts.transform(file, [context => {
  function expression(node) {
    if (ts.isFunctionLike(node)) return node;
    if (ts.isBlock(node)) return block(node);
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.text==='nn') {
        const [name, callback] = node.arguments;
        if (!ts.isArrowFunction(callback)) throw new Error('Unexpected startup timer callback');
        const body=ts.isBlock(callback.body)?block(callback.body):expression(callback.body);
        const arrow=f.updateArrowFunction(callback,[f.createModifier(ts.SyntaxKind.AsyncKeyword)],callback.typeParameters,callback.parameters,callback.type,callback.equalsGreaterThanToken,body);
        return makeAwait(call('pulseStage',[name,arrow]));
      }
      if (asyncNames.has(node.expression.text)) return makeAwait(f.updateCallExpression(node,node.expression,node.typeArguments,node.arguments.map(a=>expression(a))));
    }
    return ts.visitEachChild(node, expression, context);
  }
  function statement(node) {
    if (ts.isFunctionLike(node)) return node;
    if (ts.isBlock(node)) return block(node);
    if (ts.isIfStatement(node)) {
      const asStatement = value => Array.isArray(value) ? f.createBlock(value,true) : value;
      return f.updateIfStatement(node,expression(node.expression),asStatement(statement(node.thenStatement)),node.elseStatement?asStatement(statement(node.elseStatement)):undefined);
    }
    if (ts.isExpressionStatement(node)) return flatten(node.expression).flatMap(e=>[checkpoint(),f.createExpressionStatement(expression(e))]);
    if (ts.isForStatement(node)||ts.isForOfStatement(node)||ts.isForInStatement(node)||ts.isWhileStatement(node)||ts.isDoStatement(node)) {
      const body=ts.isBlock(node.statement)?block(node.statement):f.createBlock([].concat(statement(node.statement)),true);
      const wrapped=f.updateBlock(body,[checkpoint(),...body.statements]);
      if(ts.isForStatement(node))return f.updateForStatement(node,node.initializer,node.condition,node.incrementor,wrapped);
      if(ts.isForOfStatement(node))return f.updateForOfStatement(node,node.awaitModifier,node.initializer,node.expression,wrapped);
      if(ts.isForInStatement(node))return f.updateForInStatement(node,node.initializer,node.expression,wrapped);
      if(ts.isWhileStatement(node))return f.updateWhileStatement(node,node.expression,wrapped);
      return f.updateDoStatement(node,wrapped,node.expression);
    }
    // Other statements contain expressions, not newly instrumented closures.
    return ts.visitEachChild(node, expression, context);
  }
  function block(node){return f.updateBlock(node,node.statements.flatMap(statement));}
  return node=>f.updateSourceFile(node,node.statements.map(n=>{
    if(!ts.isFunctionDeclaration(n)||!asyncNames.has(n.name?.text))return n;
    changedFunctions.push(n.name.text);
    return f.updateFunctionDeclaration(n,[f.createModifier(ts.SyntaxKind.AsyncKeyword)],n.asteriskToken,n.name,n.typeParameters,n.parameters,n.type,block(n.body));
  }));
}]);
const printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});
// Preserve unmodified bundled libraries byte-for-byte; print only the reviewed
// startup functions under review, keeping the patch small and source attribution intact.
const ranges=[];
for(let i=0;i<file.statements.length;i++){
  const old=file.statements[i],next=result.transformed[0].statements[i];
  if(old!==next)ranges.push({start:old.getStart(file),end:old.end,text:printer.printNode(ts.EmitHint.Unspecified,next,file)});
}
for(const edit of ranges.reverse())source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
result.dispose();
if(changedFunctions.length!==asyncNames.size)throw new Error('Startup chain is incomplete');

const support=await readFile(resolve(here,'responsive-runtime.js'),'utf8');
source=support+'\n'+source;
const checked=ts.createSourceFile('patched.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
if(checked.parseDiagnostics.length)throw new Error('Patched map failed JavaScript parsing');
function inspect(node){
  if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&asyncNames.has(node.expression.text)&&node.expression.text!=='tM'&&!ts.isAwaitExpression(node.parent))throw new Error(`Unawaited startup call: ${node.expression.text}`);
  ts.forEachChild(node,inspect);
}
inspect(checked);
const asset=`assets/index-responsive-${hash(source).slice(0,12)}.js`;
await mkdir(resolve(root,'assets'),{recursive:true});await writeFile(resolve(root,asset),source);
const htmlPath=resolve(root,'index.html');let html=await readFile(htmlPath,'utf8');
const entry=/assets\/index-(?:DRfLEKGS|responsive-[a-f0-9]+)\.js/g;
if([...html.matchAll(entry)].length!==1)throw new Error('Map entry changed; review the pinned baseline before patching.');
html=html.replace(entry,asset);
await writeFile(htmlPath,html);
await writeFile(resolve(here,'responsive-report.json'),JSON.stringify({baseline:baseline.trim(),output:asset,sha256:hash(source),functions:changedFunctions,edits},null,2)+'\n');
console.log(JSON.stringify({asset,functions:changedFunctions,patched:true}));
