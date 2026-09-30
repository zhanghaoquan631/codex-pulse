import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
const root=process.cwd(), dist=path.join(root,'dist');
const imageAliases=JSON.parse(fs.readFileSync('server/static-image-aliases.json','utf8'));
if(path.dirname(dist)!==root||path.basename(dist)!=='dist')throw Error('Invalid output');
fs.rmSync(dist,{recursive:true,force:true});fs.mkdirSync(path.join(dist,'client'),{recursive:true});
for(const [app,sub] of [['main',''],['account','account'],['gallery','infinite-gallery']]){
 const cwd=path.join(root,'apps',app);
 const run=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{cwd,stdio:'inherit'});
 if(run.status!==0)process.exit(run.status||1);
 fs.cpSync(path.join(cwd,'dist'),path.join(dist,'client',sub),{recursive:true,filter(source){
  if(app==='main'){
   const relative='/'+path.relative(path.join(cwd,'dist'),source).split(path.sep).join('/');
   const alias=imageAliases[relative];
   if(alias){
    const hash=createHash('sha256').update(fs.readFileSync(source)).digest('hex');
    const optimized=path.join(cwd,'dist',alias.path.slice(1));
    if(hash!==alias.sha256||!fs.existsSync(optimized)||createHash('sha256').update(fs.readFileSync(optimized)).digest('hex')!==alias.webpSha256)throw Error('Recreate the lossless image for '+relative);
    return false;
   }
  }
  // Gallery rewards also live in the main public asset library. Keep one
  // byte-identical copy; the Worker retains both public URL paths.
  if(app==='gallery'){
   const relative=path.relative(path.join(cwd,'dist'),source).split(path.sep).join('/');
   if(/^(wechat-0051|wechat-0327)\//.test(relative)&&fs.statSync(source).isFile()){
    const canonical=path.join(dist,'client/media/gallery-rewards',relative);
    if(fs.existsSync(canonical)&&fs.readFileSync(source).equals(fs.readFileSync(canonical)))return false;
   }
  }
  return true;
 }});
}
fs.cpSync('apps/booking',path.join(dist,'client/booking'),{recursive:true});
fs.cpSync('apps/racing',path.join(dist,'client/racing'),{recursive:true});
await build({entryPoints:['src/racing/qr.mjs'],outfile:path.join(dist,'client/racing/competition/qr.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
// The local 5202 login and lanyard experience is the public entrypoint.
// Keep the existing artwork workspace and its root-based assets accessible.
fs.mkdirSync(path.join(dist,'client/playground'),{recursive:true});
fs.copyFileSync(path.join(dist,'client/index.html'),path.join(dist,'client/playground/index.html'));
fs.copyFileSync(path.join(dist,'client/account/index.html'),path.join(dist,'client/index.html'));
// Public gallery aliases are handled by the Worker to avoid duplicating artwork.
await build({entryPoints:['server/index.mjs'],outfile:path.join(dist,'server/index.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',conditions:['browser','worker'],external:['cloudflare:*'],minify:true});
fs.mkdirSync(path.join(dist,'.openai'),{recursive:true});
fs.copyFileSync('.openai/hosting.json',path.join(dist,'.openai/hosting.json'));
if(fs.existsSync('drizzle'))fs.cpSync('drizzle',path.join(dist,'.openai/drizzle'),{recursive:true});
console.log('Built final page, account, gallery, booking and cloud APIs.');
