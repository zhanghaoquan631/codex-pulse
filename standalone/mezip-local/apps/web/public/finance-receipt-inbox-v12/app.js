(() => {
  'use strict';

  const Core = window.MEZipFinance;
  const BRIDGE = 'http://127.0.0.1:4325';
  const FINANCE_KEY = 'mezip.finance.center.v2';
  const GRID_FIELDS = ['sku', 'nameSpec', 'unit', 'quantity', 'unitPrice', 'amount', 'remark'];
  const GRID_HEADERS = ['货号', '名称及规格', '单位', '数量', '单价', '金额', '备注'];
  const MOBILE_LINK_KEY = 'mezip.finance.mobile-link.v12';
  const CATEGORIES = ['餐饮美食', '购物消费', '交通出行', '生活日用', '住房', '娱乐休闲', '医疗健康', '学习教育', '旅行', '数码', '宠物', '订阅服务', '人情往来', '工作支出', '工作收入', '其他'];
  const content = document.querySelector('#page-content');
  const dialog = document.querySelector('#app-dialog');
  const dialogContent = document.querySelector('#dialog-content');
  const stateElement = document.querySelector('#connection-state');
  const gridTemplate = document.querySelector('#receipt-grid-template');
  if (!Core) throw new Error('ME.zip Finance Core is unavailable.');

  let route = 'inbox';
  let records = [];
  let eventSource = null;
  let connectionReady = false;
  let mobileLink = (() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(MOBILE_LINK_KEY) || 'null');
      return saved && (saved.permanent === true || !saved.expiresAt || Date.parse(saved.expiresAt) > Date.now()) ? String(saved.url || '') : '';
    } catch { return ''; }
  })();

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const escapeAttr = escapeHtml;
  const money = (cents) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 2 }).format((Number(cents) || 0) / 100);
  const toLocalInput = (value) => { const date = value ? new Date(value) : null; return !date || Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  const formatTime = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date); };
  const ledgerId = (record) => `mobile-receipt-${String(record.id).replace(/^receipt-/u, '')}`;
  const normalMerchant = (value) => String(value || '').trim() || '未归类商家';

  function toast(message, tone = '') {
    document.querySelector('.toast')?.remove();
    const node = document.createElement('div');
    node.className = `toast ${tone ? `is-${tone}` : ''}`;
    node.textContent = message;
    document.body.append(node);
    window.setTimeout(() => node.remove(), 4200);
  }

  function getLedger() {
    try { return Core.hydrateState(JSON.parse(localStorage.getItem(FINANCE_KEY) || 'null') || Core.blankState()); } catch { return Core.blankState(); }
  }
  function saveLedger(state) { localStorage.setItem(FINANCE_KEY, JSON.stringify(state)); }
  function localTransaction(record) { return getLedger().transactions.find((transaction) => transaction.id === ledgerId(record)); }
  function recordNeedsReentry(record) { return record.status === 'CONFIRMED_TO_DESKTOP' && !localTransaction(record); }
  function currentBills() {
    const recordMap = new Map(records.map((record) => [record.id, record]));
    return getLedger().transactions
      .filter((transaction) => transaction.ownerId === getLedger().ownerId)
      .map((transaction) => ({ transaction, record: transaction.receiptRecordId ? recordMap.get(transaction.receiptRecordId) || null : null }))
      .sort((a, b) => new Date(b.transaction.occurredAt || b.transaction.createdAt).getTime() - new Date(a.transaction.occurredAt || a.transaction.createdAt).getTime());
  }
  function cleanGrid(rows) {
    return Array.isArray(rows) ? rows.map((row) => Object.fromEntries(GRID_FIELDS.map((field) => [field, String(row?.[field] ?? '').trim().slice(0, field === 'remark' ? 220 : 120)]))).filter((row) => Object.values(row).some(Boolean)) : [];
  }
  function defaultGrid(rows) { const safe = cleanGrid(rows); return safe.length ? safe : Array.from({ length: 5 }, () => Object.fromEntries(GRID_FIELDS.map((field) => [field, '']))); }
  function recordStatus(record) {
    if (record.status === 'REJECTED') return { label: '已拒收', tone: 'rejected' };
    if (recordNeedsReentry(record)) return { label: '待重新入账', tone: 'pending' };
    if (record.status === 'CONFIRMED_TO_DESKTOP') return { label: '已入账', tone: 'confirmed' };
    return { label: '待确认', tone: 'pending' };
  }
  function updateTabCounts() {
    document.querySelector('#tab-pending').textContent = records.filter((record) => record.status === 'PENDING_REVIEW' || recordNeedsReentry(record)).length;
    document.querySelector('#tab-bills').textContent = currentBills().length;
    document.querySelector('#tab-merchants').textContent = new Set(currentBills().map(({ transaction }) => normalMerchant(transaction.merchant || transaction.counterparty))).size;
  }
  function setConnection(text, failed = false) { stateElement.textContent = text; stateElement.classList.toggle('is-fail', failed); }

  async function api(path, init = {}) {
    const headers = { ...(init.headers || {}) };
    if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${BRIDGE}${path}`, { credentials: 'include', ...init, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error?.message || '本地财务收件箱请求失败。');
    return body;
  }
  async function ensureDesktopSession() { await api('/v1/finance/mobile/health'); await api('/v1/finance/mobile/desktop-session'); }
  async function loadInbox({ silent = false } = {}) {
    try {
      if (!silent) setConnection('连接本地收件箱…');
      await ensureDesktopSession();
      const payload = await api('/v1/finance/mobile/receipts');
      records = payload.records || [];
      connectionReady = true;
      setConnection(`本机监听 · ${records.length} 张凭证`);
      if (!eventSource) startRealtime();
      render();
    } catch (error) {
      connectionReady = false;
      setConnection('本地收件箱未连接', true);
      render();
      if (!silent) toast(error.message || '本地收件箱未启动。', 'error');
    }
  }
  function startRealtime() {
    eventSource = new EventSource(`${BRIDGE}/v1/finance/mobile/events`, { withCredentials: true });
    eventSource.addEventListener('inbox', () => loadInbox({ silent: true }));
    eventSource.onerror = () => { eventSource?.close(); eventSource = null; setConnection('实时连接中断 · 可手动刷新', true); };
  }

  function buildTransaction(record, fields) {
    const cents = Core.toCents(fields.amount);
    if (cents === null || cents <= 0) throw new Error('请填写大于 0 的金额，再确认入账。');
    const actualCandidate = fields.occurredAt || record.occurredAt || record.createdAt;
    const actualDate = new Date(actualCandidate || new Date().toISOString());
    const actualTime = Number.isNaN(actualDate.getTime()) ? new Date().toISOString() : actualDate.toISOString();
    if (Number.isNaN(new Date(actualTime).getTime())) throw new Error('账单实际时间无效，请重新选择。');
    const state = getLedger();
    const transaction = {
      id: ledgerId(record), ownerId: state.ownerId, accountId: fields.account, account: fields.account, destinationAccount: '', type: fields.type === 'INCOME' ? 'INCOME' : 'EXPENSE', amountCents: cents, currency: 'CNY', merchant: fields.merchant.trim() || '手机拍照凭证', counterparty: fields.merchant.trim(), description: '手机拍照凭证', category: fields.category, classificationBasis: 'USER_CONFIRMATION', paymentMethod: '', occurredAt: actualTime, timezone: state.settings?.timezone || 'Asia/Shanghai', status: 'POSTED', note: fields.note.trim(), noteGrid: cleanGrid(fields.noteGrid), tags: '手机凭证', receiptName: record.fileName, receiptRecordId: record.id, receiptCapturedAt: record.createdAt, source: 'MOBILE_CAMERA', originalTransactionId: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    transaction.fingerprint = Core.fingerprint(transaction);
    return { state, transaction };
  }

  function valuesFromForm(form) {
    const read = (field) => form.querySelector(`[data-field="${field}"]`)?.value || '';
    return { amount: read('amount'), type: read('type'), merchant: read('merchant'), account: read('account'), category: read('category'), occurredAt: read('occurredAt'), note: read('note'), noteGrid: rowsFromGrid(form) };
  }
  function rowsFromGrid(scope) {
    return cleanGrid([...scope.querySelectorAll('[data-grid-row]')].map((row) => Object.fromEntries(GRID_FIELDS.map((field) => [field, row.querySelector(`[data-grid-field="${field}"]`)?.value || '']))));
  }
  function setGridRows(scope, rows, readonly = false) {
    const table = gridTemplate.content.firstElementChild.cloneNode(true);
    const body = table.querySelector('tbody');
    const add = table.querySelector('.grid-add');
    const addRow = (row = {}) => {
      const tr = document.createElement('tr');
      tr.dataset.gridRow = 'true';
      if (readonly) {
        tr.innerHTML = GRID_FIELDS.map((field) => `<td class="${row[field] ? '' : 'empty-cell'}">${escapeHtml(row[field] || '—')}</td>`).join('') + '<td>—</td>';
      } else {
        tr.innerHTML = GRID_FIELDS.map((field) => `<td><input data-grid-field="${field}" value="${escapeAttr(row[field] || '')}" aria-label="${field}" /></td>`).join('') + '<td><button class="row-delete" type="button" aria-label="删除这一行">×</button></td>';
        tr.querySelector('.row-delete').addEventListener('click', () => { if (body.children.length > 1) tr.remove(); else tr.querySelectorAll('input').forEach((input) => { input.value = ''; }); });
      }
      body.append(tr);
    };
    defaultGrid(rows).forEach(addRow);
    if (readonly) { table.querySelector('.grid-add').remove(); table.querySelector('.receipt-grid-help').textContent = '此卡片保存的是这笔账当时填写的明细与备注。'; table.querySelector('.receipt-grid').classList.add('is-readonly'); }
    else add.addEventListener('click', () => addRow());
    scope.append(table);
  }

  function render() {
    updateTabCounts();
    document.querySelectorAll('[data-route]').forEach((button) => button.classList.toggle('is-active', button.dataset.route === route));
    if (route === 'bills') renderBills();
    else if (route === 'merchants') renderMerchants();
    else if (route === 'legacy') renderLegacy();
    else renderInbox();
  }

  function renderInbox() {
    const visible = records.filter((record) => record.status !== 'REJECTED');
    const pending = records.filter((record) => record.status === 'PENDING_REVIEW' || recordNeedsReentry(record));
    const confirmed = records.filter((record) => record.status === 'CONFIRMED_TO_DESKTOP' && !recordNeedsReentry(record));
    const rejected = records.filter((record) => record.status === 'REJECTED');
    content.innerHTML = `<div class="workspace-grid"><section class="panel panel-inner"><div class="panel-heading"><div><span class="eyebrow">RECEIPT INBOX</span><h2>收件箱里每张照片都有明确状态</h2><p>发送时间由手机上传时自动记录；账单实际时间单独保存，可以在确认前后修改。</p></div><button class="button subtle" data-action="show-rejected" type="button">查看已拒收 ${rejected.length}</button></div><div class="stat-row"><article class="stat"><span>当前凭证</span><strong>${visible.length}</strong></article><article class="stat pending"><span>待确认</span><strong>${pending.length}</strong></article><article class="stat confirmed"><span>已入账</span><strong>${confirmed.length}</strong></article><article class="stat rejected"><span>已拒收</span><strong>${rejected.length}</strong></article></div>${connectionReady ? renderReceiptList(visible) : '<div class="empty"><strong>本地收件箱尚未启动</strong><p>启动本机财务收件服务后，手机照片会在这里出现。</p></div>'}</section><aside class="sidebar-stack"><section class="panel panel-inner"><div class="panel-heading"><div><span class="eyebrow">PHONE LINK</span><h3>手机拍照链接</h3><p>只在同一可信 Wi‑Fi 内配对；不上传云端。</p></div></div><div class="invite-field"><input id="mobile-link" readonly value="${escapeAttr(mobileLink)}" placeholder="点击“生成手机链接”" /><button class="button primary" type="button" data-action="copy-link"${mobileLink ? '' : ' disabled'}>复制链接</button></div></section><section class="panel panel-inner"><span class="eyebrow">HOW IT WORKS</span><ol class="mini-steps"><li><b>1</b><div><strong>手机拍照或从相册选图</strong><br>手机页自动记录发送时刻，并可填写账单实际时间。</div></li><li><b>2</b><div><strong>在这里核对明细田字格</strong><br>可持续添加商品行、填写备注，然后保存草稿。</div></li><li><b>3</b><div><strong>明确确认后才写入本机账本</strong><br>之后在“全部账单”与“商家归纳”中查看。</div></li></ol></section></aside></div>`;
    content.querySelectorAll('[data-open-record]').forEach((button) => button.addEventListener('click', () => openRecord(button.dataset.openRecord)));
    content.querySelector('[data-action="show-rejected"]')?.addEventListener('click', () => openRejected());
    content.querySelector('[data-action="copy-link"]')?.addEventListener('click', copyMobileLink);
  }

  function renderReceiptList(items) {
    if (!items.length) return '<div class="empty"><strong>还没有待处理的照片</strong><p>点击右上角生成手机链接；上传成功的凭证会自动出现在这里。</p></div>';
    return `<div class="receipt-list">${items.map((record) => { const status = recordStatus(record); const amount = Core.toCents(record.amount); return `<article class="receipt-row"><img class="receipt-image" src="${escapeAttr(`${BRIDGE}${record.imageUrl}`)}" alt="${escapeAttr(record.fileName || '凭证照片')}" /><div><h3>${escapeHtml(record.merchant || '待填写商家')}</h3><p>发送时间 ${escapeHtml(formatTime(record.createdAt))} · 实际时间 ${escapeHtml(formatTime(record.occurredAt || record.createdAt))}</p><div class="receipt-meta"><span class="badge ${status.tone}">${status.label}</span>${amount !== null ? `<span class="badge">${escapeHtml(money(amount))}</span>` : '<span class="badge">金额待核对</span>'}${record.noteGrid?.length ? '<span class="badge">有明细备注</span>' : ''}</div></div><div class="receipt-actions"><button class="button subtle" type="button" data-open-record="${escapeAttr(record.id)}">${status.tone === 'pending' ? '核对并处理' : '查看与修改'}</button></div></article>`; }).join('')}</div>`;
  }

  function billMerchant(transaction) { return normalMerchant(transaction.merchant || transaction.counterparty || transaction.description); }
  function makeMerchantGroups() {
    const groups = new Map();
    currentBills().forEach((bill) => { const name = billMerchant(bill.transaction); const group = groups.get(name) || { name, entries: [] }; group.entries.push(bill); groups.set(name, group); });
    return [...groups.values()].map((group) => {
      const byTime = [...group.entries].sort((a, b) => new Date(a.transaction.occurredAt).getTime() - new Date(b.transaction.occurredAt).getTime());
      const intervals = byTime.slice(1).map((entry, index) => Math.abs(new Date(entry.transaction.occurredAt).getTime() - new Date(byTime[index].transaction.occurredAt).getTime()) / 86400000).filter(Number.isFinite);
      let income = 0; let expense = 0; let refunds = 0;
      group.entries.forEach(({ transaction }) => { const amount = Math.abs(Number(transaction.amountCents) || 0); if (transaction.type === 'INCOME') income += amount; else if (transaction.type === 'EXPENSE') expense += amount; else if (transaction.type === 'REFUND') refunds += amount; });
      const netExpense = Math.max(0, expense - refunds);
      const total = group.entries.reduce((sum, entry) => sum + Math.abs(Number(entry.transaction.amountCents || 0)), 0);
      const averageDays = intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : null;
      return { ...group, total, income, expense: netExpense, refunds, balance: income - netExpense, averageDays, latest: byTime.at(-1)?.transaction.occurredAt || null, amounts: byTime.slice(-7).map((entry) => Math.abs(Number(entry.transaction.amountCents) || 0)) };
    }).sort((a, b) => b.total - a.total);
  }

  function merchantBarsHtml(group, className = 'sparkbars') {
    const max = Math.max(...group.amounts, 1);
    return `<div class="${className}" aria-label="${escapeAttr(group.name)} 金额走势">${group.amounts.map((amount, index) => `<div><span style="height:${Math.max(10, Math.round(amount / max * 100))}%"></span><small>${index + 1} · ${escapeHtml(money(amount))}</small></div>`).join('')}</div>`;
  }

  function renderLegacyMerchantPanel(groups) {
    if (!groups.length) return '<section class="legacy-merchant-panel"><div class="panel-heading"><div><span class="eyebrow">V12 MERCHANT SUMMARY</span><h2>商家归纳</h2><p>确认入账后，V12 会按商家合并账单并标注每笔金额。</p></div></div><div class="empty"><strong>还没有可归纳的商家记录</strong><p>先确认一笔账单，商家板块会自动出现。</p></div></section>';
    return `<section class="legacy-merchant-panel"><div class="panel-heading"><div><span class="eyebrow">V12 MERCHANT SUMMARY</span><h2>商家归纳</h2><p>本次新增功能只显示在 V12 的“原财务中心 V2”页面；原财务中心页面本身未修改。</p></div><span class="connection-state">${groups.length} 个商家</span></div><div class="legacy-merchant-grid">${groups.map((group) => `<article class="legacy-merchant-card"><div class="merchant-title"><div><h3>${escapeHtml(group.name)}</h3><span class="order-count">${group.entries.length} 笔已入账订单</span></div><button class="icon-button" type="button" data-open-merchant="${escapeAttr(group.name)}" aria-label="查看 ${escapeAttr(group.name)} 的订单">↗</button></div><button class="merchant-total" type="button" data-open-merchant="${escapeAttr(group.name)}">${escapeHtml(money(group.total))}</button><p class="interval">${group.averageDays === null ? '尚不足两笔，暂不能计算周期' : `平均 ${group.averageDays.toFixed(group.averageDays < 10 ? 1 : 0)} 天出现一笔`}</p>${merchantBarsHtml(group, 'legacy-sparkbars')}</article>`).join('')}</div></section>`;
  }

  function renderLegacy() {
    const groups = makeMerchantGroups();
    content.innerHTML = `<section class="panel legacy-center"><div class="legacy-heading"><div><span class="eyebrow">ORIGINAL FINANCE CENTER · V2</span><h2>原财务中心 V2</h2><p>原有支付宝、微信支付、全部账单、待确认、预算、报告、订阅与账户设置均保留。它与当前 V12 共享同一本机账本，不会复制或覆盖数据。</p></div><div class="legacy-actions"><button class="button subtle" type="button" data-action="back-inbox">返回财务收件箱</button><a class="button primary" href="/finance-center-v2/index.html#overview" target="_blank" rel="noopener">新标签打开 V2</a></div></div><div class="legacy-status"><span>原页面未修改</span><span>V12 商家归纳已启用</span><span>共享本机账本</span><span>只在本机运行</span></div><section class="legacy-import-tools" aria-labelledby="legacy-import-title"><div><span class="eyebrow">V12 IMAGE IMPORT</span><h3 id="legacy-import-title">图片凭证导入</h3><p>旧 V2 的“导入账单”只接受 CSV、TSV、TXT、XLSX。账单截图请从这里导入到 V12 本机收件箱，先识别并保存，核对后才入账。</p></div><div class="legacy-import-actions"><input id="legacy-image-import" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden /><button class="button primary" type="button" data-action="legacy-import-image">选择图片并识别</button><button class="button subtle" type="button" data-action="legacy-go-inbox">打开 V12 收件箱</button></div><p id="legacy-import-status" class="legacy-import-status" role="status">图片会保存在本机待确认收件箱，不会直接写入账本。</p></section>${renderLegacyMerchantPanel(groups)}<iframe class="legacy-frame" title="ME.zip 原财务中心 V2" src="../finance-center-v2/index.html#overview" loading="eager"></iframe></section>`;
    content.querySelector('[data-action="back-inbox"]')?.addEventListener('click', () => changeRoute('inbox'));
    content.querySelectorAll('[data-open-merchant]').forEach((button) => button.addEventListener('click', () => openMerchant(button.dataset.openMerchant)));
    const input = content.querySelector('#legacy-image-import');
    content.querySelector('[data-action="legacy-import-image"]')?.addEventListener('click', () => input?.click());
    input?.addEventListener('change', () => importLegacyImage(input));
    content.querySelector('[data-action="legacy-go-inbox"]')?.addEventListener('click', () => changeRoute('inbox'));
  }


  function renderBills() {
    const bills = currentBills();
    content.innerHTML = `<section class="panel table-panel"><div class="panel-inner panel-heading"><div><span class="eyebrow">ALL BILLS</span><h2>全部账单</h2><p>点击“明细备注”会打开对应的田字格卡片；发送/入账时间与账单实际时间分开显示。</p></div><button class="button subtle" type="button" data-action="go-merchants">按商家查看归纳</button></div><div class="table-toolbar"><input id="bill-search" placeholder="搜索商家、备注、商品名称…" /><select id="bill-kind"><option value="ALL">全部收支</option><option value="EXPENSE">支出</option><option value="INCOME">收入</option></select><button class="button subtle" type="button" id="reset-bill-filter">清除筛选</button></div><div id="bill-table-region"></div></section>`;
    const paint = () => {
      const query = content.querySelector('#bill-search').value.trim().toLowerCase();
      const kind = content.querySelector('#bill-kind').value;
      const filtered = bills.filter(({ transaction }) => (kind === 'ALL' || transaction.type === kind) && (!query || `${transaction.merchant} ${transaction.note} ${transaction.description} ${(transaction.noteGrid || []).map((row) => Object.values(row).join(' ')).join(' ')}`.toLowerCase().includes(query)));
      const region = content.querySelector('#bill-table-region');
      if (!filtered.length) { region.innerHTML = '<div class="empty"><strong>没有匹配的账单</strong><p>确认入账后，账单会安全地出现在这里。</p></div>'; return; }
      region.innerHTML = `<div class="table-wrap"><table class="bill-table"><thead><tr><th>商家</th><th>金额</th><th>收支</th><th>发送 / 入账时间</th><th>账单实际时间</th><th>账户</th><th>分类</th><th>明细备注</th><th>操作</th></tr></thead><tbody>${filtered.map(({ transaction, record }) => `<tr><td>${escapeHtml(billMerchant(transaction))}</td><td class="money">${escapeHtml(money(transaction.amountCents))}</td><td>${transaction.type === 'INCOME' ? '收入' : transaction.type === 'REFUND' ? '退款' : '支出'}</td><td>${escapeHtml(formatTime(record?.createdAt || transaction.receiptCapturedAt || transaction.createdAt))}</td><td>${escapeHtml(formatTime(transaction.occurredAt))}</td><td>${escapeHtml(transaction.account || '其他')}</td><td>${escapeHtml(transaction.category || '其他')}</td><td class="note-cell"><button class="clickable-note" type="button" data-open-note="${escapeAttr(transaction.id)}">${escapeHtml(transaction.note || (transaction.noteGrid?.length ? '查看明细备注' : '添加明细备注'))}</button></td><td><button class="button subtle" type="button" data-edit-bill="${escapeAttr(transaction.id)}">编辑</button></td></tr>`).join('')}</tbody></table></div>`;
      region.querySelectorAll('[data-open-note]').forEach((button) => button.addEventListener('click', () => openBillCard(button.dataset.openNote)));
      region.querySelectorAll('[data-edit-bill]').forEach((button) => button.addEventListener('click', () => openLedgerBill(button.dataset.editBill)));
    };
    content.querySelector('#bill-search').addEventListener('input', paint); content.querySelector('#bill-kind').addEventListener('change', paint); content.querySelector('#reset-bill-filter').addEventListener('click', () => { content.querySelector('#bill-search').value = ''; content.querySelector('#bill-kind').value = 'ALL'; paint(); }); content.querySelector('[data-action="go-merchants"]')?.addEventListener('click', () => changeRoute('merchants'));
    paint();
  }

  function renderMerchants() {
    const groups = makeMerchantGroups();
    const incomeRanks = groups.filter((group) => group.income > 0).sort((a, b) => b.income - a.income || b.entries.length - a.entries.length).slice(0, 3);
    const expenseRanks = groups.filter((group) => group.expense > 0).sort((a, b) => b.expense - a.expense || b.entries.length - a.entries.length).slice(0, 3);
    const totalIncome = groups.reduce((sum, group) => sum + group.income, 0);
    const totalExpense = groups.reduce((sum, group) => sum + group.expense, 0);
    const rankCard = (group, rank, field, tone, label) => {
      if (!group) return `<article class="merchant-rank-card is-empty"><span class="rank-position">${rank}</span><span class="rank-label">${label}</span><h3>暂无商家</h3><strong class="rank-value ${tone}">—</strong><span class="rank-caption">后续入账后自动补位</span></article>`;
      return `<article class="merchant-rank-card" data-open-merchant="${escapeAttr(group.name)}" role="button" tabindex="0" aria-label="查看第 ${rank} 名${escapeAttr(group.name)}的具体账单"><div class="rank-card-heading"><span class="rank-position">${rank}</span><span class="rank-label">${label}</span></div><h3 title="${escapeAttr(group.name)}">${escapeHtml(group.name)}</h3><strong class="rank-value ${tone}">${escapeHtml(money(group[field]))}</strong><span class="rank-caption">点击查看 ${group.entries.length} 笔具体账单</span><div class="rank-breakdown"><span>收入 <b>${escapeHtml(money(group.income))}</b></span><span>支出 <b>${escapeHtml(money(group.expense))}</b></span><span>结余 <b>${escapeHtml(money(group.balance))}</b></span></div></article>`;
    };
    const rankSection = (title, ranks, field, tone, total) => `<section class="merchant-rank-section"><div class="merchant-rank-section-heading"><div><h3>${title}</h3><span>按全部已入账账单持续累计</span></div><strong class="rank-section-total ${tone}">总计 ${escapeHtml(money(total))}</strong></div><div class="merchant-rank-grid">${[0, 1, 2].map((index) => rankCard(ranks[index], index + 1, field, tone, title)).join('')}</div></section>`;
    const periodSummary = groups.length ? `<section class="merchant-period-summary"><div class="merchant-period-heading"><div><span class="eyebrow">ALL POSTED BILLS</span><h2>商家收支排名</h2><p>按全部已入账记录持续累计；退款抵减支出，内部转账不计入收入或支出。</p></div><div class="merchant-total-summary"><span>收入总额 <b class="income">${escapeHtml(money(totalIncome))}</b></span><span>支出总额 <b class="expense">${escapeHtml(money(totalExpense))}</b></span></div></div><div class="merchant-rank-sections">${rankSection('收入最多商家', incomeRanks, 'income', 'income', totalIncome)}${rankSection('支出最多商家', expenseRanks, 'expense', 'expense', totalExpense)}</div></section>` : '';
    content.innerHTML = `<section class="panel panel-inner"><div class="panel-heading"><div><span class="eyebrow">MERCHANT INTELLIGENCE</span><h2>商家归纳</h2><p>同一商家自动形成一个板块：总金额、订单频率与金额走势都会基于已入账账单计算。</p></div><span class="connection-state">${groups.length} 个商家</span></div>${periodSummary}${groups.length ? `<div class="merchant-grid">${groups.map((group) => { return `<article class="merchant-card"><div class="merchant-title"><div><h3>${escapeHtml(group.name)}</h3><span class="order-count">${group.entries.length} 笔已入账订单</span></div><button class="icon-button" type="button" data-open-merchant="${escapeAttr(group.name)}" aria-label="查看 ${escapeAttr(group.name)} 的订单">↗</button></div><button class="merchant-total" type="button" data-open-merchant="${escapeAttr(group.name)}">${escapeHtml(money(group.total))}</button><p class="interval">${group.averageDays === null ? '尚不足两笔，暂不能计算周期' : `平均 ${group.averageDays.toFixed(group.averageDays < 10 ? 1 : 0)} 天出现一笔`}</p><div class="merchant-breakdown"><span>收入 <b>${escapeHtml(money(group.income))}</b></span><span>支出 <b>${escapeHtml(money(group.expense))}</b></span><span>结余 <b>${escapeHtml(money(group.balance))}</b></span></div>${merchantBarsHtml(group)}<p class="analysis-note">金额图基于最近 ${group.amounts.length} 笔订单 · 最新 ${escapeHtml(formatTime(group.latest))}</p></article>`; }).join('')}</div>` : '<div class="empty"><strong>还没有已入账的商家记录</strong><p>确认第一笔手机凭证后，这里会自动按商家生成归纳板块。</p></div>'}</section>`;
    content.querySelectorAll('[data-open-merchant]').forEach((button) => {
      button.addEventListener('click', () => openMerchant(button.dataset.openMerchant));
      if (button.getAttribute('role') === 'button') button.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openMerchant(button.dataset.openMerchant); } });
    });
  }

  function closeDialog() { if (dialog.open) dialog.close(); dialogContent.innerHTML = ''; }
  function dialogShell(title, subtitle, contentHtml) {
    if (dialog.open) dialog.close();
    dialogContent.innerHTML = `<section class="dialog-shell"><header class="dialog-head"><div><h2 id="dialog-title">${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div><button type="button" class="dialog-close" data-close-dialog aria-label="关闭">×</button></header><div class="dialog-scroll">${contentHtml}</div></section>`;
    dialogContent.querySelector('[data-close-dialog]').addEventListener('click', closeDialog);
    dialog.showModal();
  }

  function openMerchant(name) {
    const group = makeMerchantGroups().find((item) => item.name === name);
    if (!group) return;
    const max = Math.max(...group.amounts, 1);
    dialogShell(`${name} · 订单构成`, `共 ${group.entries.length} 笔，累计 ${money(group.total)}${group.averageDays === null ? '' : ` · 平均周期 ${group.averageDays.toFixed(1)} 天`}`, `<div class="merchant-modal-graph">${group.amounts.map((amount, index) => `<div><span style="height:${Math.max(10, Math.round(amount / max * 100))}%"></span><small>${index + 1} · ${escapeHtml(money(amount))}</small></div>`).join('')}</div><div class="order-list">${[...group.entries].sort((a, b) => new Date(b.transaction.occurredAt).getTime() - new Date(a.transaction.occurredAt).getTime()).map(({ transaction }) => `<article class="order-line"><div><h3>${escapeHtml(transaction.note || transaction.description || '未填写备注')}</h3><p>账单实际时间 ${escapeHtml(formatTime(transaction.occurredAt))} · ${escapeHtml(transaction.category || '其他')}</p></div><strong>${escapeHtml(money(transaction.amountCents))}</strong></article>`).join('')}</div>`);
  }

  function openBillCard(transactionId) {
    const item = currentBills().find(({ transaction }) => transaction.id === transactionId);
    if (!item) return;
    const { transaction, record } = item;
    const image = record?.imageUrl ? `<figure class="bill-card-photo"><img src="${escapeAttr(`${BRIDGE}${record.imageUrl}`)}" alt="${escapeAttr(record.fileName || '账单原始凭证')}" /><figcaption>原始凭证 · ${escapeHtml(record.fileName || '本机保存')}</figcaption></figure>` : '<div class="bill-card-photo is-empty">这笔账单没有关联原始凭证图片。</div>';
    dialogShell(`${billMerchant(transaction)} · 明细备注`, `发送/入账时间：${formatTime(record?.createdAt || transaction.receiptCapturedAt || transaction.createdAt)} · 账单实际时间：${formatTime(transaction.occurredAt)}`, `<section class="bill-visual"><header class="bill-visual-header"><div><strong>${escapeHtml(billMerchant(transaction))}</strong><span>${escapeHtml(money(transaction.amountCents))} · ${transaction.type === 'INCOME' ? '收入' : '支出'}</span></div><span>本机账单卡</span></header>${image}<div class="bill-card-grid-layout"><div id="readonly-grid"></div><div class="lined-notes"><strong>备注</strong><span>${escapeHtml(transaction.note || '可在编辑里填写补充备注。')}</span></div></div></section>`);
    setGridRows(dialogContent.querySelector('#readonly-grid'), transaction.noteGrid, true);
  }

  function openRejected() {
    const rejected = records.filter((record) => record.status === 'REJECTED');
    dialogShell('已拒收记录', '拒收不会写入本机账本。这里保留本机处理痕迹，便于你确认没有误入账。', rejected.length ? `<div class="receipt-list">${rejected.map((record) => `<article class="receipt-row"><img class="receipt-image" src="${escapeAttr(`${BRIDGE}${record.imageUrl}`)}" alt="${escapeAttr(record.fileName)}" /><div><h3>${escapeHtml(record.merchant || '未填写商家')}</h3><p>拒收于 ${escapeHtml(formatTime(record.rejectedAt))}</p><div class="receipt-meta"><span class="badge rejected">已拒收</span></div></div><div class="receipt-actions"><button class="button subtle" type="button" data-open-rejected="${escapeAttr(record.id)}">查看</button></div></article>`).join('')}</div>` : '<div class="empty"><strong>没有已拒收记录</strong></div>');
    dialogContent.querySelectorAll('[data-open-rejected]').forEach((button) => button.addEventListener('click', () => openRecord(button.dataset.openRejected)));
  }

  function recordFormHtml(record, values, status) {
    const image = `${BRIDGE}${record.imageUrl}`;
    return `<form id="record-form" class="record-form"><div class="record-top"><img class="record-photo" src="${escapeAttr(image)}" alt="${escapeAttr(record.fileName || '凭证原图')}" /><div class="record-fields"><label>金额（元）<input data-field="amount" inputmode="decimal" value="${escapeAttr(values.amount)}" placeholder="例如 38.50" /></label><label>类型<select data-field="type"><option value="EXPENSE"${values.type === 'EXPENSE' ? ' selected' : ''}>支出</option><option value="INCOME"${values.type === 'INCOME' ? ' selected' : ''}>收入</option></select></label><label>商家 / 对方<input data-field="merchant" value="${escapeAttr(values.merchant)}" placeholder="例如：咖啡店、朋友" /></label><label>账户<select data-field="account">${[['WECHAT_PAY','微信支付'],['ALIPAY','支付宝'],['BANK','银行卡'],['CASH','现金'],['OTHER','其他账户']].map(([value,label]) => `<option value="${value}"${values.account === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label><label>分类<select data-field="category">${CATEGORIES.map((category) => `<option${values.category === category ? ' selected' : ''}>${category}</option>`).join('')}</select></label><label>账单实际时间 <input data-field="occurredAt" type="datetime-local" value="${escapeAttr(toLocalInput(values.occurredAt))}" /></label><label class="wide">发送时间（自动记录）<span class="field-static"><strong>${escapeHtml(formatTime(record.createdAt))}</strong><small>由手机把照片发送到这台电脑的时刻自动生成，不可覆盖为账单实际时间。</small></span></label><label class="wide note-block">补充备注<textarea data-field="note" placeholder="可写本次收支的说明、用途或提醒">${escapeHtml(values.note)}</textarea></label></div></div><div id="grid-editor"></div><footer class="record-form-footer"><span class="save-state">${escapeHtml(status)}</span><div class="receipt-actions"><a class="button subtle" href="${escapeAttr(`${image}?download=1`)}">下载原图</a><button class="button subtle" type="button" id="save-draft">保存修改</button>${record.status === 'PENDING_REVIEW' || recordNeedsReentry(record) ? `<button class="button gold" type="submit" id="confirm-record">${recordNeedsReentry(record) ? '重新写入账本' : '确认写入本机账本'}</button>` : ''}${record.status === 'PENDING_REVIEW' ? '<button class="button danger" type="button" id="reject-record">拒收并隐藏</button>' : ''}</div></footer></form>`;
  }

  function openRecord(id) {
    const record = records.find((item) => item.id === id);
    if (!record) return;
    const transaction = localTransaction(record);
    const values = { amount: transaction ? (transaction.amountCents / 100).toFixed(2) : record.amount || '', type: transaction?.type || record.type || 'EXPENSE', merchant: transaction?.merchant || record.merchant || '', account: transaction?.account || 'WECHAT_PAY', category: transaction?.category || '其他', occurredAt: transaction?.occurredAt || record.occurredAt || '', note: transaction?.note || record.note || '', noteGrid: transaction?.noteGrid || record.noteGrid || [] };
    const status = record.status === 'CONFIRMED_TO_DESKTOP' && !recordNeedsReentry(record) ? '已入账：你可以更新账单资料与明细卡。' : recordNeedsReentry(record) ? '账本记录已删除：凭证仍保留，核对后可重新写入。' : '尚未入账：可先保存修改，确认后才写入本机账本。';
    dialogShell(record.merchant || '核对凭证', status, recordFormHtml(record, values, status));
    const form = dialogContent.querySelector('#record-form');
    setGridRows(form.querySelector('#grid-editor'), values.noteGrid);
    form.addEventListener('submit', (event) => { event.preventDefault(); confirmRecord(record, form); });
    form.querySelector('#save-draft').addEventListener('click', () => saveRecord(record, form, false));
    form.querySelector('#reject-record')?.addEventListener('click', () => rejectRecord(record));
  }

  async function saveRecord(record, form, quiet = false) {
    const values = valuesFromForm(form);
    const saveButton = form.querySelector('#save-draft');
    try {
      saveButton.disabled = true; saveButton.textContent = '正在保存…';
      const payload = await api(`/v1/finance/mobile/receipts/${encodeURIComponent(record.id)}`, { method: 'PATCH', body: JSON.stringify(values) });
      records = records.map((item) => item.id === record.id ? { ...item, ...payload.record, imageUrl: item.imageUrl } : item);
      const state = getLedger();
      const tx = state.transactions.find((item) => item.id === ledgerId(record));
      if (tx) {
        const cents = Core.toCents(values.amount);
        if (cents !== null && cents > 0) tx.amountCents = cents;
        tx.type = values.type; tx.merchant = values.merchant.trim() || tx.merchant; tx.counterparty = values.merchant.trim() || tx.counterparty; tx.account = values.account; tx.accountId = values.account; tx.category = values.category; tx.note = values.note.trim(); tx.noteGrid = cleanGrid(values.noteGrid); if (values.occurredAt) tx.occurredAt = new Date(values.occurredAt).toISOString(); tx.updatedAt = new Date().toISOString(); tx.fingerprint = Core.fingerprint(tx); saveLedger(state);
      }
      render();
      if (!quiet) toast('已保存到本机收件箱与账本资料。', 'success');
      return values;
    } catch (error) { toast(error.message || '保存失败，请重试。', 'error'); throw error; }
    finally { if (saveButton.isConnected) { saveButton.disabled = false; saveButton.textContent = '保存修改'; } }
  }

  async function confirmRecord(record, form) {
    const button = form.querySelector('#confirm-record');
    try {
      button.disabled = true; button.textContent = '正在确认…';
      const values = await saveRecord(record, form, true);
      const latest = records.find((item) => item.id === record.id) || record;
      if (recordNeedsReentry(latest)) await api(`/v1/finance/mobile/receipts/${encodeURIComponent(record.id)}/reopen`, { method: 'POST' });
      const built = buildTransaction(latest, values);
      const state = built.state;
      const index = state.transactions.findIndex((item) => item.id === built.transaction.id);
      if (index >= 0) state.transactions[index] = { ...state.transactions[index], ...built.transaction, createdAt: state.transactions[index].createdAt };
      else state.transactions.push(built.transaction);
      saveLedger(state);
      await api(`/v1/finance/mobile/receipts/${encodeURIComponent(record.id)}/confirm`, { method: 'POST', body: JSON.stringify({ ledgerEntryId: built.transaction.id }) });
      await loadInbox({ silent: true });
      closeDialog(); toast('已写入本机账本，并已加入商家归纳。', 'success');
    } catch (error) {
      toast(error.message || '确认失败，请重试。', 'error');
      if (button?.isConnected) { button.disabled = false; button.textContent = '确认写入本机账本'; }
    }
  }

  async function rejectRecord(record) {
    try {
      await api(`/v1/finance/mobile/receipts/${encodeURIComponent(record.id)}/reject`, { method: 'POST' });
      await loadInbox({ silent: true }); closeDialog(); toast('已拒收并隐藏：不会写入本机账本。', 'success');
    } catch (error) { toast(error.message || '拒收失败，请重试。', 'error'); }
  }

  function openLedgerBill(transactionId) {
    const item = currentBills().find(({ transaction }) => transaction.id === transactionId);
    if (item?.record) openRecord(item.record.id);
    else openBillCard(transactionId);
  }

  async function createMobileLink() {
    const button = document.querySelector('#make-link');
    try {
      button.disabled = true; await ensureDesktopSession();
      const invitation = await api('/v1/finance/mobile/invite?version=v2&permanent=1');
      if (!invitation.mobileUrl) throw new Error('未检测到可供手机访问的局域网地址。请确认电脑和手机连接到同一 Wi‑Fi。');
      mobileLink = invitation.mobileUrl;
      try { sessionStorage.setItem(MOBILE_LINK_KEY, JSON.stringify({ url: mobileLink, expiresAt: invitation.expiresAt, permanent: invitation.permanent === true })); } catch { /* session storage may be unavailable in privacy mode */ }
      const input = document.querySelector('#mobile-link'); if (input) input.value = mobileLink;
      document.querySelector('[data-action="copy-link"]')?.removeAttribute('disabled');
      toast(invitation.permanent ? '手机链接已生成，长期有效（生成新链接会让旧链接失效）。' : `手机链接已生成，有效至 ${new Date(invitation.expiresAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}。`, 'success');
    } catch (error) { toast(error.message || '无法生成手机链接。', 'error'); } finally { button.disabled = false; }
  }
  async function copyMobileLink() {
    const input = document.querySelector('#mobile-link'); if (!input?.value) return;
    try { await navigator.clipboard.writeText(input.value); toast('手机拍照链接已复制。', 'success'); }
    catch { input.select(); document.execCommand('copy'); toast('手机拍照链接已复制。', 'success'); }
  }
  function readBlobAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('无法读取图片。'));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(blob);
    });
  }
  async function readImageDataUrl(file) {
    if (file.size <= 2.8 * 1024 * 1024) return { dataUrl: await readBlobAsDataUrl(file), mimeType: String(file.type || 'image/jpeg').toLowerCase() };
    try {
      const bitmap = await createImageBitmap(file);
      const max = 1800;
      const ratio = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close?.();
      const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('无法压缩图片。')), 'image/jpeg', 0.82));
      return { dataUrl: await readBlobAsDataUrl(blob), mimeType: 'image/jpeg' };
    } catch {
      return { dataUrl: await readBlobAsDataUrl(file), mimeType: String(file.type || 'image/jpeg').toLowerCase() };
    }
  }
  async function importLegacyImage(input) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const status = content.querySelector('#legacy-import-status');
    const button = content.querySelector('[data-action="legacy-import-image"]');
    try {
      button.disabled = true;
      if (status) status.textContent = '正在读取图片并进行本机识别…';
      const image = await readImageDataUrl(file);
      await ensureDesktopSession();
      const payload = await api('/v1/finance/mobile/desktop-import', { method: 'POST', body: JSON.stringify({ imageDataUrl: image.dataUrl, mimeType: image.mimeType, fileName: file.name }) });
      const firstId = payload.records?.[0]?.id;
      await loadInbox({ silent: true });
      changeRoute('inbox');
      if (firstId) openRecord(firstId);
      const ready = payload.ocr?.status === 'OCR_SUGGESTIONS_READY' || payload.ocr?.status === 'OCR_SUGGESTIONS_READY_WITH_MANUAL_REVIEW';
      toast(ready ? '图片已保存到待确认收件箱；请核对识别结果后再入账。' : '图片已保存到待确认收件箱；当前识别结果不足，请手动填写。', ready ? 'success' : '');
    } catch (error) {
      if (status) status.textContent = error.message || '图片导入失败，请重试。';
      toast(error.message || '图片导入失败，请重试。', 'error');
    } finally {
      if (button?.isConnected) button.disabled = false;
    }
  }
  function changeRoute(next) { route = next; history.replaceState(null, '', `#${next}`); render(); }

  document.querySelectorAll('[data-route]').forEach((button) => button.addEventListener('click', () => changeRoute(button.dataset.route)));
  document.querySelector('#refresh').addEventListener('click', () => loadInbox());
  document.querySelector('#make-link').addEventListener('click', createMobileLink);
  window.addEventListener('hashchange', () => { const target = location.hash.replace(/^#/u, ''); if (['inbox', 'bills', 'merchants', 'legacy'].includes(target)) { route = target; render(); } });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) closeDialog(); });
  const initialRoute = location.hash.replace(/^#/u, ''); if (['inbox', 'bills', 'merchants', 'legacy'].includes(initialRoute)) route = initialRoute;
  loadInbox();
})();
