export class LookupError extends Error {
  constructor(message, status = 400, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
const fail = message => { throw new LookupError(message); };
const text = (value, max = 20000) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu, '').trim().slice(0, max) : '';
const strings = (value, max = 40) => Array.isArray(value) ? value.filter(item => typeof item === 'string').slice(0, max).map(item => text(item, 300)).filter(Boolean) : [];
const cleanDescription = value => text(typeof value === 'object' && value ? value.value : value).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
function safeUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
}
export function normalizeIsbn(value, { optional = false } = {}) {
  if ((value === undefined || value === null || value === '') && optional) return '';
  if (typeof value !== 'string' || value.length > 40) fail('ISBN 格式不正确，请输入有效的 ISBN-10 或 ISBN-13。');
  const isbn = value.replace(/^ISBN(?:-1[03])?:?\s*/i, '').replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const sum = [...isbn].reduce((n, digit, index) => n + (digit === 'X' ? 10 : Number(digit)) * (10 - index), 0);
    if (sum % 11 === 0) return isbn;
  }
  if (/^(978|979)\d{10}$/.test(isbn) && [...isbn].reduce((n, digit, index) => n + Number(digit) * (index % 2 ? 3 : 1), 0) % 10 === 0) return isbn;
  fail('ISBN 校验不通过，请检查数字。');
}
function queryFrom(value) {
  if (typeof value !== 'string' || value.length > 200 || /[\u0000-\u001F\u007F]/u.test(value)) fail('请输入 2 至 200 个字符的书名或有效 ISBN。');
  const query = value.trim();
  if (query.length < 2) fail('请输入 2 至 200 个字符的书名或有效 ISBN。');
  const numeric = query.replace(/^ISBN(?:-1[03])?:?\s*/i, '').replace(/[\s-]/g, '');
  const isbn = /^ISBN/i.test(query) || /^[\dXx]+$/.test(numeric) ? normalizeIsbn(query) : '';
  return { query: isbn || query, isbn };
}


