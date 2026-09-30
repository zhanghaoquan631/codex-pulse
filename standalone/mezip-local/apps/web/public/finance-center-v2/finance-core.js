/* ME.zip Finance Center V2 - local, private-by-default provider core. */
(function attachFinanceCore(global) {
  'use strict';

  const PROVIDER_STATUS = Object.freeze({
    NOT_SUPPORTED: 'NOT_SUPPORTED',
    IMPORT_ONLY: 'IMPORT_ONLY',
    NOT_CONNECTED: 'NOT_CONNECTED',
    CONNECTING: 'CONNECTING',
    CONNECTED: 'CONNECTED',
    SYNCING: 'SYNCING',
    AUTH_REQUIRED: 'AUTH_REQUIRED',
    ERROR: 'ERROR',
  });

  const SOURCE = Object.freeze({
    ALIPAY: 'ALIPAY', WECHAT: 'WECHAT', BANK: 'BANK', GENERIC: 'GENERIC', UNKNOWN: 'UNKNOWN', MANUAL: 'MANUAL',
  });
  const TYPE = Object.freeze({
    EXPENSE: 'EXPENSE', INCOME: 'INCOME', TRANSFER: 'TRANSFER', REFUND: 'REFUND', UNKNOWN: 'UNKNOWN',
  });
  const REVIEW = Object.freeze({
    POSSIBLE_TRANSFER: 'POSSIBLE_TRANSFER', POSSIBLE_REFUND: 'POSSIBLE_REFUND', UNKNOWN_CATEGORY: 'UNKNOWN_CATEGORY',
    DUPLICATE_CONFLICT: 'DUPLICATE_CONFLICT', INVALID_AMOUNT: 'INVALID_AMOUNT', INVALID_DATE: 'INVALID_DATE',
  });
  const IMPORT_STATUS = Object.freeze({
    UPLOADED: 'UPLOADED', PARSING: 'PARSING', PREVIEW: 'PREVIEW', REVIEW: 'REVIEW', IMPORTING: 'IMPORTING', COMPLETE: 'COMPLETE', PARTIAL: 'PARTIAL', ERROR: 'ERROR', ROLLED_BACK: 'ROLLED_BACK',
  });
  const ACCOUNT_BY_SOURCE = Object.freeze({ ALIPAY: 'ALIPAY', WECHAT: 'WECHAT_PAY', BANK: 'BANK', GENERIC: 'OTHER' });
  const FILE_SOURCE = Object.freeze({ ALIPAY: 'ALIPAY_FILE', WECHAT: 'WECHAT_FILE', BANK: 'BANK_FILE', GENERIC: 'GENERIC_FILE', MANUAL: 'MANUAL' });

  function now() { return new Date().toISOString(); }
  function newId(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
  function ownerId(owner) { return String(owner || 'local-finance-owner'); }
  function normalized(value) { return String(value == null ? '' : value).trim().toLowerCase().replace(/[\s_\-（）()【】\[\]：:]/gu, ''); }
  function text(value) { return String(value == null ? '' : value).trim(); }

  function toCents(value) {
    const raw = String(value == null ? '' : value).trim().replace(/[￥¥,\s]/gu, '');
    const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/u.exec(raw);
    if (!match) return null;
    const negative = match[1] === '-';
    const whole = Number(match[2]);
    if (!Number.isSafeInteger(whole)) return null;
    const fraction = `${match[3] || ''}00`.slice(0, 2);
    const cents = whole * 100 + Number(fraction);
    return negative ? -cents : cents;
  }

  function safeDate(value) {
    const source = text(value).replace(/年|\//gu, '-').replace(/月/gu, '-').replace(/日/gu, '');
    if (!source) return null;
    const candidate = new Date(source.includes('T') ? source : source.replace(/\s+/gu, 'T'));
    return Number.isNaN(candidate.getTime()) ? null : candidate.toISOString();
  }

  function fnv1a(value) {
    let hash = 0x811c9dc5;
    for (const char of String(value)) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }

  function fingerprint(transaction) {
    return fnv1a([
      transaction.source, transaction.externalTransactionId || '', transaction.occurredAt || '', transaction.amountCents || 0,
      transaction.merchant || '', transaction.counterparty || '', transaction.description || '',
    ].map(normalized).join('|'));
  }

  function dedupKey(transaction) {
    return transaction.externalTransactionId ? `external:${normalized(transaction.source)}:${normalized(transaction.externalTransactionId)}` : `fingerprint:${transaction.fingerprint || fingerprint(transaction)}`;
  }

  function parseDelimited(textValue) {
    const input = String(textValue || '').replace(/^\uFEFF/u, '');
    const firstLine = input.split(/\r?\n/u).find((line) => line.trim()) || '';
    const delimiter = firstLine.split('\t').length > firstLine.split(',').length ? '\t' : ',';
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let index = 0; index < input.length; index += 1) {
      const char = input[index];
      const next = input[index + 1];
      if (char === '"' && quoted && next === '"') { field += '"'; index += 1; continue; }
      if (char === '"') { quoted = !quoted; continue; }
      if (char === delimiter && !quoted) { row.push(field); field = ''; continue; }
      if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && next === '\n') index += 1;
        row.push(field); field = '';
        if (row.some((cell) => text(cell))) rows.push(row);
        row = [];
        continue;
      }
      field += char;
    }
    if (field || row.length) { row.push(field); if (row.some((cell) => text(cell))) rows.push(row); }
    return rows;
  }

  function headerIndex(headers, aliases) {
    const normalizedHeaders = headers.map(normalized);
    return normalizedHeaders.findIndex((header) => aliases.some((alias) => alias.test(header)));
  }

  function at(row, index) { return index >= 0 ? text(row[index]) : ''; }
  function includesAny(value, patterns) { return patterns.some((pattern) => pattern.test(String(value || ''))); }

  function detectSource({ fileName = '', headers = [] }) {
    const all = `${fileName}|${headers.join('|')}`.toLowerCase();
    if (/支付宝|alipay|支付宝交易号|商家订单号/u.test(all)) return SOURCE.ALIPAY;
    if (/微信|wechat|微信支付|交易单号|商户单号/u.test(all)) return SOURCE.WECHAT;
    if (/银行卡|银行|bank|借方|贷方|流水号|账户余额|交易渠道/u.test(all)) return SOURCE.BANK;
    if (headers.length > 0 && /金额|amount|收入|支出|date|日期/u.test(all)) return SOURCE.GENERIC;
    return SOURCE.UNKNOWN;
  }

  function classificationFor({ merchant = '', description = '', rules = [] }) {
    const merchantKey = normalized(merchant);
    const personal = rules.find((rule) => normalized(rule.merchant) === merchantKey && text(rule.category));
    if (personal) return { category: personal.category, basis: 'USER_RULE' };
    const source = `${merchant} ${description}`.toLowerCase();
    const patterns = [
      [/麦当劳|肯德基|星巴克|瑞幸|外卖|美团|饿了么|盒马/u, '餐饮美食', 'MERCHANT_RULE'],
      [/滴滴|地铁|公交|高铁|铁路|航空|加油/u, '交通出行', 'KEYWORD_RULE'],
      [/京东|淘宝|天猫|拼多多|唯品会/u, '购物消费', 'KEYWORD_RULE'],
      [/chatgpt|claude|icloud|腾讯视频|网易云|spotify|netflix/u, '订阅服务', 'KEYWORD_RULE'],
      [/医院|药店|诊所|医保/u, '医疗健康', 'KEYWORD_RULE'],
      [/学费|书店|课程|培训/u, '学习教育', 'KEYWORD_RULE'],
    ];
    const matched = patterns.find(([pattern]) => pattern.test(source));
    return matched ? { category: matched[1], basis: matched[2] } : { category: '未分类', basis: 'UNKNOWN' };
  }

  function directionFromText(value, fallbackCents) {
    const source = text(value);
    if (includesAny(source, [/支出|付款|消费|转出|借方|expense|out/i])) return TYPE.EXPENSE;
    if (includesAny(source, [/收入|收款|入账|转入|贷方|income|in/i])) return TYPE.INCOME;
    return fallbackCents < 0 ? TYPE.EXPENSE : fallbackCents > 0 ? TYPE.INCOME : TYPE.UNKNOWN;
  }

  function parseRows(headers, rows, source, state) {
    const dateIndex = headerIndex(headers, [/交易创建时间/u, /交易时间/u, /发生时间/u, /日期/u, /date/u]);
    const possibleTimeIndex = headerIndex(headers, [/^时间$/u, /^time$/iu]);
    const timeIndex = possibleTimeIndex === dateIndex ? -1 : possibleTimeIndex;
    const amountIndex = headerIndex(headers, [/金额/u, /amount/u, /交易金额/u, /price/u]);
    const incomeIndex = headerIndex(headers, [/收入/u, /贷方/u, /credit/u]);
    const expenseIndex = headerIndex(headers, [/支出/u, /借方/u, /debit/u]);
    const typeIndex = headerIndex(headers, [/收支/u, /收\/支/u, /交易类型/u, /^类型$/u, /type/u, /交易分类/u]);
    const merchantIndex = headerIndex(headers, [/交易对方/u, /商家/u, /商户/u, /对方/u, /名称/u, /merchant/u, /payee/u]);
    const descriptionIndex = headerIndex(headers, [/商品说明/u, /商品/u, /摘要/u, /说明/u, /备注/u, /description/u, /memo/u]);
    const methodIndex = headerIndex(headers, [/支付方式/u, /交易渠道/u, /渠道/u, /payment/u]);
    const statusIndex = headerIndex(headers, [/交易状态/u, /当前状态/u, /状态/u, /status/u]);
    const externalIndex = headerIndex(headers, [/支付宝交易号/u, /交易订单号/u, /交易单号/u, /流水号/u, /transactionid/u]);
    const orderIndex = headerIndex(headers, [/商家订单号/u, /商户单号/u, /订单号/u, /order/u]);
    const transactions = [];
    const invalid = [];
    rows.forEach((row, index) => {
      const incomeCents = incomeIndex >= 0 ? toCents(at(row, incomeIndex)) : null;
      const expenseCents = expenseIndex >= 0 ? toCents(at(row, expenseIndex)) : null;
      const amountCents = amountIndex >= 0 ? toCents(at(row, amountIndex)) : null;
      const rawCents = incomeCents !== null && incomeCents !== 0 ? incomeCents : expenseCents !== null && expenseCents !== 0 ? -Math.abs(expenseCents) : amountCents;
      const occurredAt = safeDate(`${at(row, dateIndex)} ${timeIndex >= 0 ? at(row, timeIndex) : ''}`.trim());
      if (rawCents === null || rawCents === 0) { invalid.push({ row: index + 2, type: REVIEW.INVALID_AMOUNT, message: '无法识别金额' }); return; }
      if (!occurredAt) { invalid.push({ row: index + 2, type: REVIEW.INVALID_DATE, message: '无法识别发生时间' }); return; }
      const merchant = at(row, merchantIndex);
      const description = at(row, descriptionIndex);
      const typeText = `${at(row, typeIndex)} ${description}`;
      const classified = classificationFor({ merchant, description, rules: state.personalRules || [] });
      const transaction = {
        id: newId('tx'), ownerId: ownerId(state.ownerId), accountId: ACCOUNT_BY_SOURCE[source] || 'OTHER', account: ACCOUNT_BY_SOURCE[source] || 'OTHER',
        source: FILE_SOURCE[source] || FILE_SOURCE.GENERIC, externalTransactionId: at(row, externalIndex) || '', externalOrderId: at(row, orderIndex) || '',
        type: directionFromText(typeText, rawCents), amountCents: Math.abs(rawCents), currency: 'CNY', merchant, counterparty: merchant,
        description, category: classified.category, classificationBasis: classified.basis, paymentMethod: at(row, methodIndex), occurredAt,
        timezone: state.settings?.timezone || 'Asia/Taipei', status: at(row, statusIndex) || 'POSTED', note: '', tags: '', createdAt: now(), updatedAt: now(),
      };
      transaction.fingerprint = fingerprint(transaction);
      transactions.push(transaction);
    });
    return { transactions, invalid };
  }

  class FinanceProviderAdapter {
    constructor({ id, label, status, supportedFormats = [], metadata = {} }) { this.id = id; this.label = label; this.status = status; this.supportedFormats = supportedFormats; this.metadata = metadata; }
    detect() { return false; }
    parse() { return { transactions: [], invalid: [] }; }
    normalize() { throw new Error('NOT_IMPLEMENTED'); }
    validate() { return []; }
    preview() { return { status: IMPORT_STATUS.PREVIEW }; }
    import() { throw new Error('NOT_IMPLEMENTED'); }
    sync() { return { status: this.status, code: 'SYNC_NOT_AVAILABLE' }; }
    getConnectionStatus() { return { status: this.status, label: this.status === PROVIDER_STATUS.IMPORT_ONLY ? '当前使用账单文件导入' : '官方 Provider 尚未配置', metadata: this.metadata }; }
  }

  class FileImportFinanceProvider extends FinanceProviderAdapter {
    constructor(config) { super({ ...config, status: PROVIDER_STATUS.IMPORT_ONLY, supportedFormats: ['CSV', 'TSV', 'TXT', 'XLSX'] }); }
    detect(input) { return detectSource(input) === this.id; }
    parse({ text: fileText, headers, rows, state }) { return parseRows(headers, rows, this.id, state); }
  }
  class ManualFinanceProvider extends FinanceProviderAdapter {
    constructor() { super({ id: SOURCE.MANUAL, label: '手动记账', status: PROVIDER_STATUS.CONNECTED }); }
    getConnectionStatus() { return { status: PROVIDER_STATUS.CONNECTED, label: '仅在本机保存手动记录' }; }
  }
  class AlipayImportProvider extends FileImportFinanceProvider { constructor() { super({ id: SOURCE.ALIPAY, label: '支付宝账单文件' }); } }
  class WeChatPayImportProvider extends FileImportFinanceProvider { constructor() { super({ id: SOURCE.WECHAT, label: '微信支付账单文件' }); } }
  class BankImportProvider extends FileImportFinanceProvider { constructor() { super({ id: SOURCE.BANK, label: '银行卡流水文件' }); } }
  class GenericCSVImportProvider extends FileImportFinanceProvider { constructor() { super({ id: SOURCE.GENERIC, label: '通用 CSV / Excel' }); } }
  class OfficialProviderPlaceholder extends FinanceProviderAdapter {
    constructor(id, label) { super({ id, label, status: PROVIDER_STATUS.NOT_SUPPORTED, metadata: { billingModel: 'UNKNOWN', requiresCommercialAgreement: true, requiresUserConsent: true, requiresBusinessVerification: true } }); }
    authorize() { return { status: PROVIDER_STATUS.NOT_SUPPORTED, code: 'OFFICIAL_PROVIDER_NOT_CONFIGURED' }; }
    refreshToken() { return this.authorize(); }
    syncTransactions() { return this.authorize(); }
    disconnect() { return { status: PROVIDER_STATUS.NOT_SUPPORTED }; }
  }
  class AlipayOfficialProvider extends OfficialProviderPlaceholder { constructor() { super('ALIPAY_OFFICIAL', '支付宝官方 Provider'); } }
  class WeChatOfficialProvider extends OfficialProviderPlaceholder { constructor() { super('WECHAT_OFFICIAL', '微信官方 Provider'); } }
  class BankOfficialProvider extends OfficialProviderPlaceholder { constructor() { super('BANK_OFFICIAL', '银行官方 Provider'); } }

  const providers = Object.freeze({
    manual: new ManualFinanceProvider(), alipay: new AlipayImportProvider(), wechat: new WeChatPayImportProvider(), bank: new BankImportProvider(), generic: new GenericCSVImportProvider(),
    alipayOfficial: new AlipayOfficialProvider(), wechatOfficial: new WeChatOfficialProvider(), bankOfficial: new BankOfficialProvider(),
  });
  function providerFor(source) { return ({ ALIPAY: providers.alipay, WECHAT: providers.wechat, BANK: providers.bank, GENERIC: providers.generic, MANUAL: providers.manual }[source] || providers.generic); }

  function blankState() {
    return { version: 2, ownerId: 'local-finance-owner', transactions: [], budgets: { totalCents: 0, categories: {} }, subscriptions: [], importBatches: [], reviewQueue: [], personalRules: [], privacy: { hideAmounts: false }, settings: { timezone: 'Asia/Taipei', currency: 'CNY' } };
  }
  function hydrateState(value) {
    const base = blankState();
    if (!value || !Array.isArray(value.transactions)) return base;
    return { ...base, ...value, ownerId: ownerId(value.ownerId), budgets: { ...base.budgets, ...(value.budgets || {}) }, privacy: { ...base.privacy, ...(value.privacy || {}) }, settings: { ...base.settings, ...(value.settings || {}) }, reviewQueue: Array.isArray(value.reviewQueue) ? value.reviewQueue : [], personalRules: Array.isArray(value.personalRules) ? value.personalRules : [], importBatches: Array.isArray(value.importBatches) ? value.importBatches : [] };
  }

  function readFileText({ fileName, text: fileText, alreadyDecodedXlsx = false }) {
    if (/\.(?:png|jpe?g|webp|gif|bmp|heic|heif)$/iu.test(fileName || '')) return { error: { code: 'IMAGE_FILE_NOT_LEDGER', message: '这是一张账单截图，不是可导入的账单文件。请使用手机凭证识别流程，或先从微信/支付宝导出 CSV 或 XLSX。截图不会被当作异常交易。' } };
    if (/\.xlsx$/iu.test(fileName || '') && !alreadyDecodedXlsx) return { error: { code: 'XLSX_DECODE_REQUIRED', message: '该 XLSX 文件尚未完成本机读取。请重新选择文件；页面不会把未解析的 Excel 假装为导入成功。' } };
    const parsed = parseDelimited(fileText);
    if (parsed.length < 2) return { error: { code: 'BROKEN_FILE', message: '文件没有可解析的表头和交易行。' } };
    return { headers: parsed[0].map(text), rows: parsed.slice(1) };
  }

  function transactionDedupe(existing, incoming) {
    const seen = new Set(existing.map(dedupKey));
    let duplicates = 0;
    const unique = [];
    for (const row of incoming) {
      const key = dedupKey(row);
      if (seen.has(key)) { duplicates += 1; continue; }
      seen.add(key); unique.push(row);
    }
    return { unique, duplicates };
  }

  function overlapHours(a, b) { return Math.abs(new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()) / 3600000; }
  function upsertReview(state, candidate) {
    const existing = state.reviewQueue.find((item) => item.dedupeKey === candidate.dedupeKey && item.status === 'PENDING');
    if (!existing) state.reviewQueue.push(candidate);
  }
  function addReviewCandidates(state, newTransactions) {
    const all = state.transactions;
    const reviewable = all.filter((transaction) => transaction.ownerId === state.ownerId && [TYPE.EXPENSE, TYPE.INCOME].includes(transaction.type));
    for (const transaction of newTransactions) {
      if (transaction.type === TYPE.UNKNOWN || transaction.category === '未分类') {
        upsertReview(state, { id: newId('review'), dedupeKey: `unknown:${transaction.id}`, type: REVIEW.UNKNOWN_CATEGORY, transactionIds: [transaction.id], status: 'PENDING', createdAt: now(), reason: '无法可靠自动分类，请确认分类。' });
      }
      const refundMatch = reviewable.find((other) => other.id !== transaction.id && other.type === TYPE.EXPENSE && transaction.type === TYPE.INCOME && other.amountCents === transaction.amountCents && overlapHours(other, transaction) <= 24 * 180 && ((transaction.externalOrderId && transaction.externalOrderId === other.externalOrderId) || (normalized(other.merchant) && normalized(other.merchant) === normalized(transaction.merchant))));
      if (refundMatch) upsertReview(state, { id: newId('review'), dedupeKey: `refund:${[refundMatch.id, transaction.id].sort().join(':')}`, type: REVIEW.POSSIBLE_REFUND, transactionIds: [refundMatch.id, transaction.id], status: 'PENDING', createdAt: now(), reason: '同商家/订单号出现反向同额记录，可能是退款。' });
      const transferMatch = reviewable.find((other) => other.id !== transaction.id && other.account !== transaction.account && other.amountCents === transaction.amountCents && other.type !== transaction.type && overlapHours(other, transaction) <= 72 && other.ownerId === transaction.ownerId);
      if (transferMatch) upsertReview(state, { id: newId('review'), dedupeKey: `transfer:${[transferMatch.id, transaction.id].sort().join(':')}`, type: REVIEW.POSSIBLE_TRANSFER, transactionIds: [transferMatch.id, transaction.id], status: 'PENDING', createdAt: now(), reason: '两个本人账户出现接近时间的反向同额记录，可能是内部转账。' });
    }
  }

  function previewImport(stateValue, { fileName, text: fileText, selectedSource = SOURCE.UNKNOWN, alreadyDecodedXlsx = false }) {
    const state = hydrateState(stateValue);
    const decoded = readFileText({ fileName, text: fileText, alreadyDecodedXlsx });
    if (decoded.error) return { ok: false, error: decoded.error, source: SOURCE.UNKNOWN };
    const detected = detectSource({ fileName, headers: decoded.headers });
    const source = selectedSource && selectedSource !== SOURCE.UNKNOWN ? selectedSource : detected;
    if (source === SOURCE.UNKNOWN) return { ok: false, error: { code: 'UNKNOWN_SOURCE', message: '无法判断账单来源。请选择支付宝、微信支付、银行卡或通用 CSV 后再预览。' }, source };
    const provider = providerFor(source);
    const parsed = provider.parse({ ...decoded, state });
    const deduped = transactionDedupe(state.transactions.filter((item) => item.ownerId === state.ownerId), parsed.transactions);
    const candidates = [...parsed.transactions];
    const potentialTransfers = candidates.filter((transaction) => state.transactions.some((other) => other.ownerId === state.ownerId && other.account !== transaction.account && other.amountCents === transaction.amountCents && other.type !== transaction.type && overlapHours(other, transaction) <= 72)).length;
    const potentialRefunds = candidates.filter((transaction) => state.transactions.some((other) => other.ownerId === state.ownerId && other.type === TYPE.EXPENSE && transaction.type === TYPE.INCOME && other.amountCents === transaction.amountCents && ((transaction.externalOrderId && transaction.externalOrderId === other.externalOrderId) || (normalized(other.merchant) === normalized(transaction.merchant))) && overlapHours(other, transaction) <= 24 * 180)).length;
    const unknown = deduped.unique.filter((row) => row.category === '未分类').length;
    const totals = summarize(deduped.unique);
    return { ok: true, source, detectedSource: detected, provider: provider.getConnectionStatus(), fileName, transactions: deduped.unique, invalid: parsed.invalid, duplicateCount: deduped.duplicates, potentialTransfers, potentialRefunds, unknownCount: unknown, totals, headers: decoded.headers };
  }

  function commitImport(stateValue, preview) {
    const state = hydrateState(stateValue);
    if (!preview?.ok) return { state, error: { code: 'IMPORT_ERROR', message: '没有可确认的导入预览。' } };
    const batchId = newId('batch');
    const importedAt = now();
    const imported = preview.transactions.map((transaction) => ({ ...transaction, importBatchId: batchId, createdAt: importedAt, updatedAt: importedAt }));
    state.transactions.push(...imported);
    addReviewCandidates(state, imported);
    const pending = state.reviewQueue.filter((item) => item.status === 'PENDING' && imported.some((transaction) => item.transactionIds.includes(transaction.id))).length;
    const batch = { id: batchId, ownerId: state.ownerId, source: preview.source, fileName: preview.fileName || '未命名账单', fileHash: fnv1a(`${preview.fileName}|${preview.headers?.join('|')}|${imported.length}`), recordCount: preview.transactions.length + preview.duplicateCount + preview.invalid.length, importedCount: imported.length, duplicateCount: preview.duplicateCount, transferCandidateCount: preview.potentialTransfers, refundCandidateCount: preview.potentialRefunds, unknownCount: preview.unknownCount, status: pending ? IMPORT_STATUS.REVIEW : IMPORT_STATUS.COMPLETE, createdAt: importedAt, completedAt: importedAt };
    state.importBatches.push(batch);
    return { state, batch, imported, pendingCount: pending };
  }

  function confirmReview(stateValue, reviewId, resolution = {}) {
    const state = hydrateState(stateValue);
    const review = state.reviewQueue.find((item) => item.id === reviewId && item.status === 'PENDING');
    if (!review) return { state, error: { code: 'NOT_FOUND', message: '待确认项目不存在或已处理。' } };
    const rows = review.transactionIds.map((id) => state.transactions.find((item) => item.id === id)).filter(Boolean);
    if (review.type === REVIEW.POSSIBLE_TRANSFER && rows.length === 2) {
      if (resolution.kind === 'EXTERNAL_TRANSFER') { const outgoing = rows.find((item) => item.type === TYPE.EXPENSE); if (outgoing) { outgoing.category = resolution.category || '人情往来'; outgoing.updatedAt = now(); } review.status = 'RESOLVED_EXTERNAL'; }
      else { const transferGroupId = newId('transfer'); rows.forEach((row) => { row.type = TYPE.TRANSFER; row.transferGroupId = transferGroupId; row.category = '账户转账'; row.updatedAt = now(); }); review.status = 'CONFIRMED'; }
    } else if (review.type === REVIEW.POSSIBLE_REFUND && rows.length === 2) {
      const original = rows.find((item) => item.type === TYPE.EXPENSE);
      const refund = rows.find((item) => item.type === TYPE.INCOME || item.type === TYPE.UNKNOWN);
      if (original && refund) { refund.type = TYPE.REFUND; refund.originalTransactionId = original.id; refund.category = '退款'; refund.updatedAt = now(); review.status = 'CONFIRMED'; }
      else return { state, error: { code: 'CONFLICT', message: '退款候选已被修改，无法自动确认。' } };
    } else if (review.type === REVIEW.UNKNOWN_CATEGORY && rows[0]) {
      const row = rows[0]; row.category = resolution.category || '其他'; row.classificationBasis = 'USER_CONFIRMATION'; row.updatedAt = now();
      if (resolution.saveRule && row.merchant) state.personalRules.push({ id: newId('rule'), ownerId: state.ownerId, merchant: row.merchant, category: row.category, createdAt: now() });
      review.status = 'CONFIRMED';
    } else { review.status = 'DISMISSED'; }
    review.resolvedAt = now();
    return { state, review };
  }

  function rollbackBatch(stateValue, batchId, force = false) {
    const state = hydrateState(stateValue);
    const batch = state.importBatches.find((item) => item.id === batchId && item.ownerId === state.ownerId);
    if (!batch) return { state, error: { code: 'NOT_FOUND', message: '导入批次不存在。' } };
    const linked = state.transactions.filter((item) => item.importBatchId === batchId);
    const edited = linked.filter((item) => item.updatedAt && item.createdAt && item.updatedAt !== item.createdAt);
    if (edited.length && !force) return { state, needsConfirmation: true, editedCount: edited.length };
    const ids = new Set(linked.map((item) => item.id));
    state.transactions = state.transactions.filter((item) => !ids.has(item.id));
    state.reviewQueue = state.reviewQueue.filter((item) => !item.transactionIds.some((id) => ids.has(id)));
    batch.status = IMPORT_STATUS.ROLLED_BACK; batch.completedAt = now();
    return { state, removedCount: linked.length, batch };
  }

  function summarize(items) {
    let income = 0; let expense = 0; let refunds = 0; let transfer = 0;
    for (const item of items) { if (item.type === TYPE.INCOME) income += item.amountCents; if (item.type === TYPE.EXPENSE) expense += item.amountCents; if (item.type === TYPE.REFUND) refunds += item.amountCents; if (item.type === TYPE.TRANSFER) transfer += item.amountCents; }
    const netExpense = Math.max(0, expense - refunds);
    return { incomeCents: income, expenseCents: netExpense, rawExpenseCents: expense, refundCents: refunds, transferCents: transfer, balanceCents: income - netExpense };
  }

  function visibleTransactions(stateValue, selectedOwnerId) { const state = hydrateState(stateValue); return state.transactions.filter((item) => item.ownerId === ownerId(selectedOwnerId)); }

  global.MEZipFinance = Object.freeze({ PROVIDER_STATUS, SOURCE, TYPE, REVIEW, IMPORT_STATUS, FinanceProviderAdapter, ManualFinanceProvider, FileImportFinanceProvider, AlipayImportProvider, WeChatPayImportProvider, BankImportProvider, GenericCSVImportProvider, AlipayOfficialProvider, WeChatOfficialProvider, BankOfficialProvider, providers, providerFor, blankState, hydrateState, toCents, fingerprint, dedupKey, detectSource, classificationFor, previewImport, commitImport, confirmReview, rollbackBatch, summarize, visibleTransactions });
})(window);
