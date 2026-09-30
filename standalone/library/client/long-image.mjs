import { Zlib } from 'fflate';

/* A document is laid out once, then painted in bounded strips. All strips are
 * scanlines of one PNG; Canvas never holds the entire long image at once. */
const DEFAULT_FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
const COLORS = { text: '#25242c', muted: '#777180', purple: '#7962ad', line: '#ebe7f1', paper: '#ffffff', note: '#faf8fd' };
const MAX_BYTES = 25 * 1024 * 1024;
const text = value => value == null ? '' : String(value);
const list = value => Array.isArray(value) ? value : [];
const validColor = (value, fallback) => /^#[\da-f]{6}$/i.test(value || '') ? value : fallback;

export class LongImageError extends Error {
  constructor(code, message, detail) { super(message); this.name = 'LongImageError'; this.code = code; if (detail !== undefined) this.detail = detail; }
}

function aborted(signal) {
  if (signal?.aborted) throw new LongImageError('ABORTED', '已取消长图生成。');
}
function canvasFactory(options) {
  if (typeof options.createCanvas === 'function') return options.createCanvas;
  if (typeof OffscreenCanvas === 'function') return (width, height) => new OffscreenCanvas(width, height);
  if (typeof document !== 'undefined') return (width, height) => { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas; };
  throw new LongImageError('CANVAS_UNAVAILABLE', '此设备无法生成图片，请换用支持 Canvas 的浏览器。');
}
function contextFor(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new LongImageError('CANVAS_UNAVAILABLE', '无法建立图片画布，请关闭其他标签页后重试。');
  return ctx;
}
function font(style, size, family) {
  const kind = style.font || 'normal';
  return `${kind.includes('italic') ? 'italic ' : ''}${kind.includes('bold') ? '700 ' : '400 '}${size}px ${family}`;
}

let segmenter;
function graphemes(value) {
  if (typeof Intl?.Segmenter === 'function') {
    segmenter ||= new Intl.Segmenter('zh', { granularity: 'grapheme' });
    return Array.from(segmenter.segment(value), entry => ({ text: entry.segment, index: entry.index }));
  }
  const result = []; let index = 0, joinNext = false, regionalCount = 0;
  for (const char of Array.from(value)) {
    const modifier = /[\p{Mark}\uFE0E\uFE0F\u200D\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]/u.test(char);
    const regional = /[\u{1F1E6}-\u{1F1FF}]/u.test(char);
    if (result.length && (modifier || joinNext || (regional && regionalCount % 2))) result[result.length - 1].text += char;
    else result.push({ text: char, index });
    joinNext = char === '\u200d'; regionalCount = regional ? regionalCount + 1 : 0; index += char.length;
  }
  return result;
}

function fieldRuns(value, item, field, options, base) {
  const source = text(value);
  if (!source) return [];
  const direct = item?.styledRuns?.[field];
  const tokenizer = options.textTokens || globalThis.TextStyling?.tokens;
  const context = { title: item?.title, tags: item?.tags, context: [item?.caption || item?.desc, item?.body, item?.notes].filter(Boolean).join('\n\n') };
  const raw = direct || (typeof tokenizer === 'function' ? tokenizer(source, item?.textStyle, context) : [{ text: source }]);
  if (!Array.isArray(raw) || raw.map(run => text(run?.text)).join('') !== source) throw new LongImageError('TEXT_STYLE_INVALID', '正文强调数据不完整，请重新读取已保存内容后生成。');
  return raw.map(run => ({ text: text(run.text), color: validColor(run.color, base.color), font: ['normal', 'bold', 'italic', 'underline', 'bold-italic'].includes(run.font) ? run.font : base.font }));
}

function wrap(ctx, runs, maxWidth, size, family) {
  const source = runs.map(run => run.text).join(''), ranges = []; let offset = 0;
  for (const run of runs) { ranges.push({ ...run, start: offset, end: offset + run.text.length }); offset += run.text.length; }
  const lines = [], current = []; let width = 0, rangeIndex = 0;
  const flush = () => { lines.push({ units: current.splice(0), width }); width = 0; };
  for (const part of graphemes(source)) {
    while (rangeIndex < ranges.length - 1 && part.index >= ranges[rangeIndex].end) rangeIndex++;
    const style = ranges[rangeIndex] || { color: COLORS.text, font: 'normal' };
    if (part.text === '\n' || part.text === '\r\n' || part.text === '\r') { flush(); continue; }
    const value = part.text === '\t' ? '    ' : part.text;
    ctx.font = font(style, size, family);
    const measured = ctx.measureText(value).width;
    if (measured > maxWidth) throw new LongImageError('TEXT_TOO_WIDE', '有单个文字或符号超过长图宽度，请增加图片宽度后重试。');
    if (current.length && width + measured > maxWidth) flush();
    current.push({ text: value, width: measured, color: style.color, font: style.font }); width += measured;
  }
  // Keep trailing newlines and every empty line rather than collapsing prose.
  if (current.length || source.endsWith('\n') || source.endsWith('\r')) flush();
  return lines;
}

