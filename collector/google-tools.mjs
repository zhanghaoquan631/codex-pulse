import {spawn} from 'node:child_process';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {openChromeBilling} from './open-billing.mjs';
import {billingProfile} from '../integration/local-apps/billing-profiles.mjs';

export const googleEmail=value=>typeof value==='string'&&/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@(gmail\.com|googlemail\.com)$/i.test(value)?value.toLowerCase():null;
const reply=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
const safeError=(message,status=400)=>Object.assign(new Error(message),{status});

// Fixed PowerShell code; credentials are sent over stdin, never argv or logs.
export function windowsVaultCodec(operation,data){
  if(process.platform!=='win32')return Promise.reject(safeError('此连接需要原电脑上的 Windows 加密存储。',503));
  const script="$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd()|ConvertFrom-Json; $b=[Convert]::FromBase64String($v.data); $e=[Text.Encoding]::UTF8.GetBytes('CodexPulse-Gmail-V1'); if($v.operation -eq 'protect'){$r=[Security.Cryptography.ProtectedData]::Protect($b,$e,[Security.Cryptography.DataProtectionScope]::CurrentUser)}elseif($v.operation -eq 'unprotect'){$r=[Security.Cryptography.ProtectedData]::Unprotect($b,$e,[Security.Cryptography.DataProtectionScope]::CurrentUser)}else{throw 'Invalid operation'}; [Console]::Out.Write([Convert]::ToBase64String($r))";
  return new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='';child.stderr.resume();child.stdout.on('data',chunk=>{output+=chunk;if(output.length>200000)child.kill();});
    const timer=setTimeout(()=>child.kill(),10000);
    child.on('error',()=>{clearTimeout(timer);reject(safeError('本机加密存储暂时无法使用。',503));});
    child.on('exit',code=>{clearTimeout(timer);if(code===0&&/^[A-Za-z0-9+/=]+$/.test(output))resolve(Buffer.from(output,'base64'));else reject(safeError('本机加密存储暂时无法读取。',503));});
    child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({operation,data:Buffer.from(data).toString('base64')}));
  });
}

export function verificationCodes(text){
  const value=String(text||'').replace(/\u200b/g,'').slice(0,100000),found=new Set();
  const marker=/(验证码|驗證碼|verification\s+code|security\s+code|one[- ]time\s+(?:code|password)|sign[- ]?in\s+code|login\s+code|your\s+code|code\s+(?:is|:))/gi;
  for(const match of value.matchAll(marker)){
    const following=value.slice(match.index+match[0].length,match.index+match[0].length+100);
    const code=/(?:^|[^\d])([0-9]{4,8})(?![0-9])/.exec(following);
    if(code)found.add(code[1]);
  }
  return [...found].slice(0,3);
}

export async function gmailImap(email,password,readCodes=false){
  const {ImapFlow}=await import('imapflow');
  const client=new ImapFlow({host:'imap.gmail.com',port:993,secure:true,proxy:process.env.HTTPS_PROXY||undefined,auth:{user:email,pass:password},logger:false,emitLogs:false,disableAutoIdle:true,connectionTimeout:15000,greetingTimeout:10000,socketTimeout:20000});
  const deadline=setTimeout(()=>client.close(),45000);deadline.unref();
  try{
    await client.connect();if(!readCodes)return [];
    const {simpleParser}=await import('mailparser');
    const lock=await client.getMailboxLock('INBOX',{readOnly:true});
    try{
      const ids=await client.search({since:new Date(Date.now()-86400000)},{uid:true});
      if(!Array.isArray(ids))throw new Error('Gmail search unavailable');
      const result=[];
      for(const uid of ids.slice(-30).reverse()){
        const message=await client.fetchOne(uid,{source:{start:0,maxLength:256000},internalDate:true,envelope:true},{uid:true});
        if(!message?.source||!message.internalDate||Date.now()-new Date(message.internalDate).getTime()>15*60000)continue;
        const parsed=await simpleParser(message.source,{skipHtmlToText:false,skipTextToHtml:true});
        const subject=String(parsed.subject||'').slice(0,200),codes=verificationCodes(`${subject}\n${parsed.text||''}`);
        if(!codes.length)continue;
        result.push({id:String(uid),subject,from:String(parsed.from?.text||'').slice(0,200),receivedAt:new Date(message.internalDate).toISOString(),codes});
        if(result.length>=8)break;
      }
      return result;
    }finally{lock.release();}
  }finally{clearTimeout(deadline);try{await client.logout();}catch{client.close();}}
}

