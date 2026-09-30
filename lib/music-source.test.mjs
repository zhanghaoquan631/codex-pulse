import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as musicTypes from './music-types.ts';

function sourceWithoutNetwork() {
  let requests = 0;
  const output = ts.transpileModule(readFileSync(new URL('./music-source.ts', import.meta.url), 'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  const exports = {};
  const run = new vm.Script('(function(require,exports,fetch,URL,URLSearchParams,AbortSignal,TextEncoder,TextDecoder){'+output+'\n})').runInThisContext();
  run(name => {if(name==='@/lib/music-types') return musicTypes;throw new Error('Unexpected module '+name);}, exports,
    async () => {requests++;throw new Error('The optional source inspection is unavailable');},
    URL, URLSearchParams, AbortSignal, TextEncoder, TextDecoder);
  return {source:exports,requests:()=>requests};
}

test('original playback can attempt its stream without optional inspection', async () => {
  const {source,requests}=sourceWithoutNetwork();
  const track={id:'fixture|42',source:'bilibili',engine:'go-music-dl',name:'Fixture & name',artist:'Artist',album:'',cover:'',duration:120,extra:{bvid:'fixture',cid:'42'}};
  const result=await source.resolveMusic(track);
  const url=new URL(result.url);
  assert.equal(requests(),0);
  assert.equal(url.origin,'https://music.zkkp.nyc.mn');
  assert.equal(url.pathname,'/music/download');
  assert.equal(url.searchParams.get('stream'),'1');
  assert.equal(url.searchParams.get('id'),track.id);
  assert.equal(url.searchParams.get('source'),track.source);
  assert.deepEqual(JSON.parse(url.searchParams.get('extra')),track.extra);
});

test('declared playback restrictions are still enforced', async () => {
  const {source,requests}=sourceWithoutNetwork();
  await assert.rejects(()=>source.resolveMusic({availability:'restricted',unavailableReason:'Permission required'}),/Permission required/);
  assert.equal(requests(),0);
});
