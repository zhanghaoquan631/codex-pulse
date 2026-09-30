import {periodLabel} from './periods.js';
export const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const external=value=>{try{const u=new URL(value);return /^https?:$/.test(u.protocol)?u.href:'';}catch{return '';}};
export const compare=(a,b)=>(Number(b.rating)||0)-(Number(a.rating)||0)||(Number(a.sequence)||99999)-(Number(b.sequence)||99999);
export function renderIssue(issue){
  let outline='',articles='';
  for(const [i,item] of [...issue.items].sort(compare).entries()){
    const number=escape(item.sequence||i+1),name=escape(item.title),url=escape(external(item.url)),rating=Math.max(0,Math.min(5,Math.trunc(Number(item.rating)||0)));
    const local=/^\/api\/files\/([a-f0-9]{32})$/.exec(item.coverUrl||'');
    const cover=escape(local?'/share/'+encodeURIComponent(issue.token)+'/files/'+local[1]:external(item.coverUrl));
    const styleData=escape(JSON.stringify(item.textStyle??null)),contextData=escape(JSON.stringify({title:item.title,tags:item.tags,context:item.caption||item.desc||''}));
    outline+=`<a href="#entry-${i}">${number}. ${name}</a>`;
    articles+=`<section id="entry-${i}"><h2><span>${number}.</span> ${name}</h2><p class="stars" aria-label="${rating} 星">${'★'.repeat(rating)}${'☆'.repeat(5-rating)}</p>${url?`<a class="source" href="${url}" target="_blank" rel="noreferrer">${url} ↗</a>`:''}<p class="caption" data-text-styling data-text-style='${styleData}' data-text-context='${contextData}'>${escape(item.caption||item.desc)}</p>${cover?`<a class="media" href="${url||cover}" target="_blank" rel="noreferrer"><img src="${cover}" alt="${name}的封面" loading="lazy" referrerpolicy="no-referrer"></a>`:''}</section>`;
  }
  const rawCover=issue.coverUrl||[...issue.items].sort(compare).find(x=>x.coverUrl)?.coverUrl,localCover=/^\/api\/files\/([a-f0-9]{32})$/.exec(rawCover||''),issueCover=escape(localCover?'/share/'+encodeURIComponent(issue.token)+'/files/'+localCover[1]:external(rawCover));
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(issue.title)}</title><link rel="stylesheet" href="/weekly.css"><link rel="stylesheet" href="/text-styling.css"></head><body class="public-issue"><header class="publication-bar"><b>灵感内刊</b><span>${escape(issue.date)} · 只读分享</span><button onclick="window.print()">打印 / 保存 PDF</button></header><div class="publication-layout"><aside><p class="eyebrow">WEEKLY EDITION</p><h1>${escape(issue.title)}</h1><nav>${outline}</nav></aside><main><header><h1>${escape(issue.title)}</h1><p>${escape(issue.date)}</p><p>${escape(periodLabel(issue))}</p><p class="caption" data-text-styling data-text-style='${escape(JSON.stringify(issue.textStyle??null))}'>${escape(issue.intro)}</p>${issueCover?`<img class="issue-cover" src="${issueCover}" alt="本期封面" referrerpolicy="no-referrer">`:''}</header>${articles}<footer>本期共 ${issue.items.length} 条内容 · 点击封面或来源链接访问原内容</footer></main></div><script src="/text-styling.js"></script></body></html>`;
}
