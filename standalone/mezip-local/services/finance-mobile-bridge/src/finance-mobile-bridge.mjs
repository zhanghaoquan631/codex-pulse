import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { networkInterfaces, tmpdir } from 'node:os';
import { recognizeLocalReceipt } from './local-ocr.mjs';

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_JSON_BYTES = 5 * 1024 * 1024;
const MOBILE_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_INVITE_MAX_AGE_MINUTES = 24 * 60;
const MIN_INVITE_MAX_AGE_MINUTES = 15;
const MAX_INVITE_MAX_AGE_MINUTES = 7 * 24 * 60;

function inviteExpiryMinutes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_INVITE_MAX_AGE_MINUTES;
  return Math.min(MAX_INVITE_MAX_AGE_MINUTES, Math.max(MIN_INVITE_MAX_AGE_MINUTES, Math.floor(parsed)));
}

function base64(value) { return Buffer.from(value).toString('base64url'); }
function hmac(value, key) { return base64(createHmac('sha256', key).update(value).digest()); }
function safeEqual(left, right) {
  return typeof left === 'string' && typeof right === 'string' && left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function makeCookie(name, payload, key, maxAgeSeconds) {
  const encoded = base64(JSON.stringify(payload));
  return `${name}=${encodeURIComponent(`${encoded}.${hmac(encoded, key)}`)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').flatMap((piece) => {
    const separator = piece.indexOf('=');
    return separator < 0 ? [] : [[piece.slice(0, separator).trim(), decodeURIComponent(piece.slice(separator + 1).trim())]];
  }));
}

function readCookie(request, name, key) {
  const raw = parseCookies(request.headers.cookie)[name];
  if (!raw) return null;
  const [encoded, signature] = raw.split('.');
  if (!encoded || !signature || !safeEqual(hmac(encoded, key), signature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return payload && typeof payload === 'object' && typeof payload.expiresAt === 'number' && payload.expiresAt > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function atomicWrite(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, value, { encoding: 'utf8', mode: 0o600 });
  renameSync(temporary, path);
}

function safeDocument(path) {
  if (!existsSync(path)) return { records: [], pairing: null };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.records)) {
      return { records: parsed.records, pairing: parsed.pairing ?? null };
    }
  } catch {
    // A corrupt inbox must fail closed. Do not turn it into a cross-device read.
  }
  return { records: [], pairing: null };
}

function defaultDataDirectory() {
  const local = process.env.LOCALAPPDATA?.trim() || tmpdir();
  return join(local, 'ME.zip', 'finance-mobile-inbox');
}

function getLanAddress() {
  const candidates = Object.values(networkInterfaces()).flat().filter((entry) => entry && entry.family === 'IPv4' && !entry.internal);
  const privateAddress = candidates.find((entry) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/u.test(entry.address));
  return (privateAddress ?? candidates[0])?.address ?? null;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const value = Buffer.from(chunk);
    size += value.byteLength;
    if (size > MAX_JSON_BYTES) throw new Error('照片过大。请使用清晰但小于 3 MB 的图片。');
    chunks.push(value);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function json(response, status, body, origin, cookies = []) {
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

function error(response, status, code, message, origin) {
  json(response, status, { error: { code, message } }, origin);
}

function desktopOrigin(origin) {
  return origin === 'http://127.0.0.1:5174' || origin === 'http://localhost:5174' ? origin : '';
}

function loopbackRequest(request) {
  return request.socket.remoteAddress === '127.0.0.1' || request.socket.remoteAddress === '::1' || request.socket.remoteAddress === '::ffff:127.0.0.1';
}

function extensionFromMime(mimeType) {
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
  const match = /^data:([^;]+);base64,([a-z0-9+/=\s]+)$/iu.exec(String(value || ''));
  if (!match || match[1].toLowerCase() !== mimeType) throw new Error('照片格式不正确。请重新拍照或选择图片。');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('照片过大。请使用清晰但小于 3 MB 的图片。');
  if (!looksLikeImage(bytes, mimeType)) throw new Error('图片内容无法验证。请重新拍照或选择原图。');
  return bytes;
}

const NOTE_GRID_FIELDS = Object.freeze(['sku', 'nameSpec', 'unit', 'quantity', 'unitPrice', 'amount', 'remark']);

function normalizeNoteGrid(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 40).map((row) => {
    const normalized = {};
    for (const field of NOTE_GRID_FIELDS) normalized[field] = String(row?.[field] ?? '').trim().slice(0, field === 'remark' ? 220 : 120);
    return normalized;
  }).filter((row) => NOTE_GRID_FIELDS.some((field) => row[field]));
}

function patchReceiptRecord(record, body) {
  return {
    ...record,
    amount: String(body.amount ?? record.amount ?? '').slice(0, 32),
    merchant: String(body.merchant ?? record.merchant ?? '').slice(0, 160),
    occurredAt: String(body.occurredAt ?? record.occurredAt ?? '').slice(0, 40),
    note: String(body.note ?? record.note ?? '').slice(0, 600),
    noteGrid: body.noteGrid === undefined ? normalizeNoteGrid(record.noteGrid) : normalizeNoteGrid(body.noteGrid),
    type: body.type === 'INCOME' ? 'INCOME' : body.type === 'EXPENSE' ? 'EXPENSE' : record.type,
    updatedAt: new Date().toISOString(),
  };
}

function mobileHtml({ version = 'v1' } = {}) {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<meta name="color-scheme" content="light" /><title>ME.zip · 手机记账</title><style>
:root{color-scheme:light;--bg:#f6f7f9;--card:#fff;--line:#e3e7ed;--text:#202733;--muted:#7c8593;--blue:#315dea}*{box-sizing:border-box}html{overflow-x:hidden}body{margin:0;min-height:100vh;overflow-x:hidden;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}.shell{width:100%;max-width:560px;min-width:0;margin:auto;padding:26px 18px calc(30px + env(safe-area-inset-bottom));overflow-x:hidden}.brand{display:flex;align-items:center;gap:9px;color:var(--text);font-size:14px;font-weight:750;letter-spacing:.04em}.brand-mark{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:var(--text);color:#fff;font-size:15px}.heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:24px}.step{padding:6px 10px;border-radius:999px;background:#edf1ff;color:var(--blue);font-size:12px;white-space:nowrap}h1{font-size:28px;line-height:1.3;margin:0;letter-spacing:-.03em}.intro{font-size:14px;color:var(--muted);line-height:1.7;margin:10px 0 20px}.card{width:100%;min-width:0;max-width:100%;padding:20px;border:1px solid var(--line);border-radius:20px;background:var(--card);box-shadow:0 4px 18px #20273305;overflow:hidden}.status{display:flex;align-items:center;gap:7px;color:var(--muted);font-size:12px}.status-dot{width:6px;height:6px;border-radius:50%;background:#4d9d73}.photo{display:grid;place-items:center;min-height:174px;border:1.5px dashed #d2d9e5;border-radius:14px;background:#f8f9fc;overflow:hidden;text-align:center}.photo img{width:100%;max-width:100%;height:230px;object-fit:contain;background:#f6f7f9}.photo-icon{display:grid;place-items:center;width:42px;height:42px;margin:0 auto 10px;color:var(--blue);background:#edf1ff;border-radius:13px}.photo strong{display:block;font-size:15px;font-weight:650}.photo span{display:block;color:var(--muted);font-size:12px;margin-top:6px}.source-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%}.source-actions button{padding:12px;background:#f7f9fd;color:var(--text);border:1px solid var(--line);font-weight:600}.source-actions button:first-child{color:var(--blue);background:#edf1ff;border-color:#dce4ff}input,select,textarea,button{font:inherit}input,select,textarea{width:100%;min-width:0;min-height:46px;padding:12px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--text);outline:none}input:focus,select:focus,textarea:focus{border-color:#9ab0ff;box-shadow:0 0 0 3px #315dea0c}input::placeholder,textarea::placeholder{color:#a0a8b4}textarea{min-height:78px;resize:vertical}.grid{display:grid;gap:15px;min-width:0}.grid>*{min-width:0}.two{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:12px}label{display:grid;gap:7px;font-size:13px;color:#536070;min-width:0}label small{color:#99a1ad;font-size:11px;font-weight:400}.amount-wrap{position:relative}.amount-wrap span{position:absolute;top:14px;left:12px;color:#86909d;font-size:16px}.amount-wrap input{padding-left:30px;font-size:18px;font-weight:600}button{width:100%;border:0;border-radius:11px;padding:14px;background:var(--blue);color:#fff;font-weight:650;cursor:pointer;min-height:46px}button[disabled]{opacity:.5;cursor:not-allowed}button:focus-visible{outline:3px solid #a8baff;outline-offset:2px}.result{display:none;margin-top:15px;padding:13px;border:1px solid #d8eadf;border-radius:11px;background:#f0f8f3;color:#32714b;font-size:13px;line-height:1.6}.error{background:#fff4f3;border-color:#f1d7d3;color:#aa4540}.footer-note{text-align:center;color:#9aa2af;font-size:11px;margin:16px 0 0;line-height:1.6}[hidden]{display:none!important}
.receipt-grid{width:100%;min-width:0;max-width:100%;margin-top:1px;padding:12px;border:1px solid var(--line);border-radius:11px;background:#fafbfc;overflow:hidden}.receipt-grid>*{min-width:0}.receipt-grid summary{cursor:pointer;color:#536070;font-size:13px;font-weight:600}.receipt-grid p{font-size:11px;margin:10px 0;color:var(--muted);line-height:1.6}.receipt-grid-scroll{width:100%;max-width:100%;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;border-radius:7px}.receipt-grid table{width:710px;min-width:710px;max-width:none;border-collapse:collapse}.receipt-grid th,.receipt-grid td{border:1px solid var(--line);padding:0}.receipt-grid th{padding:9px 6px;color:#697585;background:#f1f4f8;text-align:center;font-size:11px;font-weight:600}.receipt-grid td input{width:100%;min-width:72px;border:0;border-radius:0;padding:10px 7px;background:#fff;font-size:13px}.receipt-grid td:nth-child(2) input,.receipt-grid td:nth-child(7) input{min-width:150px}.receipt-grid-add{margin-top:10px;padding:9px;background:#fff;color:var(--blue);border:1px solid var(--line);border-radius:8px;font-size:12px;font-weight:600}.grid-row-remove{width:auto;min-height:40px;padding:7px 9px;background:transparent;border:0;color:#b26767}.grid-row-remove:hover{color:#b24141}@media(max-width:360px){.shell{padding-inline:14px}.card{padding:16px}.two{grid-template-columns:1fr}.heading{gap:7px}h1{font-size:26px}.step{font-size:11px;padding:5px 8px}}
</style></head><body><main class="shell"><div class="brand"><span class="brand-mark">M</span>ME.zip <span style="color:#99a1ad;font-weight:500">/ 财务账本</span></div><div class="heading"><h1>手机记账</h1><span class="step">拍照 → 电脑确认</span></div><p class="intro">随手上传付款凭证，回到电脑核对、编辑后入账。</p><section class="card"><div class="status"><span class="status-dot"></span>已连接本机收件箱</div><form id="receipt-form" class="grid" style="margin-top:18px"><input id="photo-camera" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" hidden /><input id="photo-library" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden /><div class="photo"><div id="photo-empty"><div class="photo-icon"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 5 9.5 3h5L16 5h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><circle cx="12" cy="12" r="4"/></svg></div><strong>添加一张付款凭证</strong><span>支持截图、照片与收据</span></div><img id="preview" hidden alt="待上传的付款凭证预览" /></div><div class="source-actions"><button id="open-camera" type="button">拍照</button><button id="open-library" type="button">从相册选择</button></div><div class="two"><label><span>金额 <small>可在电脑补填</small></span><div class="amount-wrap"><span>¥</span><input id="amount" inputmode="decimal" autocomplete="off" placeholder="0.00" /></div></label><label>收支<select id="type"><option value="EXPENSE">支出</option><option value="INCOME">收入</option></select></label></div><label>商家 / 对方<input id="merchant" maxlength="160" placeholder="例如：咖啡店、朋友" /></label><label>账单实际时间<input id="occurred-at" type="datetime-local" /></label><label>备注<textarea id="note" maxlength="600" placeholder="补充用途或需要确认的信息"></textarea></label><details class="receipt-grid"><summary>商品 / 收据明细（可选）</summary><p>商品明细表可左右滑动填写，不会撑开手机页面。</p><div class="receipt-grid-scroll"><table><thead><tr><th>货号</th><th>名称及规格</th><th>单位</th><th>数量</th><th>单价</th><th>金额</th><th>备注</th><th>删</th></tr></thead><tbody id="note-grid"></tbody></table></div><button id="add-note-row" type="button" class="receipt-grid-add">新增一行</button></details><button id="submit" type="submit">发送到电脑待确认</button></form><div id="result" class="result" role="status" aria-live="polite"></div></section><p class="footer-note">同一 Wi‑Fi 下使用 · 凭证保存在电脑上<br>手机发送后，需在电脑确认才会写入账本</p></main><script>
const form=document.querySelector('#receipt-form'),camera=document.querySelector('#photo-camera'),library=document.querySelector('#photo-library'),preview=document.querySelector('#preview'),empty=document.querySelector('#photo-empty'),result=document.querySelector('#result'),submit=document.querySelector('#submit'),captureButtons=[document.querySelector('#open-camera'),document.querySelector('#open-library')];
let encodedImage='',imageMimeType='',recognizedTransactions=[],selectedFile=null,busy=false;
function message(text,failed=false){result.textContent=text;result.className='result'+(failed?' error':'');result.style.display='block'}
function submitLabel(){return recognizedTransactions.length>1?'发送 '+recognizedTransactions.length+' 笔到电脑待确认':'发送到电脑待确认'}
function setBusy(value,label){busy=value;submit.disabled=value;captureButtons.forEach(button=>button.disabled=value);submit.textContent=value?label:submitLabel()}
function sourceMime(source){const type=(source.type||'').toLowerCase();if(type)return type;const extension=(source.name||'').split('.').pop().toLowerCase();return({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heif'})[extension]||''}
async function readDataUrl(source,mimeType){return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('无法读取照片'));reader.onload=()=>resolve(String(reader.result||'').replace(/^data:[^;]*;/,'data:'+mimeType+';'));reader.readAsDataURL(source)})}
async function compress(source){const mimeType=sourceMime(source);if(!['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(mimeType))throw new Error('请选择 JPEG、PNG、WebP 或 HEIC 图片。');if(source.size<=2.8*1024*1024)return {dataUrl:await readDataUrl(source,mimeType),mimeType};let bitmap;try{bitmap=await createImageBitmap(source);const max=1600,ratio=Math.min(1,max/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('无法压缩照片')),'image/jpeg',.82));if(blob.size>3*1024*1024)throw new Error('照片过大，请选择小于 3 MB 的图片。');return {dataUrl:await readDataUrl(blob,'image/jpeg'),mimeType:'image/jpeg'}}catch(error){if(source.size<=3*1024*1024)return {dataUrl:await readDataUrl(source,mimeType),mimeType};throw new Error('照片压缩未完成，请选择小于 3 MB 的图片。')}finally{bitmap?.close()}}
const gridBody=document.querySelector('#note-grid'),gridFields=['sku','nameSpec','unit','quantity','unitPrice','amount','remark'];
function addNoteRow(row={}){if(gridBody.children.length>=40){message('最多填写 40 行明细。',true);return}const tr=document.createElement('tr');for(const field of gridFields){const td=document.createElement('td'),input=document.createElement('input');input.dataset.gridField=field;input.value=String(row[field]||'');input.maxLength=field==='remark'?220:120;input.setAttribute('aria-label',({sku:'货号',nameSpec:'名称及规格',unit:'单位',quantity:'数量',unitPrice:'单价',amount:'金额',remark:'备注'})[field]);if(['quantity','unitPrice','amount'].includes(field))input.inputMode='decimal';td.append(input);tr.append(td)}const td=document.createElement('td'),remove=document.createElement('button');remove.type='button';remove.className='grid-row-remove';remove.setAttribute('aria-label','删除这一行');remove.textContent='×';remove.addEventListener('click',()=>tr.remove());td.append(remove);tr.append(td);gridBody.append(tr)}
function serialiseNoteGrid(){return [...gridBody.querySelectorAll('tr')].map(tr=>Object.fromEntries(gridFields.map(field=>[field,tr.querySelector('[data-grid-field="'+field+'"]').value.trim()]))).filter(row=>Object.values(row).some(Boolean))}
addNoteRow();document.querySelector('#add-note-row').addEventListener('click',()=>addNoteRow());captureButtons[0].addEventListener('click',()=>camera.click());captureButtons[1].addEventListener('click',()=>library.click());
async function recognize(){try{message('正在识别凭证，识别结果可在电脑继续修改…');const before=Object.fromEntries(['amount','merchant','occurred-at','type'].map(id=>[id,document.getElementById(id).value]));const response=await fetch('/v1/finance/mobile/recognize',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({imageDataUrl:encodedImage,mimeType:imageMimeType})});const body=await response.json();if(!response.ok)throw new Error(body.error?.message||'识别未完成');const fields=body.suggestions||{};recognizedTransactions=Array.isArray(fields.transactions)?fields.transactions.filter(item=>item&&item.amount):[];const first=recognizedTransactions[0]||fields;for(const [id,field] of [['amount','amount'],['merchant','merchant'],['type','type']]){const input=document.getElementById(id);if(first[field]&&input.value===before[id])input.value=first[field]}const dateInput=document.querySelector('#occurred-at');if(dateInput.value===before['occurred-at'])dateInput.value=fields.requiresManualDateReview||(fields.requiresManualAmountReview&&!first.occurredAt)?'':first.occurredAt||'';message(recognizedTransactions.length>1?'已识别 '+recognizedTransactions.length+' 笔。手机显示第一笔，全部明细会发送到电脑逐笔确认。':body.message||'已识别，核对后可发送到电脑。')}catch(error){recognizedTransactions=[];message('照片已准备好。自动识别暂不可用，可手动填写或在电脑补充。')}}
async function choose(input){const selected=input.files[0];if(!selected||busy)return;setBusy(true,'准备照片…');try{const image=await compress(selected);selectedFile=selected;encodedImage=image.dataUrl;imageMimeType=image.mimeType;recognizedTransactions=[];document.querySelector('#amount').value='';document.querySelector('#merchant').value='';document.querySelector('#occurred-at').value='';document.querySelector('#type').value='EXPENSE';preview.src=encodedImage;preview.hidden=false;empty.hidden=true;submit.textContent='识别凭证…';await recognize()}catch(error){message(error.message||'无法读取照片，请重新拍照或从相册选择。',true)}finally{input.value='';setBusy(false)}}
camera.addEventListener('change',()=>choose(camera));library.addEventListener('change',()=>choose(library));
form.addEventListener('submit',async event=>{event.preventDefault();if(busy)return;if(!encodedImage){message('请先拍照或从相册选择付款凭证。',true);return}const amount=document.querySelector('#amount').value.trim();if(amount&&!/^(?:0|[1-9][0-9]*)(?:[.][0-9]{1,2})?$/.test(amount)){message('金额请填写数字，最多两位小数。',true);document.querySelector('#amount').focus();return}const batch=recognizedTransactions.length>1;setBusy(true,'正在发送…');try{const first={amount,merchant:document.querySelector('#merchant').value,occurredAt:document.querySelector('#occurred-at').value,type:document.querySelector('#type').value};const payload={imageDataUrl:encodedImage,mimeType:imageMimeType,fileName:selectedFile?.name||'camera.jpg',note:document.querySelector('#note').value,noteGrid:serialiseNoteGrid()};if(batch)payload.transactions=recognizedTransactions.map((item,index)=>index===0?{...item,...first}:item);else Object.assign(payload,first);const response=await fetch(batch?'/v1/finance/mobile/receipts/batch':'/v1/finance/mobile/receipts',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify(payload)});const body=await response.json();if(!response.ok)throw new Error(body.error?.message||'发送失败');message(batch?'已发送 '+(body.records?.length||recognizedTransactions.length)+' 笔到电脑待确认。请回到电脑逐笔核对后入账。':'已发送到电脑待确认。可以继续添加下一张凭证。');form.reset();document.querySelector('.receipt-grid').open=false;gridBody.innerHTML='';addNoteRow();selectedFile=null;encodedImage='';imageMimeType='';recognizedTransactions=[];preview.removeAttribute('src');preview.hidden=true;empty.hidden=false}catch(error){message(error.message||'发送失败，请确认电脑和手机仍连接同一 Wi‑Fi。',true)}finally{setBusy(false)}});
</script></body></html>`;
}

export function createFinanceMobileBridge(options = {}) {
  // The phone opens the pairing link from the same Wi-Fi. Binding only to
  // loopback creates a link that resolves to the phone itself (127.0.0.1).
  // Tests and explicit local-only callers can still pass host: '127.0.0.1'.
  const host = options.host ?? process.env.MEZIP_FINANCE_MOBILE_HOST ?? '0.0.0.0';
  const port = Number(options.port ?? process.env.MEZIP_FINANCE_MOBILE_PORT ?? 4325);
  const dataDirectory = options.dataDirectory ?? process.env.MEZIP_FINANCE_MOBILE_DATA_PATH ?? defaultDataDirectory();
  // Pairing links are trusted-LAN capabilities. V12 may explicitly request a
  // permanent link; once opened, the phone still receives a separate 30-day
  // signed session cookie. Finite links retain a practical bounded window.
  const inviteMaxAgeMinutes = inviteExpiryMinutes(options.inviteMaxAgeMinutes ?? process.env.MEZIP_FINANCE_MOBILE_INVITE_MAX_AGE_MINUTES);
  const inviteMaxAgeMs = inviteMaxAgeMinutes * 60 * 1000;
  const dataPath = join(dataDirectory, 'inbox.json');
  const filesDirectory = join(dataDirectory, 'receipts');
  const keyPath = join(dataDirectory, 'session.key');
  mkdirSync(filesDirectory, { recursive: true });
  const key = existsSync(keyPath) ? readFileSync(keyPath) : randomBytes(32);
  if (!existsSync(keyPath)) writeFileSync(keyPath, key, { mode: 0o600 });
  const writeDocument = (document) => atomicWrite(dataPath, JSON.stringify(document, null, 2));
  const localHost = getLanAddress();
  const subscribers = new Set();
  let server;
  const activePort = () => {
    const address = server?.address?.();
    return address && typeof address === 'object' ? address.port : port;
  };
  const broadcastInbox = (event, recordId) => {
    const message = `event: inbox\ndata: ${JSON.stringify({ event, recordId, at: new Date().toISOString() })}\n\n`;
    for (const response of subscribers) {
      try { response.write(message); } catch { subscribers.delete(response); }
    }
  };
  const hasEncodingReplacement = (value) => String(value || '').includes('\uFFFD');
  const repairGarbledPendingMerchants = async (document) => {
    let changed = false;
    const recognizedByFile = new Map();
    const usedBatchTransactions = new Map();
    for (let index = 0; index < document.records.length; index += 1) {
      const record = document.records[index];
      if (record.status !== 'PENDING_REVIEW' || !hasEncodingReplacement(record.merchant) || !record.filePath || !existsSync(record.filePath)) continue;
      let recognized = recognizedByFile.get(record.filePath);
      if (!recognized) {
        try { recognized = await recognizeLocalReceipt(readFileSync(record.filePath), { extension: extensionFromMime(record.mimeType) }); } catch { recognized = null; }
        recognizedByFile.set(record.filePath, recognized);
      }
      let merchant = recognized?.suggestions?.merchant;
      if (record.batchId) {
        const used = usedBatchTransactions.get(record.batchId) ?? new Set();
        const transactions = recognized?.suggestions?.transactions ?? [];
        const exactMatchIndex = transactions.findIndex((transaction, candidateIndex) => !used.has(candidateIndex) && transaction.amount === record.amount && transaction.occurredAt === record.occurredAt && transaction.type === record.type);
        const batchPosition = document.records.filter((entry) => entry.batchId === record.batchId).findIndex((entry) => entry.id === record.id);
        const matchIndex = exactMatchIndex >= 0 ? exactMatchIndex : (batchPosition >= 0 && !used.has(batchPosition) && transactions[batchPosition] ? batchPosition : -1);
        if (matchIndex >= 0) {
          used.add(matchIndex);
          usedBatchTransactions.set(record.batchId, used);
          merchant = transactions[matchIndex].merchant;
        } else merchant = '';
      }
      if (merchant && !hasEncodingReplacement(merchant)) {
        document.records[index] = { ...record, merchant, ocrRepairedAt: new Date().toISOString() };
        changed = true;
      }
    }
    if (changed) writeDocument(document);
    return document;
  };

  function desktopSession(request) { return readCookie(request, 'mezip_finance_desktop_session', key); }
  function mobileSession(request) { return readCookie(request, 'mezip_finance_mobile_session', key); }
  function requireDesktop(request, response, origin) {
    const session = desktopSession(request);
    if (!session?.role || session.role !== 'desktop') { error(response, 401, 'UNAUTHORIZED', '请先从电脑端打开财务收件箱以建立本机会话。', origin); return null; }
    return session;
  }
  function requireMobile(request, response) {
    const session = mobileSession(request);
    const pairing = safeDocument(dataPath).pairing;
    if (!session?.role || session.role !== 'mobile' || session.pairingVersion !== pairing?.version) { error(response, 401, 'PAIRING_REQUIRED', '此手机尚未配对。请从电脑端复制新的手机链接后打开。', ''); return null; }
    return session;
  }
  function issueDesktopCookie() {
    return makeCookie('mezip_finance_desktop_session', { role: 'desktop', expiresAt: Date.now() + MOBILE_SESSION_MAX_AGE_SECONDS * 1000 }, key, MOBILE_SESSION_MAX_AGE_SECONDS);
  }
  function issueMobileCookie(pairingVersion) {
    return makeCookie('mezip_finance_mobile_session', { role: 'mobile', pairingVersion, expiresAt: Date.now() + MOBILE_SESSION_MAX_AGE_SECONDS * 1000 }, key, MOBILE_SESSION_MAX_AGE_SECONDS);
  }

  server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://${host}:${activePort()}`);
    const origin = desktopOrigin(request.headers.origin);
    if (request.method === 'OPTIONS') {
      response.statusCode = 204;
      if (origin) { response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Access-Control-Allow-Credentials', 'true'); response.setHeader('Vary', 'Origin'); }
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
      response.end();
      return;
    }
    try {
      if (request.method === 'GET' && url.pathname === '/') { response.statusCode = 302; response.setHeader('Location', '/mobile'); response.end(); return; }
      if (request.method === 'GET' && url.pathname === '/mobile') {
        const document = safeDocument(dataPath);
        const suppliedPair = url.searchParams.get('pair');
        const version = url.searchParams.get('version') === 'v2' ? 'v2' : 'v1';
        let cookie;
        const existingMobile = mobileSession(request);
        const alreadyPaired = existingMobile?.role === 'mobile' && existingMobile.pairingVersion === document.pairing?.version;
        if (!alreadyPaired && suppliedPair) {
          const expected = document.pairing?.tokenHash;
          const valid = expected && safeEqual(hmac(suppliedPair, key), expected) && (document.pairing.permanent === true || document.pairing.expiresAt > Date.now());
          if (valid) cookie = issueMobileCookie(document.pairing.version);
        }
        if (!alreadyPaired && !cookie) { response.statusCode = 401; response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end('<main style="font-family:system-ui;padding:32px"><h1>需要手机配对</h1><p>请回到电脑端财务收件箱，复制新的手机链接后在手机打开。</p></main>'); return; }
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'");
        if (cookie) response.setHeader('Set-Cookie', cookie);
        response.end(mobileHtml({ version }));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/finance/mobile/health') {
        json(response, 200, { status: 'READY', storage: 'LOCAL_PRIVATE', lanAddress: localHost, port: activePort() }, origin);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/finance/mobile/desktop-session') {
        if (!loopbackRequest(request)) { error(response, 403, 'LOCAL_DESKTOP_REQUIRED', '桌面收件箱只能从这台电脑建立会话。', origin); return; }
        json(response, 200, { status: 'READY', storage: 'LOCAL_PRIVATE' }, origin, [issueDesktopCookie()]);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/finance/mobile/events') {
        if (!requireDesktop(request, response, origin)) return;
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Connection', 'keep-alive');
        response.setHeader('X-Accel-Buffering', 'no');
        if (origin) { response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Access-Control-Allow-Credentials', 'true'); response.setHeader('Vary', 'Origin'); }
        response.write(': ME.zip Finance Mobile Inbox ready\n\n');
        subscribers.add(response);
        request.on('close', () => subscribers.delete(response));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/finance/mobile/invite') {
        if (!requireDesktop(request, response, origin)) return;
        const document = safeDocument(dataPath);
        const version = url.searchParams.get('version') === 'v2' ? 'v2' : 'v1';
        const permanent = url.searchParams.get('permanent') === '1';
        const token = base64(randomBytes(32));
        const expiresAt = permanent ? null : Date.now() + inviteMaxAgeMs;
        document.pairing = { tokenHash: hmac(token, key), expiresAt, permanent, createdAt: new Date().toISOString(), version: Number(document.pairing?.version || 0) + 1 };
        writeDocument(document);
        // When bound to all interfaces the phone must use a real LAN address;
        // loopback test/dev bindings intentionally return their own host.
        const publicAddress = host === '0.0.0.0' ? localHost : host;
        const base = publicAddress ? `http://${publicAddress}:${activePort()}` : null;
        json(response, 200, { status: base ? 'READY' : 'LAN_ADDRESS_UNAVAILABLE', mobileUrl: base ? `${base}/mobile?pair=${encodeURIComponent(token)}&version=${version}` : null, permanent, expiresAt: permanent ? null : new Date(expiresAt).toISOString(), expiresInMinutes: permanent ? null : inviteMaxAgeMinutes, network: 'TRUSTED_LAN_ONLY' }, origin, [issueDesktopCookie()]);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/v1/finance/mobile/receipts') {
        if (!requireDesktop(request, response, origin)) return;
        const document = await repairGarbledPendingMerchants(safeDocument(dataPath));
        const records = document.records.map((record) => ({ ...record, imageUrl: `/v1/finance/mobile/receipts/${record.id}/image` }));
        json(response, 200, { records }, origin);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/finance/mobile/desktop-import') {
        if (!requireDesktop(request, response, origin)) return;
        const body = await readJson(request);
        const mimeType = String(body.mimeType || '').toLowerCase();
        const extension = extensionFromMime(mimeType);
        if (!extension) { error(response, 400, 'UNSUPPORTED_IMAGE', '仅支持 JPEG、PNG、WebP、HEIC 图片。', origin); return; }
        const bytes = dataUrlBytes(body.imageDataUrl, mimeType);
        const ocr = await recognizeLocalReceipt(bytes, { extension });
        const suggestions = ocr?.suggestions && typeof ocr.suggestions === 'object' ? ocr.suggestions : {};
        const validTransactions = Array.isArray(suggestions.transactions)
          ? suggestions.transactions.filter((transaction) => transaction && /^(?:\d{1,7})(?:\.\d{1,2})?$/u.test(String(transaction.amount || ''))).slice(0, 30)
          : [];
        const document = safeDocument(dataPath);
        const createdAt = new Date().toISOString();
        const fileName = String(body.fileName || `desktop-import${extension}`).slice(0, 120);
        const batchId = validTransactions.length > 1 ? `batch-${randomUUID()}` : null;
        const fileId = batchId || `receipt-${randomUUID()}`;
        const filePath = join(filesDirectory, `${fileId}${extension}`);
        writeFileSync(filePath, bytes, { mode: 0o600 });
        const note = String(body.note || '').slice(0, 600);
        const noteGrid = normalizeNoteGrid(body.noteGrid);
        const fallback = validTransactions[0] || suggestions;
        const records = (validTransactions.length > 1 ? validTransactions : [fallback]).map((transaction) => ({
          id: `receipt-${randomUUID()}`, createdAt, status: 'PENDING_REVIEW', source: batchId ? 'DESKTOP_IMAGE_IMPORT_BATCH' : 'DESKTOP_IMAGE_IMPORT', batchId, filePath, fileName, mimeType,
          amount: String(transaction?.amount || '').slice(0, 32), merchant: String(transaction?.merchant || suggestions.merchant || '').slice(0, 160), occurredAt: String(transaction?.occurredAt || suggestions.occurredAt || '').slice(0, 40), note, noteGrid,
          type: transaction?.type === 'INCOME' || suggestions.type === 'INCOME' ? 'INCOME' : 'EXPENSE', ledgerEntryId: null,
        }));
        document.records.unshift(...records);
        writeDocument(document);
        broadcastInbox(batchId ? 'RECEIPT_BATCH_RECEIVED' : 'RECEIPT_RECEIVED', batchId || records[0].id);
        json(response, 201, { ocr, records: records.map(({ filePath: _filePath, ...record }) => record) }, origin);
        return;
      }
      if (request.method === 'GET' && /^\/v1\/finance\/mobile\/receipts\/[^/]+\/image$/u.test(url.pathname)) {
        if (!requireDesktop(request, response, origin)) return;
        const id = url.pathname.split('/')[5];
        const record = safeDocument(dataPath).records.find((entry) => entry.id === id);
        if (!record || !record.filePath || !existsSync(record.filePath)) { error(response, 404, 'NOT_FOUND', '找不到这张本机凭证。', origin); return; }
        response.statusCode = 200;
        response.setHeader('Content-Type', record.mimeType);
        response.setHeader('Cache-Control', 'private, no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        if (url.searchParams.get('download') === '1') response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(record.fileName || 'receipt-image')}`);
        response.end(readFileSync(record.filePath));
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/finance/mobile/receipts') {
        if (!requireMobile(request, response)) return;
        const body = await readJson(request);
        const mimeType = String(body.mimeType || '').toLowerCase();
        const extension = extensionFromMime(mimeType);
        if (!extension) { error(response, 400, 'UNSUPPORTED_IMAGE', '仅支持 JPEG、PNG、WebP、HEIC 图片。', ''); return; }
        const bytes = dataUrlBytes(body.imageDataUrl, mimeType);
        const id = `receipt-${randomUUID()}`;
        const filePath = join(filesDirectory, `${id}${extension}`);
        writeFileSync(filePath, bytes, { mode: 0o600 });
        const document = safeDocument(dataPath);
        const record = {
          id, createdAt: new Date().toISOString(), status: 'PENDING_REVIEW', source: 'MOBILE_CAMERA', filePath, fileName: String(body.fileName || `camera${extension}`).slice(0, 120), mimeType,
          amount: String(body.amount || '').slice(0, 32), merchant: String(body.merchant || '').slice(0, 160), occurredAt: String(body.occurredAt || '').slice(0, 40), note: String(body.note || '').slice(0, 600), noteGrid: normalizeNoteGrid(body.noteGrid), type: body.type === 'INCOME' ? 'INCOME' : 'EXPENSE', ledgerEntryId: null,
        };
        document.records.unshift(record);
        writeDocument(document);
        broadcastInbox('RECEIPT_RECEIVED', id);
        json(response, 201, { record: { ...record, filePath: undefined } }, '');
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/finance/mobile/receipts/batch') {
        if (!requireMobile(request, response)) return;
        const body = await readJson(request);
        const mimeType = String(body.mimeType || '').toLowerCase();
        const extension = extensionFromMime(mimeType);
        const transactions = Array.isArray(body.transactions) ? body.transactions.slice(0, 30) : [];
        if (!extension) { error(response, 400, 'UNSUPPORTED_IMAGE', '仅支持 JPEG、PNG、WebP、HEIC 图片。', ''); return; }
        if (transactions.length < 2) { error(response, 400, 'BATCH_REQUIRES_MULTIPLE_TRANSACTIONS', '至少需要两笔已识别交易才能批量发送。', ''); return; }
        if (transactions.some((transaction) => !/^(?:\d{1,7})(?:\.\d{1,2})?$/u.test(String(transaction.amount || '')))) { error(response, 400, 'INVALID_BATCH_TRANSACTION', '批量识别结果中存在无效金额。请手动检查后再发送。', ''); return; }
        const bytes = dataUrlBytes(body.imageDataUrl, mimeType);
        const batchId = `batch-${randomUUID()}`;
        const filePath = join(filesDirectory, `${batchId}${extension}`);
        writeFileSync(filePath, bytes, { mode: 0o600 });
        const document = safeDocument(dataPath);
        const createdAt = new Date().toISOString();
        const fileName = String(body.fileName || `camera${extension}`).slice(0, 120);
        const records = transactions.map((transaction) => ({
          id: `receipt-${randomUUID()}`, createdAt, status: 'PENDING_REVIEW', source: 'MOBILE_OCR_BATCH', batchId, filePath, fileName, mimeType,
          amount: String(transaction.amount || '').slice(0, 32), merchant: String(transaction.merchant || '').slice(0, 160), occurredAt: String(transaction.occurredAt || '').slice(0, 40), note: String(body.note || '').slice(0, 600), noteGrid: normalizeNoteGrid(body.noteGrid), type: transaction.type === 'INCOME' ? 'INCOME' : 'EXPENSE', ledgerEntryId: null,
        }));
        document.records.unshift(...records);
        writeDocument(document);
        broadcastInbox('RECEIPT_BATCH_RECEIVED', batchId);
        json(response, 201, { records: records.map((record) => ({ ...record, filePath: undefined })) }, '');
        return;
      }
      if (request.method === 'POST' && url.pathname === '/v1/finance/mobile/recognize') {
        if (!requireMobile(request, response)) return;
        const body = await readJson(request);
        const mimeType = String(body.mimeType || '').toLowerCase();
        if (!extensionFromMime(mimeType)) { error(response, 400, 'UNSUPPORTED_IMAGE', '仅支持 JPEG、PNG、WebP、HEIC 图片。', ''); return; }
        const bytes = dataUrlBytes(body.imageDataUrl, mimeType);
        const result = await recognizeLocalReceipt(bytes, { extension: extensionFromMime(mimeType) });
        json(response, 200, result, '');
        return;
      }
      if (request.method === 'PATCH' && /^\/v1\/finance\/mobile\/receipts\/[^/]+$/u.test(url.pathname)) {
        if (!requireDesktop(request, response, origin)) return;
        const id = url.pathname.split('/')[5];
        const body = await readJson(request);
        const document = safeDocument(dataPath);
        const index = document.records.findIndex((entry) => entry.id === id);
        if (index < 0) { error(response, 404, 'NOT_FOUND', '找不到要更新的本机凭证。', origin); return; }
        if (document.records[index].status === 'REJECTED') { error(response, 409, 'REJECTED_RECORD_LOCKED', '已拒收凭证不能再修改。请重新上传后处理。', origin); return; }
        document.records[index] = patchReceiptRecord(document.records[index], body);
        writeDocument(document);
        broadcastInbox('RECEIPT_UPDATED', id);
        const { filePath, ...record } = document.records[index];
        json(response, 200, { record }, origin);
        return;
      }
      if (request.method === 'POST' && /^\/v1\/finance\/mobile\/receipts\/[^/]+\/reject$/u.test(url.pathname)) {
        if (!requireDesktop(request, response, origin)) return;
        const id = url.pathname.split('/')[5];
        const document = safeDocument(dataPath);
        const index = document.records.findIndex((entry) => entry.id === id);
        if (index < 0) { error(response, 404, 'NOT_FOUND', '找不到待确认记录。', origin); return; }
        if (document.records[index].status !== 'PENDING_REVIEW') { error(response, 409, 'CONFLICT', '只有待确认记录可以拒收。', origin); return; }
        document.records[index] = { ...document.records[index], status: 'REJECTED', rejectedAt: new Date().toISOString() };
        writeDocument(document);
        broadcastInbox('RECEIPT_REJECTED', id);
        json(response, 200, { record: document.records[index] }, origin);
        return;
      }
      if (request.method === 'POST' && /^\/v1\/finance\/mobile\/receipts\/[^/]+\/confirm$/u.test(url.pathname)) {
        if (!requireDesktop(request, response, origin)) return;
        const body = await readJson(request);
        const id = url.pathname.split('/')[5];
        const document = safeDocument(dataPath);
        const index = document.records.findIndex((entry) => entry.id === id);
        if (index < 0) { error(response, 404, 'NOT_FOUND', '找不到待确认记录。', origin); return; }
        if (document.records[index].status !== 'PENDING_REVIEW') { error(response, 409, 'CONFLICT', '只有待确认记录可以写入账本。', origin); return; }
        const ledgerEntryId = String(body.ledgerEntryId || '');
        if (!/^mobile-receipt-[0-9a-f-]{36}$/iu.test(ledgerEntryId)) { error(response, 400, 'INVALID_LEDGER_REFERENCE', '账本确认编号无效。', origin); return; }
        document.records[index] = { ...document.records[index], status: 'CONFIRMED_TO_DESKTOP', confirmedAt: new Date().toISOString(), ledgerEntryId };
        writeDocument(document);
        broadcastInbox('RECEIPT_CONFIRMED', id);
        json(response, 200, { record: document.records[index] }, origin);
        return;
      }
      if (request.method === 'POST' && /^\/v1\/finance\/mobile\/receipts\/[^/]+\/reopen$/u.test(url.pathname)) {
        if (!requireDesktop(request, response, origin)) return;
        const id = url.pathname.split('/')[5];
        const document = safeDocument(dataPath);
        const index = document.records.findIndex((entry) => entry.id === id);
        if (index < 0) { error(response, 404, 'NOT_FOUND', '找不到已确认记录。', origin); return; }
        if (document.records[index].status !== 'CONFIRMED_TO_DESKTOP') { error(response, 409, 'CONFLICT', '只有已确认记录可以恢复为待入账。', origin); return; }
        document.records[index] = { ...document.records[index], status: 'PENDING_REVIEW', ledgerEntryId: null, reopenedAt: new Date().toISOString() };
        writeDocument(document);
        broadcastInbox('RECEIPT_REOPENED', id);
        json(response, 200, { record: document.records[index] }, origin);
        return;
      }
      if (request.method === 'POST' && /^\/v1\/finance\/mobile\/receipts\/[^/]+\/remove$/u.test(url.pathname)) {
        if (!requireDesktop(request, response, origin)) return;
        const id = url.pathname.split('/')[5];
        const document = safeDocument(dataPath);
        const index = document.records.findIndex((entry) => entry.id === id);
        if (index < 0) { error(response, 404, 'NOT_FOUND', '找不到要清除的本机凭证。', origin); return; }
        const record = document.records[index];
        if (!['PENDING_REVIEW', 'REJECTED'].includes(record.status)) { error(response, 409, 'CONFIRMED_RECORD_PROTECTED', '账本仍可能关联这张凭证。请先删除账本记录，再从收件箱清除。', origin); return; }
        document.records.splice(index, 1);
        writeDocument(document);
        if (record.filePath && !document.records.some((entry) => entry.filePath === record.filePath) && existsSync(record.filePath)) unlinkSync(record.filePath);
        broadcastInbox('RECEIPT_REMOVED', id);
        json(response, 200, { removedId: id }, origin);
        return;
      }
      error(response, 404, 'NOT_FOUND', '未找到本地财务收件箱接口。', origin);
    } catch (caught) {
      error(response, 500, 'INTERNAL', caught instanceof Error ? caught.message : '本地财务收件箱发生错误。', origin);
    }
  });
  server.on('close', () => { for (const response of subscribers) response.end(); subscribers.clear(); });
  return { server, host, port, dataDirectory, lanAddress: localHost };
}

export function startFinanceMobileBridge(options = {}) {
  const bridge = createFinanceMobileBridge(options);
  bridge.server.listen(bridge.port, bridge.host, () => process.stdout.write(`ME.zip Finance Mobile Inbox listening on http://${bridge.host}:${bridge.port}\n`));
  return bridge;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) startFinanceMobileBridge();
