import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {WebsiteCollector} from './websites.mjs';
import {groupWebsiteBoxes,websiteTime} from '../lib/website-boxes.ts';
const link=(id,url,extra={})=>({id,url,title:id,kind:'shared',source:'codex',firstSeen:'2026-09-01T00:00:00.000Z',lastSeen:'2026-09-02T00:00:00.000Z',...extra});
test('same website stays together across paths, search, categories and box pagination',()=>{
 const items=[link('home','https://one.chatgpt.site/',{kind:'developed'}),link('old','https://one.chatgpt.site/older?version=1'),link('other','https://two.chatgpt.site/')];
 const boxes=groupWebsiteBoxes(items,'version=1','developed');
 assert.equal(boxes.length,1);assert.equal(boxes[0].items.length,2);assert.equal(boxes[0].matchedCount,1);assert.equal(boxes[0].url,'https://one.chatgpt.site/');
 const many=[...items,...Array.from({length:60},(_,n)=>link('extra'+n,`https://site${n}.test/`))];
 const all=groupWebsiteBoxes(many);assert.equal(all.length,62);assert.equal(all.flatMap(box=>box.items).length,63);assert.equal(all.slice(0,48).find(box=>box.id==='origin:https://one.chatgpt.site').items.length,2);
});
test('manual lineage joins origins, splits branches and keeps local ports separate',()=>{
 const items=[link('a','http://localhost:5173/'),link('b','http://127.0.0.1:5173/old'),link('c','http://127.0.0.1:5174/'),link('d','https://new.test/',{boxName:'项目甲'}),link('e','https://old.test/',{boxName:'项目甲'}),link('f','https://new.test/branch',{boxName:'分支乙'})];
 const boxes=groupWebsiteBoxes(items);assert.equal(boxes.length,4);assert.equal(boxes.find(box=>box.id==='named:项目甲').items.length,2);assert.equal(boxes.find(box=>box.id==='origin:http://localhost:5173').items.length,2);
});
test('timestamps include year, month, day, seconds and Taipei cross-day conversion',()=>{
 assert.equal(websiteTime('2026-09-29T22:01:37.621Z'),'2026年09月30日 06:01:37');assert.equal(websiteTime('invalid'),'时间未记录');
});
test('repeat deliveries survive, final/task_complete echoes and rescans are idempotent',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'pulse-website-history-'));await mkdir(path.join(directory,'sessions'));await mkdir(path.join(directory,'data'));
 const records=[{timestamp:'2026-09-01T00:00:00.000Z',type:'session_meta',payload:{id:'fixture'}}];
 for(const timestamp of ['2026-09-01T00:01:00.000Z','2026-09-01T00:01:01.000Z','2026-09-02T00:01:00.000Z']){const text='已上线 [项目](https://same.test/)';records.push({timestamp,type:'response_item',payload:{type:'message',role:'assistant',phase:'final',content:[{type:'output_text',text}]}},{timestamp:new Date(Date.parse(timestamp)+5000).toISOString(),type:'event_msg',payload:{type:'task_complete',last_agent_message:text}});}
 const oldText='已上线 [项目](https://same.test/)';records.push({timestamp:'2026-09-03T00:00:00.000Z',type:'response_item',payload:{type:'message',role:'assistant',channel:'final',content:[{type:'output_text',text:oldText}]}},{timestamp:'2026-09-03T00:00:05.000Z',type:'event_msg',payload:{type:'task_complete',last_agent_message:oldText}});
 await writeFile(path.join(directory,'sessions','rollout-fixture.jsonl'),records.map(record=>JSON.stringify(record)).join('\n')+'\n');
 const collector=new WebsiteCollector(directory,path.join(directory,'data'),path.join(directory,'unused.json'));
 t.after(async()=>{collector.stop();collector.db.close();assert.equal(path.dirname(directory),os.tmpdir());assert.ok(path.basename(directory).startsWith('pulse-website-history-'));await rm(directory,{recursive:true,force:true});});
 await collector.scanAll();assert.equal(collector.db.prepare('SELECT COUNT(*) count FROM links').get().count,1);assert.equal(collector.db.prepare('SELECT COUNT(*) count FROM events').get().count,4);
 await collector.scanAll();assert.equal(collector.db.prepare('SELECT COUNT(*) count FROM events').get().count,4);
 collector.db.prepare('UPDATE cursors SET state=?').run('{}');await collector.scanAll();assert.equal(collector.db.prepare('SELECT COUNT(*) count FROM events').get().count,4);
});
