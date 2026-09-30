import {cleanWebsiteUrl} from '../lib/website-url.ts';

const excludedAsset=/\.(?:png|jpe?g|gif|webp|svg|ico|mp[34]|wav|pdf|zip|tar|gz|exe|dmg|docx?|xlsx?|pptx?)(?:$|\?)/i;
export function extractWebsites(record){
  const p=record.payload;
  // User-visible assistant answers only; tool output and user-provided documents are never instructions.
  const final=record.type==='response_item'&&p?.type==='message'&&p.role==='assistant'&&(p.phase==='final_answer'||p.phase==='final'||(!p.phase&&p.channel==='final'));
  const legacy=record.type==='event_msg'&&p?.type==='task_complete'&&typeof p.last_agent_message==='string';
  if(!final&&!legacy)return [];
  if(!Number.isFinite(Date.parse(record.timestamp)))return [];
  const raw=legacy?p.last_agent_message:(p.content||[]).filter(part=>part.type==='output_text'&&typeof part.text==='string').map(part=>part.text).join('\n');
  const text=raw.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g,'').replace(/^\s*>.*$/gm,'').replace(/<untrusted_text>[\s\S]*?<\/untrusted_text>/g,'');
  const results=new Map(),stamp=new Date(record.timestamp).toISOString();
  function add(raw,label,index){
    const url=cleanWebsiteUrl(raw.replace(/[.,;:!?，。；！？、]+$/u,''));if(!url||excludedAsset.test(url))return;
    const host=new URL(url).hostname;
    if(/(?:^|\.)(?:example\.(?:com|org|net)|localhost\.run|oaiusercontent\.com)$/.test(host)||host==='git.chatgpt-team.site')return;
    const context=text.slice(Math.max(0,index-100),index+raw.length+80);
    const local=host==='localhost'||host==='127.0.0.1'||host==='[::1]';
    const kind=local||/(?:你的|您的|本次|项目|网站).{0,16}(?:上线|部署|预览|作品|网站)|(?:已上线|部署成功|开发完成|预览地址|公开链接|production URL|deployed (?:at|to))/i.test(context)?'developed':'shared';
    const title=String(label||'').replace(/[*`_]/g,'').trim().slice(0,120);
    const usefulTitle=title&&!/^https?:|^(?:这里|点击|链接|查看|打开|here|link|source)$/i.test(title)?title:host;
    const previous=results.get(url);
    results.set(url,{url,title:previous&&previous.title!==host&&(usefulTitle===host||previous.title.length>usefulTitle.length)?previous.title:usefulTitle,kind:previous?.kind==='developed'?'developed':kind,firstSeen:stamp,lastSeen:stamp});
  }
  const markdown=/\[([^\]\n]{1,160})\]\(<?(https?:\/\/[^\s<>]+?)>?(?:\s+"[^"]*")?\)/g;
  const spans=[];for(const match of text.matchAll(markdown)){add(match[2],match[1],match.index);spans.push([match.index,match.index+match[0].length]);}
  for(const match of text.matchAll(/https?:\/\/[^\s<>"`\[\]{}，。；！？，、]+/g)){
    if(spans.some(([start,end])=>match.index>=start&&match.index<end))continue;
    add(match[0].replace(/[)]+$/,''),'',match.index);
  }
  return [...results.values()];
}
