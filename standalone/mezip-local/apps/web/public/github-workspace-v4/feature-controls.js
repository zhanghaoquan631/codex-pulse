(() => {
  const filterState = {
    repositoryVisibility: '全部可见性',
    repositorySort: '最近更新',
    snippetLanguage: '全部语言',
    snippetSource: '全部来源',
    issueState: 'All',
    issueRepository: '全部仓库',
  };

  const visible = (node, shouldShow) => {
    node.hidden = !shouldShow;
    node.style.display = shouldShow ? '' : 'none';
  };

  const applyRepositoryFilters = (toolbar) => {
    const table = toolbar.parentElement?.querySelector('tbody');
    if (!table) return;
    const rows = [...table.querySelectorAll('tr')];
    rows.forEach((row) => {
      const text = row.textContent || '';
      const visibility = filterState.repositoryVisibility;
      visible(
        row,
        visibility === '全部可见性' ||
          (visibility === '公开' && text.includes('PUBLIC')) ||
          (visibility === '私有' && text.includes('PRIVATE')),
      );
    });
    const visibleRows = rows.filter((row) => !row.hidden);
    visibleRows.sort((left, right) => {
      const leftText = left.textContent || '';
      const rightText = right.textContent || '';
      if (filterState.repositorySort === 'Name') return leftText.localeCompare(rightText);
      if (filterState.repositorySort === 'Stars') {
        const stars = (value) => Number(value.match(/★\s*(\d+)/u)?.[1] || 0);
        return stars(rightText) - stars(leftText);
      }
      return 0;
    });
    visibleRows.forEach((row) => table.append(row));
  };

  const bindRepositoryControls = (toolbar) => {
    const selects = [...toolbar.querySelectorAll('select')];
    const visibility = selects[0];
    const sort = selects[1];
    if (!visibility || !sort) return;
    if (!visibility.dataset.v4Bound) {
      visibility.dataset.v4Bound = 'true';
      visibility.addEventListener('change', () => {
        filterState.repositoryVisibility = visibility.value;
        applyRepositoryFilters(toolbar);
      });
    }
    if (!sort.dataset.v4Bound) {
      sort.dataset.v4Bound = 'true';
      sort.addEventListener('change', () => {
        filterState.repositorySort = sort.value;
        applyRepositoryFilters(toolbar);
      });
    }
    visibility.value = filterState.repositoryVisibility;
    sort.value = filterState.repositorySort;
    applyRepositoryFilters(toolbar);
  };

  const applySnippetFilters = () => {
    document.querySelectorAll('.snippet-card').forEach((card) => {
      const text = card.textContent || '';
      visible(
        card,
        (filterState.snippetLanguage === '全部语言' || text.includes(filterState.snippetLanguage)) &&
          (filterState.snippetSource === '全部来源' || text.includes(filterState.snippetSource)),
      );
    });
  };

  const bindSnippetControls = (toolbar) => {
    const selects = [...toolbar.querySelectorAll('select')];
    const language = selects[0];
    const source = selects[1];
    if (!language || !source) return;
    if (!language.dataset.v4Bound) {
      language.dataset.v4Bound = 'true';
      language.addEventListener('change', () => {
        filterState.snippetLanguage = language.value;
        applySnippetFilters();
      });
    }
    if (!source.dataset.v4Bound) {
      source.dataset.v4Bound = 'true';
      source.addEventListener('change', () => {
        filterState.snippetSource = source.value;
        applySnippetFilters();
      });
    }
    language.value = filterState.snippetLanguage;
    source.value = filterState.snippetSource;
    applySnippetFilters();
  };

  const applyIssueFilters = () => {
    document.querySelectorAll('.issue-row').forEach((row) => {
      const text = row.textContent || '';
      const state = filterState.issueState === 'Open' ? 'OPEN' : filterState.issueState === 'Closed' ? 'CLOSED' : '';
      visible(
        row,
        (filterState.issueState === 'All' || filterState.issueState === 'In Progress' || text.includes(state)) &&
          (filterState.issueRepository === '全部仓库' || text.includes(filterState.issueRepository)),
      );
    });
  };

  const bindIssueControls = (toolbar) => {
    const selects = [...toolbar.querySelectorAll('select')];
    const state = selects[0];
    const repository = selects[1];
    if (!state || !repository) return;
    if (!state.dataset.v4Bound) {
      state.dataset.v4Bound = 'true';
      state.addEventListener('change', () => {
        filterState.issueState = state.value;
        applyIssueFilters();
      });
    }
    if (!repository.dataset.v4Bound) {
      repository.dataset.v4Bound = 'true';
      repository.addEventListener('change', () => {
        filterState.issueRepository = repository.value;
        applyIssueFilters();
      });
    }
    state.value = filterState.issueState;
    repository.value = filterState.issueRepository;
    applyIssueFilters();
  };

  const bind = () => {
    const view = document.querySelector('#workspace-view');
    if (!view) return;
    const toolbar = view.querySelector('.toolbar');
    if (!toolbar) return;
    const selects = [...toolbar.querySelectorAll('select')];
    const route = location.hash.replace(/^#\/?/u, '');
    if (route.startsWith('repositories') && selects.length >= 2) {
      bindRepositoryControls(toolbar);
    } else if (route.startsWith('snippets') && selects.length >= 2) {
      bindSnippetControls(toolbar);
    } else if (route.startsWith('issues') && selects.length >= 2) {
      bindIssueControls(toolbar);
    }
  };

  new MutationObserver(bind).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', bind);
  bind();
})();
