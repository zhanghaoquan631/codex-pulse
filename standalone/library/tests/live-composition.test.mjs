import test from 'node:test';
import assert from 'node:assert/strict';
import {layouts,placement,composeFrame} from '../client/live-composition.mjs';
test('fixed canvases and source rectangles match three reference layouts',()=>{
  assert.deepEqual(Object.values(layouts).map(l=>[l.width,l.height]),[[1920,1080],[1920,1080],[1080,1920]]);
  assert.deepEqual(placement(1920,1080,layouts['screen-inset'].camera),{x:28,y:805.125,width:380,height:213.75});
  const camera=placement(1920,1080,layouts.portrait.camera);assert.equal(camera.y,848);assert.equal(camera.height,1072);assert.ok(camera.x<0,'portrait fills and crops camera');
  assert.deepEqual(placement(1080,1920,layouts.portrait.screen),{x:369,y:240,width:342,height:608});
});
test('every frame clears canvas and clips each source to its assigned box',()=>{
  const operations=[],ctx={fillRect(...args){operations.push(['clear',...args]);},save(){},beginPath(){},rect(...args){operations.push(['clip',...args]);},clip(){},drawImage(...args){operations.push(['draw',...args]);},restore(){}};
  const cam={width:1920,height:1080},screen={width:1920,height:1080};composeFrame(ctx,'portrait',cam,screen);
  assert.deepEqual(operations[0],['clear',0,0,1080,1920]);assert.deepEqual(operations[1],['clip',0,240,1080,608]);assert.equal(operations[2][1],screen);assert.deepEqual(operations[3],['clip',0,848,1080,1072]);assert.equal(operations[4][1],cam);
});
