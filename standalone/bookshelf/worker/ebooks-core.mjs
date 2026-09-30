import { LookupError, normalizeIsbn } from './lookup-core.mjs';

const KINDS = new Set(['download', 'read', 'borrow', 'preview', 'buy']);
const clean = (value, max = 300) => typeof value === 'string' ? value.replace(/[\u0000-\u001F\u007F]/gu, '').trim().slice(0, max) : '';
const list = value => Array.isArray(value) ? value : value ? [value] : [];
const names = value => list(value).map(item => clean(typeof item === 'string' ? item : item?.name)).filter(Boolean);
const norm = value => clean(value).normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const baseTitle = value => norm(clean(value).split(/[:：\n]/u)[0].replace(/\s*[（(][^()（）]*[）)]\s*$/u, ''));
// Catalog identifiers and name aliases verified against Gutenberg's book pages.
// The identifiers only select a metadata request: download URLs still come
// from that live response, with title, author, language and copyright checked.
const CHINESE_CLASSICS = [
  { id: 24264, titles: ['红楼梦', '紅樓夢'], authors: ['曹雪芹', 'Cao, Xueqin', 'Xueqin Cao'] },
  { id: 23962, titles: ['西游记', '西遊記'], authors: ['吴承恩', '吳承恩', "Wu, Cheng'en", "Cheng'en Wu"] },
  { id: 23950, titles: ['三国演义', '三國演義', '三国志演义', '三國志演義'], authors: ['罗贯中', '羅貫中', 'Luo, Guanzhong', 'Guanzhong Luo'] },
  { id: 23863, titles: ['水浒传', '水滸傳'], authors: ['施耐庵', "Shi, Nai'an", "Nai'an Shi"] },
];
const classicFor = title => CHINESE_CLASSICS.find(book => book.titles.some(alias => baseTitle(alias) === baseTitle(title)));
function titleMatches(requested, actual) {
  const a = norm(requested), b = norm(actual);
  return !!a && (a === b || (baseTitle(requested).length >= 2 && baseTitle(requested) === baseTitle(actual)));
}
function authorMatches(requested, actual) {
  if (!requested) return true;
  const authors = names(actual);
  return requested.split(/[、;；]/u).some(part => authors.some(author => {
    if (norm(part) === norm(author)) return true;
    const tokens = clean(part).toLocaleLowerCase().split(/[\s,.]+/u).filter(token => token.length > 1);
    return tokens.length > 1 && tokens.every(token => norm(author).includes(norm(token)));
  }));
}
function trustedUrl(value, hosts) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && hosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)) ? url.href : '';
  } catch { return ''; }
}
export function normalizeEbookLinks(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 12) throw new LookupError('电子版入口最多可保存 12 个。');
  const result = [], seen = new Set();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !KINDS.has(item.kind)) throw new LookupError('电子版入口格式不正确。');
    if (typeof item.url !== 'string' || item.url.length > 2048 || /[\u0000-\u001F\u007F]/u.test(item.url)) throw new LookupError('电子版地址格式不正确。');
    let url;
    try {
      url = new URL(item.url);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error();
    } catch { throw new LookupError('电子版地址须为 http(s) 地址。'); }
    for (const [field, max] of [['label', 160], ['source', 100]]) if (typeof item[field] !== 'string' || item[field].length > max || /[\u0000-\u001F\u007F]/u.test(item[field])) throw new LookupError('电子版入口名称或来源格式不正确。');
    const link = { url: url.href, label: clean(item.label, 160), kind: item.kind, source: clean(item.source, 100) };
    if (!link.label || !link.source) throw new LookupError('请填写电子版入口名称和来源。');
    for (const [key, max] of [['format', 30], ['title', 300], ['author', 300], ['language', 100]]) {
      if (item[key] !== undefined && (typeof item[key] !== 'string' || item[key].length > max || /[\u0000-\u001F\u007F]/u.test(item[key]))) throw new LookupError('电子版入口资料格式不正确。');
      if (clean(item[key], max)) link[key] = clean(item[key], max);
    }
    const key = `${link.kind}:${link.url}`;
    if (!seen.has(key)) { seen.add(key); result.push(link); }
  }
  return result;
}
export function createEbookLookup({ requestJson, openLibraryJson = requestJson, googleBooksApiKey = '' }) {
  const cache = new Map(), pending = new Map();
  const TTL = 15 * 60 * 1000;
  async function sourceRequest(url, request = requestJson) {
    try { return await request(url); }
    catch (error) {
      if (error.upstreamStatus && error.upstreamStatus < 500) throw error;
      return request(url);
    }
  }
  function link(url, label, kind, source, book, format) {
    return { url, label, kind, source, ...(format ? { format } : {}), title: clean(book.title), author: names(book.authors).join('、').slice(0, 300), ...(book.language ? { language: clean(book.language, 100) } : {}) };
  }
  async function gutenberg(query) {
    const classic = classicFor(query.title);
    if (classic && query.author && !classic.authors.some(alias => authorMatches(query.author, [alias]))) return [];
    const url = new URL(classic ? `https://gutendex.com/books/${classic.id}/` : 'https://gutendex.com/books/');
    if (!classic) { url.searchParams.set('search', query.title); url.searchParams.set('copyright', 'false'); }
    const data = await sourceRequest(url);
    const books = classic ? [data] : data.results;
    if (!Array.isArray(books)) throw new Error('Invalid Gutenberg catalog response');
    const links = [];
    for (const book of books) {
      const titleMatch = classic ? classic.titles.some(alias => titleMatches(alias, book.title)) && book.id === classic.id : titleMatches(query.title, book.title);
      const authorMatch = classic ? classic.authors.some(alias => authorMatches(alias, book.authors)) && list(book.languages).some(language => ['zh', 'chi'].includes(language)) : authorMatches(query.author, book.authors);
      if (book.copyright !== false || book.media_type !== 'Text' || !titleMatch || !authorMatch) continue;
      const record = { title: book.title, authors: book.authors, language: list(book.languages).slice(0, 3).join(' / ') };
      for (const [mime, format, label, kind] of [['application/epub+zip', 'EPUB', '下载 EPUB', 'download'], ['text/html', 'HTML', '在线阅读全文', 'read'], ['text/plain; charset=utf-8', 'TXT', '下载 TXT', 'download']]) {
        const entry = Object.entries(book.formats || {}).find(([key]) => key === mime || (mime === 'text/html' && key.startsWith('text/html')));
        const target = trustedUrl(entry?.[1], ['gutenberg.org']);
        if (target) links.push(link(target, label, kind, 'Project Gutenberg', record, format));
      }
      if (links.length >= 6) break;
    }
    return links;
  }
  async function archivePublic(identifier, requested) {
    if (!/^[a-zA-Z0-9_.-]{1,150}$/.test(identifier)) return [];
    const data = await requestJson(new URL(`https://archive.org/metadata/${encodeURIComponent(identifier)}`));
    const meta = data.metadata || {};
    // Never construct a download for loan-only, dark, or restricted scans.
    if (data.is_dark || data.is_restricted || ['true', '1'].includes(String(meta['access-restricted-item']).toLowerCase()) || list(meta.collection).some(value => ['printdisabled', 'inlibrary', 'internetarchivebooks'].includes(value))) return [];
    if (!titleMatches(requested.title, list(meta.title)[0] || requested.title) || !authorMatches(requested.author, meta.creator)) return [];
    const book = { title: list(meta.title)[0] || requested.title, authors: meta.creator, language: list(meta.language).slice(0, 3).join(' / ') };
    const files = Array.isArray(data.files) ? data.files : [];
    return ['EPUB', 'PDF'].flatMap(format => {
      const file = files.find(item => !item.private && clean(item.name, 500).toLowerCase().endsWith(`.${format.toLowerCase()}`) && !/encrypted|acs/i.test(item.format || '') && Number(item.size || 0) > 0);
      if (!file) return [];
      const url = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(file.name)}`;
      return [link(url, `下载 ${format}`, 'download', 'Internet Archive', book, format)];
    });
  }
  async function openLibrary(query) {
    const url = new URL('https://openlibrary.org/search.json');
    if (query.isbn) url.searchParams.set('q', `isbn:${query.isbn}`);
    else { url.searchParams.set('title', query.title); if (query.author) url.searchParams.set('author', query.author); }
    url.searchParams.set('limit', '6');
    url.searchParams.set('fields', 'key,title,author_name,ebook_access,ia,lending_edition_s,editions,editions.key,editions.title,editions.ebook_access,editions.language');
    const data = await sourceRequest(url, openLibraryJson);
    if (!Array.isArray(data.docs)) throw new Error('Invalid Open Library ebook response');
    const links = [], archive = [], warnings = [];
    for (const doc of data.docs) {
      const edition = doc.editions?.docs?.[0];
      const title = edition?.title || doc.title;
      if (!query.isbn && (!titleMatches(query.title, title) || !authorMatches(query.author, doc.author_name))) continue;
      const access = edition?.ebook_access || doc.ebook_access;
      const editionId = edition?.key?.match(/^\/books\/(OL\d+M)$/u)?.[1] || clean(doc.lending_edition_s).match(/^(OL\d+M)$/u)?.[1];
      const workId = clean(doc.key).match(/^(?:\/works\/)?(OL\d+W)$/u)?.[1];
      if (!workId) continue;
      const record = { title, authors: doc.author_name, language: list(edition?.language).slice(0, 3).join(' / ') };
      const target = editionId ? `https://openlibrary.org/books/${editionId}` : `https://openlibrary.org/works/${workId}`;
      if (access === 'public') {
        links.push(link(target, '在线阅读全文', 'read', 'Open Library', record));
        const ia = list(doc.ia).find(value => /^[a-zA-Z0-9_.-]{1,150}$/u.test(value));
        if (ia && archive.length < 2) archive.push({ ia, record });
      } else if (access === 'borrowable') links.push(link(target, '前往借阅（需登录）', 'borrow', 'Open Library', record));
      else if (doc.ebook_access === 'borrowable') links.push(link(`https://openlibrary.org/works/${workId}`, '查看可借阅的其他版本', 'borrow', 'Open Library', { ...record, language: '' }));
      else if (access === 'printdisabled') warnings.push('此书部分扫描版本仅对符合条件的读者开放，未列为完整电子版。');
    }
    for (const item of archive) {
      try { links.push(...await archivePublic(item.ia, { title: item.record.title, author: item.record.authors?.[0] || '' })); }
      catch { warnings.push('部分公开文件的下载状态暂时无法核对，可使用在线阅读入口。'); }
    }
    return { links, warnings };
  }
  async function google(query) {
    const url = new URL('https://www.googleapis.com/books/v1/volumes');
    url.searchParams.set('q', query.isbn ? `isbn:${query.isbn}` : `intitle:${query.title}${query.author ? ` inauthor:${query.author}` : ''}`);
    url.searchParams.set('maxResults', '6'); url.searchParams.set('printType', 'books'); url.searchParams.set('key', googleBooksApiKey);
    const data = await sourceRequest(url);
    if (data.error || (data.items && !Array.isArray(data.items))) throw new Error('Invalid Google Books ebook response');
    const links = [];
    for (const item of data.items || []) {
      const info = item.volumeInfo || {}, access = item.accessInfo || {}, sale = item.saleInfo || {};
      if (!query.isbn && (!titleMatches(query.title, info.title) || !authorMatches(query.author, info.authors))) continue;
      const book = { title: info.title, authors: info.authors, language: info.language };
      const reader = trustedUrl(access.webReaderLink || info.previewLink, ['google.com', 'googleusercontent.com']);
      if (reader && ['ALL_PAGES', 'PARTIAL'].includes(access.viewability)) links.push(link(reader, access.viewability === 'ALL_PAGES' ? '在线阅读全文' : '阅读试读', access.viewability === 'ALL_PAGES' ? 'read' : 'preview', 'Google Books', book));
      const buy = trustedUrl(sale.buyLink, ['google.com']);
      if (buy && sale.isEbook && sale.saleability === 'FOR_SALE') links.push(link(buy, '购买电子版', 'buy', 'Google Books', book));
      if (access.publicDomain && access.viewability === 'ALL_PAGES') for (const format of ['epub', 'pdf']) {
        const file = trustedUrl(access[format]?.downloadLink, ['google.com', 'googleusercontent.com']);
        if (access[format]?.isAvailable && file) links.push(link(file, `下载 ${format.toUpperCase()}`, 'download', 'Google Books', book, format.toUpperCase()));
      }
    }
    return links;
  }
  async function lookupEbooks(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LookupError('请输入书名或 ISBN。');
    for (const field of ['title', 'author', 'isbn']) if (value[field] !== undefined && (typeof value[field] !== 'string' || value[field].length > (field === 'isbn' ? 40 : 300) || /[\u0000-\u001F\u007F]/u.test(value[field]))) throw new LookupError('电子书查询资料格式不正确。');
    const query = { title: clean(value.title), author: clean(value.author), isbn: normalizeIsbn(value.isbn, { optional: true }) };
    if (query.title.length < 2 && !query.isbn) throw new LookupError('请输入至少 2 个字符的书名或有效 ISBN。');
    const key = JSON.stringify(query), cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return structuredClone(cached.value);
    if (pending.has(key)) return pending.get(key).then(structuredClone);
    const operation = (async () => {
      const jobs = [['Open Library', () => openLibrary(query)]];
      if (query.title) jobs.push(['Project Gutenberg', () => gutenberg(query)]);
      if (googleBooksApiKey) jobs.push(['Google Books', () => google(query)]);
      const responses = await Promise.allSettled(jobs.map(([, run]) => run()));
      const links = [], warnings = []; let available = 0;
      responses.forEach((response, index) => {
        if (response.status === 'fulfilled') { available++; const result = response.value; links.push(...(Array.isArray(result) ? result : result.links)); warnings.push(...(result.warnings || [])); }
        else warnings.push(`${jobs[index][0]} 暂时无法查询，请稍后重试。`);
      });
      if (!available) throw new LookupError('暂时无法连接电子书来源，请稍后重试。', 503, { links: [], warnings });
      const unique = new Map();
      links.forEach(item => unique.set(`${item.kind}:${item.url}`, item));
      const value = { links: normalizeEbookLinks([...unique.values()].slice(0, 12)), warnings: [...new Set(warnings)] };
      if (!value.links.length) value.warnings.push('暂未找到可确认的对应电子版；你可以上传自己的 PDF、EPUB 或 TXT。');
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(key, { expires: Date.now() + (warnings.length ? 30000 : TTL), value }); return value;
    })().finally(() => pending.delete(key));
    pending.set(key, operation); return operation.then(structuredClone);
  }
  return { lookupEbooks };
}
