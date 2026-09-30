import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { networkInterfaces, tmpdir } from 'node:os';

const MAX_JSON_BYTES = 24 * 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGES_PER_ENTRY = 6;
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const STUDY_SUBJECTS = Object.freeze({
  chinese: { label: '语文', questionTypes: ['现代文阅读', '古诗文', '作文', '语言运用', '名著阅读'] },
  math: { label: '数学', questionTypes: ['函数与方程', '几何', '概率统计', '数列', '导数与不等式'] },
  english: { label: '英语', questionTypes: ['阅读理解', '完形填空', '语法填空', '写作', '听力'] },
  physics: { label: '物理', questionTypes: ['力学', '电磁学', '运动学', '实验', '光学与热学'] },
  chemistry: { label: '化学', questionTypes: ['物质结构', '化学反应', '溶液与电化学', '有机化学', '实验'] },
  biology: { label: '生物', questionTypes: ['细胞与代谢', '遗传与进化', '生态系统', '实验设计', '稳态调节'] },
});
const STUDY_MODULES = Object.freeze(Object.keys(STUDY_SUBJECTS).map((subject) => `study-${subject}`));
const STUDY_AREAS = Object.freeze(['普通题记录', '学习方法', '二次结论', '试卷库', '创新题', '题型总结']);
const MODULES = Object.freeze(['fitness', 'reading', 'photos', 'community', ...STUDY_MODULES]);
const MODULE_LABELS = Object.freeze({
  fitness: '健身记录', reading: '读书感悟', photos: '生活照片', community: '互动交流',
  ...Object.fromEntries(Object.entries(STUDY_SUBJECTS).map(([subject, config]) => [`study-${subject}`, `${config.label}精选题`])),
});

