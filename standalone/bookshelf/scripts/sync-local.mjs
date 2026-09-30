// Explicit one-way source port. Production builds use the copied, self-contained
// source in this checkout and never depend on the original desktop directory.
import {mkdir,cp,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
const local=path.resolve(process.cwd(),'../bookshelf');
await mkdir('public',{recursive:true});await cp(path.join(local,'public'),'public',{recursive:true});
// Keep the hosted Pulse integration when refreshing the desktop UI.
let app=await readFile('public/app.js','utf8');
if(!app.includes("import { installPulseBridge }"))app=app.replace("import { ebookDetailHtml } from './ebook-ui.js';","import { ebookDetailHtml } from './ebook-ui.js';\nimport { installPulseBridge } from './pulse-bridge.js';");
if(!app.includes('installPulseBridge(() =>'))app=app.replace('const state = { library: null, authors: [], carouselCleanup: null, adminCleanup: null, renderId: 0 };','const state = { library: null, authors: [], carouselCleanup: null, adminCleanup: null, renderId: 0 };\ninstallPulseBridge(() => Boolean(state.library));');
await writeFile('public/app.js',app);
const source=await readFile(path.join(local,'server.mjs'),'utf8');
const defaults=source.slice(source.indexOf('const DEFAULT_SETTINGS'),source.indexOf('const app ='));
const validation=source.slice(source.indexOf('const object ='),source.indexOf('function replaceLibrary'));
await writeFile('worker/validation.mjs',`import {normalizeIsbn} from './lookup-core.mjs';\nimport {normalizeEbookLinks} from './ebooks-core.mjs';\nexport class RequestError extends Error {constructor(message,status=400){super(message);this.status=status}}\nexport const fail=(message,status)=>{throw new RequestError(message,status)};\n${defaults}\n${validation}\nexport {DEFAULT_SETTINGS,bookFrom,categoryFrom,bannerFrom,settingsFrom,validateLibrary};\n`);
await cp(path.join(local,'data/seed.json'),'worker/seed.json');
for(const file of ['lookup-core.mjs','ebooks-core.mjs'])await cp(path.join(local,file),path.join('worker',file));
console.log('Copied current bookshelf UI, validations and pure source adapters.');
