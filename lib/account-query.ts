import {parseQuotaEvidenceInput,parseStoredQuotaEvidence,mergeQuotaEvidence,quotaEvidenceProfile} from './quota-evidence.ts';
import type {OfficialQuotaEvidence} from './quota';

export const queryAccounts=['account1@example.com','account2@example.com','account3@example.com','account4@example.com','account6@example.com','account5@example.com'];
export const queryMessages:Record<string,string>={connection_required:'官方浏览器连接不可用，请重新连接 Edge。',login_required:'官方登录已失效，请在 Edge 完成登录。',account_mismatch:'Edge 当前登录邮箱与所选账号不同，原记录已保留。',account_changed:'查询过程中账号已切换，原记录已保留。',page_unavailable:'官方页面暂时无法读取，原记录已保留。',partial:'已保存本次读到的字段；其余字段保留原核验时间。',success:'官网查询已保存。',expired:'查询超时，原记录已保留。'};
export type AccountQuery={id:string;email:string|null;state:string;reason:string;requested_at:number;started_at:number|null;finished_at:number|null;lease_until:number;verified_email:string|null;result_code:string|null;fields:string;message?:string};
export type QueryControl={enabled:number;interval_minutes:number;worker_seen_at:number;last_attempt_at:number};
type Row=AccountQuery&{lease_token:string|null};
type DB=Pick<D1Database,'prepare'|'batch'>;
export class InvalidAccountQuery extends Error{}
const fail=()=>{throw new InvalidAccountQuery('Invalid account query');};
export function queryEmail(value:unknown):string|null{if(value===null||value===undefined)return null;if(typeof value!=='string')return fail();const email=value.toLowerCase();if(!queryAccounts.includes(email))return fail();return email;}
export async function queryState(db:DB,now=Date.now()){
 const control=await db.prepare('SELECT enabled,interval_minutes,worker_seen_at,last_attempt_at FROM quota_query_control WHERE id=1').first<QueryControl>()||{enabled:1,interval_minutes:5,worker_seen_at:0,last_attempt_at:0};
 const rows=await db.prepare('SELECT id,email,state,reason,requested_at,started_at,finished_at,lease_until,verified_email,result_code,fields FROM quota_queries ORDER BY requested_at DESC LIMIT 40').all<AccountQuery>();
 return {control,workerOnline:control.worker_seen_at>now-2*control.interval_minutes*60000,queries:rows.results.map(row=>({...row,message:row.result_code?queryMessages[row.result_code]:undefined}))};
}
export async function enqueueQuery(db:DB,email:string|null,reason='manual',now=Date.now()){
 email=queryEmail(email);
 const id=crypto.randomUUID();
 // A single statement makes concurrent double-clicks converge on the same pending query.
 await db.prepare("INSERT INTO quota_queries(id,email,state,reason,requested_at) SELECT ?,?,'queued',?,? WHERE NOT EXISTS(SELECT 1 FROM quota_queries WHERE email IS ? AND state IN ('queued','running'))").bind(id,email,reason,now,email).run();
 const row=await db.prepare("SELECT id,email,state,reason,requested_at FROM quota_queries WHERE email IS ? AND state IN ('queued','running') ORDER BY requested_at LIMIT 1").bind(email).first();
 if(!row)throw new Error('Query unavailable');return row;
}
export async function setQueryEnabled(db:DB,enabled:boolean){
 if(typeof enabled!=='boolean')fail();
 await db.prepare('INSERT INTO quota_query_control(id,enabled) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled').bind(enabled?1:0).run();
}
export async function claimQuery(db:DB,now=Date.now()){
 await db.prepare('INSERT INTO quota_query_control(id,worker_seen_at) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET worker_seen_at=excluded.worker_seen_at').bind(now).run();
 await db.prepare("UPDATE quota_queries SET state='queued',lease_token=NULL,lease_until=0 WHERE state='running' AND lease_until<=?").bind(now).run();
 await db.prepare("UPDATE quota_queries SET state='blocked',result_code='expired',finished_at=? WHERE state='queued' AND requested_at<?").bind(now,now-30*60000).run();
 const state=await queryState(db,now);
 const pending=await db.prepare("SELECT id FROM quota_queries WHERE state='queued' AND (reason='manual' OR EXISTS(SELECT 1 FROM quota_query_control WHERE id=1 AND enabled=1)) ORDER BY requested_at LIMIT 1").first<{id:string}>();
 if(!pending&&state.control.enabled&&now-state.control.last_attempt_at>=state.control.interval_minutes*60000)await enqueueQuery(db,null,'scheduled',now);
 const token=crypto.randomUUID();
 // Only one lease may run across browser sessions; an old receipt cannot write after a new claim.
 await db.prepare("UPDATE quota_queries SET state='running',started_at=?,lease_token=?,lease_until=? WHERE id=(SELECT id FROM quota_queries WHERE state='queued' AND (reason='manual' OR EXISTS(SELECT 1 FROM quota_query_control WHERE id=1 AND enabled=1)) ORDER BY CASE reason WHEN 'manual' THEN 0 ELSE 1 END,requested_at LIMIT 1) AND state='queued' AND NOT EXISTS(SELECT 1 FROM quota_queries WHERE state='running')").bind(now,token,now+4*60000).run();
 const query=await db.prepare('SELECT * FROM quota_queries WHERE lease_token=?').bind(token).first<Row>();
 if(query)await db.prepare('UPDATE quota_query_control SET last_attempt_at=? WHERE id=1').bind(now).run();
 return query;
}
export function parseQueryReceipt(query:Row,input:Record<string,unknown>,now=Date.now()){
 if(typeof input.leaseToken!=='string'||input.leaseToken!==query.lease_token)fail();
 if(input.error!==undefined){if(typeof input.error!=='string'||!['connection_required','login_required','account_mismatch','account_changed','page_unavailable'].includes(input.error)||input.evidence!==undefined)fail();return {error:input.error,evidence:null,fields:[] as string[],complete:false};}
 const evidence=parseQuotaEvidenceInput(input.evidence,now);
 if(evidence.source!=='official-page'||!queryAccounts.includes(evidence.email)||(query.email&&query.email!==evidence.email)||input.verifiedEmailAfter!==evidence.email||!query.started_at||Date.parse(evidence.observedAt)<query.started_at-1000||evidence.locator?.browser!=='edge')fail();
 const fields=['plan','windows','balance','resetCredits','resetHistory','billing'].filter(key=>!!evidence[key as keyof OfficialQuotaEvidence]);
 if(!fields.length)fail();
 return {error:null,evidence,fields,complete:['plan','windows','resetCredits','resetHistory','billing'].every(key=>fields.includes(key))};
}
export async function finishQuery(db:DB,id:string,input:Record<string,unknown>,now=Date.now()){
 const query=await db.prepare('SELECT * FROM quota_queries WHERE id=?').bind(id).first<Row>();
 if(!query||query.lease_token!==input.leaseToken)return 'conflict';
 if(query.state!=='running')return ['succeeded','partial','blocked'].includes(query.state)?'already':'conflict';
 if(query.lease_until<=now)return 'conflict';
 const receipt=parseQueryReceipt(query,input,now);
 if(receipt.error){const result=await db.prepare("UPDATE quota_queries SET state='blocked',finished_at=?,result_code=? WHERE id=? AND state='running' AND lease_token=? AND lease_until>?").bind(now,receipt.error,id,input.leaseToken,now).run();return result.meta.changes===1?'saved':'conflict';}
 const evidence=receipt.evidence!,gate="EXISTS(SELECT 1 FROM quota_queries WHERE id=? AND state='running' AND lease_token=? AND lease_until>?)";
 for(let retry=0;retry<5;retry++){
  const old=await db.prepare('SELECT payload,observed_at FROM quota_official_evidence WHERE email=?').bind(evidence.email).first<{payload:string;observed_at:string}>();
  const merged=mergeQuotaEvidence(old?parseStoredQuotaEvidence(old.payload):undefined,evidence),payload=JSON.stringify(merged);
  const write=old?db.prepare(`UPDATE quota_official_evidence SET payload=?,observed_at=? WHERE email=? AND payload=? AND observed_at=? AND ${gate}`).bind(payload,merged.observedAt,evidence.email,old.payload,old.observed_at,id,input.leaseToken,now):
   db.prepare(`INSERT OR IGNORE INTO quota_official_evidence(email,payload,observed_at) SELECT ?,?,? WHERE ${gate}`).bind(evidence.email,payload,merged.observedAt,id,input.leaseToken,now);
  const saved="EXISTS(SELECT 1 FROM quota_official_evidence WHERE email=? AND payload=?)";
  const history=db.prepare(`INSERT OR IGNORE INTO quota_official_history(id,email,payload,observed_at) SELECT ?,?,?,? WHERE ${gate} AND ${saved}`).bind(id,evidence.email,JSON.stringify(evidence),evidence.observedAt,id,input.leaseToken,now,evidence.email,payload);
  const done=db.prepare(`UPDATE quota_queries SET state=?,finished_at=?,verified_email=?,result_code=?,fields=? WHERE id=? AND state='running' AND lease_token=? AND lease_until>? AND ${saved}`).bind(receipt.complete?'succeeded':'partial',now,evidence.email,receipt.complete?'success':'partial',JSON.stringify(receipt.fields),id,input.leaseToken,now,evidence.email,payload);
  const results=await db.batch([write,history,done]);if(results[2].meta.changes===1)return 'saved';
 }
 return 'conflict';
}
export async function readOfficialHistory(db:Pick<D1Database,'prepare'>){
 const rows=await db.prepare('SELECT payload FROM (SELECT payload,observed_at,ROW_NUMBER() OVER(PARTITION BY email ORDER BY observed_at DESC,id DESC) AS rank FROM quota_official_history) WHERE rank<=60 ORDER BY observed_at DESC').all<{payload:string}>();
 return rows.results.flatMap(row=>{try{const e=parseStoredQuotaEvidence(row.payload);return [{...quotaEvidenceProfile(e),officialEvidence:e,officialFields:[] as never[]}];}catch{return [];}});
}
