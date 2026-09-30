const object = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export function fail(status, message) { throw Object.assign(new Error(message), { status, publicMessage: message }); }
export function safeImage(value) {
  if (value === '') return true;
  if (typeof value !== 'string') return false;
  if (/^\/(?:uploads|assets)\/[a-zA-Z0-9_./%-]+$/.test(value)) {
    try { const decoded = decodeURIComponent(value); return !decoded.includes('..') && !decoded.includes('\\') && !decoded.includes('\0'); }
    catch { return false; }
  }
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}
export function productInput(body, creating = false) {
  if (!object(body)) fail(400, '请求体必须是 JSON 对象。');
  const changes = {};
  for (const field of ['title', 'summary', 'description']) {
    if (!(field in body)) continue;
    const limit = field === 'title' ? 160 : field === 'summary' ? 500 : 20000;
    if (typeof body[field] !== 'string' || body[field].length > limit) fail(400, `${field} 内容无效或过长。`);
    changes[field] = field === 'title' ? body[field].trim() : body[field];
  }
  if ((creating || 'title' in changes) && !changes.title) fail(400, '请填写商品名称。');
  if ('price' in body) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0 || price > 1e9) fail(400, '商品价格无效。');
    changes.price = price;
  }
  if ('stock' in body) {
    const stock = body.stock === null || body.stock === '' ? null : Number(body.stock);
    if (stock !== null && (!Number.isInteger(stock) || stock < 0 || stock > 1e9)) fail(400, '库存必须是非负整数，或留空。');
    changes.stock = stock;
  }
  if ('status' in body) {
    if (!['draft', 'published', 'archived'].includes(body.status)) fail(400, '商品状态无效。');
    changes.status = body.status;
  }
  if ('cover' in body) {
    if (typeof body.cover !== 'string' || body.cover.length > 2048 || !safeImage(body.cover)) fail(400, '商品图片地址无效。');
    changes.cover = body.cover;
  }
  return changes;
}
export function settingsInput(body) {
  if (!object(body)) fail(400, '请求体必须是 JSON 对象。');
  const changes = {};
  for (const field of ['brandName', 'announcement', 'wechat', 'qq', 'backupQq', 'telegram', 'paymentQr', 'wechatPaymentQr', 'alipayPaymentQr', 'contactQr', 'contactLabel']) {
    if (!(field in body)) continue;
    if (typeof body[field] !== 'string' || body[field].length > (field === 'announcement' ? 2000 : 1000)) fail(400, `${field} 内容无效或过长。`);
    changes[field] = body[field];
  }
  for (const field of ['paymentQr', 'wechatPaymentQr', 'alipayPaymentQr', 'contactQr']) {
    if (field in changes && !safeImage(changes[field])) fail(400, '收款码或联系二维码地址无效。');
  }
  if ('backupQq' in changes && changes.backupQq !== '' && !/^\d{5,15}$/.test(changes.backupQq)) fail(400, '备用 QQ 号请填写 5 至 15 位数字，或留空。');
  return changes;
}
export function orderInput(body) {
  if (!object(body)) fail(400, '请求体必须是 JSON 对象。');
  if (typeof body.productId !== 'string' || !body.productId || body.productId.length > 160) fail(400, '请选择有效商品。');
  if (!Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 100) fail(400, '购买数量必须为 1 至 100 的整数。');
  if (typeof body.contact !== 'string' || body.contact.trim().length < 3 || body.contact.trim().length > 200) fail(400, '请填写有效联系方式（3 至 200 个字符）。');
  if (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 2000)) fail(400, '订单备注不能超过 2000 个字符。');
  if (!['wechat', 'alipay'].includes(body.paymentMethod)) fail(400, '请选择微信或支付宝付款。');
  return { productId: body.productId, quantity: body.quantity, contact: body.contact.trim(), note: (body.note || '').trim(), paymentMethod: body.paymentMethod };
}
export function imageType(bytes) {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return ['jpg', 'image/jpeg'];
  if ([137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n)) return ['png', 'image/png'];
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP') return ['webp', 'image/webp'];
  fail(400, '仅支持 JPEG、PNG 或 WebP 图片。');
}