export class GoogleTools{
  constructor(dataDir,dependencies={}){this.file=path.join(dataDir,'gmail-connections.dpapi');this.codec=dependencies.codec||windowsVaultCodec;this.gmail=dependencies.gmail||gmailImap;this.quotaRefresh=dependencies.quotaRefresh;this.openBilling=dependencies.openBilling||openChromeBilling;this.entries=null;this.loading=null;this.queue=Promise.resolve();this.cache=new Map();this.inflight=new Map();this.versions=new Map();}
  async load(){if(this.entries)return this.entries;if(!this.loading)this.loading=(async()=>{try{this.entries=JSON.parse((await this.codec('unprotect',await readFile(this.file))).toString('utf8'));}catch(e){if(e.code!=='ENOENT')throw e;this.entries={};}return this.entries;})().finally(()=>{this.loading=null;});return this.loading;}
  async save(entries){await mkdir(path.dirname(this.file),{recursive:true});const temp=this.file+'.'+randomUUID()+'.tmp';await writeFile(temp,await this.codec('protect',Buffer.from(JSON.stringify(entries))),{mode:0o600});await rename(temp,this.file);this.entries=entries;}
  async mutate(action){const result=this.queue.catch(()=>{}).then(async()=>{await this.load();return action();});this.queue=result;return result;}
  invalidate(email){this.versions.set(email,(this.versions.get(email)||0)+1);this.cache.delete(email);this.inflight.delete(email);}
  async codes(email){
    const entry=(await this.load())[email];if(!entry)return {connected:false,messages:[],state:'not-connected'};
    const version=this.versions.get(email)||0;
    const cached=this.cache.get(email);if(cached&&Date.now()-cached.checked<10000)return cached.value;
    if(this.inflight.has(email))return this.inflight.get(email);
    const current=()=>version===(this.versions.get(email)||0)&&this.entries[email]===entry;
    const pending=this.gmail(email,entry.password,true).then(messages=>{if(!current())return {connected:false,messages:[],state:'connection-changed'};const value={connected:true,messages,checkedAt:new Date().toISOString(),state:'connected'};this.cache.set(email,{checked:Date.now(),value});return value;}).catch(()=>{if(!current())return {connected:false,messages:[],state:'connection-changed'};this.cache.delete(email);throw safeError('Gmail 读取失败。请检查网络或重新连接应用专用密码。',502);}).finally(()=>{if(this.inflight.get(email)===pending)this.inflight.delete(email);});this.inflight.set(email,pending);return pending;
  }
  async handle(req,res,url){
    const email=googleEmail(url.searchParams.get('email'));if(!email)return reply(res,400,{error:'请选择有效的 Gmail 账号。'});
    try{
      if(req.method==='POST'&&url.pathname==='/relay/identity/open-billing'){
        if(url.searchParams.size!==1||url.searchParams.getAll('email').length!==1||!billingProfile(email))throw safeError('此邮箱尚未授权对应的 Chrome 个人资料，未打开账单页面。',403);
        let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4096)throw safeError('请求内容过大。',413);chunks.push(chunk);}
        const raw=Buffer.concat(chunks).toString('utf8').trim();
        if(raw){let body;try{body=JSON.parse(raw);}catch{throw safeError('打开账单的请求格式无效。');}if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).length)throw safeError('打开账单无需其他参数，请重新点击账号对应按钮。');}
        try{return reply(res,200,await this.openBilling(email));}catch(error){throw safeError(error.status?error.message:'未能启动对应的 Chrome 个人资料，请在原电脑检查 Chrome 后重试。',error.status||503);}
      }
      if(req.method==='POST'&&url.pathname.endsWith('/quota-refresh')){if(!this.quotaRefresh)return reply(res,503,{error:'账号采集服务暂未连接。'});return reply(res,200,await this.quotaRefresh(email));}
      if(req.method==='GET'&&url.pathname.endsWith('/status'))return reply(res,200,{connected:!!(await this.load())[email],method:'app-password'});
      if(req.method==='GET'&&url.pathname.endsWith('/gmail-codes'))return reply(res,200,await this.codes(email));
      if(req.method==='POST'&&url.pathname.endsWith('/gmail-connection')){
        let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4096)throw safeError('连接信息过大。',413);chunks.push(chunk);}
        let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!body||typeof body!=='object')throw new Error();}catch{throw safeError('连接信息格式无效。');}
        if(body.action==='disconnect'){await this.mutate(async()=>{await this.save(Object.fromEntries(Object.entries(this.entries).filter(([key])=>key!==email)));this.invalidate(email);});return reply(res,200,{connected:false});}
        const password=typeof body.password==='string'?body.password.replace(/\s/g,''):'';
        if(body.action!=='connect'||!/^[a-z]{16}$/.test(password))throw safeError('请输入 Google 生成的 16 位应用专用密码，不是账号登录密码。');
        await this.mutate(async()=>{try{await this.gmail(email,password,false);}catch{throw safeError('Google 未接受这枚应用专用密码，请核对邮箱与密码。',401);}await this.save({...this.entries,[email]:{password,connectedAt:new Date().toISOString()}});this.invalidate(email);});return reply(res,200,{connected:true});
      }
      return reply(res,405,{error:'不支持此操作。'});
    }catch(e){return reply(res,e.status||503,{error:e.status?e.message:'Gmail 连接暂时不可用。'});}
  }
}
