import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { parse } from 'acorn';

// Exercise the actual generated business functions, without starting a server
// or connecting to a real financial ledger.
async function generated(relative) {
  const source = await readFile(new URL(`../../public/local-apps/${relative}`, import.meta.url), 'utf8');
  const body = parse(source, { ecmaVersion: 'latest' }).body[0].expression.callee.body.body;
  return {
    source,
    declaration(name) {
      const node = body.find(item => item.type === 'FunctionDeclaration' ? item.id.name === name : item.type === 'VariableDeclaration' && item.declarations.some(value => value.id.name === name));
      assert.ok(node, `Generated declaration ${name} must exist`);
      return source.slice(node.start, node.end);
    },
  };
}
const inbox = await generated('finance-receipt-inbox-v12/app.js');
const center = await generated('finance-center-v2/finance-v2.js');

test('repeated legacy refresh preserves the embedded document and its open detail', () => {
  const frame = { contentWindow: { location: { hash: '#transactions' }, detail: { open: true } } };
  let summaryUpdates = 0;
  const panel = { set outerHTML(value) { assert.equal(value, '<section>updated summary</section>'); summaryUpdates++; } };
  const content = {
    set innerHTML(_) { assert.fail('Refreshing must not recreate the legacy iframe'); },
    querySelector: selector => selector === '.legacy-frame' ? frame : selector === '.legacy-merchant-panel' ? panel : null,
    querySelectorAll: () => [],
  };
  const context = vm.createContext({ content, makeMerchantGroups: () => [], renderLegacyMerchantPanel: () => '<section>updated summary</section>' });
  vm.runInContext(inbox.declaration('renderLegacy'), context);
  for (let index = 0; index < 5; index++) vm.runInContext('renderLegacy()', context);
  assert.equal(summaryUpdates, 5);
  assert.equal(frame.contentWindow.location.hash, '#transactions');
  assert.equal(frame.contentWindow.detail.open, true);
});

test('receipt polling does not render unchanged data and defers changed data during interaction', async () => {
  let incoming = [{ id: 'synthetic-receipt' }]; let editing = false; let renders = 0;
  const context = vm.createContext({
    records: [{ id: 'synthetic-receipt' }], connectionReady: true, eventSource: {},
    window: { PulseFinance: { isInteracting: () => editing } },
    render: () => renders++, setConnection() {}, ensureDesktopSession: async () => {},
    api: async () => ({ records: incoming }), toast() {}, startRealtime() {},
  });
  vm.runInContext([inbox.declaration('inboxRenderPending'), inbox.declaration('refreshInboxView'), inbox.declaration('loadInbox')].join('\n'), context);
  await vm.runInContext('loadInbox({ silent: true })', context);
  assert.equal(renders, 0);
  incoming = [...incoming, { id: 'new-receipt' }]; editing = true;
  await vm.runInContext('loadInbox({ silent: true })', context);
  assert.equal(renders, 0);
  editing = false;
  await vm.runInContext('loadInbox({ silent: true })', context);
  assert.equal(renders, 1);
  await vm.runInContext('loadInbox({ silent: true })', context);
  assert.equal(renders, 1);
});

function historyContext() {
  const rows = [
    { id: 'old-history', occurredAt: '2024-08-10T08:00:00Z', amountCents: 1200 },
    { id: 'recent-history', occurredAt: '2026-08-18T08:00:00Z', amountCents: 3400 },
  ];
  const fixedDate = class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-09-19T12:00:00Z'])); } };
  const context = vm.createContext({
    Date: fixedDate, visible: () => rows,
    state: { privacy: { hideAmounts: true } }, window: { PulseFinance: { amountsHidden: false } },
    formatter: new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 2 }),
  });
  vm.runInContext(['range', 'custom', 'rangeLabel', 'bounds', 'periodItems', 'money'].map(name => center.declaration(name)).join('\n'), context);
  return { context, rows };
}

test('default history includes prior months and years, while an explicit month still filters', async () => {
  const { context, rows } = historyContext();
  assert.equal(vm.runInContext('range', context), 'all');
  assert.equal(vm.runInContext('rangeLabel(range)', context), '全部时间');
  assert.equal(vm.runInContext('periodItems()', context), rows);
  assert.equal(vm.runInContext('periodItems().reduce((sum, row) => sum + row.amountCents, 0)', context), 4600);
  vm.runInContext("range = 'month'", context);
  assert.equal(vm.runInContext('periodItems().length', context), 0);
  const html = await readFile(new URL('../../public/local-apps/finance-center-v2/index.html', import.meta.url), 'utf8');
  assert.match(html, /<button data-range="all">全部时间<\/button>/);
});

test('visible money uses the viewing preference instead of the imported hidden flag', () => {
  const { context } = historyContext();
  assert.match(vm.runInContext('money(12345)', context), /123\.45/);
  vm.runInContext('window.PulseFinance.amountsHidden = true', context);
  assert.equal(vm.runInContext('money(12345)', context), '¥••••••');
  assert.equal(vm.runInContext('state.privacy.hideAmounts', context), true);
  assert.doesNotMatch(center.source, /state\.privacy\.hideAmounts\s*=/);
});

test('history trend aggregates the entire selected interval, including its last month', () => {
  const { context, rows } = historyContext();
  const summarized = [];
  context.Core = { summarize(items) { summarized.push(...items); return { incomeCents: 0, expenseCents: items.reduce((sum, item) => sum + item.amountCents, 0) }; } };
  context.empty = () => '';
  vm.runInContext(center.declaration('trend'), context);
  const html = vm.runInContext('trend(periodItems())', context);
  assert.match(html, /<svg /);
  assert.deepEqual(summarized.map(item => item.id), rows.map(item => item.id));
});

test('optional receipt synchronization does not mutate or save the cached ledger offline', async () => {
  const transaction = { id: 'cached', receiptRecordId: 'receipt-test', noteGrid: [{ remark: 'cached detail' }] };
  let writes = 0;
  const context = vm.createContext({
    state: { transactions: [transaction] }, window: { PulseFinance: { isReady: () => false } },
    loadReceiptRecords: async () => [{ id: 'receipt-test', noteGrid: [{ remark: 'remote detail' }] }],
    persist: () => writes++, route: 'transactions', filterTransactions() {},
  });
  vm.runInContext(center.declaration('syncReceiptGrids'), context);
  await vm.runInContext('syncReceiptGrids()', context);
  assert.equal(writes, 0);
  assert.equal(transaction.noteGrid[0].remark, 'cached detail');
});
