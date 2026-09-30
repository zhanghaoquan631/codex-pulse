import { readFile, writeFile, mkdir, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = await realpath(path.resolve(here, '../..'));
const source = await realpath(path.resolve(process.argv[2] || ''));
if (!process.argv[2]) throw new Error('Pass the original ME.zip apps/web/public directory; it is read only.');
const output = path.join(project, 'public/local-apps');
const normalized = value => process.platform === 'win32' ? value.toLowerCase() : value;
if (normalized(source).startsWith(normalized(path.join(project, 'public')))) throw new Error('Read from the original ME.zip source, not generated assets.');
if (normalized(await realpath(path.join(project, 'public'))) !== normalized(path.join(project, 'public'))) throw new Error('Refusing redirected public directory.');
await mkdir(output, { recursive: true });
if (normalized(await realpath(output)) !== normalized(output)) throw new Error('Refusing redirected output directory.');
const files = new Map();
const translations = new Map([
  ['PRIVATE DESKTOP LEDGER', '私人财务账本'], ['RECEIPT INBOX', '财务收件箱'], ['PHONE LINK', '手机拍照链接'], ['HOW IT WORKS', '记账流程'],
  ['V12 MERCHANT SUMMARY', '商家归纳'], ['ORIGINAL FINANCE CENTER · V2', '完整财务中心'], ['V12 IMAGE IMPORT', '图片凭证导入'], ['ALL BILLS', '全部账单'], ['ALL POSTED BILLS', '全部已入账账单'], ['MERCHANT INTELLIGENCE', '商家归纳'],
  ['TRANSACTION DETAIL', '账单明细'], ['FINANCE PROVIDER IMPORT', '导入账单'], ['FINANCE DASHBOARD', '财务总览'], ['FINANCE CENTER', '财务中心'], ['PRIVATE FINANCE', '私人财务'],
  ['PERSONAL SPACE · V2', '个人财务空间'], ['ME.ZIP · PERSONAL FINANCE', '个人财务总览'], ['QUICK FINANCE COMPOSER', '记录一笔收支'], ['FINANCE IMPORT ADAPTER', '账单导入'], ['CONFIRMED SUBSCRIPTION', '已确认订阅'], ['MERCHANT ANALYSIS', '商家分析'], ['MERCHANT ORDERS', '商家订单'], ['CONFIRM LOCAL CHANGE', '确认账本修改'], ['<em>FINANCE</em>', '<em>财务</em>'],
]);
function adaptPaths(text) {
  return text
    .replaceAll('http://127.0.0.1:4325', '/api/local-apps/finance')
    .replace(/(?<![.\w/:])\/finance-center-v2\//g, '/local-apps/finance-center-v2/')
    .replaceAll('../finance-receipt-inbox-v11/index.html#overview', '../finance-receipt-inbox-v12/index.html#inbox');
}
function translate(text) {
  for (const [from, to] of translations) text = text.replaceAll(from, to);
  return text
    .replaceAll('照片与账单仅在此电脑收件箱和本机账本保存；“已入账”只会在你明确确认后发生。', '照片与账本保存在这台电脑，通过私人连接访问；“已入账”只会在你明确确认后发生。')
    .replaceAll('只在同一可信 Wi‑Fi 内配对；不上传云端。', '手机拍照链接需与电脑处于同一可信 Wi‑Fi；此页面通过你的账号连接电脑。')
    .replaceAll('它与当前 V12 共享同一本机账本，不会复制或覆盖数据。', '它与新版收件箱共享同一份电脑账本，所有登录设备同步使用。')
    .replaceAll('只在本机运行', '通过账号私人访问')
    .replaceAll('原页面未修改', '原本机页面保留')
    .replaceAll('原始账单不会上传。', '文件在浏览器解析，确认后的账本保存到这台电脑。')
    .replaceAll('本机监听 ·', '电脑收件箱 ·')
    .replaceAll('连接本地收件箱…', '连接电脑收件箱…');
}
function prepareHtml(original) {
  let text = translate(adaptPaths(original));
  text = text.replace('<button data-range="month">', '<button data-range="all">全部时间</button><button data-range="month">');
  text = text.replace(/<script([^>]*)>/gi, (match, attrs) => {
    if (/\btype\s*=/.test(attrs)) return match; // Preserve the intentionally inert legacy source.
    const src = /\bsrc="([^"]+)"/.exec(attrs)?.[1];
    return '<script type="text/pulse-finance-deferred"' + (src ? ` data-src="${src}"` : '') + '>';
  });
  text = text.replace('</head>', '<link rel="stylesheet" href="/local-apps/finance-theme.css">\n</head>');
  return text.replace('</body>', '<script src="/local-apps/finance-adapter.js"></script>\n</body>');
}
function prepareInbox(original) {
  let text = translate(adaptPaths(original.replace(/\r\n/g, '\n')));
  const previous = /  function startRealtime\(\) \{[\s\S]*?\n  \}\n\n  function buildTransaction/;
  if (!previous.test(text)) throw new Error('Finance realtime source changed; inspect before adapting.');
  text = text.replace(previous, `  function startRealtime() {
    // A finite poll keeps remote receipt updates live without holding an SSE
    // request open across the authenticated relay.
    eventSource = { close() { clearTimeout(this.timer); }, timer: null };
    const poll = async () => {
      if (!document.hidden && window.PulseFinance.isReady() && !window.PulseFinance.isInteracting()) await loadInbox({ silent: true });
      eventSource.timer = setTimeout(poll, 8000);
    };
    eventSource.timer = setTimeout(poll, 8000);
    window.addEventListener('pagehide', () => eventSource?.close(), { once: true });
  }

  function buildTransaction`);
  text = replaceRequired(text, '  async function loadInbox({ silent = false } = {}) {', `  let inboxRenderPending = false;
  function refreshInboxView() {
    inboxRenderPending = true;
    if (window.PulseFinance.isInteracting()) return;
    inboxRenderPending = false;
    render();
  }
  async function loadInbox({ silent = false } = {}) {`);
  text = replaceRequired(text, '      records = payload.records || [];', `      const nextRecords = payload.records || [];
      const changed = JSON.stringify(nextRecords) !== JSON.stringify(records) || !connectionReady;
      records = nextRecords;`);
  text = replaceRequired(text, '      if (!eventSource) startRealtime();\n      render();', '      if (!eventSource) startRealtime();\n      if (!silent || changed || inboxRenderPending) refreshInboxView();');
  text = replaceRequired(text, "      setConnection('本地收件箱未连接', true);\n      render();", "      setConnection('本地收件箱未连接', true);\n      if (!silent) refreshInboxView();");
  text = replaceRequired(text, `  function renderLegacy() {
    const groups = makeMerchantGroups();`, `  function renderLegacy() {
    const groups = makeMerchantGroups();
    // Keep the embedded document, its selected page and open details alive.
    // Only the receipt summary outside that document needs refreshing.
    if (content.querySelector('.legacy-frame')) {
      const panel = content.querySelector('.legacy-merchant-panel');
      if (panel) panel.outerHTML = renderLegacyMerchantPanel(groups);
      content.querySelectorAll('[data-open-merchant]').forEach((button) => button.addEventListener('click', () => openMerchant(button.dataset.openMerchant)));
      return;
    }`);
  text = replaceRequired(text, '  const money = (cents) => new Intl.NumberFormat', "  const money = (cents) => window.PulseFinance.amountsHidden ? '¥••••••' : new Intl.NumberFormat");
  // These calls occur only in async saveRecord / confirmRecord. Server ledger
  // persistence must finish before the receipt can be marked confirmed.
  text = text.replaceAll('saveLedger(state);', 'saveLedger(state); await window.PulseFinance.flush();');
  text = text.replace('  loadInbox();', "  window.addEventListener('pulse-finance-data', refreshInboxView);\n  window.addEventListener('pulse-finance-privacy', refreshInboxView);\n  // The hydrated ledger is usable before the separate receipt service responds.\n  render();\n  loadInbox();");
  return text;
}
function replaceRequired(text, from, to) {
  if (!text.includes(from)) throw new Error(`Finance source changed; inspect adaptation: ${from.slice(0, 90)}`);
  return text.replace(from, to);
}
function prepareV2(original) {
  let text = translate(adaptPaths(original.replace(/\r\n/g, '\n')));
  text = replaceRequired(text, '    if (!records.length) return;\n    const byId = new Map', '    if (!records.length || !window.PulseFinance.isReady()) return;\n    const byId = new Map');
  text = replaceRequired(text, '        if (!record || !document.body.contains(form)) return;', '        if (!record || !document.body.contains(form) || !window.PulseFinance.isReady()) return;');
  text = replaceRequired(text, "let range = 'month';", "let range = 'all';");
  text = replaceRequired(text, "({ month: '本月', previous:", "({ all: '全部时间', month: '本月', previous:");
  // Amount visibility belongs to this private viewing session. Never rewrite
  // the migrated ledger's privacy preference just to make its history visible.
  text = replaceRequired(text, 'state.privacy.hideAmounts = event.target.checked; persist(); render();', 'window.PulseFinance.setAmountsHidden(event.target.checked); render();');
  text = text.replaceAll('state.privacy.hideAmounts', 'window.PulseFinance.amountsHidden');
  text = text.replaceAll('公共场所将金额显示为 ¥••••••', '仅本次页面隐藏金额，不修改原账本设置');
  text = replaceRequired(text, '  function bounds() {\n    const now = new Date();', `  function bounds() {
    const now = new Date();
    if (range === 'all') {
      const times = visible().map(item => new Date(item.occurredAt).getTime()).filter(Number.isFinite);
      const from = new Date(times.length ? times.reduce((a, b) => Math.min(a, b)) : now.getTime()); from.setHours(0, 0, 0, 0);
      const to = new Date(times.length ? times.reduce((a, b) => Math.max(a, b)) : now.getTime()); to.setHours(23, 59, 59, 999);
      return { from, to };
    }`);
  text = replaceRequired(text, '  function periodItems() { const period = bounds();', "  function periodItems() { if (range === 'all') return visible(); const period = bounds();");
  text = replaceRequired(text, "    document.querySelector('#page-subtitle').textContent = subtitle;", "    document.querySelector('#page-subtitle').textContent = `${subtitle} 当前范围：${rangeLabel(range)}${range === 'all' ? '，含所有历史账单。' : '。'}`;");
  const trendStart = text.indexOf('    const period = bounds(); const days = Math.min(31,');
  const trendEnd = text.indexOf('    const width = 640;', trendStart);
  if (trendStart < 0 || trendEnd < 0) throw new Error('Finance trend source changed; inspect before adapting.');
  text = text.slice(0, trendStart) + `    const period = bounds();
    const span = Math.max(1, period.to.getTime() - period.from.getTime() + 1);
    const bucketCount = Math.min(31, Math.max(1, Math.ceil(span / 86400000)));
    const buckets = Array.from({ length: bucketCount }, () => []);
    for (const item of items) {
      const time = new Date(item.occurredAt).getTime();
      if (!Number.isFinite(time) || time < period.from.getTime() || time > period.to.getTime()) continue;
      const index = Math.min(bucketCount - 1, Math.floor((time - period.from.getTime()) / span * bucketCount));
      buckets[index].push(item);
    }
    const groups = buckets.map(rows => { const data = Core.summarize(rows); return { income: data.incomeCents / 100, expense: data.expenseCents / 100 }; });
` + text.slice(trendEnd);
  text = text.replace("  window.addEventListener('hashchange',", "  window.addEventListener('pulse-finance-data', () => { state = load(); render(); });\n  window.addEventListener('pulse-finance-privacy', render);\n  window.addEventListener('hashchange',");
  return text;
}
for (const [folder, names] of Object.entries({ 'finance-receipt-inbox-v12': ['index.html', 'app.js', 'styles.css'], 'finance-center-v2': ['index.html', 'finance-core.js', 'finance-v2.js'] })) {
  const target = path.join(output, folder); await mkdir(target, { recursive: true });
  if (normalized(await realpath(target)) !== normalized(target)) throw new Error('Refusing redirected finance module.');
  for (const name of names) {
    const original = await readFile(path.join(source, folder, name), 'utf8');
    const text = name.endsWith('.html') ? prepareHtml(original) : name === 'app.js' ? prepareInbox(original) : name === 'finance-v2.js' ? prepareV2(original) : original;
    files.set(path.join(target, name), text);
  }
}
for (const name of ['finance-adapter.js', 'finance-theme.css']) files.set(path.join(output, name), await readFile(path.join(here, name), 'utf8'));
let updated = 0;
for (const [file, value] of files) {
  const info = await lstat(file).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (info && !info.isFile()) throw new Error('Refusing linked generated asset.');
  const previous = await readFile(file, 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (previous !== value) { await writeFile(file, value, 'utf8'); updated++; }
}
console.log(JSON.stringify({ pages: 2, assets: files.size, updated, output, sourceReadOnly: true }));
