(() => {
  const filters = {
    repositoryVisibility: '全部可见性',
    repositorySort: '最近更新',
    snippetLanguage: '全部语言',
    snippetSource: '全部来源',
    issueState: 'All',
    issueRepository: '全部仓库',
  };
  const bound = new WeakSet();
  const show = (node, visible) => {
    node.hidden = !visible;
    node.style.display = visible ? '' : 'none';
  };
  const route = () => location.hash.replace(/^#\/?/u, '').split('?')[0];

  const applyRepositories = (toolbar) => {
    const table = toolbar.parentElement?.querySelector('tbody');
    if (!table) return;
    const rows = [...table.querySelectorAll('tr')];
    rows.forEach((row) => {
      const text = row.textContent || '';
      const visibility = filters.repositoryVisibility;
      show(
        row,
        visibility === '全部可见性' ||
          (visibility === '公开' && text.includes('PUBLIC')) ||
          (visibility === '私有' && text.includes('PRIVATE')) ||
          (visibility === '已归档' && text.includes('ARCHIVED')) ||
          (visibility === 'Forked' && text.includes('FORK')),
      );
    });
    const visibleRows = rows.filter((row) => !row.hidden);
    const sorted = [...visibleRows].sort((left, right) => {
      const leftText = left.textContent || '';
      const rightText = right.textContent || '';
      if (filters.repositorySort === 'Name') return leftText.localeCompare(rightText);
      if (filters.repositorySort === 'Stars') {
        const stars = (value) => Number(value.match(/★\s*(\d+)/u)?.[1] || 0);
        return stars(rightText) - stars(leftText);
      }
      return 0;
    });
    const current = [...table.children];
    if (sorted.some((row, index) => current[index] !== row)) {
      const fragment = document.createDocumentFragment();
      sorted.forEach((row) => fragment.append(row));
      rows.filter((row) => row.hidden).forEach((row) => fragment.append(row));
      table.append(fragment);
    }
  };

  const applySnippets = () => {
    document.querySelectorAll('.snippet-card').forEach((card) => {
      const text = card.textContent || '';
      show(
        card,
        (filters.snippetLanguage === '全部语言' ||
          text.includes(filters.snippetLanguage)) &&
          (filters.snippetSource === '全部来源' ||
            text.includes(filters.snippetSource)),
      );
    });
  };

  const applyIssues = () => {
    document.querySelectorAll('.issue-row').forEach((row) => {
      const text = row.textContent || '';
      const wanted =
        filters.issueState === 'Open'
          ? 'OPEN'
          : filters.issueState === 'Closed'
            ? 'CLOSED'
            : '';
      show(
        row,
        (filters.issueState === 'All' ||
          filters.issueState === 'In Progress' ||
          text.includes(wanted)) &&
          (filters.issueRepository === '全部仓库' ||
            text.includes(filters.issueRepository)),
      );
    });
  };

  const bind = () => {
    const view = document.querySelector('#workspace-view');
    const toolbar = view?.querySelector('.toolbar');
    if (!toolbar || bound.has(toolbar)) return;
    const selects = [...toolbar.querySelectorAll('select')];
    if (route().startsWith('repositories') && selects.length >= 2) {
      const [visibility, sort] = selects;
      bound.add(toolbar);
      visibility.value = filters.repositoryVisibility;
      sort.value = filters.repositorySort;
      visibility.addEventListener('change', () => {
        filters.repositoryVisibility = visibility.value;
        applyRepositories(toolbar);
      });
      sort.addEventListener('change', () => {
        filters.repositorySort = sort.value;
        applyRepositories(toolbar);
      });
      applyRepositories(toolbar);
    } else if (route().startsWith('snippets') && selects.length >= 2) {
      const [language, source] = selects;
      bound.add(toolbar);
      language.value = filters.snippetLanguage;
      source.value = filters.snippetSource;
      language.addEventListener('change', () => {
        filters.snippetLanguage = language.value;
        applySnippets();
      });
      source.addEventListener('change', () => {
        filters.snippetSource = source.value;
        applySnippets();
      });
      applySnippets();
    } else if (route().startsWith('issues') && selects.length >= 2) {
      const [state, repository] = selects;
      bound.add(toolbar);
      state.value = filters.issueState;
      repository.value = filters.issueRepository;
      state.addEventListener('change', () => {
        filters.issueState = state.value;
        applyIssues();
      });
      repository.addEventListener('change', () => {
        filters.issueRepository = repository.value;
        applyIssues();
      });
      applyIssues();
    }
  };

  new MutationObserver(bind).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', () => setTimeout(bind, 0));
  bind();
})();
