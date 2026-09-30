import type {OfficialAccountLocator,OfficialBillingEvidence,OfficialEvidenceSource,OfficialQuotaEvidence,OfficialQuotaField,OfficialResetHistoryEntry,QuotaProfile,QuotaResetCredits,QuotaWindow} from './quota';

export class InvalidQuotaEvidence extends Error {}
const usageUrl='https://chatgpt.com/settings/usage?tab=overview',accountUrl='https://chatgpt.com/';
const usageUrls=new Set([usageUrl,'https://chatgpt.com/codex/settings/usage']),accountUrls=new Set([accountUrl,'https://chatgpt.com/settings/account']);
const plans=new Set(['free','go','plus','pro','team','business','enterprise','edu','unknown']);
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function invalid():never{throw new InvalidQuotaEvidence('Invalid official account evidence');}
function email(value:unknown){if(typeof value!=='string'||value.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))invalid();return value.toLowerCase();}
function dateOnly(value:unknown):string{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))invalid();
  const year=Number(value.slice(0,4)),month=Number(value.slice(5,7)),day=Number(value.slice(8,10)),days=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  if(month<1||month>12||day<1||day>days[month-1])invalid();return value;
}
function evidenceSource(value:unknown):OfficialEvidenceSource{if(value!=='official-page'&&value!=='official-screenshot')invalid();return value;}
function stamp(value:unknown){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)||!Number.isFinite(Date.parse(value)))invalid();
  dateOnly(value.slice(0,10));return new Date(value).toISOString();
}
function text(value:unknown,max:number):string|null{if(value===null||value===undefined)return null;if(typeof value!=='string'||value.length>max||/[\u0000-\u001f]/.test(value))invalid();return value;}
function seconds(value:unknown):number|null{if(value===null||value===undefined)return null;if(typeof value!=='number'||!Number.isSafeInteger(value)||value<=0||value>253402300799)invalid();return value;}
function keys(value:Record<string,unknown>,allowed:string[]){if(Object.keys(value).some(key=>!allowed.includes(key)))invalid();}
function billing(value:unknown):OfficialBillingEvidence['value']{
  if(!record(value))invalid();keys(value,['renewalDate','periodEndDate','autoRenew']);
  if(typeof value.autoRenew!=='boolean'||(value.renewalDate===undefined&&value.periodEndDate===undefined)||(value.autoRenew&&value.renewalDate===undefined))invalid();
  return {...(value.renewalDate!==undefined?{renewalDate:dateOnly(value.renewalDate)}:{}),...(value.periodEndDate!==undefined?{periodEndDate:dateOnly(value.periodEndDate)}:{}),autoRenew:value.autoRenew};
}
function resetCredits(value:unknown):QuotaResetCredits{
  if(!record(value))invalid();keys(value,['availableCount','credits']);
  if(typeof value.availableCount!=='number'||!Number.isInteger(value.availableCount)||value.availableCount<0||value.availableCount>1000)invalid();
  if(value.credits!==null&&(!Array.isArray(value.credits)||value.credits.length>50))invalid();
  const credits=value.credits===null?null:(value.credits as unknown[]).map(raw=>{
    if(!record(raw))invalid();keys(raw,['title','description','resetType','status','expiresAt','expiresDateLabel','noExpiry','grantedAt']);
    const title=text(raw.title,120),description=text(raw.description,300),status=text(raw.status,20),resetType=text(raw.resetType,40),expiresAt=seconds(raw.expiresAt),grantedAt=seconds(raw.grantedAt);
    if(status!==null&&!['available','redeemed','redeeming','unknown'].includes(status))invalid();
    if(resetType!==null&&!['codexRateLimits','unknown'].includes(resetType))invalid();
    if(raw.noExpiry!==undefined&&typeof raw.noExpiry!=='boolean')invalid();
    let expiresDateLabel:string|undefined;
    if(raw.expiresDateLabel!==undefined){if(typeof raw.expiresDateLabel!=='string'||!/^(?:\d{4}年)?(?:[1-9]|1[0-2])月(?:[1-9]|[12]\d|3[01])日$/.test(raw.expiresDateLabel))invalid();expiresDateLabel=raw.expiresDateLabel;}
    if((expiresAt!==null&&expiresDateLabel)||(raw.noExpiry===true&&(expiresAt!==null||expiresDateLabel)))invalid();
    return {title,...(description?{description}:{}),status,...(resetType?{resetType}:{}),expiresAt,...(expiresDateLabel?{expiresDateLabel}:{}),...(raw.noExpiry!==undefined?{noExpiry:raw.noExpiry}:{}),grantedAt};
  });
  if(credits&&credits.filter(c=>c.status==='available').length>value.availableCount)invalid();
  return {availableCount:value.availableCount,credits};
}
function resetHistory(value:unknown):OfficialResetHistoryEntry[]{
  if(!Array.isArray(value)||value.length>100)invalid();
  return value.map(raw=>{if(!record(raw))invalid();keys(raw,['kind','occurredAt']);if(raw.kind!=='granted'&&raw.kind!=='redeemed')invalid();return {kind:raw.kind,occurredAt:stamp(raw.occurredAt)};});
}
function windows(value:unknown):QuotaWindow[]{
  if(!Array.isArray(value)||value.length!==2)invalid();
  const result=value.map(raw=>{if(!record(raw))invalid();keys(raw,['usedPercent','windowDurationMins','resetsAt']);if((raw.windowDurationMins!==300&&raw.windowDurationMins!==10080)||typeof raw.usedPercent!=='number'||!Number.isFinite(raw.usedPercent)||raw.usedPercent<0||raw.usedPercent>100)invalid();return {usedPercent:raw.usedPercent,windowDurationMins:raw.windowDurationMins,resetsAt:seconds(raw.resetsAt)};});
  if(new Set(result.map(row=>row.windowDurationMins)).size!==result.length)invalid();return result;
}
function locator(value:unknown,verifiedAt:string):OfficialAccountLocator{
  if(!record(value))invalid();keys(value,['usageUrl','accountUrl','browser','providerTabId','extensionInstanceId','browserProfileName']);
  if(value.usageUrl!==undefined&&(typeof value.usageUrl!=='string'||!usageUrls.has(value.usageUrl)))invalid();
  if(value.accountUrl!==undefined&&(typeof value.accountUrl!=='string'||!accountUrls.has(value.accountUrl)))invalid();
  if(value.browser!==undefined&&!['chrome','edge','iab'].includes(value.browser as string))invalid();
  if(value.providerTabId!==undefined&&(typeof value.providerTabId!=='string'||!value.providerTabId.length||value.providerTabId.length>150||!/^[a-zA-Z0-9_:\-.]+$/.test(value.providerTabId)))invalid();
  if(value.extensionInstanceId!==undefined&&(typeof value.extensionInstanceId!=='string'||!/^[a-zA-Z0-9_:\-.]{1,150}$/.test(value.extensionInstanceId)))invalid();
  const browserProfileName=text(value.browserProfileName,120);
  return {usageUrl:typeof value.usageUrl==='string'?value.usageUrl:usageUrl,accountUrl:typeof value.accountUrl==='string'?value.accountUrl:accountUrl,verifiedAt,...(value.browser?{browser:value.browser as OfficialAccountLocator['browser']}:{}),...(value.providerTabId?{providerTabId:value.providerTabId as string}:{}),...(value.extensionInstanceId?{extensionInstanceId:value.extensionInstanceId as string}:{}),...(browserProfileName?{browserProfileName}:{})};
}

