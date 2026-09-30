import {randomBytes,randomUUID,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {inflateRawSync} from 'node:zlib';
import {Buffer} from 'node:buffer';
import {RequestError,fail,DEFAULT_SETTINGS,bookFrom,categoryFrom,bannerFrom,settingsFrom,validateLibrary} from './validation.mjs';
import seed from './seed.json';
import {createLookup,LookupError} from './lookup-core.mjs';
import {createEbookLookup} from './ebooks-core.mjs';

const SESSION_MS=86400000,COOKIE='bookshelf_session',scrypt=promisify(scryptCallback);
const security={
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin',
 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https: http:; font-src 'self' https:; connect-src 'self'; frame-ancestors 'self' https://codex-pulse-willow-0911.wozhe0196.chatgpt.site; object-src 'none'; base-uri 'self'; form-action 'self'",
};
const upstreamHosts=new Set(['openlibrary.org','www.googleapis.com','archive.org','gutendex.com','www.gutenberg.org']);
async function requestJson(url){
 url=new URL(url);if(url.protocol!=='https:'||!upstreamHosts.has(url.hostname))throw new Error('Unsupported source');
 const response=await fetch(url,{headers:{Accept:'application/json','User-Agent':'PersonalBookshelf/1.0'},redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok){const error=new Error('Source unavailable');error.upstreamStatus=response.status;throw error}
 if(Number(response.headers.get('content-length'))>2097152)throw new Error('Source response too large');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2097152)throw new Error('Source response too large');chunks.push(value)}}finally{await reader.cancel().catch(()=>{})}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 return JSON.parse(new TextDecoder().decode(bytes));
}
let bookLookup,ebookLookup,keyUsed;
function sources(env){if(!bookLookup||keyUsed!==env.GOOGLE_BOOKS_API_KEY){keyUsed=env.GOOGLE_BOOKS_API_KEY;bookLookup=createLookup({requestJson,googleBooksApiKey:keyUsed});ebookLookup=createEbookLookup({requestJson,openLibraryJson:bookLookup.openLibraryJson,googleBooksApiKey:keyUsed})}return {bookLookup,ebookLookup}}
const json=(data,status=200,extra={})=>new Response(status===204?null:JSON.stringify(data),{status,headers:{...security,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra}});
const statement=(db,sql,args=[])=>db.prepare(sql).bind(...args);
const meta=async(db,key)=>(await statement(db,'SELECT value FROM metadata WHERE key = ?',[key]).first())?.value;
const metaStatement=(db,key,value)=>statement(db,'INSERT OR REPLACE INTO metadata(key,value) VALUES (?,?)',[key,String(value)]);
const setMeta=(db,key,value)=>metaStatement(db,key,value).run();
const tables=new Set(['books','categories','banners']);
async function collection(db,table){if(!tables.has(table))throw new Error('Invalid table');const rows=await db.prepare(`SELECT payload FROM ${table} ORDER BY position ASC`).all();return rows.results.map(row=>JSON.parse(row.payload))}
async function record(db,table,id){if(!tables.has(table))throw new Error('Invalid table');const row=await statement(db,`SELECT payload FROM ${table} WHERE id = ?`,[id]).first();return row?JSON.parse(row.payload):null}
const updateStatement=(db,table,value)=>statement(db,`UPDATE ${table} SET payload = ? WHERE id = ?`,[JSON.stringify(value),value.id]);
async function insert(db,table,value,front=false){if(!tables.has(table))throw new Error('Invalid table');await statement(db,`INSERT INTO ${table}(id,position,payload) SELECT ?,COALESCE(${front?'MIN':'MAX'}(position) ${front?'-':'+'} 1,0),? FROM ${table}`,[value.id,JSON.stringify(value)]).run()}
async function replaceLibrary(db,data,extras=[]){
 const commands=[];
 for(const table of tables){commands.push(db.prepare(`DELETE FROM ${table}`));data[table].forEach((value,position)=>commands.push(statement(db,`INSERT INTO ${table}(id,position,payload) VALUES (?,?,?)`,[value.id,position,JSON.stringify(value)])))}
 commands.push(metaStatement(db,'settings',JSON.stringify(data.settings)),metaStatement(db,'initialized','1'),...extras);
 await db.batch(commands);
}
async function ensureInitialized(env){
 if(!env.DB||!env.BUCKET)fail('书架存储暂时不可用，请稍后重试。',503);
 if(await meta(env.DB,'initialized')==='1')return;
 // Seeds contain demonstration data only. Personal data enters through the
 // protected one-time migration endpoint, never through frontend assets.
 const valid=validateLibrary(seed),commands=[];
 for(const table of tables)valid[table].forEach((value,position)=>commands.push(statement(env.DB,`INSERT OR IGNORE INTO ${table}(id,position,payload) VALUES (?,?,?)`,[value.id,position,JSON.stringify(value)])));
 commands.push(statement(env.DB,'INSERT OR IGNORE INTO metadata(key,value) VALUES (?,?)',['settings',JSON.stringify(valid.settings)]));
 if(env.INITIAL_PASSWORD_HASH)commands.push(statement(env.DB,'INSERT OR IGNORE INTO metadata(key,value) VALUES (?,?)',['password',env.INITIAL_PASSWORD_HASH]));
 commands.push(statement(env.DB,'INSERT OR IGNORE INTO metadata(key,value) VALUES (?,?)',['initialized','1']));
 await env.DB.batch(commands);
}
const hash=token=>createHash('sha256').update(token).digest('hex');
function cookieToken(req){return (req.headers.get('cookie')||'').split(';').map(p=>p.trim()).find(p=>p.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)}
async function authenticated(req,db){const token=cookieToken(req);if(!/^[a-f0-9]{64}$/.test(token||''))return false;const entry=await statement(db,'SELECT expires FROM sessions WHERE hash = ?',[hash(token)]).first();return !!entry&&entry.expires>Date.now()}
async function requireAuth(req,db){if(!await authenticated(req,db))fail('请先登录后台。',401)}
async function session(db){const token=randomBytes(32).toString('hex');await db.batch([statement(db,'DELETE FROM sessions WHERE expires < ?',[Date.now()]),statement(db,'INSERT INTO sessions(hash,expires) VALUES (?,?)',[hash(token),Date.now()+SESSION_MS])]);return {["Set-Cookie"]:`${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`}}
function passwordInput(password){if(typeof password!=='string'||password.length<12||password.length>256)fail('密码须为 12 至 256 个字符。');return password}
async function passwordHash(password){const salt=randomBytes(16);const key=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});return `${salt.toString('hex')}:${key.toString('hex')}`}
async function passwordMatches(db,password){const value=await meta(db,'password');if(!value||typeof password!=='string'||password.length>256)return false;const [salt,expected]=value.split(':');const actual=await scrypt(password,Buffer.from(salt,'hex'),64,{N:32768,r:8,p:1,maxmem:64*1024*1024});const expectedBytes=Buffer.from(expected,'hex');return expectedBytes.length===actual.length&&timingSafeEqual(expectedBytes,actual)}
async function rateLimit(req,db,key,limit=10){const now=Date.now(),ip=req.headers.get('cf-connecting-ip')||req.headers.get('oai-authenticated-user-id')||'owner';const bucket=key+':'+ip;const value=await statement(db,'INSERT INTO request_limits(key,count,until) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN request_limits.until <= ? THEN 1 ELSE request_limits.count + 1 END, until = CASE WHEN request_limits.until <= ? THEN excluded.until ELSE request_limits.until END RETURNING count',[bucket,now+900000,now,now]).first();if(value.count>limit)fail('尝试次数过多，请 15 分钟后再试。',429)}
async function body(req,max=20*1024*1024){if(Number(req.headers.get('content-length'))>max)fail('请求数据过大。',413);const reader=req.body?.getReader();if(!reader)return {};let length=0,text='';const decoder=new TextDecoder();try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>max)fail('请求数据过大。',413);text+=decoder.decode(value,{stream:true})}text+=decoder.decode();return JSON.parse(text||'{}')}catch(error){if(error instanceof RequestError)throw error;fail('JSON 格式不正确。')}finally{await reader.cancel().catch(()=>{})}}
const filename=name=>String(name||'book').replace(/^.*[\\/]/,'').replace(/[\u0000-\u001F\u007F]/g,'').slice(0,255)||'book';
const imageExtensions=new Set(['png','jpg','jpeg','webp','gif']);
async function epubMime(file){
 const tail=Buffer.from(await file.slice(Math.max(0,file.size-65557)).arrayBuffer());const end=tail.lastIndexOf(Buffer.from([80,75,5,6]));
 if(end<0||end+22>tail.length)return false;
 const count=tail.readUInt16LE(end+10),size=tail.readUInt32LE(end+12),offset=tail.readUInt32LE(end+16);if(count>20000||size>4*1024*1024||offset+size>file.size)return false;
 const central=Buffer.from(await file.slice(offset,offset+size).arrayBuffer());let cursor=0;
 for(let i=0;i<count;i++){if(cursor+46>central.length||central.readUInt32LE(cursor)!==0x02014b50)return false;const n=central.readUInt16LE(cursor+28),e=central.readUInt16LE(cursor+30),c=central.readUInt16LE(cursor+32);if(central.toString('utf8',cursor+46,cursor+46+n)==='mimetype'){const method=central.readUInt16LE(cursor+10),compressed=central.readUInt32LE(cursor+20),uncompressed=central.readUInt32LE(cursor+24),local=central.readUInt32LE(cursor+42);if(uncompressed!==20||compressed>100||local+30>file.size)return false;const head=Buffer.from(await file.slice(local,local+30).arrayBuffer());if(head.readUInt32LE(0)!==0x04034b50)return false;const start=local+30+head.readUInt16LE(26)+head.readUInt16LE(28);if(start+compressed>file.size)return false;const data=Buffer.from(await file.slice(start,start+compressed).arrayBuffer());try{const decoded=method===0?data:method===8?inflateRawSync(data,{maxOutputLength:20}):null;return decoded?.toString('ascii')==='application/epub+zip'}catch{return false}}cursor+=46+n+e+c}
 return false;
}
async function validatedMime(file,ext){
 const head=Buffer.from(await file.slice(0,4096).arrayBuffer()),tail=Buffer.from(await file.slice(Math.max(0,file.size-2048)).arrayBuffer());
 if(ext==='png'&&head.length>=33&&head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&head.toString('ascii',12,16)==='IHDR'&&head.readUInt32BE(16)>0&&head.readUInt32BE(20)>0)return 'image/png';
 if(['jpg','jpeg'].includes(ext)&&head.length>4&&head[0]===255&&head[1]===216&&head[2]===255&&tail.lastIndexOf(Buffer.from([255,217]))>=0)return 'image/jpeg';
 if(ext==='gif'&&head.length>=14&&['GIF87a','GIF89a'].includes(head.toString('ascii',0,6))&&head.readUInt16LE(6)>0&&head.readUInt16LE(8)>0&&tail.at(-1)===59)return 'image/gif';
 if(ext==='webp'&&head.length>=20&&head.toString('ascii',0,4)==='RIFF'&&head.toString('ascii',8,12)==='WEBP'&&['VP8 ','VP8L','VP8X'].includes(head.toString('ascii',12,16))&&head.readUInt32LE(4)+8===file.size)return 'image/webp';
 if(ext==='pdf'&&head.toString('ascii',0,5)==='%PDF-'&&tail.includes(Buffer.from('%%EOF')))return 'application/pdf';
 if(ext==='epub'&&await epubMime(file))return 'application/epub+zip';
 if(ext==='txt'&&file.size){const reader=file.stream().getReader(),decoder=new TextDecoder('utf-8',{fatal:true});try{while(true){const {done,value}=await reader.read();if(done)break;const text=decoder.decode(value,{stream:true});if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(text))throw new Error();}decoder.decode();return 'text/plain; charset=utf-8'}catch{}finally{await reader.cancel().catch(()=>{})}}
 fail('文件内容与扩展名不匹配，或文件格式无效。');
}
async function upload(req,env){
 if(Number(req.headers.get('content-length'))>51*1024*1024)fail('电子书大小不能超过 50 MB。',413);
 const form=await req.formData();const fields=[...form.keys()];const file=form.get('file');if(fields.length!==1||fields[0]!=='file'||!file?.stream||!file.name)fail('每次请选择一个文件。');
 const ext=file.name.split('.').pop().toLowerCase(),kind=imageExtensions.has(ext)?'cover':'book';if(!imageExtensions.has(ext)&&!['pdf','epub','txt'].includes(ext))fail('支持 JPG、PNG、WebP、GIF 封面及 PDF、EPUB、TXT 电子书。');
 if(file.size>(kind==='cover'?10:50)*1024*1024)fail(kind==='cover'?'封面大小不能超过 10 MB。':'电子书大小不能超过 50 MB。');
 const mime=await validatedMime(file,ext),id=`${randomUUID()}.${ext==='jpeg'?'jpg':ext}`,url=kind==='cover'?`/uploads/covers/${id}`:`/private-files/${id}`,name=filename(file.name);
 await env.BUCKET.put(url.slice(1),file.stream(),{httpMetadata:{contentType:mime},customMetadata:{originalName:name}});
 try{await statement(env.DB,'INSERT INTO uploads(url,filename,kind,name,mime,createdAt) VALUES (?,?,?,?,?,?)',[url,id,kind,name,mime,new Date().toISOString()]).run()}catch(error){await env.BUCKET.delete(url.slice(1));throw error}
 return json({url,name,type:kind},201);
}
async function api(req,env,url){
 const db=env.DB,path=url.pathname,method=req.method;
 if(['POST','PUT','PATCH','DELETE'].includes(method)){const origin=req.headers.get('origin');if(req.headers.get('sec-fetch-site')==='cross-site'||(origin&&origin!==url.origin))fail('请从本站后台进行操作。',403);if(path!=='/api/uploads'&&!req.headers.get('content-type')?.startsWith('application/json'))fail('请使用 JSON 格式提交。',415)}
 await ensureInitialized(env);
 const auth=await authenticated(req,db);
 if(path==='/api/auth/status'&&method==='GET')return json({configured:!!await meta(db,'password'),authenticated:auth});
 if(path==='/api/auth/setup'&&method==='POST'){await rateLimit(req,db,'setup',5);if(await meta(db,'password'))fail('管理员已创建，请登录。',409);if(!['127.0.0.1','localhost'].includes(url.hostname)&&!req.headers.get('oai-authenticated-user-id'))fail('请先登录站点所有者账号。',403);const password=passwordInput((await body(req)).password),value=await passwordHash(password);const created=await statement(db,"INSERT OR IGNORE INTO metadata(key,value) VALUES ('password',?)",[value]).run();if(!created.meta.changes)fail('管理员已创建，请登录。',409);return json({configured:true,authenticated:true},201,await session(db))}
 if(path==='/api/auth/login'&&method==='POST'){await rateLimit(req,db,'login');if(!await meta(db,'password'))fail('请先创建管理员。',409);if(!await passwordMatches(db,(await body(req)).password))fail('密码不正确。',401);return json({authenticated:true},200,await session(db))}
 if(path==='/api/auth/logout'&&method==='POST'){const token=cookieToken(req);if(token)await statement(db,'DELETE FROM sessions WHERE hash = ?',[hash(token)]).run();return json({authenticated:false},200,{'Set-Cookie':`${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`})}
 if(path==='/api/bootstrap'&&method==='POST'){
  const token=req.headers.get('x-bookshelf-migration');if(!env.MIGRATION_TOKEN||token!==env.MIGRATION_TOKEN||await meta(db,'migration_completed'))fail('迁移入口不可用。',403);
  const data=validateLibrary(await body(req));await replaceLibrary(db,data,[metaStatement(db,'migration_completed',new Date().toISOString())]);return json({ok:true,books:data.books.length,categories:data.categories.length});
 }
 if(path==='/api/library'&&method==='GET'){
  const data={settings:JSON.parse(await meta(db,'settings')||JSON.stringify(DEFAULT_SETTINGS)),categories:await collection(db,'categories'),books:await collection(db,'books'),banners:await collection(db,'banners')};
  const uploaded=await db.prepare("SELECT url FROM uploads WHERE kind = 'book'").all(),files=new Set(uploaded.results.map(u=>u.url));
  data.books=data.books.map(book=>{const value={...book,hasFile:files.has(book.fileUrl)};if(!auth){delete value.notes;delete value.fileUrl;delete value.fileName}return value});return json(data);
 }
 if(!auth)fail('请先登录后台。',401);
 if(path==='/api/auth/password'&&method==='PUT'){await rateLimit(req,db,'password');const data=await body(req);if(!await passwordMatches(db,data.currentPassword))fail('当前密码不正确。',401);const value=await passwordHash(passwordInput(data.password));await db.batch([metaStatement(db,'password',value),db.prepare('DELETE FROM sessions')]);return json({ok:true},200,await session(db))}
 if(path==='/api/uploads'&&method==='POST')return upload(req,env);
 if(path==='/api/lookup'&&method==='GET'){await rateLimit(req,db,'lookup',40);return json(await sources(env).bookLookup.lookupBooks(url.searchParams.get('q')))}
 if(path==='/api/lookup/details'&&method==='GET'){await rateLimit(req,db,'lookup',40);return json(await sources(env).bookLookup.lookupDetails(url.searchParams.get('source'),url.searchParams.get('id'),url.searchParams.get('editionId')||undefined))}
 if(path==='/api/ebooks'&&method==='GET'){await rateLimit(req,db,'ebooks',40);return json(await sources(env).ebookLookup.lookupEbooks({title:url.searchParams.get('title')||'',author:url.searchParams.get('author')||'',isbn:url.searchParams.get('isbn')||''}))}
 if(path==='/api/settings'&&method==='PUT'){const data=settingsFrom(await body(req),JSON.parse(await meta(db,'settings')));await setMeta(db,'settings',JSON.stringify(data));return json(data)}
 if(path==='/api/backup'&&method==='GET')return json({version:1,exportedAt:new Date().toISOString(),settings:JSON.parse(await meta(db,'settings')),categories:await collection(db,'categories'),books:await collection(db,'books'),banners:await collection(db,'banners')},200,{'Content-Disposition':`attachment; filename="bookshelf-${new Date().toISOString().slice(0,10)}.json"`});
 if(path==='/api/restore'&&method==='POST'){await replaceLibrary(db,validateLibrary(await body(req)));return json({ok:true})}
 const fileMatch=path.match(/^\/api\/books\/([a-zA-Z0-9_-]{1,100})\/(file|read)$/);
 if(fileMatch&&method==='GET'){
  const book=await record(db,'books',fileMatch[1]);if(!book?.fileUrl)fail('电子书文件不存在。',404);const object=await env.BUCKET.get(book.fileUrl.slice(1));if(!object)fail('电子书文件不存在。',404);
  const entry=await statement(db,'SELECT name,mime FROM uploads WHERE url = ?',[book.fileUrl]).first();const name=filename(book.fileName||entry?.name||'book'),headers=new Headers(security);object.writeHttpMetadata(headers);headers.set('Content-Type',entry?.mime||'application/octet-stream');headers.set('Cache-Control','private, no-store');headers.set('Content-Disposition',`${fileMatch[2]==='read'?'inline':'attachment'}; filename="book.${name.split('.').pop()}"; filename*=UTF-8''${encodeURIComponent(name)}`);return new Response(object.body,{headers});
 }
 const match=path.match(/^\/api\/(books|categories|banners)(?:\/([a-zA-Z0-9_-]{1,100}))?$/);
 if(match){
  const [,table,id]=match;
  const categories=new Set((await collection(db,'categories')).map(c=>c.id));
  if(method==='POST'&&!id){const value=await body(req),newId=randomUUID();const item=table==='books'?bookFrom(value,newId,categories):table==='categories'?categoryFrom(value,newId):bannerFrom(value,newId,categories,new Set((await collection(db,'books')).map(b=>b.id)));await insert(db,table,item,table==='books');return json(item,201)}
  const previous=id?await record(db,table,id):null;if(!previous)fail('资料不存在。',404);
  if(method==='PUT'){const value=await body(req),item=table==='books'?bookFrom(value,id,categories,previous):table==='categories'?categoryFrom({...previous,...value},id):bannerFrom(value,id,categories,new Set((await collection(db,'books')).map(b=>b.id)),previous);await updateStatement(db,table,item).run();return json(item)}
  if(method==='DELETE'){const commands=[statement(db,`DELETE FROM ${table} WHERE id = ?`,[id])];if(table==='categories'){for(const book of await collection(db,'books'))if(book.categoryId===id)commands.push(updateStatement(db,'books',{...book,categoryId:null,updatedAt:new Date().toISOString()}));for(const banner of await collection(db,'banners'))if(banner.categoryId===id)commands.push(updateStatement(db,'banners',{...banner,categoryId:null}))}if(table==='books')for(const banner of await collection(db,'banners'))if(banner.bookId===id)commands.push(updateStatement(db,'banners',{...banner,bookId:null}));await db.batch(commands);return json(null,204)}
 }
 return json({error:'接口不存在。'},404);
}
export default {async fetch(req,env){
 try{
  const url=new URL(req.url);
  if(url.pathname.startsWith('/api/'))return await api(req,env,url);
  if(url.pathname.startsWith('/private-files/'))return json({error:'请在后台下载电子书。'},404);
  if(/^\/uploads\/covers\/[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(url.pathname)){const object=await env.BUCKET.get(url.pathname.slice(1));if(!object)return json({error:'图片不存在。'},404);const headers=new Headers(security);object.writeHttpMetadata(headers);headers.set('Cache-Control','public, max-age=86400');return new Response(object.body,{headers})}
  const asset=await env.ASSETS.fetch(req);const headers=new Headers(asset.headers);Object.entries(security).forEach(([k,v])=>headers.set(k,v));return new Response(asset.body,{status:asset.status,headers});
 }catch(error){if(error instanceof RequestError||error instanceof LookupError)return json({error:error.message,...(error.extra||{})},error.status||400);console.error('Bookshelf request failed:',error.message);return json({error:'服务器暂时无法完成操作，请稍后重试。'},503)}
}};
