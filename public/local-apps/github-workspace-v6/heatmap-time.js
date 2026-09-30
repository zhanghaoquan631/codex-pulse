(() => {
  const parseCell = (cell) => {
    const raw = cell.getAttribute('title') || '';
    const match = /^(\d{4}-\d{2}-\d{2})\s*·\s*(\d+)\s*次$/u.exec(raw);
    return match ? { date: match[1], count: match[2] } : null;
  };

  const enhance = () => {
    document.querySelectorAll('.v5-heatmap').forEach((map) => {
      if (map.dataset.v6TimeEnhanced === 'true') return;
      const cells = [...map.querySelectorAll('span[title]')]
        .map((cell) => ({ cell, value: parseCell(cell) }))
        .filter((item) => item.value !== null);
      if (!cells.length) return;
      map.dataset.v6TimeEnhanced = 'true';
      cells.forEach(({ cell, value }) => {
        cell.dataset.date = value.date;
        cell.dataset.count = value.count;
        cell.tabIndex = 0;
        cell.setAttribute('aria-label', `${value.date}，${value.count} 次贡献`);
      });
      const first = cells[0].value.date;
      const last = cells[cells.length - 1].value.date;
      const axis = document.createElement('div');
      axis.className = 'v6-heatmap-axis';
      axis.innerHTML = `<span>起始 ${first}</span><span>每格 = 当天贡献次数</span><span>截至 ${last}</span>`;
      map.before(axis);
      const tooltip = document.createElement('div');
      tooltip.className = 'v6-heatmap-tooltip';
      tooltip.setAttribute('role', 'status');
      tooltip.hidden = true;
      document.body.append(tooltip);
      const hide = () => {
        tooltip.hidden = true;
      };
      const show = (event) => {
        const cell = event.currentTarget;
        tooltip.textContent = `${cell.dataset.date} · ${cell.dataset.count} 次贡献`;
        const rect = cell.getBoundingClientRect();
        tooltip.style.left = `${Math.max(8, rect.left + rect.width / 2 - 70)}px`;
        tooltip.style.top = `${Math.max(8, rect.top - 38)}px`;
        tooltip.hidden = false;
      };
      cells.forEach(({ cell }) => {
        cell.addEventListener('mouseenter', show);
        cell.addEventListener('focus', show);
        cell.addEventListener('mouseleave', hide);
        cell.addEventListener('blur', hide);
      });
    });
  };

  new MutationObserver(enhance).observe(document.body, {
    childList: true,
    subtree: true,
  });
  enhance();
})();