/** Only explicitly verified webpage fields are accepted. Date labels never become invented timestamps. */
export function parseQuotaEvidenceInput(input:unknown,now=Date.now()):OfficialQuotaEvidence{
  if(!record(input))invalid();keys(input,['email','verifiedEmail','observedAt','source','planType','windows','balance','resetCredits','resetHistory','billing','locator']);
  const account=email(input.email),verifiedEmail=email(input.verifiedEmail),observedAt=stamp(input.observedAt),source=evidenceSource(input.source);
  if(account!==verifiedEmail||Date.parse(observedAt)>now+300000)invalid();
  const evidence:OfficialQuotaEvidence={email:account,verifiedEmail,observedAt,source};
  if(input.planType!==undefined){if(typeof input.planType!=='string'||!plans.has(input.planType))invalid();evidence.plan={value:input.planType,observedAt,source};}
  if(input.windows!==undefined)evidence.windows={value:windows(input.windows),observedAt,source};
  if(input.balance!==undefined){if(typeof input.balance!=='string'||input.balance.length>30||!/^\d+(?:\.\d+)?$/.test(input.balance))invalid();evidence.balance={value:input.balance,observedAt,source};}
  if(input.resetCredits!==undefined)evidence.resetCredits={value:resetCredits(input.resetCredits),observedAt,source};
  if(input.resetHistory!==undefined)evidence.resetHistory={value:resetHistory(input.resetHistory),observedAt,source};
  if(input.billing!==undefined)evidence.billing={value:billing(input.billing),observedAt,source};
  if(evidence.resetHistory?.value.some(entry=>entry.occurredAt>observedAt))invalid();
  if(input.locator!==undefined)evidence.locator=locator(input.locator,observedAt);
  if(!evidence.plan&&!evidence.windows&&!evidence.balance&&!evidence.resetCredits&&!evidence.resetHistory&&!evidence.billing&&!evidence.locator)invalid();
  return evidence;
}

