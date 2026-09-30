import {database} from '@/db/raw';
import {isOwner,canWrite,boundedJson,privateHeaders} from '@/lib/website-api';
import {queryState,queryEmail,enqueueQuery,setQueryEnabled,InvalidAccountQuery} from '@/lib/account-query';
export async function GET(request:Request){
 if(!isOwner(request)||request.headers.get('Sec-Fetch-Site')==='cross-site')return Response.json({error:'请使用网站管理账号登录'},{status:403,headers:privateHeaders});
 try{return Response.json(await queryState(database()),{headers:privateHeaders});}catch{return Response.json({error:'查询状态暂时无法读取'},{status:503,headers:privateHeaders});}
}
export async function POST(request:Request){
 if(!canWrite(request))return Response.json({error:'请使用网站管理账号在本站查询'},{status:403,headers:privateHeaders});
 try{const input=await boundedJson(request,1500);
 if(input.action==='configure'){await setQueryEnabled(database(),input.enabled);return Response.json({ok:true},{headers:privateHeaders});}
 if(input.action!=='query')throw new InvalidAccountQuery();
 return Response.json({ok:true,query:await enqueueQuery(database(),queryEmail(input.email))},{status:202,headers:privateHeaders});
 }catch(error){return Response.json({error:error instanceof InvalidAccountQuery?'此邮箱尚未获准自动查询':'查询请求暂时无法保存'},{status:error instanceof InvalidAccountQuery?400:503,headers:privateHeaders});}
}

