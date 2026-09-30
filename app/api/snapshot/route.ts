import {database} from '@/db/raw';
import {isOwner,privateHeaders} from '@/lib/website-api';
import {overlaySnapshotEvidence,readQuotaEvidence} from '@/lib/quota-evidence';
import {readOfficialHistory} from '@/lib/account-query';

export async function GET(request:Request){
  try{
    const db=database(),hostname=new URL(request.url).hostname;
    let response:{snapshot:Record<string,unknown>|null;receivedAt?:string|null}|undefined;
    if(hostname==='127.0.0.1'||hostname==='localhost'){
      try{const local=await fetch('http://127.0.0.1:43871/snapshot',{signal:AbortSignal.timeout(1500)});if(local.ok)response=await local.json();}catch{}
    }
    if(!response){const row=await db.prepare('SELECT payload,updated_at FROM snapshots WHERE id=?').bind(1).first<{payload:string;updated_at:string}>();response={snapshot:row?JSON.parse(row.payload):null,receivedAt:row?.updated_at||null};}
    const evidence=await readQuotaEvidence(db);
    const owner=isOwner(request),snapshot=overlaySnapshotEvidence(response.snapshot,evidence,owner);
    if(owner&&snapshot){const history=await readOfficialHistory(db);snapshot.quotaHistory=[...snapshot.quotaHistory,...history];}
    return Response.json({...response,snapshot},{headers:privateHeaders});
  }catch{return Response.json({error:'数据暂时无法读取'},{status:503,headers:privateHeaders});}
}

