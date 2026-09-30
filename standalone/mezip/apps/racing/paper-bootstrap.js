(() => {
  const q = new URLSearchParams(location.search);
  if (q.get('mode') === 'competition' || q.has('room')) document.documentElement.dataset.raceRoom = 'true';
  const tracks = { lagunaSeca: 'Laguna Seca', apexCircuit: 'APEX Circuit' };
  const requestedTrack = q.get('track');
  const readStorage = key => {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); }
    catch { return null; }
  };
  const settings = readStorage('mezip:racing:web:v1:apex-settings-storage');
  const selectedTrack = Object.hasOwn(tracks, requestedTrack) ? requestedTrack
    : Object.hasOwn(tracks, settings?.state?.selectedTrackId) ? settings.state.selectedTrackId : 'lagunaSeca';
  window.apexPaperMode = q.get('style') !== 'original';
  document.documentElement.dataset.paper = window.apexPaperMode ? 'on' : 'off';
  // Run before the application module hydrates its persisted settings.
  try {
    if (Object.hasOwn(tracks, requestedTrack)) {
      localStorage.setItem('mezip:racing:web:v1:apex-settings-storage', JSON.stringify({
        ...settings, state: { ...settings?.state, selectedTrackId: requestedTrack }, version: 17,
      }));
    }
    if (!localStorage.getItem('mezip:racing:web:v1:racing-leaderboard-storage')) {
      localStorage.setItem('mezip:racing:web:v1:racing-leaderboard-storage', JSON.stringify({ state: { playerName: 'PaperDriver', playerId: '', carColor: '#f5f7fa' }, version: 0 }));
    }
  } catch (error) {
    console.warn('Paper racing preferences could not be saved.', error);
  }
  const linkFor = (key, value) => {
    const url = new URL(location.href);
    url.searchParams.set(key, value);
    if (!url.searchParams.has('track')) url.searchParams.set('track', selectedTrack);
    return url.pathname + url.search + url.hash;
  };
  addEventListener('DOMContentLoaded', () => {
    const control = document.createElement('aside');
    control.id = 'paper-tools';
    control.setAttribute('aria-label', '简笔画操作与画风');
    control.innerHTML = `
      <details class="paper-tools__details">
        <summary><span class="paper-tools__brand">简笔画</span><span class="paper-tools__local">好友 / AI 竞速</span><span class="paper-tools__more">操作 / 赛道</span></summary>
        <div class="paper-tools__panel">
          <div class="paper-tools__heading"><span>选一张赛道</span><a class="paper-tools__style"></a></div>
          <nav class="paper-tools__tracks" aria-label="切换赛道"></nav>
          <p><a href="/racing/competition/" class="paper-tools__competition">极限竞技 · 邀请好友争前三 →</a></p>
          <p class="paper-tools__reload">切换赛道或画风会重新载入。</p>
          <dl class="paper-tools__keys">
            <div><dt><kbd>W / ↑</kbd></dt><dd>加速</dd></div>
            <div><dt><kbd>S / ↓</kbd></dt><dd>刹车 / 倒车</dd></div>
            <div><dt><kbd>A D / ← →</kbd></dt><dd>转向</dd></div>
            <div><dt><kbd>Space</kbd></dt><dd>手刹</dd></div>
            <div><dt><kbd>R</kbd></dt><dd>回到起点</dd></div>
            <div><dt><kbd>C</kbd></dt><dd>切换视角</dd></div>
            <div><dt><kbd>Esc</kbd></dt><dd>设置 / 返回</dd></div>
            <div><dt><kbd>Q / E</kbd></dt><dd>手动降 / 升挡</dd></div>
          </dl>
          <p class="paper-tools__note">选择 Hot Laps 计时，或 Sandbox 自由驾驶。成绩与幽灵回放仅保存在此浏览器；清除站点数据会删除记录。</p>
        </div>
      </details>`;
    const details = control.querySelector('details');
    const toggle = control.querySelector('.paper-tools__style');
    toggle.textContent = window.apexPaperMode ? '对照原画面 ↗' : '返回简笔画 ↗';
    toggle.href = linkFor('style', window.apexPaperMode ? 'original' : 'paper');
    toggle.title = '切换画风会重新载入游戏';
    const nav = control.querySelector('.paper-tools__tracks');
    for (const [id, name] of Object.entries(tracks)) {
      const link = document.createElement('a');
      link.textContent = name;
      link.href = linkFor('track', id);
      if (id === selectedTrack) link.setAttribute('aria-current', 'true');
      nav.append(link);
    }
    // Do not trigger driving/menu shortcuts while using this card.
    control.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        details.open = false;
        control.querySelector('summary').focus();
      }
    });
    document.body.append(control);
    let lastScene;
    const syncHome = () => {
      const home = document.querySelector('.home-screen');
      const scene = home ? 'home' : 'drive';
      if (scene !== lastScene) {
        control.dataset.scene = scene;
        details.open = false;
        lastScene = scene;
      }
      for (const phone of document.querySelectorAll('.settings-panel__section--phone')) {
        phone.dataset.paperUnavailable = 'true';
        for (const button of phone.querySelectorAll('button')) {
          button.disabled = true;
          button.setAttribute('aria-disabled', 'true');
          button.title = '手机控制器在网页版单人暂不可用';
        }
        if (!phone.querySelector('.paper-local-service-note')) {
          const note = document.createElement('p');
          note.className = 'settings-panel__copy paper-local-service-note';
          note.textContent = '网页版单人暂不可用。请使用键盘或已连接的游戏手柄驾驶。';
          phone.append(note);
        }
      }
    };
    syncHome();
    const root = document.getElementById('root');
    if (root) new MutationObserver(records => {
      if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1))) syncHome();
    }).observe(root, { childList: true, subtree: true });
  });
})();
