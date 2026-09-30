/* Read-only bill import: all accepted rows must still be confirmed on desktop. */
(function attachSimpleLedgerImport(global) {
  'use strict';

  const supportedFormats = Object.freeze(['.csv', '.tsv']);
  const canonicalHeaders = ['交易时间', '交易对方', '商品', '收支', '金额(元)', '交易单号', '商户单号', '支付方式', '当前状态', '备注'];
  const clean = (value) => String(value ?? '').replace(/^\uFEFF/u, '').trim().replace(/^`/u, '').trim();
  const header = (value) => clean(value).toLowerCase().replace(/[\s（）()]/gu, '').replace(/／/gu, '/');
  const csv = (value) => `"${String(value ?? '').replace(/"/gu, '""')}"`;
  const column = (headers, aliases) => {
    for (const alias of aliases) { const index = headers.findIndex((value) => alias.test(header(value))); if (index >= 0) return index; }
    return -1;
  };

  function columns(headers) {
    return {
      date: column(headers, [/^交易时间$/u, /^交易创建时间$/u, /^发生时间$/u, /^日期$/u, /^date$/u, /^occurredat$/u]),
      time: column(headers, [/^时间$/u, /^time$/u]),
      amount: column(headers, [/^金额(?:元)?$/u, /^交易金额(?:元)?$/u, /^amount$/u]),
      direction: column(headers, [/^收\/?支$/u, /^收支类型$/u, /^收支方向$/u, /^方向$/u, /^type$/u, /^类型$/u, /^交易类型$/u]),
      business: column(headers, [/^交易类型$/u, /^交易分类$/u]),
      merchant: column(headers, [/^交易对方$/u, /^商家$/u, /^商户名称$/u, /^商家名称$/u, /^对方$/u, /^merchant$/u, /^payee$/u]),
      description: column(headers, [/^商品$/u, /^商品说明$/u, /^商品名称$/u, /^摘要$/u, /^description$/u]),
      external: column(headers, [/^交易单号$/u, /^交易订单号$/u, /^支付宝交易号$/u, /^流水号$/u, /^externaltransactionid$/u]),
      order: column(headers, [/^商户单号$/u, /^商家订单号$/u, /^商户订单号$/u, /^externalorderid$/u]),
      method: column(headers, [/^支付方式$/u, /^付款方式$/u, /^paymentmethod$/u]),
      status: column(headers, [/^当前状态$/u, /^交易状态$/u, /^状态$/u, /^status$/u]),
      note: column(headers, [/^备注$/u, /^note$/u]),
    };
  }

  function parseDelimited(input, delimiter) {
    const rows = []; let row = []; let field = ''; let quoted = false; let line = 1; let rowLine = 1;
    for (let index = 0; index < input.length; index += 1) {
      const char = input[index]; const next = input[index + 1];
      if (char === '"' && quoted && next === '"') { field += '"'; index += 1; continue; }
      if (char === '"' && (quoted || !field.trim())) { quoted = !quoted; continue; }
      if (char === delimiter && !quoted) { row.push(field); field = ''; continue; }
      if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && next === '\n') index += 1;
        row.push(field); if (row.some((cell) => clean(cell))) rows.push({ cells: row, line: rowLine });
        row = []; field = ''; line += 1; rowLine = line; continue;
      }
      if (char === '\n') line += 1;
      field += char;
    }
    if (quoted) throw new Error('账单文件的引号未闭合，请重新导出完整 CSV / TSV。');
    if (field || row.length) { row.push(field); if (row.some((cell) => clean(cell))) rows.push({ cells: row, line: rowLine }); }
    return rows;
  }

  function findTable(input) {
    for (const delimiter of [',', '\t']) {
      const rows = parseDelimited(input, delimiter);
      const index = rows.findIndex(({ cells }) => { const map = columns(cells); return map.date >= 0 && map.amount >= 0 && (map.direction >= 0 || map.merchant >= 0); });
      if (index >= 0) return { rows, index, headers: rows[index].cells, map: columns(rows[index].cells) };
    }
    throw new Error('没有找到交易表头。请导入微信“用于个人对账”导出的 CSV / TSV，或含日期、商家、收支和金额的表格。');
  }

  function decode(bytes) {
    try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'UTF-8' }; }
    catch {
      try { return { text: new TextDecoder('gb18030', { fatal: true }).decode(bytes), encoding: 'GB18030' }; }
      catch { throw new Error('无法读取文件编码。请使用 UTF-8 或 GB18030 编码的 CSV / TSV。'); }
    }
  }

  function dateTime(value, timezone) {
    const source = clean(value).replace(/年|\//gu, '-').replace(/月/gu, '-').replace(/日/gu, '').trim();
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/u.exec(source);
    if (match) {
      const [, y, m, d, h = '0', min = '0', sec = '0'] = match; const parts = [y, m, d, h, min, sec].map(Number);
      const check = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]));
      if (check.getUTCFullYear() !== parts[0] || check.getUTCMonth() !== parts[1] - 1 || check.getUTCDate() !== parts[2] || parts[3] > 23 || parts[4] > 59 || parts[5] > 59) return null;
      const pad = (number) => String(number).padStart(2, '0');
      const offset = timezone === 'UTC' ? 'Z' : '+08:00';
      return `${y}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(min)}:${pad(sec)}${offset}`;
    }
    if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/u.test(source)) { const value = new Date(source); return Number.isNaN(value.getTime()) ? null : value.toISOString(); }
    return null;
  }

  function directionOf(value, signedCents, source) {
    const direction = clean(value).toLowerCase();
    if (/^(?:支出|付款|付出|expense|out)$/u.test(direction)) return 'EXPENSE';
    if (/^(?:收入|收款|income|in)$/u.test(direction)) return 'INCOME';
    if (/^(?:不计收支|中性|转账|transfer|neutral)$/u.test(direction)) return 'TRANSFER';
    if (/^(?:退款|refund)$/u.test(direction)) return 'REFUND';
    // A missing WeChat direction is ambiguous; unsigned amounts do not mean income.
    return source === 'WECHAT' ? 'UNKNOWN' : signedCents < 0 ? 'EXPENSE' : 'INCOME';
  }

  function inactiveStatus(status) {
    return /支付失败|交易失败|已撤销|撤销成功|交易关闭|已关闭|未支付|待支付|等待支付|等待收款|待收款|已退还|已退回|已过期|已拒收|已取消|退款失败/u.test(status);
  }

  function ledgerEntries(state) {
    const transactionFor = (item) => item?.transaction || item?.entry || item;
    return [...(state.transactions || []), ...(state.pendingTransactions || []), ...(state.pending || [])].map(transactionFor).filter((item) => item && typeof item === 'object');
  }

  async function read(file, ledgerState = {}) {
    const Core = global.MEZipFinance;
    if (!Core?.previewImport) throw new Error('财务账本解析器尚未加载，请刷新页面后重试。');
    const fileName = clean(file?.name);
    if (!/\.(?:csv|tsv)$/iu.test(fileName)) throw new Error('当前支持 CSV / TSV 账单。Excel 请先另存为 CSV；截图请使用手机上传凭证。');
    if (file.size > 20 * 1024 * 1024) throw new Error('账单文件超过 20 MB，请按较短时间范围导出。');
    const decoded = decode(await file.arrayBuffer());
    const table = findTable(decoded.text);
    const prelude = table.rows.slice(0, table.index).map(({ cells }) => cells.join(' ')).join(' ');
    let source = Core.detectSource({ fileName, headers: table.headers });
    if (/微信(?:支付)?账单|微信支付/u.test(prelude)) source = Core.SOURCE.WECHAT;
    if (source === Core.SOURCE.UNKNOWN) source = Core.SOURCE.GENERIC;
    const invalid = []; const skipped = []; const candidates = []; const normalized = [canonicalHeaders.map(csv).join(',')];
    const at = (row, key) => table.map[key] < 0 ? '' : clean(row[table.map[key]]);
    for (const { cells, line } of table.rows.slice(table.index + 1)) {
      if (columns(cells).date >= 0 && columns(cells).amount >= 0) continue;
      if (cells.length <= 2 && /总计|合计|统计|共\s*\d+\s*笔|^-{3,}|^={3,}/u.test(cells.join(' '))) continue;
      const status = at(cells, 'status');
      if (inactiveStatus(status)) { skipped.push({ row: line, status, reason: '交易未生效或已撤销' }); continue; }
      const cents = Core.toCents(at(cells, 'amount'));
      if (cents === null || cents === 0 || !Number.isSafeInteger(cents)) { invalid.push({ row: line, type: 'INVALID_AMOUNT', message: '金额无效或不是精确的分值' }); continue; }
      const rawDate = `${at(cells, 'date')} ${at(cells, 'time')}`.trim();
      const occurredAt = dateTime(rawDate, ledgerState.settings?.timezone);
      if (!occurredAt) { invalid.push({ row: line, type: 'INVALID_DATE', message: '发生时间无效' }); continue; }
      const rawDirection = at(cells, 'direction');
      let type = directionOf(rawDirection, cents, source);
      if (type === 'UNKNOWN') { invalid.push({ row: line, type: 'UNKNOWN_DIRECTION', message: '无法识别微信收支方向，请补充“收/支”列后重试' }); continue; }
      const business = at(cells, 'business'); const description = at(cells, 'description');
      if (type === 'INCOME' && (/退款|退货退款/u.test(business) || /^退款成功/u.test(status) || (!business && /^退款(?:\b|$|[：:])/u.test(description)))) type = 'REFUND';
      const importKind = type === 'REFUND' ? 'REFUND' : type === 'TRANSFER' ? 'INTERNAL_TRANSFER' : /转账/u.test(business) ? 'TRANSFER_CANDIDATE' : 'PAYMENT';
      const reason = importKind === 'TRANSFER_CANDIDATE' ? '请确认这是对外收支还是本人账户调拨。' : type === 'REFUND' ? '退款单独记录，不计为普通收入；请核对原消费。' : type === 'TRANSFER' ? '原账单标记不计收支；本人账户调拨不计入收入与支出。' : '请核对金额、时间和分类后入账。';
      candidates.push({ line, type, importKind, reason, rawDirection, business, status, note: at(cells, 'note'), rawDate, external: at(cells, 'external') });
      // A temporary unique ID keeps every row aligned with its raw metadata;
      // the actual exported ID is restored before the final duplicate check.
      normalized.push([occurredAt, at(cells, 'merchant'), description, type === 'EXPENSE' ? '支出' : '收入', String(Math.abs(cents) / 100), `import-row-${candidates.length}`, at(cells, 'order'), at(cells, 'method'), status, at(cells, 'note')].map(csv).join(','));
    }
    if (!candidates.length) return { transactions: [], duplicateCount: 0, invalid, skipped, source, fileName, encoding: decoded.encoding };
    // Normalize the real export before using the shared core. Deduplication occurs
    // after correcting directions and refund / neutral-transfer semantics.
    const preview = Core.previewImport({ ...ledgerState, transactions: [] }, { fileName, text: normalized.join('\n'), selectedSource: source });
    if (!preview.ok) throw new Error(preview.error?.message || '账单解析失败。');
    const rejected = new Set(preview.invalid.map((item) => item.row - 2));
    for (const item of preview.invalid) invalid.push({ ...item, row: candidates[item.row - 2]?.line || item.row });
    const validCandidates = candidates.filter((_, index) => !rejected.has(index));
    const existing = ledgerEntries(ledgerState); const seen = new Set(existing.map((item) => Core.dedupKey(item))); let duplicateCount = 0;
    const transactions = [];
    for (let index = 0; index < preview.transactions.length; index += 1) {
      const transaction = preview.transactions[index];
      const candidate = validCandidates[index];
      if (!candidate) continue;
      transaction.externalTransactionId = candidate.external;
      transaction.type = candidate.type; transaction.importKind = candidate.importKind; transaction.requiresReview = true; transaction.reviewReason = candidate.reason;
      transaction.note = candidate.note; transaction.importRow = candidate.line; transaction.sourceOccurredAt = candidate.rawDate; transaction.sourceDirection = candidate.rawDirection; transaction.sourceBusinessType = candidate.business;
      if (transaction.type === 'TRANSFER') transaction.category = '账户转账';
      transaction.fingerprint = Core.fingerprint(transaction);
      const key = Core.dedupKey(transaction);
      if (seen.has(key)) { duplicateCount += 1; continue; }
      seen.add(key); transactions.push(transaction);
    }
    return { transactions, duplicateCount, invalid, skipped, source, fileName, encoding: decoded.encoding };
  }

  global.SimpleLedgerImport = Object.freeze({ read, supportedFormats });
})(window);
