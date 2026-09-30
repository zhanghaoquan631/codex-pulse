(() => {
  const nativeFetch = window.fetch.bind(window);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const gate = document.createElement('div');
  gate.className = 'pulse-github-gate'; gate.setAttribute('role', 'status');
  gate.textContent = '正在连接这台电脑的 GitHub 工作台…'; document.body.append(gate);
  let loaded = false, pending = false, permitted = false, failedLoad = false, needsRefresh = false, activeWrites = 0;
  const reconstructed = result => new Response([204, 205, 304].includes(result.status) ? null : JSON.stringify(result.body ?? null), { status: result.status || 503, headers: { 'Content-Type': 'application/json' } });
  async function operation(id) {
    const deadline = Date.now() + 600000;
    while (Date.now() < deadline) {
      let response;
      try { response = await nativeFetch('/api/local-apps/operations/' + id, { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(15000) }); }
      catch { await wait(1200); continue; }
      if ([401, 403].includes(response.status)) return response;
      if (!response.ok) { await wait(1200); continue; }
      const value = await response.json().catch(() => null);
      if (!value) { await wait(1200); continue; }
      if (value.state === 'done') return reconstructed(value);
      if (value.state === 'uncertain') throw new Error('操作可能已经完成，请刷新核对；不会重复提交。');
      await wait(1200);
    }
    throw new Error('同步仍在运行，请稍后刷新核对结果。');
  }
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
    const localBackend = ['127.0.0.1', 'localhost'].includes(url.hostname) && ['4317','5174'].includes(url.port);
    if (!url.pathname.startsWith('/v1/github-workspace/') || !(url.origin === location.origin || localBackend)) return nativeFetch(input, init);
    if (!permitted) throw new Error('请先等待 GitHub 工作台完成连接。');
    const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    const write = !['GET', 'HEAD'].includes(method), id = headers.get('X-Pulse-Operation-Id') || crypto.randomUUID();
    if (write && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('操作编号无效。');
    if (write) headers.set('X-Pulse-Operation-Id', id);
    if (write) activeWrites++;
    try {
      let response;
      const body = Object.prototype.hasOwnProperty.call(init, 'body') ? init.body : write && input instanceof Request ? await input.clone().text() : undefined;
      try { response = await nativeFetch('/api/local-apps/github' + url.pathname + url.search, { ...init, method, headers, credentials: 'same-origin', cache: 'no-store', body }); }
      catch (error) { if (write) return await operation(id); throw error; }
      // These original endpoints never use 202 as a finished result. Even a
      // truncated pending envelope must be resolved from the same receipt.
      if (write && response.status === 202) return await operation(id);
      if (write && response.status >= 500) return await operation(id);
      return response;
    } finally { if (write) activeWrites--; }
  };
  // GitHub's existing OAuth app is registered for the original computer callback.
  // Reuse that flow instead of changing app credentials or dropping authorization.
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href="/api/integrations/github/connect"]');
    if (!link) return;
    event.preventDefault();
    const dialog = document.createElement('dialog'); dialog.className = 'pulse-github-auth';
    dialog.innerHTML = '<h2>在原电脑管理 GitHub 授权</h2><p>当前工作台复用原电脑的 GitHub 连接。首次授权或调整仓库权限，请在原电脑打开授权页面；完成后返回这里刷新即可。</p><p>如果你正在手机上查看，请到原电脑完成这一步。</p><a href="http://127.0.0.1:5174/api/integrations/github/connect" target="_blank" rel="noopener">在原电脑打开授权页面 ↗</a><button type="button">完成，返回工作台</button>';
    dialog.querySelector('button').onclick = () => { dialog.close(); dialog.remove(); location.reload(); };
    dialog.addEventListener('close', () => dialog.remove(), { once: true }); document.body.append(dialog); dialog.showModal();
  });
  async function check() {
    if (pending) return; pending = true;
    try {
      const response = await nativeFetch('/api/local-apps/status', { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(15000) });
      if (!response.ok && ![401,403].includes(response.status)) throw new Error('status-unavailable');
      const status = await response.json();
      if (!response.ok || !status.canManage) { permitted = false; needsRefresh = loaded; gate.textContent = '请使用网站管理账号登录后打开 GitHub 工作台。'; gate.hidden = false; return; }
      if (!status.connected || !status.apps?.github) { permitted = false; needsRefresh = loaded; gate.textContent = '等待原电脑的 GitHub 服务上线，联网后会自动恢复。'; gate.hidden = false; return; }
      permitted = true;
      if (failedLoad || needsRefresh) {
        if (!activeWrites) location.reload();
        else { gate.textContent = '连接已恢复，正在确认之前的操作结果…'; gate.hidden = false; }
        return;
      }
      if (loaded) return;
      gate.textContent = '已连接，正在载入 GitHub 工作台…';
      for (const source of document.querySelectorAll('script[type="text/pulse-deferred"]')) {
        const script = document.createElement('script'); script.src = source.dataset.src;
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => { failedLoad = true; reject(new Error('script-timeout')); }, 25000);
          script.onload = () => { clearTimeout(timeout); resolve(); };
          script.onerror = error => { clearTimeout(timeout); failedLoad = true; reject(error); };
          document.body.append(script);
        });
      }
      loaded = true; gate.hidden = true;
    } catch { permitted = false; needsRefresh = loaded; gate.textContent = '连接暂时中断，正在重试。未确认的操作请勿重复提交。'; gate.hidden = false; }
    finally { pending = false; }
  }
  check(); setInterval(check, 15000);
})();
