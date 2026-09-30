// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Admin from '../src/Admin.jsx';
import { App } from '../src/App.jsx';
import ResetCalendar from '../src/ResetCalendar.jsx';
import { announcementSignature } from '../src/Home.jsx';

const settings = {
  brandName: '测试小店',
  announcement: '欢迎光临',
  qq: 'YOUR_QQ',
  backupQq: 'YOUR_BACKUP_QQ',
  wechat: '',
  telegram: '',
  wechatPaymentQr: '/uploads/wechat-original.jpg',
  alipayPaymentQr: '/uploads/alipay-original.jpg',
  contactQr: '/uploads/contact-original.png',
  contactLabel: '联系咨询',
};

const product = {
  id: 'new-mobile-product',
  title: '手机上传的新商品',
  summary: '这是一件新上架商品的配套文字',
  description: '这是店主自己的商品介绍，固定购买说明仍需显示。',
  cover: '/uploads/product-cover.jpg',
  price: 29.9,
  stock: null,
  status: 'published',
};

const order = {
  id: 'order-needs-human-confirmation',
  productId: product.id,
  productTitle: product.title,
  unitPrice: product.price,
  quantity: 1,
  total: product.price,
  contact: 'QQ:123456789',
  note: '请通过 QQ 联系',
  payerNote: '付款人昵称：小陈，16:02 微信付款',
  paymentSubmittedAt: '2026-09-19T08:02:00.000Z',
  paymentMethod: 'wechat',
  status: 'payment_submitted',
  createdAt: '2026-09-19T08:00:00.000Z',
  updatedAt: '2026-09-19T08:00:00.000Z',
};