export function createLookup({ requestJson, googleBooksApiKey = '', debug = false }) {
  const TTL_MS = 15 * 60 * 1000;
  const MAX_CACHE = 100;
  const cache = new Map(), candidates = new Map(), pending = new Map();
  let openLibraryQueue = Promise.resolve(), openLibraryLast = 0;
function openLibraryJson(url) {
  const result = openLibraryQueue.then(async () => {
    const delay = Math.max(0, 1050 - (Date.now() - openLibraryLast));
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    openLibraryLast = Date.now();
    return requestJson(url);
  });
  openLibraryQueue = result.catch(() => {});
  return result;
}
function cached(key, operation) {
  const item = cache.get(key);
  if (item && item.expires > Date.now()) return Promise.resolve(structuredClone(item.value));
  if (pending.has(key)) return pending.get(key).then(structuredClone);
  const promise = operation().then(value => {
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(key, { value, expires: Date.now() + TTL_MS });
    return value;
  }).finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise.then(structuredClone);
}
const providerState = (source, available, count, message = '') => ({ source, available, count, message, ...(source === 'google' ? { configured: !!googleBooksApiKey } : {}) });
function warning(source, error) {
  return `${source === 'google' ? 'Google Books' : 'Open Library'} 暂时无法查询，已显示其他可用来源的查询结果。`;
}
function selectedIsbn(values) {
  for (const value of [...strings(values, 250)].sort((a, b) => b.length - a.length)) { try { return normalizeIsbn(value); } catch {} }
  return '';
}
function openResult(doc, isbn = '') {
  const id = text(doc.key).match(/^\/works\/(OL\d+W)$/)?.[1];
  if (!id || !text(doc.title)) return null;
  const edition = doc.editions?.docs?.[0];
  const coverId = edition?.cover_i || doc.cover_i;
  const editionId = edition?.key?.match(/^\/books\/(OL\d+M)$/)?.[1];
  // Aggregate work ISBNs/publishers can refer to different translations. Use
  // the matching edition fields, or leave those optional fields empty.
  return {
    id, source: 'openlibrary', title: text(edition?.title, 300) || text(doc.title, 300), author: strings(doc.author_name, 1).join('、'),
    isbn: isbn || selectedIsbn(edition?.isbn), publisher: strings(edition?.publisher, 1).join(''),
    publishedDate: strings(edition?.publish_date, 1).join('') || String(doc.first_publish_year || ''),
    coverUrl: Number.isSafeInteger(coverId) && coverId > 0 ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false` : '',
    description: cleanDescription(edition?.description), subjects: strings(doc.subject), sourceUrl: editionId ? `https://openlibrary.org/books/${editionId}` : `https://openlibrary.org/works/${id}`,
    ...(editionId ? { editionId } : {}),
  };
}
function googleResult(doc) {
  const info = doc.volumeInfo || {};
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(doc.id || '') || !text(info.title)) return null;
  return {
    id: doc.id, source: 'google', title: text(info.title, 300), author: text(strings(info.authors, 10).join('、'), 300),
    isbn: selectedIsbn((info.industryIdentifiers || []).filter(item => ['ISBN_13', 'ISBN_10'].includes(item.type)).map(item => item.identifier)),
    publisher: text(info.publisher, 300), publishedDate: text(info.publishedDate, 100),
    coverUrl: safeUrl(info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail)?.replace(/^http:/, 'https:') || '',
    description: cleanDescription(info.description), subjects: strings(info.categories),
    sourceUrl: safeUrl(info.canonicalVolumeLink || info.infoLink) || `https://books.google.com/books?id=${encodeURIComponent(doc.id)}`,
  };
}
async function openSearch(query, isbn) {
  const url = new URL('https://openlibrary.org/search.json');
  if (isbn) url.searchParams.set('q', `isbn:${isbn}`);
  else url.searchParams.set('title', query);
  url.searchParams.set('limit', '8');
  if (/[\u3400-\u9FFF]/u.test(query)) url.searchParams.set('lang', 'zh');
  url.searchParams.set('fields', 'key,title,author_name,cover_i,first_publish_year,subject,editions,editions.key,editions.title,editions.isbn,editions.publisher,editions.publish_date,editions.description,editions.cover_i');
  const results = [], warnings = [];
  // Keep the general search as well. Mainland editions often carry a Chinese
  // description; displaying them first does not exclude other editions.
  if (!isbn && /[\u3400-\u9FFF]/u.test(query)) {
    const preferred = new URL(url);
    preferred.searchParams.delete('title');
    preferred.searchParams.set('q', `title:"${query.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}" AND language:chi AND isbn:9787*`);
    try {
      const data = await openLibraryJson(preferred);
      if (!Array.isArray(data.docs)) throw new Error('Invalid Open Library results');
      results.push(...data.docs.map(doc => openResult(doc)).filter(Boolean));
    } catch { warnings.push('部分版本资料暂时无法查询，已显示可用结果。'); }
  }
  try {
    const data = await openLibraryJson(url);
    if (!Array.isArray(data.docs)) throw new Error('Invalid Open Library results');
    results.push(...data.docs.map(doc => openResult(doc, isbn)).filter(Boolean));
  } catch (error) {
    if (debug) console.error('Open Library search error:', error.code || error.message, error.upstreamStatus || '');
    if (!results.length) throw error;
    warnings.push('部分版本资料暂时无法查询，已显示可用结果。');
  }
  const unique = new Map(results.map(item => [`${item.id}:${item.editionId || ''}`, item]));
  return { results: [...unique.values()], warnings };
}
async function googleSearch(query, isbn) {
  const url = new URL('https://www.googleapis.com/books/v1/volumes');
  url.searchParams.set('q', isbn ? `isbn:${isbn}` : `intitle:${query}`);
  url.searchParams.set('maxResults', '8');
  url.searchParams.set('printType', 'books');
  if (googleBooksApiKey) url.searchParams.set('key', googleBooksApiKey);
  const data = await requestJson(url);
  if (data.error || (data.items && !Array.isArray(data.items))) throw new Error('Invalid Google Books results');
  return (data.items || []).map(googleResult).filter(Boolean);
}
async function lookupBooks(value) {
  const { query, isbn } = queryFrom(value);
  return cached(`search:${query.toLocaleLowerCase()}`, async () => {
    const responses = await Promise.allSettled([openSearch(query, isbn), googleBooksApiKey ? googleSearch(query, isbn) : Promise.resolve(null)]);
    const results = [], warnings = [], providers = [];
    for (let index = 0; index < responses.length; index++) {
      const source = index === 0 ? 'openlibrary' : 'google';
      const response = responses[index];
      if (source === 'google' && !googleBooksApiKey) {
        providers.push(providerState(source, false, 0, '未启用'));
        continue;
      }
      if (response.status === 'fulfilled') {
        const books = source === 'openlibrary' ? response.value.results : response.value;
        if (source === 'openlibrary') warnings.push(...response.value.warnings);
        results.push(...books); providers.push(providerState(source, true, books.length));
        for (const item of books) {
          if (candidates.size >= MAX_CACHE * 16) candidates.delete(candidates.keys().next().value);
          candidates.set(`${source}:${item.id}:${item.editionId || ''}`, { value: item, expires: Date.now() + TTL_MS });
        }
      } else {
        const message = warning(source, response.reason); warnings.push(message); providers.push(providerState(source, false, 0, message));
      }
    }
    if (!providers.some(item => item.available)) throw new LookupError('暂时无法连接图书资料库，请检查网络或代理后重试。', 503, { query, results: [], warnings, providers });
    return { query, results, warnings, providers };
  });
}
async function lookupDetails(source, value, editionId) {
  if (!['openlibrary', 'google'].includes(source) || typeof value !== 'string' || (source === 'openlibrary' ? !/^OL\d+W$/.test(value) : !/^[A-Za-z0-9_-]{1,100}$/.test(value))) fail('图书来源或 ID 不正确。');
  if (editionId !== undefined && (source !== 'openlibrary' || typeof editionId !== 'string' || !/^OL\d+M$/.test(editionId))) fail('图书版本 ID 不正确。');
  if (source === 'google' && !googleBooksApiKey) throw new LookupError('Google Books 尚未启用，请使用其他图书来源。', 503);
  return cached(`details:${source}:${value}:${editionId || ''}`, async () => {
    const candidate = candidates.get(`${source}:${value}:${editionId || ''}`);
    let result = candidate && candidate.expires > Date.now() ? { ...candidate.value } : null;
    const warnings = [];
    try {
      if (source === 'google') {
        const url = new URL(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(value)}`);
        if (googleBooksApiKey) url.searchParams.set('key', googleBooksApiKey);
        result = googleResult(await requestJson(url));
      } else {
        const work = await openLibraryJson(new URL(`https://openlibrary.org/works/${value}.json`));
        result ||= { id: value, source, title: text(work.title, 300), author: '', isbn: '', publisher: '', publishedDate: '', coverUrl: '', sourceUrl: `https://openlibrary.org/works/${value}` };
        result.description ||= cleanDescription(work.description);
        result.subjects = strings(work.subjects).length ? strings(work.subjects) : result.subjects || [];
        if (!result.author && /^\/authors\/OL\d+A$/.test(work.authors?.[0]?.author?.key || '')) {
          try { const author = await openLibraryJson(new URL(`https://openlibrary.org${work.authors[0].author.key}.json`)); result.author = text(author.name, 300); }
          catch { warnings.push('作者资料暂时无法查询，可手动补充。'); }
        }
        if (editionId) result.editionId = editionId;
        if (result.editionId) {
          try {
            const edition = await openLibraryJson(new URL(`https://openlibrary.org/books/${result.editionId}.json`));
            if (!Array.isArray(edition.works) || !edition.works.some(item => item?.key === `/works/${value}`)) throw new LookupError('所选版本与书籍不匹配，请重新搜索。');
            result.title = text(edition.title, 300) || result.title;
            result.sourceUrl = `https://openlibrary.org/books/${result.editionId}`;
            result.isbn ||= selectedIsbn([...(edition.isbn_13 || []), ...(edition.isbn_10 || [])]);
            result.publisher = strings(edition.publishers, 1).join('') || result.publisher;
            result.publishedDate = text(edition.publish_date, 100) || result.publishedDate;
            result.description = cleanDescription(edition.description) || result.description;
            if (Number.isSafeInteger(edition.covers?.[0]) && edition.covers[0] > 0) result.coverUrl = `https://covers.openlibrary.org/b/id/${edition.covers[0]}-L.jpg?default=false`;
          } catch (error) { if (error instanceof LookupError) throw error; warnings.push('版本资料暂时无法查询，已保留搜索结果。'); }
        }
      }
      if (!result) throw new Error('No book returned');
    } catch (error) {
      if (error instanceof LookupError) throw error;
      if (!result) throw new LookupError('暂时无法查询这本书的详细资料。', error.upstreamStatus === 404 ? 404 : 503, { warnings: [warning(source, error)] });
      warnings.push('详细资料暂时无法查询，已保留搜索结果中的资料。');
    }
    return { result, warnings };
  });
}

  return { lookupBooks, lookupDetails, openLibraryJson };
}
