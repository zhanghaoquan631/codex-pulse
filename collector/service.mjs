import { createReadStream } from 'node:fs';
import { mkdir,readFile,readdir,stat,writeFile,rename,open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { setImmediate as yieldNow } from 'node:timers/promises';
import { consume,freshState } from './parser.mjs';
import { WebsiteCollector } from './websites.mjs';
import { CreditCollector,readCreditBalance } from './credits.mjs';
import { AccountTracker } from './accounts.mjs';
import { MezipCollector } from './mezip.mjs';
import { AppsRelay } from './apps-relay.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const configFile=process.env.PULSE_CONFIG||path.join(here,'config.json');
const dataDir=process.env.PULSE_DATA||path.join(here,'data');
const codexRoot=process.env.PULSE_CODEX_HOME||process.env.CODEX_HOME||path.join(os.homedir(),'.codex');
const port=Number(process.env.PULSE_PORT||43871);
await mkdir(dataDir,{recursive:true});
const db=new DatabaseSync(path.join(dataDir,'usage.sqlite'));
const websites=new WebsiteCollector(codexRoot,dataDir,configFile);
const credits=new CreditCollector(dataDir,configFile);
const mezip=new MezipCollector(dataDir,configFile);
const appsRelay=new AppsRelay(dataDir,configFile);
appsRelay.dependencies.googleTools={quotaRefresh:async email=>{const sample=await readCreditBalance();if(sample.state!=='ready')throw Object.assign(new Error('当前 Codex 登录信息暂时无法查询。'),{status:503});if(sample.email?.toLowerCase()!==email)throw Object.assign(new Error('请先在这台电脑的 Codex 中登录此邮箱，再刷新。当前登录的是 '+sample.email),{status:409});credits.observe(sample);await persistSnapshot();await upload();return {ok:true,email,profile:sample.profile};}};
db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS files(path TEXT PRIMARY KEY,state TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events(key TEXT PRIMARY KEY,time TEXT,day TEXT,hour TEXT,model TEXT,session TEXT,input INTEGER,cached INTEGER,cacheWrite INTEGER,output INTEGER,reasoning INTEGER,total INTEGER,requests INTEGER,corrected INTEGER); CREATE INDEX IF NOT EXISTS events_day ON events(day); CREATE INDEX IF NOT EXISTS events_time ON events(time);');
const eventColumns=db.prepare('PRAGMA table_info(events)').all();
if(!eventColumns.some(c=>c.name==='accountId'))db.exec('ALTER TABLE events ADD COLUMN accountId TEXT;');
if(!eventColumns.some(c=>c.name==='turnTime'))db.exec('ALTER TABLE events ADD COLUMN turnTime TEXT;');
db.exec('CREATE INDEX IF NOT EXISTS events_account_day ON events(accountId,day);');
const accounts=new AccountTracker(db,codexRoot,credits.salt);
const insert=db.prepare('INSERT OR IGNORE INTO events(key,time,day,hour,model,session,input,cached,cacheWrite,output,reasoning,total,requests,corrected,turnTime) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
const getState=db.prepare('SELECT state FROM files WHERE path=?');
const putState=db.prepare('INSERT INTO files VALUES (?,?) ON CONFLICT(path) DO UPDATE SET state=excluded.state');
let snapshot=null,sync={ok:false,status:'waiting',lastSuccess:null},phase='importing',filesCount=0,scanned=0,errors=0,stopping=false;
const sum='SUM(input) input,SUM(cached) cached,SUM(cacheWrite) cacheWrite,SUM(output) output,SUM(reasoning) reasoning,SUM(total) total,SUM(requests) requests';
function makeSnapshot(){accounts.assignPending();const today=new Date(Date.now()+8*3600_000).toISOString().slice(0,10);return {schemaVersion:1,generatedAt:new Date().toISOString(),lastEvent:db.prepare('SELECT MAX(time) t FROM events').get().t||null,phase,files:filesCount,scanned,errors,anomalies:db.prepare('SELECT COALESCE(SUM(corrected),0) n FROM events').get().n,accounts:db.prepare('SELECT id,email,lastSeen FROM token_accounts ORDER BY email').all(),accountDetails:credits.profiles(),quotaHistory:credits.history(),currentAccountEmail:credits.status.state==="ready"&&accounts.current?(db.prepare("SELECT email FROM token_accounts WHERE id=?").get(accounts.current.id)?.email||null):null,accountTrackingSince:db.prepare('SELECT MIN(start) t FROM account_intervals').get().t||null,daily:db.prepare(`SELECT day,model,accountId,${sum} FROM events GROUP BY day,model,accountId ORDER BY day,model`).all(),hourly:db.prepare(`SELECT day,hour,model,accountId,${sum} FROM events WHERE day=? GROUP BY day,hour,model,accountId ORDER BY hour`).all(today),recent:db.prepare('SELECT time,model,accountId,input,cached,cacheWrite,output,reasoning,total,requests FROM events ORDER BY time DESC LIMIT 50').all()};}
let snapshotWrite=Promise.resolve();
function persistSnapshot(){snapshotWrite=snapshotWrite.catch(()=>{}).then(async()=>{snapshot=makeSnapshot();const target=path.join(dataDir,'snapshot.json');await writeFile(target+'.tmp',JSON.stringify(snapshot));await rename(target+'.tmp',target);});return snapshotWrite;}
async function discover(dir,found=[]){let entries;try{entries=await readdir(dir,{withFileTypes:true});}catch(e){if(e.code!=='ENOENT')errors++;return found;}for(const entry of entries){const file=path.join(dir,entry.name);if(entry.isDirectory())await discover(file,found);else if(entry.isFile()&&/^rollout-.*\.jsonl$/.test(entry.name)){try{found.push({file,info:await stat(file)});}catch{errors++;}}}return found;}
async function anchorAt(file,offset){if(!offset)return '';const handle=await open(file,'r');try{const length=Math.min(offset,512),buffer=Buffer.alloc(length);const {bytesRead}=await handle.read(buffer,0,length,offset-length);return createHash('sha256').update(buffer.subarray(0,bytesRead)).digest('hex');}finally{await handle.close();}}
async function sessionProvider(file){const handle=await open(file,'r');try{const buffer=Buffer.alloc(65536),{bytesRead}=await handle.read(buffer,0,buffer.length,0),end=buffer.indexOf(10);if(end<0||end>=bytesRead)return null;const meta=JSON.parse(buffer.subarray(0,end).toString('utf8'));return meta.type==='session_meta'&&typeof meta.payload?.model_provider==='string'?meta.payload.model_provider:null;}catch{return null;}finally{await handle.close();}}
async function scanFile(file,info){
 let saved=getState.get(file),state=saved?JSON.parse(saved.state):freshState();
 const identity=String(info.ino)+':'+info.birthtimeMs;
 if(state.identity!==identity||info.size<state.offset)state=freshState();
 if(state.size===info.size&&state.mtime===info.mtimeMs)return;
 if(state.provider===undefined)state.provider=await sessionProvider(file);
 if(state.offset&&((state.anchor&&await anchorAt(file,state.offset)!==state.anchor)||(!state.anchor&&info.size===state.offset&&state.mtime!==info.mtimeMs)))state=freshState();
 state.identity=identity;
 if(info.size===state.offset){state.size=info.size;state.mtime=info.mtimeMs;putState.run(file,JSON.stringify(state));return;}
 let tail=Buffer.alloc(0),skipping=false,position=state.offset;
 const stream=createReadStream(file,{start:state.offset,end:info.size-1,highWaterMark:256*1024});
 for await(const chunk of stream){
  if(stopping){stream.destroy();break;}
  let at=0;db.exec('BEGIN');
  try{while(at<chunk.length){const end=chunk.indexOf(10,at);if(end<0){const rest=chunk.subarray(at);if(!skipping){if(tail.length+rest.length>2*1024*1024){tail=Buffer.alloc(0);skipping=true;}else tail=Buffer.concat([tail,rest]);}position+=rest.length;break;}
   const piece=chunk.subarray(at,end);position+=piece.length+1;
   if(skipping){state.ordinal++;}else{const line=tail.length?Buffer.concat([tail,piece]):piece;parseLine(line,state);}
   state.offset=position;tail=Buffer.alloc(0);skipping=false;at=end+1;
  }putState.run(file,JSON.stringify(state));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  await yieldNow();
 }
 state.size=info.size;state.mtime=info.mtimeMs;state.anchor=await anchorAt(file,state.offset);putState.run(file,JSON.stringify(state));
}
function parseLine(line,state){
 // Only parse usage and structural metadata, never save message text or tool output.
 const prefix=line.subarray(0,180).toString('utf8');
 if(!/"type"\s*:\s*"(event_msg|session_meta|turn_context)"/.test(prefix)){state.ordinal++;return;}
 if(prefix.includes('event_msg')&&!line.includes(Buffer.from('"token_count"'))){state.ordinal++;return;}
 try{const record=JSON.parse(line.toString('utf8'));const event=consume(record,state);if(event)insert.run(event.key,event.time,event.day,event.hour,event.model,event.session,event.input,event.cached,event.cacheWrite,event.output,event.reasoning,event.total,event.requests,event.corrected,event.turnTime);}catch{state.ordinal++;}
}
async function scanAll(){errors=0;const all=await discover(path.join(codexRoot,'sessions'));await discover(path.join(codexRoot,'archived_sessions'),all);all.sort((a,b)=>b.info.mtimeMs-a.info.mtimeMs);filesCount=all.length;scanned=0;for(const {file,info} of all){if(stopping)break;try{await scanFile(file,info);}catch{errors++;}scanned++;if(scanned%20===0)await persistSnapshot();}phase='ready';await persistSnapshot();}
let uploading=false;
async function upload(){if(uploading||!snapshot)return;uploading=true;try{const config=JSON.parse((await readFile(configFile,'utf8')).replace(/^\uFEFF/,''));if(!config.siteUrl||!config.ingestToken||!config.sitesToken){sync.status='not-configured';return;}
 const url=new URL('/api/ingest',config.siteUrl);if(url.protocol!=='https:')throw new Error('HTTPS required');
 const body=JSON.stringify(snapshot);if(Buffer.byteLength(body)>1_800_000)throw new Error('Snapshot exceeds upload limit');
 const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${config.ingestToken}`,'OAI-Sites-Authorization':`Bearer ${config.sitesToken}`},body,redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!r.ok){sync={...sync,ok:false,status:`http-${r.status}`};return;}const result=await r.json();if(!result.ok)throw new Error('Invalid reply');sync={ok:true,status:'synced',lastSuccess:new Date().toISOString()};
 }catch(e){sync={...sync,ok:false,status:e.code==='ENOENT'?'not-configured':'network-error'};}finally{uploading=false;}}
const server=http.createServer((req,res)=>{const host=req.headers.host;if(host!==`127.0.0.1:${port}`&&host!==`localhost:${port}`){res.writeHead(403);return res.end();}if(req.method!=='GET'){res.writeHead(405);return res.end();}if(req.headers.origin&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.origin)){res.writeHead(403);return res.end();}res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');if(req.url==='/health')return res.end(JSON.stringify({app:'codex-pulse',pid:process.pid,phase,files:filesCount,scanned,errors,sync,websites:websites.progress,credits:credits.status,mezip:mezip.status,localApps:appsRelay.getStatus()}));if(req.url==='/snapshot')return res.end(JSON.stringify({snapshot}));res.writeHead(404);res.end('{}');});
server.on('error',e=>{console.error(`Collector could not start: ${e.code}`);process.exit(1);});
await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
await writeFile(path.join(dataDir,'service.pid'),String(process.pid));
await accounts.start();await persistSnapshot();console.log(`Codex Pulse collector listening at http://127.0.0.1:${port}`);
const snapshotTimer=setInterval(()=>{persistSnapshot().then(upload).catch(()=>{});},10000);
let timer;
async function cycle(){if(stopping)return;await scanAll().catch(()=>{errors++;});await upload();if(!stopping)timer=setTimeout(cycle,10000);}
cycle();
websites.start();
credits.start();
mezip.start();
let relayRetry;
async function startAppsRelay(){if(stopping)return;try{await appsRelay.start();}catch{console.error('Local apps connection will retry automatically.');if(!stopping)relayRetry=setTimeout(startAppsRelay,15000);}}
startAppsRelay();
function stop(){if(stopping)return;stopping=true;websites.stop();credits.stop();accounts.stop();clearTimeout(timer);clearTimeout(relayRetry);clearInterval(snapshotTimer);server.close();Promise.allSettled([mezip.stop(),appsRelay.stop()]).finally(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);

