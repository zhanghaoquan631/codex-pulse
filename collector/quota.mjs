import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {accountEmail} from '../lib/account-label.ts';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

// Only these identity/subscription claims leave this function. Never store the JWT.
export async function readQuotaIdentity(root) {
  try {
    const file=path.join(root,'auth.json'),before=await stat(file);
    const auth=JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,'')),after=await stat(file);
    if(before.mtimeMs!==after.mtimeMs||before.size!==after.size||auth.auth_mode!=='chatgpt')return null;
    const claims=JSON.parse(Buffer.from(auth.tokens?.id_token?.split('.')[1]||'','base64url').toString('utf8'));
    const details=claims['https://api.openai.com/auth']||{},email=accountEmail(claims.email)?.toLowerCase();
    if(!email||!auth.tokens.account_id||details.chatgpt_account_id!==auth.tokens.account_id)return null;
    return {email,accountId:auth.tokens.account_id,generation:`${after.ino}:${after.size}:${after.mtimeMs}`,subscription:{activeFrom:date(details.chatgpt_subscription_active_start),activeUntil:date(details.chatgpt_subscription_active_until),checkedAt:date(details.chatgpt_subscription_last_checked)}};
  } catch {return null;}
}

export function quotaProfile(account,limits,before,after,observedAt=new Date().toISOString()) {
  const email=accountEmail(account.account?.email)?.toLowerCase();
  const accountId=account.workspaceRouting?.chatgptAccountId;
  if(!email||!accountId||limits.accountId!==accountId)return null;
  // Refuse an observation if a login changed while the RPCs were in flight.
  if(!before||!after||before.generation!==after.generation||before.accountId!==accountId||after.accountId!==accountId||before.email!==email||after.email!==email)return null;
  const rate=limits.rateLimitsByLimitId?.codex??(limits.rateLimits?.limitId==='codex'?limits.rateLimits:null);
  const windows=[rate?.primary,rate?.secondary].filter(Boolean).map(w=>({usedPercent:finite(w.usedPercent)?Math.max(0,Math.min(100,w.usedPercent)):null,windowDurationMins:finite(w.windowDurationMins)&&w.windowDurationMins>0?w.windowDurationMins:null,resetsAt:finite(w.resetsAt)&&w.resetsAt>0?w.resetsAt:null}));
  const reset=limits.rateLimitResetCredits;
  const resetCredits=reset&&Number.isInteger(reset.availableCount)&&reset.availableCount>=0?{availableCount:reset.availableCount,credits:Array.isArray(reset.credits)?reset.credits.map(c=>({title:typeof c.title==='string'?c.title.slice(0,120):null,description:typeof c.description==='string'?c.description.slice(0,1000):null,resetType:typeof c.resetType==='string'?c.resetType:null,status:typeof c.status==='string'?c.status:null,expiresAt:finite(c.expiresAt)?c.expiresAt:null,noExpiry:c.expiresAt===null,grantedAt:finite(c.grantedAt)?c.grantedAt:null})):null}:null;
  return {email,observedAt,source:'account-api',planType:typeof rate?.planType==='string'?rate.planType:typeof account.account.planType==='string'?account.account.planType:null,windows,resetCredits,balance:typeof rate?.credits?.balance==='string'?rate.credits.balance:null,subscription:after.subscription};
}

export function saveQuotaProfile(db,profile) {
  if(!profile?.email)return;
  const previous=db.prepare('SELECT payload,observedAt FROM quota_profiles WHERE email=?').get(profile.email.toLowerCase());
  const state=p=>JSON.stringify([p.source,p.planType,p.windows,p.resetCredits,p.balance,p.subscription?.activeUntil]);
  if(!previous||profile.observedAt<previous.observedAt||state(profile)!==state(JSON.parse(previous.payload))||profile.observedAt.slice(0,13)!==previous.observedAt.slice(0,13)){
    db.prepare('INSERT OR IGNORE INTO quota_history(email,observedAt,payload) VALUES(?,?,?)').run(profile.email.toLowerCase(),profile.observedAt,JSON.stringify(profile));
  }
  db.prepare('INSERT INTO quota_profiles(email,payload,observedAt) VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET payload=excluded.payload,observedAt=excluded.observedAt WHERE excluded.observedAt>quota_profiles.observedAt').run(profile.email.toLowerCase(),JSON.stringify(profile),profile.observedAt);
}

export function initializeQuota(db){
  db.exec('CREATE TABLE IF NOT EXISTS quota_profiles(email TEXT PRIMARY KEY,payload TEXT NOT NULL,observedAt TEXT NOT NULL); CREATE TABLE IF NOT EXISTS quota_history(email TEXT NOT NULL,observedAt TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(email,observedAt)); INSERT OR IGNORE INTO quota_history(email,observedAt,payload) SELECT email,observedAt,payload FROM quota_profiles;');
}
