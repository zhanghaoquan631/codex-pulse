import {env} from "cloudflare:workers";
import {database} from "@/db/raw";
import {boundedJson} from "@/lib/website-api";
import {decimal,usdMicros,USD_PER_CREDIT} from "@/lib/ledger";
import {validAccountLabel} from "@/lib/account-label";
export async function POST(request:Request){const key=(env as unknown as Record<string,string>).INGEST_TOKEN;if(!key||request.headers.get("Authorization")!==`Bearer ${key}`)return new Response("Unauthorized",{status:401});
 try{const data=await boundedJson(request),db=database(),statements=[];
  if(!Array.isArray(data.accounts)||data.accounts.length>40||!Array.isArray(data.changes)||data.changes.length>50)return new Response("Invalid batch",{status:400});
  for(const account of data.accounts){if(!/^[a-f0-9]{64}$/.test(account.id)||!validAccountLabel(account.label)||!Number.isFinite(Date.parse(account.observedAt))||(account.balance!==null&&decimal(account.balance)===null))return new Response("Invalid account",{status:400});
   statements.push(db.prepare("INSERT INTO credit_accounts (id,label,balance,unlimited,observed_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,balance=excluded.balance,unlimited=excluded.unlimited,observed_at=excluded.observed_at WHERE excluded.observed_at>=credit_accounts.observed_at").bind(account.id,account.label,account.balance===null?null:String(account.balance),account.unlimited?1:0,new Date(account.observedAt).toISOString()));
  }
  for(const change of data.changes){const before=decimal(change.beforeBalance),after=decimal(change.afterBalance);if(!/^[a-f0-9]{64}$/.test(change.id)||!/^[a-f0-9]{64}$/.test(change.accountId)||before===null||after===null||before===after||!Number.isFinite(Date.parse(change.observedAt)))return new Response("Invalid observation",{status:400});const amount=Number(Math.abs(after-before).toFixed(8)),direction=after<before?"decrease":"increase";
   statements.push(db.prepare("INSERT INTO credit_changes (id,account_id,direction,amount,usd_micros,before_balance,after_balance,observed_at,classification) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING").bind(change.id,change.accountId,direction,String(amount),usdMicros(amount,USD_PER_CREDIT),String(before),String(after),new Date(change.observedAt).toISOString(),direction==="decrease"?"pending":"observed"));
  }
  const status={lastSync:new Date().toISOString(),lastPoll:typeof data.status?.lastPoll==="string"?data.status.lastPoll:null,state:["ready","unavailable","no-account","identity-unavailable"].includes(data.status?.state)?data.status.state:"unavailable"};
  statements.push(db.prepare("INSERT INTO ledger_sync (id,payload) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload").bind(JSON.stringify(status)));
  await db.batch(statements);return Response.json({ok:true});
 }catch{return Response.json({error:"Sync unavailable"},{status:503});}}
