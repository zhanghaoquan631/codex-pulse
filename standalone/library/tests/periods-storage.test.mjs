import test from 'node:test';
import assert from 'node:assert/strict';
import {environment,call} from './fixtures.mjs';
import {load,mutate} from '../worker/state.js';
import {issueDraft} from '../worker/weekly-edit.js';
const period={periodStart:'2026-09-30T01:10:11.000Z',periodEnd:'2026-10-02T22:04:05.000Z',periodTimeZone:'Asia/Taipei',periodPreset:'custom'};
const textStyle={version:1,enabled:true,auto:{important:true,repeated:true,adjective:true},styles:{important:{color:'#112233',font:'bold'}},terms:[{text:'知识库',category:'custom',color:'#445566',font:'italic'}]};
test('custom period and editable emphasis survive create, read, edit, sync export and public issue rendering',async()=>{
 const env=environment();try{
  await mutate(env,s=>s.content.push({id:'original',title:'知识库',body:'笔记',caption:'知识库让工作更清晰。',rating:3,sequence:1,textStyle}));
  let r=await call(env,'/api/newsletters',{method:'POST',body:{title:'三日刊',date:'2026-09-30',intro:'高效的知识库',itemIds:['original'],...period,textStyle}});assert.equal(r.status,201);
  const {newsletter}=await r.json();assert.deepEqual(newsletter.periodStart,period.periodStart);assert.deepEqual(newsletter.items[0].textStyle,textStyle);
  const base=issueDraft(newsletter);r=await call(env,'/api/newsletters/'+newsletter.id+'/edit',{method:'POST',body:{...base,base,periodEnd:'2026-10-03T22:04:06.000Z',textStyle:{...textStyle,enabled:false},items:base.items.map(x=>({...x,textStyle:{...textStyle,terms:[]}}))}});assert.equal(r.status,200);
  const stored=(await load(env)).state.newsletters[0];assert.equal(stored.periodEnd,'2026-10-03T22:04:06.000Z');assert.equal(stored.textStyle.enabled,false);assert.equal(stored.token,newsletter.token);assert.equal((await load(env)).state.content[0].textStyle.terms.length,1);
  const sync=await (await call(env,'/api/sync/state',{auth:'sync'})).json();assert.deepEqual(sync.newsletters[0].periodEnd,stored.periodEnd);
  const shared=await (await call(env,'/share/'+stored.token,{auth:'anonymous'})).text();assert.match(shared,/09:10:11/);assert.match(shared,/06:04:06/);assert.match(shared,/data-text-styling/);assert.match(shared,/text-styling.js/);
 }finally{env.close();}
});
test('invalid periods and unsafe style values fail atomically',async()=>{
 const env=environment();try{
  await mutate(env,s=>s.content.push({id:'a',title:'A'}));
  for(const invalid of [{...period,periodEnd:'2026-09-29T00:00:00.000Z'},{...period,periodStart:'2026-02-30T00:00:00.000Z'},{...period,periodTimeZone:'Unknown/Zone'},{...period,periodEnd:'2026-10-02T22:04:05.100Z'}]){
   const r=await call(env,'/api/newsletters',{method:'POST',body:{itemIds:['a'],...invalid}});assert.equal(r.status,400);assert.equal((await load(env)).state.newsletters.length,0);
  }
  const r=await call(env,'/api/newsletters',{method:'POST',body:{itemIds:['a'],...period,textStyle:{...textStyle,styles:{custom:{color:'red;display:none',font:'bold'}}}}});assert.equal(r.status,400);assert.equal((await load(env)).state.newsletters.length,0);
 }finally{env.close();}
});