/** Revalidate persisted evidence too: malformed storage never crosses the snapshot boundary. */
export function parseStoredQuotaEvidence(payload:string):OfficialQuotaEvidence{
  const input:unknown=JSON.parse(payload);if(!record(input))invalid();
  if(input.billing!==undefined&&!record(input.billing))invalid();
  const normalized=parseQuotaEvidenceInput({email:input.email,verifiedEmail:input.verifiedEmail,source:input.source,observedAt:input.observedAt,
    ...(record(input.plan)?{planType:input.plan.value}:{}),...(record(input.windows)?{windows:input.windows.value}:{}),...(record(input.balance)?{balance:input.balance.value}:{}),...(record(input.resetCredits)?{resetCredits:input.resetCredits.value}:{}),...(record(input.resetHistory)?{resetHistory:input.resetHistory.value}:{}),...(record(input.billing)?{billing:input.billing.value}:{}),
    ...(record(input.locator)?{locator:Object.fromEntries(Object.entries(input.locator).filter(([key])=>key!=='verifiedAt'))}:{})},Infinity);
  if(normalized.plan&&record(input.plan))normalized.plan.observedAt=stamp(input.plan.observedAt);
  if(normalized.windows&&record(input.windows))normalized.windows.observedAt=stamp(input.windows.observedAt);
  if(normalized.balance&&record(input.balance))normalized.balance.observedAt=stamp(input.balance.observedAt);
  if(normalized.resetCredits&&record(input.resetCredits))normalized.resetCredits.observedAt=stamp(input.resetCredits.observedAt);
  if(normalized.resetHistory&&record(input.resetHistory))normalized.resetHistory.observedAt=stamp(input.resetHistory.observedAt);
  if(normalized.billing&&record(input.billing)){normalized.billing.observedAt=stamp(input.billing.observedAt);normalized.billing.source=evidenceSource(input.billing.source);}
  for(const field of ['plan','windows','balance','resetCredits','resetHistory'] as const){const value=normalized[field],stored=input[field];if(value&&record(stored))value.source=evidenceSource(stored.source??input.source);}
  if(normalized.locator&&record(input.locator))normalized.locator.verifiedAt=stamp(input.locator.verifiedAt);
  if([normalized.plan?.observedAt,normalized.windows?.observedAt,normalized.balance?.observedAt,normalized.resetCredits?.observedAt,normalized.resetHistory?.observedAt,normalized.billing?.observedAt,normalized.locator?.verifiedAt].some(value=>value&&value>normalized.observedAt))invalid();
  return normalized;
}

