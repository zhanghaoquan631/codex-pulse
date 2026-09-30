import {normalizeIsbn} from './lookup-core.mjs';
import {normalizeEbookLinks} from './ebooks-core.mjs';
export class RequestError extends Error {constructor(message,status=400){super(message);this.status=status}}
export const fail=(message,status)=>{throw new RequestError(message,status)};
const DEFAULT_SETTINGS = {
  title: '我的书架', welcome: '欢迎来到我的书架', tagline: '记录阅读，收藏喜欢的书。',
  defaultTheme: 'light', showAuthors: true, showGallery: true,
};

const object = value => value && typeof value === 'object' && !Array.isArray(value);
function string(value, field, { required = false, max = 2000, fallback = '' } = {}) {
  if (value === undefined || value === null) { if (required) fail(`${field}不能为空。`); return fallback; }
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(value)) fail(`${field}格式不正确。`);
  const cleaned = value.trim();
  if (required && !cleaned) fail(`${field}不能为空。`);
  return cleaned;
}
function id(value, field = 'ID', nullable = false) {
  if ((value === null || value === undefined || value === '') && nullable) return null;
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) fail(`${field}格式不正确。`);
  return value;
}
function bool(value, fallback, field) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') fail(`${field}必须为布尔值。`);
  return value;
}
function coverUrl(value) {
  const url = string(value, '图片地址', { max: 2048 });
  if (!url) return '';
  if (/^\/(assets|uploads\/covers)\/[a-zA-Z0-9_./%() -]+$/.test(url) && !url.includes('..') && !url.includes('//')) return url;
  try {
    const parsed = new URL(url);
    if (['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password) return parsed.href;
  } catch {}
  fail('图片地址须为上传图片、本地 assets 地址或 http(s) 地址。');
}
function privateUrl(value) {
  const url = string(value, '电子书地址', { max: 200 });
  if (!url || /^\/private-files\/[a-f0-9-]{36}\.(pdf|epub|txt)$/.test(url)) return url;
  fail('电子书地址须来自文件上传。');
}
function sourceUrl(value) {
  const url = string(value, '资料来源地址', { max: 2048 });
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password) return parsed.href;
  } catch {}
  fail('资料来源地址须为 http(s) 地址。');
}
function settingsFrom(value, previous = DEFAULT_SETTINGS) {
  if (!object(value)) fail('站点设置格式不正确。');
  const theme = value.defaultTheme ?? previous.defaultTheme;
  if (!['light', 'dark', 'system'].includes(theme)) fail('主题设置格式不正确。');
  return {
    title: string(value.title ?? previous.title, '站点名称', { required: true, max: 200 }),
    welcome: string(value.welcome ?? previous.welcome, '欢迎文案', { max: 500 }),
    tagline: string(value.tagline ?? previous.tagline, '站点介绍', { max: 1000 }),
    defaultTheme: theme, showAuthors: bool(value.showAuthors, previous.showAuthors, '显示作者'),
    showGallery: bool(value.showGallery, previous.showGallery, '显示图集'),
  };
}
function categoryFrom(value, recordId) {
  if (!object(value)) fail('分类格式不正确。');
  return { id: id(recordId ?? value.id), name: string(value.name, '分类名称', { required: true, max: 100 }), icon: string(value.icon, '分类图标', { max: 100, fallback: '📚' }) };
}
function reference(value, field, known) {
  const result = id(value, field, true);
  if (result && !known.has(result)) fail(`${field}不存在。`);
  return result;
}
function timestamp(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string' || value.length > 50 || !Number.isFinite(Date.parse(value))) fail('日期格式不正确。');
  return new Date(value).toISOString();
}
function bookFrom(value, recordId, categories, previous) {
  if (!object(value)) fail('书籍格式不正确。');
  const combined = { ...(previous || {}), ...value };
  const status = combined.status ?? 'want';
  if (!['want', 'reading', 'finished'].includes(status)) fail('阅读状态格式不正确。');
  const rating = combined.rating ?? 0;
  if (typeof rating !== 'number' || !Number.isFinite(rating) || rating < 0 || rating > 5) fail('评分须为 0 至 5。');
  const now = new Date().toISOString();
  return {
    id: id(recordId ?? combined.id), title: string(combined.title, '书名', { required: true, max: 300 }),
    author: string(combined.author, '作者', { max: 300 }),
    isbn: normalizeIsbn(combined.isbn, { optional: true }),
    publisher: string(combined.publisher, '出版社', { max: 300 }),
    publishedDate: string(combined.publishedDate, '出版日期', { max: 100 }),
    sourceUrl: sourceUrl(combined.sourceUrl),
    ebookLinks: normalizeEbookLinks(combined.ebookLinks),
    categoryId: reference(combined.categoryId, '分类', categories), coverUrl: coverUrl(combined.coverUrl),
    fileUrl: privateUrl(combined.fileUrl), fileName: string(combined.fileName, '文件名称', { max: 255 }),
    description: string(combined.description, '书籍介绍', { max: 20000 }),
    notes: string(combined.notes, '私人笔记', { max: 50000 }), status, rating,
    featured: bool(combined.featured, false, '精选'),
    createdAt: previous?.createdAt || timestamp(combined.createdAt, now), updatedAt: now,
  };
}
function bannerFrom(value, recordId, categories, books, previous) {
  if (!object(value)) fail('图集格式不正确。');
  const combined = { ...(previous || {}), ...value };
  return {
    id: id(recordId ?? combined.id), title: string(combined.title, '图集标题', { max: 300 }),
    imageUrl: coverUrl(combined.imageUrl), categoryId: reference(combined.categoryId, '分类', categories),
    bookId: reference(combined.bookId, '书籍', books),
  };
}
function validateLibrary(value) {
  if (!object(value)) fail('备份格式不正确。');
  for (const [key, limit] of [['categories', 1000], ['books', 10000], ['banners', 1000]]) {
    if (!Array.isArray(value[key]) || value[key].length > limit) fail(`备份的 ${key} 格式或数量不正确。`);
  }
  const categories = value.categories.map(item => categoryFrom(item));
  const categoryIds = new Set(categories.map(item => item.id));
  const books = value.books.map(item => {
    const book = bookFrom(item, undefined, categoryIds);
    book.updatedAt = timestamp(item.updatedAt, book.updatedAt);
    return book;
  });
  const bookIds = new Set(books.map(item => item.id));
  const banners = value.banners.map(item => bannerFrom(item, undefined, categoryIds, bookIds));
  if (categoryIds.size !== categories.length || bookIds.size !== books.length || new Set(banners.map(item => item.id)).size !== banners.length) fail('备份中有重复 ID。');
  return { settings: settingsFrom(value.settings), categories, books, banners };
}

export {DEFAULT_SETTINGS,bookFrom,categoryFrom,bannerFrom,settingsFrom,validateLibrary};
