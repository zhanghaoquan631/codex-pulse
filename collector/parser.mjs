import { createHash } from 'node:crypto';
export const fields={input:'input_tokens',cached:'cached_input_tokens',cacheWrite:'cache_write_input_tokens',output:'output_tokens',reasoning:'reasoning_output_tokens',total:'total_tokens'};
export function usage(raw){if(!raw)return null;const out={};for(const [k,v] of Object.entries(fields)){const n=raw[v]??0;if(!Number.isSafeInteger(n)||n<0)return null;out[k]=n;}return out;}
export function freshState(){return {offset:0,ordinal:0,session:null,boundary:0,model:'未知模型',previous:null,metaSeen:false,turnTime:null,provider:null};}
export function consume(record,state){
 const ordinal=state.ordinal++;
 const p=record.payload;
 if(record.type==='session_meta'&&!state.metaSeen){state.metaSeen=true;state.session=typeof p?.id==='string'?p.id:null;state.provider=typeof p?.model_provider==='string'?p.model_provider:null;state.boundary=Number.isSafeInteger(p?.subagent_history_start_ordinal)?p.subagent_history_start_ordinal:0;return null;}
 if(record.type==='turn_context'){if(typeof p?.model==='string')state.model=p.model.slice(0,100);if(typeof p?.model_provider==='string')state.provider=p.model_provider;state.turnTime=Number.isFinite(Date.parse(record.timestamp))?new Date(record.timestamp).toISOString():null;return null;}
 if(ordinal<state.boundary||record.type!=='event_msg'||p?.type!=='token_count'||!p.info)return null;
 const current=usage(p.info.total_token_usage),last=usage(p.info.last_token_usage);if(!current)return null;
 const before=state.previous;state.previous=current;
 if(before&&Object.keys(fields).every(k=>before[k]===current[k]))return null;
 let delta,corrected=0;
 if(!before){delta=last||current;if(last&&last.total!==current.total)corrected=1;}
 else{delta=Object.fromEntries(Object.keys(fields).map(k=>[k,current[k]-before[k]]));if(Object.values(delta).some(v=>v<0)||(last&&Object.keys(fields).some(k=>delta[k]!==last[k]))){if(!last)return null;delta=last;corrected=1;}}
 if(!delta.total||!Number.isFinite(Date.parse(record.timestamp)))return null;
 const stamp=new Date(record.timestamp).toISOString();const local=new Date(Date.parse(stamp)+8*3600_000).toISOString();
 const key=createHash('sha256').update(JSON.stringify([state.session,stamp,current])).digest('hex');
 return {key,time:stamp,turnTime:state.provider==='openai'?state.turnTime||null:null,day:local.slice(0,10),hour:local.slice(0,13),model:state.model,session:state.session||'unknown',...delta,requests:1,corrected};
}
