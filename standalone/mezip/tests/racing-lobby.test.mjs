import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

const source=readFileSync(new URL('../apps/racing/competition/lobby.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
const tick=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve))};
function fixture({id=null,stored=null,respond,copyFails=false,copyHangs=false,query=''}={}){
 const elements=new Map(),storage=new Map(),calls=[],buttons=[{},{}];
 const el=id=>{if(!elements.has(id)){const classes=new Set();elements.set(id,{value:id==='#track'?'lagunaSeca':'',hidden:false,disabled:false,textContent:'',listeners:{},attrs:{},classList:{toggle(c,on){on?classes.add(c):classes.delete(c)},contains(c){return classes.has(c)}},querySelectorAll(){return buttons},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,fn){this.listeners[k]=fn},focus(){this.focused=true},select(){this.selected=true}})}return elements.get(id)};
 if(stored)storage.set(id,structuredClone(stored));
 const params=new URLSearchParams(query);if(id)params.set('room',id);
 const initial='https://test.example/racing/competition/'+(params.size?'?'+params:'');
 const location={href:initial,search:new URL(initial).search};
 const ctx={console,URL,URLSearchParams,crypto:{randomUUID},setTimeout(){},location,history:{replaceState(_a,_b,u){location.href=String(u);location.search=new URL(u).search}},document:{title:''},
  $:el,TRACKS:{lagunaSeca:'Laguna Seca',apexCircuit:'APEX Circuit'},session:id=>storage.get(id)||null,
  remember(id,value){const prev=storage.get(id);const next=prev?.playerId===value.playerId?{...prev,...value}:value;storage.set(id,next);return next},savedName:()=>'',
  inviteUrl:id=>'https://test.example/racing/competition/?room='+id,playUrl:room=>'https://test.example/racing/?mode=competition&room='+room.id+'&track='+room.trackId,
  async copyInvite(){if(copyFails)throw Error('clipboard denied');if(copyHangs)return new Promise(()=>{})},rankRows(){},qrDataUrl:()=>'<svg/>',showStatus(element,message,error=false){element.textContent=message;element.classList.toggle('is-error',error)},
  async request(...args){calls.push(args);return await respond(...args)},
 };
 vm.runInNewContext(source,ctx,{filename:'lobby.js'});
 const submit=async(intent='invite',create=true)=>{el(create?'#create-form':'#join-form').listeners.submit({preventDefault(){},currentTarget:el(create?'#create-form':'#join-form'),submitter:{value:intent}});await tick()};
 return {el,storage,calls,location,submit};
}
const room=(control='human')=>({id:'a'.repeat(32),hostId:'host',trackId:'lagunaSeca',laps:3,status:'lobby',revision:1,serverNow:100,players:[{id:'host',isBot:false,control,place:1,name:'玩家'}]});
const receipt=()=>({room:room(),playerId:'host',token:'token'});

