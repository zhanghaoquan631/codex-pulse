import {factsCheckedAt,factsMethod,factsForPlace,formatFact,regionalSources} from './regional-facts.mjs';

const el=(tag,className,text)=>{const node=document.createElement(tag);node.className=className||'';if(text)node.textContent=text;return node;};
export function createRegionalFactsView(){
 const root=el('section','regional-facts');root.setAttribute('aria-label','地区人口、收入与特色');root.hidden=true;
 const head=el('div','regional-facts-heading'),heading=el('h3','','地区数据'),date=el('p','regional-facts-date',`核验日期 ${factsCheckedAt}`);
 head.append(heading,date);
 const scope=el('p','regional-facts-scope'),metrics=el('dl','regional-facts-metrics'),availability=el('p','regional-facts-availability');
 const traits=el('div','regional-facts-traits'),sources=el('details','regional-facts-sources'),summary=el('summary','','统计口径与官方来源'),method=el('p','',factsMethod),list=el('ol');
 sources.append(summary,method,list);root.append(head,scope,metrics,availability,traits,sources);
 function render(place){
  const data=factsForPlace(place);root.hidden=!data;if(!data){metrics.replaceChildren();traits.replaceChildren();list.replaceChildren();return;}
  scope.textContent=`统计范围：${data.scope}`;metrics.replaceChildren();traits.replaceChildren();list.replaceChildren();sources.open=false;
  const ids=[...new Set([data.population?.sourceId,data.income?.sourceId,...data.traits.map(t=>t.sourceId)].filter(Boolean))];
  const addCitation=(parent,id,locator)=>{
   const a=el('a','regional-facts-citation',`[${ids.indexOf(id)+1}]`),s=regionalSources[id];a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';a.title=`${s.title} · ${locator||''}`;a.setAttribute('aria-label',`查看来源：${s.title}`);parent.append(a);
  };
  for(const [label,metric] of [['常住人口',data.population],['居民人均可支配收入',data.income]]){
   const row=el('div','regional-facts-metric'),dt=el('dt','',label),value=el('dd','regional-facts-value',formatFact(metric));
   if(metric)value.append(el('span','regional-facts-unit',metric.unit));else value.classList.add('is-unavailable');
   const period=el('dd','regional-facts-period',metric?.period||'暂无已核实数值');
   if(metric)addCitation(period,metric.sourceId,metric.locator);
   row.append(dt,value,period);
   if(metric?.urban!=null){
    const sub=el('dd','regional-facts-breakdown');sub.append(el('span','',`城镇 ${metric.urban.toLocaleString('zh-CN')} 元`),el('span','',`农村 ${metric.rural.toLocaleString('zh-CN')} 元`));row.append(sub);
   }
   metrics.append(row);
  }
  const annual=data.income&&data.income.periodEnd<'2026-01-01';
  availability.textContent=data.availability||(annual?'收入采用已核实的2025年全年值；本次未核实到该县区2026年收入数值，不代表断言尚未发布。':'2026年收入为上半年累计值；人口采用2025年末口径。2026年全年数据尚未形成。');
  for(const item of data.traits){const block=el('div'),h=el('h4','',item.title),p=el('p','',item.text);addCitation(p,item.sourceId,item.locator);block.append(h,p);traits.append(block);}
  for(const id of ids){
   const s=regionalSources[id],item=el('li'),a=el('a','',s.title);a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';
   item.append(a,el('p','',`${s.publisher} · ${s.publishedAt?'发布于 '+s.publishedAt:'发布日期见原文'}`));
   const locators=[data.population,data.income,...data.traits].filter(m=>m?.sourceId===id).map(m=>m.locator).filter(Boolean);
   item.append(el('p','',locators.join('；')));list.append(item);
  }
 }
 return {element:root,render};
}
