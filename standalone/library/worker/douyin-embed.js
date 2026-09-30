import {bounded} from './files.js';

// Public, credential-free API documented by Douyin. The returned video_title
// is the publisher's video title/caption, not speech or a generated transcript.
export function validEmbedPlayer(value,id) {
  try {
    const u=new URL(value);
    return /^\d+$/.test(id) && u.origin==='https://open.douyin.com' && !u.username && !u.password && !u.port && !u.hash &&
      u.pathname==='/player/video' && u.searchParams.getAll('vid').length===1 && u.searchParams.get('vid')===id &&
      [...u.searchParams.keys()].every(key=>['vid','autoplay'].includes(key));
  } catch { return false; }
}

export async function fetchPublicEmbed(id) {
  if(!/^\d+$/.test(id)) return null;
  try {
    const response=await fetch('https://open.douyin.com/api/douyin/v1/video/get_iframe_by_video?video_id='+id,
      {redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Accept:'application/json'}});
    if(!response.ok) { await response.body?.cancel(); return null; }
    const payload=JSON.parse(new TextDecoder().decode(await bounded(response,256*1024)));
    const caption=payload?.data?.video_title,code=payload?.data?.iframe_code;
    if(payload?.err_no!==0 || typeof caption!=='string' || !caption.trim() || caption.length>50000 || typeof code!=='string') return null;
    const frames=[...code.matchAll(/<iframe\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi)];
    if(frames.length!==1) return null;
    const playerUrl=frames[0][2].replaceAll('&amp;','&');
    if(!validEmbedPlayer(playerUrl,id)) return null;
    return {caption,playerUrl:'https://open.douyin.com/player/video?vid='+id+'&autoplay=0'};
  } catch { return null; }
}