async function defaultLoadImage(url, options) {
  let parsed;
  try { parsed = new URL(url, typeof location !== 'undefined' ? location.href : undefined); } catch { throw new Error('封面地址无效'); }
  if (!['http:', 'https:', 'blob:'].includes(parsed.protocol)) throw new Error('封面地址类型不受支持');
  const response = await fetch(parsed.href, { credentials: 'same-origin', signal: options.signal });
  if (!response.ok) throw new Error(`封面读取失败 (${response.status})`);
  const blob = await response.blob();
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
  if (typeof Image === 'undefined') throw new Error('浏览器不支持图片解码');
  const temporaryUrl = URL.createObjectURL(blob);
  try { return await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('封面图片无法解码')); image.src = temporaryUrl; }); }
  finally { URL.revokeObjectURL(temporaryUrl); }
}

function dimensions(image) {
  const value = image?.image || image;
  return { image: value, width: Number(image?.width || value?.naturalWidth || value?.width), height: Number(image?.height || value?.naturalHeight || value?.height), release: image?.release };
}

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < 256; index++) { let value = index; for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1; CRC_TABLE[index] = value >>> 0; }
function pngChunk(type, data) {
  const bytes = new Uint8Array(data.length + 12), view = new DataView(bytes.buffer);
  view.setUint32(0, data.length); for (let i = 0; i < 4; i++) bytes[4 + i] = type.charCodeAt(i); bytes.set(data, 8);
  let crc = 0xffffffff; for (let i = 4; i < bytes.length - 4; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 255] ^ crc >>> 8;
  view.setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0); return bytes;
}

/**
 * source: {title,date,intro,coverUrl,textStyle,items:[{title,caption,body,
 *   notes,bullets,url,coverUrl,tags,rating,sequence,sourceLabel,textStyle}]}
 * options.loadImage(url,item,index) may return a CanvasImageSource, or
 *   {image,width,height,release}. Source index -1 denotes the issue cover.
 * options.textTokens(text,textStyle,context) uses the existing TextStyling API.
 * styledRuns[field] is an optional array of literal {text,color,font} tokens.
 * The PNG is not cropped. An explicit size/decoding error leaves saving to the
 * caller; it must never substitute a smaller, partial screenshot silently.
 */
