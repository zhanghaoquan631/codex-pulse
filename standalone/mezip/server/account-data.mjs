import {normalizeMemoryRecord} from './memory-record.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
export async function handleAccountData(request,env,user){
 const url=new URL(request.url),p=url.pathname,db=env.DB;
 if(p==='/api/booking/health')return json({ok:true,mailConfigured:!!env.BREVO_API_KEY,timeZone:'Asia/Taipei'});
 if(p==='/api/book'&&request.method==='POST'){
  const b=await request.json();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date||'')||!/^\d{2}:\d{2}(?::\d{2})?$/.test(b.time||'')||!/^\S+@\S+\.\S+$/.test(b.email||'')||String(b.notes||'').length>3000)return json({ok:false,error:'请填写有效的日期、时间和联系邮箱。'},400);
  const when=new Date(`${b.date}T${b.time.length===5?b.time+':00':b.time}+08:00`);
  if(!Number.isFinite(+when)||+when<Date.now()-60000||+when>Date.now()+366*86400000)return json({ok:false,error:'请选择一年内的未来时间。'},400);
  const id=String(b.requestId||'');if(!/^[a-z0-9-]{16,64}$/i.test(id))return json({ok:false,error:'请重新打开预约表单。'},400);
  const email=b.email.trim().toLowerCase(),owner=user?.key||await sha('guest:'+email);
  const prior=await db.prepare('SELECT owner_key FROM bookings WHERE id=?').bind(id).first();
  if(prior)return prior.owner_key===owner?json({ok:true,message:'预约已保存。',id}):json({ok:false,error:'预约请求已失效。'},409);
  const ip=await sha(request.headers.get('cf-connecting-ip')||'unknown'),now=Date.now();
  const result=await db.prepare('INSERT OR IGNORE INTO bookings(id,owner_key,email,name,notes,date,time,ip_hash,created_at,notification) SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM bookings WHERE (ip_hash=? OR email=?) AND created_at>?)<5').bind(id,owner,email,String(b.name||'').slice(0,120),String(b.notes||''),b.date,b.time,ip,now,'pending',ip,email,now-900000).run();
  if(!result.meta?.changes){const prior=await db.prepare('SELECT owner_key FROM bookings WHERE id=?').bind(id).first();if(prior)return prior.owner_key===owner?json({ok:true,message:'预约已保存。',id}):json({ok:false,error:'预约请求已失效。'},409);return json({ok:false,error:'提交较频繁，请稍后再试。'},429);}
  // Save first: a provider outage never loses an accepted booking.
  let sent=false;
  if(env.BREVO_API_KEY&&env.BREVO_SENDER_EMAIL&&env.BOOKING_NOTIFY_EMAIL){
   try{const response=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':env.BREVO_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({sender:{name:'MEZIP 预约',email:env.BREVO_SENDER_EMAIL},to:[{email:env.BOOKING_NOTIFY_EMAIL}],replyTo:{email},subject:`新的预约 · ${b.date} ${b.time}`,textContent:`时间：${b.date} ${b.time}（UTC+8）\n称呼：${String(b.name||'')}\n邮箱：${email}\n备注：${String(b.notes||'')}`}),signal:AbortSignal.timeout(10000)});sent=response.ok;}catch{}
  }
  await db.prepare('UPDATE bookings SET notification=? WHERE id=?').bind(sent?'sent':'pending',id).run();
  return json({ok:true,id,message:sent?'预约已保存，通知邮件已发送。':'预约已保存，通知邮件暂未发送。'});
 }
 if(!p.startsWith('/api/account/'))return null;
 if(!user)return json({error:'请先登录账号。'},401);
 if(p==='/api/account/bookings'&&request.method==='GET')return json({bookings:(await db.prepare('SELECT id,date,time,name,email,notes,notification,created_at FROM bookings WHERE owner_key=? ORDER BY created_at DESC LIMIT 50').bind(user.key).all()).results});
 if(p==='/api/account/saves'){
  if(request.method==='GET')return json({saved:(await db.prepare('SELECT url FROM account_saved WHERE user_key=? ORDER BY created_at').bind(user.key).all()).results.map(r=>r.url)});
  if(request.method==='POST'){
   const b=await request.json();if(typeof b.url!=='string'||!/^\/(?:media|original-image-library|wechat-0051|wechat-0327|archive-extra)\/[a-zA-Z0-9_./-]+$/.test(b.url)||b.url.includes('..')||b.url.length>250)return json({error:'图片地址无效。'},400);
   await db.prepare('INSERT OR IGNORE INTO account_saved(user_key,url,created_at) SELECT ?,?,? WHERE (SELECT count(*) FROM account_saved WHERE user_key=?)<500').bind(user.key,b.url,Date.now(),user.key).run();return json({saved:true});
  }
 }
 if(p==='/api/account/memory'){
  if(request.method==='GET'){
   const row=await db.prepare('SELECT value,revision FROM account_state WHERE user_key=? AND name=?').bind(user.key,'memory').first();
   return json({record:row?JSON.parse(row.value):null,revision:row?.revision||0,user:{key:user.key}});
  }
  if(request.method==='PUT'){
   const {record:incoming,revision,identity}=await request.json();
   if(identity!==user.key)return json({error:'账号已变化，请刷新页面。'},409);
   const record=normalizeMemoryRecord(incoming);
   if(!record||!Number.isSafeInteger(revision)||revision<0)return json({error:'游戏记录格式无效。'},400);
   const result=revision===0?await db.prepare('INSERT OR IGNORE INTO account_state(user_key,name,value,revision,updated_at) VALUES(?,?,?,?,?)').bind(user.key,'memory',JSON.stringify(record),1,Date.now()).run():await db.prepare('UPDATE account_state SET value=?,revision=revision+1,updated_at=? WHERE user_key=? AND name=? AND revision=?').bind(JSON.stringify(record),Date.now(),user.key,'memory',revision).run();
   if(!result.meta?.changes)return json({error:'另一页面已更新这局游戏，请刷新后继续。'},409);
   return json({saved:true,revision:revision+1});
  }
 }
 return json({error:'接口不存在。'},404);
}

