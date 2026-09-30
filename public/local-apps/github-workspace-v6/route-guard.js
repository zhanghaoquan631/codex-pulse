(() => {
  const names = {
    repositories: '仓库',
    snippets: '代码片段',
    issues: '问题与需求',
    tasks: '任务中心',
    activity: '活动',
  };
  let lastKey = '';
  let fallbackShown = false;
  const route = () => location.hash.replace(/^#\/?/u, '').split('/')[0] || 'overview';
  const localPreview = () =>
    location.hostname === '127.0.0.1' || location.hostname === 'localhost'
      ? '<a class="quiet" href="?preview=1#overview">预览界面</a>'
      : '';

  const renderGuard = () => {
    const view = document.querySelector('#workspace-view');
    if (!view || typeof state === 'undefined') return;
    const current = route();
    if (
      state.mode === 'connected' ||
      state.mode === 'loading' ||
      current === 'overview'
    ) {
      lastKey = '';
      return;
    }
    const key = `${state.mode}:${current}`;
    if (key === lastKey && view.dataset.v6RouteGuard === 'true') return;
    lastKey = key;
    view.dataset.v6RouteGuard = 'true';
    const title = names[current] || '这个功能';
    const message =
      state.mode === 'unavailable'
        ? '工作台服务暂时无法连接。请检查本地服务后重试；页面不会用演示数据冒充真实 GitHub。'
        : `进入${title}前，需要先完成 GitHub 官方授权。授权后返回这里即可读取当前账号有权限的数据。`;
    view.innerHTML = `<section class="surface connection-landing v6-connection-note"><div class="connection-card"><div class="github-orbit">GH</div><h2>${title}暂时未连接</h2><p>${message}</p><div class="landing-actions"><a class="primary" href="/api/integrations/github/connect">连接 GitHub</a><a class="quiet" href="https://github.com/" target="_blank" rel="noreferrer noopener">打开 GitHub 官网</a>${localPreview()}</div></div></section>`;
  };

  const runtimeFallback = () => {
    const app = document.querySelector('#app');
    if (!app || app.children.length || fallbackShown) return;
    fallbackShown = true;
    app.innerHTML =
      '<section class="surface connection-landing v6-runtime-error"><div class="connection-card"><h2>工作台暂时没有载入</h2><p>页面脚本没有完成启动。请重新加载；原有网站和 GitHub 数据不会被修改。</p><div class="landing-actions"><button class="primary" type="button" data-v6-reload>重新加载</button><a class="quiet" href="https://github.com/" target="_blank" rel="noreferrer noopener">打开 GitHub 官网</a></div></div></section>';
    app
      .querySelector('[data-v6-reload]')
      ?.addEventListener('click', () => location.reload());
  };

  const observe = () => {
    renderGuard();
    if (!document.querySelector('#app')?.children.length)
      setTimeout(runtimeFallback, 1800);
  };
  new MutationObserver(observe).observe(document.body, {
    childList: true,
    subtree: true,
  });
  window.addEventListener('hashchange', () => {
    lastKey = '';
    setTimeout(observe, 0);
  });
  document.addEventListener(
    'click',
    (event) => {
      const anchor =
        event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      if (
        /^#(repositories|snippets|issues|tasks|activity)(?:\/|$)/u.test(href) &&
        location.hash !== href
      ) {
        event.preventDefault();
        location.hash = href.slice(1);
      }
    },
    true,
  );
  observe();
})();
