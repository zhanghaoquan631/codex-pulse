// Runs before the copied page's business scripts. The original ME.zip stays untouched.
(() => {
  'use strict';
  const originalFetch = window.fetch.bind(window);
  const sourceApi = '/api/film-studio/v1';
  const mediaApi = '/api/local-apps/media' + sourceApi;
  const uploadsApi = '/api/local-apps/uploads';
  const chunkBytes = 8 * 1024 * 1024;
  const maximumBytes = 1024 * 1024 * 1024;
  const uploads = new Map();
  let scriptsStarted = false, online = false, checking = false;
  const gate = document.createElement('section');
  gate.className = 'pulse-media-gate';
  gate.setAttribute('role', 'status');
  gate.innerHTML = '<div><span class="pulse-media-kicker">我的工作空间</span><h2>正在连接录制与截图库</h2><p>正在确认账号与电脑连接…</p></div>';
  document.body.appendChild(gate);
  const connection = document.createElement('div');
  connection.className = 'pulse-media-connection';
  connection.setAttribute('role', 'status');
  connection.hidden = true;
  document.body.appendChild(connection);
  const transferList = document.createElement('section');
  transferList.className = 'pulse-media-transfers';
  transferList.setAttribute('aria-label', '素材保存进度');
  document.body.appendChild(transferList);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  function mediaUrl(value) {
    if (typeof value !== 'string') return value;
    try {
      const url = new URL(value, location.href);
      if (url.origin === location.origin && (url.pathname === sourceApi || url.pathname.startsWith(sourceApi + '/'))) {
        return '/api/local-apps/media' + url.pathname + url.search + url.hash;
      }
    } catch { /* Preserve unrelated values. */ }
    return value;
  }
  function mapUrls(value) {
    if (Array.isArray(value)) return value.map(mapUrls);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, key === 'url' ? mediaUrl(child) : mapUrls(child)]));
  }
  function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(mapUrls(body)), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
  async function callJson(path, options = {}, timeout = 45000) {
    const response = await originalFetch(path, {
      credentials: 'same-origin', cache: 'no-store', ...options,
      signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(typeof body.error === 'string' && /[\u3400-\u9fff]/.test(body.error) ? body.error : '保存连接暂时中断，请保留此页面。');
      error.status = response.status;
      error.data = body;
      throw error;
    }
    return body;
  }
  async function safeTransferCall(path, options) {
    // Session creation and numbered chunks are idempotent. Final commit is never retried here.
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await callJson(path, options, 120000); }
      catch (error) {
        if (options.signal?.aborted || (error.status && error.status < 500) || attempt === 2) throw error;
        await wait(700 * (attempt + 1));
      }
    }
  }
  function operationHeaders(id, contentType) {
    return { 'X-Pulse-Operation-Id': id, ...(contentType ? { 'Content-Type': contentType } : {}) };
  }
  function showGate(title, detail, login = false) {
    gate.replaceChildren();
    const box = document.createElement('div');
    const heading = document.createElement('h2'); heading.textContent = title;
    const copy = document.createElement('p'); copy.textContent = detail;
    box.append(heading, copy);
    if (login) {
      const link = document.createElement('a');
      link.className = 'button primary'; link.textContent = '登录并打开'; link.target = '_top';
      link.href = '/signin-with-chatgpt?return_to=' + encodeURIComponent('/#activity');
      box.appendChild(link);
    }
    gate.appendChild(box); gate.hidden = false;
  }
  function transferView(upload) {
    const card = document.createElement('article'); card.className = 'pulse-media-transfer';
    const name = document.createElement('strong'); name.textContent = upload.kind === 'emotion' ? '保存录制视频' : '保存截图';
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    const progress = document.createElement('progress'); progress.max = upload.blob.size; progress.value = 0;
    progress.setAttribute('aria-label', name.textContent + '进度');
    const actions = document.createElement('div'); actions.className = 'pulse-media-transfer-actions';
    const download = document.createElement('button'); download.type = 'button'; download.className = 'button'; download.textContent = '下载到当前设备';
    download.addEventListener('click', () => {
      if (!upload.blob) return;
      const address = URL.createObjectURL(upload.blob);
      const link = document.createElement('a'); link.href = address;
      link.download = (upload.kind === 'emotion' ? '录制视频_' : '截图_') + new Date().toISOString().replace(/[:.]/g, '-') + (upload.kind === 'emotion' ? (upload.blob.type.startsWith('video/mp4') ? '.mp4' : '.webm') : '.png');
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(address), 60000);
    });
    const resume = document.createElement('button'); resume.type = 'button'; resume.className = 'button primary'; resume.textContent = '继续保存'; resume.hidden = true;
    resume.addEventListener('click', async () => {
      if (upload.busy || upload.commitAttempted) return;
      try {
        const response = await runUpload(upload);
        if (!response.ok) throw new Error('电脑未确认保存成功，请先下载副本。');
        document.querySelector('[data-refresh]')?.click();
      } catch (error) { failUpload(upload, error); }
    });
    const inspect = document.createElement('button'); inspect.type = 'button'; inspect.className = 'button'; inspect.textContent = '检查保存结果'; inspect.hidden = true;
    inspect.addEventListener('click', async () => {
      if (upload.busy) return;
      inspect.disabled = true;
      try {
        const session = await callJson(uploadsApi + '/' + upload.id);
        const result = receipt(session);
        if (result) { finishUpload(upload, result); document.querySelector('[data-refresh]')?.click(); }
        else status.textContent = session.state === 'committing' ? '电脑正在保存，请稍后再检查。' : '尚不能确认是否已保存。请先检查资料库，并下载副本保留素材。';
      } catch { status.textContent = '暂时无法检查结果。素材仍保留在当前页面，请下载副本。'; }
      finally { inspect.disabled = false; }
    });
    actions.append(download, resume, inspect); card.append(name, status, progress, actions); transferList.appendChild(card);
    return { card, status, progress, download, resume, inspect };
  }
  function receipt(session) {
    const result = session?.result || (session?.state === 'done' ? session : null);
    return result && Number.isInteger(result.status) && result.status >= 200 && result.status <= 599 ? result : null;
  }
  function finishUpload(upload, result) {
    const ok = result.status >= 200 && result.status < 300;
    upload.view.status.textContent = ok ? '已保存到这台电脑的资料库。' : '电脑未确认保存成功，请下载副本保留素材。';
    upload.view.resume.hidden = true; upload.view.inspect.hidden = true;
    if (ok) {
      upload.view.progress.value = upload.view.progress.max;
      upload.blob = null; uploads.delete(upload.id);
      upload.view.download.hidden = true;
      const close = document.createElement('button'); close.type = 'button'; close.className = 'button'; close.textContent = '关闭';
      close.addEventListener('click', () => upload.view.card.remove());
      upload.view.card.appendChild(close);
    }
    return jsonResponse(result.body, result.status);
  }
  function failUpload(upload, error) {
    upload.view.status.textContent = upload.commitAttempted
      ? '保存结果尚未确认。请检查资料库，或下载副本；不会自动重复保存。'
      : '上传已中断，素材仍在当前页面。恢复连接后可继续保存，也可先下载副本。';
    upload.view.resume.hidden = upload.commitAttempted;
    upload.view.inspect.hidden = !upload.commitAttempted;
    upload.view.progress.removeAttribute('value');
    return error;
  }
  async function runUpload(upload) {
    upload.busy = true; upload.view.resume.hidden = true;
    try {
      if (!upload.created) {
        upload.view.status.textContent = '正在准备保存…';
        await safeTransferCall(uploadsApi, { method: 'POST', headers: operationHeaders(upload.id, 'application/json'),
          body: JSON.stringify({ id: upload.id, kind: upload.kind, contentType: upload.blob.type || (upload.kind === 'emotion' ? 'video/webm' : 'image/png'), totalBytes: upload.blob.size, chunkBytes }), signal: upload.signal });
        upload.created = true;
      }
      let session = await callJson(uploadsApi + '/' + upload.id, { signal: upload.signal });
      const existing = receipt(session);
      if (existing) return finishUpload(upload, existing);
      if (session.state !== 'receiving') { upload.commitAttempted = true; throw new Error('保存状态尚未确认'); }
      let index = session.nextChunkIndex;
      if (!Number.isInteger(index) || index < 0 || session.receivedBytes !== Math.min(index * chunkBytes, upload.blob.size)) throw new Error('保存进度无法确认');
      const chunks = Math.ceil(upload.blob.size / chunkBytes);
      if (index > chunks) throw new Error('保存进度无法确认');
      for (; index < chunks; index++) {
        const offset = index * chunkBytes;
        upload.view.progress.value = offset;
        upload.view.status.textContent = '正在传送到电脑 · ' + Math.floor(offset / upload.blob.size * 100) + '%';
        if (!upload.parts.has(index)) upload.parts.set(index, crypto.randomUUID());
        await safeTransferCall(uploadsApi + '/' + upload.id + '/chunks/' + index, { method: 'PUT',
          headers: operationHeaders(upload.parts.get(index), 'application/octet-stream'), body: upload.blob.slice(offset, Math.min(offset + chunkBytes, upload.blob.size)), signal: upload.signal });
      }
      upload.view.progress.value = upload.blob.size;
      upload.view.status.textContent = '传送完成，正在保存到电脑资料库…';
      if (upload.commitAttempted) throw new Error('正在确认保存结果');
      upload.commitAttempted = true;
      try {
        session = await callJson(uploadsApi + '/' + upload.id + '/commit', { method: 'POST', headers: operationHeaders(upload.id, 'application/json'), body: '{}', signal: upload.signal }, 180000);
        const result = receipt(session);
        if (result) return finishUpload(upload, result);
      } catch (error) {
        if (error.data?.state === 'uncertain') throw error;
        // The request might have arrived. Only read its durable receipt; never resubmit commit.
      }
      for (let attempt = 0; attempt < 12; attempt++) {
        await wait(2000);
        try {
          session = await callJson(uploadsApi + '/' + upload.id);
          const result = receipt(session);
          if (result) return finishUpload(upload, result);
          if (session.state !== 'committing') break;
        } catch { break; }
      }
      throw new Error('保存结果尚未确认');
    } finally { upload.busy = false; }
  }
  async function uploadBlob(kind, body, signal) {
    if (!(body instanceof Blob) || body.size === 0) return jsonResponse({ error: '没有可保存的素材。' }, 400);
    if (body.size > maximumBytes) return jsonResponse({ error: '素材超过 1 GB，请缩短录制后再保存。' }, 413);
    const upload = { id: crypto.randomUUID(), kind, blob: body, signal, parts: new Map(), created: false, busy: false, commitAttempted: false };
    upload.view = transferView(upload); uploads.set(upload.id, upload);
    try { return await runUpload(upload); }
    catch (error) { failUpload(upload, error); return jsonResponse({ error: '素材尚未确认保存。请在保存进度中继续操作，或下载副本。' }, 503); }
  }
  async function mutationReceipt(id) {
    for (let attempt = 0; attempt < 45; attempt++) {
      try {
        const state = await callJson('/api/local-apps/operations/' + id, {}, 12000);
        const result = receipt(state);
        if (result) return jsonResponse(result.body, result.status);
        if (state.state === 'uncertain' || state.state === 'failed' || state.state === 'cancelled') break;
      } catch (error) { if (error.status && error.status < 500) break; }
      await wait(2000);
    }
    return jsonResponse({ error: '操作结果尚未确认。请刷新资料库检查，暂时不要重复操作。' }, 409);
  }
  window.fetch = async (input, options = {}) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input), location.href);
    if (url.origin !== location.origin || !(url.pathname.startsWith(sourceApi + '/') || url.pathname.startsWith(mediaApi + '/'))) return originalFetch(input, options);
    const mappedPath = url.pathname.startsWith(sourceApi + '/') ? '/api/local-apps/media' + url.pathname : url.pathname;
    const method = (options.method || request?.method || 'GET').toUpperCase();
    const uploadMatch = new RegExp('^' + mediaApi + '/upload/(emotion|action)$').exec(mappedPath);
    if (uploadMatch && method === 'POST') return uploadBlob(uploadMatch[1], options.body ?? (request ? await request.blob() : undefined), options.signal || request?.signal);
    if (!online) return jsonResponse({ error: '这台电脑暂时离线，恢复连接后请重试。' }, 503);
    const headers = new Headers(options.headers || request?.headers);
    const operationId = !['GET', 'HEAD'].includes(method) ? crypto.randomUUID() : null;
    if (operationId) headers.set('X-Pulse-Operation-Id', operationId);
    let response;
    try {
      response = await originalFetch(mappedPath + url.search, { ...options, method, headers, credentials: 'same-origin',
        ...(request && options.body === undefined && operationId ? { body: await request.blob() } : {}) });
    } catch (error) { if (operationId) return mutationReceipt(operationId); throw error; }
    if (!response.headers.get('content-type')?.includes('application/json')) return response;
    const result = await response.json();
    if (operationId && response.status === 202 && result.relayPending) return mutationReceipt(operationId);
    return jsonResponse(result, response.status);
  };
  async function startScripts() {
    for (const original of document.querySelectorAll('script[type="text/pulse-local-deferred"]')) {
      const script = document.createElement('script');
      if (original.dataset.src) {
        script.src = original.dataset.src;
        await new Promise((resolve, reject) => { script.onload = resolve; script.onerror = reject; document.body.appendChild(script); });
      } else { script.textContent = original.textContent; document.body.appendChild(script); }
    }
    parent.postMessage({ type: 'mezip:pulse-ready' }, location.origin);
  }
  async function check() {
    if (checking) return;
    checking = true;
    try {
      const status = await callJson('/api/local-apps/status', {}, 12000);
      online = status.canManage === true && status.connected === true && status.apps?.media === true;
      if (status.canManage !== true) {
        showGate('登录后打开私人资料库', '请使用网站所属账号登录，查看这台电脑上的录制视频与截图。', true);
        return;
      }
      if (!scriptsStarted && !online) {
        showGate('等待电脑上的资料库上线', '电脑开机联网后会自动恢复连接，无需重新填写地址。'); return;
      }
      gate.hidden = true;
      connection.hidden = online;
      connection.textContent = '电脑暂时离线。正在录制的素材可停止后下载到当前设备，连接恢复后可继续保存。';
      if (!scriptsStarted) { scriptsStarted = true; await startScripts(); }
    } catch (error) {
      online = false;
      if (error.status === 401 || error.status === 403) showGate('登录后打开私人资料库', '请使用网站所属账号登录，查看这台电脑上的录制视频与截图。', true);
      else if (!scriptsStarted) showGate('正在重新连接电脑', '连接暂时不可用，正在自动重试。');
      else { connection.hidden = false; connection.textContent = '连接暂时中断，正在自动重连。请保留此页面，未保存的素材可下载副本。'; }
    } finally { checking = false; }
  }
  window.addEventListener('beforeunload', event => {
    if (uploads.size || document.querySelector('#stop')?.disabled === false) { event.preventDefault(); event.returnValue = ''; }
  });
  void check(); setInterval(check, 10000);
})();
