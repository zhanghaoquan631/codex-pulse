import {Problem} from './state.js';
import {bounded,putFile} from './files.js';
import {renderDouyin} from './browser-capture.js';
import {fetchPublicEmbed} from './douyin-embed.js';
export function publicURL(value){
  let url;try{url=new URL(value);}catch{throw new Problem('请粘贴有效链接');}
  const host=url.hostname.toLowerCase().replace(/\.$/,'');
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!host.includes('.')||/^[\d.]+$/.test(host)||host.includes(':')||/\.(local|internal|localhost|test|invalid)$/.test(host)||['metadata.google.internal'].includes(host)||url.port&&!['80','443'].includes(url.port))throw new Problem('仅支持公开网页链接');
  return url;
}
export async function getPublic(value){
  let url=publicURL(value);
  try{
  for(let i=0;i<5;i++){
    const response=await fetch(url,{redirect:'manual',headers:{'User-Agent':'Mozilla/5.0','Accept':'text/html,image/*'},signal:AbortSignal.timeout(12000)});
    if([301,302,303,307,308].includes(response.status)) {const location=response.headers.get('location');await response.body?.cancel();if(!location)throw new Problem('来源重定向不完整');url=publicURL(new URL(location,url).href);continue;}
    if(!response.ok){await response.body?.cancel();throw new Problem('原站暂未提供公开预览，请补充封面和原文');}
    return {url:url.href,response};
  }
  throw new Problem('来源重定向过多');
  }catch(error){if(videoIdentity(url.href)?.[0]==='douyin')error.resolvedPreviewURL=url.href;throw error;}
}
const decode=text=>String(text||'').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,x)=>{if(x[0]==='#'){const n=x[1].toLowerCase()==='x'?parseInt(x.slice(2),16):Number(x.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[x.toLowerCase()];});
function attrs(tag){const out={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))out[m[1].toLowerCase()]=decode(m[2]??m[3]??m[4]);return out;}
function videoIdentity(value){
  try{
    const u=new URL(value),host=u.hostname.toLowerCase().replace(/\.$/,'');
    if(['x.com','www.x.com','twitter.com','www.twitter.com'].includes(host)){
      const id=/\/status\/(\d+)(?:\/|$)/.exec(u.pathname)?.[1];return id?['x',id]:null;
    }
    if(host==='douyin.com'||host.endsWith('.douyin.com')||host==='www.iesdouyin.com'){
      const id=/\/(?:share\/)?video\/(\d+)(?:\/|$)/.exec(u.pathname)?.[1]||u.searchParams.get('modal_id');
      return /^\d+$/.test(id||'')?['douyin',id]:null;
    }
  }catch{}
  return null;
}
function imageURL(value,page){
  if(Array.isArray(value)){for(const candidate of value){const found=imageURL(candidate,page);if(found)return found;}return '';}
  if(value&&typeof value==='object')return imageURL(value.url_list||value.urlList||value.url||value.contentUrl,page);
  if(typeof value!=='string'||!value.trim())return '';
  try{const u=publicURL(new URL(value,page).href);return /\.(mp4|webm|mov|m3u8|mpd)$/i.test(u.pathname)?'':u.href;}catch{return '';}
}
function samePage(candidate,page){
  if(typeof candidate!=='string'||!candidate.trim())return false;
  try{
    const a=new URL(candidate,page),b=new URL(page),target=videoIdentity(page),other=videoIdentity(a.href);
    if(!['http:','https:'].includes(a.protocol))return false;
    return target?Boolean(other&&target[0]===other[0]&&target[1]===other[1]):a.host===b.host&&a.pathname.replace(/\/$/,'')===b.pathname.replace(/\/$/,'')&&a.search===b.search;
  }catch{return false;}
}
function linkedToPage(node,page){
  if(['url','@id','mainEntityOfPage'].some(key=>samePage(typeof node[key]==='object'?node[key]?.['@id']||node[key]?.url:node[key],page)))return true;
  const identity=videoIdentity(page);return Boolean(identity&&String(node.identifier||'')===identity[1]);
}
export function extract(html,url){
  const meta={};for(const m of html.matchAll(/<meta\s[^>]*>/gi)){const a=attrs(m[0]);meta[(a.property||a.name||'').toLowerCase()]=a.content||'';}
  const result={url,title:meta['og:title']||meta['twitter:title']||decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]),description:meta['og:description']||meta['twitter:description']||meta.description||'',coverUrl:imageURL(meta['og:image:secure_url']||meta['og:image']||meta['twitter:image']||meta['twitter:image:src'],url),coverKind:'unknown',metadataSource:'page_meta'};
  if(result.coverUrl)result.coverKind='webpage_image';
  const identity=videoIdentity(url),post=identity?.[1],ogIdentity=videoIdentity(meta['og:url']);
  if(identity?.[0]==='x'&&ogIdentity?.[0]==='x'&&post===ogIdentity[1]&&/^https:\/\/pbs\.twimg\.com\/(amplify_video_thumb|ext_tw_video_thumb|tweet_video_thumb)\//.test(result.coverUrl)){result.coverKind='video_cover';result.metadataSource='x_video_thumbnail';}
  const walk=(value,depth=0,budget={left:20000},boundByParent=false)=>{
    if(!value||typeof value!=='object'||depth>24||--budget.left<0)return;
    if(identity?.[0]==='douyin'&&String(value.aweme_id||value.awemeId||value.id||'')===post&&value.video){
      const image=value.video.origin_cover||value.video.originCover||value.video.cover;
      const cover=imageURL(image,url);
      if(cover){result.coverUrl=cover;result.coverKind='video_cover';result.metadataSource='douyin_video_cover';result.description=String(value.desc||value.description||result.description);if(value.desc)result.title=String(value.desc).slice(0,120);}
    }
    const bound=linkedToPage(value,url),types=Array.isArray(value['@type'])?value['@type']:[value['@type']];
    if(types.some(type=>['VideoObject','https://schema.org/VideoObject','http://schema.org/VideoObject'].includes(type))&&(bound||boundByParent)){
      const cover=imageURL(value.thumbnailUrl||value.thumbnail,url);
      if(cover){result.coverUrl=cover;result.coverKind='video_cover';result.metadataSource='jsonld_video';result.description=String(value.description||result.description);result.title=String(value.name||result.title);}
    }
    for(const child of Object.values(value))walk(child,depth+1,budget,bound&&child===value.mainEntity);
  };
  for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
    const a=attrs(m[1]),type=(a.type||'').split(';')[0].trim().toLowerCase();let raw=m[2].trim();
    if(!['application/ld+json','application/json'].includes(type)&&!['RENDER_DATA','__UNIVERSAL_DATA_FOR_REHYDRATION__'].includes(a.id)){
      const assignment=identity?.[0]==='douyin'?/^(?:window\.)?_ROUTER_DATA\s*=\s*(\{[\s\S]*\})\s*;?$/.exec(raw):null;
      if(!assignment)continue;raw=assignment[1];
    }
    // Parse literal data only; never evaluate publisher JavaScript.
    try{walk(JSON.parse(a.id==='RENDER_DATA'?decodeURIComponent(raw):raw));}catch{}
  }
  result.source=/\b(?:x|twitter)\.com\//.test(url)?'x':/\bdouyin\.com\//.test(url)?'douyin':'manual';
  result.sourceLabel={x:'X',douyin:'抖音视频',manual:'网页链接'}[result.source];
  return result;
}
export async function preview(env,value,{allowBrowser=true}={}){
  const requested=publicURL(value).href;
  let result={url:requested,title:'',description:'',coverUrl:'',coverKind:'unknown',metadataSource:'none',source:'manual',sourceLabel:'网页链接'};
  try{
    const page=await getPublic(requested),html=new TextDecoder().decode(await bounded(page.response,1024*1024));
    result=extract(html,page.url);
  }catch(error){if(error.resolvedPreviewURL)result.url=error.resolvedPreviewURL;result.captionWarning=error.message||'原站暂未返回预览，请手动补充';}
  const identity=videoIdentity(result.url);
  if(allowBrowser&&identity?.[0]==='douyin'&&(!result.description||result.coverKind!=='video_cover'||!result.coverUrl)){
    const embed=await fetchPublicEmbed(identity[1]);
    if(embed) Object.assign(result,{description:embed.caption,title:embed.caption.slice(0,120),source:'douyin',sourceLabel:'抖音视频',metadataSource:'douyin_official_title',captionWarning:''});
    const rendered=await renderDouyin(env,'https://www.douyin.com/video/'+identity[1],embed);
    if(rendered.html&&!embed){
      const structured=extract(rendered.html,'https://www.douyin.com/video/'+identity[1]);
      if(structured.coverKind==='video_cover'&&structured.coverUrl){
        rendered.capture={...structured,description:rendered.capture?.description||structured.description,
          title:rendered.capture?.title||structured.title,metadataSource:'cloud_browser_'+structured.metadataSource};
        if(rendered.capture.description){rendered.status='ready';rendered.warning='';}
      }
    }
    result.browserCaptureStatus=rendered.status;
    if(rendered.capture){
      if(rendered.capture.coverUrl&&rendered.capture.description){result={...result,...rendered.capture,captionWarning:''};}
      else if(!result.description&&rendered.capture.description){result.description=rendered.capture.description;result.title=result.title||rendered.capture.title;}
    }
    if(rendered.warning)result.captionWarning=rendered.warning;
  }
  if(result.coverUrl){result.originalCoverUrl=result.coverUrl;result.coverStorage='remote';try{const cover=await getPublic(result.coverUrl);if(!cover.response.headers.get('content-type')?.startsWith('image/'))throw new Problem('未返回图片');const saved=await putFile(env,await bounded(cover.response,10*1024*1024),'cover',{sourceUrl:result.coverUrl});if(!saved.type.startsWith('image/'))throw new Problem('不是图片');result.coverUrl=saved.url;result.coverStorage='local';}catch{result.coverWarning='封面暂未备份，当前使用原站图片。';}}
  result.previewStatus=result.coverUrl&&result.description&&(identity?.[0]!=='douyin'||result.coverKind==='video_cover')?'ready':'incomplete';return result;
}
