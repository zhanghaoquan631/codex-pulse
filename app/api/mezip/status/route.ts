import { isOwner } from '@/lib/website-api';
import { bridgeStatus, connected, reply } from '@/lib/mezip-api';
export async function GET(request:Request) {
  if(!isOwner(request))return reply({canManage:false,connected:false,lastSeen:null},403);
  try {const status=await bridgeStatus();return reply({canManage:true,connected:connected(status),lastSeen:status?.last_seen?new Date(status.last_seen).toISOString():null,label:'这台电脑上的 ME.zip'});}
  catch{return reply({canManage:true,connected:false,lastSeen:null,error:'连接服务暂时不可用'},503);}
}
