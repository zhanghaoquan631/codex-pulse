import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory,IDBKeyRange} from 'fake-indexeddb';
import {createRecordingStore,recordingFileName} from '../client/live-recording-store.mjs';
import {uploadRecordedReplay} from '../client/live-upload.mjs';
import {environment,call} from './fixtures.mjs';
test('browser stored replay uploads through real Worker endpoints into one pending/history item',async()=>{
  const env=environment(),store=createRecordingStore({indexedDB:new IDBFactory(),IDBKeyRange});
  try{
    const id=await store.createSession({layout:'portrait',mime:'video/mp4',platform:'douyin',title:'固定构图回放',startedAt:'2026-09-30T01:00:00Z'});
    // Container signature fixture exercises transport; this is not a camera recording.
    const bytes=new Uint8Array(128);bytes.set(new TextEncoder().encode('....ftypisom'));
    await store.append(id,new Blob([bytes.slice(0,45)]));await store.append(id,new Blob([bytes.slice(45)]));await store.markComplete(id,{endedAt:'2026-09-30T01:01:00Z'});
    const record=await store.getSession(id),source={...record,fileName:recordingFileName(record),readRange:(start,end)=>store.readRange(id,start,end)};
    const request=async(path,options)=>{const response=await call(env,path,{...options,body:options.body instanceof Blob?new Uint8Array(await options.body.arrayBuffer()):options.body});const result=await response.json();assert.ok(response.ok,result.error);return result;};
    const receipt=await uploadRecordedReplay(source,{request});await store.markUploaded(id,{cloudItemId:receipt.item.id});await uploadRecordedReplay(source,{request});
    const state=await (await call(env,'/api/state')).json();assert.equal(state.content.length,1);const item=state.content[0];
    assert.equal(item.id,receipt.item.id);assert.equal(item.kind,'live-replay');assert.equal(item.status,'pending');assert.equal(item.livePlatform,'douyin');assert.match(item.fileName,/\.mp4$/);assert.deepEqual(new Uint8Array(await (await call(env,item.fileUrl)).arrayBuffer()),bytes);
    assert.equal((await store.getSession(id)).cloudItemId,item.id);assert.equal((await store.exportBlob(id)).blob.size,128);
  }finally{await store.close();env.close();}
});
