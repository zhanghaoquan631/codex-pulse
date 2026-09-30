import { database } from '@/db/raw';
export const mezipHeaders = {'Cache-Control':'no-store', 'Vary':'Cookie', 'X-Content-Type-Options':'nosniff'};
export const validCommandId = (id:unknown):id is string => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export async function bridgeStatus() {
  return database().prepare('SELECT device_id, online, last_seen FROM mezip_connection WHERE id=1').first<{device_id:string;online:number;last_seen:number}>();
}
export function connected(status:{online:number;last_seen:number}|null) {
  return !!status?.online && Date.now() - status.last_seen < 45000;
}
export function reply(data:unknown,status=200) {return Response.json(data,{status,headers:mezipHeaders});}
