import assert from 'node:assert/strict';
import test from 'node:test';
import { extractReceiptFields } from './local-ocr.mjs';

test('extractReceiptFields creates editable suggestions from common Chinese receipt labels', () => {
  const receipt = extractReceiptFields('收款方：星巴克\n实付金额：¥38.50\n2026年08月22日 14:30', 91.4);

  assert.equal(receipt.amount, '38.50');
  assert.equal(receipt.merchant, '星巴克');
  assert.equal(receipt.occurredAt, '2026-08-22T14:30');
  assert.equal(receipt.confidence, 91);
  assert.equal(receipt.fieldsDetected, 3);
});

test('extractReceiptFields safely pre-fills only the first transaction in a transfer list', () => {
  const receipt = extractReceiptFields('转账-转给饿鱼（打语音让我看消息）\n8月21日 23:23\n-6.00\n转账-转给饿鱼\n8月21日 21:41\n-3.00', 88);

  assert.equal(receipt.amount, '6.00');
  assert.equal(receipt.merchant, '饿鱼');
  assert.equal(receipt.occurredAt, '2026-08-21T23:23');
  assert.equal(receipt.type, 'EXPENSE');
  assert.equal(receipt.transactionsDetected, 2);
  assert.equal(receipt.transactions.length, 2);
  assert.equal(receipt.transactions[1].amount, '3.00');
});

test('extractReceiptFields ignores capture-page labels when finding a transfer merchant', () => {
  const receipt = extractReceiptFields([
    '8月21日 23:23',
    '转账-转给饿鱼（打语音让我看消息...',
    '-3.00',
    '8月21日 21:41',
    '转账-转给饿鱼（打语音让我看消息...',
    '-3.00',
    '金额（可稍后在电脑填写）',
    '6.00',
    '交易类型',
    '支出',
    '商家／对方（可选）',
    '例如：咖啡店、朋友'
  ].join('\n'), 88);

  assert.equal(receipt.merchant, '饿鱼');
  assert.equal(receipt.transactions[0].merchant, '饿鱼');
  assert.equal(receipt.transactions[1].merchant, '饿鱼');
  assert.notEqual(receipt.merchant, '金额');
});

test('extractReceiptFields recognizes a transfer recipient when OCR drops the transfer separator', () => {
  const receipt = extractReceiptFields('转给饿鱼 打语音让我看消息\n8月22日 22:16\n-6.00', 88);

  assert.equal(receipt.merchant, '饿鱼');
  assert.equal(receipt.transactions[0].merchant, '饿鱼');
  assert.equal(receipt.transactions[0].occurredAt, '2026-08-22T22:16');
});

test('extractReceiptFields leaves a corrupted merchant blank instead of saving unreadable OCR text', () => {
  const receipt = extractReceiptFields('转账-转给\uFFFD\uFFFD\uFFFD\n8月21日 23:23\n-6.00', 88);

  assert.equal(receipt.merchant, '');
  assert.equal(receipt.transactions[0].merchant, '');
});

test('extractReceiptFields prefers an explicit handwritten receipt total and recognises it as income', () => {
  const receipt = extractReceiptFields('收款收据\n2023年10月19日\n客户：王小明\n合计：人民币 ￥28102', 76);

  assert.equal(receipt.amount, '28102');
  assert.equal(receipt.merchant, '王小明');
  assert.equal(receipt.occurredAt, '2023-10-19T00:00');
  assert.equal(receipt.type, 'INCOME');
});

test('extractReceiptFields does not pre-fill an uncertain total or invalid date from a handwritten grid receipt', () => {
  const receipt = extractReceiptFields('收款收据\n2021年18月19日\n十万千百十元角分\n合计 人民币 ￥2102', 91);

  assert.equal(receipt.amount, '');
  assert.equal(receipt.occurredAt, '');
  assert.equal(receipt.type, 'INCOME');
  assert.deepEqual(receipt.manualReviewReasons, ['金额', '日期']);
  assert.equal(receipt.requiresManualAmountReview, true);
  assert.equal(receipt.requiresManualDateReview, true);
});
