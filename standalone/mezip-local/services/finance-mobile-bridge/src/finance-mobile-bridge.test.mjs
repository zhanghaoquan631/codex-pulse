import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createFinanceMobileBridge } from './finance-mobile-bridge.mjs';

async function start() {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'mezip-finance-mobile-'));
  const bridge = createFinanceMobileBridge({ host: '127.0.0.1', port: 0, dataDirectory });
  await new Promise((resolve) => bridge.server.listen(0, '127.0.0.1', resolve));
  const port = bridge.server.address().port;
  return { ...bridge, port, dataDirectory };
}
function cookie(response) { return (response.headers.get('set-cookie') || '').split(';')[0]; }

test('the mobile bridge binds to the trusted LAN by default so a phone never receives a loopback link', () => {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'mezip-finance-default-host-'));
  const bridge = createFinanceMobileBridge({ port: 0, dataDirectory });
  try {
    assert.equal(bridge.host, '0.0.0.0');
  } finally {
    bridge.server.close();
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('mobile pairing links default to a practical 24-hour window and remain bounded', async () => {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'mezip-finance-invite-expiry-'));
  const bridge = createFinanceMobileBridge({ host: '127.0.0.1', port: 0, dataDirectory });
  await new Promise((resolve) => bridge.server.listen(0, '127.0.0.1', resolve));
  try {
    const desktopOrigin = 'http://127.0.0.1:5174';
    const desktop = await fetch(`http://127.0.0.1:${bridge.server.address().port}/v1/finance/mobile/desktop-session`, { headers: { Origin: desktopOrigin } });
    const invitation = await fetch(`http://127.0.0.1:${bridge.server.address().port}/v1/finance/mobile/invite`, { headers: { Origin: desktopOrigin, Cookie: cookie(desktop) } });
    const invite = await invitation.json();
    assert.equal(invite.expiresInMinutes, 24 * 60);
    assert.ok(Date.parse(invite.expiresAt) - Date.now() > (23 * 60 + 59) * 60 * 1000);
  } finally {
    bridge.server.close();
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('mobile pairing links can be explicitly made permanent for the V12 capture page', async () => {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'mezip-finance-invite-permanent-'));
  const bridge = createFinanceMobileBridge({ host: '127.0.0.1', port: 0, dataDirectory });
  await new Promise((resolve) => bridge.server.listen(0, '127.0.0.1', resolve));
  try {
    const desktopOrigin = 'http://127.0.0.1:5174';
    const base = `http://127.0.0.1:${bridge.server.address().port}`;
    const desktop = await fetch(`${base}/v1/finance/mobile/desktop-session`, { headers: { Origin: desktopOrigin } });
    const invitation = await fetch(`${base}/v1/finance/mobile/invite?version=v2&permanent=1`, {
      headers: { Origin: desktopOrigin, Cookie: cookie(desktop) },
    });
    assert.equal(invitation.status, 200);
    const invite = await invitation.json();
    assert.equal(invite.permanent, true);
    assert.equal(invite.expiresAt, null);
    assert.equal(invite.expiresInMinutes, null);

    const mobile = await fetch(invite.mobileUrl);
    assert.equal(mobile.status, 200);
  } finally {
    bridge.server.close();
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});

test('paired mobile photo is durably received and only desktop may confirm it', async () => {
  const bridge = await start();
  try {
    const desktopOrigin = 'http://127.0.0.1:5174';
    const desktop = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/desktop-session`, { headers: { Origin: desktopOrigin } });
    assert.equal(desktop.status, 200);
    const desktopCookie = cookie(desktop);
    const invitation = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/invite?version=v2`, { headers: { Origin: desktopOrigin, Cookie: desktopCookie } });
    assert.equal(invitation.status, 200);
    const invite = await invitation.json();
    assert.match(invite.mobileUrl, /\/mobile\?pair=.*&version=v2/u);

    const mobile = await fetch(invite.mobileUrl);
    assert.equal(mobile.status, 200);
    const mobileCookie = cookie(mobile);
    const mobilePage = await mobile.text();
    assert.match(mobilePage, /从相册选择/u);
    assert.match(mobilePage, /new FileReader/u);
    assert.match(mobilePage, /requiresManualDateReview/u);
    assert.match(mobilePage, /商品明细表可左右滑动填写，不会撑开手机页面/u);
    assert.match(mobilePage, /\.receipt-grid\{width:100%;min-width:0;max-width:100%/u);
    assert.match(mobilePage, /\.receipt-grid-scroll\{width:100%;max-width:100%;overflow-x:auto/u);
    assert.doesNotMatch(mobilePage, /String\.fromCharCode\(\.\.\.new Uint8Array\(raw\)\)/u);

    const recognize = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/recognize`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: mobileCookie },
      body: JSON.stringify({ mimeType: 'image/jpeg', imageDataUrl: 'data:image/jpeg;base64,/9j/2Q==' }),
    });
    assert.equal(recognize.status, 200);
    assert.match((await recognize.json()).status, /^(?:OCR_SUGGESTIONS_READY|OCR_NO_SAFE_SUGGESTIONS|OCR_FAILED|LOCAL_OCR_UNAVAILABLE)$/u);

    const upload = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/receipts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: mobileCookie },
      body: JSON.stringify({ mimeType: 'image/jpeg', fileName: 'receipt.jpg', imageDataUrl: 'data:image/jpeg;base64,/9j/2Q==', amount: '38.50', merchant: '咖啡店', type: 'EXPENSE' }),
    });
    assert.equal(upload.status, 201);
    const created = await upload.json();
    assert.equal(created.record.status, 'PENDING_REVIEW');

    const unauthenticated = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/receipts`);
    assert.equal(unauthenticated.status, 401);
    const inbox = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/receipts`, { headers: { Origin: desktopOrigin, Cookie: desktopCookie } });
    assert.equal(inbox.status, 200);
    const listed = await inbox.json();
    assert.equal(listed.records.length, 1);

    const patched = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/receipts/${created.record.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: desktopOrigin, Cookie: desktopCookie },
      body: JSON.stringify({
        merchant: '咖啡店（门店）',
        occurredAt: '2026-08-23T12:30:00.000Z',
        note: '午餐收据',
        noteGrid: [{ sku: 'A-01', nameSpec: '拿铁咖啡', unit: '杯', quantity: '1', unitPrice: '38.50', amount: '38.50', remark: '少冰' }],
      }),
    });
    assert.equal(patched.status, 200);
    const patchedRecord = (await patched.json()).record;
    assert.equal(patchedRecord.merchant, '咖啡店（门店）');
    assert.equal(patchedRecord.noteGrid[0].nameSpec, '拿铁咖啡');

    const image = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/receipts/${created.record.id}/image`, { headers: { Origin: desktopOrigin, Cookie: desktopCookie } });
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/jpeg');
    const download = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/receipts/${created.record.id}/image?download=1`, { headers: { Origin: desktopOrigin, Cookie: desktopCookie } });
    assert.equal(download.status, 200);
    assert.match(download.headers.get('content-disposition') || '', /^attachment;/u);

    const confirm = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/receipts/${created.record.id}/confirm`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: desktopOrigin, Cookie: desktopCookie }, body: JSON.stringify({ ledgerEntryId: `mobile-receipt-${created.record.id.slice('receipt-'.length)}` }),
    });
    assert.equal(confirm.status, 200);
    assert.equal((await confirm.json()).record.status, 'CONFIRMED_TO_DESKTOP');

    const reopen = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/receipts/${created.record.id}/reopen`, {
      method: 'POST', headers: { Origin: desktopOrigin, Cookie: desktopCookie },
    });
    assert.equal(reopen.status, 200);
    assert.equal((await reopen.json()).record.status, 'PENDING_REVIEW');
    const reconfirm = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/receipts/${created.record.id}/confirm`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: desktopOrigin, Cookie: desktopCookie }, body: JSON.stringify({ ledgerEntryId: `mobile-receipt-${created.record.id.slice('receipt-'.length)}` }),
    });
    assert.equal(reconfirm.status, 200);
    assert.equal((await reconfirm.json()).record.status, 'CONFIRMED_TO_DESKTOP');
    const reopenForRemoval = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/receipts/${created.record.id}/reopen`, {
      method: 'POST', headers: { Origin: desktopOrigin, Cookie: desktopCookie },
    });
    assert.equal(reopenForRemoval.status, 200);
    const remove = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/receipts/${created.record.id}/remove`, {
      method: 'POST', headers: { Origin: desktopOrigin, Cookie: desktopCookie },
    });
    assert.equal(remove.status, 200);
    assert.equal((await remove.json()).removedId, created.record.id);
    const afterRemoval = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/receipts`, { headers: { Origin: desktopOrigin, Cookie: desktopCookie } });
    assert.equal((await afterRemoval.json()).records.length, 0);
    const removedImage = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/receipts/${created.record.id}/image`, { headers: { Origin: desktopOrigin, Cookie: desktopCookie } });
    assert.equal(removedImage.status, 404);
  } finally {
    await new Promise((resolve) => bridge.server.close(resolve));
    rmSync(bridge.dataDirectory, { recursive: true, force: true });
  }
});

