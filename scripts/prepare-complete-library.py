"""Build one audited source package per functional module; subfeatures share its implementation."""
from pathlib import Path
import importlib.util, json, hashlib, zipfile
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('source_bundle',ROOT/'scripts/prepare-source-library.py')
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
CAT=json.loads((ROOT/'lib/feature-source-catalog.json').read_text(encoding='utf-8'))
MAPS={'chaoshan-map','chaoshan-adventure','rooster-rush','xiamen-map','zju-overworld'}
COMMON=['app','lib','components','hooks','db','drizzle','build','scripts','package.json','package-lock.json','tsconfig.json','vite.config.ts','postcss.config.mjs','drizzle.config.ts','.gitignore','.openai/hosting.json','README.md','docs/development.md','docs/full-source-guide.md','docs/feature-prompts.md','LICENSES.md','licenses']
GROUPS={
 'core':[], 'tokens':['collector'], 'websites':['collector'], 'betteropc':[],
 'knowledge':['standalone/library'], 'bookshelf':['standalone/bookshelf'],
 'mezip':['standalone/mezip'], 'shop':['standalone/shop'],
 'mezip-local':['standalone/mezip-local','collector','integration/mezip','public/local-apps/x-local-capture-v7','public/local-apps/x-link-archive-v1'],
 'finance':['standalone/mezip-local','collector','integration/local-apps','public/local-apps/finance-receipt-inbox-v12','public/local-apps/finance-center-v2'],
 'github':['standalone/mezip-local','collector','integration/local-apps','public/local-apps/github-workspace-v6'],
 'media':['standalone/mezip-local','collector','integration/local-apps','public/local-apps/emotion-action-v1'],
 'music':['standalone/go-music-dl'], 'booking':['collector','integration/local-apps','standalone/booking-mail'],
 'qduo':['integration/qduo-windows'],
}
CODE=b.CODE|{'.jsx','.py','.ps1','.cmd','.sh','.cs','.csproj','.sln','.sql','.yml','.yaml','.toml','.go','.json','.example'}
def files_for(group):
 result=set()
 for item in COMMON+GROUPS[group]:
  p=ROOT/item
  if not p.exists(): continue
  for f in ([p] if p.is_file() else p.rglob('*')):
   if f.is_file() and b.included(f) and 'public/source-library' not in f.as_posix():result.add(f)
 return sorted(result)
def build(group):
 files=files_for(group);rows=[]
 intro='# Codex Pulse source bundle\n\nModule: '+group+'\n\n这些内容是真实源码，以 FILE 标记保存原目录。模块包包含主工作台共享代码和本模块独立应用/服务；二进制资源仅在 ZIP。完整集成请克隆 GitHub 主仓库，独立应用按 standalone 中的 README 运行。数据、密钥与原站绑定不随包提供。提示词按现有功能整理，不是原始对话。\n'
 blocks=[intro];archive=ROOT/'work/source-packages'/f'{group}.zip';archive.parent.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  z.writestr('README-SOURCE.txt',intro)
  for f in files:
   name=f.relative_to(ROOT).as_posix();data=b.source_bytes(f)
   if name.endswith('.openai/hosting.json'):
    value=json.loads(data);value.pop('project_id',None);data=(json.dumps(value,indent=2)+'\n').encode()
   z.writestr(name,data);rows.append({'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
   if (f.suffix in CODE or f.name in b.NAMES) and 'vendor' not in f.parts and f.suffix not in {'.svg'}:
    blocks.append('\n\n===== FILE: '+name+' =====\n'+data.decode('utf-8-sig'))
  z.writestr('FILES.json',json.dumps(rows,ensure_ascii=False,indent=2))
 output='\n'.join(blocks).encode('utf-8')
 if len(output)>=25*1024*1024:raise ValueError(f'{group}: source text too large ({len(output)})')
 (ROOT/'public/source-library'/f'{group}.txt').write_bytes(output)
 return {'id':group,'files':len(files),'textBytes':len(output),'zipBytes':archive.stat().st_size}
if __name__=='__main__':
 result=[build(group) for group in GROUPS]
 original=json.loads((ROOT/'public/source-library/manifest.json').read_text(encoding='utf-8'))
 manifest=[x for x in original if x['id'] in MAPS]+result
 (ROOT/'public/source-library/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
 (ROOT/'docs/feature-source-coverage.json').write_text(json.dumps({'catalog':CAT,'packages':manifest},ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps(result,ensure_ascii=False))