test('AI challenge keeps the participant human, sets opponent mode, and only creates a room',async()=>{
 const f=fixture({respond:async()=>receipt()});
 await f.submit('ai');
 assert.equal(f.el('#driver-name').value,'玩家');
 assert.deepEqual(f.calls.map(c=>c[1]),['']);
 assert.equal(f.storage.get(room().id).autoDrive,false);assert.equal(f.storage.get(room().id).autoStart,true);assert.equal(f.storage.get(room().id).firstEntry,true);
 assert.equal(f.storage.get(room().id).opponentMode,'ai');
 assert.match(f.location.href,/mode=competition/);
});
test('Invite creation exposes a selectable share link if clipboard is unavailable',async()=>{
 const f=fixture({copyFails:true,respond:async()=>receipt()});await f.submit('invite');
 assert.equal(f.calls.length,1);assert.equal(f.el('#invite-card').hidden,false);assert.equal(f.el('#invite-link').selected,true);
 assert.equal(f.storage.get(room().id).firstEntry,true);assert.equal(f.storage.get(room().id).autoDrive,false);
 assert.equal(f.storage.get(room().id).opponentMode,'friends');
 assert.doesNotMatch(f.location.href,/mode=competition/);
 f.storage.get(room().id).opponentMode='ai';f.storage.get(room().id).autoStart=true;
 f.el('#copy-link').listeners.click();await tick();
 assert.equal(f.storage.get(room().id).opponentMode,'friends');assert.equal(f.storage.get(room().id).autoStart,false);
});
test('Repeated AI challenge intent reuses its created room and never calls control',async()=>{
 const f=fixture({respond:async()=>receipt()});
 await f.submit('ai');await f.submit('ai');
 assert.equal(f.calls.filter(c=>c[0]===null).length,1);assert.equal(f.calls.some(c=>c[1]==='control'),false);assert.match(f.location.href,/mode=competition/);
});
test('Failed creation retry keeps the same idempotency key',async()=>{
 let creates=0;
 const f=fixture({respond:async()=>{if(++creates===1)throw Error('response lost');return receipt()}});
 await f.submit('invite');await f.submit('invite');
 assert.equal(f.calls[0][4].idempotencyKey,f.calls[1][4].idempotencyKey);
});
test('Fresh friend stays human and old delegation is cleared before challenging AI',async()=>{
 const id=room().id;
 const fresh=fixture({id,respond:async(_id,action)=>action==='join'?receipt():{room:room()}});
 await tick();await fresh.submit('invite',false);
 assert.equal(fresh.storage.get(id).firstEntry,true);assert.equal(fresh.storage.get(id).autoDrive,false);
 assert.equal(fresh.storage.get(id).opponentMode,'friends');
 assert.equal(fresh.el('#choose-ai').disabled,false);
 await fresh.el('#choose-ai').listeners.click();await tick();
 assert.equal(fresh.storage.get(id).firstEntry,true);assert.equal(fresh.storage.get(id).autoDrive,false);
 assert.equal(fresh.storage.get(id).autoStart,true);assert.match(fresh.location.href,/mode=competition/);
 assert.equal(fresh.storage.get(id).opponentMode,'ai');assert.equal(fresh.calls.some(c=>c[1]==='control'),false);
 const old=fixture({id,stored:{playerId:'host',token:'token',name:'old',autoDrive:true,autoStart:true,firstEntry:false},respond:async()=>({room:room('ai')})});
 await tick();assert.equal(old.storage.get(id).autoDrive,false);assert.equal(old.storage.get(id).firstEntry,true);
 assert.equal(old.el('#choose-ai').disabled,false);assert.equal(old.el('#choose-ai').textContent,'挑战 AI');
 await old.el('#choose-ai').listeners.click();await tick();
 assert.equal(old.storage.get(id).autoDrive,false);assert.equal(old.storage.get(id).autoStart,true);assert.equal(old.storage.get(id).opponentMode,'ai');
 assert.equal(old.calls.some(c=>c[1]==='control'),false);assert.match(old.location.href,/mode=competition/);
});

test('homepage AI choice starts the selected track directly without taking the human wheel',async()=>{
 const f=fixture({query:'intent=ai&track=apexCircuit',respond:async(_id,_action,body)=>({...receipt(),room:{...room(),trackId:body.trackId}})});
 await tick();assert.equal(f.calls.length,1);assert.equal(f.calls[0][2].trackId,'apexCircuit');
 assert.match(f.location.href,/mode=competition/);assert.match(f.location.href,/track=apexCircuit/);
 assert.equal(f.storage.get(room().id).autoDrive,false);assert.equal(f.storage.get(room().id).opponentMode,'ai');
});
test('homepage invite choice creates one shareable room; existing invitation never creates a second room',async()=>{
 const f=fixture({query:'intent=invite&track=invalid',copyHangs:true,respond:async()=>receipt()});await tick();
 assert.equal(f.calls.length,1);assert.equal(f.calls[0][2].trackId,'lagunaSeca');assert.equal(f.el('#invite-card').hidden,false);
 assert.equal(f.el('#copy-link').disabled,false,'clipboard focus/permission never blocks entering the room');
 assert.equal(new URL(f.location.href).searchParams.has('intent'),false);assert.equal(f.storage.get(room().id).autoStart,false);
 const existing=fixture({id:room().id,query:'intent=ai',respond:async()=>({room:room()})});await tick();
 assert.equal(existing.calls.length,1);assert.equal(existing.calls[0][0],room().id);assert.equal(existing.calls[0][2],undefined);
});