test('desktop can reject a pending receipt without writing it to a ledger', async () => {
  const bridge = await start();
  try {
    const desktopOrigin = 'http://127.0.0.1:5174';
    const desktop = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/desktop-session`, { headers: { Origin: desktopOrigin } });
    const desktopCookie = cookie(desktop);
    const invite = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/invite?version=v2`, { headers: { Origin: desktopOrigin, Cookie: desktopCookie } });
    const mobile = await fetch((await invite.json()).mobileUrl);
    const mobileCookie = cookie(mobile);
    const upload = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/receipts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: mobileCookie },
      body: JSON.stringify({ mimeType: 'image/jpeg', imageDataUrl: 'data:image/jpeg;base64,/9j/2Q==' }),
    });
    const created = await upload.json();
    const rejected = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/receipts/${created.record.id}/reject`, { method: 'POST', headers: { Origin: desktopOrigin, Cookie: desktopCookie } });
    assert.equal(rejected.status, 200);
    assert.equal((await rejected.json()).record.status, 'REJECTED');
    const confirm = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/receipts/${created.record.id}/confirm`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: desktopOrigin, Cookie: desktopCookie }, body: JSON.stringify({ ledgerEntryId: `mobile-receipt-${created.record.id.slice('receipt-'.length)}` }),
    });
    assert.equal(confirm.status, 409);
  } finally {
    await new Promise((resolve) => bridge.server.close(resolve));
    rmSync(bridge.dataDirectory, { recursive: true, force: true });
  }
});

