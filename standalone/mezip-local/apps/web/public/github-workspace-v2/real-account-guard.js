(() => {
  const root = document.querySelector('#app');
  if (!root) return;

  const applyGuard = () => {
    const heading = [...root.querySelectorAll('h2')].find(
      (item) => item.textContent?.trim() === 'GitHub 连接尚未配置',
    );
    if (!heading) return;

    const alert = root.querySelector('[role="alert"]');
    if (alert)
      alert.textContent = '连接服务尚未启用；当前没有读取任何 GitHub 账号数据。';

    const connectLink = root.querySelector(
      'a[href="/api/integrations/github/connect"]',
    );
    if (!connectLink || connectLink.dataset.realAccountGuard === 'true') return;

    const disabled = document.createElement('button');
    disabled.className = connectLink.className;
    disabled.type = 'button';
    disabled.disabled = true;
    disabled.dataset.realAccountGuard = 'true';
    disabled.textContent = '等待 GitHub App 配置';
    connectLink.replaceWith(disabled);
  };

  applyGuard();
  new MutationObserver(applyGuard).observe(root, { childList: true, subtree: true });
})();
