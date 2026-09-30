(() => {
  const API_ROOT = '/v1/github-workspace';
  let overlay;

  const createOverlay = (title, message, retry) => {
    overlay?.remove();
    overlay = document.createElement('aside');
    overlay.className = 'v4-sync-overlay';
    overlay.setAttribute('role', 'status');
    overlay.innerHTML = `<strong>${title}</strong><span>${message}</span>`;
    if (retry) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '重新同步';
      button.addEventListener('click', () => void runSync());
      overlay.append(button);
    }
    document.body.append(overlay);
  };

  const readJson = async (path, options = {}) => {
    const response = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(body?.error?.message || `同步请求失败（${response.status}）`);
      error.code = body?.error?.code || `HTTP_${response.status}`;
      throw error;
    }
    return body;
  };

  const runSync = async () => {
    createOverlay('正在同步 GitHub 数据', '首次授权后需要先建立本地快照，完成后会自动刷新工作台。');
    try {
      await readJson(`${API_ROOT}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `workspace-v4-initial-${Date.now()}`,
        },
        body: '{}',
      });
      const url = new URL(location.href);
      url.searchParams.delete('connection');
      history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      location.reload();
    } catch (error) {
      createOverlay('GitHub 数据同步失败', error.message || '请检查授权状态或网络后重试。', true);
    }
  };

  const boot = async () => {
    try {
      const connection = await readJson(`${API_ROOT}/connection`);
      if (connection?.status !== 'CONNECTED') return;
      const justConnected = new URLSearchParams(location.search).get('connection') === 'complete';
      if (justConnected || !connection.lastSyncedAt) await runSync();
    } catch (error) {
      if (error.code !== 'UNAUTHORIZED' && error.code !== 'AUTH_REQUIRED') {
        createOverlay('GitHub 数据暂时不可用', error.message || '请稍后重试。', true);
      }
    }
  };

  void boot();
})();