// Only HTTP responses are substituted: components, form validation, state,
// buttons, file inputs and the real request serialization remain under test.
function httpMock(overrides = {}) {
  const routes = {
    'GET /api/admin/session': { authenticated: true },
    'GET /api/admin/state': { settings, products: [] },
    'GET /api/admin/orders': { orders: [] },
    'GET /api/admin/mail': { enabled: false },
    'GET /api/storefront': { settings, products: [product] },
    'GET /api/reset-calendar': { checkedAt: '2026-09-19T08:00:00.000Z', events: [], emailEnabled: false },
    ...overrides,
  };
  const mock = vi.fn(async (url, options = {}) => {
    const key = `${options.method || 'GET'} ${url}`;
    if (!(key in routes)) throw new Error(`Unexpected HTTP request: ${key}`);
    const route = routes[key];
    const result = typeof route === 'function' ? await route(options) : route;
    const status = result.httpStatus || 200;
    const payload = result.httpStatus ? result.payload : result;
    return { ok: status >= 200 && status < 300, status, json: async () => payload };
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

function requests(mock, method, path) {
  return mock.mock.calls.filter(([url, options]) => (options?.method || 'GET') === method && (path === undefined || url === path));
}

function jsonBody(request) {
  return JSON.parse(request[1].body);
}

async function openAdminTab(label) {
  await screen.findByRole('heading', { name: /商品管理/, level: 1 });
  fireEvent.click(screen.getByRole('button', { name: label, exact: true }));
  await screen.findByRole('heading', { name: label, level: 1 });
}

beforeEach(() => {
  window.history.replaceState({}, '', '/manage');
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.stubGlobal('EventSource', class {
    addEventListener() {}
    close() {}
  });
  vi.stubGlobal('scrollTo', vi.fn());
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
  // jsdom does not implement these native dialog methods.
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open'); } });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('reference storefront home', () => {
  it('adds the final seven rules and safe relay link to the existing announcement', async () => {
    window.history.replaceState({}, '', '/');
    httpMock(); render(<App />);
    const dialog = await screen.findByRole('dialog', { name: '公告' });
    const rules = within(dialog).getByRole('list', { name: '下单规则' });
    expect(within(rules).getAllByRole('listitem')).toHaveLength(7);
    expect(within(dialog).getByText('🔔 下单须知（请务必阅读）')).not.toBeNull();
    expect(within(rules).getByText('请按页面选择对应支付方式！')).not.toBeNull();
    expect(within(rules).getByText('下单后请把你的订单号和已注册中转站的账号发我等待充值余额')).not.toBeNull();
    const relayLink = within(rules).getByRole('link', { name: 'daitu.cc' });
    expect(relayLink.href).toBe('https://daitu.cc/');
    expect(relayLink.rel).toContain('noopener');
    expect(dialog.textContent).not.toContain('仅支持USDT');
    expect(dialog.textContent).not.toContain('我的工单');
    expect(within(dialog).getByText(settings.announcement)).not.toBeNull();
  });
  it.each(['4', product.id])('reminds on direct product entry %s despite a valid homepage acknowledgement, not on refresh', async (id) => {
    window.history.replaceState({}, '', `/item/${id}`);
    localStorage.setItem('shop_notice_ack_v1', JSON.stringify({ signature: announcementSignature(settings), expiresAt: Date.now() + 3600000 }));
    const mock = httpMock({ 'GET /api/storefront': { settings, products: [{ ...product, id }] } });
    render(<App />);
    const dialog = await screen.findByRole('dialog', { name: '公告' });
    expect(within(dialog).getByRole('list', { name: '下单规则' })).not.toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: '我已阅读，继续购买' }));
    expect(screen.queryByRole('dialog', { name: '公告' })).toBeNull();
    fireEvent(window, new Event('focus'));
    await waitFor(() => expect(requests(mock, 'GET', '/api/storefront')).toHaveLength(2));
    expect(screen.queryByRole('dialog', { name: '公告' })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: '购物', exact: true }));
    await screen.findByRole('heading', { name: 'Chat GPT', level: 1 });
    expect(screen.queryByRole('dialog', { name: '公告' })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: '购买', exact: true }));
    expect(await screen.findByRole('button', { name: '我已阅读，继续购买' })).not.toBeNull();
    expect(requests(mock, 'POST', '/api/orders')).toHaveLength(0);
  });
  it.each(['/manage', '/user/index/query', '/item/missing-product'])('does not interrupt unrelated or unavailable pages: %s', async (path) => {
    window.history.replaceState({}, '', path);
    const mock = httpMock({ 'GET /api/admin/session': { authenticated: false } });
    render(<App />);
    await waitFor(() => expect(mock).toHaveBeenCalled());
    if (path === '/manage') await screen.findByLabelText('管理密码');
    else await waitFor(() => expect(requests(mock, 'GET', '/api/storefront')).toHaveLength(1));
    expect(screen.queryByRole('dialog', { name: '公告' })).toBeNull();
  });
  it('opens the password login from the owner entry without a document reload', async () => {
    window.history.replaceState({}, '', '/');
    const mock = httpMock({
      'GET /api/admin/session': { authenticated: false },
      'POST /api/auth/login': { authenticated: true },
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: '我已阅读' }));
    fireEvent.click(screen.getByRole('link', { name: '店主管理' }));
    expect(await screen.findByLabelText('管理密码')).not.toBeNull();
    expect(location.pathname).toBe('/manage');
    fireEvent.change(screen.getByLabelText('管理密码'), { target: { value: 'isolated-test-password' } });
    fireEvent.click(screen.getByRole('button', { name: '进入后台' }));
    await screen.findByRole('heading', { name: /商品管理/, level: 1 });
    expect(screen.getAllByRole('button', { name: '新增商品' }).length).toBeGreaterThan(0);
    expect(jsonBody(requests(mock, 'POST', '/api/auth/login')[0])).toEqual({ password: 'isolated-test-password' });
    window.history.replaceState({}, '', '/');
    fireEvent(window, new PopStateEvent('popstate'));
    await screen.findByRole('link', { name: '店主管理' });
    expect(screen.queryAllByRole('button', { name: '新增商品' })).toHaveLength(0);
    window.history.replaceState({}, '', '/manage');
    fireEvent(window, new PopStateEvent('popstate'));
    expect(await screen.findByLabelText('管理密码')).not.toBeNull();
  });
  it('keeps the primary QQ and exposes the backup in announcement, customer service and fixed details', async () => {
    window.history.replaceState({}, '', '/'); httpMock(); render(<App />);
    const announcement = await screen.findByRole('dialog', { name: '公告' });
    expect(within(announcement).getByRole('button', { name: 'QQ：YOUR_QQ' })).not.toBeNull();
    expect(within(announcement).getByRole('link', { name: '备用 QQ：YOUR_BACKUP_QQ' }).href).toContain('uin=YOUR_BACKUP_QQ');
    fireEvent.click(screen.getByRole('button', { name: '我已阅读' }));
    fireEvent.click(screen.getByRole('button', { name: '联系 QQ 客服' }));
    expect(screen.getByRole('link', { name: '联系主 QQ：YOUR_QQ' }).href).toContain('uin=YOUR_QQ');
    expect(screen.getAllByRole('link', { name: '备用 QQ：YOUR_BACKUP_QQ' }).every((a) => a.href.includes('uin=YOUR_BACKUP_QQ'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '关闭', exact: true }));
    fireEvent.click(screen.getByRole('link', { name: '购买', exact: true }));
    await screen.findByRole('heading', { name: product.title, level: 1 });
    fireEvent.click(await screen.findByRole('button', { name: '我已阅读，继续购买' }));
    expect(screen.getAllByRole('link', { name: '备用 QQ：YOUR_BACKUP_QQ' })).toHaveLength(2);
    expect(screen.getByText('无需人工等待 · 24小时无人值守 · 秒充即用！')).not.toBeNull();
  });
  it('submits the email only to this store and shows confirmation instructions, not an active subscription', async () => {
    const mock = httpMock({
      'GET /api/reset-calendar': { checkedAt: '2026-09-19T08:00:00Z', events: [], emailEnabled: true },
      'POST /api/codex-reset-subscribe': { message: '请检查邮箱并点击确认链接。' },
    });
    render(<ResetCalendar />);
    await waitFor(() => expect(screen.getByRole('button', { name: '订阅通知' }).disabled).toBe(false));
    fireEvent.change(screen.getByRole('textbox', { name: '订阅通知邮箱' }), { target: { value: 'buyer@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: '订阅通知' }));
    await screen.findByText('请检查邮箱并点击确认链接。');
    expect(jsonBody(requests(mock, 'POST', '/api/codex-reset-subscribe')[0])).toEqual({ email: 'buyer@example.test' });
    expect(screen.queryByText('订阅成功')).toBeNull();
  });
  it('shows the shared announcement automatically, remembers acknowledgement, and opens a product from home', async () => {
    window.history.replaceState({}, '', '/');
    httpMock();
    render(<App />);
    await screen.findByRole('heading', { name: 'Chat GPT', level: 1 });
    expect((await screen.findByRole('dialog', { name: '公告' })).hasAttribute('open')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '我已阅读' }));
    expect(screen.queryByRole('dialog', { name: '公告' })).toBeNull();
    expect(JSON.parse(localStorage.getItem('shop_notice_ack_v1')).expiresAt).toBeGreaterThan(Date.now());
    expect(screen.getByRole('heading', { name: '商品分类' })).not.toBeNull();
    expect(screen.getByRole('region', { name: 'Codex 重置日历' })).not.toBeNull();
    expect(screen.getByRole('button', { name: '订阅通知' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '公告', exact: true }));
    await screen.findByRole('dialog', { name: '公告' });
    fireEvent.click(screen.getByRole('button', { name: '取消', exact: true }));
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索商品' }), { target: { value: '不存在' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索', exact: true }));
    expect(screen.getByText('没有找到相关商品，试试其他关键词。')).not.toBeNull();
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索商品' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索', exact: true }));
    fireEvent.click(screen.getByRole('link', { name: '购买', exact: true }));
    await screen.findByRole('heading', { name: product.title, level: 1 });
    expect(await screen.findByRole('button', { name: '我已阅读，继续购买' })).not.toBeNull();
    expect(location.pathname).toBe(`/item/${product.id}`);
    expect(screen.getByText('兑换网站（点这里进去兑换）')).not.toBeNull();
  });
});

