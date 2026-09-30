(() => {
  const API_ROOT = '/v1/github-workspace';
  const endpointLabels = {
    [`${API_ROOT}/snippets`]: '代码片段',
    [`${API_ROOT}/issues`]: 'Issues',
    [`${API_ROOT}/pull-requests`]: 'Pull Requests',
    [`${API_ROOT}/tasks`]: '任务',
    [`${API_ROOT}/activity`]: '活动',
  };
  let boundView;
  let taskMap = new Map();
  let tasksLoading = false;

  const route = () => location.hash.replace(/^#\/?/u, '').split('?')[0];
  const endpointErrors = () =>
    Object.entries(window.__mezipWorkspaceEndpointStatus || {});

  const showPartialState = (view) => {
    const errors = endpointErrors();
    view.querySelector('[data-v5-partial-state]')?.remove();
    if (!errors.length) return;
    const panel = document.createElement('section');
    panel.className = 'surface v5-partial-state';
    panel.dataset.v5PartialState = 'true';
    const names = errors.map(([path]) => endpointLabels[path] || path).join('、');
    panel.innerHTML = `<div><strong>部分数据暂时不可用</strong><span>${names} 未返回数据，其他已授权数据仍继续展示。你可以重试，不会生成演示数据。</span></div><button type="button" class="quiet" data-v5-retry>重试</button>`;
    view.prepend(panel);
  };

  const statusForColumn = (column) => {
    const label = column.querySelector('header strong')?.textContent?.trim();
    return (
      { 待处理: 'TODO', 进行中: 'IN_PROGRESS', 审核中: 'REVIEW', 已完成: 'DONE' }[
        label
      ] || null
    );
  };

  const loadTaskMap = async () => {
    if (tasksLoading || taskMap.size) return;
    tasksLoading = true;
    try {
      const response = await fetch(`${API_ROOT}/tasks`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) return;
      const rows = await response.json();
      taskMap = new Map(
        (Array.isArray(rows) ? rows : []).map((task) => [task.title, task]),
      );
    } finally {
      tasksLoading = false;
    }
  };

  const bindTaskDrag = async (view) => {
    if (!route().startsWith('tasks')) return;
    await loadTaskMap();
    view.querySelectorAll('.task-card').forEach((card) => {
      if (card.dataset.v5DragBound === 'true') return;
      const title = card.querySelector('h3')?.textContent?.trim();
      const task = title ? taskMap.get(title) : null;
      if (!task) return;
      card.dataset.v5DragBound = 'true';
      card.dataset.v5TaskId = task.id;
      card.draggable = true;
      card.setAttribute('aria-label', `${title}，可拖拽调整任务状态`);
      card.addEventListener('dragstart', (event) => {
        event.dataTransfer?.setData('text/plain', task.id);
        card.classList.add('v5-dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('v5-dragging'));
    });
    view.querySelectorAll('.kanban-column').forEach((column) => {
      if (column.dataset.v5DropBound === 'true') return;
      column.dataset.v5DropBound = 'true';
      column.addEventListener('dragover', (event) => {
        if (event.dataTransfer?.types.includes('text/plain')) {
          event.preventDefault();
          column.classList.add('v5-drop-target');
        }
      });
      column.addEventListener('dragleave', () =>
        column.classList.remove('v5-drop-target'),
      );
      column.addEventListener('drop', async (event) => {
        event.preventDefault();
        column.classList.remove('v5-drop-target');
        const taskId = event.dataTransfer?.getData('text/plain');
        const status = statusForColumn(column);
        if (!taskId || !status) return;
        column.classList.add('v5-saving');
        try {
          const response = await fetch(
            `${API_ROOT}/tasks/${encodeURIComponent(taskId)}`,
            {
              method: 'PATCH',
              credentials: 'same-origin',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'Idempotency-Key': `workspace-v5-drag-${taskId}-${status}-${Date.now()}`,
              },
              body: JSON.stringify({ status }),
            },
          );
          if (!response.ok) throw new Error(`任务状态保存失败（${response.status}）`);
          location.reload();
        } catch (error) {
          const viewRoot = document.querySelector('#workspace-view');
          if (viewRoot) {
            const note = document.createElement('div');
            note.className = 'inline-error';
            note.textContent =
              error instanceof Error ? error.message : '任务状态保存失败。';
            viewRoot.prepend(note);
          }
        } finally {
          column.classList.remove('v5-saving');
        }
      });
    });
  };

  const bind = () => {
    const view = document.querySelector('#workspace-view');
    if (!view) return;
    showPartialState(view);
    void bindTaskDrag(view);
    if (boundView === view) return;
    boundView = view;
    view.addEventListener('click', (event) => {
      const button = event.target.closest('[data-v5-retry]');
      if (button) location.reload();
    });
  };

  new MutationObserver(bind).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', () => {
    boundView = null;
    taskMap = new Map();
    void bind();
  });
  bind();
})();
