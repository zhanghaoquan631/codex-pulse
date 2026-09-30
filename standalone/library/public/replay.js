(()=>{
  const button=document.getElementById('copyReplayLink'),input=document.getElementById('replayLink'),status=document.getElementById('linkStatus');
  if(button)button.addEventListener('click',async()=>{
    const link=location.origin+location.pathname;
    try{await navigator.clipboard.writeText(link);status.textContent='回放链接已复制，可发送到你的手机或电脑。';}
    catch{input.hidden=false;input.value=link;input.focus();input.select();status.textContent='请长按或复制下面的回放链接。';}
  });
  document.querySelector('video')?.addEventListener('error',()=>{document.getElementById('playbackStatus').textContent='暂时无法播放，请刷新页面重试，或下载回放观看。';});
})();
