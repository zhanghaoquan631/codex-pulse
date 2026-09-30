import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const site='https://codex-pulse-willow-0911.wozhe0196.chatgpt.site';
export async function accountQueryRequest(configFile,method='GET',body){
 const config=JSON.parse((await readFile(configFile,'utf8')).replace(/^\uFEFF/,''));
 if(new URL(config.siteUrl).origin!==site||!config.ingestToken||!config.sitesToken)throw new Error('Account query Site configuration does not match');
 const response=await fetch(site+'/api/ingest/account-query',{method,headers:{'Authorization':`Bearer ${config.ingestToken}`,'OAI-Sites-Authorization':`Bearer ${config.sitesToken}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(25000)});
 const result=await response.json();if(!response.ok)throw new Error(`Account query request rejected (${response.status})`);return result;
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/i,'$1'))){
 const [action='status',configFile,receiptFile]=process.argv.slice(2);
 if(!configFile||!['status','claim','finish'].includes(action))throw new Error('Use status|claim|finish followed by the collector configuration path');
 try{let result;if(action==='finish'){if(!receiptFile)throw new Error('Receipt path required');const input=JSON.parse(await readFile(receiptFile,'utf8'));result=await accountQueryRequest(configFile,'POST',{...input,action:'finish'});}else result=await accountQueryRequest(configFile,action==='claim'?'POST':'GET',action==='claim'?{action:'claim'}:undefined);console.log(JSON.stringify(result));}catch{console.error('Official account query request unavailable. No credentials were printed.');process.exitCode=1;}
}

