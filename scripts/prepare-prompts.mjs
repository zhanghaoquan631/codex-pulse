import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root=process.cwd();
function readModule(relative){
 const file=path.resolve(root,relative);
 if(file.endsWith('.json'))return JSON.parse(fs.readFileSync(file,'utf8'));
 const output=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true}}).outputText;
 const module={exports:{}};
 new Function('require','module','exports',output)(id=>readModule(path.relative(root,path.resolve(path.dirname(file),id.endsWith('.json')?id:id+'.ts'))),module,module.exports);
 return module.exports;
}
const {sourceProjects,sourceRepository}=readModule('lib/source-library.ts');
const catalog=readModule('lib/feature-source-catalog.json');
const lines=['# 逐功能复现提示词','','以下为按现有功能整理的提示词，不是原始对话记录。每项链接对应真实源码入口；共用实现的子功能共用完整模块包。',''];
for(const section of catalog.sections){
 lines.push('## '+section.title,'');
 for(const entry of section.items){
  const item=sourceProjects[entry.id];
  if(!item||!fs.existsSync(path.join(root,item.path)))throw Error('Missing source entry: '+entry.id+' '+item?.path);
  lines.push('### '+entry.title,'',`[源码](${sourceRepository}/tree/main/${item.path}) · [模块 ZIP](${sourceRepository}/releases/download/${item.release}/${item.bundle}.zip)`,'','```text',item.prompt,'```','');
 }
}
lines.push('## 独立地图与游戏','');
for(const id of ['chaoshan-map','chaoshan-adventure','rooster-rush','xiamen-map','zju-overworld']){
 const item=sourceProjects[id];lines.push('### '+item.title,'',`[源码](${sourceRepository}/tree/main/${item.path})`,'','```text',item.prompt,'```','');
}
fs.writeFileSync('docs/feature-prompts.md',lines.join('\n'));
console.log(JSON.stringify({sections:catalog.sections.length,features:catalog.sections.flatMap(s=>s.items).length,mapProjects:5}));
