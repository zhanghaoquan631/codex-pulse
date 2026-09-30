/* Simple desktop ledger. Uses the original local ledger and receipt bridge. */
(() => {
  'use strict';
  const Core = window.MEZipFinance;
  const KEY = 'mezip.finance.center.v2';
  const LINK_KEY = 'mezip.finance.mobile-link.v12';
  const BRIDGE = 'http://127.0.0.1:4325';
  const demo = new URLSearchParams(location.search).get('demo') === '1';
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>'"]/gu, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const accounts = {WECHAT_PAY:'微信支付',ALIPAY:'支付宝',BANK:'银行卡',CASH:'现金',CREDIT_CARD:'信用卡',OTHER:'其他'};
  const types = {EXPENSE:'支出',INCOME:'收入',REFUND:'退款',TRANSFER:'内部转账',UNKNOWN:'待分类'};
  const categories = ['餐饮美食','购物消费','交通出行','生活日用','工作支出','工作收入','订阅服务','人情往来','旅行','学习教育','医疗健康','住房','娱乐休闲','其他','未分类'];
  const gridFields = ['sku','nameSpec','unit','quantity','unitPrice','amount','remark'];
  const gridLabels = ['货号','名称及规格','单位','数量','单价','金额','备注'];
  const now = () => new Date().toISOString();
  const id = () => 'tx-' + crypto.randomUUID();
  const localInput = value => { const date = new Date(value || Date.now()); return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset()*60000).toISOString().slice(0,16); };
  const dateKey = value => localInput(value).slice(0,10);
  const monthKey = value => dateKey(value).slice(0,7);
  const money = value => '¥' + ((Number(value)||0)/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
  const receiptId = record => 'mobile-receipt-' + record.id.replace(/^receipt-/u,'');
  const content = $('#page-content');
  const dialog = $('#app-dialog');
  const dc = $('#dialog-content');
  let receipts = [];
  let connected = false;
  let route = ['pending','inbox'].includes(location.hash.slice(1)) ? 'pending' : 'ledger';
  let period = monthKey(now());
  let search = '';
  let kind = 'ALL';
  let events;
  let reloadTimer;
  let retryTimer;
  let toastTimer;
  let mobileLink = '';
  let loading = false;
  try { const saved = JSON.parse(sessionStorage.getItem(LINK_KEY)||'null'); if (saved && (saved.permanent || Date.parse(saved.expiresAt)>Date.now())) mobileLink = saved.url || ''; } catch {}
  let demoState = makeDemo();

  function makeDemo() {
    const state = Core.blankState();
    const month = monthKey(now());
    const sample = [['瑞幸咖啡','生椰拿铁',1800,'EXPENSE','WECHAT_PAY','餐饮美食',29,'午后咖啡'],['生活超市','日常采购',12650,'EXPENSE','ALIPAY','生活日用',29,'周末采购'],['项目结算','设计服务',380000,'INCOME','BANK','工作收入',28,'海报设计 · 尾款'],['滴滴出行','快车',3250,'EXPENSE','WECHAT_PAY','交通出行',28,'去工作室'],['书店','设计书籍',8900,'EXPENSE','WECHAT_PAY','学习教育',27,'参考资料'],['软件订阅','月度订阅',14500,'EXPENSE','ALIPAY','订阅服务',26,'创作工具']];
    state.transactions = sample.map(([merchant,description,amountCents,type,account,category,day,note]) => ({id:id(),ownerId:state.ownerId,merchant,description,amountCents,type,account,accountId:account,category,note,occurredAt:new Date(month+'-'+day+'T12:30:00').toISOString(),createdAt:now(),updatedAt:now(),source:'MANUAL',status:'POSTED',currency:'CNY'}));
    state.simplePending = [{id:id(),ownerId:state.ownerId,merchant:'便利店',description:'购物小票',amountCents:2450,type:'EXPENSE',account:'WECHAT_PAY',category:'生活日用',occurredAt:now(),createdAt:now(),source:'WECHAT_FILE_IMPORT',reviewReason:'核对金额、日期与分类'}];
    return state;
  }
  function read() {
    if (demo) return structuredClone(demoState);
    const raw = localStorage.getItem(KEY);
    if (!raw) return Core.blankState();
    let saved;
    try { saved = JSON.parse(raw); } catch { throw new Error('原账本数据无法读取。请先备份或恢复数据，避免覆盖原记录。'); }
    if (!saved || !Array.isArray(saved.transactions)) throw new Error('原账本格式不正确，已停止写入。');
    return Core.hydrateState(saved);
  }
  function save(state) {
    if (demo) { demoState = structuredClone(state); return; }
    try { localStorage.setItem(KEY,JSON.stringify(state)); } catch { throw new Error('当前浏览器无法保存账本（可能空间不足）。请先导出备份，再重试。'); }
  }
  const bills = state => state.transactions.filter(tx => tx.ownerId === state.ownerId && !tx.simpleArchivedAt);
  const localPending = state => (state.simplePending || []).filter(tx => !tx.simpleArchivedAt);
  function pending(state) {
    const hidden = new Set(state.simpleHiddenReceipts || []);
    const posted = new Set(state.transactions.map(tx => tx.id));
    const result = receipts.filter(record => record.status !== 'REJECTED' && !hidden.has(record.id) && !posted.has(receiptId(record))).map(record => ({id:record.id,record,transaction:null}));
    return [...result,...localPending(state).map(tx => ({id:tx.id,transaction:tx,record:null}))].sort((a,b) => new Date(b.record?.createdAt || b.transaction?.createdAt || 0) - new Date(a.record?.createdAt || a.transaction?.createdAt || 0));
  }
  function totals(rows) {
    let income=0,expense=0,refund=0;
    rows.forEach(tx => { const amount=Number(tx.amountCents)||0; if(tx.type==='INCOME') income+=amount; else if(tx.type==='EXPENSE') expense+=amount; else if(tx.type==='REFUND') refund+=amount; });
    return {income,expense:expense-refund,balance:income-expense+refund,refund};
  }
  function notify(message, error=false) {
    const toast=$('#toast'); toast.textContent=message; toast.hidden=false; toast.classList.toggle('is-error',error);
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>toast.hidden=true,4500);
  }
  function close() { dialog.close(); dc.innerHTML=''; }
  function modal(title,subtitle,html) {
    if(dialog.open) dialog.close();
    dc.innerHTML='<section class="dialog-shell"><header class="dialog-head"><div><h2 id="dialog-title">'+esc(title)+'</h2><p>'+esc(subtitle)+'</p></div><button class="dialog-close" type="button" aria-label="关闭">×</button></header><div class="dialog-scroll">'+html+'</div></section>';
    $('.dialog-close',dc).onclick=close; dialog.showModal();
  }
  function empty(title,text,button='') { return '<div class="empty"><div class="empty-icon" aria-hidden="true">≡</div><strong>'+esc(title)+'</strong><p>'+esc(text)+'</p>'+button+'</div>'; }
  function navigate(next) { route=next; history.replaceState(null,'','#'+next); render(); }
  function render() {
    try {
      const state=read(); const posted=bills(state); const inPeriod=posted.filter(tx=>!period || monthKey(tx.occurredAt)===period); const sum=totals(inPeriod); const count=pending(state).length;
      $('#tab-ledger').textContent=posted.length; $('#tab-pending').textContent=count;
      $('[data-route="ledger"]').classList.toggle('is-active',route==='ledger'); $('[data-route="pending"]').classList.toggle('is-active',route==='pending');
      $('#summary-period').textContent=period ? period.replace('-',' 年 ')+' 月收支' : '全部收支';
      $('#month').value=period; $('#all-period').textContent=period ? '查看全部' : '返回本月';
      const metric=(label,value,tone,icon,note)=>'<article class="metric '+tone+'"><span class="metric-label">'+label+'<span class="metric-icon" aria-hidden="true">'+icon+'</span></span><strong class="metric-value"><small>¥</small>'+((value||0)/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})+'</strong><span class="metric-note">'+note+'</span></article>';
      $('#summary').innerHTML=metric('支出',sum.expense,'expense','↗',sum.refund?'已抵减退款 '+money(sum.refund):'已确认的支出记录')+metric('收入',sum.income,'income','↙','已确认的收入记录')+metric('结余',sum.balance,'balance','≈','收入 − 支出')+'<button class="metric pending" id="pending-metric"><span class="metric-label">待确认<span class="metric-icon" aria-hidden="true">◷</span></span><strong class="metric-value">'+count+'<small> 笔</small></strong><span class="metric-note">核对后再加入账本 →</span></button>';
      $('#pending-metric').onclick=()=>navigate('pending');
      if(route==='pending') renderPending(state); else renderLedger(state);
    } catch(error) { content.innerHTML=empty('账本读取失败',error.message); notify(error.message,true); }
  }
  function renderLedger(state) {
    const all=bills(state).filter(tx=>!period||monthKey(tx.occurredAt)===period);
    content.innerHTML='<div class="table-toolbar"><label class="search-field"><span aria-hidden="true">⌕</span><input id="bill-search" placeholder="搜索商家、订单号或备注" aria-label="搜索账本" value="'+esc(search)+'"/></label><div class="toolbar-right"><span class="toolbar-count">'+all.length+' 笔记录</span><select id="bill-kind" aria-label="筛选收支">'+[['ALL','全部收支'],...Object.entries(types)].map(([v,l])=>'<option value="'+v+'"'+(v===kind?' selected':'')+'>'+l+'</option>').join('')+'</select></div></div><div id="bill-table-region"></div>';
    const paint=()=>{
      const query=search.trim().toLowerCase();
      const rows=all.filter(tx=>(kind==='ALL'||tx.type===kind)&&(!query||[tx.merchant,tx.description,tx.note,tx.externalOrderId,tx.externalTransactionId,...(tx.noteGrid||[]).flatMap(row=>Object.values(row))].join(' ').toLowerCase().includes(query))).sort((a,b)=>new Date(b.occurredAt)-new Date(a.occurredAt));
      const region=$('#bill-table-region');
      if(!rows.length) {
        region.innerHTML=empty(all.length?'没有匹配的记录':'这本账，从第一笔开始。',all.length?'换个关键词或收支类型试试。':'可以手动记一笔，也可以将手机凭证确认入账。','<button class="button primary" id="empty-add">＋ 记一笔</button>');
        $('#empty-add').onclick=()=>edit(); return;
      }
      const days=new Map(); rows.forEach(tx=>{const key=dateKey(tx.occurredAt);if(!days.has(key))days.set(key,[]);days.get(key).push(tx);});
      let body='';
      for(const [day,entries] of days) {
        const sum=totals(entries);
        body+='<tr class="day-row"><td colspan="7">'+esc(day.replaceAll('-','.'))+'<span>'+(query||kind!=='ALL'?'筛选支出 ':'当日支出 ')+money(sum.expense)+(sum.income?' · 收入 '+money(sum.income):'')+'</span></td></tr>';
        body+=entries.map(tx=>'<tr><td style="white-space:nowrap;color:#9ba5b5">'+esc(localInput(tx.occurredAt).slice(11))+'</td><td class="merchant-cell"><strong>'+esc(tx.merchant||tx.counterparty||'未填写商家')+'</strong><small>'+esc(tx.description||types[tx.type]||'账单')+'</small></td><td class="category-column"><span class="category-tag">'+esc(tx.category||'其他')+'</span></td><td><span class="account-tag '+(tx.account==='WECHAT_PAY'?'wechat':tx.account==='ALIPAY'?'alipay':'')+'"><i></i>'+esc(accounts[tx.account]||tx.account||'其他')+'</span></td><td class="money '+esc((tx.type||'').toLowerCase())+'">'+(tx.type==='EXPENSE'?'− ':['INCOME','REFUND'].includes(tx.type)?'+ ':'')+money(tx.amountCents)+(tx.type==='REFUND'?'<small> 退款</small>':tx.type==='TRANSFER'?'<small> 转账</small>':'')+'</td><td class="note-column note-cell">'+esc(tx.note||'—')+'</td><td><button class="edit-button" data-edit="'+esc(tx.id)+'" aria-label="编辑 '+esc(tx.merchant||'账单')+'">编辑</button></td></tr>').join('');
      }
      region.innerHTML='<div class="table-wrap"><table class="bill-table"><thead><tr><th>时间</th><th>商家 / 说明</th><th class="category-column">分类</th><th>支付方式</th><th style="text-align:right">金额</th><th class="note-column">备注</th><th></th></tr></thead><tbody>'+body+'</tbody></table></div><div class="table-bottom"><span>共 '+rows.length+' 笔 · 点击编辑可补充订单与明细</span><span>退款抵减支出，内部转账不计收支</span></div>';
      region.querySelectorAll('[data-edit]').forEach(button=>button.onclick=()=>edit(button.dataset.edit));
    };
    $('#bill-search').oninput=event=>{search=event.target.value;paint();};
    $('#bill-kind').onchange=event=>{kind=event.target.value;paint();}; paint();
  }
  function renderPending(state) {
    const items=pending(state);
    content.innerHTML='<div class="pending-intro"><div><h2>确认这一笔，再放进账本。</h2><p>手机凭证和文件导入都先放在这里；可修改金额、时间与订单信息。</p></div><button class="text-button" id="pending-import">导入账单 →</button></div>'+(!items.length?empty('当前没有待确认记录','从手机上传凭证，或导入微信、支付宝的账单文件。'): '<div class="pending-list">'+items.map(item=>{
      const tx=item.transaction||state.simpleReceiptDrafts?.[item.id]||item.record; const amount=item.transaction?item.transaction.amountCents:Core.toCents(tx.amount);
      return '<article class="pending-item">'+(item.record?.imageUrl?'<img class="pending-image" src="'+esc(BRIDGE+item.record.imageUrl)+'" alt="付款凭证"/>':'<div class="pending-image pending-symbol" aria-hidden="true">≡</div>')+'<div><h3>'+esc(tx.merchant||'待填写商家')+'<span class="pending-source">'+(item.record?'手机凭证':'账单导入')+'</span></h3><p>'+esc((item.record?'提交于 ':'交易于 ')+localInput(item.record?.createdAt||tx.occurredAt).replace('T',' '))+(tx.reviewReason?' · '+esc(tx.reviewReason):'')+'</p></div><span class="pending-amount">'+(amount?money(amount):'金额待填写')+'</span><button class="button" data-pending="'+esc(item.id)+'">核对并确认</button></article>';
    }).join('')+'</div>');
    $('#pending-import').onclick=showImport; content.querySelectorAll('[data-pending]').forEach(button=>button.onclick=()=>edit(button.dataset.pending,true));
  }
  function editorValues(tx,record,state) {
    const draft=record?state.simpleReceiptDrafts?.[record.id]||{}:{};
    const source={...(record||{}),...draft,...(tx||{})};
    return {amount:tx?(tx.amountCents/100).toFixed(2):source.amount||'',merchant:source.merchant||source.counterparty||'',description:source.description||'',type:source.type||'EXPENSE',account:source.account||'WECHAT_PAY',category:source.category||'其他',occurredAt:source.occurredAt||(record?record.createdAt:now()),note:source.note||'',externalOrderId:source.externalOrderId||'',noteGrid:source.noteGrid||[]};
  }
  function edit(entryId='',isPending=false) {
    const state=read(); let record=null; let tx=null;
    if(isPending) { const item=pending(state).find(item=>item.id===entryId); if(!item)return;record=item.record;tx=item.transaction; }
    else if(entryId) {tx=state.transactions.find(tx=>tx.id===entryId);if(!tx)return;record=receipts.find(record=>record.id===tx.receiptRecordId)||null;}
    const v=editorValues(tx,record,state);
    const image=record?.imageUrl?'<aside class="receipt-preview"><img src="'+esc(BRIDGE+record.imageUrl)+'" alt="原始付款凭证"/><p>手机提交时间<br>'+esc(localInput(record.createdAt).replace('T',' '))+'</p><a href="'+esc(BRIDGE+record.imageUrl)+'?download=1">下载原图</a></aside>':'';
    const field=(label,name,type='text',wide=false)=>'<label class="'+(wide?'wide':'')+'">'+label+'<input name="'+name+'" type="'+type+'" value="'+esc(type==='datetime-local'?localInput(v[name]):v[name])+'"'+(name==='amount'?' inputmode="decimal" placeholder="0.00" maxlength="16"':' maxlength="220"')+'/></label>';
    const select=(label,name,options)=>'<label>'+label+'<select name="'+name+'">'+Object.entries(v[name]&&!Object.hasOwn(options,v[name])?{...options,[v[name]]:v[name]}:options).map(([value,label])=>'<option value="'+esc(value)+'"'+(v[name]===value?' selected':'')+'>'+esc(label)+'</option>').join('')+'</select></label>';
    const formHtml='<form id="entry-form" novalidate><div class="record-top '+(!image?'no-photo':'')+'">'+image+'<div class="form-fields"><label class="wide amount-field">金额（元）<input name="amount" inputmode="decimal" placeholder="0.00" value="'+esc(v.amount)+'" maxlength="16"/></label>'+select('收支类型','type',record?{EXPENSE:'支出',INCOME:'收入'}:types)+select('支付方式','account',accounts)+field('商家 / 对方','merchant','text',true)+field('账单实际时间','occurredAt','datetime-local',true)+select('分类','category',Object.fromEntries([...new Set([...categories,v.category])].map(value=>[value,value])))+field('订单号（可选）','externalOrderId')+field('商品 / 说明（可选）','description','text',true)+'<label class="wide">备注（可选）<textarea name="note" maxlength="2000" placeholder="用途、报销说明或其他补充信息">'+esc(v.note)+'</textarea></label></div></div><details class="item-details"><summary>商品明细（可选）'+(v.noteGrid.length?' · '+v.noteGrid.length+' 行':'')+'</summary><p class="grid-help">需要记录上单商品时再展开；可以新增多行。</p><div class="grid-scroll"><table class="item-table"><thead><tr>'+gridLabels.map(label=>'<th>'+label+'</th>').join('')+'<th></th></tr></thead><tbody id="grid-rows"></tbody></table></div><button type="button" id="add-row" class="text-button add-row">＋ 添加商品</button></details><p id="form-error" class="form-error" hidden></p><footer class="form-footer"><span class="form-status">'+(isPending?'确认前不计入收支':entryId?'已入账，可继续修改':'保存后加入账本')+'</span><div>'+(entryId?'<button class="button danger" type="button" id="archive-entry">移到回收站</button>':'')+(isPending?'<button class="button" type="button" id="save-draft">保存草稿</button>':'')+'<button class="button primary" type="submit">'+(isPending?'确认入账':entryId?'保存修改':'保存记录')+'</button></div></footer></form>';
    modal(isPending?'核对账单':entryId?'编辑账单':'记一笔',tx?.reviewReason||'金额与实际交易时间可以修改，订单号与商品明细可选填。',formHtml);
    const form=$('#entry-form');const grid=$('#grid-rows');
    function addRow(value={}) {
      const row=document.createElement('tr');row.innerHTML=gridFields.map((name,index)=>'<td><input data-grid-field="'+name+'" aria-label="'+gridLabels[index]+'" value="'+esc(value[name]||'')+'" maxlength="'+(name==='remark'?220:120)+'"/></td>').join('')+'<td><button class="row-remove" type="button" aria-label="移除商品行">×</button></td>';
      $('.row-remove',row).onclick=()=>row.remove();grid.append(row);
    }
    v.noteGrid.forEach(addRow); $('#add-row').onclick=()=>addRow();
    function values() {
      const result=Object.fromEntries(new FormData(form));
      result.noteGrid=[...grid.rows].map(row=>Object.fromEntries(gridFields.map(name=>[name,$('[data-grid-field="'+name+'"]',row).value.trim()]))).filter(row=>Object.values(row).some(Boolean));
      result.merchant=result.merchant.trim();result.note=result.note.trim();result.externalOrderId=result.externalOrderId.trim();
      return result;
    }
    function validate(value,allowBlank=false) {
      const cents=Core.toCents(value.amount);
      if((!allowBlank||value.amount)&&(cents===null||cents<=0||!Number.isSafeInteger(cents)))throw new Error('请填写大于 0 的金额，最多保留两位小数。');
      if(!value.occurredAt||Number.isNaN(new Date(value.occurredAt).getTime()))throw new Error('请选择有效的账单实际时间。');
      if(!allowBlank&&value.type==='UNKNOWN')throw new Error('请确认这笔账单是收入、支出、退款还是内部转账。');
      return {...value,amountCents:cents||0,occurredAt:new Date(value.occurredAt).toISOString()};
    }
    async function perform(confirmed) {
      const buttons=form.querySelectorAll('button'); buttons.forEach(button=>button.disabled=true);$('#form-error').hidden=true;
      try {
        const v=validate(values(),!confirmed);const state=read();
        const updated={...(tx||{}),...v,id:tx?.id||(record?receiptId(record):id()),ownerId:state.ownerId,accountId:v.account,currency:'CNY',classificationBasis:'USER_CONFIRMATION',status:'POSTED',source:tx?.source||(record?'MOBILE_CAMERA':'MANUAL'),createdAt:tx?.createdAt||now(),updatedAt:now(),timezone:state.settings.timezone,receiptRecordId:record?.id||tx?.receiptRecordId,receiptCapturedAt:record?.createdAt||tx?.receiptCapturedAt};
        delete updated.amount;
        updated.fingerprint=Core.fingerprint(updated);
        if(record) {
          if(!demo) {
            await ensureSession();
            const result=await api('/v1/finance/mobile/receipts/'+encodeURIComponent(record.id),{method:'PATCH',body:JSON.stringify(v)});
            Object.assign(record,result.record);
          }
          state.simpleReceiptDrafts={...(state.simpleReceiptDrafts||{}),[record.id]:v};
          if(confirmed&&isPending) {
            if(!demo) {
              if(record.status==='CONFIRMED_TO_DESKTOP')await api('/v1/finance/mobile/receipts/'+encodeURIComponent(record.id)+'/reopen',{method:'POST'});
              const result=await api('/v1/finance/mobile/receipts/'+encodeURIComponent(record.id)+'/confirm',{method:'POST',body:JSON.stringify({ledgerEntryId:updated.id})});
              Object.assign(record,result.record);
            } else record.status='CONFIRMED_TO_DESKTOP';
          }
        }
        if(confirmed) {
          // Re-read after awaiting the bridge to preserve changes from other tabs.
          const latest=read();
          if(record)latest.simpleReceiptDrafts={...(latest.simpleReceiptDrafts||{}),[record.id]:v};
          const index=latest.transactions.findIndex(entry=>entry.id===updated.id);
          if(index>=0)latest.transactions[index]=updated;else latest.transactions.push(updated);
          latest.simplePending=(latest.simplePending||[]).filter(entry=>entry.id!==entryId);
          latest.reviewQueue=(latest.reviewQueue||[]).map(item=>item.transactionIds?.includes(updated.id)?{...item,status:'CONFIRMED'}:item);
          save(latest);
          if(dc.contains(form))close(); if(isPending)navigate('ledger');else render();notify(isPending?'已确认，加入账本。':entryId?'修改已保存。':'这一笔已记好。');
        } else {
          const latest=read();
          if(record)latest.simpleReceiptDrafts={...(latest.simpleReceiptDrafts||{}),[record.id]:v};
          if(tx)latest.simplePending=(latest.simplePending||[]).map(entry=>entry.id===entryId?updated:entry);
          save(latest);if(dc.contains(form))close();render();notify('草稿已保存，仍在待确认列表。');
        }
      }catch(error){$('#form-error',form).textContent=error.message;$('#form-error',form).hidden=false;}finally{buttons.forEach(button=>button.disabled=false);}
    }
    form.onsubmit=event=>{event.preventDefault();perform(true);};
    $('#save-draft')?.addEventListener('click',()=>perform(false));
    $('#archive-entry')?.addEventListener('click',()=>{
      try {
        const state=read();
        if(isPending&&record)state.simpleHiddenReceipts=[...new Set([...(state.simpleHiddenReceipts||[]),record.id])];
        else {const rows=isPending?state.simplePending:state.transactions;const entry=rows.find(entry=>entry.id===entryId);if(entry)entry.simpleArchivedAt=now();}
        save(state);close();render();notify('已移到回收站，可以从“数据”中恢复。');
      }catch(error){notify(error.message,true);}
    });
  }
  async function api(path,options={}) {
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
    try { const response=await fetch(BRIDGE+path,{credentials:'include',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})},signal:controller.signal});const value=await response.json().catch(()=>({}));if(!response.ok)throw new Error(value.error?.message||'本地收件箱连接失败');return value; } catch(error) {if(error.name==='AbortError')throw new Error('本地服务响应超时，请刷新后重试。');throw error;}finally{clearTimeout(timer);}
  }
  async function ensureSession(){await api('/v1/finance/mobile/desktop-session');}
  async function loadInbox(silent=false){
    if(demo){$('#connection-state').textContent='演示模式';render();return;}
    if(loading)return;loading=true;
    try{
      await ensureSession();const result=await api('/v1/finance/mobile/receipts');receipts=result.records||[];connected=true;
      $('#connection-state').textContent='手机收件箱已连接';$('#connection-state').classList.remove('is-fail');
      if(!events){
        clearTimeout(retryTimer);
        events=new EventSource(BRIDGE+'/v1/finance/mobile/events',{withCredentials:true});
        events.addEventListener('inbox',()=>{clearTimeout(reloadTimer);reloadTimer=setTimeout(()=>loadInbox(true),200);});
        events.onerror=()=>{events?.close();events=null;connected=false;$('#connection-state').textContent='手机连接中断 · 正在重连';$('#connection-state').classList.add('is-fail');clearTimeout(retryTimer);retryTimer=setTimeout(()=>loadInbox(true),5000);};
      }
      render();
    }catch(error){connected=false;$('#connection-state').textContent='手机收件箱未连接';$('#connection-state').classList.add('is-fail');render();if(!silent)notify('手机收件箱未连接；仍可手动记账和导入文件。',true);clearTimeout(retryTimer);retryTimer=setTimeout(()=>loadInbox(true),15000);}finally{loading=false;}
  }
  function showPhone() {
    modal('手机录入','手机先提交，电脑确认后才入账。','<div class="phone-panel"><div id="phone-qr" class="phone-art" aria-hidden="true">▯</div><div><h3>给手机一个随手记录的入口。</h3><p>连接同一 Wi-Fi，打开下面的链接。拍照或选图后提交，就会出现在电脑的待确认列表。</p></div></div><div class="invite-field"><input id="mobile-link" readonly aria-label="手机录入链接" placeholder="正在生成手机链接…" value="'+esc(mobileLink)+'"/><button class="button primary" id="copy-link"'+(!mobileLink?' disabled':'')+'>复制链接</button><button class="button" id="new-link">更新链接</button></div><p id="phone-info" class="link-info">这台电脑与收件服务需要保持运行。更新链接会使旧链接失效。</p>');
    $('#copy-link').onclick=async()=>{try{await navigator.clipboard.writeText($('#mobile-link').value);notify('链接已复制，可发给自己的手机。');}catch{$('#mobile-link').select();notify('请复制选中的链接。');}};
    $('#new-link').onclick=generateLink;
    if(!mobileLink)generateLink();else drawQr();
  }
  function drawQr(){
    if(!window.qrcode||!mobileLink||!$('#phone-qr'))return;
    const code=window.qrcode(0,'M');code.addData(mobileLink);code.make();
    const holder=$('#phone-qr');holder.classList.add('has-qr');holder.innerHTML=code.createSvgTag({cellSize:4,margin:16,scalable:true});holder.removeAttribute('aria-hidden');holder.setAttribute('aria-label','手机录入链接二维码');
  }
  async function generateLink(){
    if(demo){$('#mobile-link').value='演示模式：请在真实账本中生成手机链接';$('#phone-info').textContent='此处展示界面；真实手机链接在普通页面生成。';return;}
    const button=$('#new-link');const input=$('#mobile-link');const info=$('#phone-info');const copy=$('#copy-link');button.disabled=true;
    try{
      await ensureSession();const invite=await api('/v1/finance/mobile/invite?version=v2&permanent=1');
      if(!invite.mobileUrl)throw new Error('电脑没有可用的局域网地址，请连接 Wi-Fi 后重试。');
      mobileLink=invite.mobileUrl;sessionStorage.setItem(LINK_KEY,JSON.stringify({url:mobileLink,expiresAt:invite.expiresAt,permanent:invite.permanent===true}));
      input.value=mobileLink;copy.disabled=false;info.textContent='链接已生成。手机与电脑使用同一 Wi-Fi，链接持有人可以向收件箱提交凭证。';if(input.isConnected)drawQr();
    }catch(error){info.textContent=error.message;notify(error.message,true);}finally{if(button.isConnected)button.disabled=false;}
  }
  function showImport(){
    modal('导入账单','在当前电脑读取文件，先预览，再加入待确认。','<div class="upload-zone"><strong>微信 / 支付宝账单文件</strong><p>支持 CSV、TSV。请先从支付应用导出账单；重复记录会自动跳过。</p><input id="bill-file" type="file" accept=".csv,.tsv" hidden/><button class="button primary" id="select-bill">选择账单文件</button></div><p class="subtle-notice">电脑微信登录不会直接同步个人支付账单。账单文件和识别结果都需要你在电脑确认。</p><div id="import-preview" class="import-preview"></div>');
    $('#select-bill').onclick=()=>$('#bill-file').click();
    const previewNode=$('#import-preview');const selectButton=$('#select-bill');
    $('#bill-file').onchange=async event=>{
      const file=event.target.files[0];if(!file)return;
      selectButton.disabled=true;previewNode.textContent='正在读取与去重…';
      try{
        const state=read();
        const result=await window.SimpleLedgerImport.read(file,{...state,transactions:[...state.transactions,...(state.simplePending||[])]});
        if(!previewNode.isConnected)return;
        const count=result.transactions.length;
        $('#import-preview').innerHTML='<strong>'+esc(file.name)+' · '+count+' 笔可导入</strong><p>跳过重复 '+result.duplicateCount+' 笔'+(result.skipped?.length?' · 跳过未生效 '+result.skipped.length+' 笔':'')+' · 无效 '+(result.invalid?.length||0)+' 笔</p>'+(!count?'<p>没有新增记录。你的账本和待确认列表没有变化。</p>':'<div class="preview-list">'+result.transactions.slice(0,30).map(tx=>'<div class="preview-row"><div>'+esc(tx.merchant||'未填写商家')+'<small>'+esc(types[tx.type]||'待分类')+' · '+esc(localInput(tx.occurredAt).replace('T',' '))+'</small></div><span>'+money(tx.amountCents)+'</span></div>').join('')+'</div><p>只加入待确认，核对前不计入统计。</p><button class="button primary" id="commit-import">加入待确认 · '+count+' 笔</button>');
        if(result.invalid?.length){const info=document.createElement('p');info.className='subtle-notice';info.textContent='未导入：'+result.invalid.slice(0,5).map(item=>'第 '+(item.row||item.line||'?')+' 行 '+(item.message||item.reason||'格式无效')).join('；');$('#import-preview').append(info);}
        $('#commit-import')?.addEventListener('click',()=>{
          try{
            const latest=read();const seen=new Set([...latest.transactions,...(latest.simplePending||[])].map(Core.dedupKey));
            const unique=result.transactions.filter(tx=>{const key=Core.dedupKey(tx);if(seen.has(key))return false;seen.add(key);return true;});
            latest.simplePending=[...(latest.simplePending||[]),...unique];save(latest);close();navigate('pending');notify(unique.length+' 笔加入待确认，尚未入账。');
          }catch(error){notify(error.message,true);}
        });
      }catch(error){previewNode.textContent=error.message;if(previewNode.isConnected)notify(error.message,true);}finally{selectButton.disabled=false;}
    };
  }
  function download(name,type,text){
    const url=URL.createObjectURL(new Blob([text],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function exportCsv(){
    const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';const rows=bills(read());
    const text=[['日期','商家','收支类型','金额(元)','支付方式','分类','订单号','备注'],...rows.map(tx=>[localInput(tx.occurredAt).replace('T',' '),tx.merchant,types[tx.type],(tx.amountCents/100).toFixed(2),accounts[tx.account]||tx.account,tx.category,tx.externalOrderId,tx.note])].map(row=>row.map(value=>quote(/^[=+@\-\t\r]/u.test(String(value||''))?"'"+value:value)).join(',')).join('\r\n');
    download('财务账本-'+dateKey(now())+'.csv','text/csv;charset=utf-8','\uFEFF'+text);notify('账本已导出。');
  }
  function backup(){
    const state=read();download('财务账本备份-'+dateKey(now())+'.json','application/json',JSON.stringify({format:'mezip-simple-ledger-v1',exportedAt:now(),ledger:state},null,2));notify('账本与本机待确认数据已备份；凭证图片仍保存在收件服务。');
  }
  function restore(){
    modal('恢复账本备份','合并备份中的记录，不覆盖当前已存在的记录。','<input id="backup-file" type="file" accept=".json" aria-label="选择账本备份"/><p class="subtle-notice">请选择本页“备份全部数据”导出的 JSON。恢复后，手机原图仍需在原电脑的收件服务中查看。</p><div id="restore-preview" class="import-preview"></div>');
    $('#backup-file').onchange=async event=>{
      const restoreNode=$('#restore-preview');
      try{
        const file=event.target.files[0];if(!file)return;if(file.size>20*1024*1024)throw new Error('备份文件超过 20 MB，请选择账本备份。');
        const backup=JSON.parse(await file.text());
        if(!restoreNode.isConnected)return;
        if(backup.format!=='mezip-simple-ledger-v1'||!Array.isArray(backup.ledger?.transactions))throw new Error('这不是本页导出的账本备份。');
        const valid=(tx,allowBlank=false)=>typeof tx.id==='string'&&Number.isSafeInteger(tx.amountCents)&&tx.amountCents>=(allowBlank?0:1)&&!Number.isNaN(new Date(tx.occurredAt).getTime())&&Object.hasOwn(types,tx.type);
        const recovered=backup.ledger.transactions;if(!recovered.every(tx=>valid(tx))||!(backup.ledger.simplePending||[]).every(tx=>valid(tx,true)))throw new Error('备份包含无效金额、时间或类型，已停止恢复。');
        $('#restore-preview').innerHTML='<strong>备份包含 '+recovered.length+' 笔账本记录，'+(backup.ledger.simplePending||[]).length+' 笔待确认。</strong><p>相同编号的记录会保留当前版本。</p><button class="button primary" id="confirm-restore">合并恢复</button>';
        $('#confirm-restore').onclick=()=>{
          try{
            const state=read();const seen=new Set([...state.transactions,...(state.simplePending||[])].map(tx=>tx.id));
            for(const tx of recovered){if(!seen.has(tx.id)){state.transactions.push({...tx,ownerId:state.ownerId});seen.add(tx.id);}}
            state.simplePending=state.simplePending||[];
            for(const tx of backup.ledger.simplePending||[]){if(!seen.has(tx.id)){state.simplePending.push({...tx,ownerId:state.ownerId});seen.add(tx.id);}}
            state.simpleReceiptDrafts={...(backup.ledger.simpleReceiptDrafts||{}),...(state.simpleReceiptDrafts||{})};
            state.simpleHiddenReceipts=[...new Set([...(state.simpleHiddenReceipts||[]),...(backup.ledger.simpleHiddenReceipts||[])])];
            save(state);close();render();notify('备份已合并恢复。');
          }catch(error){notify(error.message,true);}
        };
      }catch(error){restoreNode.textContent=error.message;if(restoreNode.isConnected)notify(error.message,true);}
    };
  }
  function trash(){
    const state=read();const entries=[...state.transactions.map(tx=>({tx,pending:false})),...(state.simplePending||[]).map(tx=>({tx,pending:true}))].filter(item=>item.tx.simpleArchivedAt);
    const hidden=receipts.filter(record=>(state.simpleHiddenReceipts||[]).includes(record.id));
    modal('回收站','移走的记录不计入收支，可随时恢复。',(!entries.length&&!hidden.length?empty('回收站是空的','记录移到这里后，可以恢复。'):'')+entries.map(item=>'<div class="trash-row"><span>'+esc(item.tx.merchant||'账单')+' · '+money(item.tx.amountCents)+'</span><button class="button" data-restore="'+esc(item.tx.id)+'" data-pending="'+item.pending+'">恢复</button></div>').join('')+hidden.map(record=>'<div class="trash-row"><span>'+esc(record.merchant||record.fileName||'手机凭证')+'</span><button class="button" data-restore-receipt="'+esc(record.id)+'">恢复</button></div>').join(''));
    dc.querySelectorAll('[data-restore]').forEach(button=>button.onclick=()=>{try{const state=read();const tx=(button.dataset.pending==='true'?state.simplePending:state.transactions).find(tx=>tx.id===button.dataset.restore);delete tx.simpleArchivedAt;save(state);render();trash();notify('已恢复记录。');}catch(error){notify(error.message,true);}});
    dc.querySelectorAll('[data-restore-receipt]').forEach(button=>button.onclick=()=>{try{const state=read();state.simpleHiddenReceipts=state.simpleHiddenReceipts.filter(value=>value!==button.dataset.restoreReceipt);save(state);render();trash();notify('凭证已恢复到待确认。');}catch(error){notify(error.message,true);}});
  }
  document.querySelectorAll('[data-route]').forEach(button=>button.onclick=()=>navigate(button.dataset.route));
  $('#add').onclick=()=>edit();$('#import').onclick=showImport;$('#make-link').onclick=showPhone;$('#refresh').onclick=()=>loadInbox();
  $('#month').value=period;$('#month').onchange=event=>{period=event.target.value;render();};
  $('#all-period').onclick=()=>{period=period?'':monthKey(now());render();};
  $('#export-csv').onclick=exportCsv;$('#backup').onclick=backup;$('#restore').onclick=restore;$('#trash').onclick=trash;
  document.querySelectorAll('.data-menu button').forEach(button=>button.addEventListener('click',()=>$('.data-menu').open=false));
  dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
  window.addEventListener('hashchange',()=>{route=['pending','inbox'].includes(location.hash.slice(1))?'pending':'ledger';render();});
  window.addEventListener('storage',event=>{if(event.key===KEY)render();});
  if(demo)$('#demo-banner').hidden=false;
  render();loadInbox(true);
})();
