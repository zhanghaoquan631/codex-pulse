(() => {
  'use strict';

  const iframe = document.querySelector('#v11-content');
  const STORAGE_KEY = 'mezip.finance.receipt.v11.note-grid';
  const FINANCE_KEY = 'mezip.finance.center.v2';
  const BRIDGE = 'http://127.0.0.1:4325';
  const FIELDS = ['sku', 'nameSpec', 'unit', 'quantity', 'unitPrice', 'amount', 'remark'];
  const HEADERS = ['货号', '名称及规格', '单位', '数量', '单价', '金额', '备注'];
  const bridgeFetch = (...args) => {
    const frameFetch = iframe?.contentWindow?.fetch;
    return typeof frameFetch === 'function' ? frameFetch.call(iframe.contentWindow, ...args) : fetch(...args);
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const readStore = () => {
    try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); return value && typeof value === 'object' ? value : {}; } catch { return {}; }
  };
  const writeStore = (store) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* private mode may deny local storage */ } };
  const cleanRows = (rows) => (Array.isArray(rows) ? rows : []).map((row) => Object.fromEntries(FIELDS.map((field) => [field, String(row?.[field] || '').trim().slice(0, field === 'remark' ? 220 : 120)]))).filter((row) => Object.values(row).some(Boolean));
  const defaultRows = (rows) => { const safe = cleanRows(rows); return safe.length ? safe : Array.from({ length: 5 }, () => Object.fromEntries(FIELDS.map((field) => [field, '']))); };
  const ledgerId = (recordId) => `mobile-receipt-${String(recordId).replace(/^receipt-/u, '')}`;

  function updateLedgerNote(recordId, note, rows) {
    try {
      const state = JSON.parse(localStorage.getItem(FINANCE_KEY) || 'null');
      if (!state || !Array.isArray(state.transactions)) return;
      const transaction = state.transactions.find((item) => item.id === ledgerId(recordId));
      if (!transaction) return;
      transaction.note = note;
      transaction.noteGrid = rows;
      transaction.updatedAt = new Date().toISOString();
      localStorage.setItem(FINANCE_KEY, JSON.stringify(state));
    } catch { /* keep the local grid usable when storage is unavailable */ }
  }

  async function remoteRecord(recordId) {
    try {
      const response = await bridgeFetch(`${BRIDGE}/v1/finance/mobile/receipts`, { credentials: 'include' });
      if (!response.ok) return null;
      const body = await response.json();
      return Array.isArray(body.records) ? body.records.find((record) => record.id === recordId) || null : null;
    } catch { return null; }
  }

  function financeCore() { return iframe?.contentWindow?.MEZipFinance || window.MEZipFinance || null; }
  function updateLedgerTransaction(recordId, fields, rows) {
    try {
      const state = JSON.parse(localStorage.getItem(FINANCE_KEY) || 'null');
      if (!state || !Array.isArray(state.transactions)) return;
      const transaction = state.transactions.find((item) => item.id === ledgerId(recordId));
      if (!transaction) return;
      const core = financeCore();
      const amountCents = core?.toCents?.(fields.amount);
      if (Number.isInteger(amountCents) && amountCents > 0) transaction.amountCents = amountCents;
      transaction.type = fields.type === 'INCOME' ? 'INCOME' : 'EXPENSE';
      transaction.merchant = fields.merchant || '手机拍照凭证';
      transaction.counterparty = fields.merchant;
      transaction.occurredAt = fields.occurredAt;
      transaction.note = fields.note;
      transaction.noteGrid = rows;
      transaction.updatedAt = new Date().toISOString();
      localStorage.setItem(FINANCE_KEY, JSON.stringify(state));
    } catch { /* keep the bridge update authoritative when local storage is unavailable */ }
  }

  async function saveEditedRecord(key, card, section, button, status) {
    const fields = Object.fromEntries(['amount', 'merchant', 'occurredAt', 'note', 'type'].map((field) => [field, String(card.querySelector(`[data-field="${field}"]`)?.value || '').trim()]));
    const core = financeCore();
    const amountCents = core?.toCents?.(fields.amount);
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('金额必须是大于 0 的数字。');
    const occurredAt = fields.occurredAt ? new Date(fields.occurredAt).toISOString() : new Date().toISOString();
    if (Number.isNaN(new Date(occurredAt).getTime())) throw new Error('发生时间无效，请重新选择。');
    const rows = rowsFromSection(section);
    const response = await bridgeFetch(`${BRIDGE}/v1/finance/mobile/receipts/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: fields.amount, merchant: fields.merchant, type: fields.type, occurredAt, note: fields.note, noteGrid: rows }),
    });
    if (!response.ok) throw new Error(`保存失败（HTTP ${response.status}）`);
    updateLedgerTransaction(key, { ...fields, occurredAt }, rows);
    if (status) status.textContent = '已保存修改，并同步到 V2 中心';
    card.dataset.v11EditMode = 'false';
    button.textContent = '编辑账单';
    button.disabled = false;
  }

  function ensureEditActions(detail) {
    const card = detail.querySelector('.receipt[data-record-id]');
    const actions = card?.querySelector('.receipt-actions');
    const fields = card?.querySelector('.fields');
    if (!card || !actions || !fields || card.querySelector('[data-v11-edit]')) return;
    const status = actions.querySelector('[data-status]');
    const button = card.ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'button ghost';
    button.dataset.v11Edit = 'true';
    button.textContent = '编辑账单';
    button.addEventListener('click', async () => {
      if (card.dataset.v11EditMode === 'true') {
        button.disabled = true;
        button.textContent = '保存中…';
        try { await saveEditedRecord(card.dataset.recordId, card, detail.querySelector('.v11-note-grid'), button, status); }
        catch (error) { if (status) status.textContent = error.message || '保存失败，请重试。'; button.disabled = false; button.textContent = '保存修改'; }
        return;
      }
      card.dataset.v11EditMode = 'true';
      fields.disabled = false;
      button.textContent = '保存修改';
      card.querySelector('[data-field="amount"]')?.focus();
      if (status) status.textContent = '编辑模式：修改后点击“保存修改”';
    });
    actions.append(button);
  }

  function frameDocument() { return iframe?.contentDocument || null; }
  function selectedKey(detail) { return detail?.querySelector('[data-record-id]')?.dataset.recordId || ''; }
  function rowsFromSection(section) {
    return cleanRows([...section.querySelectorAll('[data-v11-grid-row]')].map((row) => Object.fromEntries(FIELDS.map((field) => [field, row.querySelector(`[data-v11-grid-field="${field}"]`)?.value || '']))));
  }
  function remarksFromRows(rows) {
    return rows.map((row) => row.remark).filter(Boolean).join('；').slice(0, 600);
  }
  const persistTimers = new Map();
  async function syncBridge(key, section, noteField) {
    const rows = rowsFromSection(section);
    const note = String(noteField?.value || remarksFromRows(rows)).trim().slice(0, 600);
    const syncStatus = section.querySelector('.v11-grid-sync-status');
    try {
      const response = await bridgeFetch(`${BRIDGE}/v1/finance/mobile/receipts/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        credentials: 'include',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note, noteGrid: rows }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (syncStatus) syncStatus.textContent = '已同步到 V2 中心';
    } catch {
      if (syncStatus) syncStatus.textContent = '已保存本机；V2 中心等待连接';
    }
  }
  function queuePersist(key, section, noteField) {
    if (!key || !section) return;
    const rows = rowsFromSection(section);
    const note = String(noteField?.value || remarksFromRows(rows)).trim().slice(0, 600);
    const store = readStore(); store[key] = rows; writeStore(store);
    updateLedgerNote(key, note, rows);
    const syncStatus = section.querySelector('.v11-grid-sync-status');
    if (syncStatus) syncStatus.textContent = '同步到 V2 中心…';
    clearTimeout(persistTimers.get(key));
    persistTimers.set(key, setTimeout(async () => {
      persistTimers.delete(key);
      await syncBridge(key, section, noteField);
    }, 250));
  }

  function renderRows(section, rows, key, noteField) {
    const body = section.querySelector('tbody');
    body.innerHTML = '';
    const addRow = (row = {}) => {
      const tr = section.ownerDocument.createElement('tr');
      tr.dataset.v11GridRow = 'true';
      tr.innerHTML = FIELDS.map((field) => `<td><input data-v11-grid-field="${field}" value="${escapeHtml(row[field] || '')}" aria-label="${HEADERS[FIELDS.indexOf(field)]}" /></td>`).join('') + '<td><button type="button" class="v11-grid-delete" aria-label="删除这一行">×</button></td>';
      tr.querySelectorAll('input').forEach((input) => input.addEventListener('input', () => {
        if (input.dataset.v11GridField === 'remark' && noteField) noteField.value = remarksFromRows(rowsFromSection(section));
        queuePersist(key, section, noteField);
      }));
      tr.querySelector('.v11-grid-delete').addEventListener('click', () => { if (body.children.length > 1) tr.remove(); else tr.querySelectorAll('input').forEach((input) => { input.value = ''; }); queuePersist(key, section, noteField); });
      body.append(tr);
    };
    defaultRows(rows).forEach(addRow);
    section.querySelector('.v11-grid-add').addEventListener('click', () => { addRow(); queuePersist(key, section, noteField); });
  }

  function ensureGrid(detail) {
    const key = selectedKey(detail);
    if (!key) return;
    let section = detail.querySelector('.v11-note-grid');
    if (!section) {
      section = detail.ownerDocument.createElement('section');
      section.className = 'v11-note-grid';
      section.dataset.v11Key = key;
      section.innerHTML = `<div class="v11-grid-heading"><div><strong>明细备注</strong><span>货号 · 名称及规格 · 数量 · 单价 · 金额</span><small class="v11-grid-sync-status">本机已保存；输入后自动同步 V2 中心</small></div><button type="button" class="v11-grid-add" aria-label="新增一行">＋</button></div><div class="v11-grid-scroll"><table><thead><tr>${HEADERS.map((header) => `<th>${header}</th>`).join('')}<th aria-label="删除">−</th></tr></thead><tbody></tbody></table></div><p>每一格都可以继续填写；点击「＋」增加下一行。空行不会改变原账单流程。</p>`;
      detail.querySelector('.fields')?.after(section);
      const store = readStore();
      const noteField = detail.querySelector('[data-field="note"]');
      const storedRows = cleanRows(store[key] || []);
      const initialRows = storedRows.length ? storedRows : defaultRows([]);
      if (noteField?.value.trim()) initialRows[0].remark = noteField.value.trim();
      renderRows(section, initialRows, key, noteField);
      noteField?.addEventListener('input', () => {
        const firstRemark = section.querySelector('[data-v11-grid-row]:first-child [data-v11-grid-field="remark"]');
        if (firstRemark) firstRemark.value = noteField.value;
        queuePersist(key, section, noteField);
      });
      if (!section.dataset.v11SyncEvents) {
        section.dataset.v11SyncEvents = 'true';
        section.addEventListener('focusout', () => {
          clearTimeout(persistTimers.get(key));
          persistTimers.delete(key);
          void syncBridge(key, section, noteField);
        });
      }
      if (!storedRows.length) {
        void remoteRecord(key).then((record) => {
          if (!record?.noteGrid?.length || !section.isConnected || section.dataset.v11Key !== key || readStore()[key]?.length) return;
          renderRows(section, record.noteGrid, key, noteField);
          if (noteField && !noteField.value.trim() && record.note) {
            noteField.value = record.note;
          }
        });
      }
      ensureEditActions(detail);
      return;
    }
    if (section.dataset.v11Key !== key) { section.remove(); ensureGrid(detail); }
    ensureEditActions(detail);
  }

  function install() {
    const doc = frameDocument();
    if (!doc || doc.documentElement.dataset.v11NoteGridInstalled === 'true') return;
    doc.documentElement.dataset.v11NoteGridInstalled = 'true';
    const style = doc.createElement('style');
    style.textContent = `.v11-note-grid{margin-top:15px;padding:14px;border:1px solid #6b7c92;border-radius:13px;background:#3e4c60}.v11-grid-heading{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:9px}.v11-grid-heading strong,.v11-grid-heading span,.v11-grid-sync-status{display:block}.v11-grid-heading strong{color:#e7eef5;font-size:14px}.v11-grid-heading span{margin-top:3px;color:#b8c8d9;font-size:10px}.v11-grid-sync-status{margin-top:4px;color:#c8d6e5;font-size:10px}.v11-grid-add{width:32px;height:32px;border:1px solid #8092aa;border-radius:8px;color:#edf3fa;background:#4a5b70;font-size:18px;cursor:pointer}.v11-grid-scroll{overflow:auto}.v11-note-grid table{width:100%;min-width:760px;border-collapse:collapse;background:#3e4c60}.v11-note-grid th,.v11-note-grid td{border:1px solid #6b7c92;padding:0}.v11-note-grid th{padding:8px 6px;color:#d8e4ef;background:#3a485d;font-size:12px}.v11-note-grid td input{width:100%;min-width:76px;padding:9px 7px;border:0;border-radius:0;color:#f2f5f9;background:transparent}.v11-note-grid td:nth-child(2) input,.v11-note-grid td:nth-child(7) input{min-width:145px}.v11-grid-delete{width:100%;height:100%;min-height:36px;border:0;color:#d1dceb;background:transparent;cursor:pointer}.v11-grid-delete:hover{color:#ffbdc7;background:#522735}.v11-note-grid p{margin:9px 0 0;color:#b8c8d9;font-size:11px}@media(max-width:620px){.v11-note-grid{padding:10px}.v11-grid-scroll{margin-right:-3px}}`;
    doc.head.append(style);
    const detail = doc.querySelector('#detail');
    if (!detail) return;
    const observer = new MutationObserver(() => ensureGrid(detail));
    observer.observe(detail, { childList: true, subtree: true });
    ensureGrid(detail);
  }

  iframe?.addEventListener('load', install);
  if (iframe?.contentDocument?.readyState === 'complete') install();
})();
