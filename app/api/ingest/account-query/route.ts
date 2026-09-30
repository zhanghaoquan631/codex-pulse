import {env} from 'cloudflare:workers';
import {database} from '@/db/raw';
import {boundedJson,privateHeaders} from '@/lib/website-api';
import {queryState,claimQuery,finishQuery,InvalidAccountQuery,queryAccounts} from '@/lib/account-query';
import {InvalidQuotaEvidence,readQuotaEvidence} from '@/lib/quota-evidence';
function authorized(request:Request){const key=(env as unknown as Record<string,string>).INGEST_TOKEN;return !!key&&request.headers.get('Authorization')===`Bearer ${key}`;}
export async function GET(request:Request){
 if(!authorized(request))return Response.json({error:'Unauthorized'},{status:401,headers:privateHeaders});
 try{return Response.json({...await queryState(database()),allowedEmails:queryAccounts,evidence:(await readQuotaEvidence(database())).filter(e=>queryAccounts.includes(e.email))},{headers:privateHeaders});}
 catch{return Response.json({error:'Query service unavailable'},{status:503,headers:privateHeaders});}
}
export async function POST(request:Request){
 if(!authorized(request))return Response.json({error:'Unauthorized'},{status:401,headers:privateHeaders});
 try{const input=await boundedJson(request,28000);
 if(input.action==='claim')return Response.json({query:await claimQuery(database())},{headers:privateHeaders});
 if(input.action!=='finish'||typeof input.id!=='string')throw new InvalidAccountQuery();
 const result=await finishQuery(database(),input.id,input);
 return Response.json({ok:result!=='conflict',result},{status:result==='conflict'?409:200,headers:privateHeaders});
 }catch(error){const invalid=error instanceof InvalidAccountQuery||error instanceof InvalidQuotaEvidence;return Response.json({error:invalid?'Invalid verified query receipt':'Query service unavailable'},{status:invalid?400:503,headers:privateHeaders});}
}