export async function renderLongImage(source, options = {}) {
  if (!source || typeof source !== 'object' || !Array.isArray(source.items)) throw new LongImageError('SOURCE_INVALID', '请先选择一条内容或一期周刊。');
  const width = Number(options.width ?? 1000), stripHeight = Number(options.stripHeight ?? 1024), maxBytes = Number(options.maxBytes ?? MAX_BYTES);
  if (!Number.isInteger(width) || width < 480 || width > 2048) throw new LongImageError('WIDTH_INVALID', '长图宽度须为 480 至 2048 像素。');
  if (!Number.isInteger(stripHeight) || stripHeight < 64 || stripHeight > 2048) throw new LongImageError('STRIP_INVALID', '长图分段高度须为 64 至 2048 像素。');
  if (!Number.isInteger(maxBytes) || maxBytes < 100 || maxBytes > MAX_BYTES) throw new LongImageError('SIZE_INVALID', '长图文件上限不能超过 25 MB。');
  aborted(options.signal);
  if (typeof document !== 'undefined' && document.fonts?.ready) await document.fonts.ready;
  const makeCanvas = canvasFactory(options), measuring = makeCanvas(width, 1), measure = contextFor(measuring), family = options.fontFamily || DEFAULT_FONT;
  const scale = width / 1000, left = Math.round(72 * scale), available = width - left * 2, ops = [], loaded = [];
  const stats = { items: source.items.length, textCharacters: 0, textLines: 0, imagesRequested: 0, imagesRendered: 0, missingImages: [], strips: 0, maxCanvasHeight: 0, truncated: false };
  let y = Math.round(64 * scale);
  const gap = amount => { y += Math.round(amount * scale); };
  const addText = (value, item, field, { size = 26, color = COLORS.text, weight = 'normal', inset = 0, lineRatio = 1.65, prefix = '' } = {}) => {
    const literal = text(value); if (!literal) return;
    const fontSize = size * scale, lineHeight = Math.ceil(fontSize * lineRatio);
    const runs = fieldRuns(literal, item, field, options, { color, font: weight });
    if (prefix) runs.unshift({ text: prefix, color, font: weight });
    const lines = wrap(measure, runs, available - inset * 2, fontSize, family);
    stats.textCharacters += literal.length + prefix.length; stats.textLines += lines.length;
    for (const line of lines) { ops.push({ type: 'text', y, height: lineHeight, x: left + inset, size: fontSize, line }); y += lineHeight; }
  };
  const addImage = async (url, item, index) => {
    if (!url) return;
    aborted(options.signal); stats.imagesRequested++;
    let resolved;
    try {
      resolved = dimensions(await (options.loadImage ? options.loadImage(text(url), item, index) : defaultLoadImage(text(url), options)));
      if (!resolved.image || !Number.isFinite(resolved.width) || !Number.isFinite(resolved.height) || resolved.width <= 0 || resolved.height <= 0) throw new Error('封面尺寸无效');
      // Contain rather than crop. Portrait video covers stay comfortable to read.
      const drawWidth = Math.min(available, resolved.width / resolved.height < 0.9 ? 560 * scale : available);
      const drawHeight = Math.ceil(drawWidth * resolved.height / resolved.width);
      if (!Number.isSafeInteger(drawHeight) || drawHeight > 0x7fffffff) throw new Error('封面尺寸过大');
      ops.push({ type: 'image', y, height: drawHeight, x: Math.round((width - drawWidth) / 2), width: drawWidth, image: resolved.image });
      loaded.push(resolved); stats.imagesRendered++; y += drawHeight; gap(28);
    } catch (error) {
      if (resolved?.release) resolved.release(); else resolved?.image?.close?.();
      aborted(options.signal);
      if (!options.allowMissingImages) throw new LongImageError('IMAGE_UNAVAILABLE', `第 ${index < 0 ? '封面' : index + 1} 条图片无法读取，请重试或替换封面后再生成。`, { index, message: text(error?.message) });
      stats.missingImages.push({ index, message: text(error?.message) });
      addText('封面暂时无法读取', {}, 'message', { size: 22, color: COLORS.muted }); gap(18);
    }
  };
  try {
    options.onProgress?.({ stage: 'layout', value: 0 });
    addText(options.brandLabel || '灵感库 · 完整内容备份', {}, 'brand', { size: 20, color: COLORS.purple }); gap(22);
    addText(source.title || '未命名内容', source, 'title', { size: 44, weight: 'bold', lineRatio: 1.4 }); gap(20);
    const meta = [source.date, `${source.items.length} 条内容`].filter(Boolean).join('  ·  ');
    addText(meta, {}, 'meta', { size: 20, color: COLORS.muted }); gap(28);
    if (source.coverUrl) await addImage(source.coverUrl, source, -1);
    if (source.intro) { addText(source.intro, source, 'intro', { size: 28 }); gap(36); }
    ops.push({ type: 'line', y, height: 2, x: left, width: available }); gap(36);
    for (const [index, raw] of source.items.entries()) {
      aborted(options.signal);
      const item = raw && typeof raw === 'object' ? raw : { title: text(raw) };
      const tags = list(item.tags).map(tag => `# ${text(tag)}`).join('  ');
      addText([item.sourceLabel || item.platform || '个人记录', tags].filter(Boolean).join('  ·  '), {}, 'meta', { size: 20, color: COLORS.purple }); gap(14);
      addText(item.title || '未命名内容', item, 'title', { size: 34, weight: 'bold', lineRatio: 1.45, prefix: `${item.sequence || index + 1}. ` }); gap(14);
      const rating = Number(item.rating);
      if (rating >= 1 && rating <= 5) { addText('★'.repeat(Math.floor(rating)), {}, 'rating', { size: 23, color: COLORS.purple }); gap(12); }
      if (item.url) { addText(item.url, {}, 'url', { size: 20, color: COLORS.purple }); gap(18); }
      const caption = text(item.caption || item.desc);
      if (caption) { addText(caption, item, 'caption', { size: 26 }); gap(24); }
      await addImage(item.coverUrl, item, index);
      if (item.body && text(item.body) !== caption) {
        addText('我的笔记', {}, 'label', { size: 21, color: COLORS.muted }); gap(10);
        addText(item.body, item, 'body', { size: 26 }); gap(24);
      }
      if (item.notes && text(item.notes) !== text(item.body)) {
        addText('补充记录', {}, 'label', { size: 21, color: COLORS.muted }); gap(10);
        addText(Array.isArray(item.notes) ? item.notes.map(text).join('\n') : item.notes, item, 'notes', { size: 26 }); gap(24);
      }
      for (const bullet of list(item.bullets)) { addText(`• ${text(bullet)}`, item, 'bullet', { size: 26 }); gap(6); }
      gap(28); ops.push({ type: 'line', y, height: 2, x: left, width: available }); gap(36);
      options.onProgress?.({ stage: 'layout', value: (index + 1) / Math.max(source.items.length, 1) });
    }
    addText(`已到本页末尾 · ${source.items.length} 条内容`, {}, 'end', { size: 20, color: COLORS.muted }); gap(60);
    const height = Math.ceil(y);
    if (!Number.isSafeInteger(height) || height <= 0 || height > 0x7fffffff) throw new LongImageError('HEIGHT_INVALID', '内容超过 PNG 长图的最大高度，请按周刊分期备份。');
    if(width*height>Math.min(100000000,Number(options.maxPixels)||100000000))throw new LongImageError('PIXEL_LIMIT','内容超过单张长图的保存容量，请按周刊分期备份；原文仍完整保留。');
    const header = new Uint8Array(13), view = new DataView(header.buffer); view.setUint32(0, width); view.setUint32(4, height); header[8] = 8; header[9] = 6;
    const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header)]; let bytes = parts.reduce((count, part) => count + part.length, 0);
    const compressor = new Zlib({ level: options.compressionLevel ?? 6 }, data => {
      if (!data.length) return;
      const part = pngChunk('IDAT', data); bytes += part.length;
      if (bytes + 12 > maxBytes) throw new LongImageError('FILE_TOO_LARGE', '完整长图超过 25 MB，尚未保存；请减少本期内容或降低图片宽度后重试。', { maxBytes });
      parts.push(part);
    });
    const stripCanvas = makeCanvas(width, Math.min(stripHeight, height)); let ctx = contextFor(stripCanvas), first = 0;
    const pause = options.yieldControl || (() => new Promise(resolve => setTimeout(resolve, 0)));
    for (let top = 0; top < height; top += stripHeight) {
      aborted(options.signal);
      const currentHeight = Math.min(stripHeight, height - top);
      if (stripCanvas.height !== currentHeight) { stripCanvas.height = currentHeight; ctx = contextFor(stripCanvas); }
      ctx.fillStyle = COLORS.paper; ctx.fillRect(0, 0, width, currentHeight); ctx.textBaseline = 'alphabetic';
      while (first < ops.length && ops[first].y + ops[first].height < top) first++;
      for (let index = first; index < ops.length && ops[index].y < top + currentHeight; index++) {
        const op = ops[index], localY = op.y - top;
        if (op.type === 'line') { ctx.fillStyle = COLORS.line; ctx.fillRect(op.x, localY, op.width, 1); }
        else if (op.type === 'image') ctx.drawImage(op.image, op.x, localY, op.width, op.height);
        else {
          let x = op.x, run = null;
          const paintRun = () => {
            if (!run) return;
            ctx.fillStyle = run.color; ctx.font = font(run, op.size, family); ctx.fillText(run.text, run.x, localY + op.size);
            if (run.font === 'underline') ctx.fillRect(run.x, localY + op.size + 3 * scale, run.width, Math.max(1, scale));
          };
          for (const unit of op.line.units) {
            if (!run || unit.color !== run.color || unit.font !== run.font) { paintRun(); run = { ...unit, text: '', width: 0, x }; }
            run.text += unit.text; run.width += unit.width; x += unit.width;
          }
          paintRun();
        }
      }
      let pixels;
      try { pixels = ctx.getImageData(0, 0, width, currentHeight).data; }
      catch (error) { throw new LongImageError('PIXELS_UNAVAILABLE', '封面图片不允许导出，长图尚未保存；请上传本地封面或重试。', { message: text(error?.message) }); }
      const rowBytes = width * 4, scanlines = new Uint8Array((rowBytes + 1) * currentHeight);
      // Filter 0 is valid for RGBA and permits independently painted strips.
      for (let row = 0; row < currentHeight; row++) scanlines.set(pixels.subarray(row * rowBytes, (row + 1) * rowBytes), row * (rowBytes + 1) + 1);
      compressor.push(scanlines, false); stats.strips++; stats.maxCanvasHeight = Math.max(stats.maxCanvasHeight, currentHeight);
      options.onProgress?.({ stage: 'render', value: (top + currentHeight) / height, width, height }); await pause();
    }
    compressor.push(new Uint8Array(0), true); parts.push(pngChunk('IEND', new Uint8Array(0)));
    const blob = new Blob(parts, { type: 'image/png' }); stats.bytes = blob.size; stats.width = width; stats.height = height;
    options.onProgress?.({ stage: 'complete', value: 1, width, height, bytes: blob.size });
    return { blob, width, height, stats };
  } finally {
    for (const resolved of loaded) { if (typeof resolved.release === 'function') resolved.release(); else resolved.image?.close?.(); }
  }
}
