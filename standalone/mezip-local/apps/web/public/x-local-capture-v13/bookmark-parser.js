(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MEZipBookmarkParser = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function clean(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
  function decodeHtml(value) {
    const source = String(value == null ? '' : value);
    if (typeof DOMParser !== 'undefined') {
      const node = new DOMParser().parseFromString(`<textarea>${source}</textarea>`, 'text/html').querySelector('textarea');
      return clean(node ? node.value : source);
    }
    return clean(source.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
  }
  function normalizeUrl(value) {
    try {
      const url = new URL(clean(value));
      if (!/^https?:$/.test(url.protocol)) return '';
      return url.toString();
    } catch { return ''; }
  }
  function addRecord(records, title, url, folder, addDate) {
    const normalized = normalizeUrl(url);
    if (!normalized) return;
    records.push({ title: clean(title) || normalized, url: normalized, folder: clean(folder) || '未分类', addDate: Number.isFinite(Number(addDate)) ? Number(addDate) : null, source: 'Edge 收藏夹' });
  }
  function parseBookmarkHtml(html) {
    const records = [];
    if (typeof DOMParser !== 'undefined') {
      const document = new DOMParser().parseFromString(String(html || ''), 'text/html');
      const walk = (dl, path) => {
        Array.from(dl.children || []).forEach((node) => {
          if (String(node.tagName).toUpperCase() !== 'DT') return;
          const heading = Array.from(node.children || []).find((child) => String(child.tagName).toUpperCase() === 'H3');
          const anchor = Array.from(node.children || []).find((child) => String(child.tagName).toUpperCase() === 'A');
          if (anchor) addRecord(records, anchor.textContent, anchor.getAttribute('href'), path.join(' / '), Number(anchor.getAttribute('add_date')) * 1000);
          if (heading) {
            const childDl = Array.from(node.children || []).find((child) => String(child.tagName).toUpperCase() === 'DL');
            if (childDl) walk(childDl, [...path, clean(heading.textContent)]);
          }
        });
      };
      const rootDl = document.querySelector('DL');
      if (rootDl) walk(rootDl, []);
      if (records.length) return records;
    }
    const anchorPattern = /<A\b([^>]*)>([\s\S]*?)<\/A>/gi;
    let match;
    while ((match = anchorPattern.exec(String(html || '')))) {
      const attrs = match[1] || '';
      const href = attrs.match(/\bHREF\s*=\s*["']([^"']+)["']/i)?.[1] || '';
      const addDate = attrs.match(/\bADD_DATE\s*=\s*["'](\d+)["']/i)?.[1] || '';
      addRecord(records, decodeHtml(match[2].replace(/<[^>]+>/g, '')), decodeHtml(href), '未分类', Number(addDate) * 1000);
    }
    return records;
  }
  function parseBookmarkJson(input) {
    let parsed;
    try { parsed = typeof input === 'string' ? JSON.parse(input) : input; } catch { return []; }
    const records = [];
    const walk = (nodes, path) => {
      if (!Array.isArray(nodes)) return;
      nodes.forEach((node) => {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'url' || node.url) addRecord(records, node.name || node.title, node.url, path.join(' / '), node.date_added ? Number(node.date_added) / 1000 : null);
        if (Array.isArray(node.children)) walk(node.children, node.type === 'folder' ? [...path, clean(node.name)] : path);
      });
    };
    walk(Array.isArray(parsed) ? parsed : (parsed.roots ? Object.values(parsed.roots) : [parsed]), []);
    return records;
  }
  return { normalizeUrl, parseBookmarkHtml, parseBookmarkJson };
}));
