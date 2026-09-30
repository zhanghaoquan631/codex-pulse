import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const source=await readFile(new URL('./totp.ts',import.meta.url),'utf8');
const moduleUrl='data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64');
const {parseTotp,totp,base32,encryptTotp,decryptTotp}=await import(moduleUrl);
const importedSource=(await readFile(new URL('./authenticator-import.ts',import.meta.url),'utf8')).replace("from './totp'",`from '${moduleUrl}'`);
const {parseAuthenticatorImport}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(importedSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
function encode(bytes){let n=0,bits=0,s='';for(const byte of bytes){n=n*256+byte;bits+=8;while(bits>=5){bits-=5;s+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[Math.floor(n/2**bits)&31];}n&=(1<<bits)-1;}if(bits)s+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[(n<<(5-bits))&31];return s;}
const seconds=[59,1111111109,1111111111,1234567890,2000000000,20000000000];
const vectors={SHA1:['94287082','07081804','14050471','89005924','69279037','65353130'],SHA256:['46119246','68084774','67062674','91819424','90698825','77737706'],SHA512:['90693936','25091201','99943326','93441116','38618901','47863826']};
test('RFC 6238 SHA1/256/512 vectors retain the correct final six digits and leading zeros',async()=>{
  for(const [algorithm,expected] of Object.entries(vectors)){const length={SHA1:20,SHA256:32,SHA512:64}[algorithm],secret=encode(Buffer.from('1234567890'.repeat(7).slice(0,length))),config=parseTotp(`otpauth://totp/Fixture?secret=${secret}&algorithm=${algorithm}`,'fixture@gmail.com');for(let i=0;i<seconds.length;i++)assert.equal((await totp(config,seconds[i]*1000)).code,expected[i].slice(-6));}
});
test('period boundaries refresh and damaged Base32/unsupported types are rejected',async()=>{
  const config=parseTotp('JBSWY3DPEHPK3PXP','fixture@gmail.com');assert.equal((await totp(config,29999)).validUntil,30000);assert.equal((await totp(config,30000)).validUntil,60000);
  for(const key of ['A'.repeat(17),'A'.repeat(16)+'AZ','invalid-key-01'])assert.throws(()=>base32(key));
  for(const value of ['otpauth://hotp/F?secret=JBSWY3DPEHPK3PXP','otpauth://totp/F?secret=JBSWY3DPEHPK3PXP&digits=8','otpauth://totp/F?secret=JBSWY3DPEHPK3PXP&algorithm=MD5','otpauth://totp/F?secret=JBSWY3DPEHPK3PXP&period=0'])assert.throws(()=>parseTotp(value,'fixture@gmail.com'));
});
test('the vault contains no clear secret and rejects a wrong password or account',async()=>{
  const config=parseTotp('JBSWY3DPEHPK3PXP','fixture@gmail.com'),vault=await encryptTotp(config,'synthetic fixture password','fixture@gmail.com');assert.ok(!JSON.stringify(vault).includes(config.secret));assert.deepEqual(await decryptTotp(vault,'synthetic fixture password','fixture@gmail.com'),config);await assert.rejects(decryptTotp(vault,'wrong fixture password','fixture@gmail.com'));await assert.rejects(decryptTotp(vault,'synthetic fixture password','another@gmail.com'));
});
const integer=value=>{const bytes=[];do{const part=value%128;value=Math.floor(value/128);bytes.push(part|(value?128:0));}while(value);return Buffer.from(bytes);};
const field=(id,value)=>typeof value==='number'?Buffer.concat([integer(id*8),integer(value)]):Buffer.concat([integer(id*8+2),integer(value.length),value]);
const entry=(name,type=2,digits=1,algorithm=1)=>Buffer.concat([field(1,Buffer.from('12345678901234567890')),field(2,Buffer.from(name)),field(3,Buffer.from('Fixture')),field(4,algorithm),field(5,digits),field(6,type)]);
const migration=(items,version=1,page=0,total=1)=>'otpauth-migration://offline?data='+encodeURIComponent(Buffer.concat([...items.map(v=>field(1,v)),field(2,version),field(3,total),field(4,page)]).toString('base64'));
test('migration enum mapping, multiple entries, page information and unsupported data',()=>{
  const result=parseAuthenticatorImport(migration([entry('first'),entry('second',2,1,2),entry('counter',1),entry('eight',2,2)],1,1,3),'fixture@gmail.com');assert.equal(result.page,2);assert.equal(result.totalPages,3);assert.equal(result.entries.length,2);assert.equal(result.skipped,2);assert.equal(result.entries[1].algorithm,'SHA-256');assert.equal(result.entries[0].digits,6);assert.equal(result.entries[0].secret,encode(Buffer.from('12345678901234567890')));
  for(const value of [migration([entry('v')],2),migration([entry('invalid algo',2,1,9)]),migration([entry('v')],1,2,2),'otpauth-migration://offline?data=AA%3D%3D'])assert.throws(()=>parseAuthenticatorImport(value,'fixture@gmail.com'));
});
test('migration accepts a negative batch id but rejects conflicting or malformed algorithms',()=>{
  const negativeId=Buffer.from([40,255,255,255,255,255,255,255,255,255,1]),make=otp=>'otpauth-migration://offline?data='+encodeURIComponent(Buffer.concat([field(1,otp),field(2,1),negativeId]).toString('base64'));assert.equal(parseAuthenticatorImport(make(entry('negative batch')),'fixture@gmail.com').entries.length,1);assert.throws(()=>parseAuthenticatorImport(make(Buffer.concat([entry('duplicate'),field(4,2)])),'fixture@gmail.com'));assert.throws(()=>parseAuthenticatorImport(make(entry('wrong wire',2,1,Buffer.from([2]))),'fixture@gmail.com'));
});
