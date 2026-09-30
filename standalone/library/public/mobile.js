let mobileAccess={enabled:true,cloud:true,urls:[location.origin]};
const mobilePanel=document.createElement('section');mobilePanel.className='panel mobile-access-panel';
mobilePanel.innerHTML='<h2>手机与电脑</h2><p>手机可以收集新内容，也可以查看、编辑之前的资料和阅读周刊。</p><button class="primary-button" data-action="mobile-link">查看固定手机入口与二维码</button><p>手机登录同一个 wozhe0196 账号，即可上传、查看内容库和我的周刊。可将固定入口收藏或添加到手机主屏幕。</p><a class="quiet-button" target="_top" href="/signout-with-chatgpt?return_to=%2F">退出登录</a>';
document.getElementById('view-settings').append(mobilePanel);
const mobileDialog=document.createElement('dialog');mobileDialog.className='mobile-link-dialog';
mobileDialog.innerHTML='<div class="dialog-title"><h2>固定手机入口</h2><button data-mobile-close aria-label="关闭">×</button></div><p>用手机相机扫描二维码，登录同一个 wozhe0196 账号，就能粘贴链接、拍照、记录文字，并查看旧资料和周刊。</p><div class="mobile-link-qr" id="mobileLinkQR"></div><p class="mobile-link-expiry" id="mobileLinkStatus" role="status"></p><input class="mobile-link-address" id="mobileLinkAddress" readonly aria-label="固定手机入口地址"><div class="mobile-link-actions"><button class="primary-button" id="mobileLinkCopy" disabled>复制固定链接</button><a class="quiet-button" id="mobileLinkOpen" target="_blank" rel="noopener" hidden>打开手机入口</a></div><p>这个地址固定不变，不会自动到期。可收藏或添加到手机主屏幕。登录状态到期后重新登录，仍然使用这个地址。</p>';
document.body.append(mobileDialog);let mobileLinkBusy=false;
function showMobileLinkResult(data){
  const address=document.getElementById('mobileLinkAddress'),box=document.getElementById('mobileLinkQR'),status=document.getElementById('mobileLinkStatus'),open=document.getElementById('mobileLinkOpen');
  box.replaceChildren();address.value='';open.hidden=true;open.removeAttribute('href');document.getElementById('mobileLinkCopy').disabled=true;
  if(!data)return;
  const parsed=new URL(data.url);
  if(parsed.href!==location.origin+'/mobile'||data.permanent!==true||data.requiresLogin!==true||typeof data.qr!=='string'||!data.qr.trim())throw Error('手机入口暂不可用，请稍后重试');
  address.value=parsed.href;open.href=parsed.href;open.hidden=false;
  const image=document.createElement('img');image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(data.qr);image.alt='用手机扫描，打开固定手机入口';image.style.width='100%';box.append(image);
  status.textContent='固定地址 · 长期有效 · 手机需登录同一账号';document.getElementById('mobileLinkCopy').disabled=false;
}
async function openMobileLink(){
  if(!mobileDialog.open)mobileDialog.showModal();if(mobileLinkBusy)return;
  mobileLinkBusy=true;showMobileLinkResult(null);document.getElementById('mobileLinkStatus').textContent='正在读取固定手机入口…';
  try{const response=await fetch('/api/mobile-entry',{method:'GET',credentials:'same-origin',cache:'no-store'}),data=await response.json();if(!response.ok)throw Error(data.message||'暂时无法读取手机入口');showMobileLinkResult(data);}
  catch(error){document.getElementById('mobileLinkStatus').textContent=error.message;}
  finally{mobileLinkBusy=false;}
}
document.addEventListener('click',event=>{if(event.target.closest('[data-action="mobile-link"]'))openMobileLink();});
mobileDialog.querySelector('[data-mobile-close]').onclick=()=>mobileDialog.close();
document.getElementById('mobileLinkCopy').onclick=async()=>{const input=document.getElementById('mobileLinkAddress');if(!input.value)return;try{await navigator.clipboard.writeText(input.value);showToast('固定手机入口已复制');}catch{input.select();showToast('请复制已选中的链接');}};
const startParams=new URLSearchParams(location.search),allowedViews=['dashboard','library','inbox','tags','materials','jianying','live','newsletters','backups','settings','help'];
let startView=startParams.get('view');if(!allowedViews.includes(startView)){try{startView=localStorage.getItem('lingan-last-view');}catch{}}
showView(allowedViews.includes(startView)?startView:'library');
if(startParams.get('capture')==='1'){showView('library');openComposer();history.replaceState(null,'',location.pathname);}

if(startParams.get('mobile')==='1')openMobileLink();
