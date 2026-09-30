import {database} from '@/db/raw';
import {isOwner,canWrite,boundedJson,privateHeaders} from '@/lib/website-api';
import {accountEmail} from '@/lib/account-label';

export async function GET(request:Request){
  try {
    const rows=await database().prepare('SELECT email,name,hidden FROM quota_accounts ORDER BY email').all();
    return Response.json({accounts:rows.results,canManage:isOwner(request)},{headers:privateHeaders});
  } catch {return Response.json({error:'账号列表暂时无法读取，请稍后重试'},{status:503,headers:privateHeaders});}
}
export async function POST(request:Request){
  if(!canWrite(request))return Response.json({error:'请使用网站管理账号登录后添加或移除账号'},{status:403,headers:privateHeaders});
  try {
    const input=await boundedJson(request,3000),email=accountEmail(input.email)?.toLowerCase();
    if(!email||!['add','hide','restore'].includes(input.action))return Response.json({error:'请输入有效的邮箱地址'},{status:400,headers:privateHeaders});
    const name=typeof input.name==='string'?input.name.trim().slice(0,60):'';
    if(input.action==='add'){
      await database().prepare('INSERT INTO quota_accounts(email,name,hidden,created_at) VALUES(?,?,0,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,hidden=0').bind(email,name,new Date().toISOString()).run();
    } else {
      await database().prepare('INSERT INTO quota_accounts(email,name,hidden,created_at) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET hidden=excluded.hidden').bind(email,'',input.action==='hide'?1:0,new Date().toISOString()).run();
    }
    return Response.json({ok:true},{headers:privateHeaders});
  }catch{return Response.json({error:'保存失败，请重试；输入内容已保留'},{status:503,headers:privateHeaders});}
}
