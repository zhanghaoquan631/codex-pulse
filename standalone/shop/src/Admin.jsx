import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Check, CheckCircle2, ChevronRight, Copy, ImagePlus, LoaderCircle, LockKeyhole, LogOut, Package, Plus, RefreshCw, Search, Settings2, ShoppingBag, Store, Upload, X } from 'lucide-react';
import './admin.css';

const TABS = [
  { id: 'products', label: '商品管理', icon: Package },
  { id: 'orders', label: '订单管理', icon: ShoppingBag },
  { id: 'settings', label: '店铺设置', icon: Settings2 },
];
const PRODUCT_LABELS = { published: '已上架', draft: '草稿', archived: '已下架' };
const ORDER_LABELS = { pending_payment: '待付款', payment_submitted: '待核款', paid: '待处理', fulfilled: '已处理', cancelled: '已取消' };
const EMPTY_PRODUCT = { title: '', summary: '', description: '', price: '', stock: '', status: 'draft', cover: '' };
const SETTINGS_FIELDS = ['brandName', 'announcement', 'wechat', 'qq', 'backupQq', 'telegram', 'wechatPaymentQr', 'alipayPaymentQr', 'contactQr', 'contactLabel'];
const money = (value) => Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateLabel = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

async function api(path, options = {}) {
  const isForm = options.body instanceof FormData;
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(isForm ? {} : { 'Content-Type': 'application/json' }), ...options.headers },
    body: options.body === undefined || isForm ? options.body : JSON.stringify(options.body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const error = new Error(data?.error || '暂时无法连接到店铺，请稍后重试。');
    error.status = response.status;
    throw error;
  }
  return data;
}

function BusyIcon({ busy, icon: Icon, ...props }) {
  return busy ? <LoaderCircle className="admin-spin" size={17} aria-hidden="true" /> : <Icon size={17} aria-hidden="true" {...props} />;
}

function ImageUpload({ label, value, onChange, busy, disabled, upload, variant = 'cover' }) {
  const inputRef = useRef(null);
  return <div className={`admin-upload admin-upload-${variant}`}>
    <div className="admin-field-label">{label}</div>
    <div className={`admin-image-area ${value ? 'has-image' : ''}`}>
      {value ? <img src={value} alt={`${label}预览`} /> : <div className="admin-image-empty"><ImagePlus size={25} strokeWidth={1.4} aria-hidden="true" /><span>选择一张图片</span></div>}
    </div>
    <div className="admin-upload-actions">
      <button type="button" className="admin-button admin-button-small" disabled={disabled} onClick={() => inputRef.current?.click()}><BusyIcon busy={busy} icon={Upload} />{busy ? '上传中…' : value ? '更换图片' : '上传图片'}</button>
      {value && <button type="button" className="admin-text-button" disabled={disabled} onClick={() => onChange('')}>移除</button>}
    </div>
    <input ref={inputRef} type="file" className="admin-sr-only" aria-label={`上传${label}`} accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={async (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) await upload(file, onChange);
    }} />
    <small>JPG、PNG 或 WebP，最大 8 MB</small>
  </div>;
}

