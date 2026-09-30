import test from 'node:test';
import assert from 'node:assert/strict';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {createLayoutEditor}=await import(pathToFileURL(resolve(root,'client/live-layout-editor.mjs')));
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} should equal ${expected}`);

class Node {
  constructor(tag='div',doc){this.tagName=tag.toUpperCase();this.doc=doc;this.style={};this.dataset={};this.children=[];this.listeners={};this.attrs={};this.value='';this.disabled=false;this.hidden=false;this.classes=new Set();this.classList={toggle:(name,force)=>{const next=force??!this.classes.has(name);if(next)this.classes.add(name);else this.classes.delete(name);return next;},contains:name=>this.classes.has(name)};}
  set className(value){this.classes=new Set(value.split(/\s+/).filter(Boolean));}
  get className(){return [...this.classes].join(' ');}
  append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
  addEventListener(type,listener){(this.listeners[type]??=[]).push(listener);}
  trigger(type,data={}){if(this.disabled&&type==='click')return;const event={target:this,preventDefault(){this.prevented=true;},...data};for(const listener of this.listeners[type]||[])listener(event);return event;}
  setAttribute(name,value){this.attrs[name]=String(value);}
  getBoundingClientRect(){return {width:400,height:225};}
  setPointerCapture(id){this.captured=id;}
  focus(){this.doc.activeElement=this;}
  matches(selector){if(selector==='.live-layout-content')return this.classes.has('live-layout-content');if(selector.startsWith('.live-'))return this.classes.has(selector.slice(1));if(selector==='[data-layout-source]')return Boolean(this.dataset.layoutSource);if(selector==='[data-layout-resize]')return this.dataset.layoutResize!==undefined;const match=selector.match(/^\[data-layout-source="(.+)"\]$/);return Boolean(match&&this.dataset.layoutSource===match[1]);}
  closest(selector){let node=this;while(node){if(node.matches(selector))return node;node=node.parent;}return null;}
  querySelector(selector){for(const child of this.children){if(child.matches(selector))return child;const match=child.querySelector(selector);if(match)return match;}return null;}
}

async function harness(){
  const originals=new Map(['document','window','localStorage','CustomEvent'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const nodes=new Map(),saved=new Map(),events={},started=[],changes=[];
  const doc={activeElement:null,getElementById:id=>nodes.get(id),createElement:tag=>new Node(tag,doc),createTextNode:text=>Object.assign(new Node('#text',doc),{textContent:text})};
  for(const id of ['liveLayoutEditor','liveLayoutStage','liveLayoutChoice','liveLayoutSource','liveLayoutFields','liveLayoutFit','liveLayoutStatus','liveLayoutStart','liveLayoutReset','liveSceneName','liveSceneSummary','liveSceneDownload'])nodes.set(id,new Node('div',doc));
  const content=new Node('div',doc);content.className='live-layout-content';nodes.get('liveLayoutEditor').append(content);content.append(nodes.get('liveLayoutStage'),nodes.get('liveLayoutFields'));
  const boxes={};for(const source of ['screen','camera']){const node=new Node('div',doc),handle=new Node('span',doc);node.dataset.layoutSource=source;handle.dataset.layoutResize='';node.append(handle);nodes.get('liveLayoutStage').append(node);boxes[source]=node;}
  const cards=['presenter','screen-inset','portrait'].map(id=>{const card=new Node('button',doc);card.dataset.liveScene=id;if(id==='portrait')card.classList.toggle('is-selected',true);for(const source of ['screen','camera']){const node=new Node('span',doc);node.className='live-'+source;card.append(node);}return card;});
  doc.querySelectorAll=selector=>selector==='[data-live-scene]'?cards:[];
  doc.querySelector=selector=>selector==='[data-live-scene].is-selected'?cards.find(card=>card.classes.has('is-selected')):cards.find(card=>selector==='[data-live-scene="'+card.dataset.liveScene+'"]');
  const scope={addEventListener(type,listener){(events[type]??=[]).push(listener);},dispatchEvent(event){for(const listener of events[event.type]||[])listener(event);},LinganRecorder:{start:id=>started.push(id)}};
  const storage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)};
  for(const [key,value] of Object.entries({document:doc,window:scope,localStorage:storage,CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}}}))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  await import(pathToFileURL(resolve(root,'public/live-scenes.js')).href+'?fake-ui-audit='+Math.random());
  const editor=createLayoutEditor({onChange:(id,settings)=>changes.push({id,settings})});editor.setPhase('idle',null,true);
  const fields=Object.fromEntries(['x','y','width','height'].map((name,index)=>{const pair=nodes.get('liveLayoutFields').children[index].children[1];return [name,{range:pair.children[0],number:pair.children[1]}];}));
  return {nodes,boxes,cards,fields,started,changes,saved,doc,scope,editor,restore(){for(const [key,value] of originals){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}};
}

test('editor selection, custom start, live drag, per-layout reset and finishing controls stay consistent',async()=>{
  const h=await harness(),get=id=>h.nodes.get(id);
  try{
    const portraitBefore=h.editor.settings('portrait');
    get('liveLayoutChoice').value='screen-inset';get('liveLayoutChoice').trigger('change');
    assert.equal(h.cards.find(card=>card.classes.has('is-selected')).dataset.liveScene,'screen-inset');
    get('liveLayoutStart').trigger('click');assert.deepEqual(h.started,['screen-inset']);
    h.editor.setPhase('recording','screen-inset',true);assert.equal(get('liveLayoutChoice').disabled,true);assert.equal(get('liveLayoutStart').disabled,true);
    const before=h.editor.settings('screen-inset').camera,stage=get('liveLayoutStage');
    stage.trigger('pointerdown',{target:h.boxes.camera,pointerId:1,button:0,clientX:100,clientY:100});
    stage.trigger('pointermove',{target:h.boxes.camera,pointerId:1,clientX:140,clientY:80});
    const moved=h.editor.settings('screen-inset').camera;near(moved.x,before.x+10);near(moved.y,before.y-20/225*100);
    assert.equal(h.changes.at(-1).id,'screen-inset');assert.equal(h.boxes.camera.captured,1);
    stage.trigger('pointerup',{pointerId:1});const count=h.changes.length;stage.trigger('pointermove',{pointerId:1,clientX:180,clientY:60});assert.equal(h.changes.length,count);
    stage.trigger('pointerdown',{target:h.boxes.camera.children[0],pointerId:2,button:0,clientX:0,clientY:0});stage.trigger('pointermove',{pointerId:2,clientX:1000,clientY:1000});stage.trigger('pointerup',{pointerId:2});
    const expanded=h.editor.settings('screen-inset').camera;near(expanded.x,moved.x);near(expanded.y,moved.y);near(expanded.width,100-moved.x);near(expanded.height,100-moved.y);
    get('liveLayoutReset').trigger('click');assert.deepEqual(h.editor.settings('portrait'),portraitBefore);near(h.editor.settings('screen-inset').camera.width,before.width);
    const persisted=JSON.parse(h.saved.get('lingan-live-layouts-v1'));assert.deepEqual(persisted.portrait,portraitBefore);
    h.editor.setPhase('finishing','screen-inset',true);assert.equal(get('liveLayoutReset').disabled,true);assert.equal(h.fields.width.number.disabled,true);assert.equal(get('liveLayoutSource').disabled,true);
    const finalCount=h.changes.length;stage.trigger('pointerdown',{target:h.boxes.camera,pointerId:3,button:0,clientX:0,clientY:0});stage.trigger('pointermove',{pointerId:3,clientX:40,clientY:40});assert.equal(h.changes.length,finalCount);
    h.editor.setPhase('idle',null,true);assert.equal(get('liveLayoutStart').disabled,false);assert.equal(get('liveLayoutChoice').disabled,false);
  }finally{h.restore();}
});

test('a focused number field permits typing a multi-digit size below the first-digit minimum',async()=>{
  const h=await harness();
  try{
    const input=h.fields.width.number;input.focus();input.value='1';input.trigger('input');
    assert.equal(input.value,'1','intermediate typing must not replace 1 with the minimum 5');
    input.value+='0';input.trigger('input');near(h.editor.settings('portrait').camera.width,10);
    input.trigger('change');input.trigger('blur');assert.equal(Number(input.value),10);
  }finally{h.restore();}
});
