(() => {
  'use strict';
  const Core = window.MEZipFinance;
  const BRIDGE = 'http://127.0.0.1:4325';
  const captureVersion = new URLSearchParams(window.location.search).get('captureVersion') === 'v2' ? 'v2' : 'v1';
  const FINANCE_KEY = 'mezip.finance.center.v2';
  const recordsElement = document.querySelector('#records');
  const metricsElement = document.querySelector('#metrics');
  const detailElement = document.querySelector('#detail');
  const statusElement = document.querySelector('#inbox-status');
  const inviteInput = document.querySelector('#mobile-url');
  const inviteState = document.querySelector('#invite-state');
  const categories = ['餐饮美食', '购物消费', '交通出行', '生活日用', '住房', '娱乐休闲', '医疗健康', '学习教育', '旅行', '数码', '宠物', '订阅服务', '人情往来', '其他'];
  let allRecords = [];
  let selectedRecordId = null;
  let eventSource = null;

  if (!Core) throw new Error('ME.zip Finance Core is unavailable.');

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const money = (cents) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 2 }).format((Number(cents) || 0) / 100);
  const ledgerId = (record) => `mobile-receipt-${record.id.replace(/^receipt-/u, '')}`;
  const toLocalDateTime = (value) => { const date = value ? new Date(value) : new Date(); return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 16) : new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
  const setStatus = (text, failure = false) => { statusElement.textContent = text; statusElement.style.color = failure ? '#ffb5c0' : ''; };

  async function api(path, init = {}) {
    const headers = { ...(init.headers || {}) };
    if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${BRIDGE}${path}`, { credentials: 'include', ...init, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error?.message || '本地财务收件箱请求失败。');
    return body;
  }

  async function ensureDesktopSession() {
    await api('/v1/finance/mobile/health');
    await api('/v1/finance/mobile/desktop-session');
  }

  function loadLedger() {
    try { return Core.hydrateState(JSON.parse(localStorage.getItem(FINANCE_KEY) || 'null') || Core.blankState()); } catch { return Core.blankState(); }
  }
  function saveLedger(state) { localStorage.setItem(FINANCE_KEY, JSON.stringify(state)); }
  function ledgerEntryExists(record) { return loadLedger().transactions.some((item) => item.id === ledgerId(record)); }
  function needsReentry(record) { return record.status === 'CONFIRMED_TO_DESKTOP' && !ledgerEntryExists(record); }
  function buildTransaction(record, fields) {
    const cents = Core.toCents(fields.amount);
    if (cents === null || cents <= 0) throw new Error('请填写大于 0 的金额，再确认入账。');
    const occurredAt = fields.occurredAt ? new Date(fields.occurredAt).toISOString() : new Date().toISOString();
    if (Number.isNaN(new Date(occurredAt).getTime())) throw new Error('发生时间无效，请重新选择。');
    const state = loadLedger();
    const id = ledgerId(record);
    const existing = state.transactions.find((item) => item.id === id);
    if (existing) return { state, transaction: existing, created: false };
    const transaction = {
      id, ownerId: state.ownerId, accountId: fields.account, account: fields.account, destinationAccount: '', type: fields.type === 'INCOME' ? 'INCOME' : 'EXPENSE', amountCents: cents, currency: 'CNY', merchant: fields.merchant.trim() || '手机拍照凭证', counterparty: fields.merchant.trim(), description: '手机拍照凭证', category: fields.category, classificationBasis: 'USER_CONFIRMATION', paymentMethod: '', occurredAt, timezone: state.settings?.timezone || 'Asia/Shanghai', status: 'POSTED', note: fields.note.trim(), noteGrid: Array.isArray(record.noteGrid) ? record.noteGrid : [], tags: '手机凭证', receiptName: record.fileName, receiptRecordId: record.id, receiptCapturedAt: record.createdAt, source: 'MOBILE_CAMERA', originalTransactionId: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    transaction.fingerprint = Core.fingerprint(transaction);
    state.transactions.push(transaction);
    return { state, transaction, created: true };
  }
  function formValues(record) {
    const card = detailElement.querySelector(`[data-record-id="${CSS.escape(record.id)}"]`);
    return { amount: card.querySelector('[data-field="amount"]').value, merchant: card.querySelector('[data-field="merchant"]').value, occurredAt: card.querySelector('[data-field="occurredAt"]').value, note: card.querySelector('[data-field="note"]').value, type: card.querySelector('[data-field="type"]').value, category: card.querySelector('[data-field="category"]').value, account: card.querySelector('[data-field="account"]').value };
  }
  function renderRecord(record) {
    const confirmed = record.status === 'CONFIRMED_TO_DESKTOP';
    const rejected = record.status === 'REJECTED';
    const missingLedgerEntry = needsReentry(record);
    const imageUrl = `${BRIDGE}${record.imageUrl}`;
    const stateText = rejected
      ? '已拒收：默认不再显示，也不会写入本机账本。'
      : missingLedgerEntry ? '账本记录已删除：照片仍保留在本机；点击后可重新写入账本。'
        : confirmed ? '✓ 已确认写入本机账本；原始照片已与这笔账目绑定。' : '照片已收到；请补全或核对后确认入账。';
    const action = rejected || (confirmed && !missingLedgerEntry) ? '' : `<button class="button ${missingLedgerEntry ? 'ghost' : ''}" data-confirm="${escapeHtml(record.id)}">${missingLedgerEntry ? '重新写入本机账本' : '确认写入本机账本'}</button>`;
    const clearAction = (!confirmed || missingLedgerEntry) ? `<button class="button ghost" data-clear="${escapeHtml(record.id)}">清除这条记录</button>` : '';
    const photoActions = confirmed ? `<a class="button ghost" href="${escapeHtml(imageUrl)}" target="_blank" rel="noopener">查看原图</a><a class="button ghost" href="${escapeHtml(`${imageUrl}?download=1`)}">下载凭证照片</a>` : '';
    return `<article class="receipt" data-record-id="${escapeHtml(record.id)}"><img src="${escapeHtml(imageUrl)}" alt="手机上传的付款凭证" /><div><h3>${escapeHtml(record.merchant || '未填写商家')}</h3><p class="meta">${escapeHtml(record.fileName)} · ${new Date(record.createdAt).toLocaleString('zh-CN')} · ${rejected ? '已拒收' : missingLedgerEntry ? '账本记录已删除' : confirmed ? '已确认到电脑账本' : '等待你确认'}</p><fieldset class="fields"${rejected ? ' disabled' : ''}><label>金额（元）<input data-field="amount" inputmode="decimal" value="${escapeHtml(record.amount)}" placeholder="例如 38.50" /></label><label>类型<select data-field="type"><option value="EXPENSE"${record.type === 'EXPENSE' ? ' selected' : ''}>支出</option><option value="INCOME"${record.type === 'INCOME' ? ' selected' : ''}>收入</option></select></label><label>商家 / 对方<input data-field="merchant" value="${escapeHtml(record.merchant)}" placeholder="例如：咖啡店" /></label><label>账户<select data-field="account"><option value="WECHAT_PAY">微信支付</option><option value="ALIPAY">支付宝</option><option value="BANK">银行卡</option><option value="CASH">现金</option><option value="OTHER">其他账户</option></select></label><label>分类<select data-field="category">${categories.map((category) => `<option${category === '其他' ? ' selected' : ''}>${category}</option>`).join('')}</select></label><label>发生时间<input data-field="occurredAt" type="datetime-local" value="${toLocalDateTime(record.occurredAt || record.createdAt)}" /></label><label class="wide">备注<textarea data-field="note" placeholder="可选：说明这笔收支的用途">${escapeHtml(record.note)}</textarea></label></fieldset><div class="receipt-actions"><span class="status ${confirmed && !missingLedgerEntry ? 'confirmed' : rejected ? 'error' : ''}" data-status>${stateText}</span>${photoActions}${action}${clearAction}</div></div></article>`;
  }
  function syncReceiptReferences(records) {
    const state = loadLedger();
    let changed = false;
    records.filter((record) => record.status === 'CONFIRMED_TO_DESKTOP').forEach((record) => {
      const transaction = state.transactions.find((item) => item.id === ledgerId(record));
      if (!transaction) return;
      const remoteNoteGrid = Array.isArray(record.noteGrid) ? record.noteGrid : [];
      if (transaction.receiptRecordId !== record.id || transaction.receiptName !== record.fileName || transaction.receiptCapturedAt !== record.createdAt || JSON.stringify(transaction.noteGrid || []) !== JSON.stringify(remoteNoteGrid)) {
        transaction.receiptRecordId = record.id;
        transaction.receiptName = record.fileName;
        transaction.receiptCapturedAt = record.createdAt;
        transaction.noteGrid = remoteNoteGrid;
        transaction.updatedAt = new Date().toISOString();
        changed = true;
      }
    });
    if (changed) saveLedger(state);
  }
  function filteredRecords() {
    const state = document.querySelector('#record-status')?.value || 'ALL';
    const query = (document.querySelector('#record-search')?.value || '').trim().toLowerCase();
    return allRecords.filter((record) => {
      const matchesState = state === 'ALL' ? record.status !== 'REJECTED' : state === 'PENDING_REVIEW' ? record.status === 'PENDING_REVIEW' || needsReentry(record) : state === 'CONFIRMED_TO_DESKTOP' ? record.status === 'CONFIRMED_TO_DESKTOP' && !needsReentry(record) : record.status === state;
      const detailValues = Array.isArray(record.noteGrid) ? record.noteGrid.flatMap((row) => Object.values(row || {})) : [];
      return matchesState && (!query || [record.merchant, record.note, record.fileName, ...detailValues].filter((value) => value != null).join(' ').toLowerCase().includes(query));
    });
  }
  function renderMetrics(records) {
    const visible = records.filter((record) => record.status !== 'REJECTED');
    const pending = visible.filter((record) => record.status === 'PENDING_REVIEW' || needsReentry(record));
    const confirmed = records.filter((record) => record.status === 'CONFIRMED_TO_DESKTOP' && !needsReentry(record));
    const rejected = records.filter((record) => record.status === 'REJECTED');
    metricsElement.innerHTML = `<article class="metric"><span>当前凭证</span><strong>${visible.length}</strong></article><article class="metric pending"><span>待确认</span><strong>${pending.length}</strong></article><article class="metric confirmed"><span>已入账</span><strong>${confirmed.length}</strong></article><article class="metric rejected"><span>已拒收</span><strong>${rejected.length}</strong></article>`;
  }
  function renderTable() {
    const records = filteredRecords();
    if (!records.length) { recordsElement.innerHTML = '<div class="empty"><strong>没有匹配的凭证</strong><p>手机发送照片后会自动出现在这里；也可调整筛选条件。</p></div>'; return; }
    recordsElement.innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>状态</th><th>时间</th><th>凭证</th><th>类型</th><th>金额</th><th>商家 / 对方</th><th>账户</th><th>分类</th><th>备注</th><th>操作</th></tr></thead><tbody>${records.map((record) => { const confirmed = record.status === 'CONFIRMED_TO_DESKTOP'; const rejected = record.status === 'REJECTED'; const missingLedgerEntry = needsReentry(record); const canClear = !confirmed || missingLedgerEntry; const cents = Core.toCents(record.amount); const stateClass = rejected ? 'rejected' : confirmed && !missingLedgerEntry ? 'confirmed' : 'pending'; const stateText = rejected ? '已拒收' : missingLedgerEntry ? '待重新入账' : confirmed ? '已入账' : '待确认'; return `<tr data-open="${escapeHtml(record.id)}" class="${record.id === selectedRecordId ? 'active' : ''}"><td><span class="tag ${stateClass}">${stateText}</span></td><td>${escapeHtml(new Date(record.createdAt).toLocaleString('zh-CN'))}</td><td><img class="thumb" src="${escapeHtml(`${BRIDGE}${record.imageUrl}`)}" alt="凭证缩略图" /></td><td>${record.type === 'INCOME' ? '收入' : '支出'}</td><td class="money">${cents ? escapeHtml(money(cents)) : '—'}</td><td>${escapeHtml(record.merchant || '待填写')}</td><td>${confirmed && !missingLedgerEntry ? '已确认账户' : '待选择'}</td><td>${confirmed && !missingLedgerEntry ? '已确认分类' : '待分类'}</td><td>${escapeHtml(record.note || '—')}</td><td><button class="button ghost" data-open="${escapeHtml(record.id)}">${rejected || (confirmed && !missingLedgerEntry) ? '查看' : '处理'}</button>${canClear ? `<button class="button ghost" data-clear="${escapeHtml(record.id)}">清除</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
    recordsElement.querySelectorAll('[data-open]').forEach((element) => element.addEventListener('click', () => { selectedRecordId = element.dataset.open; renderTable(); renderDetail(); }));
    recordsElement.querySelectorAll('[data-clear]').forEach((element) => element.addEventListener('click', (event) => { event.stopPropagation(); const record = allRecords.find((item) => item.id === element.dataset.clear); if (record) clearRecord(record); }));
  }
  function renderDetail() {
    const selected = allRecords.find((record) => record.id === selectedRecordId);
    if (!selected) { detailElement.innerHTML = ''; return; }
    const pending = selected.status === 'PENDING_REVIEW';
    const missingLedgerEntry = needsReentry(selected);
    const heading = selected.status === 'REJECTED' ? '已拒收记录' : missingLedgerEntry ? '账本记录已删除' : selected.status === 'CONFIRMED_TO_DESKTOP' ? '已确认记录' : '确认入账';
    detailElement.innerHTML = `<section class="panel"><div class="panel-head"><div><h2>${heading}</h2><p class="muted">可修改金额、商家、账户、分类和备注；写入电脑账本前不会自动记账。</p></div><div style="display:flex;gap:9px;flex-wrap:wrap;justify-content:flex-end">${pending ? '<button id="reject-record" class="button ghost">拒收并隐藏</button>' : ''}<button id="close-detail" class="button ghost">收起</button></div></div>${renderRecord(selected)}</section>`;
    detailElement.querySelector('[data-confirm]')?.addEventListener('click', () => confirmRecord(selected));
    detailElement.querySelector('[data-clear]')?.addEventListener('click', () => clearRecord(selected));
    detailElement.querySelector('#reject-record')?.addEventListener('click', () => rejectRecord(selected));
    detailElement.querySelector('#close-detail')?.addEventListener('click', () => { selectedRecordId = null; renderTable(); renderDetail(); });
  }
  function render(records) {
    allRecords = records;
    if (!allRecords.some((record) => record.id === selectedRecordId)) selectedRecordId = allRecords.find((record) => record.status === 'PENDING_REVIEW')?.id || allRecords.find((record) => record.status !== 'REJECTED')?.id || null;
    renderMetrics(allRecords); renderTable(); renderDetail();
  }
  async function loadInbox() {
    try {
      setStatus('连接本地收件箱…');
      await ensureDesktopSession();
      const body = await api('/v1/finance/mobile/receipts');
      syncReceiptReferences(body.records);
      render(body.records);
      if (!eventSource) startRealtimeStream();
      setStatus(`实时监听 · ${body.records.length} 条本地凭证`);
    } catch (error) {
      recordsElement.innerHTML = `<div class="empty"><strong>本地收件箱未启动</strong><p>${escapeHtml(error.message || '请启动本机服务后重试。')}</p><p>运行项目中的 <code>scripts/start-finance-mobile-inbox.ps1</code> 后，再刷新这里。</p></div>`;
      metricsElement.innerHTML = '';
      detailElement.innerHTML = '';
      setStatus('未连接', true);
    }
  }
  async function confirmRecord(record) {
    const button = detailElement.querySelector(`[data-record-id="${CSS.escape(record.id)}"] [data-confirm]`);
    const status = detailElement.querySelector(`[data-record-id="${CSS.escape(record.id)}"] [data-status]`);
    const before = localStorage.getItem(FINANCE_KEY);
    try {
      button.disabled = true; button.textContent = '正在确认…';
      const restoringDeletedEntry = needsReentry(record);
      if (restoringDeletedEntry) await api(`/v1/finance/mobile/receipts/${encodeURIComponent(record.id)}/reopen`, { method: 'POST' });
      const result = buildTransaction(record, formValues(record));
      if (result.created) saveLedger(result.state);
      await api(`/v1/finance/mobile/receipts/${encodeURIComponent(record.id)}/confirm`, { method: 'POST', body: JSON.stringify({ ledgerEntryId: result.transaction.id }) });
      status.textContent = '✓ 已确认写入本机账本。'; status.className = 'status confirmed'; button.textContent = '补写到本机账本';
      await loadInbox();
    } catch (error) {
      if (before !== null) localStorage.setItem(FINANCE_KEY, before);
      else localStorage.removeItem(FINANCE_KEY);
      status.textContent = error.message || '确认失败，请重试。'; status.className = 'status error';
      button.textContent = '确认写入本机账本';
    } finally { button.disabled = false; }
  }
  async function rejectRecord(record) {
    if (!window.confirm('拒收后，这张凭证不会写入本机账本，并会从默认列表隐藏。仍可通过“已拒收”筛选查看。确认拒收？')) return;
    const button = detailElement.querySelector('#reject-record');
    try {
      button.disabled = true; button.textContent = '正在拒收…';
      await api(`/v1/finance/mobile/receipts/${encodeURIComponent(record.id)}/reject`, { method: 'POST' });
      selectedRecordId = null;
      await loadInbox();
      setStatus('已拒收：未写入本机账本，默认列表已隐藏该凭证。');
    } catch (error) {
      setStatus(error.message || '拒收失败，请重试。', true);
      button.disabled = false; button.textContent = '拒收并隐藏';
    }
  }
  async function clearRecord(record) {
    if (!window.confirm('确定清除这一条收件箱记录吗？它会从实时接收列表中移除；若没有其他记录使用同一张照片，原图也会从本机收件箱删除。此操作不会删除任何仍保留在账本中的交易。')) return;
    const button = document.querySelector(`[data-clear="${CSS.escape(record.id)}"]`);
    try {
      if (button) { button.disabled = true; button.textContent = '正在清除…'; }
      if (needsReentry(record)) await api(`/v1/finance/mobile/receipts/${encodeURIComponent(record.id)}/reopen`, { method: 'POST' });
      await api(`/v1/finance/mobile/receipts/${encodeURIComponent(record.id)}/remove`, { method: 'POST' });
      selectedRecordId = null;
      await loadInbox();
      setStatus('已清除 1 条本地凭证记录；实时接收计数已同步减少。');
    } catch (error) {
      setStatus(error.message || '清除失败，请重试。', true);
      if (button) { button.disabled = false; button.textContent = '清除这条记录'; }
    }
  }
  async function createMobileLink() {
    try {
      document.querySelector('#make-link').disabled = true;
      await ensureDesktopSession();
      const invite = await api(`/v1/finance/mobile/invite?version=${captureVersion}`);
      if (!invite.mobileUrl) throw new Error('未检测到可用的局域网地址。请确认电脑已连接 Wi‑Fi 或网线。');
      inviteInput.value = invite.mobileUrl;
      document.querySelector('#copy-link').disabled = false;
      inviteState.textContent = `链接将在 ${new Date(invite.expiresAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 前用于首次配对。生成新链接会让旧手机配对失效。`;
    } catch (error) { inviteState.textContent = error.message || '无法生成链接。'; inviteState.style.color = '#ffb5c0'; }
    finally { document.querySelector('#make-link').disabled = false; }
  }
  function startRealtimeStream() {
    eventSource = new EventSource(`${BRIDGE}/v1/finance/mobile/events`, { withCredentials: true });
    eventSource.addEventListener('inbox', () => loadInbox());
    eventSource.onerror = () => { eventSource?.close(); eventSource = null; setStatus('实时连接中断，正在使用手动刷新。', true); };
  }
  document.querySelector('#make-link').addEventListener('click', createMobileLink);
  document.querySelector('#refresh').addEventListener('click', loadInbox);
  document.querySelector('#record-status').addEventListener('change', renderTable);
  document.querySelector('#record-search').addEventListener('input', renderTable);
  document.querySelector('#clear-filter').addEventListener('click', () => { document.querySelector('#record-status').value = 'ALL'; document.querySelector('#record-search').value = ''; renderTable(); });
  document.querySelector('#copy-link').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(inviteInput.value); inviteState.textContent = '手机拍照链接已复制。请在手机浏览器打开。'; } catch { inviteInput.select(); document.execCommand('copy'); inviteState.textContent = '手机拍照链接已复制。请在手机浏览器打开。'; }
  });
  loadInbox();
})();
