import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const context = {
  window: {}, TextDecoder,
  localStorage: new Proxy({}, { get() { throw new Error('Importer must not access storage'); } }),
};
vm.runInNewContext(readFileSync(new URL('../finance-center-v2/finance-core.js', import.meta.url), 'utf8'), context);
vm.runInNewContext(readFileSync(new URL('./ledger-import.js', import.meta.url), 'utf8'), context);
const { MEZipFinance: Core, SimpleLedgerImport: Importer } = context.window;
const file = (name, bytes) => {
  const data = typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes;
  return { name, size: data.length, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) };
};
const fixture = readFileSync(new URL('./fixtures/wechat-personal-export.csv', import.meta.url));

test('real WeChat export prelude, directions, refund and neutral transfer are interpreted correctly', async () => {
  const ledger = Core.blankState(); const before = JSON.stringify(ledger);
  const result = await Importer.read(file('微信支付账单.csv', fixture), ledger);
  assert.equal(result.source, 'WECHAT');
  assert.equal(result.transactions.length, 4);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.skipped.length, 2);
  assert.equal(result.invalid.length, 2);
  assert.equal(JSON.stringify(ledger), before, 'reading a bill must not write any ledger state');
  const [expense, friendTransfer, refund, internal] = result.transactions;
  assert.equal(expense.merchant, '午餐,小馆');
  assert.equal(expense.amountCents, 8800);
  assert.equal(expense.type, 'EXPENSE', 'a refunded original payment remains the original expense');
  assert.equal(expense.status, '已全额退款');
  assert.equal(expense.externalTransactionId, '420000000120260929000001');
  assert.equal(expense.occurredAt, '2026-09-29T04:30:00.000Z');
  assert.equal(friendTransfer.type, 'EXPENSE', 'transfer to a friend is not silently an internal transfer');
  assert.equal(friendTransfer.importKind, 'TRANSFER_CANDIDATE');
  assert.equal(friendTransfer.note, '生活费');
  assert.equal(refund.type, 'REFUND');
  assert.equal(refund.externalOrderId, 'order-lunch');
  assert.equal(internal.type, 'TRANSFER');
  assert.equal(internal.category, '账户转账');
  assert.ok(result.transactions.every((transaction) => transaction.requiresReview));
  assert.equal(result.invalid.find((item) => item.type === 'INVALID_AMOUNT').row, 18);
  assert.equal(result.invalid.find((item) => item.type === 'INVALID_DATE').row, 19);
  const totals = Core.summarize(result.transactions);
  assert.equal(totals.incomeCents, 0);
  assert.equal(totals.expenseCents, 10000, 'refund offsets consumption, neutral transfer is excluded');
});

test('repeat imports are rejected against both posted entries and pending entries', async () => {
  const first = await Importer.read(file('微信支付账单.csv', fixture), Core.blankState());
  const posted = await Importer.read(file('微信支付账单.csv', fixture), { ...Core.blankState(), transactions: first.transactions });
  assert.equal(posted.transactions.length, 0);
  assert.equal(posted.duplicateCount, 5);
  const pending = await Importer.read(file('微信支付账单.csv', fixture), { ...Core.blankState(), pendingTransactions: first.transactions });
  assert.equal(pending.transactions.length, 0);
  assert.equal(pending.duplicateCount, 5);
  const wrapped = await Importer.read(file('微信支付账单.csv', fixture), { ...Core.blankState(), pending: first.transactions.map((transaction) => ({ transaction })) });
  assert.equal(wrapped.transactions.length, 0);
});

test('TSV handles BOM, Excel backticks and full precision transaction IDs', async () => {
  const text = '\uFEFF微信支付账单明细列表\r\n交易时间\t交易类型\t交易对方\t商品\t收/支\t金额(元)\t支付方式\t当前状态\t交易单号\t商户单号\t备注\r\n2026-09-30 09:01:02\t微信红包\t朋友\t红包\t收入\t¥8.88\t零钱\t已收钱\t`100000000000000000001234567890\t/\t节日快乐\r\n';
  const result = await Importer.read(file('微信账单.tsv', text), Core.blankState());
  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0].type, 'INCOME');
  assert.equal(result.transactions[0].amountCents, 888);
  assert.equal(result.transactions[0].externalTransactionId, '100000000000000000001234567890');
  assert.equal(result.transactions[0].note, '节日快乐');
});

test('GB18030 Chinese bill decodes without replacing merchant names', async () => {
  const bytes = readFileSync(new URL('./fixtures/wechat-gb18030.csv', import.meta.url));
  const result = await Importer.read(file('账单.csv', bytes), Core.blankState());
  assert.equal(result.encoding, 'GB18030');
  assert.equal(result.source, 'WECHAT');
  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0].merchant, '中文早餐店');
  assert.equal(result.transactions[0].note, '豆浆和包子');
  assert.equal(result.transactions[0].type, 'EXPENSE');
});

test('quoted multiline notes are preserved and fallback fingerprint prevents duplicate imports', async () => {
  const text = '日期,商家,收支,金额,备注\n2026-09-30,测试店,支出,2.50,"第一行\n第二行"\n';
  const first = await Importer.read(file('general.csv', text), Core.blankState());
  assert.equal(first.transactions[0].note, '第一行\n第二行');
  const again = await Importer.read(file('general.csv', text), { ...Core.blankState(), transactions: first.transactions });
  assert.equal(again.transactions.length, 0);
  assert.equal(again.duplicateCount, 1);
});

test('unsupported spreadsheet/image formats and malformed files fail honestly', async () => {
  assert.equal(Importer.supportedFormats.join(','), '.csv,.tsv');
  await assert.rejects(Importer.read(file('bill.xlsx', 'not a spreadsheet'), Core.blankState()), /CSV \/ TSV/u);
  await assert.rejects(Importer.read(file('bill.png', 'not a picture'), Core.blankState()), /CSV \/ TSV/u);
  await assert.rejects(Importer.read(file('bill.csv', '不是账单\nhello world'), Core.blankState()), /没有找到交易表头/u);
});
