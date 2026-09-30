"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import type {AccountQuery,QueryControl} from '@/lib/account-query';
export function useAccountQueries(canManage:boolean,onRefresh:()=>void){
 const [queries,setQueries]=useState<AccountQuery[]>([]),[control,setControl]=useState<QueryControl|null>(null),[workerOnline,setWorkerOnline]=useState(false),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const refresh=useRef(onRefresh),completed=useRef('');refresh.current=onRefresh;
 const load=useCallback(async(signal?:AbortSignal)=>{try{const r=await fetch('/api/accounts/query',{cache:'no-store',signal}),b=await r.json() as {queries:AccountQuery[];control:QueryControl;workerOnline:boolean;error?:string};if(!r.ok)throw new Error(b.error||'查询状态暂时无法读取');setQueries(b.queries);setControl(b.control);setWorkerOnline(b.workerOnline);setError('');
 const key=b.queries.filter((q:AccountQuery)=>q.state==='succeeded'||q.state==='partial').map((q:AccountQuery)=>q.id).join(',');if(completed.current&&completed.current!==key)refresh.current();completed.current=key||'none';
 }catch(e){if(!signal?.aborted)setError(e instanceof Error?e.message:'查询状态暂时无法读取');}},[]);
 useEffect(()=>{if(!canManage)return;const c=new AbortController();load(c.signal);const timer=setInterval(()=>load(c.signal),10000);return()=>{c.abort();clearInterval(timer);};},[canManage,load]);
 const send=useCallback(async(input:Record<string,unknown>)=>{setSaving(true);setError('');try{const r=await fetch('/api/accounts/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),b=await r.json() as {error?:string};if(!r.ok)throw new Error(b.error||'查询请求无法保存');await load();}catch(e){setError(e instanceof Error?e.message:'查询请求无法保存');}finally{setSaving(false);}},[load]);
 return {queries,control,workerOnline,error,saving,request:(email:string|null)=>send({action:'query',email}),configure:(enabled:boolean)=>send({action:'configure',enabled})};
}
export function accountQueryLabel(q:AccountQuery|undefined){if(!q)return '尚无官网查询记录';return q.state==='queued'?'等待后台查询':q.state==='running'?'正在核对官网账号':q.message||'查询状态待确认';}
