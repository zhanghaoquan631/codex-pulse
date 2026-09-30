(()=>{
  const presets={
    presenter:{name:'人物全屏',summary:'1920 × 1080 · 人物铺满横屏，适合口播、聊天。',file:'LinganLive-01-Presenter.zip'},
    'screen-inset':{name:'屏幕 + 人物小窗',summary:'1920 × 1080 · 电脑画面铺满，人物小窗在左下角，适合文档与视频讲解。',file:'LinganLive-02-Screen-Inset.zip'},
    portrait:{name:'上屏幕 + 下人物',summary:'1080 × 1920 · 电脑画面在上方，人物在下方，顶部留黑。',file:'LinganLive-03-Portrait.zip'}
  };
  const buttons=[...document.querySelectorAll('[data-live-scene]')];
  function select(id){
    const preset=presets[id];if(!preset)return;
    for(const button of buttons){const chosen=button.dataset.liveScene===id;button.classList.toggle('is-selected',chosen);button.setAttribute('aria-pressed',String(chosen));}
    document.getElementById('liveSceneName').textContent=preset.name;
    document.getElementById('liveSceneSummary').textContent=preset.summary;
    const link=document.getElementById('liveSceneDownload');link.href='/live-scenes/'+id+'.zip';link.download=preset.file;
    try{localStorage.setItem('lingan-live-scene',id);}catch{}
    window.dispatchEvent(new CustomEvent('lingan-live-scene',{detail:id}));
  }
  for(const button of buttons)button.addEventListener('click',()=>{select(button.dataset.liveScene);if(window.LinganRecorder)window.LinganRecorder.start(button.dataset.liveScene);else document.getElementById('liveRecordStatus').textContent='录制功能正在准备，请稍后再点。';});
  let initial='portrait';try{const saved=localStorage.getItem('lingan-live-scene');if(presets[saved])initial=saved;}catch{}
  select(initial);
  window.LinganLiveScenes={select,layouts:presets};
})();