export function mergeQuotaEvidence(previous:OfficialQuotaEvidence|undefined,next:OfficialQuotaEvidence):OfficialQuotaEvidence{
  const sourced=(value:OfficialQuotaEvidence):OfficialQuotaEvidence=>({...value,
    ...(value.plan?{plan:{...value.plan,source:value.plan.source??value.source}}:{}),
    ...(value.windows?{windows:{...value.windows,source:value.windows.source??value.source}}:{}),
    ...(value.balance?{balance:{...value.balance,source:value.balance.source??value.source}}:{}),
    ...(value.resetCredits?{resetCredits:{...value.resetCredits,source:value.resetCredits.source??value.source}}:{}),
    ...(value.resetHistory?{resetHistory:{...value.resetHistory,source:value.resetHistory.source??value.source}}:{})});
  next=sourced(next);if(!previous)return next;if(previous.email!==next.email||previous.verifiedEmail!==next.verifiedEmail)invalid();previous=sourced(previous);
  const newer=<T extends {observedAt:string}>(a:T|undefined,b:T|undefined)=>b&&(!a||b.observedAt>a.observedAt)?b:a;
  const history=previous.resetHistory||next.resetHistory?{observedAt:newer(previous.resetHistory,next.resetHistory)!.observedAt,source:newer(previous.resetHistory,next.resetHistory)!.source,value:[...new Map([...(previous.resetHistory?.value||[]),...(next.resetHistory?.value||[])].map(entry=>[`${entry.kind}:${entry.occurredAt}`,entry])).values()].sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).slice(0,100)}:undefined;
  return {email:next.email,verifiedEmail:next.verifiedEmail,source:next.observedAt>previous.observedAt?next.source:previous.source,observedAt:next.observedAt>previous.observedAt?next.observedAt:previous.observedAt,
    ...(newer(previous.plan,next.plan)?{plan:newer(previous.plan,next.plan)}:{}),
    ...(newer(previous.windows,next.windows)?{windows:newer(previous.windows,next.windows)}:{}),
    ...(newer(previous.balance,next.balance)?{balance:newer(previous.balance,next.balance)}:{}),
    ...(newer(previous.resetCredits,next.resetCredits)?{resetCredits:newer(previous.resetCredits,next.resetCredits)}:{}),
    ...(newer(previous.billing,next.billing)?{billing:newer(previous.billing,next.billing)}:{}),
    ...(history?{resetHistory:history}:{}),
    ...(next.locator&&(!previous.locator||next.locator.verifiedAt>previous.locator.verifiedAt)?{locator:next.locator}:previous.locator?{locator:previous.locator}:{})};
}

export function quotaEvidenceProfile(evidence:OfficialQuotaEvidence):QuotaProfile{
  const observedAt=[evidence.plan?.observedAt,evidence.windows?.observedAt,evidence.balance?.observedAt,evidence.resetCredits?.observedAt].filter((value):value is string=>!!value).sort().at(-1)||evidence.observedAt;
  return {email:evidence.email,observedAt,source:'official-page',planType:evidence.plan?.value??null,resetCredits:evidence.resetCredits?.value??null,windows:evidence.windows?.value??[],balance:evidence.balance?.value??null,subscription:null};
}
export function applyQuotaEvidence(profile:QuotaProfile|undefined,evidence:OfficialQuotaEvidence,includeLocator=false):QuotaProfile{
  if(profile&&profile.email.toLowerCase()!==evidence.email)invalid();
  if(profile?.officialEvidence)evidence=mergeQuotaEvidence(profile.officialEvidence,evidence);
  const result={...(profile||quotaEvidenceProfile(evidence))},fields:OfficialQuotaField[]=[];
  const before=(field:OfficialQuotaField)=>officialFieldStamp(profile,field)||profile?.observedAt||'';
  if(evidence.plan&&(!profile||profile.planType==null||evidence.plan.observedAt>=before('planType'))){result.planType=evidence.plan.value;fields.push('planType');}
  if(evidence.resetCredits&&(!profile||profile.resetCredits==null||evidence.resetCredits.observedAt>=before('resetCredits'))){result.resetCredits=evidence.resetCredits.value;fields.push('resetCredits');}
  if(evidence.windows&&(!profile||!profile.windows?.length||evidence.windows.observedAt>=before('windows'))){result.windows=[...evidence.windows.value,...(profile?.windows?.filter(row=>!evidence.windows!.value.some(w=>w.windowDurationMins===row.windowDurationMins))||[])];fields.push('windows');}
  if(evidence.balance&&(!profile||profile.balance==null||evidence.balance.observedAt>=before('balance'))){result.balance=evidence.balance.value;fields.push('balance');}
  if(evidence.billing)fields.push('billing');
  const {locator:privateLocator,...publicEvidence}=evidence;
  result.officialEvidence=includeLocator?evidence:publicEvidence;result.officialFields=fields;
  return result;
}
export function officialFieldStamp(profile:QuotaProfile|undefined,field:OfficialQuotaField){
  if(!profile?.officialFields?.includes(field))return null;
  return (field==='planType'?profile.officialEvidence?.plan:profile.officialEvidence?.[field])?.observedAt??null;
}

