import {database} from '@/db/raw';
import {isOwner,canWrite,boundedJson,privateHeaders} from '@/lib/website-api';
import {InvalidQuotaEvidence,parseQuotaEvidenceInput,readQuotaEvidence,storeQuotaEvidence} from '@/lib/quota-evidence';

export async function GET(request:Request){
  const origin=request.headers.get('Origin');
  if(!isOwner(request)||(origin&&origin!==new URL(request.url).origin)||request.headers.get('Sec-Fetch-Site')==='cross-site')return Response.json({error:'请使用网站管理账号登录'},{status:403,headers:privateHeaders});
  try{return Response.json({evidence:await readQuotaEvidence(database())},{headers:privateHeaders});}
  catch{return Response.json({error:'官方核验记录暂时无法读取'},{status:503,headers:privateHeaders});}
}
export async function POST(request:Request){
  if(!canWrite(request))return Response.json({error:'请使用网站管理账号在本站保存核验记录'},{status:403,headers:privateHeaders});
  try{
    let input:unknown;try{input=await boundedJson(request,24000);}catch{return Response.json({error:'核验记录格式无效或超出大小限制'},{status:400,headers:privateHeaders});}
    const evidence=parseQuotaEvidenceInput(input),result=await storeQuotaEvidence(database(),evidence);
    if(result==='conflict')return Response.json({error:'记录正在更新，请重试'},{status:409,headers:privateHeaders});
    return Response.json({ok:true,...(result==='stale'?{ignored:'stale'}:{})},{headers:privateHeaders});
  }catch(error){return Response.json({error:error instanceof InvalidQuotaEvidence?'请提供邮箱一致、时间有效的官方核验记录':'核验记录暂时无法保存'},{status:error instanceof InvalidQuotaEvidence?400:503,headers:privateHeaders});}
}
