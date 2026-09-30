import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readdir,stat,readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash} from 'node:crypto';
import os from 'node:os';import path from 'node:path';
import {accountEmail} from '../lib/account-label.ts';
import {readQuotaIdentity,quotaProfile,saveQuotaProfile,initializeQuota} from './quota.mjs';

async function codexExecutable(){
 if(process.env.PULSE_CODEX_EXECUTABLE)return process.env.PULSE_CODEX_EXECUTABLE;
 const directory=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'OpenAI','Codex','bin');
 const entries=await readdir(directory,{withFileTypes:true}),candidates=[];
 for(const entry of entries){if(!entry.isDirectory())continue;const file=path.join(directory,entry.name,'codex.exe');try{candidates.push({file,mtime:(await stat(file)).mtimeMs});}catch{}}
 candidates.sort((a,b)=>b.mtime-a.mtime);if(!candidates.length)throw new Error('Codex executable unavailable');return candidates[0].file;
}
export async function readCreditBalance(){
 const codexRoot=process.env.PULSE_CODEX_HOME||process.env.CODEX_HOME||path.join(os.homedir(),'.codex');
 const beforeIdentity=await readQuotaIdentity(codexRoot);
 const child=spawn(await codexExecutable(),['app-server','--listen','stdio://'],{windowsHide:true,stdio:['pipe','pipe','pipe']});child.stderr.resume();
 const lines=createInterface({input:child.stdout}),pending=new Map();let serial=0;
 function fail(){for(const waiter of pending.values())waiter.reject(new Error('Balance unavailable'));pending.clear();}
 child.on('error',fail);child.on('exit',fail);child.stdin.on('error',fail);
 lines.on('line',line=>{try{const reply=JSON.parse(line),waiter=pending.get(reply.id);if(waiter){pending.delete(reply.id);reply.error?waiter.reject(new Error('Read unavailable')):waiter.resolve(reply.result);}}catch{}});
 const timer=setTimeout(()=>{fail();child.kill();},25000);
 const rpc=(method,params)=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
 try{
  await rpc('initialize',{clientInfo:{name:'codex-pulse-credit-monitor',title:'Codex Pulse credit monitor',version:'1.0.0'},capabilities:{experimentalApi:false}});
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'initialized'})+'\n');
  const account=await rpc('account/read',{refreshToken:false});if(!account.account)return {state:'no-account'};
  const limits=await rpc('account/rateLimits/read',{}),credits=(limits.rateLimitsByLimitId?.codex??limits.rateLimits)?.credits;
  const profile=quotaProfile(account,limits,beforeIdentity,await readQuotaIdentity(codexRoot));
  if(!profile)return {state:'identity-unavailable'};
  const balance=typeof credits?.balance==='string'&&/^\d+(?:\.\d+)?$/.test(credits.balance)?Number(credits.balance):null;
  return {state:'ready',accountId:limits.accountId,email:accountEmail(account.account.email),balance:balance!==null&&Number.isFinite(balance)&&balance<=1e12?balance:null,unlimited:!!credits?.unlimited,profile};
 }finally{clearTimeout(timer);fail();lines.close();child.stdin.end();child.kill();}
}
export class CreditCollector{
 constructor(dataDir,configFile){this.configFile=configFile;this.stopped=false;this.status={state:'unavailable',lastPoll:null,sync:'waiting'};this.db=new DatabaseSync(path.join(dataDir,'credits.sqlite'));
  initializeQuota(this.db);
  this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,label TEXT,balance REAL,unlimited INTEGER,observedAt TEXT); CREATE TABLE IF NOT EXISTS changes(id TEXT PRIMARY KEY,accountId TEXT,beforeBalance REAL,afterBalance REAL,observedAt TEXT,synced INTEGER DEFAULT 0);');
  if(!this.db.prepare('PRAGMA table_info(accounts)').all().some(column=>column.name==='baseline')){this.db.exec('ALTER TABLE accounts ADD COLUMN baseline REAL; UPDATE accounts SET baseline=balance WHERE unlimited=0;');}
  let salt=this.db.prepare("SELECT value FROM meta WHERE key='salt'").get()?.value;if(!salt){salt=randomBytes(32).toString('hex');this.db.prepare("INSERT INTO meta VALUES ('salt',?)").run(salt);}this.salt=salt;
 }
 observe(sample,stamp=new Date().toISOString()){
  this.status.state=sample.state;this.status.lastPoll=stamp;if(sample.state!=='ready'||!sample.accountId)return;
  saveQuotaProfile(this.db,sample.profile);
  const id=createHash('sha256').update(this.salt+'\0'+sample.accountId).digest('hex'),before=this.db.prepare('SELECT * FROM accounts WHERE id=?').get(id);
  this.db.exec('BEGIN');try{
   if(before&&before.baseline!==null&&sample.balance!==null&&!sample.unlimited&&before.baseline!==sample.balance){const key=createHash('sha256').update(JSON.stringify([id,stamp,before.baseline,sample.balance])).digest('hex');this.db.prepare('INSERT OR IGNORE INTO changes (id,accountId,beforeBalance,afterBalance,observedAt) VALUES (?,?,?,?,?)').run(key,id,before.baseline,sample.balance,stamp);}
   const label=accountEmail(sample.email)||before?.label||'账号 '+(this.db.prepare('SELECT COUNT(*) n FROM accounts').get().n+1);
   const baseline=sample.unlimited?null:sample.balance??before?.baseline??null;
   this.db.prepare('INSERT INTO accounts (id,label,balance,unlimited,observedAt,baseline) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,balance=excluded.balance,unlimited=excluded.unlimited,observedAt=excluded.observedAt,baseline=excluded.baseline').run(id,label,sample.balance,sample.unlimited?1:0,stamp,baseline);
   this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 async upload(){try{const config=JSON.parse((await readFile(this.configFile,'utf8')).replace(/^\uFEFF/,'')),url=new URL('/api/ledger/sync',config.siteUrl);if(url.protocol!=='https:'||!config.ingestToken)throw new Error('Not configured');
  for(let batch=0;batch<20&&!this.stopped;batch++){
   const changes=this.db.prepare('SELECT id,accountId,beforeBalance,afterBalance,observedAt FROM changes WHERE synced=0 ORDER BY observedAt LIMIT 40').all();
   const selected=new Map();for(const change of changes){const account=this.db.prepare('SELECT * FROM accounts WHERE id=?').get(change.accountId);if(account)selected.set(account.id,account);}for(const account of this.db.prepare('SELECT * FROM accounts ORDER BY observedAt DESC LIMIT 40').all())if(selected.size<40)selected.set(account.id,account);
   const headers={'Content-Type':'application/json',Authorization:`Bearer ${config.ingestToken}`};if(config.sitesToken)headers['OAI-Sites-Authorization']=`Bearer ${config.sitesToken}`;
   const accounts=[...selected.values()].map(({id,label,balance,unlimited,observedAt})=>({id,label,balance,unlimited,observedAt}));
   const response=await fetch(url,{method:'POST',headers,body:JSON.stringify({accounts,changes,status:this.status}),redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!response.ok){this.status.sync=`http-${response.status}`;return;}if(!(await response.json()).ok)throw new Error('Invalid reply');
   for(const change of changes)this.db.prepare('UPDATE changes SET synced=1 WHERE id=?').run(change.id);this.status.sync='synced';if(changes.length<40)break;
  }
 }catch{this.status.sync='network-error';}}
 async cycle(){if(this.stopped)return;try{this.observe(await readCreditBalance());}catch{this.status.state='unavailable';this.status.lastPoll=new Date().toISOString();}await this.upload();if(!this.stopped)this.timer=setTimeout(()=>this.cycle(),60000);}
 start(){this.cycle();}
 profiles(){return this.db.prepare('SELECT payload FROM quota_profiles ORDER BY email').all().map(row=>JSON.parse(row.payload));}
 history(){return this.db.prepare('SELECT payload FROM (SELECT payload,observedAt,ROW_NUMBER() OVER(PARTITION BY email ORDER BY observedAt DESC) position FROM quota_history) WHERE position<=60 ORDER BY observedAt DESC LIMIT 600').all().map(row=>JSON.parse(row.payload));}
 stop(){this.stopped=true;clearTimeout(this.timer);}
}