export default function Admin() {
  const [session, setSession] = useState(null);
  const [password, setPassword] = useState('');
  const [tab, setTab] = useState('products');
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState({});
  const [mailStatus, setMailStatus] = useState(null);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [orders, setOrders] = useState([]);
  const [editor, setEditor] = useState(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [query, setQuery] = useState('');
  const [productFilter, setProductFilter] = useState('all');
  const [orderFilter, setOrderFilter] = useState('all');
  const [deliveryNotes, setDeliveryNotes] = useState({});
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeLink, setNoticeLink] = useState('');
  const [copied, setCopied] = useState('');
  const operationLock = useRef(false);
  const headingRef = useRef(null);

  const reportError = useCallback((err) => {
    setError(err?.message || '操作失败，请稍后重试。');
    if (err?.status === 401) setSession(false);
  }, []);

  const loadState = useCallback(async () => {
    setLoading(true);
    try {
      const state = await api('/api/admin/state');
      setProducts(state.products || []);
      setSettings(state.settings || {});
      setSettingsDirty(false);
    } finally { setLoading(false); }
  }, []);

  const loadOrders = useCallback(async () => {
    const data = await api('/api/admin/orders');
    setOrders(data.orders || []);
  }, []);

  useEffect(() => {
    let active = true;
    api('/api/admin/session').then(async (data) => {
      if (!active) return;
      setSession(Boolean(data.authenticated));
      if (data.authenticated) await loadState();
    }).catch((err) => { if (active) { setSession(false); reportError(err); } });
    return () => { active = false; };
  }, [loadState, reportError]);

  useEffect(() => {
    if (!editorDirty && !settingsDirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [editorDirty, settingsDirty]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function runOperation(key, action) {
    if (operationLock.current) return;
    operationLock.current = true;
    setBusy(key);
    setError('');
    setNotice('');
    setNoticeLink('');
    try { await action(); } catch (err) { reportError(err); }
    finally { operationLock.current = false; setBusy(''); }
  }

  async function login(event) {
    event.preventDefault();
    await runOperation('login', async () => {
      await api('/api/auth/login', { method: 'POST', body: { password } });
      setPassword('');
      setSession(true);
      await loadState();
      if (tab === 'orders') await loadOrders();
    });
  }

  async function logout() {
    if ((editorDirty || settingsDirty) && !window.confirm('还有未保存的修改，确定退出登录吗？')) return;
    await runOperation('logout', async () => {
      await api('/api/auth/logout', { method: 'POST' });
      setSession(false);
      setEditor(null);
      setEditorDirty(false);
      setSettingsDirty(false);
      setProducts([]);
      setOrders([]);
      setSettings({});
    });
  }

  function switchTab(nextTab) {
    if (busy || nextTab === tab) return;
    if (editorDirty && !window.confirm('商品修改还未保存，确定离开吗？')) return;
    setEditor(null);
    setEditorDirty(false);
    setTab(nextTab);
    setError('');
    if (nextTab === 'orders') runOperation('orders', loadOrders);
    if (nextTab === 'settings') runOperation('mail-status', async () => setMailStatus(await api('/api/admin/mail')));
  }

  function openEditor(product) {
    setEditor(product ? { ...product, stock: product.stock ?? '', price: String(product.price ?? '') } : { ...EMPTY_PRODUCT });
    setEditorDirty(false);
    setError('');
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  function closeEditor() {
    if (busy || (editorDirty && !window.confirm('修改还未保存，确定返回商品列表吗？'))) return;
    setEditor(null);
    setEditorDirty(false);
    setError('');
  }

  function changeProduct(field, value) {
    setEditor((current) => ({ ...current, [field]: value }));
    setEditorDirty(true);
  }

  function changeSetting(field, value) {
    setSettings((current) => ({ ...current, [field]: value }));
    setSettingsDirty(true);
  }

  async function uploadImage(key, file, callback) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('请选择 JPG、PNG 或 WebP 格式的图片。'); return; }
    if (file.size > 8 * 1024 * 1024) { setError('图片不能超过 8 MB，请压缩后再试。'); return; }
    await runOperation(key, async () => {
      const form = new FormData();
      form.append('file', file);
      const data = await api('/api/admin/upload', { method: 'POST', body: form });
      callback(data.url);
      setNotice('图片已上传，保存后会同步到店铺。');
    });
  }

  async function saveProduct(event) {
    event.preventDefault();
    const status = event.nativeEvent.submitter?.value || editor.status;
    if (!editor.title.trim()) { setError('请填写商品名称。'); return; }
    if (editor.price === '' || !Number.isFinite(Number(editor.price)) || Number(editor.price) < 0) { setError('请填写有效的商品价格。'); return; }
    const stock = editor.stock === '' ? null : Number(editor.stock);
    if (stock !== null && (!Number.isInteger(stock) || stock < 0)) { setError('库存请填写非负整数；留空表示不限库存。'); return; }
    await runOperation('save-product', async () => {
      const body = { title: editor.title.trim(), summary: editor.summary, description: editor.description, price: Number(editor.price), stock, status, cover: editor.cover };
      const result = await api(editor.id ? `/api/admin/products/${encodeURIComponent(editor.id)}` : '/api/admin/products', { method: editor.id ? 'PUT' : 'POST', body });
      setProducts((current) => editor.id ? current.map((item) => item.id === editor.id ? result.product : item) : [result.product, ...current]);
      setEditor(null);
      setEditorDirty(false);
      setNotice(status === 'published' ? '商品已上架，店铺已同步更新。' : status === 'archived' ? '商品已下架。' : '草稿已保存，发布后买家可见。');
      if (status === 'published') setNoticeLink(`/item/${encodeURIComponent(result.product.id)}`);
    });
  }

  async function toggleProduct(product) {
    const status = product.status === 'published' ? 'archived' : 'published';
    await runOperation(`product-${product.id}`, async () => {
      const result = await api(`/api/admin/products/${encodeURIComponent(product.id)}`, { method: 'PUT', body: { status } });
      setProducts((current) => current.map((item) => item.id === product.id ? result.product : item));
      setNotice(status === 'published' ? '商品已上架，店铺已同步更新。' : '商品已下架。');
      if (status === 'published') setNoticeLink(`/item/${encodeURIComponent(result.product.id)}`);
    });
  }

  async function saveSettings(event) {
    event.preventDefault();
    await runOperation('save-settings', async () => {
      const body = Object.fromEntries(SETTINGS_FIELDS.map((key) => [key, settings[key] || '']));
      const result = await api('/api/admin/settings', { method: 'PUT', body });
      setSettings(result.settings);
      setSettingsDirty(false);
      setNotice('设置已保存，联系方式与收款码已同步到店铺。');
    });
  }

  async function updateOrder(order, action) {
    if (action === 'confirm-payment' && !window.confirm(`请确认已实际收到 ¥${money(order.total)}。确认后，这笔订单会进入待处理列表。`)) return;
    if (action === 'cancel' && !window.confirm('确定取消这笔订单吗？如已收到款项，请先与客户沟通处理。')) return;
    await runOperation(`order-${order.id}`, async () => {
      const result = await api(`/api/admin/orders/${encodeURIComponent(order.id)}`, { method: 'PUT', body: { action, deliveryNote: deliveryNotes[order.id] || '' } });
      setOrders((current) => current.map((item) => item.id === order.id ? result.order : item));
      setNotice(action === 'confirm-payment' ? '已确认收款，请通过客户留下的联系方式私下沟通。' : action === 'deliver' ? '订单已标记为已处理。' : '订单已取消。');
    });
  }

  async function copyContact(value, id) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      setTimeout(() => setCopied((current) => current === id ? '' : current), 2500);
    } catch { setError('复制未成功，请长按或选中客户联系方式复制。'); }
  }

  const publishedCount = products.filter((item) => item.status === 'published').length;
  const visibleProducts = products.filter((item) => (productFilter === 'all' || item.status === productFilter) && `${item.title} ${item.summary}`.toLowerCase().includes(query.toLowerCase()));
  const visibleOrders = orders.filter((order) => orderFilter === 'all' || order.status === orderFilter).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const feedback = <>
    {error && <div className="admin-alert admin-alert-error" role="alert"><span>{error}</span><button type="button" aria-label="关闭错误提示" onClick={() => setError('')}><X size={16} /></button></div>}
    {notice && <div className="admin-alert admin-alert-success" role="status"><CheckCircle2 size={17} aria-hidden="true" /><span>{notice}</span>{noticeLink && <a className="admin-notice-link" href={noticeLink} target="_blank" rel="noreferrer">查看商品<ArrowUpRight size={13} /></a>}</div>}
  </>;

  if (session === null) return <div className="admin-root admin-loading-page" role="status"><LoaderCircle className="admin-spin" size={24} /><span>正在打开店铺后台…</span></div>;

  if (!session) return <div className="admin-root admin-login-page">
    <a className="admin-back-link" href="/"><ArrowLeft size={16} />返回店铺</a>
    <main className="admin-login-card">
      <div className="admin-login-icon"><Store size={27} strokeWidth={1.5} /></div>
      <div className="admin-eyebrow">YOUR LITTLE SHOP</div>
      <h1>店铺管理</h1>
      <p>上传商品、管理订单，照顾好你的小店。</p>
      {feedback}
      <form onSubmit={login}>
        <label className="admin-field"><span>管理密码</span><div className="admin-password-field"><LockKeyhole size={17} /><input type="password" name="password" autoComplete="current-password" required value={password} disabled={Boolean(busy)} placeholder="请输入管理密码" onChange={(event) => setPassword(event.target.value)} /></div></label>
        <button className="admin-button admin-button-primary admin-login-submit" disabled={Boolean(busy)} type="submit"><BusyIcon busy={busy === 'login'} icon={ArrowUpRight} />{busy ? '正在登录…' : '进入后台'}</button>
      </form>
      <div className="admin-login-foot">手机和电脑都能管理，保存后同步到店铺。</div>
    </main>
  </div>;

  return <div className="admin-root">
    <header className="admin-header">
      <a className="admin-brand" href="/" aria-label="返回店铺首页"><span className="admin-brand-icon"><Store size={20} strokeWidth={1.6} /></span><span>{settings.brandName || '我的小店'}<small>店铺后台</small></span></a>
      <div className="admin-header-actions"><a className="admin-button admin-button-small" href="/" target="_blank" rel="noreferrer">查看店铺<ArrowUpRight size={15} /></a><button className="admin-icon-button" type="button" aria-label="退出登录" title="退出登录" disabled={Boolean(busy)} onClick={logout}><LogOut size={18} /></button></div>
    </header>

    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-eyebrow admin-nav-label">WORKSPACE</div>
        <nav aria-label="后台导航">{TABS.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`admin-nav-item ${tab === id ? 'is-active' : ''}`} aria-current={tab === id ? 'page' : undefined} disabled={Boolean(busy)} onClick={() => switchTab(id)}><Icon size={19} strokeWidth={1.7} /><span>{label}</span><ChevronRight size={15} className="admin-nav-chevron" /></button>)}</nav>
        <div className="admin-sidebar-note"><span className="admin-status-dot" />你的店铺，由你打理。<p>商品保存即同步<br />订单由你确认与处理</p></div>
      </aside>

      <main className="admin-main">
        {feedback}
        {loading ? <div className="admin-panel admin-loading" role="status"><LoaderCircle className="admin-spin" size={22} /><span>正在读取店铺内容…</span></div> : <>
          {tab === 'products' && !editor && <>
            <div className="admin-page-heading"><div><div className="admin-eyebrow">PRODUCTS</div><h1>商品管理<span>{products.length}</span></h1><p>一张图片，一段介绍，让好东西被看见。</p></div><button className="admin-button admin-button-primary" type="button" disabled={Boolean(busy)} onClick={() => openEditor(null)}><Plus size={18} />新增商品</button></div>
            <div className="admin-stats"><div><small>全部商品</small><strong>{products.length}<span>件</span></strong></div><div><small>正在售卖</small><strong>{publishedCount}<span>件</span></strong></div><div><small>等待发布</small><strong>{products.filter((item) => item.status === 'draft').length}<span>件</span></strong></div></div>
            <div className="admin-product-toolbar"><div className="admin-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label="搜索商品" placeholder="搜索商品名称…" value={query} onChange={(event) => setQuery(event.target.value)} /></div><select aria-label="筛选商品状态" value={productFilter} onChange={(event) => setProductFilter(event.target.value)}><option value="all">全部状态</option>{Object.entries(PRODUCT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            {visibleProducts.length === 0 ? <div className="admin-panel admin-empty"><Package size={32} strokeWidth={1.2} /><h2>{products.length ? '没有找到商品' : '上架你的第一件商品'}</h2><p>{products.length ? '换一个关键词或筛选条件试试。' : '用手机上传图片，写好介绍，即可发布到店铺。'}</p>{!products.length && <button className="admin-button" type="button" onClick={() => openEditor(null)}><Plus size={16} />新增商品</button>}</div> : <div className="admin-product-list">{visibleProducts.map((product) => <article className="admin-product-card" key={product.id}><div className="admin-product-cover">{product.cover ? <img src={product.cover} alt="" loading="lazy" /> : <Package size={27} strokeWidth={1.2} />}</div><div className="admin-product-info"><span className={`admin-badge admin-badge-${product.status}`}>{PRODUCT_LABELS[product.status] || product.status}</span><h2>{product.title}</h2><p>{product.summary || '暂无商品简介'}</p><div className="admin-product-meta"><strong>¥{money(product.price)}</strong><span>{product.stock === null ? '不限库存' : `库存 ${product.stock}`}</span></div></div><div className="admin-product-actions"><button className="admin-button admin-button-small" type="button" disabled={Boolean(busy)} onClick={() => openEditor(product)}>编辑商品<ChevronRight size={14} /></button><button className="admin-text-button" type="button" disabled={Boolean(busy)} onClick={() => toggleProduct(product)}>{busy === `product-${product.id}` ? '更新中…' : product.status === 'published' ? '下架' : '上架'}</button></div></article>)}</div>}
          </>}

          {tab === 'products' && editor && <>
            <button type="button" className="admin-back-link" disabled={Boolean(busy)} onClick={closeEditor}><ArrowLeft size={16} />返回商品列表</button>
            <div className="admin-page-heading"><div><div className="admin-eyebrow">PRODUCT EDITOR</div><h1 ref={headingRef} tabIndex={-1}>{editor.id ? '编辑商品' : '新增商品'}</h1><p>保存草稿，或准备好后直接上架。</p></div></div>
            <form onSubmit={saveProduct} className="admin-editor-form">
              <fieldset disabled={Boolean(busy)} className="admin-fieldset admin-panel admin-editor-grid">
                <ImageUpload label="商品封面" value={editor.cover} onChange={(value) => changeProduct('cover', value)} disabled={Boolean(busy)} busy={busy === 'upload-cover'} upload={(file, callback) => uploadImage('upload-cover', file, callback)} />
                <div className="admin-fields"><label className="admin-field"><span>商品名称 <em>*</em></span><input required maxLength={160} value={editor.title} placeholder="给商品起一个清楚的名字" onChange={(event) => changeProduct('title', event.target.value)} /></label><label className="admin-field"><span>配套文字</span><textarea rows={2} maxLength={500} value={editor.summary} placeholder="写出它最吸引人的地方" onChange={(event) => changeProduct('summary', event.target.value)} /></label><div className="admin-field-row"><label className="admin-field"><span>售价（元） <em>*</em></span><input type="number" inputMode="decimal" required min="0" max="1000000000" step="0.01" value={editor.price} placeholder="0.00" onChange={(event) => changeProduct('price', event.target.value)} /></label><label className="admin-field"><span>库存</span><input type="number" inputMode="numeric" min="0" max="1000000000" step="1" value={editor.stock} placeholder="留空表示不限" onChange={(event) => changeProduct('stock', event.target.value)} /></label></div><label className="admin-field"><span>商品介绍（选填）</span><textarea rows={6} maxLength={20000} value={editor.description} placeholder="补充商品内容或使用方式…" onChange={(event) => changeProduct('description', event.target.value)} /><small>购买及发货说明会自动附带，无需重复填写。</small></label></div>
              </fieldset>
              <div className="admin-save-bar"><span>{editorDirty ? '有未保存的修改' : '发布后，买家可在店铺看到商品'}</span><div><button className="admin-button" name="status" value={editor.id ? editor.status : 'draft'} type="submit" disabled={Boolean(busy)}>{busy === 'save-product' ? '保存中…' : editor.id ? '保存修改' : '保存草稿'}</button>{editor.status !== 'published' && <button className="admin-button admin-button-primary" type="submit" name="status" value="published" disabled={Boolean(busy)}><Check size={16} />发布上架</button>}</div></div>
            </form>
          </>}

          {tab === 'orders' && <>
            <div className="admin-page-heading"><div><div className="admin-eyebrow">ORDERS</div><h1>订单管理</h1><p>核实到账后，联系客户并私下完成交付。</p></div><button className="admin-button" type="button" disabled={Boolean(busy)} onClick={() => runOperation('orders', loadOrders)}><BusyIcon busy={busy === 'orders'} icon={RefreshCw} />刷新订单</button></div>
            <div className="admin-stats"><div><small>等待核款</small><strong>{orders.filter((order) => order.status === 'payment_submitted').length}<span>笔</span></strong></div><div><small>等待处理</small><strong>{orders.filter((order) => order.status === 'paid').length}<span>笔</span></strong></div><div><small>已完成处理</small><strong>{orders.filter((order) => order.status === 'fulfilled').length}<span>笔</span></strong></div></div>
            <div className="admin-order-toolbar"><span>订单记录</span><select aria-label="筛选订单状态" value={orderFilter} onChange={(event) => setOrderFilter(event.target.value)}><option value="all">全部订单</option>{Object.entries(ORDER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            {busy === 'orders' && !orders.length ? <div className="admin-panel admin-loading" role="status"><LoaderCircle className="admin-spin" size={22} />正在读取订单…</div> : visibleOrders.length === 0 ? <div className="admin-panel admin-empty"><ShoppingBag size={32} strokeWidth={1.2} /><h2>还没有{orderFilter === 'all' ? '' : ORDER_LABELS[orderFilter]}订单</h2><p>客户下单后，订单和联系方式会显示在这里。</p></div> : <div className="admin-orders">{visibleOrders.map((order) => <article className="admin-panel admin-order-card" key={order.id}>
              <div className="admin-order-top"><span className={`admin-badge admin-badge-${order.status}`}>{ORDER_LABELS[order.status] || order.status}</span><time dateTime={order.createdAt}>{dateLabel(order.createdAt)}</time></div>
              <div className="admin-order-title"><div><h2>{order.productTitle}</h2><p>¥{money(order.unitPrice)} × {order.quantity}</p></div><strong>¥{money(order.total)}</strong></div>
              <dl className="admin-order-details"><div className="admin-order-contact"><dt>客户联系方式</dt><dd><span>{order.contact}</span><button className="admin-icon-button" type="button" aria-label={`复制客户联系方式 ${order.contact}`} title="复制联系方式" onClick={() => copyContact(order.contact, order.id)}>{copied === order.id ? <Check size={16} /> : <Copy size={16} />}</button></dd></div><div><dt>付款方式</dt><dd>{order.paymentMethod === 'wechat' ? '微信支付' : order.paymentMethod === 'alipay' ? '支付宝' : order.paymentMethod}</dd></div><div><dt>订单编号</dt><dd className="admin-order-id">{order.id}</dd></div>{order.note && <div><dt>客户留言</dt><dd>{order.note}</dd></div>}{order.payerNote && <div><dt>付款备注</dt><dd>{order.payerNote}</dd></div>}{order.paymentSubmittedAt && <div><dt>付款申报时间</dt><dd><time dateTime={order.paymentSubmittedAt}>{dateLabel(order.paymentSubmittedAt)}</time></dd></div>}{order.deliveryNote && <div><dt>处理备注</dt><dd>{order.deliveryNote}</dd></div>}</dl>
              {order.status === 'paid' && <label className="admin-field admin-order-note"><span>处理备注 <small>（可选，客户查单时可见）</small></span><textarea rows={2} maxLength={2000} disabled={Boolean(busy)} placeholder="例如：已通过 QQ 联系并发送商品" value={deliveryNotes[order.id] || ''} onChange={(event) => setDeliveryNotes((current) => ({ ...current, [order.id]: event.target.value }))} /></label>}
              {['pending_payment', 'payment_submitted', 'paid'].includes(order.status) && <div className="admin-order-actions"><span>{order.status === 'payment_submitted' ? '客户已提交付款，请核对实际到账。' : order.status === 'paid' ? '请私下联系客户，处理后更新状态。' : '等待客户付款。'}</span><div>{['pending_payment', 'payment_submitted'].includes(order.status) && <button type="button" className="admin-text-button" disabled={Boolean(busy)} onClick={() => updateOrder(order, 'cancel')}>取消订单</button>}{order.status === 'payment_submitted' && <button type="button" className="admin-button admin-button-primary" disabled={Boolean(busy)} onClick={() => updateOrder(order, 'confirm-payment')}><BusyIcon busy={busy === `order-${order.id}`} icon={Check} />确认收款</button>}{order.status === 'paid' && <button type="button" className="admin-button admin-button-primary" disabled={Boolean(busy)} onClick={() => updateOrder(order, 'deliver')}><BusyIcon busy={busy === `order-${order.id}`} icon={CheckCircle2} />标记已处理</button>}</div></div>}
            </article>)}</div>}
          </>}

          {tab === 'settings' && <>
            <section className="admin-panel admin-settings-section" aria-label="邮件订阅状态"><div className="admin-section-heading"><h2>重置邮件通知</h2><p>{mailStatus?.enabled ? `已确认订阅 ${mailStatus.confirmedSubscribers} 人 · 待发送 ${mailStatus.queued} 封 · 多次失败 ${mailStatus.failed} 封` : '尚未启用。完成服务器发信配置后，前台才会开放订阅。'}</p>{mailStatus?.enabled && <p>最近检查：{dateLabel(mailStatus.lastCheckedAt)}。修改发信配置后可重试失败通知。</p>}</div><div className="admin-upload-actions"><button type="button" className="admin-button admin-button-small" disabled={Boolean(busy)} onClick={() => runOperation('mail-status', async () => setMailStatus(await api('/api/admin/mail')))}>刷新邮件状态</button>{mailStatus?.failed > 0 && <button type="button" className="admin-button admin-button-small" disabled={Boolean(busy)} onClick={() => runOperation('mail-retry', async () => { setMailStatus(await api('/api/admin/mail/retry', { method: 'POST', body: {} })); setNotice('失败通知已重新排队，将自动重试。'); })}>重试失败通知</button>}</div></section>
            <div className="admin-page-heading"><div><div className="admin-eyebrow">SHOP SETTINGS</div><h1>店铺设置</h1><p>收款码和联系方式，都在这里更新。</p></div></div>
            <form onSubmit={saveSettings} className="admin-settings-form">
              <fieldset disabled={Boolean(busy)} className="admin-fieldset admin-panel admin-settings-section"><div className="admin-section-heading"><h2>备用联系方式</h2><p>主 QQ 无法联系时，买家可以改用备用 QQ。</p></div><label className="admin-field"><span>备用 QQ 号</span><input inputMode="numeric" maxLength={15} value={settings.backupQq || ''} onChange={(event) => changeSetting('backupQq', event.target.value)} /></label></fieldset>
              <fieldset disabled={Boolean(busy)} className="admin-fieldset admin-panel admin-settings-section"><div className="admin-section-heading"><h2>店铺信息</h2><p>让来访的人了解你的小店。</p></div><div className="admin-fields"><label className="admin-field"><span>店铺名称</span><input maxLength={1000} value={settings.brandName || ''} placeholder="我的小店" onChange={(event) => changeSetting('brandName', event.target.value)} /></label><label className="admin-field"><span>店铺公告</span><textarea rows={3} maxLength={2000} value={settings.announcement || ''} placeholder="写下你想告诉买家的事情" onChange={(event) => changeSetting('announcement', event.target.value)} /></label></div></fieldset>
              <fieldset disabled={Boolean(busy)} className="admin-fieldset admin-panel admin-settings-section"><div className="admin-section-heading"><h2>联系方式</h2><p>买家可以通过这些方式与你联系。</p></div><div className="admin-fields"><div className="admin-field-row"><label className="admin-field"><span>QQ 号</span><input inputMode="numeric" maxLength={1000} value={settings.qq || ''} onChange={(event) => changeSetting('qq', event.target.value)} /></label><label className="admin-field"><span>微信号</span><input maxLength={1000} value={settings.wechat || ''} placeholder="选填" onChange={(event) => changeSetting('wechat', event.target.value)} /></label></div><label className="admin-field"><span>Telegram</span><input maxLength={1000} value={settings.telegram || ''} placeholder="选填" onChange={(event) => changeSetting('telegram', event.target.value)} /></label><div className="admin-contact-upload"><ImageUpload variant="qr" label="联系二维码（选填）" value={settings.contactQr || ''} onChange={(value) => changeSetting('contactQr', value)} disabled={Boolean(busy)} busy={busy === 'upload-contact'} upload={(file, callback) => uploadImage('upload-contact', file, callback)} /><label className="admin-field"><span>联系二维码标题</span><input maxLength={1000} value={settings.contactLabel || ''} placeholder="联系咨询" onChange={(event) => changeSetting('contactLabel', event.target.value)} /></label></div></div></fieldset>
              <fieldset disabled={Boolean(busy)} className="admin-fieldset admin-panel admin-settings-section"><div className="admin-section-heading"><h2>收款码</h2><p>两种付款方式分别设置。客户付款后，由你确认收款并处理订单。</p></div><div className="admin-payment-uploads"><ImageUpload variant="qr" label="微信收款码" value={settings.wechatPaymentQr || ''} onChange={(value) => changeSetting('wechatPaymentQr', value)} disabled={Boolean(busy)} busy={busy === 'upload-wechat'} upload={(file, callback) => uploadImage('upload-wechat', file, callback)} /><ImageUpload variant="qr" label="支付宝收款码" value={settings.alipayPaymentQr || ''} onChange={(value) => changeSetting('alipayPaymentQr', value)} disabled={Boolean(busy)} busy={busy === 'upload-alipay'} upload={(file, callback) => uploadImage('upload-alipay', file, callback)} /></div></fieldset>
              <div className="admin-save-bar"><span>{settingsDirty ? '有未保存的修改' : '保存后同步到店铺'}</span><button type="submit" className="admin-button admin-button-primary" disabled={Boolean(busy) || !settingsDirty}><BusyIcon busy={busy === 'save-settings'} icon={Check} />{busy === 'save-settings' ? '保存中…' : '保存设置'}</button></div>
            </form>
          </>}
        </>}
        <footer className="admin-footer">把小店，慢慢经营好。</footer>
      </main>
    </div>
  </div>;
}
