import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';

const [url,pattern='常住人口|可支配收入',mode='text']=process.argv.slice(2);
 if(!url)throw new Error('URL required');
const content=execFileSync('curl.exe',['-fL','--max-time','30','-s',url],{maxBuffer:16*1024*1024});
if(mode==='catalog'){
 const sid=content.toString('utf8').match(/SID:\s*'([0-9]+)'/)?.[1];
 const id=new URL(url).hash.slice(1);if(!sid||!id)throw new Error('Catalog metadata missing');
 const endpoint=new URL(url.split('/gkmlpt/')[0]+`/gkmlpt/api/all/${id}?page=1&sid=${sid}`).href;
 const data=JSON.parse(execFileSync('curl.exe',['-fLs','--max-time','30',endpoint],{encoding:'utf8',maxBuffer:16*1024*1024}));
 console.log(JSON.stringify(data.articles.filter(a=>new RegExp(pattern).test(a.title)).map(a=>({title:a.title,url:a.post_url||a.url,date:a.created_at})),null,2));
}else if(mode==='xls'){
 const python='C:/Users/your-user/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
 const script='import sys,re; sys.path.insert(0,"RECON/research-deps"); import xlrd; b=xlrd.open_workbook(file_contents=sys.stdin.buffer.read()); p=re.compile(sys.argv[1]);\nfor s in b.sheets():\n rows=[" | ".join(str(v) for v in s.row_values(i)) for i in range(s.nrows)]; hits=[i for i,r in enumerate(rows) if p.search(r)];\n if hits:\n  print("SHEET",s.name); print("\\n".join(rows[:6]));\n  for i in hits: print("ROW",i+1,"\\n"+"\\n".join(rows[max(0,i-1):i+4]))';
 console.log(execFileSync(python,['-X','utf8','-c',script,pattern],{input:content,encoding:'utf8',maxBuffer:4*1024*1024}));
}else if(mode==='pages'){
 const python='C:/Users/your-user/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
 const script='import sys,pathlib,pypdfium2 as pdf; d=pdf.PdfDocument(sys.stdin.buffer.read()); ids=list(map(int,sys.argv[1].split(","))) if sys.argv[1]!="all" else list(range(len(d))); path=pathlib.Path("RECON/regional-data"); path.mkdir(parents=True,exist_ok=True); print("pages",len(d));\nfor i in ids:\n image=d[i].render(scale=1.4).to_pil(); image.save(str(path/(sys.argv[2]+"-"+str(i+1)+".png"))); print(str(path/(sys.argv[2]+"-"+str(i+1)+".png")))';
 console.log(execFileSync(python,['-X','utf8','-c',script,pattern,new URL(url).pathname.split('/').pop().replace('.pdf','')],{input:content,encoding:'utf8',maxBuffer:1024*1024}));
}else if(mode==='pdf'){
 const python='C:/Users/your-user/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
 const script='import sys,io,re; from pypdf import PdfReader; r=PdfReader(io.BytesIO(sys.stdin.buffer.read())); p=re.compile(sys.argv[1]);\nfor i,page in enumerate(r.pages):\n t=page.extract_text(); lines=t.splitlines();\n for j,line in enumerate(lines):\n  if p.search(line): print("PAGE",i+1," | "," ".join(lines[max(0,j-1):j+4]))';
 console.log(execFileSync(python,['-X','utf8','-c',script,pattern],{input:content,encoding:'utf8',maxBuffer:4*1024*1024}));
}else{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({javaScriptEnabled:false});await page.route('**/*',r=>r.abort());
  await page.setContent(content.toString('utf8'),{waitUntil:'domcontentloaded'});
  const re=new RegExp(pattern);
  if(mode==='embeds')console.log(JSON.stringify(await page.locator('iframe,img,object,embed').evaluateAll(nodes=>nodes.map(n=>({tag:n.tagName,url:n.getAttribute('src')||n.getAttribute('data')}))),null,2));
  else if(mode==='links')console.log(JSON.stringify((await page.locator('a[href],option[value]').evaluateAll(nodes=>nodes.map(n=>({title:n.textContent.trim(),url:n.getAttribute('href')||n.getAttribute('value')})))).filter(x=>x.url&&(re.test(x.title)||re.test(x.url))).map(x=>({...x,url:new URL(x.url,url).href})),null,2));
  else if(mode==='rawtext')console.log((await page.locator('p,tr,h1,h2,h3').allTextContents()).filter(line=>re.test(line)).join('\n'));
  else console.log((await page.locator('body').innerText()).split('\n').filter(line=>re.test(line)).join('\n'));
 }finally{await browser.close();}
}
