import test from 'node:test';
import assert from 'node:assert/strict';
import {layouts,defaultLayoutSettings,normalizeLayoutSettings,resolveLayout,composeFrame} from '../client/live-composition.mjs';
import {LayoutPreferences} from '../client/live-layout-editor.mjs';

test('custom source boxes stay finite and inside the unchanged recording canvas',()=>{
  const base=structuredClone(layouts),input={width:2,height:2,camera:{x:98,y:-20,width:35,height:200,fit:'cover'},screen:{x:NaN,y:Infinity,width:-5,height:'bad',fit:'unsafe'}};
  const normalized=normalizeLayoutSettings('screen-inset',input);
  assert.deepEqual(normalized.camera,{x:65,y:0,width:35,height:100,fit:'cover'});
  assert.deepEqual(normalized.screen,{x:0,y:0,width:5,height:100,fit:'contain'});
  const layout=resolveLayout('screen-inset',input);assert.equal(layout.width,1920);assert.equal(layout.height,1080);assert.deepEqual(layout.camera,{x:1248,y:0,width:672,height:1080,fit:'cover'});
  assert.deepEqual(layouts,base);assert.throws(()=>resolveLayout('unknown',{}));
});
test('repeated custom geometry is clipped and old positions are cleared on each frame',()=>{
  const operations=[],context={fillRect(...r){operations.push(['clear',...r]);},save(){},beginPath(){},rect(...r){operations.push(['clip',...r]);},clip(){},drawImage(frame,...r){operations.push(['draw',frame,...r]);},restore(){}};
  const camera={width:1920,height:1080},screen={width:1920,height:1080};
  composeFrame(context,'portrait',camera,screen,{screen:{x:10,y:5,width:80,height:30,fit:'contain'},camera:{x:20,y:50,width:60,height:40,fit:'cover'}});
  assert.deepEqual(operations[0],['clear',0,0,1080,1920]);assert.deepEqual(operations[1],['clip',108,96,864,576]);assert.equal(operations[2][1],screen);assert.deepEqual(operations[3],['clip',216,960,648,768]);assert.equal(operations[4][1],camera);
  operations.length=0;composeFrame(context,'portrait',camera,screen,{camera:{x:0,y:70,width:100,height:30}});
  assert.deepEqual(operations[0],['clear',0,0,1080,1920]);assert.deepEqual(operations[3],['clip',0,1344,1080,576]);
});
test('each layout is remembered independently, and resetting one keeps the other',()=>{
  const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)},preferences=new LayoutPreferences(storage);
  assert.ok(preferences.set('screen-inset',{camera:{x:65,y:2,width:30,height:25,fit:'cover'}}));
  assert.ok(preferences.set('portrait',{screen:{x:5,y:0,width:90,height:45},camera:{x:10,y:45,width:80,height:55}}));
  const restored=new LayoutPreferences(storage),portrait=restored.get('portrait');assert.equal(restored.get('screen-inset').camera.x,65);assert.equal(portrait.screen.height,45);
  restored.reset('screen-inset');assert.deepEqual(restored.get('screen-inset'),defaultLayoutSettings('screen-inset'));assert.deepEqual(new LayoutPreferences(storage).get('portrait'),portrait);
  const detached=restored.get('portrait');detached.camera.width=999;assert.deepEqual(restored.get('portrait'),portrait);
});
test('unavailable or damaged browser storage leaves safe, editable in-memory defaults',()=>{
  const storage={getItem(){throw Error('storage blocked');},setItem(){throw Error('storage blocked');}},preferences=new LayoutPreferences(storage);
  assert.deepEqual(preferences.get('portrait'),defaultLayoutSettings('portrait'));assert.equal(preferences.set('portrait',{camera:{x:95,width:25,height:30}}),false);assert.equal(preferences.get('portrait').camera.x,75);
  const corrupted=new LayoutPreferences({getItem:()=>'{invalid'});assert.deepEqual(corrupted.get('screen-inset'),defaultLayoutSettings('screen-inset'));
});
