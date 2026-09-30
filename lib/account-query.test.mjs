import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {queryEmail,enqueueQuery,claimQuery,finishQuery,queryState,readOfficialHistory,setQueryEnabled} from './account-query.ts';
const email='account1@example.com',other='account3@example.com',now=Date.parse('2026-09-30T02:00:00Z');
function fixture(t){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec("CREATE TABLE quota_official_evidence(email TEXT PRIMARY KEY,payload TEXT NOT NULL,observed_at TEXT NOT NULL); CREATE TABLE quota_official_history(id TEXT PRIMARY KEY,email TEXT NOT NULL,payload TEXT NOT NULL,observed_at TEXT NOT NULL); CREATE TABLE quota_queries(id TEXT PRIMARY KEY,email TEXT,state TEXT,reason TEXT,requested_at INTEGER,started_at INTEGER,finished_at INTEGER,lease_token TEXT,lease_until INTEGER DEFAULT 0,verified_email TEXT,result_code TEXT,fields TEXT DEFAULT '[]'); CREATE TABLE quota_query_control(id INTEGER PRIMARY KEY,enabled INTEGER DEFAULT 1,interval_minutes INTEGER DEFAULT 5,worker_seen_at INTEGER DEFAULT 0,last_attempt_at INTEGER DEFAULT 0)");
 t.after(()=>sqlite.close());
 const db={prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};}};},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 return {db,sqlite};
}
const fields={planType:'plus',windows:[{usedPercent:50,windowDurationMins:300,resetsAt:null},{usedPercent:99,windowDurationMins:10080,resetsAt:null}],resetCredits:{availableCount:0,credits:[]},resetHistory:[],billing:{renewalDate:'2026-10-14',autoRenew:true},balance:'0',locator:{browser:'edge'}};
const receipt=(q,t=now+1000,extra={})=>({leaseToken:q.lease_token,verifiedEmailAfter:email,evidence:{email,verifiedEmail:email,source:'official-page',observedAt:new Date(t).toISOString(),...fields,...extra}});
test('concurrent refresh requests deduplicate; paused background still handles manual queries',async t=>{
 const {db}=fixture(t);assert.throws(()=>queryEmail('outside@example.com'));const [a,b]=await Promise.all([enqueueQuery(db,email,'manual',now),enqueueQuery(db,email,'manual',now)]);assert.equal(a.id,b.id);await setQueryEnabled(db,false);const q=await claimQuery(db,now);assert.equal(q.id,a.id);assert.equal(await claimQuery(db,now+1),null);
});
test('wrong account, account switch and pre-claim evidence cannot change any saved record',async t=>{
 const {db,sqlite}=fixture(t);await enqueueQuery(db,email,'manual',now);const q=await claimQuery(db,now);
 for(const r of [receipt(q,now+1000,{email:other,verifiedEmail:other}),{...receipt(q),verifiedEmailAfter:other},receipt(q,now-2000),receipt(q,now+1000,{source:'official-screenshot'})])await assert.rejects(()=>finishQuery(db,q.id,r,now+2000));
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM quota_official_evidence').get().n,0);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM quota_official_history').get().n,0);
});
test('expired worker receipt is rejected after reclaim and cannot complete a new lease',async t=>{
 const {db,sqlite}=fixture(t);await enqueueQuery(db,email,'manual',now);const old=await claimQuery(db,now),later=now+5*60000,next=await claimQuery(db,later);assert.equal(next.id,old.id);assert.notEqual(next.lease_token,old.lease_token);assert.equal(await finishQuery(db,old.id,receipt(old),later+1000),'conflict');assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM quota_official_history').get().n,0);assert.equal(await finishQuery(db,next.id,receipt(next,later+1000),later+2000),'saved');
});
test('successful zero-card queries persist independent history and are idempotent',async t=>{
 const {db,sqlite}=fixture(t);await enqueueQuery(db,email,'manual',now);const first=await claimQuery(db,now);assert.equal(await finishQuery(db,first.id,receipt(first),now+2000),'saved');assert.equal(await finishQuery(db,first.id,receipt(first),now+3000),'already');await enqueueQuery(db,email,'manual',now+60000);const second=await claimQuery(db,now+60000);assert.equal(await finishQuery(db,second.id,receipt(second,now+61000,{windows:[{usedPercent:75,windowDurationMins:300,resetsAt:null},{usedPercent:99,windowDurationMins:10080,resetsAt:null}]}),now+62000),'saved');assert.equal((await readOfficialHistory(db)).length,2);assert.equal(JSON.parse(sqlite.prepare('SELECT payload FROM quota_official_evidence WHERE email=?').get(email).payload).resetCredits.value.availableCount,0);assert.equal((await queryState(db,now+63000)).queries[0].state,'succeeded');
});
test('partial query retains old fields and their own verification times; failure writes no fresh quota',async t=>{
 const {db,sqlite}=fixture(t);await enqueueQuery(db,email,'manual',now);const first=await claimQuery(db,now);await finishQuery(db,first.id,receipt(first),now+2000);await enqueueQuery(db,email,'manual',now+60000);const second=await claimQuery(db,now+60000),r=receipt(second,now+61000);delete r.evidence.windows;delete r.evidence.billing;delete r.evidence.resetHistory;await finishQuery(db,second.id,r,now+62000);const saved=JSON.parse(sqlite.prepare('SELECT payload FROM quota_official_evidence WHERE email=?').get(email).payload);assert.equal(saved.windows.observedAt,new Date(now+1000).toISOString());assert.equal(saved.billing.observedAt,new Date(now+1000).toISOString());assert.equal((await queryState(db,now+63000)).queries[0].state,'partial');await enqueueQuery(db,email,'manual',now+120000);const third=await claimQuery(db,now+120000);await finishQuery(db,third.id,{leaseToken:third.lease_token,error:'connection_required'},now+121000);assert.equal((await readOfficialHistory(db)).length,2);assert.equal((await queryState(db,now+122000)).queries[0].result_code,'connection_required');
});
test('scheduled query detects current authorized account without trusting desktop identity',async t=>{
 const {db}=fixture(t);const q=await claimQuery(db,now);assert.equal(q.email,null);assert.equal(q.reason,'scheduled');await finishQuery(db,q.id,receipt(q),now+2000);assert.equal(await claimQuery(db,now+10000),null);const next=await claimQuery(db,now+5*60000);assert.equal(next.reason,'scheduled');assert.equal(next.email,null);
});
test('pausing skips queued and expired scheduled queries while retaining manual requests',async t=>{
 const {db}=fixture(t);await enqueueQuery(db,null,'scheduled',now);await setQueryEnabled(db,false);assert.equal(await claimQuery(db,now),null);await enqueueQuery(db,email,'manual',now+1);const manual=await claimQuery(db,now+2);assert.equal(manual.reason,'manual');
});
test('partial immutable observation wins over same-time synthesized merged history',async t=>{
 const {db}=fixture(t);await enqueueQuery(db,email,'manual',now);const q=await claimQuery(db,now),r=receipt(q);delete r.evidence.planType;delete r.evidence.resetCredits;delete r.evidence.billing;delete r.evidence.resetHistory;delete r.evidence.balance;await finishQuery(db,q.id,r,now+2000);
 const raw=(await readOfficialHistory(db))[0],synthetic={...raw,planType:'plus',resetCredits:{availableCount:2,credits:[]}};
 const ui=[...new Map([synthetic,raw].map(p=>[`${p.source}:${p.observedAt}`,p])).values()];assert.equal(ui[0].planType,null);assert.equal(ui[0].resetCredits,null);
});
