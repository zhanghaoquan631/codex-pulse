import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {InvalidQuotaEvidence,applyQuotaEvidence,mergeQuotaEvidence,officialFieldStamp,overlaySnapshotEvidence,parseQuotaEvidenceInput,parseStoredQuotaEvidence,storeQuotaEvidence} from './quota-evidence.ts';

const email='fixture@example.com',at=hour=>`2026-09-20T${String(hour).padStart(2,'0')}:00:00.000Z`;
const evidence=(hour,fields)=>parseQuotaEvidenceInput({email,verifiedEmail:email,source:'official-page',observedAt:at(hour),...fields},Infinity);
const cards={availableCount:1,credits:[{title:'Full reset',status:'available',expiresAt:null,expiresDateLabel:'10月23日',grantedAt:null}]};
const locator={browser:'iab',providerTabId:'synthetic_private_tab',usageUrl:'https://chatgpt.com/settings/usage?tab=overview',accountUrl:'https://chatgpt.com/settings/account'};
const profile=()=>({email,observedAt:at(8),source:'account-api',planType:'free',windows:[{usedPercent:20,windowDurationMins:10080,resetsAt:1790000000}],resetCredits:{availableCount:0,credits:[]},balance:'4',subscription:{activeFrom:null,activeUntil:null,checkedAt:null}});
function fixture(t){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE quota_official_evidence(email TEXT PRIMARY KEY,payload TEXT NOT NULL,observed_at TEXT NOT NULL)');t.after(()=>sqlite.close());let hook;
  return {db:{prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return sqlite.prepare(sql).get(...args)||null;},async run(){if(hook){const run=hook;hook=null;run(sqlite);}return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};}};}},read:()=>parseStoredQuotaEvidence(sqlite.prepare('SELECT payload FROM quota_official_evidence WHERE email=?').get(email).payload),onWrite(fn){hook=fn;}};
}
test('only verified matching identities, precise ISO timestamps and fixed official URLs are accepted',()=>{
  for(const fields of [{verifiedEmail:'other@example.com',planType:'plus'},{observedAt:'2026-09-20T10:00:00',planType:'plus'},{observedAt:'2026-02-30T10:00:00Z',planType:'plus'},{locator:{...locator,usageUrl:'https://evil.example/'}},{windows:[{usedPercent:0,windowDurationMins:10080,resetsAt:null}]},{windows:[{usedPercent:101,windowDurationMins:10080,resetsAt:null},{usedPercent:0,windowDurationMins:300,resetsAt:null}]},{balance:'secret'},{planType:'plus',password:'do-not-store'}])assert.throws(()=>evidence(9,fields),InvalidQuotaEvidence);
  const valid=evidence(9,{planType:'plus',locator,resetHistory:[{kind:'granted',occurredAt:'2026-09-19T12:01:02.123456Z'}]});assert.equal(valid.locator.usageUrl,locator.usageUrl);assert.equal(valid.resetHistory.value[0].occurredAt,'2026-09-19T12:01:02.123Z');
});
test('webpage values preserve timestamp-free expiry labels and original account identity/history',()=>{
  const base=profile(),snapshot={currentAccountEmail:'current@example.com',accountDetails:[base],quotaHistory:[base],daily:[{total:7}]};
  const page=evidence(9,{planType:'plus',resetCredits:cards,windows:[{usedPercent:99,windowDurationMins:10080,resetsAt:null},{usedPercent:0,windowDurationMins:300,resetsAt:null}],balance:'0',locator});
  const result=overlaySnapshotEvidence(snapshot,[page]),p=result.accountDetails[0];
  assert.equal(p.planType,'plus');assert.equal(p.resetCredits.availableCount,1);assert.equal(p.resetCredits.credits[0].expiresAt,null);assert.equal(p.resetCredits.credits[0].expiresDateLabel,'10月23日');assert.equal(p.windows[0].resetsAt,null);assert.equal(p.windows[0].usedPercent,99);assert.equal(p.balance,'0');assert.equal(result.currentAccountEmail,snapshot.currentAccountEmail);assert.deepEqual(result.daily,snapshot.daily);assert.deepEqual(result.quotaHistory[0],base);assert.equal(base.planType,'free');assert.equal(result.quotaHistory.at(-1).source,'official-page');assert.equal(JSON.stringify(result).includes('synthetic_private_tab'),false);
});
test('public boundaries strip browser locators from existing profile and history even without new evidence',()=>{
  const privateProfile=applyQuotaEvidence(profile(),evidence(9,{locator,planType:'plus'}),true),snapshot={accountDetails:[privateProfile],quotaHistory:[privateProfile]};
  assert.equal(JSON.stringify(overlaySnapshotEvidence(snapshot,[],false)).includes('synthetic_private_tab'),false);assert.equal(JSON.stringify(overlaySnapshotEvidence(snapshot,[],true)).includes('synthetic_private_tab'),true);assert.equal(privateProfile.officialEvidence.locator.providerTabId,'synthetic_private_tab');
});
test('field precedence uses its own evidence timestamp and tolerates legacy omitted fields',()=>{
  const original=mergeQuotaEvidence(evidence(9,{planType:'plus'}),evidence(11,{locator})),p=applyQuotaEvidence(undefined,original,true);
  const updated=mergeQuotaEvidence(original,evidence(10,{planType:'pro'}));assert.equal(applyQuotaEvidence(p,updated).planType,'pro');
  const legacy={...profile(),observedAt:at(11)};delete legacy.planType;delete legacy.resetCredits;delete legacy.balance;delete legacy.windows;
  const filled=applyQuotaEvidence(legacy,evidence(9,{planType:'plus',resetCredits:cards,balance:'0',windows:[{usedPercent:0,windowDurationMins:300,resetsAt:null},{usedPercent:20,windowDurationMins:10080,resetsAt:null}]}));assert.equal(filled.planType,'plus');assert.equal(filled.resetCredits.availableCount,1);
  const newer={...profile(),observedAt:at(12)};assert.equal(applyQuotaEvidence(newer,updated).planType,'free');assert.equal(applyQuotaEvidence(newer,evidence(9,{resetCredits:cards})).resetCredits.availableCount,0);
});
test('independent durable table retains partial and stale evidence through concurrent writes',async t=>{
  const f=fixture(t);assert.equal(await storeQuotaEvidence(f.db,evidence(9,{planType:'plus',resetCredits:cards})),'stored');
  f.onWrite(sqlite=>{const next=mergeQuotaEvidence(f.read(),evidence(11,{locator}));sqlite.prepare('UPDATE quota_official_evidence SET payload=?,observed_at=? WHERE email=?').run(JSON.stringify(next),next.observedAt,email);});
  assert.equal(await storeQuotaEvidence(f.db,evidence(10,{balance:'0'})),'stored');assert.equal(f.read().plan.value,'plus');assert.equal(f.read().balance.value,'0');assert.equal(f.read().resetCredits.value.credits[0].expiresAt,null);assert.equal(f.read().locator.verifiedAt,at(11));
  assert.equal(await storeQuotaEvidence(f.db,evidence(8,{planType:'free'})),'stale');assert.equal(f.read().plan.value,'plus');
});
test('official reset history is separate from quota windows and accumulated without losing previous events',()=>{
  const first=evidence(9,{resetHistory:[{kind:'granted',occurredAt:at(1)}]}),next=evidence(10,{resetHistory:[{kind:'redeemed',occurredAt:at(2)}]});
  const merged=mergeQuotaEvidence(first,next);assert.equal(merged.resetHistory.value.length,2);assert.equal(merged.windows,undefined);assert.equal(merged.balance,undefined);assert.deepEqual(parseStoredQuotaEvidence(JSON.stringify(merged)),merged);
});
test('billing keeps strict calendar dates without fabricating midnight or a timezone',()=>{
  const ended=evidence(11,{billing:{periodEndDate:'2026-10-14',autoRenew:false}});assert.equal(ended.billing.value.renewalDate,undefined);assert.equal(ended.billing.value.periodEndDate,'2026-10-14');
  assert.throws(()=>evidence(11,{billing:{periodEndDate:'2026-10-14',autoRenew:true}}),InvalidQuotaEvidence);
  for(const renewalDate of ['2026-02-29','2026-02-30','2026-04-31','1900-02-29','2026-00-14','2026-13-01','2026-10-00','2026-10-32','2026-1-4','2026/10/14','2026-10-14T00:00:00Z','2026-10-14Z',null])assert.throws(()=>evidence(11,{source:'official-screenshot',billing:{renewalDate,autoRenew:true}}),InvalidQuotaEvidence);
  for(const renewalDate of ['2024-02-29','2000-02-29','2026-10-14']){const valid=evidence(11,{source:'official-screenshot',billing:{renewalDate,autoRenew:true}});assert.equal(valid.billing.value.renewalDate,renewalDate);assert.equal(valid.billing.value.autoRenew,true);assert.equal(valid.billing.source,'official-screenshot');assert.equal(valid.billing.observedAt,at(11));assert.equal(Object.keys(valid.billing.value).length,2);}
  for(const billing of [{renewalDate:'2026-10-14',autoRenew:'true'},{renewalDate:'2026-10-14'},{renewalDate:'2026-10-14',autoRenew:true,expiresAt:1790000000}])assert.throws(()=>evidence(11,{billing}),InvalidQuotaEvidence);
  assert.equal(evidence(11,{source:'official-page',billing:{renewalDate:'2026-10-14',autoRenew:false}}).billing.value.autoRenew,false);
});
test('billing merges independently and preserves old card, quota and reset history provenance',()=>{
  const page=evidence(9,{planType:'plus',resetCredits:cards,resetHistory:[{kind:'granted',occurredAt:at(1)}],windows:[{usedPercent:99,windowDurationMins:10080,resetsAt:null},{usedPercent:0,windowDurationMins:300,resetsAt:null}]}),bill=evidence(11,{source:'official-screenshot',billing:{renewalDate:'2026-10-14',autoRenew:true}});
  const merged=mergeQuotaEvidence(page,bill);assert.equal(merged.billing.observedAt,at(11));assert.equal(merged.billing.source,'official-screenshot');assert.equal(merged.resetCredits.observedAt,at(9));assert.equal(merged.resetCredits.source,'official-page');assert.equal(merged.windows.observedAt,at(9));assert.equal(merged.resetHistory.observedAt,at(9));assert.equal(merged.resetHistory.source,'official-page');
  const legacyPage=structuredClone(page);delete legacyPage.resetCredits.source;delete legacyPage.windows.source;const legacyMerged=mergeQuotaEvidence(legacyPage,bill);assert.equal(legacyMerged.resetCredits.source,'official-page');assert.equal(legacyMerged.windows.source,'official-page');assert.equal(legacyPage.resetCredits.source,undefined);
  const stale=mergeQuotaEvidence(merged,evidence(10,{source:'official-page',billing:{renewalDate:'2026-10-01',autoRenew:false}}));assert.deepEqual(stale.billing,merged.billing);
  const next=mergeQuotaEvidence(stale,evidence(12,{source:'official-page',billing:{renewalDate:'2026-11-14',autoRenew:true}}));assert.equal(next.billing.value.renewalDate,'2026-11-14');assert.equal(next.billing.source,'official-page');assert.deepEqual(next.resetCredits,page.resetCredits);assert.deepEqual(parseStoredQuotaEvidence(JSON.stringify(next)),next);
});
test('billing-only overlay preserves live observation, subscription and quota history timestamps',()=>{
  const base={...profile(),subscription:{activeFrom:at(1),activeUntil:'2026-10-20T15:30:00Z',checkedAt:at(8)}},snapshot={currentAccountEmail:'current@example.com',accountDetails:[base],quotaHistory:[base]};
  const page=evidence(9,{planType:'plus',resetCredits:cards}),bill=evidence(11,{source:'official-screenshot',billing:{renewalDate:'2026-10-14',autoRenew:true}}),merged=mergeQuotaEvidence(page,bill);
  const view=overlaySnapshotEvidence(snapshot,[merged]),p=view.accountDetails[0];assert.equal(p.source,base.source);assert.equal(p.observedAt,base.observedAt);assert.deepEqual(p.subscription,base.subscription);assert.equal(officialFieldStamp(p,'billing'),at(11));assert.equal(officialFieldStamp(p,'resetCredits'),at(9));assert.equal(view.quotaHistory.some(row=>row.observedAt===at(11)),false);assert.equal(view.quotaHistory.filter(row=>row.source==='official-page')[0].observedAt,at(9));
  const newerApi={...base,observedAt:at(12)},next=overlaySnapshotEvidence({...snapshot,accountDetails:[newerApi]},[merged]).accountDetails[0];assert.equal(next.observedAt,at(12));assert.equal(next.planType,newerApi.planType);assert.deepEqual(next.subscription,newerApi.subscription);assert.equal(next.officialEvidence.billing.value.renewalDate,'2026-10-14');
  assert.equal(overlaySnapshotEvidence(snapshot,[bill]).quotaHistory.length,snapshot.quotaHistory.length);assert.equal(applyQuotaEvidence(p,evidence(13,{locator})).officialEvidence.billing.value.renewalDate,'2026-10-14');
});
test('billing survives persistent parsing and later partial collector evidence writes',async t=>{
  const f=fixture(t),legacy=evidence(9,{planType:'plus',resetCredits:cards});delete legacy.plan.source;delete legacy.resetCredits.source;
  assert.equal(await storeQuotaEvidence(f.db,legacy),'stored');assert.equal(f.read().resetCredits.source,'official-page');
  const bill=evidence(11,{source:'official-screenshot',billing:{renewalDate:'2026-10-14',autoRenew:true}});assert.equal(await storeQuotaEvidence(f.db,bill),'stored');assert.equal(await storeQuotaEvidence(f.db,evidence(12,{balance:'0'})),'stored');
  assert.equal(f.read().billing.value.renewalDate,'2026-10-14');assert.equal(f.read().billing.source,'official-screenshot');assert.equal(f.read().billing.observedAt,at(11));assert.equal(f.read().resetCredits.observedAt,at(9));assert.equal(f.read().resetCredits.source,'official-page');assert.equal(await storeQuotaEvidence(f.db,evidence(10,{billing:{renewalDate:'2026-10-01',autoRenew:false}})),'stale');
  for(const badBilling of [{...bill.billing,value:{renewalDate:'2026-02-30',autoRenew:true}},{...bill.billing,source:'unverified'},{...bill.billing,source:undefined},{...bill.billing,observedAt:at(13)},null])assert.throws(()=>parseStoredQuotaEvidence(JSON.stringify({...bill,billing:badBilling})),InvalidQuotaEvidence);
});
