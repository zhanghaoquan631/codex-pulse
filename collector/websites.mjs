import {createReadStream} from 'node:fs';
import {readdir,stat,readFile,open} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {setImmediate as yieldNow} from 'node:timers/promises';
import {extractWebsites} from './website-parser.mjs';
import {cleanWebsiteUrl} from '../lib/website-url.ts';

export class WebsiteCollector{
  constructor(root,dataDir,configFile){
    this.root=root;this.configFile=configFile;this.stopped=false;this.uploading=false;
    this.progress={phase:'importing',files:0,scanned:0,saved:0,errors:0,sync:'waiting'};
    this.db=new DatabaseSync(path.join(dataDir,'websites.sqlite'));
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS cursors(path TEXT PRIMARY KEY,state TEXT NOT NULL); CREATE TABLE IF NOT EXISTS links(url TEXT PRIMARY KEY,title TEXT NOT NULL,kind TEXT NOT NULL,firstSeen TEXT NOT NULL,lastSeen TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,synced INTEGER NOT NULL DEFAULT 0);');
    this.db.exec('CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,url TEXT NOT NULL,title TEXT NOT NULL,observedAt TEXT NOT NULL,synced INTEGER NOT NULL DEFAULT 0); CREATE INDEX IF NOT EXISTS events_url_time ON events(url,observedAt);');
    this.addEvent=this.db.prepare('INSERT OR IGNORE INTO events(id,url,title,observedAt) VALUES (?,?,?,?)');
    this.get=this.db.prepare('SELECT state FROM cursors WHERE path=?');
    this.put=this.db.prepare('INSERT INTO cursors VALUES (?,?) ON CONFLICT(path) DO UPDATE SET state=excluded.state');
    this.insert=this.db.prepare("INSERT INTO links (url,title,kind,firstSeen,lastSeen) VALUES (?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET title=CASE WHEN excluded.title<>? AND (links.title=? OR length(excluded.title)>length(links.title)) THEN excluded.title ELSE links.title END,kind=CASE WHEN excluded.kind='developed' THEN 'developed' ELSE links.kind END,firstSeen=MIN(links.firstSeen,excluded.firstSeen),lastSeen=MAX(links.lastSeen,excluded.lastSeen),revision=links.revision+1 WHERE excluded.firstSeen<links.firstSeen OR excluded.lastSeen>links.lastSeen OR length(excluded.title)>length(links.title) OR (excluded.kind='developed' AND links.kind!='developed')");
  }
  async discover(dir,files=[]){let entries;try{entries=await readdir(dir,{withFileTypes:true});}catch(e){if(e.code!=='ENOENT')this.progress.errors++;return files;}for(const entry of entries){const file=path.join(dir,entry.name);if(entry.isDirectory())await this.discover(file,files);else if(entry.isFile()&&/^rollout-.*\.jsonl$/.test(entry.name)){try{files.push({file,info:await stat(file)});}catch{this.progress.errors++;}}}return files;}
  async anchor(file,offset){if(!offset)return '';const fd=await open(file,'r');try{const length=Math.min(offset,512),buffer=Buffer.alloc(length);await fd.read(buffer,0,length,offset-length);return createHash('sha256').update(buffer).digest('hex');}finally{await fd.close();}}
  async scan(file,info){
    const row=this.get.get(file);let state=row?JSON.parse(row.state):{offset:0,ordinal:0};
    // Re-read existing logs once to restore intermediate deliveries, without deleting links.
    if(state.historyVersion!==2)state={offset:0,ordinal:0};
    const identity=String(info.ino)+':'+info.birthtimeMs;
    if(state.identity!==identity||info.size<state.offset)state={offset:0,ordinal:0};
    if(state.size===info.size&&state.mtime===info.mtimeMs)return;
    if(state.offset&&state.anchor&&await this.anchor(file,state.offset)!==state.anchor)state={offset:0,ordinal:0};
    state.identity=identity;
    state.historyVersion=2;
    if(info.size>state.offset){
      let tail=Buffer.alloc(0),skipping=false,position=state.offset;
      const stream=createReadStream(file,{start:state.offset,end:info.size-1,highWaterMark:256*1024});
      for await(const chunk of stream){if(this.stopped){stream.destroy();break;}let at=0;this.db.exec('BEGIN');
        try{while(at<chunk.length){const end=chunk.indexOf(10,at);if(end<0){const rest=chunk.subarray(at);if(!skipping){if(tail.length+rest.length>2*1024*1024){tail=Buffer.alloc(0);skipping=true;}else tail=Buffer.concat([tail,rest]);}position+=rest.length;break;}
          const piece=chunk.subarray(at,end);position+=piece.length+1;
          if(!skipping){const line=tail.length?Buffer.concat([tail,piece]):piece;
            const prefix=line.subarray(0,180).toString('utf8');
            if(prefix.includes('session_meta')||(!state.subagent&&((prefix.includes('response_item')||prefix.includes('event_msg'))&&(line.includes(Buffer.from('http'))||line.includes(Buffer.from('task_started')))))){
              let record;try{record=JSON.parse(line.toString('utf8'));}catch{}
              if(record?.type==='session_meta'&&!state.metaSeen){state.metaSeen=true;state.subagent=typeof record.payload?.source==='object'&&!!record.payload.source?.subagent;state.boundary=record.payload?.subagent_history_start_ordinal||0;}
              if(record?.payload?.type==='task_started')state.lastFinalHash=null;
              const payload=record?.payload;
              const final=record?.type==='response_item'&&payload?.type==='message'&&payload.role==='assistant'&&(payload.phase==='final'||payload.phase==='final_answer'||(!payload.phase&&payload.channel==='final'));
              const legacy=record?.type==='event_msg'&&payload?.type==='task_complete'&&typeof payload.last_agent_message==='string';
              const message=final?(payload.content||[]).filter(part=>part.type==='output_text').map(part=>part.text).join('\n'):legacy?payload.last_agent_message:null;
              const hash=message===null?null:createHash('sha256').update(message).digest('hex');
              const echo=legacy&&hash===state.lastFinalHash;
              if(final)state.lastFinalHash=hash;
              if(record&&!echo&&!state.subagent&&state.ordinal>=(state.boundary||0))for(const link of extractWebsites(record)){
                this.insert.run(link.url,link.title,link.kind,link.firstSeen,link.lastSeen,new URL(link.url).hostname,new URL(link.url).hostname);
                const id=createHash('sha256').update(`${link.url}|${link.firstSeen}`).digest('hex');
                this.addEvent.run(id,link.url,link.title,link.firstSeen);
              }
            }
          }
          state.ordinal++;state.offset=position;tail=Buffer.alloc(0);skipping=false;at=end+1;
        }this.put.run(file,JSON.stringify(state));this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
        await yieldNow();
      }
    }
    state.size=info.size;state.mtime=info.mtimeMs;state.anchor=await this.anchor(file,state.offset);this.put.run(file,JSON.stringify(state));
  }
  async scanAll(){this.progress.errors=0;const files=await this.discover(path.join(this.root,'sessions'));await this.discover(path.join(this.root,'archived_sessions'),files);files.sort((a,b)=>b.info.mtimeMs-a.info.mtimeMs);this.progress.files=files.length;this.progress.scanned=0;
    for(const {file,info} of files){if(this.stopped)return;try{await this.scan(file,info);}catch{this.progress.errors++;}this.progress.scanned++;this.progress.saved=this.db.prepare('SELECT COUNT(*) count FROM links').get().count;}
    this.progress.phase='ready';
  }
  async upload(){if(this.uploading||this.stopped)return;this.uploading=true;try{
    const config=JSON.parse((await readFile(this.configFile,'utf8')).replace(/^\uFEFF/,'')),url=new URL('/api/websites/sync',config.siteUrl);if(url.protocol!=='https:'||!config.ingestToken)throw new Error('Not configured');
    // Bounded batches preserve all links and never overwrite owner edits or deletion markers.
    for(let batch=0;batch<20&&!this.stopped;batch++){
      const rows=this.db.prepare('SELECT * FROM links WHERE synced<revision ORDER BY lastSeen DESC LIMIT 50').all();
      const items=rows.filter(row=>cleanWebsiteUrl(row.url)===row.url).map(({url,title,kind,firstSeen,lastSeen})=>({url,title,kind,firstSeen,lastSeen}));
      const eventRows=this.db.prepare('SELECT * FROM events WHERE synced=0 ORDER BY observedAt DESC,id LIMIT 50').all();
      const events=eventRows.filter(row=>cleanWebsiteUrl(row.url)===row.url).map(({url,title,observedAt})=>({url,title,observedAt}));
      const headers={'Content-Type':'application/json','Authorization':`Bearer ${config.ingestToken}`};if(config.sitesToken)headers['OAI-Sites-Authorization']=`Bearer ${config.sitesToken}`;
      const r=await fetch(url,{method:'POST',headers,body:JSON.stringify({items,events,progress:this.progress}),redirect:'error',signal:AbortSignal.timeout(15000)});
      if(!r.ok){this.progress.sync=`http-${r.status}`;return;}if(!(await r.json()).ok)throw new Error('Invalid response');
      for(const row of rows)this.db.prepare('UPDATE links SET synced=MAX(synced,?) WHERE url=?').run(row.revision,row.url);
      for(const row of eventRows)this.db.prepare('UPDATE events SET synced=1 WHERE id=?').run(row.id);
      this.progress.sync='synced';if(rows.length<50&&eventRows.length<50)break;
    }
  }catch{this.progress.sync='network-error';}finally{this.uploading=false;}}
  start(){this.uploadTimer=setInterval(()=>this.upload(),10000);this.cycle();}
  async cycle(){if(this.stopped)return;try{await this.scanAll();}catch{this.progress.errors++;}await this.upload();if(!this.stopped)this.timer=setTimeout(()=>this.cycle(),10000);}
  stop(){this.stopped=true;clearInterval(this.uploadTimer);clearTimeout(this.timer);}
}
