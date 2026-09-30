(() => {
  'use strict';
  const Core = window.MEZipFinance;
  if (!Core) throw new Error('ME.zip Finance Core is unavailable.');

  const KEY = 'mezip.finance.center.v2';
  const LEGACY_KEY = 'mezip.finance.center.v1';
  const EXPENSE_CATEGORIES = ['餐饮美食', '购物消费', '交通出行', '生活日用', '住房', '娱乐休闲', '医疗健康', '学习教育', '旅行', '数码', '宠物', '订阅服务', '人情往来', '其他'];
  const INCOME_CATEGORIES = ['工资', '奖金', '兼职', '投资', '退款', '红包', '其他收入'];
  const ACCOUNTS = [
    { key: 'ALIPAY', label: '支付宝', tone: 'alipay', status: '账单文件导入' },
    { key: 'WECHAT_PAY', label: '微信支付', tone: 'wechat', status: '账单文件导入' },
    { key: 'CASH', label: '现金', tone: 'cash', status: '手动记录' },
    { key: 'BANK', label: '银行卡', tone: 'bank', status: '流水文件导入' },
    { key: 'CREDIT_CARD', label: '信用卡', tone: 'card', status: '手动记录' },
    { key: 'OTHER', label: '其他账户', tone: 'other', status: '手动记录' },
  ];
  const app = document.querySelector('#app');
  const formatter = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 2 });
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>'"]/gu, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const accountName = (key) => ACCOUNTS.find((item) => item.key === key)?.label || key || '未设置账户';
  const typeName = (type) => ({ EXPENSE: '支出', INCOME: '收入', TRANSFER: '内部转账', REFUND: '退款', UNKNOWN: '待确认' }[type] || type);
  const sourceName = (source) => ({ MANUAL: '手动', ALIPAY_FILE: '支付宝账单', WECHAT_FILE: '微信账单', BANK_FILE: '银行卡流水', GENERIC_FILE: '通用文件', MOBILE_CAMERA: '手机拍照凭证' }[source] || source || '未知来源');
  const rangeLabel = (range) => ({ all: '全部时间', month: '本月', previous: '上月', quarter: '近 3 个月', year: '今年', custom: '自定义' }[range] || '本月');
  const dateText = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '未设置时间' : new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date); };
  const dateOnly = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toISOString().slice(0, 10); };
  const percent = (value) => `${Math.max(0, Math.min(100, Number(value) || 0)).toFixed(1)}%`;
  const empty = (title, text, action = 'open-composer', label = '记一笔') => `<div class="empty"><div><strong>${esc(title)}</strong><span>${esc(text)}</span><div class="inline" style="justify-content:center;margin-top:13px"><button class="btn primary" data-action="${action}">${esc(label)}</button></div></div></div>`;
  const metric = (label, value, note, symbol, tone = '') => `<article class="metric"><div class="metric-label"><span>${esc(label)}</span><span class="metric-symbol">${symbol}</span></div><div class="metric-value ${tone}">${esc(value)}</div><div class="metric-note">${esc(note)}</div></article>`;

  function migrate(value) {
    const state = Core.hydrateState(value);
    state.transactions = state.transactions.map((item) => ({
      ...item,
      ownerId: item.ownerId || state.ownerId,
      accountId: item.accountId || item.account || 'OTHER',
      category: item.category || '未分类',
      source: item.source || 'MANUAL',
      fingerprint: item.fingerprint || Core.fingerprint(item),
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
    }));
    return state;
  }
  function load() {
    try { const current = JSON.parse(localStorage.getItem(KEY) || 'null'); if (current) return migrate(current); } catch { /* clear fallback below */ }
    try { const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null'); if (legacy) return migrate(legacy); } catch { /* use blank state */ }
    return Core.blankState();
  }
  let state = load();
  let route = (location.hash.replace('#', '') || 'overview').split('?')[0].split('/')[0] || 'overview';
  let range = 'all';
  let custom = { from: '', to: '' };
  let importDraft = null;
  let composerId = null;
  const receiptRecordCache = new Map();
  let receiptRecordsPromise = null;
  const receiptGridFields = [
    ['sku', '货号'],
    ['nameSpec', '名称及规格'],
    ['unit', '单位'],
    ['quantity', '数量'],
    ['unitPrice', '单价'],
    ['amount', '金额'],
    ['remark', '备注'],
  ];

  function persist() { localStorage.setItem(KEY, JSON.stringify(state)); }
  async function bridgeRecordsResponse() {
    let response = await fetch('/api/local-apps/finance/v1/finance/mobile/receipts', { credentials: 'include' });
    if (response.status === 401) {
      await fetch('/api/local-apps/finance/v1/finance/mobile/desktop-session', { credentials: 'include' }).catch(() => null);
      response = await fetch('/api/local-apps/finance/v1/finance/mobile/receipts', { credentials: 'include' });
    }
    return response;
  }
  async function loadReceiptRecord(receiptRecordId) {
    if (!receiptRecordId) return null;
    if (receiptRecordCache.has(receiptRecordId)) return receiptRecordCache.get(receiptRecordId);
    try {
      const response = await bridgeRecordsResponse();
      if (!response.ok) return null;
      const body = await response.json();
      const record = Array.isArray(body.records) ? body.records.find((item) => item.id === receiptRecordId) || null : null;
      receiptRecordCache.set(receiptRecordId, record);
      return record;
    } catch {
      return null;
    }
  }
  async function loadReceiptRecords() {
    if (receiptRecordsPromise) return receiptRecordsPromise;
    receiptRecordsPromise = bridgeRecordsResponse()
      .then((response) => response.ok ? response.json() : null)
      .then((body) => Array.isArray(body?.records) ? body.records : [])
      .catch(() => []);
    return receiptRecordsPromise;
  }
  async function syncReceiptGrids() {
    const records = await loadReceiptRecords();
    if (!records.length || !window.PulseFinance.isReady()) return;
    const byId = new Map(records.map((record) => [String(record.id), record]));
    let changed = false;
    state.transactions.forEach((item) => {
      if (!item.receiptRecordId) return;
      const record = byId.get(String(item.receiptRecordId));
      if (!record) return;
      const noteGrid = Array.isArray(record.noteGrid) ? record.noteGrid : [];
      if (JSON.stringify(item.noteGrid || []) !== JSON.stringify(noteGrid)) {
        item.noteGrid = noteGrid;
        item.updatedAt = new Date().toISOString();
        changed = true;
      }
    });
    if (!changed) return;
    persist();
    if (route === 'transactions') filterTransactions();
  }
  async function findReceiptForTransaction(item) {
    if (!item) return null;
    if (item.receiptRecordId) return loadReceiptRecord(item.receiptRecordId);
    const records = await loadReceiptRecords();
    const normalizedId = String(item.id || '').replace(/^mobile-receipt-/u, '');
    return records.find((record) => {
      const recordId = String(record.id || '').replace(/^receipt-/u, '');
      if (normalizedId && recordId === normalizedId) return true;
      if (item.source !== 'MOBILE_CAMERA') return false;
      const amountMatches = item.amountCents == null || Core.toCents(record.amount) === Number(item.amountCents);
      const timeMatches = !item.occurredAt || Math.abs(new Date(record.occurredAt || record.createdAt).getTime() - new Date(item.occurredAt).getTime()) < 120000;
      return amountMatches && timeMatches && (!item.receiptName || item.receiptName === record.fileName);
    }) || null;
  }
  function fillComposerFromReceipt(form, record) {
    if (!form || !record) return;
    const amount = form.querySelector('#composer-amount');
    const type = form.querySelector('#composer-type');
    const merchant = form.querySelector('#composer-merchant');
    const occurredAt = form.querySelector('#composer-date');
    const note = form.querySelector('#composer-note');
    if (amount && !amount.value && record.amount) amount.value = String(record.amount);
    if (type && record.type && type.value !== record.type) { type.value = record.type; type.dispatchEvent(new Event('change')); }
    if (merchant && !merchant.value && record.merchant) merchant.value = record.merchant;
    if (occurredAt && !occurredAt.value && (record.occurredAt || record.createdAt)) occurredAt.value = String(record.occurredAt || record.createdAt).slice(0, 16);
    if (note && !note.value && record.note) note.value = record.note;
  }
  async function syncReceiptEdit(item) {
    if (!item?.receiptRecordId) return;
    try {
      await fetch(`/api/local-apps/finance/v1/finance/mobile/receipts/${encodeURIComponent(item.receiptRecordId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: item.note || '', noteGrid: Array.isArray(item.noteGrid) ? item.noteGrid : [] }),
      });
      receiptRecordCache.delete(item.receiptRecordId);
      receiptRecordsPromise = null;
    } catch {
      // The local ledger remains authoritative when the optional bridge is offline.
    }
  }
  function renderReceiptGrid(record) {
    const rows = Array.isArray(record?.noteGrid) ? record.noteGrid.filter((row) => row && receiptGridFields.some(([field]) => String(row[field] ?? '').trim())) : [];
    if (!rows.length) return '<p class="muted" style="margin:0">暂无明细备注。若刚在手机端填写，请先确认入账并刷新账本。</p>';
    const headers = receiptGridFields.map(([, label]) => `<th>${label}</th>`).join('');
    const cells = rows.map((row) => `<tr>${receiptGridFields.map(([field]) => `<td>${esc(row[field] || '—')}</td>`).join('')}</tr>`).join('');
    return `<div style="overflow:auto;border:1px solid #ffffff18;border-radius:10px"><table style="min-width:680px;width:100%;border-collapse:collapse"><thead><tr>${headers}</tr></thead><tbody>${cells}</tbody></table></div>`;
  }
  async function hydrateReceiptGrid(receiptRecordId) {
    const target = document.querySelector('#receipt-grid-detail');
    if (!target) return;
    target.innerHTML = '<p class="muted" style="margin:0">正在读取本机凭证明细…</p>';
    const record = await loadReceiptRecord(receiptRecordId);
    if (!document.querySelector('#receipt-grid-detail')) return;
    target.innerHTML = record ? renderReceiptGrid(record) : '<p class="muted" style="margin:0">暂时无法读取本机明细，请确认电脑端收件箱已配对。</p>';
  }
  function composerGridRows() {
    return [...document.querySelectorAll('#composer-form .finance-composer-grid tbody tr')]
      .map((row) => Object.fromEntries(receiptGridFields.map(([field]) => [field, row.querySelector(`[data-grid-field="${field}"]`)?.value.trim() || ''])))
      .filter((row) => receiptGridFields.some(([field]) => row[field]));
  }
  function composerGridRowMarkup(row = {}) {
    return `<tr>${receiptGridFields.map(([field]) => `<td><input data-grid-field="${field}" value="${esc(row[field] || '')}" /></td>`).join('')}<td><button type="button" class="finance-grid-delete" aria-label="删除这一行">×</button></td></tr>`;
  }
  function injectComposerGrid() {
    const form = document.querySelector('#composer-form');
    if (!form || form.dataset.gridEnhanced === 'true') return;
    const noteLabel = form.querySelector('#composer-note')?.closest('label');
    if (!noteLabel) return;
    const existing = composerId ? state.transactions.find((item) => item.id === composerId)?.noteGrid : null;
    const rows = Array.isArray(existing) && existing.length ? existing : [{}];
    const section = document.createElement('details');
    section.className = 'finance-composer-grid';
    section.open = Boolean(existing?.length);
    section.innerHTML = `<summary>商品 / 收据明细（可选）</summary><p class="muted" style="margin:8px 0">每一格都可继续填写；保存后会与这笔账单一起显示在详情里。</p><div style="overflow:auto"><table style="min-width:680px;width:100%;border-collapse:collapse"><thead><tr>${receiptGridFields.map(([, label]) => `<th>${label}</th>`).join('')}<th>删</th></tr></thead><tbody>${rows.map((row) => composerGridRowMarkup(row)).join('')}</tbody></table></div><button type="button" class="btn ghost finance-grid-add" style="margin-top:9px">＋ 新增一行</button>`;
    noteLabel.after(section);
    section.querySelector('.finance-grid-add').addEventListener('click', () => section.querySelector('tbody').insertAdjacentHTML('beforeend', composerGridRowMarkup()));
    section.addEventListener('click', (event) => { if (event.target.closest('.finance-grid-delete')) event.target.closest('tr')?.remove(); });
    form.dataset.composerId = composerId || '';
    form.dataset.gridEnhanced = 'true';
    const item = composerId ? state.transactions.find((row) => row.id === composerId) : null;
    if (item) {
      void findReceiptForTransaction(item).then((record) => {
        if (!record || !document.body.contains(form) || !window.PulseFinance.isReady()) return;
        if (!item.receiptRecordId) {
          item.receiptRecordId = record.id;
          item.receiptName = item.receiptName || record.fileName || '';
          persist();
        }
        fillComposerFromReceipt(form, record);
        const remoteRows = Array.isArray(record.noteGrid) ? record.noteGrid.filter((row) => row && receiptGridFields.some(([field]) => String(row[field] ?? '').trim())) : [];
        const body = section.querySelector('tbody');
        if (body && remoteRows.length && body.querySelectorAll('tr').length === 1 && !composerGridRows().length) {
          body.innerHTML = remoteRows.map((row) => composerGridRowMarkup(row)).join('');
          section.open = true;
        }
      });
    }
  }
  function injectDetailGrid(id) {
    const item = state.transactions.find((row) => row.id === id);
    const card = document.querySelector('#composer-modal .modal-card');
    if (!item || !card || card.querySelector('.finance-detail-grid')) return;
    const section = document.createElement('section');
    section.className = 'finance-detail-grid';
    section.style.cssText = 'margin-top:14px;padding:13px;border:1px solid #ffffff18;border-radius:12px;background:#ffffff05';
    section.innerHTML = `<div class="panel-head" style="margin-bottom:9px"><div><h3 style="margin:0">明细备注</h3><p class="muted" style="margin:4px 0 0">读取这笔账单绑定的真实田字格内容。</p></div></div><div id="receipt-grid-detail">${renderReceiptGrid({ noteGrid: item.noteGrid })}</div>`;
    card.querySelector('.modal-foot')?.before(section);
    if (item.receiptRecordId) hydrateReceiptGrid(item.receiptRecordId);
  }
  function money(cents) { return window.PulseFinance.amountsHidden ? '¥••••••' : formatter.format((Number(cents) || 0) / 100); }
  function visible() { return Core.visibleTransactions(state, state.ownerId); }
  function bounds() {
    const now = new Date();
    if (range === 'all') {
      const times = visible().map(item => new Date(item.occurredAt).getTime()).filter(Number.isFinite);
      const from = new Date(times.length ? times.reduce((a, b) => Math.min(a, b)) : now.getTime()); from.setHours(0, 0, 0, 0);
      const to = new Date(times.length ? times.reduce((a, b) => Math.max(a, b)) : now.getTime()); to.setHours(23, 59, 59, 999);
      return { from, to };
    }
    if (range === 'custom' && custom.from && custom.to) return { from: new Date(`${custom.from}T00:00:00`), to: new Date(`${custom.to}T23:59:59`) };
    if (range === 'previous') return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59) };
    if (range === 'quarter') return { from: new Date(now.getFullYear(), now.getMonth() - 2, 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) };
    if (range === 'year') return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear(), 11, 31, 23, 59, 59) };
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) };
  }
  function periodItems() { if (range === 'all') return visible(); const period = bounds(); return visible().filter((item) => { const time = new Date(item.occurredAt).getTime(); return time >= period.from.getTime() && time <= period.to.getTime(); }); }
  function sourceItems(account) { return periodItems().filter((item) => item.account === account); }
  function pendingReviews() { return state.reviewQueue.filter((item) => item.status === 'PENDING'); }
  function titleFor(page) { return ({ overview: ['记账中心', '导入后统一汇总；每一笔数据只在本机私有保存。'], alipay: ['支付宝账单', '当前使用账单文件导入，不显示自动连接。'], wechat: ['微信支付账单', '当前使用账单文件导入，不读取支付凭据。'], transactions: ['全部账单', '跨渠道流水、分类、标签和原始导入批次。'], review: ['待确认', '只处理疑似转账、退款和未分类等异常项目。'], budgets: ['预算管理', '按当前时间范围实时计算 70% / 85% / 100% 阈值。'], reports: ['统计报告', '报告只由已保存的真实账单计算。'], subscriptions: ['订阅管理', '系统只给出建议；确认后才进入订阅追踪。'], settings: ['账户设置', '隐私、导入批次、导出和未来 Provider 状态。'] }[page] || ['记账中心', '']); }
  function updateShell() {
    const [title, subtitle] = titleFor(route);
    document.querySelector('#page-title').textContent = title;
    document.querySelector('#page-subtitle').textContent = `${subtitle} 当前范围：${rangeLabel(range)}${range === 'all' ? '，含所有历史账单。' : '。'}`;
    document.querySelectorAll('[data-route]').forEach((link) => link.classList.toggle('active', link.dataset.route === route));
    document.querySelectorAll('[data-range]').forEach((button) => button.classList.toggle('active', button.dataset.range === range));
    document.querySelector('#custom-range').classList.toggle('hidden', range !== 'custom');
  }
  function channelCards() {
    const items = periodItems();
    return `<div class="grid channels">${ACCOUNTS.slice(0, 5).map((account) => { const own = items.filter((item) => item.account === account.key); const data = Core.summarize(own); return `<article class="channel"><div class="channel-top"><div class="channel-name"><i class="channel-dot ${account.tone}"></i>${account.label}</div><span class="channel-status">${account.status}</span></div><div class="channel-lines"><span>支出 <strong>${money(data.expenseCents)}</strong></span><span>收入 <strong>${money(data.incomeCents)}</strong></span><span>笔数 <strong>${own.length}</strong></span></div><div class="channel-foot">${account.key === 'ALIPAY' || account.key === 'WECHAT_PAY' || account.key === 'BANK' ? '仅处理你手动选择的账单文件' : '通过“记一笔”保存本机记录'}</div></article>`; }).join('')}</div>`;
  }
  function trend(items) {
    if (!items.length) return empty('还没有收支趋势', '添加或导入账单后，这里会按日期显示收入与支出。', 'open-import', '导入账单');
    const period = bounds();
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
    const width = 640; const height = 180; const max = Math.max(1, ...groups.map((item) => Math.max(item.income, item.expense)));
    const points = (field) => groups.map((item, index) => `${(index / Math.max(1, groups.length - 1)) * width},${height - (item[field] / max) * (height - 22) - 8}`).join(' ');
    return `<svg viewBox="0 0 ${width} 215" role="img" aria-label="收入和支出趋势"><line class="chart-grid" x1="0" y1="28" x2="${width}" y2="28"/><line class="chart-grid" x1="0" y1="78" x2="${width}" y2="78"/><line class="chart-grid" x1="0" y1="128" x2="${width}" y2="128"/><line class="chart-grid" x1="0" y1="178" x2="${width}" y2="178"/><polyline class="line-income" points="${points('income')}"/><polyline class="line-expense" points="${points('expense')}"/></svg><div class="legend"><span>收入</span><span class="expense">支出净额</span></div>`;
  }
  function categoryChart(items) {
    const categories = new Map(); items.filter((item) => item.type === Core.TYPE.EXPENSE).forEach((item) => categories.set(item.category || '未分类', (categories.get(item.category || '未分类') || 0) + item.amountCents));
    const rows = [...categories.entries()].sort((a, b) => b[1] - a[1]); if (!rows.length) return empty('还没有分类占比', '导入或记下一笔支出后，这里会自动归类。');
    const total = rows.reduce((sum, row) => sum + row[1], 0); const colors = ['#8758ef', '#ed7c48', '#4f8ff7', '#59c27b', '#ee5e77', '#31b7b7']; let cursor = 0;
    const gradient = rows.map((row, index) => { const start = cursor; cursor += row[1] / total * 100; return `${colors[index % colors.length]} ${start}% ${cursor}%`; }).join(',');
    return `<div class="donut-wrap"><div class="donut" style="background:conic-gradient(${gradient})"><div class="donut-label">${money(total)}<small>总支出</small></div></div><div class="category-list">${rows.slice(0, 8).map((row, index) => `<button class="category-row" data-action="filter-category" data-category="${esc(row[0])}"><i style="background:${colors[index % colors.length]}"></i><span>${esc(row[0])}</span><strong>${percent(row[1] / total * 100)} · ${money(row[1])}</strong></button>`).join('')}</div></div>`;
  }
  function recent(items) { const rows = [...items].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)).slice(0, 7); if (!rows.length) return empty('还没有账单', '可以手动记一笔，或导入支付宝、微信、银行卡流水。', 'open-import', '导入账单'); return `<div class="recent-list">${rows.map((item) => `<button class="recent" data-action="detail" data-id="${esc(item.id)}"><span class="recent-icon">${item.type === Core.TYPE.INCOME ? '↗' : item.type === Core.TYPE.TRANSFER ? '⇄' : item.type === Core.TYPE.REFUND ? '↺' : '•'}</span><span class="recent-main"><strong>${esc(item.merchant || item.description || item.category || '未命名交易')}</strong><span>${accountName(item.account)} · ${esc(item.category || '未分类')} · ${dateText(item.occurredAt)}</span></span><span class="recent-amount ${item.type === Core.TYPE.INCOME ? 'amount-income' : item.type === Core.TYPE.TRANSFER ? 'amount-transfer' : 'amount-expense'}">${item.type === Core.TYPE.INCOME || item.type === Core.TYPE.REFUND ? '+' : item.type === Core.TYPE.TRANSFER ? '' : '-'}${money(item.amountCents)}</span></button>`).join('')}</div>`; }
  function budgetBox(items) { const limit = Number(state.budgets.totalCents) || 0; const used = Core.summarize(items).expenseCents; if (!limit) return empty('还没有总预算', '设置月度总预算后，这里会显示使用率和提醒。', 'goto-budgets', '设置预算'); const ratio = used / limit; return `<div class="budget-summary"><div class="budget-line"><span>本期已使用</span><strong>${money(used)} / ${money(limit)}</strong></div><div class="progress ${ratio >= 0.85 ? 'warn' : ''}"><span style="width:${Math.min(100, ratio * 100)}%"></span></div><div class="budget-line"><span>${ratio >= 1 ? '已超过预算' : ratio >= 0.85 ? '接近预算（85%）' : ratio >= 0.7 ? '已达提醒阈值（70%）' : '预算剩余'}</span><strong>${money(Math.max(0, limit - used))}</strong></div></div>`; }
  function overview() { const items = periodItems(); const data = Core.summarize(items); const limit = Number(state.budgets.totalCents) || 0; const reviews = pendingReviews(); return `<div class="grid metrics">${metric('总收入', money(data.incomeCents), `${rangeLabel(range)}已保存记录`, '↗', 'income')}${metric('总支出', money(data.expenseCents), '已扣除已确认退款', '↘', 'expense')}${metric('结余', money(data.balanceCents), '收入 - 支出净额', '▣', 'balance')}${metric('储蓄率', data.incomeCents ? percent(data.balanceCents / data.incomeCents * 100) : '—', '收入为 0 时显示 —', '◔')}${metric('交易笔数', `${items.length} 笔`, '转账保留但不计入收支', '⌘')}${metric('预算使用率', limit ? percent(data.expenseCents / limit * 100) : '—', limit ? `${money(data.expenseCents)} / ${money(limit)}` : '请先设置预算', '▤')}</div><div class="grid dashboard"><section class="panel chart"><div class="panel-head"><div><h2>收支趋势</h2><p>按当前时间范围聚合已保存账单</p></div><a class="link" href="#reports">查看报告 →</a></div>${trend(items)}</section><section class="panel"><div class="panel-head"><div><h2>支出分类占比</h2><p>退款与内部转账不会伪装成普通支出</p></div><a class="link" href="#transactions">查看账单 →</a></div>${categoryChart(items)}</section></div>${channelCards()}<div class="grid dashboard"><section class="panel"><div class="panel-head"><div><h2>最近账单</h2><p>点击可查看、编辑、添加备注或删除。</p></div><a class="link" href="#transactions">全部账单 →</a></div>${recent(items)}</section><div class="side-stack"><section class="panel"><div class="panel-head"><div><h2>待确认项目</h2><p>不会自动把疑似转账或退款计入统计。</p></div><a class="link" href="#review">处理 →</a></div>${reviews.length ? `<p style="color:#f0c36f;font-size:20px;font-weight:700">${reviews.length} 项</p><p class="muted" style="margin-top:8px">${reviews.map((item) => item.type).join(' · ')}</p>` : '<p class="muted">当前没有待确认异常项目。</p>'}</section><section class="panel"><div class="panel-head"><div><h2>预算进度</h2><p>提醒阈值 70% / 85% / 100%</p></div><a class="link" href="#budgets">管理 →</a></div>${budgetBox(items)}</section></div></div>`; }
  function channelPage(accountKey) { const account = ACCOUNTS.find((item) => item.key === accountKey); const items = sourceItems(accountKey); const data = Core.summarize(items); const source = accountKey === 'ALIPAY' ? 'ALIPAY' : 'WECHAT'; return `<div class="grid metrics">${metric(`${account.label}支出`, money(data.expenseCents), '当前时间范围', '↘', 'expense')}${metric(`${account.label}收入`, money(data.incomeCents), '退款须确认后扣除支出', '↗', 'income')}${metric('结余', money(data.balanceCents), '收入 - 支出净额', '▣', 'balance')}${metric('交易笔数', `${items.length} 笔`, '只统计此账户', '⌘')}</div><div class="grid page-grid" style="margin-top:12px"><section class="panel"><div class="panel-head"><div><h2>${account.label}账单</h2><p>${account.status} · 不读取登录凭证，不爬取支付页面</p></div><button class="btn primary" data-action="open-import" data-source="${source}">导入账单文件</button></div>${items.length ? recent(items) : empty(`还没有${account.label}账单`, '选择你官方导出的文件后，先预览再确认导入。', 'open-import', '选择账单文件')}</section><aside class="panel"><div class="panel-head"><div><h2>Provider 状态</h2><p>真实能力边界</p></div></div><div class="budget-line"><span>当前状态</span><strong style="color:#f0a54f">IMPORT_ONLY</strong></div><p class="muted" style="margin-top:14px;line-height:1.7">当前使用账单文件导入。官方个人账单 API 还没有配置，因此没有“自动同步完成”的伪状态。</p></aside></div>`; }
  function merchantLabel(item) { return String(item?.merchant || item?.counterparty || item?.description || '未命名商家').trim() || '未命名商家'; }
  function merchantGroups(items) {
    const groups = new Map();
    items.forEach((item) => {
      const label = merchantLabel(item);
      const key = label.toLocaleLowerCase();
      const group = groups.get(key) || { key, label, items: [] };
      group.items.push(item);
      groups.set(key, group);
    });
    return [...groups.values()].sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label, 'zh-CN'));
  }
  function merchantCycle(items) {
    const ordered = [...items].sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
    if (ordered.length < 2) return { average: '—', latest: '—', span: ordered[0] ? dateOnly(ordered[0].occurredAt) : '—' };
    const gaps = ordered.slice(1).map((item, index) => Math.max(0, (new Date(item.occurredAt) - new Date(ordered[index].occurredAt)) / 86400000));
    const average = gaps.reduce((sum, value) => sum + value, 0) / gaps.length;
    return { average: `${average.toFixed(1)} 天`, latest: `${gaps[gaps.length - 1].toFixed(1)} 天`, span: `${dateOnly(ordered[0].occurredAt)} — ${dateOnly(ordered[ordered.length - 1].occurredAt)}` };
  }
  function merchantChart(items) {
    const ordered = [...items].sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
    const width = Math.max(280, Math.min(620, ordered.length * 58));
    const height = 126;
    const max = Math.max(1, ...ordered.map((item) => Math.abs(Number(item.amountCents) || 0)));
    const step = width / Math.max(1, ordered.length);
    const bars = ordered.map((item, index) => {
      const value = Math.abs(Number(item.amountCents) || 0);
      const barHeight = Math.max(4, (value / max) * 80);
      const x = index * step + Math.max(5, (step - Math.min(38, step - 10)) / 2);
      const barWidth = Math.min(38, Math.max(12, step - 10));
      const y = 94 - barHeight;
      return `<g><title>${esc(dateText(item.occurredAt))} · ${money(item.amountCents)}</title><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="4" fill="url(#merchant-bar-gradient)"/><text x="${(x + barWidth / 2).toFixed(1)}" y="112" text-anchor="middle">${esc(dateOnly(item.occurredAt).slice(5))}</text></g>`;
    }).join('');
    return `<svg class="merchant-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(merchantLabel(ordered[0]))}订单金额趋势"><defs><linearGradient id="merchant-bar-gradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#b58aff"/><stop offset="1" stop-color="#6540c9"/></linearGradient></defs><line class="chart-grid" x1="0" y1="94" x2="${width}" y2="94"/>${bars}</svg>`;
  }
  function merchantSummary(items) {
    const groups = merchantGroups(items).filter((group) => group.items.length >= 2);
    if (!groups.length) return '';
    return `<section class="merchant-summary"><div class="merchant-summary-head"><div><p class="eyebrow">商家分析</p><h3>商家归纳</h3><p class="muted">相同商家自动合并；点击累计金额查看构成订单。</p></div><span class="pill">${groups.length} 个重复商家</span></div><div class="merchant-summary-grid">${groups.map((group) => { const cycle = merchantCycle(group.items); const total = group.items.reduce((sum, item) => sum + Math.abs(Number(item.amountCents) || 0), 0); return `<article class="merchant-card"><div class="merchant-card-head"><div><h3>${esc(group.label)}</h3><span class="muted">${group.items.length} 笔订单 · ${esc(cycle.span)}</span></div><span class="merchant-count">${group.items.length} 笔</span></div><div class="merchant-stats"><div><span>累计金额</span><button class="merchant-total" data-action="merchant-summary" data-merchant="${esc(group.label)}">${money(total)}</button></div><div><span>平均间隔</span><strong>${cycle.average}</strong></div><div><span>最近间隔</span><strong>${cycle.latest}</strong></div></div><div class="merchant-chart">${merchantChart(group.items)}</div><p class="muted">按订单发生时间绘制金额趋势</p></article>`; }).join('')}</div></section>`;
  }
  function transactionRowsForFilters() {
    const query = (document.querySelector('#tx-search')?.value || '').trim().toLowerCase();
    const account = document.querySelector('#tx-account')?.value || '';
    const type = document.querySelector('#tx-type')?.value || '';
    const category = document.querySelector('#tx-category')?.value || '';
    return visible().filter((item) => transactionSearchText(item).includes(query) && (!account || item.account === account) && (!type || item.type === type) && (!category || item.category === category)).sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
  }
  function transactionTable(items) { if (!items.length) return empty('还没有账单', '手动记账或导入后，所有渠道会出现在这里。', 'open-composer', '记一笔'); return `<div class="table-wrap"><table><thead><tr><th>商家 / 备注</th><th>金额</th><th>类型</th><th>分类</th><th>账户</th><th>发生时间</th><th>来源</th><th></th></tr></thead><tbody>${items.slice(0, 200).map((item) => `<tr><td><strong>${esc(item.merchant || item.description || '未命名交易')}</strong><br><span class="muted">${esc(item.note || '')}</span></td><td class="${item.type === Core.TYPE.INCOME ? 'amount-income' : item.type === Core.TYPE.TRANSFER ? 'amount-transfer' : 'amount-expense'}">${item.type === Core.TYPE.INCOME || item.type === Core.TYPE.REFUND ? '+' : item.type === Core.TYPE.TRANSFER ? '' : '-'}${money(item.amountCents)}</td><td>${typeName(item.type)}</td><td><span class="pill">${esc(item.category || '未分类')}</span></td><td>${accountName(item.account)}</td><td>${dateText(item.occurredAt)}</td><td>${sourceName(item.source)}</td><td><button class="btn ghost" data-action="detail" data-id="${esc(item.id)}">详情</button></td></tr>`).join('')}</tbody></table>${items.length > 200 ? '<p class="muted" style="margin-top:12px">当前仅显示前 200 笔。</p>' : ''}</div>`; }
  function transactionResults(items) { return `${merchantSummary(items)}${transactionTable(items)}`; }
  function openMerchantSummary(merchant) {
    const rows = transactionRowsForFilters().filter((item) => merchantLabel(item).toLocaleLowerCase() === String(merchant).toLocaleLowerCase()).sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
    if (!rows.length) return;
    const total = rows.reduce((sum, item) => sum + Math.abs(Number(item.amountCents) || 0), 0);
    const cycle = merchantCycle(rows);
    document.querySelector('#composer-modal').innerHTML = `<div class="modal-card wide"><div class="modal-head"><div><p class="eyebrow">商家订单</p><h2>${esc(merchant)}</h2><p class="muted">${rows.length} 笔订单 · 累计金额 ${money(total)} · 平均间隔 ${cycle.average}</p></div><button class="modal-close" data-action="close-modal" data-modal="composer-modal">×</button></div><div class="table-wrap"><table><thead><tr><th>发生时间</th><th>金额</th><th>类型</th><th>分类</th><th>备注 / 明细备注</th><th></th></tr></thead><tbody>${rows.map((item) => { const detail = Array.isArray(item.noteGrid) ? item.noteGrid.flatMap((row) => Object.values(row || {})).filter(Boolean).join(' · ') : ''; return `<tr><td>${dateText(item.occurredAt)}</td><td class="${item.type === Core.TYPE.INCOME ? 'amount-income' : item.type === Core.TYPE.TRANSFER ? 'amount-transfer' : 'amount-expense'}">${item.type === Core.TYPE.INCOME || item.type === Core.TYPE.REFUND ? '+' : item.type === Core.TYPE.TRANSFER ? '' : '-'}${money(item.amountCents)}</td><td>${typeName(item.type)}</td><td><span class="pill">${esc(item.category || '未分类')}</span></td><td>${esc([item.note, item.tags, detail].filter(Boolean).join(' · ') || '—')}</td><td><button class="btn ghost" data-action="detail" data-id="${esc(item.id)}">详情</button></td></tr>`; }).join('')}</tbody></table></div><div class="modal-foot"><button class="btn primary" data-action="close-modal" data-modal="composer-modal">完成</button></div></div>`;
    document.querySelector('#composer-modal').hidden = false;
  }
  function transactions() { return `<section class="panel"><div class="panel-head"><div><h2>全部账单</h2><p>支付宝、微信、银行、现金和手动账单统一汇总；内部转账不重复计入收支。</p></div><div class="inline"><button class="btn" data-action="open-import">导入账单</button><button class="btn primary" data-action="open-composer">＋ 记一笔</button></div></div><div class="form-grid" style="margin-bottom:15px"><label>搜索商家 / 备注 / 标签 / 明细备注<input id="tx-search" placeholder="例如：星巴克、旅行、发票、拿铁" /></label><label>账户<select id="tx-account"><option value="">全部账户</option>${ACCOUNTS.map((item) => `<option value="${item.key}">${item.label}</option>`).join('')}</select></label><label>类型<select id="tx-type"><option value="">全部类型</option>${Object.entries(Core.TYPE).map(([key, value]) => `<option value="${value}">${typeName(key)}</option>`).join('')}</select></label><label>分类<select id="tx-category"><option value="">全部分类</option>${[...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, '未分类'].map((item) => `<option>${item}</option>`).join('')}</select></label></div><div id="tx-table">${transactionResults(transactionRowsForFilters())}</div></section>`; }
  function reviews() { const queue = pendingReviews(); if (!queue.length) return `<section class="panel"><div class="panel-head"><div><h2>待确认中心</h2><p>只出现不能安全自动结论的项目。</p></div></div>${empty('当前没有待确认项目', '以后导入账单时，疑似内部转账、退款和未分类交易会出现在这里。', 'open-import', '导入账单')}</section>`; return `<section class="panel"><div class="panel-head"><div><h2>待确认中心</h2><p>只有你确认后，系统才会改变转账、退款或分类的统计语义。</p></div><span class="channel-status ready">${queue.length} 项待处理</span></div><div class="grid">${queue.map((item) => { const rows = item.transactionIds.map((id) => state.transactions.find((transaction) => transaction.id === id)).filter(Boolean); return `<article class="budget-card"><div class="budget-card-head"><strong>${item.type === Core.REVIEW.POSSIBLE_TRANSFER ? '疑似内部转账' : item.type === Core.REVIEW.POSSIBLE_REFUND ? '疑似退款' : '未分类账单'}</strong><span>${rows.map((row) => `${accountName(row.account)} ${money(row.amountCents)}`).join(' ↔ ')}</span></div><p class="muted">${esc(item.reason)}</p><div class="muted">${rows.map((row) => `${esc(row.merchant || row.description || '未命名')} · ${dateText(row.occurredAt)}`).join('<br>')}</div><div class="inline" style="margin-top:10px">${item.type === Core.REVIEW.POSSIBLE_TRANSFER ? `<button class="btn primary" data-action="confirm-transfer" data-id="${item.id}">确认内部转账</button><button class="btn" data-action="external-transfer" data-id="${item.id}">不是内部转账</button>` : item.type === Core.REVIEW.POSSIBLE_REFUND ? `<button class="btn primary" data-action="confirm-refund" data-id="${item.id}">确认退款</button><button class="btn" data-action="dismiss-review" data-id="${item.id}">保留原记录</button>` : `<select data-category-for="${item.id}">${EXPENSE_CATEGORIES.map((category) => `<option>${category}</option>`).join('')}</select><button class="btn primary" data-action="confirm-category" data-id="${item.id}">确认分类</button>`}</div></article>`; }).join('')}</div></section>`; }
  function budgets() { const items = periodItems(); const total = Number(state.budgets.totalCents) || 0; const rows = Object.entries(state.budgets.categories || {}); const categoryTotals = new Map(items.filter((item) => item.type === Core.TYPE.EXPENSE).map((item) => [item.category, 0])); items.filter((item) => item.type === Core.TYPE.EXPENSE).forEach((item) => categoryTotals.set(item.category, (categoryTotals.get(item.category) || 0) + item.amountCents)); return `<div class="grid page-grid"><section class="panel"><div class="panel-head"><div><h2>总预算</h2><p>按当前范围计算：${rangeLabel(range)}</p></div></div><form id="budget-form" class="inline"><label style="flex:1">每月总预算（元）<input id="total-budget" type="number" min="0" step="0.01" value="${total ? total / 100 : ''}" placeholder="例如 8000" /></label><button class="btn primary" type="submit">保存预算</button></form><div style="margin-top:24px">${budgetBox(items)}</div></section><aside class="panel"><div class="panel-head"><div><h2>分类预算</h2><p>超过 70% / 85% / 100% 时会有分层提示。</p></div></div><form id="category-budget-form"><label>分类<select id="budget-category">${EXPENSE_CATEGORIES.map((category) => `<option>${category}</option>`).join('')}</select></label><label style="margin-top:10px">预算金额（元）<input id="budget-amount" type="number" min="0" step="0.01" placeholder="例如 2000" /></label><button class="btn primary" type="submit" style="margin-top:11px">保存分类预算</button></form></aside></div><section class="panel" style="margin-top:12px"><div class="panel-head"><div><h2>分类预算进度</h2><p>本期支出净额按已确认退款处理。</p></div></div>${rows.length ? `<div class="grid">${rows.map(([category, limit]) => { const used = categoryTotals.get(category) || 0; const ratio = used / limit; return `<article class="budget-card"><div class="budget-card-head"><strong>${esc(category)}</strong><span>${money(used)} / ${money(limit)}</span></div><div class="progress ${ratio >= .85 ? 'warn' : ''}"><span style="width:${Math.min(100, ratio * 100)}%"></span></div><div class="budget-line"><span>${ratio >= 1 ? '已超预算' : ratio >= .85 ? '接近预算' : ratio >= .7 ? '提醒' : '预算剩余'}</span><strong>${percent(ratio * 100)}</strong></div></article>`; }).join('')}</div>` : empty('还没有分类预算', '先设置一个分类额度，自动提醒才会出现。', 'goto-budgets', '设置预算')}</section>`; }
  function reports() { const data = Core.summarize(periodItems()); const merchant = new Map(); periodItems().filter((item) => item.type === Core.TYPE.EXPENSE).forEach((item) => merchant.set(item.merchant || '未命名商家', (merchant.get(item.merchant || '未命名商家') || 0) + item.amountCents)); const top = [...merchant.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5); return `<div class="grid report-grid"><article class="panel report-card"><h2>${rangeLabel(range)}净支出</h2><div class="big">${money(data.expenseCents)}</div><p>原始支出 ${money(data.rawExpenseCents)}，已确认退款 ${money(data.refundCents)}。</p></article><article class="panel report-card"><h2>结余与储蓄率</h2><div class="big">${money(data.balanceCents)}</div><p>${data.incomeCents ? `储蓄率 ${percent(data.balanceCents / data.incomeCents * 100)}` : '本期尚无收入记录。'}</p></article><article class="panel report-card"><h2>内部转账</h2><div class="big">${money(data.transferCents)}</div><p>仅供账户流向查看，不计入收入、支出或结余。</p></article></div><section class="panel" style="margin-top:12px"><div class="panel-head"><div><h2>本期消费最多商家</h2><p>由你的已保存账单计算，不使用演示数据。</p></div></div>${top.length ? `<div class="grid">${top.map(([name, cents], index) => `<div class="budget-line"><span>${index + 1}. ${esc(name)}</span><strong>${money(cents)}</strong></div>`).join('')}</div>` : empty('暂无商家排行', '导入或记账后才会根据真实支出计算。')}</section>`; }
  function subscriptionSuggestions() { const grouped = new Map(); visible().filter((item) => item.type === Core.TYPE.EXPENSE && item.merchant).forEach((item) => { const key = `${item.merchant}|${item.amountCents}|${item.account}`; grouped.set(key, [...(grouped.get(key) || []), item]); }); return [...grouped.values()].filter((rows) => rows.length >= 2); }
  function subscriptions() { const suggestions = subscriptionSuggestions(); return `<div class="grid page-grid"><section class="panel"><div class="panel-head"><div><h2>已确认订阅</h2><p>只有你明确确认，才会进入追踪；不会产生付款或自动续订。</p></div></div>${state.subscriptions.length ? `<div class="grid subscription-grid">${state.subscriptions.map((item) => `<article class="budget-card"><strong>${esc(item.name)}</strong><div class="big">${money(item.amountCents)}</div><div class="budget-line"><span>${esc(item.account)} · ${esc(item.period)}</span><button class="btn danger" data-action="remove-subscription" data-id="${item.id}">取消追踪</button></div></article>`).join('')}</div>` : empty('还没有确认订阅', '下方仅提示可能的周期性消费，仍需你亲自确认。', 'none', '暂无操作')}</section><aside class="panel"><div class="panel-head"><div><h2>可能的订阅</h2><p>相同商家 + 相同金额至少出现 2 次。</p></div></div>${suggestions.length ? `<div class="grid">${suggestions.map((rows) => `<article class="budget-card"><strong>${esc(rows[0].merchant)}</strong><span>${money(rows[0].amountCents)} · ${rows.length} 次</span><button class="btn" data-action="confirm-subscription" data-name="${esc(rows[0].merchant)}" data-amount="${rows[0].amountCents}" data-account="${rows[0].account}">确认加入订阅</button></article>`).join('')}</div>` : '<p class="muted">暂无建议。导入多个月的真实账单后才会出现。</p>'}</aside></div>`; }
  function settings() { const batchRows = state.importBatches.slice().reverse(); const providers = [['支付宝', Core.providers.alipay], ['微信支付', Core.providers.wechat], ['银行卡', Core.providers.bank]]; return `<div class="grid page-grid"><section class="panel"><div class="panel-head"><div><h2>隐私与导出</h2><p>财务数据默认 PRIVATE BY DEFAULT。</p></div></div><label class="inline" style="justify-content:space-between;padding:13px 0;border-bottom:1px solid #ffffff0c"><span><strong style="display:block;color:#e6e8f0">隐藏金额</strong><small class="muted">仅本次页面隐藏金额，不修改原账本设置</small></span><input id="hide-amounts" type="checkbox" style="width:20px;min-height:20px"${window.PulseFinance.amountsHidden ? ' checked' : ''} /></label><div class="inline" style="margin-top:16px"><button class="btn" data-action="export-csv">导出 CSV</button><button class="btn" data-action="export-json">导出本地备份</button></div></section><aside class="panel"><div class="panel-head"><div><h2>自动同步</h2><p>未来官方 Provider 预留，不伪造状态。</p></div></div>${providers.map(([name, provider]) => { const status = provider.getConnectionStatus(); return `<div class="budget-line"><span>${name}</span><strong style="color:#f0a54f">${status.status} · 文件导入</strong></div>`; }).join('')}<p class="muted" style="margin-top:14px;line-height:1.65">不要提交支付密码、短信验证码、Cookie、CVV 或银行卡密码。未来合法 OAuth Token 只能保存在服务端。</p></aside></div><section class="panel" style="margin-top:12px"><div class="panel-head"><div><h2>导入批次</h2><p>可撤销整批；若其中交易已编辑，会先提示你确认。</p></div></div>${batchRows.length ? `<div class="table-wrap"><table><thead><tr><th>文件</th><th>来源</th><th>已导入</th><th>重复</th><th>疑似转账</th><th>疑似退款</th><th>状态</th><th></th></tr></thead><tbody>${batchRows.map((batch) => `<tr><td>${esc(batch.fileName)}</td><td>${esc(batch.source)}</td><td>${batch.importedCount}</td><td>${batch.duplicateCount}</td><td>${batch.transferCandidateCount}</td><td>${batch.refundCandidateCount}</td><td>${batch.status}</td><td>${batch.status !== Core.IMPORT_STATUS.ROLLED_BACK ? `<button class="btn ghost" data-action="rollback-batch" data-id="${batch.id}">撤销整批</button>` : '—'}</td></tr>`).join('')}</tbody></table></div>` : empty('还没有导入批次', '导入预览并确认后，这里会记录批次和去重结果。', 'open-import', '导入账单')}</section>`; }
  function render() { updateShell(); if (route === 'alipay') app.innerHTML = channelPage('ALIPAY'); else if (route === 'wechat') app.innerHTML = channelPage('WECHAT_PAY'); else if (route === 'transactions') app.innerHTML = transactions(); else if (route === 'review') app.innerHTML = reviews(); else if (route === 'budgets') app.innerHTML = budgets(); else if (route === 'reports') app.innerHTML = reports(); else if (route === 'subscriptions') app.innerHTML = subscriptions(); else if (route === 'settings') app.innerHTML = settings(); else app.innerHTML = overview(); }

  function openComposer(id = null) { composerId = id; const existing = id ? state.transactions.find((item) => item.id === id) : null; const item = existing || { type: Core.TYPE.EXPENSE, amountCents: 0, category: '餐饮美食', account: 'CASH', destinationAccount: 'BANK', merchant: '', occurredAt: new Date().toISOString().slice(0, 16), note: '', tags: '', receiptName: '' }; const refundOptions = visible().filter((row) => row.type === Core.TYPE.EXPENSE).map((row) => `<option value="${row.id}"${item.originalTransactionId === row.id ? ' selected' : ''}>${esc(row.merchant || row.description || '原消费')} · ${money(row.amountCents)} · ${dateOnly(row.occurredAt)}</option>`).join(''); document.querySelector('#composer-modal').innerHTML = `<div class="modal-card"><div class="modal-head"><div><p class="eyebrow">记录一笔收支</p><h2>${id ? '编辑账单' : '记一笔'}</h2><p class="muted">金额以整数分保存，转账不会计入收入或支出。</p></div><button class="modal-close" data-action="close-modal" data-modal="composer-modal">×</button></div><form id="composer-form"><div class="form-grid"><label class="form-full">金额（元）<input id="composer-amount" type="text" inputmode="decimal" required value="${item.amountCents ? item.amountCents / 100 : ''}" placeholder="0.00" /></label><label>类型<select id="composer-type"><option value="EXPENSE"${item.type === 'EXPENSE' ? ' selected' : ''}>支出</option><option value="INCOME"${item.type === 'INCOME' ? ' selected' : ''}>收入</option><option value="TRANSFER"${item.type === 'TRANSFER' ? ' selected' : ''}>内部转账</option><option value="REFUND"${item.type === 'REFUND' ? ' selected' : ''}>退款</option></select></label><label>分类<select id="composer-category">${EXPENSE_CATEGORIES.map((category) => `<option${item.category === category ? ' selected' : ''}>${category}</option>`).join('')}</select></label><label>账户<select id="composer-account">${ACCOUNTS.map((account) => `<option value="${account.key}"${item.account === account.key ? ' selected' : ''}>${account.label}</option>`).join('')}</select></label><label id="destination-wrap" class="${item.type === 'TRANSFER' ? '' : 'hidden'}">转入账户<select id="composer-destination">${ACCOUNTS.map((account) => `<option value="${account.key}"${item.destinationAccount === account.key ? ' selected' : ''}>${account.label}</option>`).join('')}</select></label><label id="refund-wrap" class="${item.type === 'REFUND' ? '' : 'hidden'}">关联原消费<select id="composer-original"><option value="">选择原消费（必填）</option>${refundOptions}</select></label><label>商家 / 对方<input id="composer-merchant" value="${esc(item.merchant)}" placeholder="例如：星巴克、工资" /></label><label>发生时间<input id="composer-date" type="datetime-local" value="${esc(String(item.occurredAt).slice(0, 16))}" /></label><label class="form-full">备注<textarea id="composer-note" placeholder="可选：记录用途、关联凭证">${esc(item.note)}</textarea></label><label>标签<input id="composer-tags" value="${esc(item.tags)}" placeholder="旅行, 生日礼物" /></label><label>图片凭证<input id="composer-receipt" type="file" accept="image/*,.pdf" /><small class="muted">只保留文件名，不上传。</small></label><label class="inline" style="align-items:center"><input id="save-rule" type="checkbox" style="width:auto;min-height:auto" /><span>以后同一商家自动使用此分类</span></label></div><div class="modal-foot"><button class="btn ghost" type="button" data-action="close-modal" data-modal="composer-modal">取消</button><button class="btn primary" type="submit">${id ? '保存修改' : '保存到账本'}</button></div></form></div>`; document.querySelector('#composer-modal').hidden = false; document.querySelector('#composer-type').addEventListener('change', (event) => { const type = event.target.value; document.querySelector('#destination-wrap').classList.toggle('hidden', type !== 'TRANSFER'); document.querySelector('#refund-wrap').classList.toggle('hidden', type !== 'REFUND'); document.querySelector('#composer-category').innerHTML = (type === 'INCOME' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((category) => `<option>${category}</option>`).join(''); }); }
  function openDetail(id) { const item = state.transactions.find((row) => row.id === id); if (!item) return; const receiptUrl = item.receiptRecordId ? `/api/local-apps/finance/v1/finance/mobile/receipts/${encodeURIComponent(item.receiptRecordId)}/image` : ''; const receiptDetail = receiptUrl ? `<div class="budget-line"><span>原始凭证</span><strong>${esc(item.receiptName || '手机拍照凭证')} · 已本机保留</strong></div>` : ''; const receiptAction = receiptUrl ? `<a class="btn ghost" href="${receiptUrl}" target="_blank" rel="noopener">查看凭证照片</a>` : ''; document.querySelector('#composer-modal').innerHTML = `<div class="modal-card"><div class="modal-head"><div><p class="eyebrow">账单明细</p><h2>${esc(item.merchant || item.description || '未命名交易')}</h2><p class="muted">${typeName(item.type)} · ${accountName(item.account)} · ${dateText(item.occurredAt)}</p></div><button class="modal-close" data-action="close-modal" data-modal="composer-modal">×</button></div><div class="grid" style="gap:10px"><div class="budget-line"><span>金额</span><strong>${money(item.amountCents)}</strong></div><div class="budget-line"><span>分类</span><strong>${esc(item.category || '未分类')}</strong></div><div class="budget-line"><span>来源</span><strong>${sourceName(item.source)}</strong></div>${receiptDetail}<div class="budget-line"><span>导入批次</span><strong>${esc(item.importBatchId || '手动记录')}</strong></div><div class="budget-line"><span>备注</span><strong>${esc(item.note || '—')}</strong></div><div class="budget-line"><span>标签</span><strong>${esc(item.tags || '—')}</strong></div></div><div class="modal-foot">${receiptAction}<button class="btn ghost" data-action="edit" data-id="${item.id}">编辑</button><button class="btn danger" data-action="delete" data-id="${item.id}">删除</button><button class="btn primary" data-action="close-modal" data-modal="composer-modal">完成</button></div></div>`; document.querySelector('#composer-modal').hidden = false; }
  function renderImportModal() { const preview = importDraft?.preview; const result = preview?.ok ? `<div class="grid metrics" style="grid-template-columns:repeat(5,1fr)">${metric('交易总数', `${preview.transactions.length + preview.duplicateCount + preview.invalid.length} 笔`, '本次文件', '⌘')}${metric('可导入', `${preview.transactions.length} 笔`, '未重复且格式有效', '↗', 'income')}${metric('重复', `${preview.duplicateCount} 笔`, '将跳过', '↺')}${metric('待确认', `${preview.potentialTransfers + preview.potentialRefunds + preview.unknownCount} 项`, '转账 / 退款 / 未分类', '!')}${metric('异常', `${preview.invalid.length} 项`, '金额或日期不能识别', '×', 'expense')}</div><p class="muted" style="margin:12px 0">识别来源：<strong>${preview.detectedSource}</strong> · 实际解析：<strong>${preview.source}</strong> · 净支出 ${money(preview.totals.expenseCents)} · 收入 ${money(preview.totals.incomeCents)}</p><div class="table-wrap"><table><thead><tr><th>商家</th><th>金额</th><th>类型</th><th>分类</th><th>发生时间</th></tr></thead><tbody>${preview.transactions.slice(0, 20).map((row) => `<tr><td>${esc(row.merchant || row.description || '未命名')}</td><td>${money(row.amountCents)}</td><td>${typeName(row.type)}</td><td>${esc(row.category)}</td><td>${dateText(row.occurredAt)}</td></tr>`).join('')}</tbody></table></div>` : preview?.error ? `<div class="empty"><div><strong>${esc(preview.error.code)}</strong><span>${esc(preview.error.message)}</span>${preview.error.code === 'IMAGE_FILE_NOT_LEDGER' ? '<a class="btn ghost" href="../finance-receipt-inbox-v12/index.html#inbox" target="_blank" rel="noopener">打开手机凭证识别</a>' : ''}</div></div>` : empty('等待账单文件', '选择文件后按：选择来源 → 解析 → 预览 → 处理待确认 → 完成导入。', 'none', ''); const selected = importDraft?.selectedSource || 'UNKNOWN'; document.querySelector('#import-modal').innerHTML = `<div class="modal-card"><div class="modal-head"><div><p class="eyebrow">导入账单</p><h2>导入账单</h2><p class="muted">5 步：选择来源 / 文件 → 解析 → 预览 → 待确认 → 完成。文件在浏览器解析，确认后的账本保存到这台电脑。</p></div><button class="modal-close" data-action="close-modal" data-modal="import-modal">×</button></div><div class="inline" style="margin-bottom:16px"><span class="pill">1 选择</span><span class="pill">2 解析</span><span class="pill">3 预览</span><span class="pill">4 待确认</span><span class="pill">5 完成</span></div><div class="form-grid"><label>账单来源<select id="import-source"><option value="UNKNOWN"${selected === 'UNKNOWN' ? ' selected' : ''}>自动识别</option><option value="ALIPAY"${selected === 'ALIPAY' ? ' selected' : ''}>支付宝</option><option value="WECHAT"${selected === 'WECHAT' ? ' selected' : ''}>微信支付</option><option value="BANK"${selected === 'BANK' ? ' selected' : ''}>银行卡</option><option value="GENERIC"${selected === 'GENERIC' ? ' selected' : ''}>通用 CSV / Excel</option></select></label><label>账单文件<input id="import-file" type="file" accept=".csv,.tsv,.txt,.xlsx" /><small class="muted">支持 CSV / TSV / TXT / XLSX；手机截图请使用手机凭证识别，不会按账单表格导入。</small></label></div><div id="import-preview" style="margin-top:16px">${result}</div><div class="modal-foot"><button class="btn ghost" data-action="close-modal" data-modal="import-modal">取消</button><button class="btn primary" data-action="confirm-import" ${preview?.ok && preview.transactions.length ? '' : 'disabled'}>确认导入</button></div></div>`; document.querySelector('#import-modal').hidden = false; }
  function xmlText(node) { return node ? node.textContent || '' : ''; }
  function xlsxColumnIndex(reference) { let result = 0; for (const char of String(reference || '').replace(/\d/g, '')) result = result * 26 + char.charCodeAt(0) - 64; return result - 1; }
  function csvCell(value) { const text = String(value ?? ''); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
  async function inflateXlsx(bytes, compression) {
    if (compression === 0) return bytes;
    if (compression !== 8 || typeof DecompressionStream === 'undefined') throw new Error('此浏览器不支持本机 XLSX 解压，请改用 CSV / TXT。');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function readXlsxEntries(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const read16 = (at) => bytes[at] | (bytes[at + 1] << 8);
    const read32 = (at) => (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;
    let eocd = -1;
    for (let at = Math.max(0, bytes.length - 65557); at <= bytes.length - 4; at += 1) if (read32(at) === 0x06054b50) eocd = at;
    if (eocd < 0) throw new Error('不是有效的 XLSX / ZIP 文件。');
    const count = read16(eocd + 10); let cursor = read32(eocd + 16); const entries = new Map(); const decoder = new TextDecoder();
    for (let index = 0; index < count; index += 1) {
      if (read32(cursor) !== 0x02014b50) throw new Error('XLSX 目录格式无效。');
      const compression = read16(cursor + 10); const compressedSize = read32(cursor + 20); const nameLength = read16(cursor + 28); const extraLength = read16(cursor + 30); const commentLength = read16(cursor + 32); const localOffset = read32(cursor + 42); const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
      if (read32(localOffset) !== 0x04034b50) throw new Error('XLSX 条目格式无效。');
      const localNameLength = read16(localOffset + 26); const localExtraLength = read16(localOffset + 28); const start = localOffset + 30 + localNameLength + localExtraLength;
      entries.set(name, await inflateXlsx(bytes.slice(start, start + compressedSize), compression));
      cursor += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  }
  async function xlsxToDelimited(file) {
    const entries = await readXlsxEntries(file); const decoder = new TextDecoder(); const parser = new DOMParser(); const sharedDoc = entries.get('xl/sharedStrings.xml') ? parser.parseFromString(decoder.decode(entries.get('xl/sharedStrings.xml')), 'application/xml') : null;
    const shared = sharedDoc ? Array.from(sharedDoc.getElementsByTagName('si')).map((node) => xmlText(node)) : [];
    const sheetName = Array.from(entries.keys()).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/iu.test(name)).sort()[0];
    if (!sheetName) throw new Error('XLSX 中没有可读取的工作表。');
    const sheet = parser.parseFromString(decoder.decode(entries.get(sheetName)), 'application/xml'); const rows = [];
    for (const rowNode of Array.from(sheet.getElementsByTagName('row'))) {
      const row = []; for (const cell of Array.from(rowNode.getElementsByTagName('c'))) { const index = xlsxColumnIndex(cell.getAttribute('r')); const type = cell.getAttribute('t'); const raw = xmlText(cell.getElementsByTagName('v')[0]) || xmlText(cell.getElementsByTagName('t')[0]); row[index] = type === 's' ? (shared[Number(raw)] || '') : raw; }
      rows.push(row);
    }
    if (rows.length < 2) throw new Error('XLSX 没有可解析的表头和交易行。');
    return rows.map((row) => row.map(csvCell).join(',')).join('\n');
  }
  function importPreview() { return Core.previewImport(state, { fileName: importDraft.fileName, text: importDraft.text, selectedSource: importDraft.selectedSource, alreadyDecodedXlsx: Boolean(importDraft.alreadyDecodedXlsx) }); }
  function setImportNotice() { const notice = document.querySelector('#import-modal small.muted'); if (notice) notice.textContent = '支持 CSV / TSV / TXT / XLSX；手机截图请使用手机凭证识别，不会按账单表格导入。'; }
  function openImport(source = 'UNKNOWN') { importDraft = { selectedSource: source, fileName: '', text: '', alreadyDecodedXlsx: false, preview: null }; renderImportModal(); setImportNotice(); }
  function download(name, content, type) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 300); }
  function exportCsv() { const header = 'id,type,amountCents,category,account,merchant,occurredAt,note,tags,source\n'; const rows = visible().map((item) => [item.id, item.type, item.amountCents, item.category, item.account, item.merchant, item.occurredAt, item.note, item.tags, item.source].map((value) => `"${String(value || '').replace(/"/gu, '""')}"`).join(',')).join('\n'); download('mezip-finance-transactions.csv', header + rows, 'text/csv;charset=utf-8'); }
  function transactionSearchText(item) { const detailValues = Array.isArray(item?.noteGrid) ? item.noteGrid.flatMap((row) => Object.values(row || {})) : []; return [item?.merchant, item?.description, item?.note, item?.tags, item?.category, ...detailValues].filter((value) => value != null).join(' ').toLowerCase(); }
  function filterTransactions() { const rows = transactionRowsForFilters(); const target = document.querySelector('#tx-table'); if (target) target.innerHTML = transactionResults(rows); }
  function confirmReview(id, resolution) { const result = Core.confirmReview(state, id, resolution); if (result.error) { window.alert(result.error.message); return; } state = result.state; persist(); render(); }
  function openConfirm(title, message, confirmAction, id) { document.querySelector('#composer-modal').innerHTML = `<div class="modal-card"><div class="modal-head"><div><p class="eyebrow">确认账本修改</p><h2>${esc(title)}</h2><p class="muted">${esc(message)}</p></div><button class="modal-close" data-action="close-modal" data-modal="composer-modal">×</button></div><div class="modal-foot"><button class="btn ghost" data-action="close-modal" data-modal="composer-modal">取消</button><button class="btn danger" data-action="${confirmAction}" data-id="${esc(id)}">确认继续</button></div></div>`; document.querySelector('#composer-modal').hidden = false; }
  function rollback(id, force = false) { const result = Core.rollbackBatch(state, id, force); if (result.needsConfirmation) { openConfirm('撤销已编辑的导入批次', `其中有 ${result.editedCount} 笔账单已被修改。撤销将只删除本批次导入的交易。`, 'force-rollback', id); return; } if (result.error) { window.alert(result.error.message); return; } state = result.state; persist(); document.querySelector('#composer-modal').hidden = true; render(); }

  document.addEventListener('click', (event) => { const element = event.target.closest('[data-action]'); if (!element) return; const action = element.dataset.action; if (action === 'open-composer') openComposer(); if (action === 'open-import') openImport(element.dataset.source || 'UNKNOWN'); if (action === 'close-modal') document.querySelector(`#${element.dataset.modal}`).hidden = true; if (action === 'merchant-summary') openMerchantSummary(element.dataset.merchant); if (action === 'detail') openDetail(element.dataset.id); if (action === 'edit') { document.querySelector('#composer-modal').hidden = true; openComposer(element.dataset.id); } if (action === 'delete') openConfirm('删除本机账单', '这会删除这笔本机保存的交易，无法从本页恢复。', 'perform-delete', element.dataset.id); if (action === 'perform-delete') { state.transactions = state.transactions.filter((item) => item.id !== element.dataset.id); persist(); document.querySelector('#composer-modal').hidden = true; render(); } if (action === 'confirm-import' && importDraft?.preview?.ok) { const result = Core.commitImport(state, importDraft.preview); if (result.error) { window.alert(result.error.message); return; } state = result.state; persist(); document.querySelector('#import-modal').hidden = true; location.hash = result.pendingCount ? 'review' : 'transactions'; render(); } if (action === 'confirm-transfer') confirmReview(element.dataset.id, { kind: 'INTERNAL_TRANSFER' }); if (action === 'external-transfer') confirmReview(element.dataset.id, { kind: 'EXTERNAL_TRANSFER', category: '人情往来' }); if (action === 'confirm-refund') confirmReview(element.dataset.id, { kind: 'REFUND' }); if (action === 'dismiss-review') confirmReview(element.dataset.id, { kind: 'DISMISS' }); if (action === 'confirm-category') { const category = document.querySelector(`[data-category-for="${CSS.escape(element.dataset.id)}"]`)?.value || '其他'; confirmReview(element.dataset.id, { category, saveRule: false }); } if (action === 'remove-subscription') { state.subscriptions = state.subscriptions.filter((item) => item.id !== element.dataset.id); persist(); render(); } if (action === 'confirm-subscription') { state.subscriptions.push({ id: `sub-${Date.now()}`, name: element.dataset.name, amountCents: Number(element.dataset.amount), account: element.dataset.account, period: '月', createdAt: new Date().toISOString() }); persist(); render(); } if (action === 'rollback-batch') rollback(element.dataset.id); if (action === 'force-rollback') rollback(element.dataset.id, true); if (action === 'export-csv') exportCsv(); if (action === 'export-json') download('mezip-finance-backup.json', JSON.stringify(state, null, 2), 'application/json'); if (action === 'goto-budgets') location.hash = 'budgets'; if (action === 'filter-category') location.hash = `transactions?category=${encodeURIComponent(element.dataset.category)}`; });
  document.addEventListener('change', async (event) => { if (event.target.id === 'hide-amounts') { window.PulseFinance.setAmountsHidden(event.target.checked); render(); } if (event.target.id === 'import-source' && importDraft) { importDraft.selectedSource = event.target.value; if (importDraft.text) importDraft.preview = importPreview(); renderImportModal(); } if (event.target.id === 'import-file' && importDraft) { const file = event.target.files?.[0]; if (!file) return; importDraft.fileName = file.name; importDraft.alreadyDecodedXlsx = /\.xlsx$/iu.test(file.name); try { importDraft.text = importDraft.alreadyDecodedXlsx ? await xlsxToDelimited(file) : await file.text(); importDraft.preview = importPreview(); } catch (error) { importDraft.text = ''; importDraft.preview = { ok: false, error: { code: 'XLSX_PARSE_FAILED', message: error instanceof Error ? error.message : '无法读取 XLSX 文件。' } }; } renderImportModal(); } if (['tx-account', 'tx-type', 'tx-category'].includes(event.target.id)) filterTransactions(); });
  document.addEventListener('input', (event) => { if (event.target.id === 'tx-search') filterTransactions(); });
  document.addEventListener('submit', (event) => { const form = event.target; if (!(form instanceof HTMLFormElement)) return; event.preventDefault(); if (form.id === 'composer-form') { const type = form.querySelector('#composer-type').value; const cents = Core.toCents(form.querySelector('#composer-amount').value); if (cents === null || cents <= 0) { window.alert('请输入大于 0 的金额，最多保留两位小数。'); return; } const current = composerId ? state.transactions.find((item) => item.id === composerId) : null; const original = form.querySelector('#composer-original')?.value || ''; if (type === 'REFUND' && !original) { window.alert('退款必须关联一笔原消费，避免被当成普通收入。'); return; } const receipt = form.querySelector('#composer-receipt')?.files?.[0]; const merchant = form.querySelector('#composer-merchant').value.trim(); const noteGrid = composerGridRows(); const transaction = { ...(current || {}), id: current?.id || `manual-${Date.now()}`, ownerId: state.ownerId, accountId: form.querySelector('#composer-account').value, account: form.querySelector('#composer-account').value, destinationAccount: type === 'TRANSFER' ? form.querySelector('#composer-destination').value : '', type, amountCents: cents, currency: 'CNY', merchant, counterparty: merchant, description: '', category: type === 'TRANSFER' ? '账户转账' : form.querySelector('#composer-category').value, classificationBasis: 'USER_CONFIRMATION', paymentMethod: '', occurredAt: form.querySelector('#composer-date').value ? new Date(form.querySelector('#composer-date').value).toISOString() : new Date().toISOString(), timezone: state.settings.timezone, status: 'POSTED', note: form.querySelector('#composer-note').value.trim(), noteGrid, tags: form.querySelector('#composer-tags').value.trim(), receiptName: receipt?.name || current?.receiptName || '', source: 'MANUAL', originalTransactionId: type === 'REFUND' ? original : '', createdAt: current?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }; transaction.fingerprint = Core.fingerprint(transaction); if (current) state.transactions = state.transactions.map((item) => item.id === current.id ? transaction : item); else state.transactions.push(transaction); if (form.querySelector('#save-rule').checked && merchant) state.personalRules.push({ id: `rule-${Date.now()}`, ownerId: state.ownerId, merchant, category: transaction.category, createdAt: new Date().toISOString() }); persist(); document.querySelector('#composer-modal').hidden = true; render(); if (current?.receiptRecordId) void syncReceiptEdit(transaction); } if (form.id === 'budget-form') { const cents = Core.toCents(form.querySelector('#total-budget').value) || 0; state.budgets.totalCents = cents; persist(); render(); } if (form.id === 'category-budget-form') { const cents = Core.toCents(form.querySelector('#budget-amount').value) || 0; state.budgets.categories[form.querySelector('#budget-category').value] = cents; persist(); render(); } });
  document.addEventListener('click', (event) => {
    const element = event.target.closest('[data-action]');
    if (!element) return;
    if (element.dataset.action === 'open-composer' || element.dataset.action === 'edit') window.setTimeout(injectComposerGrid, 0);
    if (element.dataset.action === 'detail') window.setTimeout(() => injectDetailGrid(element.dataset.id), 0);
  });
  document.querySelectorAll('[data-range]').forEach((button) => button.addEventListener('click', () => { range = button.dataset.range; render(); }));
  document.querySelector('[data-action="open-composer"]')?.addEventListener('click', () => openComposer());
  document.querySelector('[data-action="apply-custom-range"]')?.addEventListener('click', () => { range = 'custom'; custom = { from: document.querySelector('#range-from').value, to: document.querySelector('#range-to').value }; render(); });
  window.addEventListener('pulse-finance-data', () => { state = load(); render(); });
  window.addEventListener('pulse-finance-privacy', render);
  window.addEventListener('hashchange', () => { const [nextRoute, query = ''] = (location.hash.replace('#', '') || 'overview').split('?'); route = nextRoute || 'overview'; if (route === 'transactions') { const category = new URLSearchParams(query).get('category'); render(); if (category) { const select = document.querySelector('#tx-category'); if (select) { select.value = category; filterTransactions(); } return; } } render(); });
  const importNoticeObserver = new MutationObserver(() => {
    const notice = document.querySelector('#import-modal small.muted');
    if (notice && notice.textContent.includes('XLSX 没有本机解析器')) notice.textContent = '支持 CSV / TSV / TXT / XLSX；XLSX 只在当前浏览器本机解压读取，不会上传，也不会伪造导入结果。';
  });
  importNoticeObserver.observe(document.querySelector('#import-modal'), { childList: true, subtree: true });
  render();
  void syncReceiptGrids();
})();