test('a multi-transaction screenshot creates separate pending records that share one local receipt image', async () => {
  const bridge = await start();
  try {
    const desktopOrigin = 'http://127.0.0.1:5174';
    const desktop = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/desktop-session`, { headers: { Origin: desktopOrigin } });
    const desktopCookie = cookie(desktop);
    const invite = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/invite?version=v2`, { headers: { Origin: desktopOrigin, Cookie: desktopCookie } });
    const mobile = await fetch((await invite.json()).mobileUrl);
    const mobileCookie = cookie(mobile);
    const batch = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/receipts/batch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: mobileCookie },
      body: JSON.stringify({
        mimeType: 'image/jpeg', imageDataUrl: 'data:image/jpeg;base64,/9j/2Q==',
        transactions: [
          { amount: '6.00', merchant: '对方一', occurredAt: '2026-08-22T22:16', type: 'EXPENSE' },
          { amount: '3.00', merchant: '对方二', occurredAt: '2026-08-22T21:39', type: 'EXPENSE' },
        ],
      }),
    });
    assert.equal(batch.status, 201);
    const created = await batch.json();
    assert.equal(created.records.length, 2);
    assert.ok(created.records.every((record) => record.status === 'PENDING_REVIEW'));
    assert.ok(created.records.every((record) => record.source === 'MOBILE_OCR_BATCH'));
    const inbox = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/receipts`, { headers: { Origin: desktopOrigin, Cookie: desktopCookie } });
    const listed = await inbox.json();
    assert.equal(listed.records.length, 2);
    assert.equal(new Set(listed.records.map((record) => record.batchId)).size, 1);
  } finally {
    await new Promise((resolve) => bridge.server.close(resolve));
    rmSync(bridge.dataDirectory, { recursive: true, force: true });
  }
});

test('desktop image import routes screenshots to the pending inbox instead of the ledger-file importer', async () => {
  const bridge = await start();
  try {
    const desktopOrigin = 'http://127.0.0.1:5174';
    const desktop = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/desktop-session`, { headers: { Origin: desktopOrigin } });
    const desktopCookie = cookie(desktop);
    const imported = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/desktop-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: desktopOrigin, Cookie: desktopCookie },
      body: JSON.stringify({
        mimeType: 'image/jpeg',
        fileName: 'wechat-bill-screenshot.jpg',
        imageDataUrl: 'data:image/jpeg;base64,/9j/2Q==',
      }),
    });
    assert.equal(imported.status, 201);
    const body = await imported.json();
    assert.equal(body.records.length, 1);
    assert.equal(body.records[0].status, 'PENDING_REVIEW');
    assert.equal(body.records[0].source, 'DESKTOP_IMAGE_IMPORT');
    assert.ok(['LOCAL_OCR_UNAVAILABLE', 'OCR_FAILED', 'OCR_NO_SAFE_SUGGESTIONS', 'OCR_SUGGESTIONS_READY'].includes(body.ocr.status));

    const inbox = await fetch(`http://127.0.0.1:${bridge.port}/v1/finance/mobile/receipts`, { headers: { Origin: desktopOrigin, Cookie: desktopCookie } });
    const listed = await inbox.json();
    assert.equal(listed.records.length, 1);
    assert.equal(listed.records[0].source, 'DESKTOP_IMAGE_IMPORT');
  } finally {
    await new Promise((resolve) => bridge.server.close(resolve));
    rmSync(bridge.dataDirectory, { recursive: true, force: true });
  }
});
