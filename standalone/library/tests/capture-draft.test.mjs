import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const helper=readFileSync(new URL('../public/capture-draft.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const storage=()=>{const records=new Map();return {getItem:key=>records.get(key)||null,setItem:(key,value)=>records.set(key,value),removeItem:key=>records.delete(key)};};
function harness(store=storage()) {
  const elements=new Map(),hint={},button={};let open=false;
  const get=id=>{if(!elements.has(id))elements.set(id,{value:'',focus(){}});return elements.get(id);};
  const context=vm.createContext({localStorage:store,document:{getElementById:get,querySelector:()=>button},
    modalBackdrop:{classList:{contains:()=>open,add(){open=true;},remove(){open=false;}},querySelector:()=>hint},
    composerSession:0,editingId:null,composerDraftId:null,composerAutomatic:{},composerPreviewData:null,composerDraftBase:null,composerDraftPending:null,
    previewTimer:null,previewGeneration:0,previewPending:false,contentItems:[],setTimeout:()=>0,clearTimeout(){},
    renderComposerPreview(){},showToast(){},escapeHtml:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;'),safeUrl:value=>value,fetch:async()=>({ok:true,json:async()=>({})})});
  vm.runInContext(helper,context);
  vm.runInContext(app.slice(app.indexOf('function openComposer('),app.indexOf("modalBackdrop.querySelector('.modal-foot")),context);
  vm.runInContext(app.slice(app.indexOf('async function previewLink('),app.indexOf('function openNewsletterComposer(')),context);
  Object.assign(context,{apiEnabled:true,safeMediaUrl:value=>value,localFileUrl:value=>String(value).startsWith('/api/files/'),persistState:async()=>{},renderLibrary(){}});
  vm.runInContext(app.slice(app.indexOf('async function saveContent('),app.indexOf('async function saveAsset(')),context);
  return {context,get,store,hint,button};
}

test('closing and reloading a phone composer restores original caption, notes, rating and chosen sequence without a network request',()=>{
  const first=harness();first.context.openComposer();
  const expected={composerUrl:'https://www.douyin.com/video/123',composerCaption:'原文\n'.repeat(1000),composerBody:'我自己的理解',composerRating:'5',composerSequence:'7',composerTags:'#电影'};
  for(const [id,value]of Object.entries(expected))first.get(id).value=value;
  first.context.closeComposer();
  const next=harness(first.store);let calls=0;next.context.fetch=async()=>{calls++;};next.context.openComposer();
  for(const [id,value]of Object.entries(expected))assert.equal(next.get(id).value,value);
  assert.equal(calls,0);
  next.context.CaptureDraft.clear(first.store,null);next.context.closeComposer(false);
  const discarded=harness(first.store);discarded.context.openComposer();assert.equal(discarded.get('composerUrl').value,'');
});

test('drafts for two existing records remain separate and an incomplete retry never erases saved caption or cover',async()=>{
  const h=harness();const a={id:'a',title:'手写标题',url:'https://x.com/u/status/1',body:'自己的笔记',caption:'已有原文',coverUrl:'https://img.example.com/a.jpg',rating:3,sequence:2};
  h.context.openComposer(a);h.get('composerBody').value='修改中的A';h.context.closeComposer();
  h.context.openComposer({id:'b',title:'B'});h.get('composerBody').value='修改中的B';h.context.closeComposer();
  h.context.openComposer(a);assert.equal(h.get('composerBody').value,'修改中的A');
  h.context.fetch=async()=>({ok:true,json:async()=>({url:a.url,description:'',coverUrl:'',title:'',previewStatus:'incomplete'})});
  await h.context.previewLink();
  assert.equal(h.get('composerCaption').value,a.caption);assert.equal(h.get('composerCover').value,a.coverUrl);assert.equal(h.get('composerBody').value,'修改中的A');
});

test('successful retry fills missing fields while preserving manual text before and during the request',async()=>{
  const h=harness();h.context.openComposer();h.get('composerUrl').value='https://x.com/u/status/1';h.get('composerTitle').value='我的标题';h.get('composerBody').value='手写笔记';
  let release;h.context.fetch=()=>new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>({url:'https://x.com/u/status/1',title:'网页标题',description:'原始文案',coverUrl:'https://img.example.com/cover.jpg',previewStatus:'ready'})});});
  const pending=h.context.previewLink();h.get('composerCaption').value='正在核对的原文';release();await pending;
  assert.equal(h.get('composerTitle').value,'我的标题');assert.equal(h.get('composerBody').value,'手写笔记');
  assert.equal(h.get('composerCaption').value,'正在核对的原文');assert.equal(h.get('composerCover').value,'https://img.example.com/cover.jpg');
  assert.equal(h.button.disabled,false);
});

