import {parseTotp,type TotpConfig} from './totp';

// Compatibility parser for Google Authenticator's export QR payload.
// Unknown versions/enums are rejected rather than generating a wrong code.
type Field={id:number;value:number|bigint|Uint8Array};
function fields(bytes:Uint8Array):Field[]{
  let offset=0;const result:Field[]=[];
  function integer(){let number=BigInt(0);for(let i=0;i<10;i++){if(offset>=bytes.length)throw new Error('二维码数据不完整。');const byte=bytes[offset++];if(i===9&&byte>1)throw new Error('二维码数据超出范围。');number|=BigInt(byte&127)<<BigInt(i*7);if(!(byte&128))return number<=BigInt(Number.MAX_SAFE_INTEGER)?Number(number):number;}throw new Error('二维码数据无效。');}
  while(offset<bytes.length){const tag=integer();if(typeof tag!=='number')throw new Error('二维码字段无效。');const id=Math.floor(tag/8),wire=tag%8;if(!id)throw new Error('二维码数据无效。');if(wire===0)result.push({id,value:integer()});else if(wire===2){const length=integer();if(typeof length!=='number'||length>bytes.length-offset)throw new Error('二维码数据不完整。');result.push({id,value:bytes.slice(offset,offset+length)});offset+=length;}else if(wire===1||wire===5){offset+=wire===1?8:4;if(offset>bytes.length)throw new Error('二维码数据不完整。');}else throw new Error('暂不支持这种二维码数据。');}
  return result;
}
function encode32(bytes:Uint8Array){let buffer=0,bits=0,value='';for(const byte of bytes){buffer=(buffer<<8)|byte;bits+=8;while(bits>=5){bits-=5;value+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[(buffer>>>bits)&31];}}if(bits)value+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[(buffer<<(5-bits))&31];return value;}
export type AuthenticatorImport={entries:TotpConfig[];page:number;totalPages:number;skipped:number};
export function parseAuthenticatorImport(uri:string,email:string):AuthenticatorImport{
  if(!uri.trim().startsWith('otpauth-migration:'))return {entries:[parseTotp(uri,email)],page:1,totalPages:1,skipped:0};
  const url=new URL(uri.trim()),data=url.searchParams.get('data');if(url.hostname!=='offline'||!data||data.length>32000)throw new Error('Authenticator 导出二维码格式无效。');
  let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(data.replace(/ /g,'+')),c=>c.charCodeAt(0));}catch{throw new Error('二维码数据无法解码。');}
  const payload=fields(bytes),number=(id:number,otherwise:number)=>{const values=payload.filter(f=>f.id===id);if(!values.length)return otherwise;if(values.length!==1||typeof values[0].value!=='number')throw new Error('二维码字段无效。');return values[0].value;};
  if(number(2,0)!==1)throw new Error('暂不支持这个 Authenticator 导出版本，请使用原始密钥或单个 otpauth 链接。');
  const totalPages=number(3,1),index=number(4,0);if(totalPages<1||totalPages>100||index<0||index>=totalPages)throw new Error('二维码页数无效。');
  const entries:TotpConfig[]=[];let skipped=0;
  for(const item of payload.filter(f=>f.id===1)){
    if(!(item.value instanceof Uint8Array))throw new Error('二维码条目无效。');const values=fields(item.value),get=(id:number)=>{const matches=values.filter(f=>f.id===id);if(matches.length>1)throw new Error('二维码存在重复的认证字段，请重新导出。');return matches[0]?.value;};
    const text=(id:number)=>{const value=get(id);return value instanceof Uint8Array?new TextDecoder().decode(value):'';};
    if(get(6)!==2||get(5)!==1){skipped++;continue;}const algorithm=get(4),hash=typeof algorithm==='number'?({1:'SHA1',2:'SHA256',3:'SHA512'} as Record<number,string>)[algorithm]:null,secret=get(1);if(!hash||!(secret instanceof Uint8Array)||secret.length<10||secret.length>160)throw new Error('二维码内存在无法识别的密钥或算法，请核对原认证方式。');
    const candidate=new URL('otpauth://totp/'+encodeURIComponent(text(2)||email));candidate.searchParams.set('secret',encode32(secret));candidate.searchParams.set('algorithm',hash);candidate.searchParams.set('issuer',text(3)||'Google Authenticator');entries.push(parseTotp(candidate.href,email));
  }
  if(!entries.length)throw new Error('这一页没有支持的六位 TOTP 账号，请选择其他二维码或原始密钥。');
  return {entries,page:index+1,totalPages,skipped};
}

export async function readAuthenticatorQr(file:File,email:string){
  if(file.size>12*1024*1024)throw new Error('请选择小于 12MB 的二维码图片。');const source=URL.createObjectURL(file),picture=new Image();
  try{await new Promise<void>((resolve,reject)=>{picture.onload=()=>resolve();picture.onerror=()=>reject(new Error('无法读取此图片。'));picture.src=source;});const scale=Math.min(1,3000/Math.max(picture.naturalWidth,picture.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(picture.naturalWidth*scale));canvas.height=Math.max(1,Math.round(picture.naturalHeight*scale));const context=canvas.getContext('2d');if(!context)throw new Error('当前浏览器无法读取二维码。');context.drawImage(picture,0,0,canvas.width,canvas.height);const pixels=context.getImageData(0,0,canvas.width,canvas.height),{default:jsQR}=await import('jsqr'),code=jsQR(pixels.data,canvas.width,canvas.height,{inversionAttempts:'attemptBoth'});canvas.width=canvas.height=1;if(!code)throw new Error('没有识别到二维码，请上传清晰、完整的单个二维码图片。');return parseAuthenticatorImport(code.data,email);}finally{URL.revokeObjectURL(source);picture.src='';}
}
