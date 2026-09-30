"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Check, Compass, ListTodo, NotebookPen, RefreshCw, Sprout } from 'lucide-react';
import { compassHabits, compassKinds, compassQuestions, compassToday, type CompassKind, type CompassState } from '@/lib/compass-types';

export default function CompassToday() {
  const [date,setDate]=useState(compassToday),[view,setView]=useState('tasks');
  const [state,setState]=useState<CompassState|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[needsLogin,setNeedsLogin]=useState(false),[message,setMessage]=useState('');
  const [text,setText]=useState(''),[kind,setKind]=useState<CompassKind|'task'>('task'),[due,setDue]=useState(''),[showDone,setShowDone]=useState(false);
  const [scores,setScores]=useState<(number|null)[]>([null,null,null,null,null,null]),[scoresDirty,setScoresDirty]=useState(false),[scoresVersion,setScoresVersion]=useState(0);
  const pending=useRef<{fingerprint:string;id:string}|null>(null),generation=useRef(0),dirty=useRef(false),saving=useRef(false);
  useEffect(()=>{dirty.current=!!text.trim()||scoresDirty;},[text,scoresDirty]);
  const load=useCallback(async()=>{
    const current=++generation.current;
    try{const response=await fetch('/api/compass?date='+date,{cache:'no-store'});const data=await response.json() as CompassState & {needsLogin?:boolean;error?:string};if(current!==generation.current)return;
      if(!response.ok){if(data.needsLogin){setNeedsLogin(true);setState(null);}throw new Error(data.error||'暂时无法读取记录。');}
      setNeedsLogin(false);setState(data);setScores(data.day.scores);setScoresVersion(data.day.version);setScoresDirty(false);
    }catch(error){if(current===generation.current)setMessage(error instanceof Error?error.message:'暂时无法连接，请重试。');}finally{if(current===generation.current)setLoading(false);}
  },[date]);
  const invalidate=useCallback(()=>{generation.current++;},[]);
  // Remote records update only after fetch settles; the generation rejects stale responses.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{void load();return invalidate;},[load,invalidate]);
  useEffect(()=>{let active=true;async function verifySession(){try{const response=await fetch('/api/compass?date='+date,{cache:'no-store'});if(active&&response.status===401){invalidate();setState(null);setNeedsLogin(true);setLoading(false);setBusy(false);}}catch{/* A transient network failure does not discard a draft. */}}window.addEventListener('focus',verifySession);window.addEventListener('pageshow',verifySession);return()=>{active=false;window.removeEventListener('focus',verifySession);window.removeEventListener('pageshow',verifySession);};},[date,invalidate]);
  useEffect(()=>{const guard=(event:BeforeUnloadEvent)=>{if(dirty.current){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[]);
  async function mutate(body:Record<string,unknown>,success:string){
    if(saving.current||loading)return false;saving.current=true;setBusy(true);setMessage('');const current=generation.current;
    try{const response=await fetch('/api/compass',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,date})});const data=await response.json() as CompassState & {needsLogin?:boolean;error?:string};if(current!==generation.current)return false;
      if(!response.ok){if(data.needsLogin){setNeedsLogin(true);setState(null);}throw new Error(data.error||'保存失败，请重试。');}
      setState(data);if(!scoresDirty||body.action==='scores'){setScores(data.day.scores);setScoresVersion(data.day.version);setScoresDirty(false);}else if(body.action==='habit'){setScoresVersion(data.day.version);}
      setMessage(success);return true;
    }catch(error){if(current===generation.current)setMessage(error instanceof Error?error.message:'连接中断，输入已保留，请重试。');return false;}finally{saving.current=false;if(current===generation.current)setBusy(false);}
  }
  async function capture(){
    if(!text.trim())return;
    const fingerprint=JSON.stringify([date,kind,text.trim(),kind==='task'?due:null]);
    if(pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,id:crypto.randomUUID()};
    if(await mutate({action:kind==='task'?'task':'entry',id:pending.current.id,text:text.trim(),kind,due:due||null},'已保存到 Compass。')){setText('');setDue('');pending.current=null;setView(kind==='task'?'tasks':'journal');}
  }
  function changeDate(next:string){if(!next)return;setState(null);setLoading(true);setMessage('');setDate(next);}
  const tasks=(state?.tasks||[]).filter(task=>showDone||!task.done),canEdit=!!state&&!loading&&!busy&&!needsLogin;
  return <section className="compass-today" aria-labelledby="compass-today-title">
    <header className="compass-heading"><div className="compass-title"><Compass size={28} aria-hidden="true"/><div><p>每日记录</p><h2 id="compass-today-title">Compass 今日</h2></div></div><div className="compass-date"><label htmlFor="compass-date">记录日期</label><input id="compass-date" type="date" min="2000-01-01" max="2099-12-31" value={date} disabled={busy||!!text.trim()||scoresDirty} onChange={e=>changeDate(e.target.value)}/><button type="button" disabled={busy||!!text.trim()||scoresDirty||date===compassToday()} onClick={()=>changeDate(compassToday())}>今天</button></div></header>
    <p className="compass-intro">在这里记日记、清待办、记录小习惯。登录管理账号后，记录会保存到网站。</p>
    {needsLogin ? <div className="compass-signin"><NotebookPen size={25}/><div><h3>打开自己的每日记录</h3><p>日记、任务和评分仅网站管理账号可查看。网页记录独立保存，不会自动读取电脑里的笔记。</p></div><a href="/signin-with-chatgpt?return_to=%2F%23knowledge%3Fview%3Dcompass" target="_top">登录后使用</a></div> : <>
      <div className="compass-workspace">
        <div className="compass-primary">
          <form className="compass-capture" onSubmit={e=>{e.preventDefault();void capture();}}>
            <div className="compass-capture-heading"><label htmlFor="compass-text">快速记一笔</label><select aria-label="Compass 记录类型" value={kind} disabled={!canEdit} onChange={e=>setKind(e.target.value as typeof kind)}><option value="task">待办事项</option>{Object.entries(compassKinds).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div>
            <textarea id="compass-text" placeholder={loading?'正在读取记录…':'有什么需要记住？'} value={text} disabled={!canEdit} maxLength={4000} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();void capture();}}}/>
            <div className="compass-capture-bottom">{kind==='task'?<label>截止日期<input aria-label="Compass 任务截止日期" type="date" min="2000-01-01" max="2099-12-31" value={due} disabled={!canEdit} onChange={e=>setDue(e.target.value)}/></label>:<span>保存到 {date}</span>}<button className="compass-save" type="submit" disabled={!canEdit||!text.trim()}>{busy?'保存中…':'记下来'}</button></div>
          </form>
          <div className="compass-tabs" role="group" aria-label="Compass 功能">{[{id:'tasks',label:'待办',icon:ListTodo},{id:'journal',label:'日记',icon:NotebookPen},{id:'questions',label:'每日自问',icon:BookOpen}].map(({id,label,icon:Icon})=><button type="button" key={id} aria-pressed={view===id} onClick={()=>setView(id)}><Icon size={16} aria-hidden="true"/>{label}</button>)}</div>
          {loading?<p className="compass-empty" role="status">正在读取 Compass 记录…</p>:state&&<>
            {view==='tasks'&&<div className="compass-list"><div className="compass-section-heading"><h3>任务收件箱 <small>{state.tasks.filter(t=>!t.done).length} 项待办</small></h3><label><input type="checkbox" checked={showDone} onChange={e=>setShowDone(e.target.checked)}/>已完成</label></div>{tasks.length?tasks.map(task=><label className={'compass-task'+(task.done?' is-done':'')} key={task.id}><input type="checkbox" checked={task.done} disabled={!canEdit} onChange={e=>void mutate({action:'toggle',id:task.id,done:e.target.checked,version:task.version},e.target.checked?'任务已完成。':'任务已恢复为待办。')}/><span>{task.text}{task.due&&<small className={!task.done&&task.due<compassToday()?'is-overdue':''}>截止 {task.due}</small>}</span></label>):<p className="compass-empty">{showDone?'还没有任务，在上方添加第一件事。':'当前没有待办。把下一件想做的事记下来。'}</p>}<p className="compass-subtle">待办跨日期保留，最多显示最近 500 项。</p></div>}
            {view==='journal'&&<div className="compass-list"><div className="compass-section-heading"><h3>{date} 的片段</h3><span>{state.entries.length} 条</span></div>{state.entries.length?state.entries.map(entry=><article className="compass-entry" key={entry.id}><div><span>{compassKinds[entry.kind]}</span><time>{new Date(entry.created).toLocaleTimeString('zh-CN',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit'})}</time></div><p>{entry.text}</p></article>):<p className="compass-empty">这一天还没有记录。选择「日记」「今日收获」或「感恩」，留下一段文字。</p>}{state.entries.length>=500&&<p className="compass-subtle">显示这一天最近 500 条记录。</p>}</div>}
            {view==='questions'&&<form className="compass-questions" onSubmit={e=>{e.preventDefault();void mutate({action:'scores',scores,version:scoresVersion},'今日评分已保存。');}}><h3>今天，我尽力了吗？</h3><p>1–10 分，只衡量努力；没填的留空。</p>{compassQuestions.map((question,index)=><label key={question}><span>{question}</span><select aria-label={question} disabled={!canEdit} value={scores[index]??''} onChange={e=>{setScores(scores.map((score,i)=>i===index?(e.target.value?Number(e.target.value):null):score));setScoresDirty(true);}}><option value="">—</option>{Array.from({length:10},(_,i)=><option key={i} value={i+1}>{i+1}</option>)}</select></label>)}<div className="compass-score-actions"><button className="compass-save" type="submit" disabled={!canEdit||!scoresDirty}>保存今日评分</button>{scoresDirty&&<button type="button" disabled={busy} onClick={()=>{setScores(state.day.scores);setScoresVersion(state.day.version);setScoresDirty(false);}}>放弃未保存评分</button>}</div></form>}
          </>}
        </div>
        <aside className="compass-habits"><div className="compass-section-heading"><h3><Sprout size={18} aria-hidden="true"/>小习惯</h3><span>{state?.day.habits.filter(Boolean).length||0} / 3</span></div><p>{date} · 完成一件，点亮一件。</p>{compassHabits.map((habit,index)=><button type="button" key={habit} aria-pressed={state?.day.habits[index]||false} disabled={!canEdit||scoresDirty} onClick={()=>void mutate({action:'habit',index,value:!state!.day.habits[index],version:state!.day.version},state!.day.habits[index]?'已取消这次打卡。':'习惯已打卡。')}><span className="compass-habit-check">{state?.day.habits[index]&&<Check size={15}/>}</span>{habit}</button>)}<p className="compass-subtle">打卡与日记分开保存，可再次点击取消。填写评分时，请先保存评分。</p><div className="compass-day-summary"><strong>{state?.entries.length||0}</strong><span>这一天留下的片段</span><strong>{state?.day.scores.filter(s=>s!==null).length||0} / 6</strong><span>已回答的每日自问</span></div></aside>
      </div>
    </>}
    <div className="compass-status"><p role="status">{message||'网页记录独立保存。日记、习惯与评分按日期归档。'}</p><button type="button" disabled={busy||loading||scoresDirty} onClick={()=>{setLoading(true);setMessage('');void load();}}><RefreshCw size={14} aria-hidden="true"/>重新读取</button></div>
    {(!!text.trim()||scoresDirty)&&<p className="compass-draft-note">有未保存的输入，请先保存或清空后再切换日期。{text&&<button type="button" disabled={busy} onClick={()=>setText('')}>清空输入</button>}</p>}
    <details className="compass-guide"><summary>使用备忘录</summary><p>先在上方选择日期。快速记录支持待办、日记、今日收获和感恩，按 Ctrl + Enter 也可提交。任务可勾选完成，再从「已完成」恢复；习惯点击即保存；每日自问填写后点击保存。</p><p>切换日期可回看过往日记、打卡和评分。遇到另一页面修改同一天记录的提示，请先保留自己的输入，放弃未保存评分，再「重新读取」后核对填写。</p><p>基于 <a href="https://github.com/AgriciDaniel/compass" target="_blank" rel="noopener noreferrer">AgriciDaniel / compass</a> 的每日记录方式实现。这个板块在网页中使用，不需要打开桌面应用。</p></details>
  </section>;
}
