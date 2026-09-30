import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {accountEmail} from '../lib/account-label.ts';

// Read only identity claims in memory. Never persist or upload authentication tokens.
export async function readLoginIdentity(codexRoot){
 const file=path.join(codexRoot,'auth.json'),before=await stat(file);
 const auth=JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,'')),after=await stat(file);
 if(before.mtimeMs!==after.mtimeMs||before.size!==after.size)return null;
 if(auth.auth_mode!=='chatgpt'||!auth.tokens?.account_id||typeof auth.tokens.id_token!=='string')return null;
 const claims=JSON.parse(Buffer.from(auth.tokens.id_token.split('.')[1]||'','base64url').toString('utf8'));
 const email=accountEmail(claims.email)?.toLowerCase();if(!email)return null;
 return {email,generation:`${after.ino}:${after.size}:${after.mtimeMs}`};
}

export class AccountTracker{
 constructor(db,codexRoot,salt){
  this.db=db;this.codexRoot=codexRoot;this.salt=salt;this.current=null;this.busy=false;this.stopped=false;
  db.exec('CREATE TABLE IF NOT EXISTS token_accounts(id TEXT PRIMARY KEY,email TEXT NOT NULL,lastSeen TEXT NOT NULL); CREATE TABLE IF NOT EXISTS account_intervals(id INTEGER PRIMARY KEY,accountId TEXT NOT NULL,start TEXT NOT NULL,end TEXT NOT NULL); CREATE INDEX IF NOT EXISTS account_intervals_time ON account_intervals(start,end);');
 }
 observe(identity,stamp=new Date().toISOString()){
  const email=accountEmail(identity?.email)?.toLowerCase();
  if(!email){this.current=null;return;}
  const id=createHash('sha256').update(this.salt+'\0email\0'+email).digest('hex'),previous=this.current;
  // Only extend uninterrupted observations. Restart, sleep, refresh or login changes leave a gap.
  const continuous=previous&&previous.id===id&&previous.generation===identity.generation&&Date.parse(stamp)-Date.parse(previous.end)<=10000&&stamp>=previous.end;
  this.db.prepare('INSERT INTO token_accounts VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,lastSeen=excluded.lastSeen').run(id,email,stamp);
  if(continuous){this.db.prepare('UPDATE account_intervals SET end=? WHERE id=?').run(stamp,previous.interval);this.current={...previous,end:stamp};}
  else{const result=this.db.prepare('INSERT INTO account_intervals(accountId,start,end) VALUES (?,?,?)').run(id,stamp,stamp);this.current={id,generation:identity.generation,interval:Number(result.lastInsertRowid),end:stamp};}
 }
 assignPending(){
  // Both request start and usage timestamp must fall inside one observed login interval.
  this.db.exec("UPDATE events SET accountId=(SELECT i.accountId FROM account_intervals i WHERE i.start<=events.turnTime AND i.end>=events.time ORDER BY i.start DESC LIMIT 1) WHERE accountId IS NULL AND turnTime IS NOT NULL AND time>=turnTime AND time>=(SELECT MIN(start) FROM account_intervals);");
 }
 async poll(){if(this.busy||this.stopped)return;this.busy=true;try{this.observe(await readLoginIdentity(this.codexRoot));}catch{this.current=null;}finally{this.busy=false;}}
 async start(){await this.poll();this.timer=setInterval(()=>this.poll(),2000);}
 stop(){this.stopped=true;clearInterval(this.timer);}
}
