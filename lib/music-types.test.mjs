import test from 'node:test';
import assert from 'node:assert/strict';
import {readOriginalMusicExtra, validMusicExtra, validMusicTrack} from './music-types.ts';

test('original playback retains provider-specific IDs and quality candidates', () => {
  const identities = [
    {songmid:'003abc012', quality:'flac'},
    {hash:'c52128', sq_hash:'bb11', hq_hash:'aa22', album_audio_id:'12345', privilege:'1'},
    {content_id:'600547123', copyright_id:'600123456', resource_type:'2', format_type:'SQ', album_id:'10002'},
    {songid:'24680', songtype:'fc'},
    {songid:'abc+/=%123'},
    {track_id:'98765', tsid:'T1000123'},
  ];
  for (const identity of identities) {
    const extra = readOriginalMusicExtra({...identity, url:'https://media.example/temporary', cookie:'private'});
    assert.deepEqual(extra, identity);
    const parameters = new URLSearchParams({extra:JSON.stringify(extra)});
    assert.deepEqual(JSON.parse(parameters.get('extra')), identity);
  }
});

test('invalid required identity fails instead of silently producing an incomplete song', () => {
  for (const identity of [{songmid:123}, {hash:'x'.repeat(2001)}, {content_id:'bad\nvalue'}, {song_id:'猫'.repeat(1800)}]) {
    assert.throws(() => readOriginalMusicExtra(identity));
  }
  assert.equal(validMusicExtra({url:'http://127.0.0.1/private'}), false);
});

test('existing histories without metadata and with earlier identity keys stay valid', () => {
  assert.deepEqual(readOriginalMusicExtra(null), {});
  assert.deepEqual(readOriginalMusicExtra({}), {});
  const track = {id:'123',source:'qq',engine:'go-music-dl',name:'Song',artist:'Artist',album:'',cover:'',duration:120};
  assert.equal(validMusicTrack(track), true);
  assert.equal(validMusicTrack({...track,extra:{mid:'123',media_mid:'456'}}), true);
  assert.equal(validMusicTrack({...track,extra:{songmid:'canonical-123'}}), true);
  assert.equal(validMusicTrack({...track,id:'123|456'}), true);
  assert.equal(validMusicTrack({...track,id:'encoded+/=%123'}), true);
  assert.equal(validMusicTrack({...track,id:'123\n456'}), false);
});
