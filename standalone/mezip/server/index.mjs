import {createAuth,sameOrigin} from './auth.mjs';
import {handleMedia} from './media.mjs';
import {handleGallery} from './gallery/gallery.mjs';
import {handleAccountData} from './account-data.mjs';
import staticImageAliases from './static-image-aliases.json' with {type:'json'};
import {createRacingHandler} from './racing/racing-http.mjs';
import raceTracks from '../apps/racing/competition/shared/tracks.mjs';
const handleRacing=createRacingHandler(raceTracks);

const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function boundJSON(request,limit=65536){
 if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return request;
 if(Number(request.headers.get('Content-Length'))>limit)throw new Error('BODY_LIMIT');
 const reader=request.body?.getReader();if(!reader)return request;
 const chunks=[];let n=0;
 while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>limit){await reader.cancel();throw new Error('BODY_LIMIT');}chunks.push(value);}
 const data=new Uint8Array(n);let at=0;for(const c of chunks){data.set(c,at);at+=c.length;}
 return new Request(request.url,{method:request.method,headers:request.headers,body:data});
}
async function fetchSite(request,env,ctx){
 const u=new URL(request.url),p=u.pathname;
 const raceResponse=await handleRacing(request,env);if(raceResponse)return raceResponse;
 if(p.startsWith('/api/')||p.startsWith('/media/user-uploads/')||p.startsWith('/gallery/uploads/')){
  if(!env.DB||!env.AUTH_SECRET)return json({error:'服务正在配置，请稍后重试。'},503);
  if(!['GET','HEAD'].includes(request.method)&&!sameOrigin(request,env.PUBLIC_BASE_URL))return json({error:'请求来源无效。'},403);
  request=await boundJSON(request);
  const auth=createAuth({db:env.DB,env});
  if(p==='/api/health')return json({ok:true,service:'mezip-cloud',emailConfigured:auth.emailConfigured,emailProvider:env.EMAIL_PROVIDER||'brevo',accessControl:env.AUTH_PROVIDER==='chatgpt'?'chatgpt':'email-verification'});
  const authResult=await auth.handle(request);if(authResult)return authResult;
  const user=await auth.resolveUser(request);
  for(const handle of [handleMedia,handleGallery,handleAccountData]){const response=await handle(request,env,user);if(response)return response;}
  return json({error:'接口不存在。'},404);
 }
 if(!env.ASSETS)return new Response('页面暂时不可用',{status:503});
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 // Aliases preserve the gallery's existing persistent photo IDs without duplicating 180 MB.
 let staticPath=p;
 if(p.startsWith('/original-image-library/'))staticPath=p.replace('/original-image-library/','/media/wechat-cards-20260827/');
 if(p.startsWith('/wechat-0051/')||p.startsWith('/wechat-0327/'))staticPath='/media/gallery-rewards'+p;
 if(p==='/gallery-version.json')staticPath='/infinite-gallery/gallery-version.json';
 if(p==='/upload.html'||p==='/upload.js'||p==='/upload.css')staticPath='/infinite-gallery'+p;
 if(staticImageAliases[staticPath])staticPath=staticImageAliases[staticPath].path;
 if(['/account','/playground','/infinite-gallery','/booking','/racing','/racing/competition'].includes(p))return Response.redirect(u.origin+p+'/'+u.search,308);
 const target=new URL(request.url);target.pathname=staticPath;
 let response=await env.ASSETS.fetch(new Request(target,request));
 if(response.status===404&&/^\/infinite-gallery\/wechat-(0051|0327)\//.test(p)){
  target.pathname=p.replace('/infinite-gallery/','/media/gallery-rewards/');
  response=await env.ASSETS.fetch(new Request(target,request));
 }
 if(response.status===404&&!/\.[a-z0-9]+$/i.test(p)){
  target.pathname=p.startsWith('/racing/competition/')?'/racing/competition/index.html':p.startsWith('/racing/')?'/racing/index.html':p.startsWith('/account/')?'/account/index.html':p.startsWith('/playground/')?'/playground/index.html':p.startsWith('/infinite-gallery/')?'/infinite-gallery/index.html':p.startsWith('/booking/')?'/booking/index.html':'/index.html';
  response=await env.ASSETS.fetch(new Request(target,request));
 }
 return response;
}
export default {async fetch(request,env,ctx){
 try{
  const response=await fetchSite(request,env,ctx);
  const headers=new Headers(response.headers);
  headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');
  headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
 }catch(error){
  if(error.message==='BODY_LIMIT')return json({error:'提交内容过大。'},413);
  if(error instanceof SyntaxError)return json({error:'提交内容格式无效。'},400);
  console.error('Request failed',error.name);
  return json({error:'服务暂时不可用，请稍后重试。'},503);
 }
}};
