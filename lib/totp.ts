export type TotpConfig={secret:string;issuer:string;label:string;algorithm:'SHA-1'|'SHA-256'|'SHA-512';digits:6;period:number};
export function base32(value:string){
  const text=value.toUpperCase().replace(/[\s-]/g,'').replace(/=+$/,'');if(!/^[A-Z2-7]{16,256}$/.test(text)||![0,2,4,5,7].includes(text.length%8))throw new Error('请输入有效的 Base32 二次认证密钥。');
  let bits=0,buffer=0;const bytes:number[]=[];for(const char of text){buffer=(buffer<<5)|'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char);bits+=5;if(bits>=8){bits-=8;bytes.push((buffer>>>bits)&255);}}
  if(bits&&(buffer&((1<<bits)-1)))throw new Error('二次认证密钥的结尾不完整，请重新核对。');return new Uint8Array(bytes);
}
export function parseTotp(value:string,email:string):TotpConfig{
  let secret=value.trim(),issuer='Google Authenticator',label=email,algorithm:TotpConfig['algorithm']='SHA-1',period=30;
  if(secret.startsWith('otpauth-migration:'))throw new Error('这是批量迁移二维码。请导入该账号的原始 TOTP 密钥或单个 otpauth://totp 链接。');
  if(secret.startsWith('otpauth:')){const url=new URL(secret);if(url.hostname!=='totp')throw new Error('这里只支持 TOTP 时间验证码。');secret=url.searchParams.get('secret')||'';issuer=url.searchParams.get('issuer')||issuer;label=decodeURIComponent(url.pathname.slice(1))||email;const hash=url.searchParams.get('algorithm')||'SHA1';algorithm=({SHA1:'SHA-1',SHA256:'SHA-256',SHA512:'SHA-512'} as const)[hash.toUpperCase() as 'SHA1']||(()=>{throw new Error('不支持该认证算法。');})();if(url.searchParams.has('digits')&&url.searchParams.get('digits')!=='6')throw new Error('这个密钥的位数不是六位，请保留原认证方式。');period=Number(url.searchParams.get('period')||30);if(!Number.isSafeInteger(period)||period<15||period>120)throw new Error('验证码更新周期无效。');}
  base32(secret);return {secret:secret.toUpperCase().replace(/[\s-]/g,'').replace(/=+$/,''),issuer:issuer.slice(0,100),label:label.slice(0,160),algorithm,digits:6,period};
}
export async function totp(config:TotpConfig,now=Date.now()){
  const counter=Math.floor(now/1000/config.period),bytes=new Uint8Array(8);new DataView(bytes.buffer).setBigUint64(0,BigInt(counter));
  const key=await crypto.subtle.importKey('raw',base32(config.secret) as BufferSource,{name:'HMAC',hash:config.algorithm},false,['sign']);const digest=new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes));const offset=digest[digest.length-1]&15,number=((digest[offset]&127)<<24)|(digest[offset+1]<<16)|(digest[offset+2]<<8)|digest[offset+3];
  return {code:String(number%1000000).padStart(6,'0'),validUntil:(counter+1)*config.period*1000};
}
type StoredVault={version:1;salt:string;iv:string;ciphertext:string};
const encoded=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));const decoded=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
async function vaultKey(password:string,salt:Uint8Array){if(password.length<8)throw new Error('本机解锁密码至少需要 8 个字符。');const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt:salt as BufferSource,iterations:250000,hash:'SHA-256'},key,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
export async function encryptTotp(config:TotpConfig,password:string,email:string):Promise<StoredVault>{const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await vaultKey(password,salt);const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(email.toLowerCase())},key,new TextEncoder().encode(JSON.stringify(config)));return {version:1,salt:encoded(salt),iv:encoded(iv),ciphertext:encoded(new Uint8Array(cipher))};}
export async function decryptTotp(vault:StoredVault,password:string,email:string):Promise<TotpConfig>{try{if(vault.version!==1)throw new Error();const key=await vaultKey(password,decoded(vault.salt)),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decoded(vault.iv) as BufferSource,additionalData:new TextEncoder().encode(email.toLowerCase())},key,decoded(vault.ciphertext) as BufferSource);const config=JSON.parse(new TextDecoder().decode(plain)) as TotpConfig;base32(config.secret);if(!['SHA-1','SHA-256','SHA-512'].includes(config.algorithm)||config.digits!==6||!Number.isSafeInteger(config.period)||config.period<15||config.period>120)throw new Error();return config;}catch{throw new Error('解锁密码不正确，或本机保存的数据无法读取。');}}
