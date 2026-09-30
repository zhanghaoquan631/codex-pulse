(() => {
  'use strict';
  const $=id=>document.getElementById(id),fixed=location.pathname==='/mobile'||location.pathname==='/mobile/',token=fixed?'':new URLSearchParams(location.hash.slice(1)).get('token')||'',key=fixed?'lingan-phone-draft:mobile:v1':'lingan-phone-draft:'+token.slice(0,20),api=fixed?'/api/mobile/drop/':'/api/drop/';
  const ids=['link','title','caption','body'];let coverUrl='',objectURL='',generation=0,busy=0,active=false,automatic={},submissionId=crypto.randomUUID();
  const values=()=>Object.fromEntries(ids.map(id=>[id,$(id).value]));
  function message(text){$('feedback').textContent=text;}
  function saveDraft(){try{localStorage.setItem(key,JSON.stringify({...values(),coverUrl,automatic,submissionId}));$('draftStatus').textContent='草稿已保留在这台手机上';}catch{$('draftStatus').textContent='手机储存空间不足，请先复制文字保留';}}
  function setBusy(delta){busy+=delta;$('save').disabled=!active||busy>0;$('preview').disabled=!active||busy>0;document.querySelectorAll('input[type=file]').forEach(x=>x.disabled=!active||busy>0);}
  function requireLogin(){active=false;setBusy(0);saveDraft();$('captureLogin').hidden=false;$('connection').textContent='登录状态已到期，请重新登录；固定地址仍然有效，草稿已保留。';}
  async function request(path,options={}){const headers=new Headers(options.headers);if(!fixed)headers.set('x-lingan-capture-token',token);const response=await fetch(api+path,{...options,headers,credentials:'same-origin'});if(!response.ok){let result;try{result=await response.json();}catch{}if(response.status===401){if(fixed)requireLogin();else{active=false;setBusy(0);$('connection').textContent=result?.message||'入口已到期，请重新扫码';}}if(result?.code==='submission_changed')submissionId=crypto.randomUUID();throw Error(result?.message||(response.status===401&&fixed?'请重新登录，固定地址仍然有效；草稿已保留。':'网络暂不可用，请重试；草稿仍然保留'));}return response;}
  function json(path,data){return request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}).then(r=>r.json());}
  async function showCover(url){
    const wanted=url;coverUrl=url;saveDraft();if(objectURL){URL.revokeObjectURL(objectURL);objectURL='';}$('coverBox').hidden=true;
    if(!/^\/api\/files\/[a-f0-9]{32}$/.test(url))return;
    const response=await request('files/'+url.split('/').pop()),blob=await response.blob();if(coverUrl!==wanted)return;
    objectURL=URL.createObjectURL(blob);$('cover').src=objectURL;$('coverBox').hidden=false;
  }
  function extractURL(){const text=$('link').value.trim(),match=text.match(/https?:\/\/[^\s<>]+/);if(!match)return text;return match[0].replace(/[，。；、！）)]+$/,'');}
  ids.forEach(id=>$(id).addEventListener('input',()=>{if(id==='link'){generation++;for(const name of ['title','caption'])if($(name).value===automatic[name])$(name).value='';automatic={};coverUrl='';$('coverBox').hidden=true;}saveDraft();}));
  document.querySelector('.phone-tabs a.active').addEventListener('click',event=>{event.preventDefault();$('capture-form').scrollIntoView({behavior:'smooth'});});
  $('preview').addEventListener('click',async()=>{
    const url=extractURL();if(!/^https?:\/\//.test(url)){message('请先粘贴一条完整链接');return;}
    const sequence=++generation,before=values(),oldCover=coverUrl;setBusy(1);message('正在获取封面和原始文案，请稍候…');
    try{const result=await json('preview',{url});if(sequence!==generation)return;
      for(const [id,value] of Object.entries({title:result.title,caption:result.description})){if(value&&($(id).value===before[id])&&(!before[id]||before[id]===automatic[id])){$(id).value=value;automatic[id]=value;}}
      $('link').value=result.url||url;if(coverUrl===oldCover&&!oldCover&&result.coverUrl)await showCover(result.coverUrl);
      message(result.captionWarning||result.coverWarning||(result.previewStatus==='ready'?'封面与文案已取得，可以保存。':'暂未取得完整预览，可以补充文字或图片后保存。'));saveDraft();
    }catch(error){message(error.message);}finally{setBusy(-1);}
  });
  async function upload(event){const file=event.target.files?.[0];if(!file)return;setBusy(1);message('正在上传图片…');const sequence=++generation;
    try{if(file.size>12*1024*1024)throw Error('图片请控制在 12 MB 以内');const result=await (await request('files',{method:'POST',body:file})).json();if(sequence!==generation)return;await showCover(result.url);message('图片已上传，填写笔记后保存。');}catch(error){message(error.message);}finally{event.target.value='';setBusy(-1);}}
  $('camera').addEventListener('change',upload);$('photo').addEventListener('change',upload);
  $('removeCover').addEventListener('click',()=>{generation++;showCover('').catch(error=>message(error.message));});
  $('capture-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!active)return;const before=values(),image=coverUrl,submitId=submissionId;setBusy(1);message('正在保存…');
    try{await json('submit',{submissionId:submitId,url:extractURL(),title:before.title,caption:before.caption,body:before.body,coverUrl:image});
      submissionId=crypto.randomUUID();if(JSON.stringify(values())===JSON.stringify(before)&&coverUrl===image){ids.forEach(id=>$(id).value='');coverUrl='';automatic={};$('coverBox').hidden=true;try{localStorage.removeItem(key);}catch{}$('draftStatus').textContent='本条已保存，可以继续记录下一条';}else saveDraft();
      message(fixed?'已保存到灵感库。同一账号登录的手机和电脑可查看；顶部可进入内容库和周刊。':'已保存到灵感库。电脑联网运行后自动同步；顶部可查看内容库和周刊。');
    }catch(error){message(error.message);saveDraft();}finally{setBusy(-1);}
  });
  try{const draft=JSON.parse(localStorage.getItem(key)||'null');if(draft){ids.forEach(id=>$(id).value=typeof draft[id]==='string'?draft[id]:'');automatic=draft.automatic||{};submissionId=draft.submissionId||submissionId;coverUrl=draft.coverUrl||'';}}catch{}
  if(fixed){$('captureLead').textContent='粘贴分享链接，或拍照、写几句话。用同一个 wozhe0196 账号登录，保存的资料和周刊可在手机与电脑查看。';$('fixedEntryNote').hidden=false;$('captureLogin').href='/signin-with-chatgpt?return_to=%2Fmobile';}
  setBusy(0);
  request('status').then(r=>r.json()).then(async status=>{active=status.active!==false;setBusy(0);$('captureLogin').hidden=true;$('connection').textContent=fixed?'已连接 · 固定手机入口长期有效':'已连接 · 上传入口有效至 '+new Date(status.expiresAt).toLocaleDateString('zh-CN');if(coverUrl)try{await showCover(coverUrl);}catch(error){message(error.message);}}).catch(error=>{if(!fixed||$('captureLogin').hidden)$('connection').textContent=error.message;});
})();
