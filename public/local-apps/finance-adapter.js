(() => {
  'use strict';
  const KEY = 'mezip.finance.center.v2';
  const LEGACY_KEY = 'mezip.finance.center.v1';
  const BASE = '/api/local-apps/finance';
  const STORAGE = `${BASE}/storage/finance`;
  const rawFetch = window.fetch.bind(window);
  const nativeStorage = window.localStorage;
  const STORE_NAME = '__pulseFinanceStoreV1';
  const RUNTIME_VERSION = 2;
  let host = window;
  try { if (window.top.location.origin === location.origin) host = window.top; } catch { /* isolated top frame */ }

  const parseError = async (response) => {
    const body = await response.json().catch(() => ({}));
    return body.error?.message || (typeof body.error === 'string' ? body.error : '') || `连接失败（${response.status}）`;
  };
  function createStore() {
    const store = { runtimeVersion: RUNTIME_VERSION, refreshTimer: null, initialized: false, revision: null, data: null, phase: 'loading', message: '', queue: [], running: null, refreshing: null, ready: null, listeners: new Set(), views: new Set(), hideAmounts: false };
    store.emit = () => { for (const notify of store.listeners) notify(); };
    store.interacting = () => [...store.views].some(item => item.editing());
    store.read = async () => {
      let response;
      try { response = await rawFetch(STORAGE, { cache: 'no-store', credentials: 'same-origin' }); }
      catch (error) { const failure = new Error(error.message || '暂时无法连接电脑账本。'); failure.recoverableRead = true; throw failure; }
      if (!response.ok) {
        const failure = new Error(await parseError(response));
        failure.recoverableRead = response.status >= 500 || [408, 425, 429].includes(response.status);
        throw failure;
      }
      const payload = await response.json();
      if (typeof payload.initialized !== 'boolean' || (payload.initialized && (typeof payload.data !== 'string' || !Number.isInteger(payload.revision)))) throw new Error('账本返回格式不正确，请稍后重新连接。');
      if (payload.initialized) {
        const ledger = JSON.parse(payload.data);
        if (!ledger || typeof ledger !== 'object' || !Array.isArray(ledger.transactions)) throw new Error('账本数据不完整，已暂停加载以保护原记录。');
      }
      return payload;
    };
    store.hydrate = async () => {
      const payload = await store.read();
      store.initialized = payload.initialized; store.revision = payload.revision ?? 0; store.data = payload.data ?? null;
      store.phase = payload.initialized ? 'ready' : 'uninitialized'; store.message = ''; store.emit();
      return payload;
    };
    store.drain = () => {
      if (store.running) return store.running;
      store.running = (async () => {
        store.phase = 'saving'; store.message = ''; store.emit();
        while (store.queue.length) {
          const item = store.queue[0];
          if (item.revision === undefined) item.revision = store.revision;
          const response = await rawFetch(STORAGE, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Pulse-Operation-Id': item.id }, body: JSON.stringify({ revision: item.revision, data: item.data }) });
          if (!response.ok) {
            const failure = new Error(await parseError(response));
            failure.conflict = response.status === 409;
            throw failure;
          }
          const payload = await response.json();
          if (!Number.isInteger(payload.revision)) throw new Error('保存响应不完整，请重试确认。');
          store.revision = payload.revision; store.initialized = true; store.queue.shift(); store.emit();
        }
        store.phase = 'ready'; store.message = ''; store.emit();
      })().catch(error => {
        store.phase = 'blocked'; store.message = error.message || '暂时无法保存到这台电脑。'; store.conflict = error.conflict === true; store.emit(); throw error;
      }).finally(() => { store.running = null; });
      // Synchronous legacy save calls cannot await; the persistent notice and
      // operation gate show failures, while explicit flush callers also reject.
      store.running.catch(() => {});
      return store.running;
    };
    store.set = value => {
      if (!store.initialized || !['ready', 'saving'].includes(store.phase)) throw new Error('账本尚未连接，当前操作未保存。');
      const text = String(value); JSON.parse(text);
      if (text === store.data) return;
      store.data = text; store.queue.push({ id: crypto.randomUUID(), data: text }); store.emit(); store.drain();
    };
    store.flush = async () => {
      if (!['ready', 'saving'].includes(store.phase)) throw new Error(store.message || '账本尚未连接，当前操作未保存。');
      if (store.running) await store.running;
      if (store.queue.length) await store.drain();
    };
    store.initialize = async value => {
      if (store.initialized) throw new Error('新版已经有账本，请重新载入。');
      store.data = value; store.queue.push({ id: crypto.randomUUID(), data: value, revision: store.revision });
      await store.drain();
    };
    store.refresh = () => {
      // An open detail/composer in any nested finance frame protects the whole
      // shared view. Also recheck after the request: the user may start editing
      // while the network is in flight, or a newer local save may finish first.
      store.emit();
      if (store.refreshing) return store.refreshing;
      if (!['ready', 'offline'].includes(store.phase) || store.queue.length || (store.phase === 'ready' && store.interacting())) return Promise.resolve();
      const revisionAtStart = store.revision;
      store.refreshing = (async () => {
        const payload = await store.read();
        if (!['ready', 'offline'].includes(store.phase) || store.queue.length || store.revision !== revisionAtStart) return;
        if (!payload.initialized) throw new Error('电脑账本暂时不可用，请重新连接。');
        if (payload.revision < store.revision) throw new Error('电脑返回了较旧的账本版本，已暂停保存，请重新连接。');
        if (payload.revision > store.revision) {
          if (store.interacting()) {
            if (store.phase === 'offline') { store.message = '连接已恢复，其他设备更新了账本；当前内容保持不变，关闭详情或离开编辑页后同步，暂不能保存。'; store.emit(); }
            return;
          }
          store.data = payload.data; store.revision = payload.revision;
        }
        store.phase = 'ready'; store.message = ''; store.emit();
      })().catch(error => {
        if (!['ready', 'offline'].includes(store.phase) || store.queue.length || store.revision !== revisionAtStart) return;
        store.phase = error.recoverableRead ? 'offline' : 'blocked';
        store.message = error.message; store.emit();
      }).finally(() => { store.refreshing = null; });
      return store.refreshing;
    };
    store.ready = store.hydrate().catch(error => { store.phase = 'blocked'; store.message = error.message; store.emit(); throw error; });
    store.ready.catch(() => {});
    return store;
  }
  const existingStore = host[STORE_NAME];
  if (existingStore && (existingStore.runtimeVersion !== RUNTIME_VERSION || ['interacting', 'refresh', 'set', 'flush'].some(name => typeof existingStore[name] !== 'function'))) {
    // A parent page may outlive a deployment. Do not run new methods against an
    // old closure or create a second writer beside its unsaved operation queue.
    const notice = document.createElement('section'); notice.className = 'pulse-finance-state'; notice.dataset.phase = 'blocked'; notice.setAttribute('aria-live', 'polite');
    const label = document.createElement('span'); label.textContent = '财务页面已更新，当前工作台仍在运行旧版本。原账本和未保存内容保持不变。';
    const detail = document.createElement('small'); detail.textContent = '请先在旧页面完成保存，再刷新整个工作台；系统不会自动刷新或清空账本。';
    const refresh = document.createElement('button'); refresh.type = 'button'; refresh.dataset.pulseUpgradeRefresh = 'true'; refresh.textContent = '检查并刷新整个工作台';
    refresh.onclick = () => {
      let unsafe = true;
      try {
        unsafe = !Array.isArray(existingStore.queue) || existingStore.queue.length > 0 || Boolean(existingStore.running) || ['saving', 'loading'].includes(existingStore.phase);
        if (!existingStore.views || typeof existingStore.views[Symbol.iterator] !== 'function') unsafe = true;
        else if ([...existingStore.views].some(view => typeof view.editing !== 'function' || view.editing())) unsafe = true;
      } catch { unsafe = true; }
      if (unsafe) { detail.textContent = '旧页面仍有未保存内容、打开的编辑窗口或正在保存。请先处理完成，再点击此按钮；不会清空或覆盖这些内容。'; return; }
      if (confirm('请先保存工作台各页面的修改。确定已全部保存，并刷新整个工作台以完成财务更新？')) host.location.reload();
    };
    notice.append(label, detail, refresh); document.body.prepend(notice); document.body.dataset.financeState = 'blocked';
    return;
  }
  const store = existingStore || (host[STORE_NAME] = createStore());
  const dirtyForms = new Set();
  const view = { editing: () => {
    for (const form of dirtyForms) if (!form.isConnected || form.closest('[hidden]') || (form.closest('dialog') && !form.closest('dialog').open)) dirtyForms.delete(form);
    return dirtyForms.size > 0 || Boolean(document.querySelector('dialog[open], #composer-modal:not([hidden]), #import-modal:not([hidden]), #confirm-modal:not([hidden])')) || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable === true;
  } };
  for (const name of ['input', 'change']) document.addEventListener(name, event => {
    const form = event.target.closest?.('#composer-form, #record-form, #budget-form, #category-budget-form');
    if (form) dirtyForms.add(form);
  }, true);
  store.views.add(view);
  window.PulseFinance = {
    flush: () => store.flush(),
    isReady: () => store.initialized && ['ready', 'saving'].includes(store.phase),
    isInteracting: () => store.interacting(),
    get amountsHidden() { return store.hideAmounts; },
    setAmountsHidden(value) { store.hideAmounts = Boolean(value); store.emit(); },
    get phase() { return store.phase; },
  };

  // Only these finance keys are virtualized. No real financial data is copied
  // into the public site's browser storage, and unrelated modules are untouched.
  const storageProxy = new Proxy(nativeStorage, {
    get(target, property) {
      if (property === 'getItem') return key => key === KEY ? store.data : key === LEGACY_KEY ? null : target.getItem(key);
      if (property === 'setItem') return (key, value) => key === KEY ? store.set(value) : key === LEGACY_KEY ? undefined : target.setItem(key, value);
      if (property === 'removeItem') return key => { if (key === KEY || key === LEGACY_KEY) throw new Error('请使用账本页面内的删除操作。'); target.removeItem(key); };
      if (property === 'clear') return () => { throw new Error('不能清空共享账本。'); };
      if (property === KEY) return store.data;
      const value = Reflect.get(target, property, target); return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, property, value) { if (property === KEY) store.set(value); else target[property] = value; return true; },
  });
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storageProxy });

  async function operationResult(operationId) {
    // A long OCR request or a dropped HTTP response must never repeat the write.
    // The same operation receipt is polled until the gateway knows its result.
    const deadline = Date.now() + 190000;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      let response;
      try { response = await rawFetch(`/api/local-apps/operations/${encodeURIComponent(operationId)}`, { credentials: 'same-origin', cache: 'no-store' }); }
      catch { continue; }
      if ([401, 403].includes(response.status)) return response;
      if (!response.ok) continue;
      const result = await response.json().catch(() => null);
      if (result?.state === 'done') {
        const status = Number(result.status) || 200;
        return new Response([204, 205, 304].includes(status) ? null : JSON.stringify(result.body ?? null), { status, headers: { 'Content-Type': 'application/json' } });
      }
      if (result?.state === 'uncertain') return new Response(JSON.stringify({ error: { message: '操作可能已经完成。请刷新核实，系统不会自动重复执行。' } }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: { message: '暂时无法确认操作结果。请刷新核实后继续，系统没有重复发送这项操作。' } }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  }

  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
    const isLocalFinance = url.hostname === '127.0.0.1' && url.port === '4325' && url.pathname.startsWith('/v1/finance/mobile/');
    const isHostedFinance = url.origin === location.origin && url.pathname.startsWith(`${BASE}/v1/finance/mobile/`);
    if (!isLocalFinance && !isHostedFinance) return rawFetch(input, init);
    let method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const path = isLocalFinance ? url.pathname : url.pathname.slice(BASE.length);
    if (path.endsWith('/invite')) method = 'POST';
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    if (!['GET', 'HEAD'].includes(method)) {
      if (!window.PulseFinance.isReady()) throw new Error('账本连接中断，请先恢复连接。');
      await store.flush();
      if (!headers.has('X-Pulse-Operation-Id')) headers.set('X-Pulse-Operation-Id', crypto.randomUUID());
    }
    const operationId = headers.get('X-Pulse-Operation-Id');
    let response;
    try { response = await rawFetch(`${BASE}${path}${url.search}`, { ...init, method, headers, credentials: 'same-origin', cache: 'no-store' }); }
    catch (error) { if (operationId) return operationResult(operationId); throw error; }
    if (operationId && response.status === 202) {
      const result = await response.clone().json().catch(() => null);
      if (result?.relayPending) return operationResult(operationId);
    }
    // Upstream transport failure can occur after the local operation committed.
    if (operationId && [502, 503, 504].includes(response.status)) return operationResult(operationId);
    return response;
  };

  const notice = document.createElement('section');
  notice.className = 'pulse-finance-state'; notice.setAttribute('aria-live', 'polite');
  document.body.prepend(notice);
  let lastData = null;
  let lastPrivacy = store.hideAmounts;
  function drawState() {
    const phase = store.phase;
    const count = store.data ? JSON.parse(store.data).transactions?.length || 0 : 0;
    const messages = { loading: '正在连接电脑账本…', uninitialized: '新版账本尚未初始化', ready: `已连接电脑账本 · ${count} 笔记录 · 多设备共享`, saving: '正在保存到这台电脑…', offline: `离线只读 · 保留 ${count} 笔已加载记录 · 正在自动重连`, blocked: store.message || '账本暂时无法连接' };
    notice.replaceChildren();
    const label = document.createElement('span'); label.textContent = messages[phase]; notice.append(label);
    notice.dataset.phase = phase;
    document.body.dataset.financeState = phase;
    if (store.initialized && phase !== 'blocked') {
      const privacy = document.createElement('button'); privacy.type = 'button'; privacy.textContent = store.hideAmounts ? '显示金额' : '隐藏金额';
      privacy.title = '仅影响本次页面，不修改原账本的隐私设置';
      privacy.onclick = () => {
        if (store.interacting()) { privacy.textContent = '请先关闭详情或完成编辑'; return; }
        window.PulseFinance.setAmountsHidden(!store.hideAmounts);
      };
      notice.append(privacy);
    }
    if (phase === 'offline') {
      const detail = document.createElement('small'); detail.textContent = store.message.startsWith('连接已恢复') ? store.message : '可以继续查看账单和详情；暂不能保存，连接恢复后自动解除只读。'; notice.append(detail);
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '立即重连'; retry.onclick = () => { void store.refresh(); }; notice.append(retry);
    }
    if (phase === 'blocked') {
      const detail = document.createElement('small'); detail.textContent = store.queue.length ? '未保存更改仍保留在本页。已暂停编辑。' : '已暂停编辑，恢复连接后继续。'; notice.append(detail);
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = store.conflict ? '重新读取已保存账本' : '重新连接';
      retry.onclick = async () => {
        if (store.conflict && store.queue.length && !confirm('其他页面已更新账本。重新读取会放弃本页尚未保存的修改，继续吗？')) return;
        try {
          if (store.conflict || !store.queue.length) { store.queue.length = 0; await store.hydrate(); location.reload(); }
          else await store.drain();
        } catch { /* error already remains visible */ }
      };
      notice.append(retry);
    }
    if (store.data !== lastData && !store.interacting()) {
      lastData = store.data;
      queueMicrotask(() => window.dispatchEvent(new Event('pulse-finance-data')));
    }
    if (store.hideAmounts !== lastPrivacy) {
      lastPrivacy = store.hideAmounts;
      queueMicrotask(() => window.dispatchEvent(new Event('pulse-finance-privacy')));
    }
  }
  store.listeners.add(drawState); drawState();
  window.addEventListener('unload', () => { store.listeners.delete(drawState); store.views.delete(view); }, { once: true });
  window.addEventListener('beforeunload', event => { if (store.queue.length) { event.preventDefault(); event.returnValue = ''; } });
  const writeActions = new Set(['open-composer', 'edit', 'delete', 'perform-delete', 'open-import', 'confirm-import', 'confirm-transfer', 'external-transfer', 'confirm-refund', 'dismiss-review', 'confirm-category', 'remove-subscription', 'confirm-subscription', 'rollback-batch', 'force-rollback', 'legacy-import-image']);
  document.addEventListener('click', event => {
    if (notice.contains(event.target)) return;
    const action = event.target.closest?.('[data-action]')?.dataset.action;
    const offlineWrite = store.phase === 'offline' && (writeActions.has(action) || event.target.closest?.('#save-draft, #confirm-record, #reject-record, #make-link, button[type="submit"], input[type="submit"]'));
    if (store.phase === 'blocked' || offlineWrite) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('submit', event => {
    if (!window.PulseFinance.isReady()) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);

  async function loadScripts() {
    for (const original of document.querySelectorAll('script[type="text/pulse-finance-deferred"]')) {
      const script = document.createElement('script');
      const src = original.dataset.src;
      if (src) {
        await new Promise((resolve, reject) => { script.onload = resolve; script.onerror = () => reject(new Error('页面资源加载失败，请刷新重试。')); script.src = src; original.replaceWith(script); });
      } else { script.textContent = original.textContent; original.replaceWith(script); }
    }
  }
  function showSetup() {
    const main = document.querySelector('main') || document.querySelector('.shell');
    if (main) main.hidden = true;
    const setup = document.createElement('section'); setup.className = 'pulse-finance-setup';
    setup.innerHTML = '<span>财务账本</span><h1>连接原账本，继续记录</h1><p>将原浏览器的账本复制到新版，原账本保持不变。新版以后独立保存在同一台电脑，由登录此账号的设备共同使用。</p><a class="button primary" href="http://127.0.0.1:5174/pulse-finance-transfer/index.html" target="_blank" rel="noopener">在这台电脑复制原账本</a><p class="muted">请在原来记账的浏览器打开上面的地址。完成复制后点击下方按钮；手机需先在电脑完成这一步。</p><div><button type="button" data-check>我已复制，重新连接</button><button type="button" data-empty>新建一个空账本</button></div><p class="pulse-setup-message" role="status"></p>';
    document.body.append(setup);
    const feedback = setup.querySelector('.pulse-setup-message');
    setup.querySelector('[data-check]').onclick = async () => { try { await store.hydrate(); if (store.initialized) location.reload(); else feedback.textContent = '还未收到原账本，请先在常用浏览器完成复制。'; } catch (error) { feedback.textContent = error.message; } };
    setup.querySelector('[data-empty]').onclick = async () => {
      if (!confirm('确定新建空账本？新版将从零开始；原浏览器账本保留，但不会自动合并到新版。')) return;
      try {
        await new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = '/local-apps/finance-center-v2/finance-core.js'; script.onload = resolve; script.onerror = () => reject(new Error('无法载入账本组件，请重试。')); document.head.append(script); });
        await store.initialize(JSON.stringify(window.MEZipFinance.blankState())); location.reload();
      } catch (error) { feedback.textContent = error.message; }
    };
  }
  async function boot() {
    await store.ready;
    if (!store.initialized) { showSetup(); return; }
    await loadScripts();
    if (!store.refreshTimer) {
      store.refreshTimer = host.setInterval(() => { void store.refresh(); }, 10000);
    }
  }
  boot().catch(error => { store.phase = 'blocked'; store.message = error.message; store.emit(); });
})();
