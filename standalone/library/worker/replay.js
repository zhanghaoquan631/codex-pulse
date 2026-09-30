import {load} from './state.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function page(title,content,status,method){
  const body=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escape(title)} · 直播回放</title><link rel="stylesheet" href="/replay.css"><script src="/replay.js" defer></script></head><body><main><a class="back" href="/?view=live">← 我的直播回放</a>${content}</main></body></html>`;
  return new Response(method==='HEAD'?null:body,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; media-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'"}});
}
export async function replayPage(request,env,id){
  const fileUrl='/api/files/'+id,{state}=await load(env);
  const item=state.content.find(x=>x.kind==='live-replay'&&!x.deletedAt&&x.fileUrl===fileUrl);
  const file=item?await env.BUCKET.head('files/'+id):null;
  if(!item||!file)return page('回放不可用','<section><h1>这段回放暂时无法打开</h1><p>回放可能已删除。请返回直播回放历史查看。</p></section>',404,request.method);
  const playable=['video/mp4','video/webm'].includes(file.httpMetadata?.contentType);
  const date=new Date(item.liveEndedAt||item.createdAt),when=Number.isNaN(date.getTime())?'':date.toLocaleString('zh-CN',{timeZone:'Asia/Taipei'});
  const title=item.title||'直播回放';
  return page(title,`<section><span class="eyebrow">我的直播回放</span><h1>${escape(title)}</h1><p class="meta">${escape(when)}${when?' · ':''}${(file.size/1024/1024).toFixed(1)} MB</p>${playable?`<video controls playsinline preload="metadata" src="${fileUrl}" aria-label="${escape(title)}"><a href="${fileUrl}">下载回放</a></video><p class="hint" id="playbackStatus" role="status">点击播放，即可观看这段回放。</p>`:'<p class="hint">这段回放使用 MKV 格式，请下载后用本地播放器观看。</p>'}<div class="actions"><button id="copyReplayLink" type="button">复制回放链接</button><a class="button secondary" href="${fileUrl}" download="${escape(item.fileName||'直播回放')}">下载回放</a></div><p id="linkStatus" class="hint" role="status">手机和电脑打开同一链接，登录你的账号即可观看。</p><input id="replayLink" aria-label="回放链接" readonly hidden></section>`,200,request.method);
}
