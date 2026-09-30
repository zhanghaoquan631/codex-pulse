import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createLifeMobileBridge } from './life-mobile-bridge.mjs';

function cookie(response) { return String(response.headers.get('set-cookie') ?? '').split(';')[0]; }

test('paired mobile upload is durable and supports independent reactions and comments', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mezip-life-'));
  const bridge = createLifeMobileBridge({ host: '127.0.0.1', port: 0, dataDirectory: directory });
  await new Promise((resolve) => bridge.server.listen(0, '127.0.0.1', resolve));
  const port = bridge.server.address().port; const base = `http://127.0.0.1:${port}`;
  try {
    const desktopResponse = await fetch(`${base}/v1/life/desktop-session`); const desktopCookie = cookie(desktopResponse);
    assert.equal((await desktopResponse.json()).status, 'READY');
    const invite = await fetch(`${base}/v1/life/invite?module=reading`, { headers: { Cookie: desktopCookie, Origin: 'http://127.0.0.1:5174' } });
    const inviteBody = await invite.json(); assert.equal(inviteBody.permanent, true);
    const mobileUrl = new URL(inviteBody.mobileUrl); mobileUrl.host = `127.0.0.1:${port}`;
    const mobileOpen = await fetch(mobileUrl); const mobileCookie = cookie(mobileOpen); assert.match(await mobileOpen.text(), /读书感悟/u);
    const saved = await fetch(`${base}/v1/life/mobile/entries`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: mobileCookie }, body: JSON.stringify({ title: '阅读笔记', tags: '设计,灵感', meta: { '阅读进度': '42 页' }, fileName: 'reading-note.png', mimeType: 'image/png', imageDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL0NwAAAABJRU5ErkJggg==' }) });
    const savedBody = await saved.json(); assert.equal(saved.status, 201); assert.equal(savedBody.status, 'SAVED_LOCAL');
    const entryId = savedBody.entry.id;
    const reacted = await fetch(`${base}/v1/life/entries/${entryId}/react`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: mobileCookie }, body: JSON.stringify({ action: 'like' }) });
    assert.equal((await reacted.json()).entry.likeCount, 1);
    const commented = await fetch(`${base}/v1/life/entries/${entryId}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: mobileCookie }, body: JSON.stringify({ content: '这条感悟很棒。' }) });
    assert.equal((await commented.json()).entry.commentCount, 1);
    const listed = await fetch(`${base}/v1/life/entries`, { headers: { Cookie: desktopCookie, Origin: 'http://127.0.0.1:5174' } }); const listedBody = await listed.json();
    assert.equal(listedBody.entries[0].title, '阅读笔记'); assert.equal(listedBody.entries[0].meta['阅读进度'], '42 页'); assert.equal(listedBody.entries[0].commentCount, 1);
    const image = await fetch(`${base}${listedBody.entries[0].imageUrl}`, { headers: { Cookie: desktopCookie, Origin: 'http://127.0.0.1:5174' } });
    assert.equal(image.status, 200); assert.equal(image.headers.get('content-type'), 'image/png'); assert.ok((await image.arrayBuffer()).byteLength > 8);
  } finally { await new Promise((resolve) => bridge.server.close(resolve)); rmSync(directory, { recursive: true, force: true }); }
});

test('study records support multi-image history, library sharing and deletion cleanup', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mezip-study-'));
  const bridge = createLifeMobileBridge({ host: '127.0.0.1', port: 0, dataDirectory: directory });
  await new Promise((resolve) => bridge.server.listen(0, '127.0.0.1', resolve));
  const port = bridge.server.address().port; const base = `http://127.0.0.1:${port}`;
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL0NwAAAABJRU5ErkJggg==';
  try {
    const desktop = await fetch(`${base}/v1/life/desktop-session`); const desktopCookie = cookie(desktop);
    const invite = await fetch(`${base}/v1/life/invite?module=study-math&studyArea=${encodeURIComponent('创新题')}`, { headers: { Cookie: desktopCookie, Origin: 'http://127.0.0.1:5174' } });
    const inviteBody = await invite.json(); assert.equal(inviteBody.permanent, true);
    const mobileUrl = new URL(inviteBody.mobileUrl); mobileUrl.host = `127.0.0.1:${port}`; assert.equal(mobileUrl.searchParams.get('studyArea'), '创新题');
    const mobile = await fetch(mobileUrl); const mobileCookie = cookie(mobile); const mobileMarkup = await mobile.text(); assert.match(mobileMarkup, /数学精选题/u); assert.match(mobileMarkup, /<option value="创新题" selected>创新题<\/option>/u);
    const create = await fetch(`${base}/v1/life/mobile/entries`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: mobileCookie },
      body: JSON.stringify({
        title: '函数综合题', tags: '函数,易错题', questionType: '函数与方程', studyArea: '创新题', body: '先确认定义域，再分段讨论。',
        meta: { '学习过程': '画图并检验边界。', '本次总结': '以后先写定义域。' }, reminderAt: '2026-08-26T18:30',
        images: [{ dataUrl: png, mimeType: 'image/png', fileName: 'question.png' }, { dataUrl: png, mimeType: 'image/png', fileName: 'steps.png' }],
      }),
    });
    const created = await create.json(); assert.equal(create.status, 201); assert.equal(created.entry.librarySaved, false); assert.equal(created.entry.media.length, 2);
    const entryId = created.entry.id;
    const ordinary = await fetch(`${base}/v1/life/mobile/entries`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: mobileCookie },
      body: JSON.stringify({ title: '普通题记录', body: 'A'.repeat(11000), questionType: '函数与方程' }),
    });
    const ordinaryBody = await ordinary.json(); assert.equal(ordinary.status, 201); assert.equal(ordinaryBody.entry.studyArea, '普通题记录'); assert.equal(ordinaryBody.entry.body.length, 11000);
    const history = await fetch(`${base}/v1/life/entries?module=study-math`, { headers: { Cookie: mobileCookie } }); const historyBody = await history.json();
    assert.equal(historyBody.entries.length, 2); const innovationEntry = historyBody.entries.find((entry) => entry.id === entryId); assert.equal(innovationEntry.questionType, '函数与方程'); assert.equal(innovationEntry.studyArea, '创新题'); assert.equal(innovationEntry.media.length, 2);
    const library = await fetch(`${base}/v1/life/entries/${entryId}/library`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: mobileCookie }, body: JSON.stringify({ saved: true }) });
    assert.equal((await library.json()).entry.librarySaved, true);
    const share = await fetch(`${base}/v1/life/entries/${entryId}/share`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: mobileCookie }, body: '{}' }); const shared = await share.json();
    assert.equal(share.status, 200); assert.match(shared.shareUrl, /\/share\?entry=/u); assert.equal(shared.network, 'TRUSTED_LAN_ONLY');
    const sharedUrl = new URL(shared.shareUrl); sharedUrl.host = `127.0.0.1:${port}`;
    const sharedPage = await fetch(sharedUrl); assert.equal(sharedPage.status, 200); assert.match(await sharedPage.text(), /函数综合题/u);
    const image = await fetch(`${base}/v1/life/media/${entryId}/1`, { headers: { Cookie: mobileCookie } }); assert.equal(image.status, 200);
    const deleted = await fetch(`${base}/v1/life/entries/${entryId}`, { method: 'DELETE', headers: { Cookie: desktopCookie, Origin: 'http://127.0.0.1:5174' } }); assert.equal(deleted.status, 200);
    assert.equal((await fetch(sharedUrl)).status, 404);
    assert.notEqual((await fetch(`${base}/v1/life/media/${entryId}/0`, { headers: { Cookie: mobileCookie } })).status, 200);
  } finally { await new Promise((resolve) => bridge.server.close(resolve)); rmSync(directory, { recursive: true, force: true }); }
});
