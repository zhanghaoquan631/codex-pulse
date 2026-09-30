export const textOperations = [
  ['upper','全部大写'],['lower','全部小写'],['title','英文首字母大写'],['camel','camelCase'],['snake','snake_case'],['kebab','kebab-case'],
  ['sort','按行排序'],['dedupe','按行去重'],['join','合并 PDF 换行'],['trim','移除首尾空白'],['spaceCJK','中英文加空格'],
  ['jsonPretty','格式化 JSON'],['jsonMinify','压缩 JSON'],['urlEncode','URL 编码'],['urlDecode','URL 解码'],['cleanURL','清除链接追踪参数'],['count','字数统计']
] as const;
export type TextOperation = typeof textOperations[number][0];
export function transformText(text:string, op:TextOperation):string {
  const words=()=>text.replace(/([a-z\d])([A-Z])/g,'$1 $2').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  switch(op){
    case 'upper':return text.toUpperCase();
    case 'lower':return text.toLowerCase();
    case 'title':return text.toLowerCase().replace(/\b[a-z]/g,c=>c.toUpperCase());
    case 'camel':return words().map((w,i)=>i?w[0].toUpperCase()+w.slice(1).toLowerCase():w.toLowerCase()).join('');
    case 'snake':return words().map(w=>w.toLowerCase()).join('_');
    case 'kebab':return words().map(w=>w.toLowerCase()).join('-');
    case 'sort':return text.split(/\r?\n/).sort((a,b)=>a.localeCompare(b,'zh-CN')).join('\n');
    case 'dedupe':return [...new Set(text.split(/\r?\n/))].join('\n');
    case 'join':return text.split(/\r?\n\s*\r?\n/).map(p=>p.replace(/([^\s])\r?\n\s*([^\s])/g,(_,a,b)=>/[\u3400-\u9fff]/.test(a+b)?a+b:a+' '+b)).join('\n\n');
    case 'trim':return text.trim();
    case 'spaceCJK':return text.replace(/([\u3400-\u9fff])([A-Za-z0-9])/g,'$1 $2').replace(/([A-Za-z0-9])([\u3400-\u9fff])/g,'$1 $2');
    case 'jsonPretty':return JSON.stringify(JSON.parse(text),null,2);
    case 'jsonMinify':return JSON.stringify(JSON.parse(text));
    case 'urlEncode':return encodeURIComponent(text);
    case 'urlDecode':return decodeURIComponent(text);
    case 'cleanURL':return text.replace(/https?:\/\/[^\s<>"']+/g,raw=>{try{const url=new URL(raw);for(const key of [...url.searchParams.keys()])if(/^utm_/i.test(key)||['fbclid','gclid','msclkid','mc_cid','mc_eid','igshid'].includes(key.toLowerCase()))url.searchParams.delete(key);return url.toString();}catch{return raw;}});
    case 'count':return `字符数：${[...text].length}\n非空白字符：${[...text.replace(/\s/g,'')].length}\n中文字符：${(text.match(/[\u3400-\u9fff]/g)||[]).length}\n英文词数：${(text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[]).length}\n行数：${text?text.split(/\r?\n/).length:0}`;
  }
}