describe('mobile and desktop shop management', () => {
  it('shows delivery failure counts and requeues mail without touching unsaved shop settings', async () => {
    const mock = httpMock({
      'GET /api/admin/mail': { enabled: true, confirmedSubscribers: 3, queued: 0, failed: 2, lastCheckedAt: '2026-09-19T08:00:00Z' },
      'POST /api/admin/mail/retry': { enabled: true, confirmedSubscribers: 3, queued: 2, failed: 0 },
    });
    render(<Admin />); await openAdminTab('店铺设置');
    await screen.findByText('已确认订阅 3 人 · 待发送 0 封 · 多次失败 2 封');
    fireEvent.change(screen.getByLabelText('店铺名称'), { target: { value: '还没保存的店名' } });
    fireEvent.click(screen.getByRole('button', { name: '重试失败通知' }));
    await screen.findByText('失败通知已重新排队，将自动重试。');
    expect(screen.getByLabelText('店铺名称').value).toBe('还没保存的店名');
    expect(requests(mock, 'PUT', '/api/admin/settings')).toHaveLength(0);
  });
  it('logs in, uploads a selected photo, and publishes the entered copy and price', async () => {
    let finishUpload;
    const upload = new Promise((resolve) => { finishUpload = resolve; });
    const fetchMock = httpMock({
      'GET /api/admin/session': { authenticated: false },
      'POST /api/auth/login': { authenticated: true },
      'POST /api/admin/upload': () => upload,
      'POST /api/admin/products': { product },
    });
    render(<Admin />);

    fireEvent.change(await screen.findByLabelText('管理密码'), { target: { value: 'test-only-password' } });
    expect(requests(fetchMock, 'GET', '/api/admin/state')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '进入后台' }));
    await screen.findByRole('heading', { name: /商品管理/, level: 1 });
    expect(jsonBody(requests(fetchMock, 'POST', '/api/auth/login')[0])).toEqual({ password: 'test-only-password' });

    fireEvent.click(screen.getAllByRole('button', { name: '新增商品', exact: true })[0]);
    fireEvent.change(screen.getByLabelText(/商品名称/), { target: { value: product.title } });
    fireEvent.change(screen.getByLabelText('配套文字'), { target: { value: product.summary } });
    fireEvent.change(screen.getByLabelText(/售价/), { target: { value: '29.90' } });
    fireEvent.change(screen.getByLabelText(/商品介绍（选填）/), { target: { value: product.description } });
    expect(screen.getByText('购买及发货说明会自动附带，无需重复填写。')).not.toBeNull();

    const selectedFile = new File(['photo-bytes'], 'phone-photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('上传商品封面'), { target: { files: [selectedFile] } });
    await waitFor(() => expect(requests(fetchMock, 'POST', '/api/admin/upload')).toHaveLength(1));
    expect(screen.getByRole('button', { name: '发布上架' }).disabled).toBe(true);
    expect(requests(fetchMock, 'POST', '/api/admin/products')).toHaveLength(0);
    const uploadOptions = requests(fetchMock, 'POST', '/api/admin/upload')[0][1];
    expect(uploadOptions.body).toBeInstanceOf(FormData);
    expect(uploadOptions.body.get('file').name).toBe('phone-photo.jpg');
    expect(uploadOptions.headers['Content-Type']).toBeUndefined();

    finishUpload({ url: product.cover });
    await waitFor(() => expect(screen.getByAltText('商品封面预览').getAttribute('src')).toBe(product.cover));
    await waitFor(() => expect(screen.getByRole('button', { name: '发布上架' }).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '发布上架' }));
    await screen.findByText('商品已上架，店铺已同步更新。');

    const publishes = requests(fetchMock, 'POST', '/api/admin/products');
    expect(publishes).toHaveLength(1);
    expect(jsonBody(publishes[0])).toEqual({
      title: product.title,
      summary: product.summary,
      description: product.description,
      cover: product.cover,
      price: 29.9,
      stock: null,
      status: 'published',
    });
    expect(screen.getByRole('link', { name: '查看商品' }).getAttribute('href')).toBe(`/item/${product.id}`);
    expect(screen.getByRole('heading', { name: product.title, level: 2 })).not.toBeNull();
  });

  it('rejects an unsupported photo without posting it or discarding entered product text', async () => {
    const fetchMock = httpMock();
    render(<Admin />);
    await screen.findByRole('heading', { name: /商品管理/, level: 1 });
    fireEvent.click(screen.getAllByRole('button', { name: '新增商品', exact: true })[0]);
    fireEvent.change(screen.getByLabelText(/商品名称/), { target: { value: '保留我的商品名' } });
    fireEvent.change(screen.getByLabelText('上传商品封面'), { target: { files: [new File(['not-image'], 'document.html', { type: 'text/html' })] } });
    expect(await screen.findByRole('alert')).not.toBeNull();
    expect(screen.getByLabelText(/商品名称/).value).toBe('保留我的商品名');
    expect(requests(fetchMock, 'POST', '/api/admin/upload')).toHaveLength(0);
  });

  it('saves WeChat and Alipay QR uploads to distinct fields while preserving QQ and contact QR', async () => {
    const newWechat = '/uploads/owner-wechat-new.jpg';
    const newAlipay = '/uploads/owner-alipay-new.jpg';
    const fetchMock = httpMock({
      'POST /api/admin/upload': (options) => ({ url: options.body.get('file').name === 'wechat.jpg' ? newWechat : newAlipay }),
      'PUT /api/admin/settings': { settings: { ...settings, wechatPaymentQr: newWechat, alipayPaymentQr: newAlipay } },
    });
    render(<Admin />);
    await openAdminTab('店铺设置');
    expect(screen.getByLabelText('QQ 号').value).toBe('YOUR_QQ');
    expect(screen.getByAltText('微信收款码预览').getAttribute('src')).toBe(settings.wechatPaymentQr);
    expect(screen.getByAltText('支付宝收款码预览').getAttribute('src')).toBe(settings.alipayPaymentQr);

    fireEvent.change(screen.getByLabelText('上传微信收款码'), { target: { files: [new File(['wechat'], 'wechat.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(screen.getByAltText('微信收款码预览').getAttribute('src')).toBe(newWechat));
    expect(screen.getByAltText('支付宝收款码预览').getAttribute('src')).toBe(settings.alipayPaymentQr);
    fireEvent.change(screen.getByLabelText('上传支付宝收款码'), { target: { files: [new File(['alipay'], 'alipay.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(screen.getByAltText('支付宝收款码预览').getAttribute('src')).toBe(newAlipay));
    await waitFor(() => expect(screen.getByRole('button', { name: '保存设置' }).disabled).toBe(false));
    expect(requests(fetchMock, 'PUT', '/api/admin/settings')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }));
    await screen.findByText('设置已保存，联系方式与收款码已同步到店铺。');

    const saved = requests(fetchMock, 'PUT', '/api/admin/settings');
    expect(saved).toHaveLength(1);
    expect(jsonBody(saved[0])).toEqual({ ...settings, wechatPaymentQr: newWechat, alipayPaymentQr: newAlipay });
    expect(requests(fetchMock, 'POST', '/api/admin/upload')).toHaveLength(2);
  });

  it('requires separate human actions to confirm payment and mark an order handled, with optional note', async () => {
    const alreadyPaid = { ...order, id: 'paid-order', productTitle: '已收款的另一笔订单', status: 'paid', paymentMethod: 'alipay' };
    const awaitingPayment = { ...order, id: 'unpaid-order', productTitle: '还没付款的订单', status: 'pending_payment' };
    const fetchMock = httpMock({
      'GET /api/admin/orders': { orders: [order, alreadyPaid, awaitingPayment] },
      [`PUT /api/admin/orders/${order.id}`]: (options) => ({ order: { ...order, status: JSON.parse(options.body).action === 'confirm-payment' ? 'paid' : 'fulfilled' } }),
    });
    render(<Admin />);
    await openAdminTab('订单管理');
    const submittedCard = (await screen.findByRole('heading', { name: product.title, level: 2 })).closest('article');
    const paidCard = screen.getByRole('heading', { name: alreadyPaid.productTitle }).closest('article');
    const unpaidCard = screen.getByRole('heading', { name: awaitingPayment.productTitle }).closest('article');

    expect(within(submittedCard).getByRole('button', { name: '确认收款' })).not.toBeNull();
    expect(within(submittedCard).queryByRole('button', { name: '标记已处理' })).toBeNull();
    expect(within(paidCard).getByRole('button', { name: '标记已处理' })).not.toBeNull();
    expect(within(paidCard).queryByRole('button', { name: '确认收款' })).toBeNull();
    expect(within(unpaidCard).queryByRole('button', { name: '确认收款' })).toBeNull();
    expect(within(unpaidCard).queryByRole('button', { name: '标记已处理' })).toBeNull();
    expect(within(submittedCard).getByText('微信支付')).not.toBeNull();
    expect(within(submittedCard).getByText('付款备注').nextElementSibling.textContent).toBe(order.payerNote);
    expect(within(submittedCard).getByText('付款申报时间').nextElementSibling.querySelector('time').dateTime).toBe(order.paymentSubmittedAt);
    expect(within(paidCard).getByText('支付宝')).not.toBeNull();
    expect(within(submittedCard).getByText('¥29.90')).not.toBeNull();
    expect(requests(fetchMock, 'PUT')).toHaveLength(0);

    fireEvent.click(within(submittedCard).getByRole('button', { name: `复制客户联系方式 ${order.contact}` }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(order.contact);
    window.confirm.mockReturnValueOnce(false);
    fireEvent.click(within(submittedCard).getByRole('button', { name: '确认收款' }));
    expect(requests(fetchMock, 'PUT')).toHaveLength(0);
    fireEvent.click(within(submittedCard).getByRole('button', { name: '确认收款' }));
    await within(submittedCard).findByRole('button', { name: '标记已处理' });
    const firstAction = requests(fetchMock, 'PUT', `/api/admin/orders/${order.id}`);
    expect(firstAction).toHaveLength(1);
    expect(jsonBody(firstAction[0])).toEqual({ action: 'confirm-payment', deliveryNote: '' });
    expect(within(submittedCard).queryByRole('button', { name: '确认收款' })).toBeNull();

    const optionalNote = within(submittedCard).getByLabelText(/处理备注/);
    expect(optionalNote.required).toBe(false);
    expect(optionalNote.value).toBe('');
    fireEvent.click(within(submittedCard).getByRole('button', { name: '标记已处理' }));
    await within(submittedCard).findByText('已处理');
    const actions = requests(fetchMock, 'PUT', `/api/admin/orders/${order.id}`).map(jsonBody);
    expect(actions).toEqual([{ action: 'confirm-payment', deliveryNote: '' }, { action: 'deliver', deliveryNote: '' }]);
    expect(requests(fetchMock, 'PUT', '/api/admin/orders/paid-order')).toHaveLength(0);
    expect(requests(fetchMock, 'POST', '/api/orders')).toHaveLength(0);
    expect(within(submittedCard).queryByRole('button', { name: '标记已处理' })).toBeNull();
  });
});

describe('public product and payment flow', () => {
  it.each([
    ['菲律宾官方代充 · 5X套餐', false],
    ['店主为原商品更新的配套文字', true],
  ])('shows edited copy on the original product without duplicating its seed summary: %s', async (summary, visible) => {
    window.history.replaceState({}, '', '/item/4');
    httpMock({ 'GET /api/storefront': { settings, products: [{ ...product, id: '4', summary }] } });
    render(<App />);
    await screen.findByRole('heading', { name: product.title, level: 1 });
    const customSummary = screen.queryByText(summary, { selector: 'p.product-summary' });
    expect(Boolean(customSummary)).toBe(visible);
    expect(screen.getByRole('heading', { name: '菲律宾官方代充 · 5X套餐' })).not.toBeNull();
    expect(screen.getByText('全自动发货')).not.toBeNull();
  });

  it.each([
    ['new-item-with-description', '独立商品介绍，不应覆盖固定说明。'],
    ['new-item-with-summary', ''],
  ])('includes fixed purchase and delivery information on %s', async (id, description) => {
    const currentProduct = { ...product, id, description };
    window.history.replaceState({}, '', `/item/${id}`);
    httpMock({ 'GET /api/storefront': { settings, products: [currentProduct] } });
    render(<App />);
    await screen.findByRole('heading', { name: product.title, level: 1 });
    expect(screen.getByText(description || product.summary)).not.toBeNull();
    expect(screen.getByText('全自动发货')).not.toBeNull();
    expect(screen.getByRole('heading', { name: /下单前必读/ })).not.toBeNull();
  });

  it.each([
    ['wechat', '微信支付', '微信收款码', settings.wechatPaymentQr],
    ['alipay', '支付宝', '支付宝收款码', settings.alipayPaymentQr],
  ])('shows the selected %s QR and submits a payment notice without automatic fulfillment', async (paymentMethod, methodLabel, imageLabel, paymentQr) => {
    window.history.replaceState({}, '', `/item/${product.id}`);
    const unpaid = { ...order, status: 'pending_payment', paymentMethod };
    const fetchMock = httpMock({
      'POST /api/orders': { order: unpaid, token: 'test-receipt-token' },
      [`POST /api/orders/${order.id}/payment-notice`]: { order: { ...unpaid, status: 'payment_submitted' } },
    });
    render(<App />);
    await screen.findByRole('heading', { name: product.title, level: 1 });
    fireEvent.click(await screen.findByRole('button', { name: '我已阅读，继续购买' }));
    fireEvent.change(screen.getByLabelText('联系方式'), { target: { value: 'QQ:123456789' } });
    fireEvent.click(screen.getByRole('radio', { name: methodLabel, exact: true }));
    fireEvent.click(screen.getByRole('button', { name: /立即购买/ }));
    const qr = await screen.findByRole('img', { name: imageLabel });
    expect(qr.getAttribute('src')).toBe(paymentQr);
    fireEvent(window, new Event('focus'));
    await waitFor(() => expect(requests(fetchMock, 'GET', '/api/storefront')).toHaveLength(2));
    expect(screen.queryByRole('dialog', { name: '公告' })).toBeNull();
    expect(screen.getByRole('img', { name: imageLabel }).getAttribute('src')).toBe(paymentQr);
    expect(jsonBody(requests(fetchMock, 'POST', '/api/orders')[0])).toEqual({ productId: product.id, contact: 'QQ:123456789', quantity: 1, note: '', paymentMethod });
    expect(requests(fetchMock, 'POST', `/api/orders/${order.id}/payment-notice`)).toHaveLength(0);

    fireEvent.change(screen.getByLabelText('付款备注（选填）'), { target: { value: '买家昵称，今天付款' } });
    fireEvent.click(screen.getByRole('button', { name: '我已付款，提交付款信息' }));
    await screen.findByText('付款信息已收到，请保留订单号，方便后续查询。');
    const notices = requests(fetchMock, 'POST', `/api/orders/${order.id}/payment-notice`);
    expect(notices).toHaveLength(1);
    expect(jsonBody(notices[0])).toEqual({ token: 'test-receipt-token', payerNote: '买家昵称，今天付款' });
    expect(fetchMock.mock.calls.some(([url, options]) => url.startsWith('/api/admin/') && options?.method === 'PUT')).toBe(false);
    expect(screen.queryByText('已确认收款', { exact: true })).toBeNull();
    expect(screen.queryByText('已处理', { exact: true })).toBeNull();
  });
});
