import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const root = process.env.RACING_TEST_ROOT ? pathToFileURL(path.resolve(process.env.RACING_TEST_ROOT) + path.sep) : new URL('../', import.meta.url);
const audioUrl = process.env.RACING_AUDIO_FILE ? pathToFileURL(path.resolve(process.env.RACING_AUDIO_FILE)) : new URL('apps/racing/assets/racing-audio.js', root);
const { installRacingAudioGuard } = await import(audioUrl);
const { h: { Howl, Howler } } = await import(new URL('apps/racing/assets/media-vendor-B3vTC4Y3.js', root));
function fixture() {
  const howl = new Howl({ src: ['test.ogg'], preload: false, volume: 0 });
  const sound = { _id: 100001 + Howler._howls.length, _volume: 0, _rate: 1, _paused: true, _sprite: '__default', _seek: 0,
    _node: { volume: 0, playbackRate: 1, currentTime: 0 }, _pannerAttr: {} };
  howl._sounds = [sound]; howl._sprite = { __default: [0, 10000] }; howl._state = 'loading'; howl._webAudio = false;
  return { howl, sound };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
test('preserved Howler reproduces the recursive parameter-queue crash before the guard', () => {
  const { howl } = fixture();
  for (let i = 0; i < 8000; i++) { howl.volume((i % 100) / 100); howl.rate(.9 + (i % 20) / 100); }
  assert.equal(howl._queue.length, 16000);
  howl._state = 'loaded';
  assert.throws(() => howl._loadQueue(), RangeError);
  // This deliberately corrupted reproduction instance is not used afterward.
  howl._queue.length = 0;
});
test('8000 loading frames retain only latest parameters and audible playback parameters still apply', async () => {
  const guard = installRacingAudioGuard(Howl), { howl, sound } = fixture();
  for (let i = 0; i < 8000; i++) { howl.volume((i % 100) / 100); howl.rate(.9 + (i % 20) / 100); }
  assert.equal(howl._queue.length, 0);
  assert.equal(guard.pendingCount(howl), 2);
  howl._state = 'loaded'; howl._emit('load'); await tick();
  assert.equal(guard.pendingCount(howl), 0);
  assert.equal(sound._node.volume, .99);
  assert.ok(Math.abs(sound._node.playbackRate - 1.09) < 1e-8);
  howl.volume(.6); howl.rate(.97);
  assert.equal(sound._node.volume, .6); assert.equal(sound._node.playbackRate, .97);
  assert.equal(howl.volume(), .6); assert.equal(howl.rate(sound._id), .97);
});
test('audio play-lock stays bounded, per-sound values survive unlock, and newest ready write wins', async () => {
  const guard = installRacingAudioGuard(Howl), { howl, sound } = fixture();
  howl._state = 'loaded'; howl._playLock = true;
  for (let i = 0; i < 8000; i++) { howl.volume(.2, sound._id); howl.rate(1.1, sound._id); }
  assert.equal(howl._queue.length, 0); assert.equal(guard.pendingCount(howl), 2);
  howl._emit('unlock'); await tick(); assert.equal(guard.pendingCount(howl), 2);
  howl._playLock = false; howl.volume(.7, sound._id); howl._emit('play', sound._id); await tick();
  assert.equal(sound._node.volume, .7); assert.equal(sound._node.playbackRate, 1.1);
  assert.equal(guard.pendingCount(howl), 0);
  assert.equal(installRacingAudioGuard(Howl), guard, 'installation must be idempotent');
});
test('real Howler stereo updates are coalesced while WebAudio loads and applied afterward', async () => {
  const guard = installRacingAudioGuard(Howl), { howl, sound } = fixture();
  const originalContext = Howler.ctx; let pan = 0;
  try {
    Howler.ctx = { currentTime: 0, createStereoPanner() {} };
    howl._webAudio = true; sound._panner = { pan: { setValueAtTime(value) { pan = value; } } };
    for (let i = 0; i < 8000; i++) howl.stereo(i % 2 ? .4 : -.4, sound._id);
    assert.equal(howl._queue.length, 0); assert.equal(guard.pendingCount(howl), 1);
    howl._state = 'loaded'; howl._emit('load'); await tick();
    assert.equal(pan, .4); assert.equal(guard.pendingCount(howl), 0);
  } finally { Howler.ctx = originalContext; }
});
test('engine installs guard before any audio instance and keeps its original sound calls', async () => {
  const bundleUrl = process.env.RACING_AUDIO_BUNDLE ? pathToFileURL(path.resolve(process.env.RACING_AUDIO_BUNDLE)) : new URL('apps/racing/assets/index-BHLGw_OM.js', root);
  const code = await fs.readFile(bundleUrl, 'utf8');
  assert.equal(code.split('installRacingAudioGuard(_0.Howl);').length, 2);
  assert.ok(code.indexOf('installRacingAudioGuard(_0.Howl);') < code.indexOf('new _0.Howl('));
  assert.ok(code.includes('r.howl.volume(r.currentVolume),r.howl.rate(r.currentRate)'));
});

test('group and per-sound updates preserve last-write order across the unlock boundary', async () => {
  const { howl, sound } = fixture();
  howl.volume(.1, sound._id); howl.volume(.2); howl.volume(.8, sound._id);
  howl._state = 'loaded'; howl._emit('load'); await tick();
  assert.equal(sound._volume, .8);
  howl._playLock = true; howl.volume(.3); howl.rate(1.1, sound._id);
  howl._playLock = false; howl.volume(.9, sound._id); howl._emit('play', sound._id); await tick();
  assert.equal(sound._volume, .9); assert.equal(sound._rate, 1.1);
});
