(() => {
  const panel = document.createElement('section');
  panel.className = 'panel mobile-access-panel';
  panel.innerHTML = '<h2>首次导入完整备份</h2><p>把电脑导出的完整 ZIP 备份带到云端，包括记录、周刊、已保存的封面和素材文件。仅适用于空资料库，最大 60 MB。</p><button id="openBackupImport" class="quiet-button">选择完整备份</button><dialog id="backupImportDialog" aria-labelledby="backupImportTitle"><h2 id="backupImportTitle">导入到我的云端资料库</h2><p>选择“下载完整备份”生成的 ZIP。已有云端资料时会停止导入。</p><label class="field-label">备份文件<input id="backupImportFile" type="file" accept=".zip,application/zip"></label><p id="backupImportStatus" role="status" aria-live="polite">请选择电脑上的完整备份。</p><div class="mobile-actions"><button id="submitBackupImport" class="primary-button" disabled>导入到云端</button><button id="closeBackupImport" class="quiet-button">取消</button></div></dialog>';
  document.getElementById('view-settings').append(panel);
  const dialog = document.getElementById('backupImportDialog');
  const input = document.getElementById('backupImportFile');
  const submit = document.getElementById('submitBackupImport');
  const close = document.getElementById('closeBackupImport');
  const status = document.getElementById('backupImportStatus');
  let busy = false, complete = false;
  const occupied = () => [contentItems, materialItems, customTags, newsletters].some(items => items.length);
  document.getElementById('openBackupImport').addEventListener('click', () => {
    if (!apiEnabled) return showToast('请先登录并连接云端资料库');
    if (unsavedChanges) return showToast('请先保存当前修改，再导入备份');
    if (occupied()) return showToast('云端已有资料，完整备份仅能导入空资料库');
    input.value = ''; submit.disabled = true; complete = false; close.textContent = '取消';
    status.textContent = '请选择电脑上的完整备份。';
    dialog.showModal();
  });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    const valid = file && /\.zip$/i.test(file.name) && file.size > 0 && file.size <= 60 * 1024 * 1024;
    submit.disabled = !valid;
    status.textContent = valid ? `已选择：${file.name}（${(file.size / 1024 / 1024).toFixed(2)} MB）` : '请选择不超过 60 MB 的完整 ZIP 备份。';
  });
  submit.addEventListener('click', async () => {
    if (busy) return;
    const file = input.files?.[0];
    if (!file || !/\.zip$/i.test(file.name) || !file.size || file.size > 60 * 1024 * 1024) return;
    if (!apiEnabled || unsavedChanges || occupied()) {
      status.textContent = '资料库状态已变化，请先关闭此窗口并核对资料。';
      return;
    }
    busy = true; submit.disabled = true; input.disabled = true; close.disabled = true;
    status.textContent = '正在上传并校验记录和附件，请保持页面打开…';
    try {
      const response = await fetch('/api/sync/migrate', {method: 'POST', headers: {'Content-Type': 'application/zip'}, body: file});
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.state) throw new Error(result?.message || '未能确认导入结果，请刷新并核对云端资料后重试');
      const state = result.state;
      if (!['content', 'materials', 'tags', 'newsletters'].every(key => Array.isArray(state[key]))) throw new Error('导入结果不完整，请刷新并核对云端资料');
      contentItems.splice(0, contentItems.length, ...state.content);
      materialItems.splice(0, materialItems.length, ...state.materials);
      customTags.splice(0, customTags.length, ...state.tags);
      newsletters = state.newsletters;
      serverRevision = state.updatedAt;
      persistedState = JSON.parse(JSON.stringify(state));
      queuedState = JSON.parse(JSON.stringify(state));
      selectedItems.clear();
      try {
        for (const key of ['content', 'materials', 'tags', 'newsletters']) localStorage.setItem('lingan-' + key, JSON.stringify(state[key]));
      } catch {}
      renderLibrary(); renderMaterials(); renderCustomTags(); renderNewsletters();
      complete = true;
      status.textContent = `导入完成：${state.content.length} 条内容、${state.materials.length} 条素材、${state.newsletters.length} 期周刊、${result.files} 个文件。电脑自动同步仍需单独连接。`;
      close.textContent = '查看内容库';
    } catch (error) {
      status.textContent = error.message || '未能确认导入结果，请刷新并核对云端资料';
    } finally {
      busy = false; close.disabled = false; input.disabled = complete; submit.disabled = complete;
    }
  });
  close.addEventListener('click', () => { if (!busy) { dialog.close(); if (complete) showView('library'); } });
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  window.addEventListener('beforeunload', event => { if (busy) { event.preventDefault(); event.returnValue = ''; } });
})();
