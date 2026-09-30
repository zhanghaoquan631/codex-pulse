import {database} from "@/db/raw";
import {isOwner,canWrite,boundedJson,privateHeaders} from "@/lib/website-api";
import {decimal,exchangeRate,usdMicros} from "@/lib/ledger";
import {groupCreditAccounts,type CreditAccount} from "@/lib/ledger-accounts";
export async function GET(request:Request){try{
 const accountId=new URL(request.url).searchParams.get("account")||"";if(accountId&&!/^[a-f0-9]{64}$/.test(accountId))return new Response("Invalid account",{status:400});
 const db=database();const [accounts,changes,entries,sums,status]=await Promise.all([
  db.prepare("SELECT a.id,a.label,a.balance,a.unlimited,a.observed_at observedAt,COALESCE(s.confirmed,0) confirmed,COALESCE(s.pending,0) pending FROM credit_accounts a LEFT JOIN (SELECT account_id,SUM(CASE WHEN direction='decrease' AND classification='spent' THEN usd_micros ELSE 0 END) confirmed,SUM(CASE WHEN direction='decrease' AND classification='pending' THEN usd_micros ELSE 0 END) pending FROM credit_changes GROUP BY account_id) s ON s.account_id=a.id ORDER BY a.label").all(),
  db.prepare("SELECT e.id,e.account_id accountId,a.label accountLabel,e.direction,e.amount,e.usd_micros usdMicros,e.before_balance beforeBalance,e.after_balance afterBalance,e.observed_at observedAt,e.classification FROM credit_changes e JOIN credit_accounts a ON a.id=e.account_id WHERE (?='' OR lower(trim(a.label))=lower(trim((SELECT label FROM credit_accounts WHERE id=?)))) ORDER BY e.observed_at DESC LIMIT 100").bind(accountId,accountId).all(),
  db.prepare("SELECT id,entry_date entryDate,currency,amount,usd_micros usdMicros,rate,rate_date rateDate,note FROM ledger_entries ORDER BY entry_date DESC,created_at DESC LIMIT 100").all(),
  db.prepare("SELECT (SELECT COALESCE(SUM(usd_micros),0) FROM ledger_entries) manual,(SELECT COALESCE(SUM(usd_micros),0) FROM credit_changes WHERE direction='decrease' AND classification='spent') confirmed,(SELECT COALESCE(SUM(usd_micros),0) FROM credit_changes WHERE direction='decrease' AND classification='pending') pending").first(),
  db.prepare("SELECT payload FROM ledger_sync WHERE id=1").first<{payload:string}>()
 ]);return Response.json({accounts:groupCreditAccounts(accounts.results as CreditAccount[]),changes:changes.results,entries:entries.results,totals:sums,status:status?JSON.parse(status.payload):null,canManage:isOwner(request)},{headers:privateHeaders});
 }catch{return Response.json({error:"额度账本暂时无法读取"},{status:503,headers:privateHeaders});}}
export async function POST(request:Request){if(!canWrite(request))return Response.json({error:"请使用网站创建账号登录管理"},{status:403});
 try{const data=await boundedJson(request,10000);const db=database();
  if(data.action==="classify"){
   if(typeof data.id!=="string"||!["spent","expired","adjustment","pending"].includes(data.classification))return new Response("Invalid change",{status:400});
   await db.prepare("UPDATE credit_changes SET classification=? WHERE id=? AND direction='decrease'").bind(data.classification,data.id).run();return Response.json({ok:true},{headers:privateHeaders});
  }
  const amount=decimal(data.amount),currency=String(data.currency||"").toUpperCase();if(amount===null||amount===0)return Response.json({error:"金额需要大于 0"},{status:400});
  if(typeof data.id!=="string"||!/^[a-zA-Z0-9-]{16,80}$/.test(data.id))return new Response("Invalid ID",{status:400});
  const note=typeof data.note==="string"?data.note.trim().slice(0,120):"";
  const existing=await db.prepare("SELECT entry_date,currency,amount,note,usd_micros,rate,rate_date FROM ledger_entries WHERE id=?").bind(data.id).first<{entry_date:string;currency:string;amount:string;note:string;usd_micros:number;rate:number;rate_date:string}>();
  if(existing){if(existing.entry_date!==data.date||existing.currency!==currency||Number(existing.amount)!==amount||existing.note!==note)return Response.json({error:"这一笔已经保存，内容与当前输入不同。请关闭表单后新增一笔，或先删除原记录。"},{status:409});return Response.json({ok:true,usdMicros:existing.usd_micros,rate:existing.rate,rateDate:existing.rate_date},{headers:privateHeaders});}
  const rate=await exchangeRate(currency,data.date),usd=usdMicros(amount,rate.rate);
  await db.prepare("INSERT INTO ledger_entries (id,entry_date,currency,amount,usd_micros,rate,rate_date,note,created_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING").bind(data.id,data.date,currency,String(amount),usd,rate.rate,rate.date,note,new Date().toISOString()).run();
  const saved=await db.prepare("SELECT entry_date,currency,amount,note,usd_micros,rate,rate_date FROM ledger_entries WHERE id=?").bind(data.id).first<{entry_date:string;currency:string;amount:string;note:string;usd_micros:number;rate:number;rate_date:string}>();
  if(!saved)throw new Error("记录未保存，请重试");if(saved.entry_date!==data.date||saved.currency!==currency||Number(saved.amount)!==amount||saved.note!==note)return Response.json({error:"这笔记录已保存了不同内容，请核对记录后再操作"},{status:409});
  return Response.json({ok:true,usdMicros:saved.usd_micros,rate:saved.rate,rateDate:saved.rate_date},{headers:privateHeaders});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"保存失败，输入内容已保留"},{status:503,headers:privateHeaders});}}
export async function DELETE(request:Request){if(!canWrite(request))return new Response("Forbidden",{status:403});try{const id=new URL(request.url).searchParams.get("id");if(!id)return new Response("Invalid ID",{status:400});await database().prepare("DELETE FROM ledger_entries WHERE id=?").bind(id).run();return Response.json({ok:true},{headers:privateHeaders});}catch{return Response.json({error:"删除失败，请重试"},{status:503});}}