function base64(value) { return Buffer.from(value).toString('base64url'); }
function hmac(value, key) { return base64(createHmac('sha256', key).update(value).digest()); }
function safeEqual(left, right) {
  return typeof left === 'string' && typeof right === 'string' && left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function createCookie(name, payload, key, maxAgeSeconds = SESSION_MAX_AGE_SECONDS) {
  const encoded = base64(JSON.stringify(payload));
  return `${name}=${encodeURIComponent(`${encoded}.${hmac(encoded, key)}`)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').flatMap((piece) => {
    const index = piece.indexOf('=');
    return index < 0 ? [] : [[piece.slice(0, index).trim(), decodeURIComponent(piece.slice(index + 1).trim())]];
  }));
}

function readCookie(request, name, key) {
  const raw = parseCookies(request.headers.cookie)[name];
  if (!raw) return null;
  const [encoded, signature] = raw.split('.');
  if (!encoded || !signature || !safeEqual(hmac(encoded, key), signature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return payload && typeof payload === 'object' && Number(payload.expiresAt) > Date.now() ? payload : null;
  } catch { return null; }
}

function atomicWrite(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, value, { encoding: 'utf8', mode: 0o600 });
  renameSync(temporary, path);
}

function defaultDataDirectory() {
  return join(process.env.LOCALAPPDATA?.trim() || tmpdir(), 'ME.zip', 'life-studio');
}

function safeDocument(path) {
  if (!existsSync(path)) return { entries: [], pairings: {}, shares: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.entries)) {
      return {
        entries: parsed.entries,
        pairings: parsed.pairings && typeof parsed.pairings === 'object' ? parsed.pairings : {},
        shares: parsed.shares && typeof parsed.shares === 'object' ? parsed.shares : {},
      };
    }
  } catch {
    // Fail closed: corrupted local data never becomes a public feed.
  }
  return { entries: [], pairings: {}, shares: {} };
}

function lanAddress() {
  const addresses = Object.values(networkInterfaces()).flat().filter((entry) => entry && entry.family === 'IPv4' && !entry.internal);
  const privateAddress = addresses.find((entry) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/u.test(entry.address));
  return (privateAddress ?? addresses[0])?.address ?? null;
}

function desktopOrigin(origin) {
  return origin === 'http://127.0.0.1:5174' || origin === 'http://localhost:5174' ? origin : '';
}

function loopbackRequest(request) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '');
}

async function readJson(request) {
  let length = 0;
  const chunks = [];
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk);
    length += bytes.byteLength;
    if (length > MAX_JSON_BYTES) throw new Error('内容或图片太大，请分批上传或压缩图片后再试。');
    chunks.push(bytes);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function json(response, status, body, origin = '', cookies = []) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (origin) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Vary', 'Origin');
  }
  if (cookies.length) response.setHeader('Set-Cookie', cookies);
  response.end(JSON.stringify(body));
}

function failure(response, status, code, message, origin = '') {
  json(response, status, { error: { code, message } }, origin);
}

function imageExtension(mimeType) {
  return ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic', 'image/heif': '.heif' }[mimeType] ?? null);
}

function looksLikeImage(bytes, mimeType) {
  if (mimeType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (mimeType === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'image/webp') return bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if (mimeType === 'image/heic' || mimeType === 'image/heif') return bytes.subarray(4, 12).toString('ascii').startsWith('ftyp');
  return false;
}

function dataUrlBytes(value, mimeType) {
  const match = /^data:([^;]+);base64,([a-z0-9+/=\s]+)$/iu.exec(String(value ?? ''));
  if (!match || match[1].toLowerCase() !== mimeType) throw new Error('图片格式不正确，请重新拍照或从相册选择。');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('单张图片太大，请压缩到 4 MB 以内后再试。');
  if (!looksLikeImage(bytes, mimeType)) throw new Error('图片内容无法验证，请选择真实图片。');
  return bytes;
}

function text(value, limit) { return String(value ?? '').trim().slice(0, limit); }
function normalModule(value) { return MODULES.includes(value) ? value : null; }
function normalTags(value) {
  const values = Array.isArray(value) ? value : String(value ?? '').split(/[，,]/u);
  return [...new Set(values.map((item) => text(item, 28)).filter(Boolean))].slice(0, 12);
}
function normalMeta(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 8).map(([key, item]) => [text(key, 24), text(item, 120)]).filter(([key, item]) => key && item));
}
function studyConfig(module) {
  const subject = /^study-(chinese|math|english|physics|chemistry|biology)$/u.exec(module)?.[1];
  return subject ? STUDY_SUBJECTS[subject] : null;
}
function html(value) {
  return String(value ?? '').replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}
function sealed(value, key) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return [nonce.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}
function unsealed(value, key) {
  try {
    const [nonceText, tagText, encryptedText] = String(value ?? '').split('.');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonceText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]).toString('utf8');
  } catch { return null; }
}
function mediaItems(entry) {
  if (Array.isArray(entry.images) && entry.images.length) return entry.images;
  return entry.image ? [entry.image] : [];
}
function removeEntryMedia(entry) {
  for (const image of mediaItems(entry)) if (image?.filePath && existsSync(image.filePath)) unlinkSync(image.filePath);
}
function compactEntry(entry) {
  const images = mediaItems(entry);
  return {
    id: entry.id, module: entry.module, moduleLabel: MODULE_LABELS[entry.module], title: entry.title, body: entry.body,
    tags: entry.tags ?? [], meta: entry.meta ?? {}, author: entry.author, createdAt: entry.createdAt,
    imageUrl: images.length ? `/v1/life/media/${entry.id}` : null, imageName: images[0]?.fileName ?? null,
    media: images.map((image, index) => ({ url: `/v1/life/media/${entry.id}/${index}`, fileName: image.fileName, mimeType: image.mimeType })),
    librarySaved: Boolean(entry.librarySaved), reminderAt: entry.reminderAt ?? null, questionType: entry.questionType ?? null, studyArea: entry.studyArea ?? null,
    likes: entry.likes ?? [], favorites: entry.favorites ?? [], likeCount: (entry.likes ?? []).length,
    favoriteCount: (entry.favorites ?? []).length, comments: entry.comments ?? [], commentCount: (entry.comments ?? []).length,
  };
}

function lifeMobileHtml({ module }) {
  const label = MODULE_LABELS[module] ?? '生活记录';
  const fields = {
    fitness: [['训练主题', '例如：夜跑、力量训练'], ['运动时长', '例如：45 分钟'], ['身体感受', '例如：状态很好']],
    reading: [['书名 / 文章', '例如：瓦尔登湖'], ['阅读进度', '例如：第 3 章 · 42 页'], ['这一刻的感悟', '写下真正想留下的话']],
    photos: [['照片标题', '例如：傍晚的散步'], ['地点 / 场景', '例如：台北 · 河边'], ['照片故事', '记录这一刻发生的事']],
    community: [['主题', '例如：今天的一个想法'], ['想和大家说', '欢迎写下文字或附上图片'], ['补充说明', '可选']],
  }[module] ?? [];
  const inputs = fields.map(([labelText, placeholder], index) => `<label>${labelText}<${index === 2 ? 'textarea' : 'input'} data-meta="${index}" placeholder="${placeholder}"></${index === 2 ? 'textarea' : 'input'}></label>`).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>ME.zip · ${label}</title><style>
  :root{--paper:#f4efe3;--ink:#202321;--muted:#777165;--line:#cfc4ae;--accent:#d95b37;--violet:#6658b6}*{box-sizing:border-box}body{margin:0;background:linear-gradient(145deg,#efe1cb,#f8f3e9);color:var(--ink);font-family:ui-serif,Georgia,"Noto Serif SC","Songti SC",serif}.shell{max-width:640px;margin:auto;padding:24px 16px 48px}.eyebrow{font:700 12px ui-monospace,monospace;letter-spacing:.13em;color:var(--accent)}h1{font-size:33px;margin:8px 0 5px;letter-spacing:-.04em}p{line-height:1.65;color:var(--muted)}.card{margin-top:20px;padding:18px;border:1px solid var(--line);border-radius:20px;background:#fffdf8cc;box-shadow:0 18px 45px #55341a14}form{display:grid;gap:14px}label{display:grid;gap:7px;font:700 14px system-ui,"PingFang SC",sans-serif}input,textarea,button{font:inherit}input,textarea{width:100%;padding:13px;border:1px solid var(--line);border-radius:12px;background:#fffaf0;color:var(--ink)}textarea{min-height:100px;resize:vertical}.photo{display:grid;place-items:center;min-height:170px;padding:15px;border:1.5px dashed #a48e70;border-radius:16px;background:#f7efe0;cursor:pointer;text-align:center}.photo img{width:100%;height:245px;object-fit:cover;border-radius:10px}.photo small{display:block;color:var(--muted);margin-top:7px}.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.choice{padding:12px;border:1px solid var(--line);border-radius:12px;background:#fffaf0;cursor:pointer;font-weight:700}.choice.active{border-color:var(--violet);box-shadow:inset 0 0 0 1px var(--violet);color:var(--violet)}button{border:0;border-radius:13px;padding:14px;background:var(--ink);color:#fff8ed;font-weight:800;cursor:pointer}button:disabled{opacity:.55}.result{display:none;padding:12px;border-radius:12px;background:#e1f0dc;color:#31552e;font:600 14px system-ui}.result.error{background:#f6dfd8;color:#812e21}.rule{height:1px;background:var(--line);margin:3px 0}@media(max-width:400px){.row{grid-template-columns:1fr}.shell{padding-inline:13px}}
  </style></head><body><main class="shell"><div class="eyebrow">ME.ZIP · LIFE FIELD NOTE</div><h1>${label}</h1><p>这是这台已配对手机的独立入口。提交成功后，内容会写入电脑上的本地生活记录中心；不会上传到云端。</p><section class="card"><form id="form"><label>显示名称<input id="author" maxlength="30" placeholder="例如：Tom（可选）"></label><label>标题<input id="title" maxlength="100" placeholder="为这次记录起一个标题"></label>${inputs}<label>标签 <input id="tags" maxlength="180" placeholder="例如：运动，晨间，灵感（用逗号分隔）"></label><input id="camera" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" hidden><input id="library" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden><div id="photo" class="photo"><div id="empty"><strong>添加一张照片（可选）</strong><small>点击后可拍照或从手机相册选择</small></div><img id="preview" hidden alt="上传预览"></div><div class="row"><button id="take" type="button" class="choice">拍照</button><button id="choose" type="button" class="choice">从相册选择</button></div><div class="rule"></div><button id="submit" type="submit">保存到电脑端 ${label}</button></form><div id="result" class="result"></div></section></main><script>
  const module=${JSON.stringify(module)},fields=${JSON.stringify(fields.map(([key]) => key))},$=(s)=>document.querySelector(s);let file=null,dataUrl='';
  function notice(value,bad=false){const box=$('#result');box.textContent=value;box.className='result'+(bad?' error':'');box.style.display='block'}
  async function read(fileValue){return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(new Error('无法读取图片'));r.readAsDataURL(fileValue)})}
  async function shrink(fileValue){if(fileValue.size<=2.8*1024*1024)return read(fileValue);try{const bitmap=await createImageBitmap(fileValue);const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise((resolve,reject)=>canvas.toBlob((value)=>value?resolve(value):reject(new Error('无法压缩图片')),'image/jpeg',.84));return read(blob)}catch{return read(fileValue)}}
  async function setFile(next){if(!next)return;try{file=next;dataUrl=await shrink(next);$('#preview').src=dataUrl;$('#preview').hidden=false;$('#empty').hidden=true;notice('图片已准备好；提交后会保存到电脑端本地资料库。')}catch{notice('无法读取图片，请重新选择。',true)}}
  $('#take').onclick=(event)=>{event.stopPropagation();$('#camera').click()};$('#choose').onclick=(event)=>{event.stopPropagation();$('#library').click()};$('#photo').onclick=()=>$('#library').click();$('#camera').onchange=()=>setFile($('#camera').files[0]);$('#library').onchange=()=>setFile($('#library').files[0]);
  $('#form').onsubmit=async(event)=>{event.preventDefault();const submit=$('#submit');submit.disabled=true;submit.textContent='正在保存…';try{const meta=Object.fromEntries(fields.map(([key],index)=>[key,document.querySelector('[data-meta="'+index+'"]').value]));const response=await fetch('/v1/life/mobile/entries',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({title:$('#title').value,author:$('#author').value,tags:$('#tags').value,meta,imageDataUrl:dataUrl||undefined,mimeType:(/^data:([^;]+)/.exec(dataUrl||'')?.[1]||file?.type||'image/jpeg').toLowerCase(),fileName:file?.name||''})});const body=await response.json();if(!response.ok)throw new Error(body.error?.message||'保存失败');notice('已保存。电脑端将实时显示这条记录。');$('#form').reset();file=null;dataUrl='';$('#preview').hidden=true;$('#empty').hidden=false}catch(error){notice(error.message||'网络错误，请确认电脑服务正在运行。',true)}finally{submit.disabled=false;submit.textContent='保存到电脑端 ${label}'}};
  </script></body></html>`;
}

function lifeMobileHtmlV2({ module, studyArea = '' }) {
  const label = MODULE_LABELS[module] ?? '生活记录';
  const study = studyConfig(module);
  const typeOptions = study ? study.questionTypes.map((item) => `<option value="${html(item)}">${html(item)}</option>`).join('') : '';
  const selectedStudyArea = study && STUDY_AREAS.includes(studyArea) ? studyArea : '普通题记录';
  const areaOptions = study ? STUDY_AREAS.map((item) => `<option value="${html(item)}"${item === selectedStudyArea ? ' selected' : ''}>${html(item)}</option>`).join('') : '';
  const libraryLabel = study ? '标记为精选题，加入精选题资料库' : '同时收藏到私人资料库';
  const mobileIntro = study
    ? '此链接只负责记录到这台电脑。只有明确标记为「精选题」的内容才会加入「精选题资料库」；普通题会保留在本学科的历史区。'
    : '此链接只负责记录到这台电脑。收藏后才会加入「私人资料库」；未收藏的内容只保留在你的历史记录里。';
  const subjectFields = study ? `
    <label>题型选择<select id="questionType"><option value="">请选择题型</option>${typeOptions}</select></label>
    <label>内容板块<select id="studyArea">${areaOptions}</select></label>
    <label>学习过程<textarea id="body" placeholder="这道题怎样思考、哪里卡住、怎样解决"></textarea></label>
    <label>本次总结<textarea id="summary" placeholder="这一题型的规律、易错点或下一次提醒"></textarea></label>
  ` : `
    <label>过程 / 内容<textarea id="body" placeholder="写下这次发生的事情、读书感悟或过程"></textarea></label>
    <label>总结 / 提醒<textarea id="summary" placeholder="可选：想在以后回看时看到的总结"></textarea></label>
  `;
  const bodyMetaLabel = study ? '学习过程' : '记录内容';
  const summaryMetaLabel = study ? '本次总结' : '补充总结';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>ME.zip · ${html(label)}</title><style>
  :root{--paper:#f3eddf;--ink:#172128;--muted:#627077;--line:#c6bba7;--accent:#c75135;--violet:#5a4db6;--card:#fffdf8e8}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 0 0,#f8e4cb,transparent 48%),#e9e5dc;color:var(--ink);font-family:ui-serif,Georgia,"Noto Serif SC","Songti SC",serif}.shell{max-width:700px;margin:auto;padding:22px 15px 50px}.eyebrow{font:700 11px ui-monospace,monospace;letter-spacing:.14em;color:var(--accent)}h1{font-size:32px;margin:8px 0 4px;letter-spacing:-.04em}p{line-height:1.6;color:var(--muted)}.tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:18px 0}.tabs button,.actions button,.add{border:1px solid var(--line);background:#fff9f0;color:var(--ink);padding:11px 9px;border-radius:13px;font:700 13px system-ui,"PingFang SC",sans-serif}.tabs button.active,.actions button.primary,.add{background:var(--ink);color:#fffaf1;border-color:var(--ink)}.panel{display:none}.panel.active{display:block}.card{padding:17px;border:1px solid var(--line);border-radius:20px;background:var(--card);box-shadow:0 18px 42px #3e29191a}form{display:grid;gap:13px}label{display:grid;gap:6px;font:700 13px system-ui,"PingFang SC",sans-serif}input,textarea,select{width:100%;font:inherit;padding:12px;border:1px solid var(--line);border-radius:11px;background:#fffaf1;color:var(--ink)}textarea{min-height:92px;resize:vertical}.photo{display:grid;place-items:center;min-height:132px;padding:12px;border:1.5px dashed #aa9578;border-radius:15px;background:#fbf4e7;cursor:pointer;text-align:center}.photo small{display:block;color:var(--muted);margin-top:6px}.preview{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%}.preview img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:9px}.row{display:grid;grid-template-columns:1fr 1fr;gap:9px}.check{display:flex;align-items:center;gap:9px;font:600 13px system-ui}.check input{width:auto}.save{border:0;border-radius:13px;padding:14px;background:var(--ink);color:#fffaf1;font-weight:800;cursor:pointer}.save:disabled{opacity:.5}.notice{display:none;margin-top:12px;padding:11px;border-radius:11px;background:#e1efd9;color:#305a2c;font:600 13px system-ui}.notice.error{background:#f5ddd7;color:#7d2b20}.record{display:grid;gap:10px;margin-top:11px;padding:13px;border:1px solid var(--line);border-radius:15px;background:#fffdf8}.record h3{margin:0;font-size:18px}.record p{margin:0;font-size:14px}.gallery{display:flex;gap:7px;overflow:auto}.gallery img{width:78px;height:78px;object-fit:cover;border-radius:9px}.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{padding:4px 7px;border-radius:999px;background:#ede9fb;color:#51439a;font:700 11px system-ui}.actions{display:flex;flex-wrap:wrap;gap:7px}.actions button{padding:8px 10px}.hint{font:600 13px system-ui;color:var(--muted)}@media(max-width:410px){.row{grid-template-columns:1fr}.shell{padding-inline:12px}}
  </style></head><body><main class="shell"><div class="eyebrow">ME.ZIP · PRIVATE LOCAL STUDY</div><h1>${html(label)}</h1><p>${html(mobileIntro)}</p>
  <nav class="tabs"><button class="active" data-panel="new">新增记录</button><button data-panel="history">历史记录</button><button data-panel="reminders">提醒归纳</button></nav>
  <section class="panel active" id="new"><div class="card"><form id="form"><label>标题<input id="title" maxlength="100" placeholder="${study ? '例如：二次函数综合题' : '为这次记录起一个标题'}"></label><label>标签<input id="tags" maxlength="180" placeholder="例如：易错题，重点，灵感（用逗号分隔）"></label>${subjectFields}<label>提醒时间（可选）<input id="reminderAt" type="datetime-local"></label><input id="media" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple hidden><div id="photo" class="photo"><div><strong>添加多张图片（最多 6 张）</strong><small>点击后可拍照或从手机相册选择；可记录题目、过程与步骤</small></div><div id="preview" class="preview"></div></div><div class="row"><button id="take" type="button">拍照</button><button id="choose" type="button">从相册选择</button></div><label class="check"><input id="librarySaved" type="checkbox">${html(libraryLabel)}</label><button class="save" id="submit" type="submit">保存到电脑端</button></form><div id="notice" class="notice"></div></div></section>
  <section class="panel" id="history"><div class="card"><label>查找以前的历史记录<input id="search" placeholder="${study ? '搜索标题、过程、总结、标签、题型或内容板块' : '搜索标题、内容、标签或备注'}"></label><div id="historyList"></div></div></section>
  <section class="panel" id="reminders"><div class="card"><h2>提醒归纳</h2><p class="hint">这里显示你保存过的总结与设置了时间的提醒；点击历史记录可查看原图和过程。</p><div id="reminderList"></div></div></section>
  </main><script>
  const module=${JSON.stringify(module)},label=${JSON.stringify(label)},isStudy=${study ? 'true' : 'false'},bodyMetaLabel=${JSON.stringify(bodyMetaLabel)},summaryMetaLabel=${JSON.stringify(summaryMetaLabel)},$=(s)=>document.querySelector(s);let files=[];
  const note=(value,bad=false)=>{const box=$('#notice');box.textContent=value;box.className='notice'+(bad?' error':'');box.style.display='block'};
  document.querySelectorAll('[data-panel]').forEach((button)=>button.onclick=()=>{document.querySelectorAll('[data-panel]').forEach((item)=>item.classList.toggle('active',item===button));document.querySelectorAll('.panel').forEach((item)=>item.classList.toggle('active',item.id===button.dataset.panel));if(button.dataset.panel!=='new')loadRecords()});
  function renderPreviews(){const target=$('#preview');target.replaceChildren(...files.map((file)=>{const image=document.createElement('img');image.alt=file.name;image.src=URL.createObjectURL(file);return image}))}
  function useFiles(list){files=Array.from(list||[]).slice(0,6);renderPreviews();if((list?.length||0)>6)note('一次最多保存 6 张图片，已保留前 6 张。',true)}
  $('#photo').onclick=()=>$('#media').click();$('#choose').onclick=()=>$('#media').click();$('#take').onclick=()=>{const input=$('#media');input.removeAttribute('multiple');input.setAttribute('capture','environment');input.click();setTimeout(()=>{input.setAttribute('multiple','');input.removeAttribute('capture')},0)};$('#media').onchange=()=>useFiles($('#media').files);
  const dataUrl=(file)=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error('无法读取图片'));reader.readAsDataURL(file)});
  async function shrink(file){if(file.size<=3.5*1024*1024)return {dataUrl:await dataUrl(file),mimeType:file.type,fileName:file.name};try{const bitmap=await createImageBitmap(file);const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise((resolve,reject)=>canvas.toBlob((value)=>value?resolve(value):reject(new Error('压缩失败')),'image/jpeg',.84));return {dataUrl:await dataUrl(blob),mimeType:'image/jpeg',fileName:(file.name.replace(/\\.[^.]+$/u,'')||'photo')+'.jpg'}}catch{return {dataUrl:await dataUrl(file),mimeType:file.type,fileName:file.name}}}
  async function request(path,options={}){const response=await fetch(path,{credentials:'include',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error?.message||'操作失败');return body}
  $('#form').onsubmit=async(event)=>{event.preventDefault();const submit=$('#submit');submit.disabled=true;submit.textContent='正在保存…';try{const images=await Promise.all(files.map(shrink));const summary=$('#summary')?.value||'';const process=$('#body')?.value||'';const body=await request('/v1/life/mobile/entries',{method:'POST',body:JSON.stringify({title:$('#title').value,tags:$('#tags').value,body:process,meta:{[bodyMetaLabel]:process,[summaryMetaLabel]:summary},questionType:$('#questionType')?.value||'',studyArea:$('#studyArea')?.value||'',reminderAt:$('#reminderAt').value||null,librarySaved:$('#librarySaved').checked,images})});note(body.entry.librarySaved?(isStudy?'已保存并加入精选题资料库。':'已保存并收藏到私人资料库。'):(isStudy?'已保存到该学科历史区；尚未标记为精选题。':'已保存到历史记录；尚未收藏到私人资料库。'));$('#form').reset();files=[];renderPreviews()}catch(error){note(error.message||'网络错误，请确认电脑服务正在运行。',true)}finally{submit.disabled=false;submit.textContent='保存到电脑端'}};
  const esc=(value)=>String(value||'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function entryMarkup(entry){const media=(entry.media||[]).map((item)=>'<img src="'+item.url+'" alt="记录图片">').join('');const meta=Object.entries(entry.meta||{}).filter(([,value])=>value).map(([key,value])=>'<span class="chip">'+esc(key)+'：'+esc(value)+'</span>').join('');const studyChips=(entry.studyArea?'<span class="chip">'+esc(entry.studyArea)+'</span>':'')+(entry.questionType?'<span class="chip">'+esc(entry.questionType)+'</span>':'');const libraryText=entry.librarySaved?(isStudy?'移出精选题':'取消收藏'):(isStudy?'加入精选题':'收藏到私人资料库');return '<article class="record"><h3>'+esc(entry.title)+'</h3><p>'+esc(entry.body||'')+'</p><div class="gallery">'+media+'</div><div class="chips">'+studyChips+(entry.tags||[]).map((tag)=>'<span class="chip">#'+esc(tag)+'</span>').join('')+meta+'</div><div class="actions"><button data-library="'+entry.id+'" data-library-saved="'+(entry.librarySaved?'true':'false')+'">'+libraryText+'</button>'+(entry.librarySaved?'<button class="primary" data-share="'+entry.id+'">生成只读分享链接</button>':'')+'</div></article>'}
  async function loadRecords(){try{const value=await request('/v1/life/entries?module='+encodeURIComponent(module));const query=$('#search')?.value.trim().toLowerCase()||'';const matched=value.entries.filter((entry)=>!query||JSON.stringify(entry).toLowerCase().includes(query));$('#historyList').innerHTML=matched.length?matched.map(entryMarkup).join(''):'<p class="hint">还没有记录。保存的内容会一直保留在此设备的本地历史中。</p>';const reminders=value.entries.filter((entry)=>entry.reminderAt||entry.meta?.[summaryMetaLabel]).map((entry)=>'<article class="record"><h3>'+esc(entry.title)+'</h3><p>'+esc(entry.reminderAt?'提醒：'+entry.reminderAt:'')+'</p><p>'+esc(entry.meta?.[summaryMetaLabel]||'')+'</p></article>');$('#reminderList').innerHTML=reminders.length?reminders.join(''):'<p class="hint">暂无提醒归纳。</p>';document.querySelectorAll('[data-library]').forEach((button)=>button.onclick=async()=>{try{await request('/v1/life/entries/'+button.dataset.library+'/library',{method:'POST',body:JSON.stringify({saved:button.dataset.librarySaved!=='true'})});await loadRecords()}catch(error){alert(error.message)}});document.querySelectorAll('[data-share]').forEach((button)=>button.onclick=async()=>{try{const shared=await request('/v1/life/entries/'+button.dataset.share+'/share',{method:'POST',body:'{}'});if(navigator.clipboard)await navigator.clipboard.writeText(shared.shareUrl);prompt('这是只读分享链接（仅同一 Wi-Fi 且电脑服务运行时可访问）：',shared.shareUrl)}catch(error){alert(error.message)}})}catch(error){$('#historyList').innerHTML='<p class="hint">'+esc(error.message)+'</p>'}}
  $('#search')?.addEventListener('input',loadRecords);loadRecords();
  </script></body></html>`;
}

function lifeShareHtml(entry, token) {
  const images = mediaItems(entry).map((image, index) => '<img src="/v1/life/share-media/' + encodeURIComponent(entry.id) + '/' + index + '?token=' + encodeURIComponent(token) + '" alt="' + html(image.fileName || '分享图片') + '">').join('');
  const tags = (entry.tags ?? []).map((tag) => '<span>#' + html(tag) + '</span>').join('');
  const details = Object.entries(entry.meta ?? {}).filter(([, value]) => value).map(([key, value]) => '<li><b>' + html(key) + '</b><span>' + html(value) + '</span></li>').join('');
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + html(entry.title) + ' · ME.zip</title><style>body{margin:0;background:#f3ede0;color:#182127;font-family:ui-serif,Georgia,"Noto Serif SC",serif}.page{max-width:760px;margin:auto;padding:46px 18px}.eyebrow{font:700 12px ui-monospace,monospace;letter-spacing:.14em;color:#c75135}.card{margin-top:18px;padding:26px;border:1px solid #c6bba7;border-radius:20px;background:#fffdf8;box-shadow:0 18px 52px #543b2018}h1{font-size:35px;margin:10px 0}.body{white-space:pre-wrap;line-height:1.8;color:#445057}.tags{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.tags span{padding:6px 9px;border-radius:99px;background:#e5e0f1;color:#4d438e;font:700 13px system-ui}ul{padding:0;list-style:none;display:grid;gap:8px}li{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid #e7dfd2}li span{color:#627077}.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-top:18px}.gallery img{width:100%;max-height:340px;object-fit:cover;border-radius:12px;border:1px solid #d4c8b4}.foot{margin-top:18px;font:13px system-ui;color:#657075}</style></head><body><main class="page"><div class="eyebrow">ME.ZIP · SHARED STUDY NOTE</div><section class="card"><h1>' + html(entry.title) + '</h1><p class="body">' + html(entry.body || '未填写正文') + '</p><div class="tags">' + tags + '</div>' + (entry.questionType ? '<p><b>题型：</b>' + html(entry.questionType) + '</p>' : '') + (details ? '<ul>' + details + '</ul>' : '') + '<div class="gallery">' + images + '</div><p class="foot">此页面是作者明确分享的只读内容，不展示其他私人记录。</p></section></main></body></html>';
}

export function createLifeMobileBridge(options = {}) {
  const host = options.host ?? process.env.MEZIP_LIFE_MOBILE_HOST ?? '0.0.0.0';
  const port = Number(options.port ?? process.env.MEZIP_LIFE_MOBILE_PORT ?? 4327);
  const dataDirectory = options.dataDirectory ?? process.env.MEZIP_LIFE_MOBILE_DATA_PATH ?? defaultDataDirectory();
  const dataPath = join(dataDirectory, 'life.json');
  const filesDirectory = join(dataDirectory, 'images');
  const keyPath = join(dataDirectory, 'session.key');
  mkdirSync(filesDirectory, { recursive: true });
  const key = existsSync(keyPath) ? readFileSync(keyPath) : randomBytes(32);
  if (!existsSync(keyPath)) writeFileSync(keyPath, key, { mode: 0o600 });
  const writeDocument = (document) => atomicWrite(dataPath, JSON.stringify(document, null, 2));
  const subscribers = new Set();
  let server;
  const activePort = () => { const address = server?.address?.(); return address && typeof address === 'object' ? address.port : port; };
  const emit = (event, entryId = null) => {
    const payload = `event: life\ndata: ${JSON.stringify({ event, entryId, at: new Date().toISOString() })}\n\n`;
    for (const response of subscribers) { try { response.write(payload); } catch { subscribers.delete(response); } }
  };
  const desktopSession = (request) => readCookie(request, 'mezip_life_desktop_session', key);
  const mobileSession = (request) => readCookie(request, 'mezip_life_mobile_session', key);
  const requireDesktop = (request, response, origin) => {
    const session = desktopSession(request);
    if (session?.role === 'desktop') return session;
    failure(response, 401, 'UNAUTHORIZED', '请先从电脑端打开生活记录中心。', origin); return null;
  };
  const requireMobile = (request, response) => {
    const session = mobileSession(request); const pairing = session?.module ? safeDocument(dataPath).pairings[session.module] : null;
    if (session?.role === 'mobile' && pairing?.version === session.pairingVersion) return session;
    failure(response, 401, 'PAIRING_REQUIRED', '此手机尚未配对，请从电脑端重新生成手机链接。'); return null;
  };
  const issueDesktop = () => createCookie('mezip_life_desktop_session', { role: 'desktop', expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 }, key);
  const issueMobile = (module, pairingVersion, deviceId) => createCookie('mezip_life_mobile_session', { role: 'mobile', module, pairingVersion, deviceId, expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 }, key);
  const entryForSession = (entry, session) => ({ ...compactEntry(entry), likedByMe: (entry.likes ?? []).includes(session?.deviceId ?? 'desktop'), favoritedByMe: (entry.favorites ?? []).includes(session?.deviceId ?? 'desktop') });
  const routeSession = (request, response, origin) => {
    const desktop = desktopSession(request);
    if (desktop?.role === 'desktop') return desktop;
    if (origin) return null;
    const mobile = mobileSession(request);
    const pairing = mobile?.module ? safeDocument(dataPath).pairings[mobile.module] : null;
    return mobile?.role === 'mobile' && pairing?.version === mobile.pairingVersion ? mobile : null;
  };

  server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://${host}:${activePort()}`);
    const origin = desktopOrigin(request.headers.origin);
    try {
      if (request.method === 'OPTIONS') { response.statusCode = 204; if (origin) { response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Access-Control-Allow-Credentials', 'true'); response.setHeader('Access-Control-Allow-Headers', 'Content-Type'); response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS'); response.setHeader('Access-Control-Max-Age', '600'); response.setHeader('Vary', 'Origin'); } response.end(); return; }
      if (request.method === 'GET' && url.pathname === '/v1/life/health') { json(response, 200, { status: 'READY', storage: 'LOCAL_PRIVATE', lanAddress: lanAddress(), port: activePort(), modules: MODULES }, origin); return; }
      if (request.method === 'GET' && url.pathname === '/v1/life/desktop-session') {
        if (!loopbackRequest(request)) { failure(response, 403, 'LOCAL_ONLY', '桌面会话只能由这台电脑创建。', origin); return; }
        json(response, 200, { status: 'READY', storage: 'LOCAL_PRIVATE' }, origin, [issueDesktop()]); return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/life/invite') {
        if (!requireDesktop(request, response, origin)) return;
        const module = normalModule(url.searchParams.get('module'));
        if (!module) { failure(response, 400, 'MODULE_REQUIRED', '请选择健身、读书、照片或互动模块。', origin); return; }
        const requestedStudyArea = studyConfig(module) && STUDY_AREAS.includes(url.searchParams.get('studyArea') ?? '') ? url.searchParams.get('studyArea') : '';
        const document = safeDocument(dataPath); let pairing = document.pairings[module];
        let token = pairing?.tokenSealed ? unsealed(pairing.tokenSealed, key) : null;
        if (!pairing || !token || !safeEqual(pairing.tokenHash, hmac(token, key))) {
          token = randomBytes(32).toString('base64url');
          pairing = { module, version: randomUUID(), tokenHash: hmac(token, key), tokenSealed: sealed(token, key), createdAt: new Date().toISOString(), permanent: true };
          document.pairings[module] = pairing;
        } else {
          pairing.lastRequestedAt = new Date().toISOString();
        }
        writeDocument(document);
        const address = lanAddress(); const base = address ? `http://${address}:${activePort()}` : null;
        json(response, 200, { status: base ? 'READY' : 'LAN_ADDRESS_UNAVAILABLE', module, mobileUrl: base ? `${base}/mobile?module=${module}&pair=${encodeURIComponent(token)}${requestedStudyArea ? `&studyArea=${encodeURIComponent(requestedStudyArea)}` : ''}` : null, permanent: true, network: 'TRUSTED_LAN_ONLY' }, origin); return;
      }
      if (request.method === 'GET' && url.pathname === '/mobile') {
        const module = normalModule(url.searchParams.get('module')); const token = url.searchParams.get('pair') ?? ''; const pairing = module ? safeDocument(dataPath).pairings[module] : null;
        if (!module || !pairing || !safeEqual(pairing.tokenHash, hmac(token, key))) { response.statusCode = 401; response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end('<h1>手机链接无效</h1><p>请回到电脑端重新生成该模块的手机链接。</p>'); return; }
        const requestedStudyArea = studyConfig(module) && STUDY_AREAS.includes(url.searchParams.get('studyArea') ?? '') ? url.searchParams.get('studyArea') : '';
        const previous = mobileSession(request); const deviceId = previous?.module === module && previous.pairingVersion === pairing.version ? previous.deviceId : randomUUID();
        response.statusCode = 200; response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.setHeader('Cache-Control', 'no-store'); response.setHeader('Set-Cookie', issueMobile(module, pairing.version, deviceId)); response.end(lifeMobileHtmlV2({ module, studyArea: requestedStudyArea })); return;
      }
      if (request.method === 'GET' && url.pathname === '/share') {
        const entryId = url.searchParams.get('entry') ?? ''; const token = url.searchParams.get('token') ?? ''; const document = safeDocument(dataPath); const share = document.shares[entryId];
        const valid = share?.tokenHash && safeEqual(share.tokenHash, hmac(token, key)); const entry = valid ? document.entries.find((candidate) => candidate.id === entryId) : null;
        if (!entry?.librarySaved) { response.statusCode = 404; response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end('<h1>分享内容不可用</h1><p>这条私人资料已被取消收藏或删除。</p>'); return; }
        response.statusCode = 200; response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.setHeader('Cache-Control', 'private, no-store'); response.setHeader('Referrer-Policy', 'no-referrer'); response.end(lifeShareHtml(entry, token)); return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/life/events') {
        if (!requireDesktop(request, response, origin)) return;
        response.statusCode = 200; response.setHeader('Content-Type', 'text/event-stream'); response.setHeader('Cache-Control', 'no-cache'); response.setHeader('Connection', 'keep-alive'); response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Access-Control-Allow-Credentials', 'true'); response.write('event: life\ndata: {"event":"READY"}\n\n'); subscribers.add(response); request.on('close', () => subscribers.delete(response)); return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/life/entries') {
        const session = origin ? requireDesktop(request, response, origin) : requireMobile(request, response);
        if (!session) return;
        const module = url.searchParams.get('module');
        if (session.role === 'mobile' && module && module !== session.module) { failure(response, 403, 'FORBIDDEN', '手机入口只能读取本板块的记录。', origin); return; }
        const entries = safeDocument(dataPath).entries.filter((entry) => !module || entry.module === module).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        json(response, 200, { entries: entries.map((entry) => entryForSession(entry, session)) }, origin); return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/life/summary') {
        if (!requireDesktop(request, response, origin)) return;
        const entries = safeDocument(dataPath).entries; const byModule = Object.fromEntries(MODULES.map((module) => [module, entries.filter((entry) => entry.module === module).length]));
        json(response, 200, { total: entries.length, byModule, tags: [...new Set(entries.flatMap((entry) => entry.tags ?? []))].sort(), interactions: entries.reduce((total, entry) => total + (entry.likes?.length ?? 0) + (entry.favorites?.length ?? 0) + (entry.comments?.length ?? 0), 0) }, origin); return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/life/mobile/entries') {
        const session = requireMobile(request, response); if (!session) return; const body = await readJson(request); const document = safeDocument(dataPath);
        const mimeType = text(body.mimeType, 40).toLowerCase(); let image = null;
        if (body.imageDataUrl) { const extension = imageExtension(mimeType); if (!extension) throw new Error('只支持 JPG、PNG、WebP、HEIC 图片。'); const bytes = dataUrlBytes(body.imageDataUrl, mimeType); const fileId = randomUUID(); const filePath = join(filesDirectory, `${fileId}${extension}`); writeFileSync(filePath, bytes, { mode: 0o600 }); image = { fileId, filePath, fileName: text(body.fileName, 180) || `life${extension}`, mimeType }; }
        const entry = { id: `life-${randomUUID()}`, module: session.module, title: text(body.title, 100) || MODULE_LABELS[session.module], body: text(body.body, 12000), meta: normalMeta(body.meta), tags: normalTags(body.tags), author: text(body.author, 30) || '我的手机', image, likes: [], favorites: [], comments: [], createdAt: new Date().toISOString() };
        const rawImages = Array.isArray(body.images) ? body.images : [];
        if (rawImages.length > MAX_IMAGES_PER_ENTRY) { failure(response, 400, 'TOO_MANY_IMAGES', '每条记录最多上传 6 张图片。'); return; }
        const images = [];
        try {
          for (const rawImage of rawImages) {
            const imageMimeType = text(rawImage?.mimeType, 40).toLowerCase(); const extension = imageExtension(imageMimeType);
            if (!extension) throw new Error('只支持 JPG、PNG、WebP、HEIC 图片。');
            const bytes = dataUrlBytes(rawImage?.dataUrl ?? rawImage?.imageDataUrl, imageMimeType);
            const fileId = randomUUID(); const filePath = join(filesDirectory, fileId + extension);
            writeFileSync(filePath, bytes, { mode: 0o600 });
            images.push({ fileId, filePath, fileName: text(rawImage?.fileName, 180) || ('life' + extension), mimeType: imageMimeType });
          }
        } catch (error) {
          for (const item of images) if (existsSync(item.filePath)) unlinkSync(item.filePath);
          throw error;
        }
        if (images.length) { entry.images = images; entry.image = images[0]; }
        else if (entry.image) entry.images = [entry.image];
        const study = studyConfig(session.module); const suppliedQuestionType = text(body.questionType, 80); const suppliedStudyArea = text(body.studyArea, 80);
        entry.body = text(body.body, 12000);
        entry.questionType = study?.questionTypes.includes(suppliedQuestionType) ? suppliedQuestionType : null;
        entry.studyArea = study && STUDY_AREAS.includes(suppliedStudyArea) ? suppliedStudyArea : (study ? '普通题记录' : null);
        const reminderText = text(body.reminderAt, 64);
        entry.reminderAt = reminderText && !Number.isNaN(Date.parse(reminderText)) ? new Date(reminderText).toISOString() : null;
        entry.librarySaved = Boolean(body.librarySaved);
        document.entries.push(entry); writeDocument(document); emit('ENTRY_CREATED', entry.id); json(response, 201, { status: 'SAVED_LOCAL', entry: compactEntry(entry) }); return;
      }
      const entryAction = /^\/v1\/life\/entries\/([^/]+)\/(library|share)$/u.exec(url.pathname);
      if (entryAction && request.method === 'POST') {
        const session = origin ? requireDesktop(request, response, origin) : requireMobile(request, response); if (!session) return;
        const document = safeDocument(dataPath); const entry = document.entries.find((candidate) => candidate.id === entryAction[1]);
        if (!entry) { failure(response, 404, 'NOT_FOUND', '没有找到这条生活记录。', origin); return; }
        if (session.role === 'mobile' && entry.module !== session.module) { failure(response, 403, 'FORBIDDEN', '手机入口只能操作本板块的记录。', origin); return; }
        const body = await readJson(request);
        if (entryAction[2] === 'library') {
          entry.librarySaved = typeof body.saved === 'boolean' ? body.saved : !entry.librarySaved;
          if (!entry.librarySaved) delete document.shares[entry.id];
          writeDocument(document); emit('LIBRARY_CHANGED', entry.id); json(response, 200, { entry: entryForSession(entry, session) }, origin); return;
        }
        if (!entry.librarySaved) { failure(response, 409, 'PRIVATE_LIBRARY_REQUIRED', '请先收藏到私人资料库，再生成分享链接。', origin); return; }
        let share = document.shares[entry.id]; let token = share?.tokenSealed ? unsealed(share.tokenSealed, key) : null;
        if (!share || !token || !safeEqual(share.tokenHash, hmac(token, key))) { token = randomBytes(32).toString('base64url'); share = { tokenHash: hmac(token, key), tokenSealed: sealed(token, key), createdAt: new Date().toISOString() }; document.shares[entry.id] = share; }
        share.lastRequestedAt = new Date().toISOString(); writeDocument(document);
        const address = lanAddress(); if (!address) { failure(response, 503, 'LAN_ADDRESS_UNAVAILABLE', '无法找到局域网地址，暂不能生成手机分享链接。', origin); return; }
        json(response, 200, { entry: entryForSession(entry, session), shareUrl: 'http://' + address + ':' + activePort() + '/share?entry=' + encodeURIComponent(entry.id) + '&token=' + encodeURIComponent(token), network: 'TRUSTED_LAN_ONLY' }, origin); return;
      }
      const match = /^\/v1\/life\/entries\/([^/]+)(?:\/(react|comments))?$/u.exec(url.pathname);
      if (match && request.method === 'POST') {
        const session = origin ? requireDesktop(request, response, origin) : requireMobile(request, response); if (!session) return;
        const document = safeDocument(dataPath); const entry = document.entries.find((candidate) => candidate.id === match[1]); if (!entry) { failure(response, 404, 'NOT_FOUND', '没有找到这条生活记录。', origin); return; }
        if (session.role === 'mobile' && entry.module !== session.module) { failure(response, 403, 'FORBIDDEN', '手机入口只能操作本板块的记录。', origin); return; }
        const body = await readJson(request); const deviceId = session.deviceId ?? 'desktop';
        if (match[2] === 'react') { const action = body.action === 'favorite' ? 'favorites' : body.action === 'like' ? 'likes' : null; if (!action) { failure(response, 400, 'ACTION_REQUIRED', '请选择点赞或收藏。', origin); return; } const set = new Set(entry[action] ?? []); set.has(deviceId) ? set.delete(deviceId) : set.add(deviceId); entry[action] = [...set]; writeDocument(document); emit('REACTION_CHANGED', entry.id); json(response, 200, { entry: entryForSession(entry, session) }, origin); return; }
        if (match[2] === 'comments') { const content = text(body.content, 800); if (!content) { failure(response, 400, 'COMMENT_REQUIRED', '评论不能为空。', origin); return; } entry.comments = [...(entry.comments ?? []), { id: `comment-${randomUUID()}`, author: text(body.author, 30) || (session.role === 'desktop' ? 'Tom' : '访客'), content, createdAt: new Date().toISOString() }]; writeDocument(document); emit('COMMENT_CREATED', entry.id); json(response, 201, { entry: entryForSession(entry, session) }, origin); return; }
      }
      if (match && !match[2] && request.method === 'DELETE') {
        if (!requireDesktop(request, response, origin)) return; const document = safeDocument(dataPath); const index = document.entries.findIndex((entry) => entry.id === match[1]); if (index < 0) { failure(response, 404, 'NOT_FOUND', '没有找到这条生活记录。', origin); return; }
        const [removed] = document.entries.splice(index, 1); removeEntryMedia(removed); delete document.shares[removed.id]; writeDocument(document); emit('ENTRY_REMOVED', removed.id); json(response, 200, { removedId: removed.id }, origin); return;
      }
      const sharedMedia = /^\/v1\/life\/share-media\/([^/]+)\/(\d+)$/u.exec(url.pathname);
      if (sharedMedia && request.method === 'GET') {
        const document = safeDocument(dataPath); const token = url.searchParams.get('token') ?? ''; const share = document.shares[sharedMedia[1]];
        const valid = share?.tokenHash && safeEqual(share.tokenHash, hmac(token, key)); const entry = valid ? document.entries.find((candidate) => candidate.id === sharedMedia[1]) : null;
        const image = entry?.librarySaved ? mediaItems(entry)[Number(sharedMedia[2])] : null;
        if (!image?.filePath || !existsSync(image.filePath)) { failure(response, 404, 'NOT_FOUND', '分享图片不可用。', origin); return; }
        response.statusCode = 200; response.setHeader('Content-Type', image.mimeType); response.setHeader('Cache-Control', 'private, max-age=300'); response.setHeader('X-Content-Type-Options', 'nosniff'); response.end(readFileSync(image.filePath)); return;
      }
      const media = /^\/v1\/life\/media\/([^/]+)(?:\/(\d+))?$/u.exec(url.pathname);
      if (media && request.method === 'GET') {
        const session = routeSession(request, response, origin); if (!session) { failure(response, 401, 'UNAUTHORIZED', '请从已配对设备打开图片。', origin); return; }
        const entry = safeDocument(dataPath).entries.find((candidate) => candidate.id === media[1]); if (session.role === 'mobile' && entry?.module !== session.module) { failure(response, 403, 'FORBIDDEN', '手机入口只能读取本板块的图片。', origin); return; }
        const image = entry ? mediaItems(entry)[Number(media[2] ?? 0)] : null; if (!image?.filePath || !existsSync(image.filePath)) { failure(response, 404, 'NOT_FOUND', '本地图片不存在。', origin); return; }
        response.statusCode = 200; response.setHeader('Content-Type', image.mimeType); response.setHeader('Cache-Control', 'private, max-age=300'); response.setHeader('X-Content-Type-Options', 'nosniff'); response.end(readFileSync(image.filePath)); return;
      }
      failure(response, 404, 'NOT_FOUND', '未找到本地生活记录中心接口。', origin);
    } catch (caught) { failure(response, 500, 'INTERNAL', caught instanceof Error ? caught.message : '本地生活记录中心发生错误。', origin); }
  });
  server.on('close', () => { for (const response of subscribers) response.end(); subscribers.clear(); });
  return { server, host, port, dataDirectory, lanAddress: lanAddress() };
}

export function startLifeMobileBridge(options = {}) {
  const bridge = createLifeMobileBridge(options);
  bridge.server.listen(bridge.port, bridge.host, () => process.stdout.write(`ME.zip Life Mobile Bridge listening on http://${bridge.host}:${bridge.port}\n`));
  return bridge;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) startLifeMobileBridge();