type SavedEvidence={payload:string;observed_at:string};
export async function storeQuotaEvidence(db:Pick<D1Database,'prepare'>,next:OfficialQuotaEvidence):Promise<'stored'|'stale'|'conflict'>{
  for(let attempt=0;attempt<5;attempt++){
    const previous=await db.prepare('SELECT payload,observed_at FROM quota_official_evidence WHERE email=?').bind(next.email).first<SavedEvidence>();
    const merged=mergeQuotaEvidence(previous?parseStoredQuotaEvidence(previous.payload):undefined,next),payload=JSON.stringify(parseStoredQuotaEvidence(JSON.stringify(merged)));
    if(previous&&payload===JSON.stringify(parseStoredQuotaEvidence(previous.payload)))return 'stale';
    const result=previous?await db.prepare('UPDATE quota_official_evidence SET payload=?,observed_at=? WHERE email=? AND payload=? AND observed_at=?').bind(payload,merged.observedAt,next.email,previous.payload,previous.observed_at).run()
      :await db.prepare('INSERT OR IGNORE INTO quota_official_evidence(email,payload,observed_at) VALUES(?,?,?)').bind(next.email,payload,merged.observedAt).run();
    if(result.meta.changes===1)return 'stored';
  }
  return 'conflict';
}
export async function readQuotaEvidence(db:Pick<D1Database,'prepare'>){
  const rows=await db.prepare('SELECT payload FROM quota_official_evidence ORDER BY email').all<{payload:string}>();
  return rows.results.flatMap(row=>{try{return [parseStoredQuotaEvidence(row.payload)];}catch{return [];}});
}
export function overlaySnapshotEvidence(snapshot:Record<string,unknown>|null,evidence:OfficialQuotaEvidence[],includeLocator=false){
  if(!snapshot)return snapshot;
  const sanitize=(p:QuotaProfile)=>{if(includeLocator||!p.officialEvidence)return p;const {locator:privateLocator,...publicEvidence}=p.officialEvidence;return {...p,officialEvidence:publicEvidence};};
  const profiles=Array.isArray(snapshot.accountDetails)?(snapshot.accountDetails as QuotaProfile[]).map(sanitize):[],history=Array.isArray(snapshot.quotaHistory)?(snapshot.quotaHistory as QuotaProfile[]).map(sanitize):[];
  const all=new Map(profiles.map(p=>[p.email.toLowerCase(),p]));
  for(const item of evidence)all.set(item.email,applyQuotaEvidence(all.get(item.email),item,includeLocator));
  const additions=[...profiles.filter(p=>evidence.some(item=>item.email===p.email.toLowerCase())),...evidence.filter(item=>item.plan||item.windows||item.balance||item.resetCredits).map(quotaEvidenceProfile)].filter(p=>!history.some(h=>h.email.toLowerCase()===p.email.toLowerCase()&&h.source===p.source&&h.observedAt===p.observedAt));
  return {...snapshot,accountDetails:[...all.values()],quotaHistory:[...history,...additions]};
}
