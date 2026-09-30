import test from 'node:test';
import assert from 'node:assert/strict';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(predicate,label){
  for(let count=0;count<100;count++){
    if(predicate())return;
    await tick();
  }
  throw Error('Timed out waiting for '+label);
}
const closeTo=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} should equal ${expected}`);
function clipsMatch(operations,expected){
  const actual=operations.filter(op=>op[0]==='clip');
  assert.equal(actual.length,expected.length);
  expected.forEach((rectangle,index)=>{assert.equal(actual[index][0],'clip');rectangle.forEach((value,coordinate)=>closeTo(actual[index][coordinate+1],value));});
}

test('worker applies repeated live rectangle updates to subsequent frames without changing canvas or timestamps', {timeout:5000}, async()=>{
  const original=new Map(['self','OffscreenCanvas','VideoFrame'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const messages=[],canvases=[],outputs=[],inputs=[];
  const source=(id,timestamp)=>{
    const frame={id,timestamp,displayWidth:1920,displayHeight:1080,closed:0,close(){this.closed++;}};
    inputs.push(frame);return frame;
  };
  class Canvas{
    constructor(width,height){this.width=width;this.height=height;canvases.push(this);this.operations=[];}
    getContext(){
      const canvas=this;
      return {fillRect(...args){canvas.operations=[['clear',...args]];},save(){},beginPath(){},rect(...args){canvas.operations.push(['clip',...args]);},clip(){},drawImage(frame,...args){canvas.operations.push(['draw',frame.id,...args]);},restore(){}};
    }
  }
  class Frame{
    constructor(canvas,{timestamp}){
      Object.assign(this,{timestamp,width:canvas.width,height:canvas.height,operations:canvas.operations.map(op=>op.slice()),closed:0});
    }
    close(){this.closed++;}
  }
  const scope={postMessage:message=>messages.push(message)};
  for(const [key,value] of Object.entries({self:scope,OffscreenCanvas:Canvas,VideoFrame:Frame}))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  let cameraController,screenController,writerClosed=false;
  const camera=new ReadableStream({start(controller){cameraController=controller;}});
  const screen=new ReadableStream({start(controller){screenController=controller;}});
  const output=new WritableStream({write(frame){outputs.push(frame);},close(){writerClosed=true;}});
  let lifecycle;
  try{
    const url=pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)),'../client/live-render-worker.mjs')).href;
    await import(url+'?customization-audit='+Date.now());
    lifecycle=scope.onmessage({data:{type:'start',layoutId:'portrait',camera,screen,output}});
    screenController.enqueue(source('screen',0));
    cameraController.enqueue(source('camera-1',10000));
    await until(()=>outputs.length===1,'initial frame');await tick();
    assert.ok(messages.some(message=>message.type==='ready'));
    clipsMatch(outputs[0].operations,[[0,240,1080,608],[0,848,1080,1072]]);

    await scope.onmessage({data:{type:'layout',settings:{screen:{x:10,y:5,width:80,height:35,fit:'contain'},camera:{x:25,y:45,width:50,height:50,fit:'cover'}}}});
    cameraController.enqueue(source('camera-2',9999));
    await until(()=>outputs.length===2,'first custom frame');await tick();
    clipsMatch(outputs[1].operations,[[108,96,864,672],[270,864,540,960]]);

    await scope.onmessage({data:{type:'layout',settings:{screen:{x:0,y:0,width:100,height:30,fit:'contain'},camera:{x:10,y:35,width:80,height:60,fit:'contain'}}}});
    cameraController.enqueue(source('camera-3',10000));
    await until(()=>outputs.length===3,'second custom frame');await tick();
    clipsMatch(outputs[2].operations,[[0,0,1080,576],[108,672,864,1152]]);
    const cameraDraw=outputs[2].operations.find(op=>op[0]==='draw'&&op[1]==='camera-3');
    [108,1005,864,486].forEach((value,index)=>closeTo(cameraDraw[index+2],value));

    assert.equal(canvases.length,1,'live updates reuse the original output canvas');
    assert.deepEqual(outputs.map(frame=>[frame.width,frame.height]),[[1080,1920],[1080,1920],[1080,1920]]);
    assert.deepEqual(outputs.map(frame=>frame.timestamp),[10000,10001,10002]);
    assert.ok(outputs.every(frame=>frame.closed===1),'every generated frame closes after write');
    assert.ok(inputs.filter(frame=>frame.id.startsWith('camera-')).every(frame=>frame.closed===1),'each consumed camera frame closes exactly once');
    assert.deepEqual(outputs.map(frame=>frame.operations.filter(op=>op[0]==='draw').map(op=>op[1])),[['screen','camera-1'],['screen','camera-2'],['screen','camera-3']]);
    assert.ok(!messages.some(message=>message.type==='error'));
  }finally{
    if(lifecycle){await scope.onmessage({data:{type:'stop'}});await lifecycle;}
    for(const [key,descriptor] of original){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
  assert.equal(writerClosed,true,'stop closes the output stream');
  assert.ok(inputs.every(frame=>frame.closed===1),'stop releases the last held screen frame');
  assert.ok(messages.some(message=>message.type==='stopped'));
});
