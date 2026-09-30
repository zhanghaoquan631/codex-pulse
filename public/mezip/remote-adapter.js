// Authenticated, outbound-only bridge. No local address needs to be configured.
(() => {
  const nativeFetch = window.fetch.bind(window);
  let loaded = false, wasOnline = false, blocked = true, checking = false;
  const banner = document.createElement('div');
  banner.className = 'mezip-remote-status'; banner.setAttribute('role', 'status');
  Object.assign(banner.style, {position:'fixed',inset:'0',zIndex:'99999',background:'#111510f5',color:'#edf1e3',display:'grid',placeContent:'center',padding:'32px',font:'15px/1.8 system-ui',textAlign:'center'});
  document.body.append(banner);
  function show(message) {blocked=true;banner.textContent=message;banner.style.display='grid';}
  function hide() {blocked=false;banner.style.display='none';}
  show('正在自动连接这台电脑上的 ME.zip…');
  const storageGet=Storage.prototype.getItem, storageSet=Storage.prototype.setItem, storageRemove=Storage.prototype.removeItem;
  const ownKey=key=>typeof key==='string'&&key.startsWith('mezip.');
  Storage.prototype.getItem=function(key){if(this===localStorage&&key==='mezip.x.local.capture.api')return 'http://127.0.0.1:4319';return storageGet.call(this,ownKey(key)?'pulse.owner.'+key:key);};
  Storage.prototype.setItem=function(key,value){if(ownKey(key)&&blocked)throw new Error('连接尚未确认，未写入本机');return storageSet.call(this,ownKey(key)?'pulse.owner.'+key:key,value);};
  Storage.prototype.removeItem=function(key){return storageRemove.call(this,ownKey(key)?'pulse.owner.'+key:key);};
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  let activeRequests=0;const waiting=[];
  async function acquire(){if(activeRequests<6){activeRequests++;return;}await new Promise(resolve=>waiting.push(resolve));}
  function release(){const next=waiting.shift();if(next)next();else activeRequests--;}
  async function requestJson(url,options={}) {
    const response=await nativeFetch(url,{credentials:'same-origin',cache:'no-store',...options,signal:AbortSignal.timeout(15000)});
    const body=await response.json();
    if(!response.ok){const error=new Error(body.error||'连接暂时不可用');error.status=response.status;throw error;}
    return body;
  }
  window.fetch=async (input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    if(!(['127.0.0.1','localhost'].includes(url.hostname)&&url.port==='4319'))return nativeFetch(input,options);
    await acquire();
    try{return await bridgeFetch(url,options);}finally{release();}
  };
  async function bridgeFetch(url,options){
    if(blocked)throw new Error('等待电脑连接');
    const method=(options.method||'GET').toUpperCase(), id=crypto.randomUUID();
    const command={id,method,path:url.pathname+url.search,body:options.body?JSON.parse(options.body):null};
    try {
      // The same ID is retained if the first network response is lost.
      let submitted=false;
      for(let attempt=0;attempt<3&&!submitted;attempt++){
        try{await requestJson('/api/mezip/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)});submitted=true;}
        catch(error){if(error.status&&error.status<500)throw error;if(attempt===2)throw error;await delay(1000);}
      }
      const deadline=Date.now()+65000;
      while(Date.now()<deadline){
        if(options.signal?.aborted)throw new DOMException('Aborted','AbortError');
        const result=await requestJson('/api/mezip/requests?id='+id);
        if(result.state==='done'){
          if(result.status<200||result.status>=300){wasOnline=false;show('本机未确认此次操作成功。正在重新读取记录，请勿重复提交。');}
          return new Response(JSON.stringify(result.body),{status:result.status,headers:{'Content-Type':'application/json'}});
        }
        await delay(600);
      }
      throw new Error('操作等待超时');
    }catch(error){show('与电脑的连接暂时中断，正在自动重连。未确认的操作请勿重复提交，恢复后会重新读取本机记录。');wasOnline=false;throw error;}
  }
  async function startScripts() {
    for(const original of document.querySelectorAll('script[type="text/mezip-deferred"]')){
      const script=document.createElement('script');
      if(original.dataset.src){script.src=original.dataset.src;await new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=reject;document.body.append(script);});}
      else{script.textContent=original.textContent;document.body.append(script);}
    }
  }
  async function check() {
    if(checking)return;checking=true;
    try {
      const status=await requestJson('/api/mezip/status');
      if(!status.canManage){show('请使用网站所属账号登录后访问 ME.zip。');return;}
      if(!status.connected){show('这台电脑上的 ME.zip 暂时离线。电脑开机并联网后会自动恢复连接。');wasOnline=false;return;}
      if(loaded&&!wasOnline){location.reload();return;}
      hide();wasOnline=true;
      if(!loaded){loaded=true;await startScripts();}
    }catch(error){show(error.status===403?'请使用网站所属账号登录后访问 ME.zip。':'连接暂时不可用，正在自动重试…');wasOnline=false;}
    finally{checking=false;}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',check,{once:true});else check();
  setInterval(check,10000);
})();
