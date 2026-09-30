import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const context = { window: {} };
vm.runInNewContext(
  readFileSync(new URL('./finance-core.js', import.meta.url), 'utf8'),
  context,
  { filename: 'finance-core.js' },
);
const Finance = context.window.MEZipFinance;

function preview(state, fileName, text, selectedSource = 'UNKNOWN') {
  return Finance.previewImport(state, { fileName, text, selectedSource });
}

const alipay = [
  '交易创建时间,交易对方,商品说明,收/支,金额（元）,支付宝交易号,商家订单号,备注',
  '2026-08-22 10:30:00,星巴克,咖啡,支出,12.34,ali-001,order-001,早餐',
].join('\n');
const wechat = [
  '交易时间,交易对方,商品,收/支,金额(元),交易单号,商户单号,备注',
  '2026-08-22 11:00:00,朋友,转账,支出,100.00,wx-001,,账户调拨',
].join('\n');
const bank = [
  '日期,时间,摘要,交易对方,收入,支出,流水号,交易渠道',
  '2026-08-22,11:30:00,转入,本人微信,100.00,,bank-001,手机银行',
].join('\n');

test('detects the three supported provider file sources', () => {
  assert.equal(Finance.detectSource({ fileName: '支付宝账单.csv', headers: ['交易创建时间', '支付宝交易号'] }), 'ALIPAY');
  assert.equal(Finance.detectSource({ fileName: '微信支付账单.csv', headers: ['交易单号', '商户单号'] }), 'WECHAT');
  assert.equal(Finance.detectSource({ fileName: 'bank.csv', headers: ['借方', '贷方', '流水号'] }), 'BANK');
});

test('normalizes money into integer cents and rejects imprecise values', () => {
  assert.equal(Finance.toCents('12.34'), 1234);
  assert.equal(Finance.toCents('-0.01'), -1);
  assert.equal(Finance.toCents('12.345'), null);
});

test('previews and imports an Alipay file with automatic classification', () => {
  const state = Finance.blankState();
  const first = preview(state, '支付宝账单.csv', alipay);
  assert.equal(first.ok, true);
  assert.equal(first.source, 'ALIPAY');
  assert.equal(first.transactions[0].amountCents, 1234);
  assert.equal(first.transactions[0].type, 'EXPENSE');
  assert.equal(first.transactions[0].category, '餐饮美食');
  const committed = Finance.commitImport(state, first);
  assert.equal(committed.imported.length, 1);
  assert.equal(committed.state.transactions.length, 1);
});

test('deduplicates a repeated import by provider transaction identity', () => {
  const first = preview(Finance.blankState(), '支付宝账单.csv', alipay);
  const state = Finance.commitImport(Finance.blankState(), first).state;
  const repeated = preview(state, '支付宝账单.csv', alipay);
  assert.equal(repeated.duplicateCount, 1);
  assert.equal(repeated.transactions.length, 0);
});

test('places potential internal transfer in review and confirms it without affecting income or expense', () => {
  const start = Finance.commitImport(Finance.blankState(), preview(Finance.blankState(), 'wechat.csv', wechat)).state;
  const bankPreview = preview(start, 'bank.csv', bank);
  const committed = Finance.commitImport(start, bankPreview);
  const candidate = committed.state.reviewQueue.find((item) => item.type === 'POSSIBLE_TRANSFER');
  assert.ok(candidate);
  const confirmed = Finance.confirmReview(committed.state, candidate.id, { kind: 'INTERNAL_TRANSFER' }).state;
  const total = Finance.summarize(confirmed.transactions);
  assert.equal(total.incomeCents, 0);
  assert.equal(total.expenseCents, 0);
  assert.equal(confirmed.transactions.every((item) => item.type === 'TRANSFER'), true);
});

test('links a possible refund to its original expense only after confirmation', () => {
  const expense = Finance.commitImport(Finance.blankState(), preview(Finance.blankState(), '支付宝账单.csv', alipay)).state;
  const refund = [
    '交易时间,交易对方,商品,收/支,金额(元),交易单号,商户单号,备注',
    '2026-08-23 10:30:00,星巴克,退款,收入,12.34,wx-refund,order-001,退款',
  ].join('\n');
  const withRefund = Finance.commitImport(expense, preview(expense, 'wechat.csv', refund)).state;
  const review = withRefund.reviewQueue.find((item) => item.type === 'POSSIBLE_REFUND');
  assert.ok(review);
  const confirmed = Finance.confirmReview(withRefund, review.id, { kind: 'REFUND' }).state;
  const linked = confirmed.transactions.find((item) => item.type === 'REFUND');
  assert.ok(linked.originalTransactionId);
  assert.equal(Finance.summarize(confirmed.transactions).expenseCents, 0);
});

test('applies personal rules and keeps records owner-scoped', () => {
  const state = Finance.blankState();
  state.personalRules.push({ merchant: '测试商家', category: '学习教育' });
  state.transactions.push({ id: 'other', ownerId: 'other-user', type: 'EXPENSE', amountCents: 1 });
  const file = ['日期,商家,金额,收支', '2026-08-22,测试商家,3.00,支出'].join('\n');
  const result = preview(state, 'generic.csv', file, 'GENERIC');
  assert.equal(result.transactions[0].category, '学习教育');
  assert.equal(Finance.visibleTransactions(state, state.ownerId).length, 0);
});

test('requires explicit confirmation before rolling back edited imports', () => {
  const first = preview(Finance.blankState(), '支付宝账单.csv', alipay);
  const state = Finance.commitImport(Finance.blankState(), first).state;
  state.transactions[0].updatedAt = '2026-08-23T00:00:00.000Z';
  const pending = Finance.rollbackBatch(state, state.importBatches[0].id);
  assert.equal(pending.needsConfirmation, true);
  const rolledBack = Finance.rollbackBatch(state, state.importBatches[0].id, true);
  assert.equal(rolledBack.removedCount, 1);
  assert.equal(rolledBack.state.transactions.length, 0);
});

test('never treats an undecoded XLSX file as a successful import', () => {
  const rejected = Finance.previewImport(Finance.blankState(), { fileName: '支付宝账单.xlsx', text: '' });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, 'XLSX_DECODE_REQUIRED');

  const decoded = Finance.previewImport(Finance.blankState(), { fileName: '支付宝账单.xlsx', text: alipay, alreadyDecodedXlsx: true });
  assert.equal(decoded.ok, true);
  assert.equal(decoded.transactions.length, 1);
});

test('rejects screenshots instead of parsing binary image bytes as ledger rows', () => {
  const rejected = Finance.previewImport(Finance.blankState(), { fileName: '微信图片_20260823052559_1944_5.png', text: 'binary image bytes' });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, 'IMAGE_FILE_NOT_LEDGER');
});
