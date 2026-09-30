(() => {
  const root = document.querySelector('#app');
  if (!root) return;

  const configurationFailure = (message) =>
    /GITHUB_CALLBACK_REQUIRES_CONFIGURATION|not configured|尚未配置/iu.test(
      message || '',
    );

  const addRetry = () => {
    const actions = root.querySelector('.landing-actions');
    if (!actions || actions.querySelector('[data-v3-retry]')) return;

    const retry = document.createElement('button');
    retry.className = 'quiet';
    retry.type = 'button';
    retry.dataset.v3Retry = 'true';
    retry.textContent = '重试';
    retry.addEventListener('click', () => location.reload());
    actions.append(retry);
  };

  const applyGuard = () => {
    const heading = [...root.querySelectorAll('h2')].find(
      (item) => item.textContent?.trim() === 'GitHub 连接尚未配置',
    );
    if (!heading) return;

    const alert = root.querySelector('[role="alert"]');
    const message = alert?.textContent?.trim() || '';
    if (configurationFailure(message)) {
      if (alert) {
        alert.textContent =
          '本地授权服务尚未完成配置；当前没有读取任何 GitHub 账号数据。';
      }

      const connectLink = root.querySelector(
        'a[href="/api/integrations/github/connect"]',
      );
      if (!connectLink || connectLink.dataset.connectionGuard === 'true') return;

      const disabled = document.createElement('button');
      disabled.className = connectLink.className;
      disabled.type = 'button';
      disabled.disabled = true;
      disabled.dataset.connectionGuard = 'true';
      disabled.textContent = '等待 GitHub App 配置';
      disabled.setAttribute(
        'aria-label',
        'GitHub App 尚未配置，暂时不能开始官方授权。',
      );
      connectLink.replaceWith(disabled);
      return;
    }

    heading.textContent = 'GitHub 数据暂时不可用';
    if (alert && message.length === 0) {
      alert.textContent =
        '暂时无法读取 GitHub 数据。请检查网络或 GitHub 服务状态后重试。';
    }
    addRetry();
  };

  applyGuard();
  new MutationObserver(applyGuard).observe(root, {
    childList: true,
    subtree: true,
  });
})();