test('late preview does not overwrite a newly opened composer and storage failure leaves the form intact',async()=>{
  const h=harness({getItem(){return null;},setItem(){throw Error('quota');},removeItem(){}});h.context.openComposer();h.get('composerUrl').value='https://x.com/u/status/1';
  let release;h.context.fetch=()=>new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>({description:'旧请求结果'})});});
  const pending=h.context.previewLink();h.context.openComposer({id:'other',body:'新笔记'});release();await pending;
  assert.equal(h.get('composerBody').value,'新笔记');h.get('composerBody').value='未保存的新笔记';h.context.stashComposerDraft();
  assert.match(h.hint.textContent,/无法保存/);assert.equal(h.get('composerBody').value,'未保存的新笔记');
});

test('saving an incomplete link keeps its missing original empty and clears only the saved draft',async()=>{
  const h=harness();h.context.openComposer();h.get('composerUrl').value='https://www.douyin.com/video/123';h.get('composerSource').value='douyin';h.context.stashComposerDraft();
  await h.context.saveContent();const saved=h.context.contentItems[0];
  assert.equal(saved.title,'待补全的抖音链接');assert.equal(saved.body,'');assert.equal(saved.caption,'');
  assert.equal(h.context.CaptureDraft.read(h.store,null),null);
  assert.equal(h.context.modalBackdrop.classList.contains('is-open'),false);
});

test('typing during a slow save retains the newer draft after the previous version reaches the server',async()=>{
  const h=harness();h.context.openComposer();h.get('composerTitle').value='标题';h.get('composerBody').value='提交版本';
  let finish;h.context.persistState=()=>new Promise(resolve=>{finish=resolve;});
  const pending=h.context.saveContent();h.get('composerBody').value='保存过程中修改';finish();await pending;
  assert.equal(h.context.contentItems[0].body,'提交版本');assert.equal(h.get('composerBody').value,'保存过程中修改');
  assert.equal(h.context.modalBackdrop.classList.contains('is-open'),true);
  const restored=h.context.CaptureDraft.read(h.store,h.context.contentItems[0].id);
  assert.equal(restored.values.composerBody,'保存过程中修改');
  assert.equal(restored.base.composerBody,'提交版本');
});

test('viewing an unchanged record creates no draft that can overwrite a later phone edit',()=>{
  const h=harness(),item={id:'a',title:'标题',body:'电脑旧笔记'};
  h.context.openComposer(item);h.context.closeComposer();
  assert.equal(h.context.CaptureDraft.read(h.store,'a'),null);
  h.context.openComposer({...item,body:'手机新笔记'});
  assert.equal(h.get('composerBody').value,'手机新笔记');
});

test('draft restoration merges only edited fields and leaves unrelated phone edits intact',()=>{
  const h=harness(),item={id:'a',title:'标题',body:'旧笔记',rating:1};
  h.context.openComposer(item);h.get('composerRating').value='5';h.context.closeComposer();
  h.context.openComposer({...item,body:'手机新笔记'});
  assert.equal(h.get('composerBody').value,'手机新笔记');assert.equal(h.get('composerRating').value,'5');
  assert.equal(h.context.composerDraftPending,null);
});

test('same-field conflicts preserve both versions across close and require a choice before save',async()=>{
  const h=harness(),item={id:'a',title:'标题',body:'旧笔记',rating:1};
  h.context.openComposer(item);h.get('composerBody').value='电脑草稿';h.get('composerRating').value='5';h.context.closeComposer();
  h.context.openComposer({...item,body:'手机新笔记'});
  assert.equal(h.get('composerBody').value,'手机新笔记');assert.equal(h.get('composerBody').disabled,true);
  await h.context.saveContent();assert.equal(h.context.contentItems.length,0);
  h.context.closeComposer();assert.equal(h.context.CaptureDraft.read(h.store,'a').values.composerBody,'电脑草稿');
  h.context.openComposer({...item,body:'手机新笔记'});h.context.resolveDraftConflict(false);
  assert.equal(h.get('composerBody').value,'手机新笔记');assert.equal(h.get('composerBody').disabled,false);
  assert.equal(h.get('composerRating').value,'5');
  assert.equal(h.context.CaptureDraft.read(h.store,'a').base.composerBody,'手机新笔记');
});

test('legacy drafts require an explicit choice and cannot silently replace newer cloud text',()=>{
  const h=harness();h.context.openComposer({id:'a',title:'标题',body:'旧笔记'});
  const old={version:1,values:{...h.context.composerValues(),composerBody:'旧版草稿'},preview:null};
  h.context.closeComposer(false);h.store.setItem('lingan-capture-draft:a',JSON.stringify(old));
  h.context.openComposer({id:'a',title:'标题',body:'手机新笔记'});
  assert.equal(h.get('composerBody').value,'手机新笔记');assert.ok(h.context.composerDraftPending);
  h.context.resolveDraftConflict(true);assert.equal(h.get('composerBody').value,'旧版草稿');
  assert.equal(h.context.CaptureDraft.read(h.store,'a').base.composerBody,'手机新笔记');
});

test('device draft retains a caption above 100000 characters without silent truncation',()=>{
  const h=harness();h.context.openComposer();const caption='完整原文'.repeat(30000);
  h.get('composerCaption').value=caption;h.context.closeComposer();
  const next=harness(h.store);next.context.openComposer();assert.equal(next.get('composerCaption').value,caption);
});
