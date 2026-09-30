import {env} from 'cloudflare:workers';
import {database} from '@/db/raw';
import {boundedJson} from '@/lib/website-api';
import {InvalidQuotaEvidence,parseQuotaEvidenceInput,storeQuotaEvidence} from '@/lib/quota-evidence';

/** The existing collector credential can submit verified account evidence; it cannot read private browser locators. */
export async function POST(request:Request){
  const headers={'Cache-Control':'no-store'},key=(env as unknown as Record<string,string>).INGEST_TOKEN;
  if(!key||request.headers.get('Authorization')!==`Bearer ${key}`)return Response.json({error:'Unauthorized'},{status:401,headers});
  try{
    let input:unknown;try{input=await boundedJson(request,24000);}catch{return Response.json({error:'Invalid evidence payload'},{status:400,headers});}
    const evidence=parseQuotaEvidenceInput(input),result=await storeQuotaEvidence(database(),evidence);
    if(result==='conflict')return Response.json({error:'Concurrent evidence update; retry'},{status:409,headers});
    return Response.json({ok:true,...(result==='stale'?{ignored:'stale'}:{})},{headers});
  }catch(error){return Response.json({error:error instanceof InvalidQuotaEvidence?'Invalid official account evidence':'Evidence sync unavailable'},{status:error instanceof InvalidQuotaEvidence?400:503,headers});}
}
