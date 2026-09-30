import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createSweetCamMobileBridge } from './sweetcam-mobile-bridge.mjs';

function cookie(response) {
  return String(response.headers.get('set-cookie') ?? '').split(';')[0];
}

test('local desktop pairing accepts a valid original image and exposes it to the desktop', async () => {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'sweetcam-mobile-bridge-'));
  const bridge = createSweetCamMobileBridge({ host: '127.0.0.1', port: 0, dataDirectory });
  await new Promise((resolve) => bridge.server.listen(0, '127.0.0.1', resolve));
  const port = bridge.server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const origin = 'http://127.0.0.1:5174';
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL0NwAAAABJRU5ErkJggg==', 'base64');
  const heic = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0x00, 0x00, 0x00, 0x00]);
  try {
    const noTrust = await fetch(`${base}/v1/sweetcam/mobile/desktop-session`, { headers: { Origin: 'http://not-trusted.example' } });
    assert.equal(noTrust.status, 403);

    const desktopResponse = await fetch(`${base}/v1/sweetcam/mobile/desktop-session`, { headers: { Origin: origin } });
    assert.equal(desktopResponse.status, 200);
    assert.equal(desktopResponse.headers.get('access-control-allow-origin'), origin);
    const desktopCookie = cookie(desktopResponse);

    const inviteResponse = await fetch(`${base}/v1/sweetcam/mobile/invite`, { method: 'POST', headers: { Origin: origin, Cookie: desktopCookie } });
    assert.equal(inviteResponse.status, 200);
    const invite = await inviteResponse.json();
    const pairExchange = await fetch(invite.mobileUrl, { redirect: 'manual' });
    assert.equal(pairExchange.status, 303);
    assert.equal(pairExchange.headers.get('location'), '/studio/index.html');
    const mobileCookie = cookie(pairExchange);
    assert.match(pairExchange.headers.get('set-cookie'), /HttpOnly/u);

    const consumedLink = await fetch(invite.mobileUrl, { redirect: 'manual' });
    assert.equal(consumedLink.status, 401);
    const studioWithoutCookie = await fetch(`${base}/studio/index.html`);
    const assetWithoutCookie = await fetch(`${base}/studio/sweetcam.css`);
    assert.equal(studioWithoutCookie.status, 401);
    assert.equal(assetWithoutCookie.status, 401);
    const studioResponse = await fetch(`${base}/studio/index.html`, { headers: { Cookie: mobileCookie } });
    assert.equal(studioResponse.status, 200);
    assert.match(studioResponse.headers.get('content-type'), /^text\/html/u);
    assert.match(await studioResponse.text(), /SweetCam/u);
    const cssResponse = await fetch(`${base}/studio/sweetcam.css`, { headers: { Cookie: mobileCookie } });
    const scriptResponse = await fetch(`${base}/studio/sweetcam.js`, { headers: { Cookie: mobileCookie } });
    assert.equal(cssResponse.status, 200);
    assert.equal(scriptResponse.status, 200);
    assert.match(cssResponse.headers.get('content-type'), /^text\/css/u);
    assert.match(scriptResponse.headers.get('content-type'), /^text\/javascript/u);

    const badType = await fetch(`${base}/v1/sweetcam/mobile/uploads`, {
      method: 'POST',
      headers: { Cookie: mobileCookie, 'Content-Type': 'text/plain' },
      body: 'not media',
    });
    assert.equal(badType.status, 415);
    const badMagic = await fetch(`${base}/v1/sweetcam/mobile/uploads`, {
      method: 'POST',
      headers: { Cookie: mobileCookie, 'Content-Type': 'image/png' },
      body: 'not a png',
    });
    assert.equal(badMagic.status, 415);

    const uploadResponse = await fetch(`${base}/v1/sweetcam/mobile/uploads`, {
      method: 'POST',
      headers: { Cookie: mobileCookie, 'Content-Type': 'image/png', 'X-SweetCam-Filename': encodeURIComponent('phone-photo.png') },
      body: png,
    });
    assert.equal(uploadResponse.status, 201);
    const uploaded = await uploadResponse.json();
    assert.equal(uploaded.media.kind, 'photo');
    assert.equal(uploaded.media.fileName, 'phone-photo.png');

    const heicUpload = await fetch(`${base}/v1/sweetcam/mobile/uploads`, {
      method: 'POST',
      headers: { Cookie: mobileCookie, 'Content-Type': 'image/heic', 'X-SweetCam-Filename': encodeURIComponent('iphone-original.heic') },
      body: heic,
    });
    assert.equal(heicUpload.status, 201);
    const uploadedHeic = await heicUpload.json();
    assert.equal(uploadedHeic.media.fileName, 'iphone-original.heic');

    const listResponse = await fetch(`${base}/v1/sweetcam/media`, { headers: { Origin: origin, Cookie: desktopCookie } });
    assert.equal(listResponse.status, 200);
    const listed = await listResponse.json();
    assert.equal(listed.media.length, 2);
    assert.ok(listed.media.some((media) => media.id === uploaded.media.id));
    assert.ok(listed.media.some((media) => media.id === uploadedHeic.media.id));

    const fileResponse = await fetch(`${base}${uploaded.media.mediaUrl}`, { headers: { Origin: origin, Cookie: desktopCookie } });
    assert.equal(fileResponse.status, 200);
    assert.equal(fileResponse.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await fileResponse.arrayBuffer()), png);

    const heicFileResponse = await fetch(`${base}${uploadedHeic.media.mediaUrl}`, { headers: { Origin: origin, Cookie: desktopCookie } });
    assert.equal(heicFileResponse.status, 200);
    assert.equal(heicFileResponse.headers.get('content-type'), 'image/heic');
    assert.deepEqual(Buffer.from(await heicFileResponse.arrayBuffer()), heic);
  } finally {
    await new Promise((resolve) => bridge.server.close(resolve));
    rmSync(dataDirectory, { recursive: true, force: true });
  }
});
