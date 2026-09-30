import { isOwner, websiteId } from './website-api';
export const compassHeaders={'Cache-Control':'private, no-store',Vary:'Cookie, Authorization, OAI-Authenticated-User-Id, OAI-Authenticated-User-Email','X-Content-Type-Options':'nosniff'};
export const compassReply=(body:unknown,status=200)=>Response.json(body,{status,headers:compassHeaders});
export async function compassScope(request:Request){const id=request.headers.get('oai-authenticated-user-id');return id&&isOwner(request)?websiteId('compass:'+id):null;}
