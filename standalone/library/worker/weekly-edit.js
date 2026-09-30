import {Problem} from './state.js';
import {periodDraft,periodFields} from './periods.js';
import {textStyleFields} from './text-style-schema.js';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export const issueDraft=issue=>({title:issue.title||'',date:issue.date||'',intro:issue.intro||'',coverUrl:issue.coverUrl||'',items:issue.items||[],...periodDraft(issue),...textStyleFields(issue)});
function text(value,max,label,required=false){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw new Problem(label+'格式不正确或超出长度');return value;}
export function editIssue(state,id,payload){
  const issue=state.newsletters.find(x=>x.id===id&&!x.deletedAt);if(!issue)throw new Problem('找不到这期周刊或它已删除',404);
  if(!payload||typeof payload!=='object'||!same(issueDraft(issue),{...payload.base,coverUrl:payload.base?.coverUrl||''}))throw new Problem('这期周刊已在另一设备更新，请保留草稿并重新打开核对',409);
  const title=text(payload.title,120,'周刊标题',true),date=text(payload.date,40,'日期',true),intro=text(payload.intro,1000,'导语');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Problem('请选择有效日期');
  if(!Array.isArray(payload.items)||payload.items.length!==issue.items.length||payload.items.some((x,i)=>!x||x.id!==issue.items[i].id))throw new Problem('周刊条目发生变化，请重新打开');
  const items=issue.items.map((original,i)=>{const input=payload.items[i];const title=text(input.title,300,'条目标题',true),caption=text(input.caption,50000,'原文'),body=text(input.body,50000,'笔记');
    if(!Number.isInteger(input.rating)||input.rating<0||input.rating>5||!Number.isInteger(input.sequence)||input.sequence<1||input.sequence>999999)throw new Problem('请检查星级和序号');
    if(original.url&&!caption.trim())throw new Problem('链接条目的原始文案不能为空');
    const coverUrl=input.coverUrl===undefined?original.coverUrl:imageUrl(input.coverUrl);
    return {...original,title,caption,body,coverUrl,rating:input.rating,sequence:input.sequence,...textStyleFields(input)};
  });
  const coverUrl=payload.coverUrl===undefined?(issue.coverUrl||''):imageUrl(payload.coverUrl);
  Object.assign(issue,{title,date,intro,coverUrl,items,...periodFields(payload),...textStyleFields(payload),updatedAt:new Date().toISOString()});return {newsletter:issue};
}

function imageUrl(value){if(typeof value!=='string'||value.length>4096)throw new Problem('封面地址格式不正确');if(!value||/^\/api\/files\/[a-f0-9]{32}$/.test(value))return value;try{const url=new URL(value);if(['http:','https:'].includes(url.protocol))return value;}catch{}throw new Problem('请使用图片链接或上传图片');}
