import React, { useEffect, useRef, useState } from "react";
import {
  ShoppingCart,
  Folders,
  Megaphone,
  Globe2,
  LogIn,
  Menu,
  X,
  Share2,
  Expand,
  Plus,
  Minus,
  MessageCircle,
  Copy,
  Search,
  Check,
  LoaderCircle,
} from "lucide-react";
import Admin from "./Admin.jsx";
import OriginalDetails from "./OriginalDetails.jsx";
import BackupQQ, { qqLink } from './BackupQQ.jsx';
import { Home, Announcement, announcementSignature } from './Home.jsx';

async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "暂时无法完成，请稍后重试。");
  return data;
}
const statuses = {
  pending_payment: "待付款",
  payment_submitted: "付款信息已提交",
  paid: "已确认收款",
  fulfilled: "已处理",
  cancelled: "已取消",
};
const money = (value) => Number(value || 0).toFixed(2);
async function copyText(value) {
  if (navigator.clipboard?.writeText)
    return navigator.clipboard.writeText(value);
  const el = document.createElement("textarea");
  el.value = value;
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.append(el);
  el.select();
  const success = document.execCommand("copy");
  el.remove();
  if (!success) throw new Error("请长按文字复制。");
}
function Modal({ title, children, close, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const previous = document.activeElement;
    el?.showModal();
    return () => {
      el?.close();
      previous?.focus?.();
    };
  }, []);
  return (
    <dialog
      className={`modal ${wide ? "wide" : ""}`}
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="关闭" onClick={close}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Contact({ settings, notify }) {
  return (
    <div className="contact-content">
      {settings.contactQr && (
        <img className="contact-qr" src={settings.contactQr} alt="客服二维码" />
      )}
      <p>有问题随时找我</p>
      {settings.qq && <a className="button dark" href={qqLink(settings.qq)} target="_blank" rel="noreferrer">联系主 QQ：{settings.qq}</a>}
      {settings.qq && (
        <button
          className="button"
          onClick={() =>
            copyText(settings.qq)
              .then(() => notify("QQ 号已复制"))
              .catch((e) => notify(e.message))
          }
        >
          <Copy size={16} />
          复制主 QQ 号
        </button>
      )}
      <BackupQQ number={settings.backupQq} />
      {settings.wechat && (
        <button
          className="button"
          onClick={() =>
            copyText(settings.wechat)
              .then(() => notify("微信号已复制"))
              .catch((e) => notify(e.message))
          }
        >
          微信：{settings.wechat}
        </button>
      )}
      <small>添加时请附上商品名称或订单号。</small>
    </div>
  );
}
function OrderSummary({ order }) {
  return (
    <dl className="order-summary">
      <div>
        <dt>订单号</dt>
        <dd className="order-id">{order.id}</dd>
      </div>
      <div>
        <dt>商品</dt>
        <dd>{order.productTitle}</dd>
      </div>
      <div>
        <dt>购买数量</dt>
        <dd>{order.quantity}</dd>
      </div>
      <div>
        <dt>订单金额</dt>
        <dd className="money">¥ {money(order.total)}</dd>
      </div>
      <div>
        <dt>联系方式</dt>
        <dd>{order.contact}</dd>
      </div>
      <div>
        <dt>付款方式</dt>
        <dd>{order.paymentMethod === "alipay" ? "支付宝" : "微信支付"}</dd>
      </div>
      <div>
        <dt>订单状态</dt>
        <dd>
          <span className="badge green">
            {statuses[order.status] || order.status}
          </span>
        </dd>
      </div>
      {order.deliveryNote && (
        <div>
          <dt>订单留言</dt>
          <dd>{order.deliveryNote}</dd>
        </div>
      )}
    </dl>
  );
}
function Payment({ receipt, settings, onUpdate, notify, close }) {
  const [payerNote, setPayerNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const order = receipt.order;
  const qr =
    order.paymentQr ||
    (order.paymentMethod === "alipay"
      ? settings.alipayPaymentQr
      : settings.wechatPaymentQr);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await request(
        `/api/orders/${encodeURIComponent(order.id)}/payment-notice`,
        {
          method: "POST",
          body: JSON.stringify({ token: receipt.token, payerNote }),
        },
      );
      onUpdate({ ...receipt, order: result.order });
      notify("付款信息已提交");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={order.status === "pending_payment" ? "扫码付款" : "订单信息"}
      close={close}
    >
      <OrderSummary order={order} />
      {order.status === "pending_payment" ? (
        <form onSubmit={submit}>
          <div className="pay-amount">
            请支付 <strong>¥ {money(order.total)}</strong>
          </div>
          {qr ? (
            <a
              href={qr}
              target="_blank"
              rel="noreferrer"
              className="payment-image-link"
            >
              <img
                className="payment-image"
                src={qr}
                alt={
                  order.paymentMethod === "alipay"
                    ? "支付宝收款码"
                    : "微信收款码"
                }
              />
            </a>
          ) : (
            <p className="form-error">收款码暂不可用，请联系店主。</p>
          )}
          <p className="hint center">
            点击查看原图，手机可长按保存。请核对付款金额，并备注订单号。
          </p>
          <label className="field">
            付款备注（选填）
            <input
              value={payerNote}
              maxLength={300}
              onChange={(e) => setPayerNote(e.target.value)}
              placeholder="付款人昵称 / 付款时间，方便核对"
            />
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button className="button dark full" disabled={busy || !qr}>
            {busy ? "正在提交…" : "我已付款，提交付款信息"}
          </button>
          <p className="hint center">
            此按钮仅提交付款信息，订单状态以收款核对结果为准。
          </p>
        </form>
      ) : (
        <p className="success-message">
          <Check size={18} />
          {order.status === "payment_submitted"
            ? "付款信息已收到，请保留订单号，方便后续查询。"
            : "你可以通过订单查询查看最新进度。"}
        </p>
      )}
      <Contact settings={settings} notify={notify} />
    </Modal>
  );
}
function QueryPage({ settings, notify, lastReceipt, resume }) {
  const [id, setId] = useState(lastReceipt?.order?.id || "");
  const [contact, setContact] = useState("");
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function query(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOrder(null);
    try {
      const r = await request("/api/orders/query", {
        method: "POST",
        body: JSON.stringify({ id: id.trim(), contact: contact.trim() }),
      });
      setOrder(r.order);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="shell query-page">
      <section className="panel">
        <header className="panel-heading">
          <h1>订单查询</h1>
          <p>使用订单号和下单时填写的联系方式查询。</p>
        </header>
        <div className="panel-body">
          <form className="query-form" onSubmit={query}>
            <label className="field">
              订单号
              <input
                required
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="请输入订单号"
              />
            </label>
            <label className="field">
              联系方式
              <input
                required
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="请填写下单时留下的联系方式"
                autoComplete="off"
              />
            </label>
            <button className="button dark" disabled={busy}>
              <Search size={16} />
              {busy ? "正在查询…" : "查询订单"}
            </button>
          </form>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {order && (
            <>
              <OrderSummary order={order} />
              {order.status === "pending_payment" &&
                lastReceipt?.order?.id === order.id && (
                  <button
                    className="button dark"
                    onClick={() => resume({ ...lastReceipt, order })}
                  >
                    继续付款
                  </button>
                )}
              <Contact settings={settings} notify={notify} />
            </>
          )}
        </div>
      </section>
    </main>
  );
}
function ItemPage({ product, settings, notify, buy, busy, error, setModal }) {
  const [contact, setContact] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [method, setMethod] = useState(
    settings.wechatPaymentQr ? "wechat" : "alipay",
  );
  const max =
    product.id === "4"
      ? 1
      : product.stock === null
        ? 99
        : Math.max(1, Math.min(99, product.stock));
  const soldOut = product.stock === 0;
  return (
    <main className="shell item-page">
      <section className="panel item-panel">
        <div className="item-grid">
          <div className="cover-card">
            {product.cover ? (
              <button
                className="cover-trigger"
                onClick={() => setModal("image")}
                aria-label="查看原图"
              >
                <img
                  className="item-cover"
                  src={product.cover}
                  alt={product.title}
                />
                <span className="cover-hint">
                  <Expand size={16} />
                  查看原图
                </span>
              </button>
            ) : (
              <div className="no-cover">{product.title}</div>
            )}
          </div>
          <div className="item-form-wrap">
            <h1 className="item-title">{product.title}</h1>
            <div className="badges">
              <span className="badge green">自动发货</span>
              <span className="badge green">
                库存{" "}
                {soldOut
                  ? "已售罄"
                  : product.stock === null
                    ? "所剩无几"
                    : product.stock}
              </span>
              <button
                className="badge blue"
                onClick={() =>
                  copyText(window.location.href)
                    .then(() => notify("商品链接已复制"))
                    .catch((e) => notify(e.message))
                }
              >
                <Share2 size={14} />
                分享
              </button>
            </div>
            <div className="item-price"><span className="price-unit">¥</span><span className="price-amount">{money(product.price)}</span></div>
            <form
              className="purchase-form"
              onSubmit={(e) => {
                e.preventDefault();
                buy({
                  productId: product.id,
                  contact: contact.trim(),
                  quantity,
                  note: note.trim(),
                  paymentMethod: method,
                });
              }}
            >
              <label className="field">
                联系方式
                <input
                  required
                  minLength={3}
                  maxLength={200}
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="请输入您的联系方式/建议填写邮箱"
                />
              </label>
              <label className="field">
                购买数量
                <div className="quantity">
                  <button
                    type="button"
                    disabled={quantity <= 1}
                    onClick={() => setQuantity((n) => Math.max(1, n - 1))}
                    aria-label="减少购买数量"
                  >
                    <Minus size={15} />
                  </button>
                  <input
                    type="number"
                    required
                    min="1"
                    max={max}
                    aria-label="购买数量"
                    value={quantity}
                    onChange={(e) =>
                      setQuantity(
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                  />
                  <button
                    type="button"
                    disabled={quantity >= max}
                    onClick={() =>
                      setQuantity((n) => Math.min(max, Number(n) + 1))
                    }
                    aria-label="增加购买数量"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </label>
              <label className="field">
                订单备注（选填）
                <input
                  value={note}
                  maxLength={500}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="有什么需要告诉店主的"
                />
              </label>
              <fieldset className="payment-methods">
                <legend>付款</legend>
                <div className="payment-options">
                  <label
                    className={method === "wechat" ? "selected wechat" : ""}
                  >
                    <input
                      type="radio"
                      name="method"
                      value="wechat"
                      checked={method === "wechat"}
                      disabled={!settings.wechatPaymentQr}
                      onChange={() => setMethod("wechat")}
                    />
                    <MessageCircle size={19} />
                    微信支付
                  </label>
                  <label
                    className={method === "alipay" ? "selected alipay" : ""}
                  >
                    <input
                      type="radio"
                      name="method"
                      value="alipay"
                      checked={method === "alipay"}
                      disabled={!settings.alipayPaymentQr}
                      onChange={() => setMethod("alipay")}
                    />
                    <span className="alipay-label" aria-hidden="true">支</span>支付宝
                  </label>
                </div>
              </fieldset>
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <button
                className="button dark buy-button"
                disabled={
                  busy ||
                  soldOut ||
                  !(settings.wechatPaymentQr || settings.alipayPaymentQr)
                }
              >
                {busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <ShoppingCart size={17} />
                )}
                {busy
                  ? "正在创建订单…"
                  : soldOut
                    ? "暂时售罄"
                    : `立即购买 · ¥ ${money(product.price * (Number(quantity) || 1))}`}
              </button>
            </form>
          </div>
        </div>
      </section>
      <OriginalDetails settings={settings}>
        {product.summary && !(product.id === '4' && product.summary === '菲律宾官方代充 · 5X套餐') && <p className="product-summary">{product.summary}</p>}
        {product.description && <div className="plain-description product-copy">{product.description}</div>}
      </OriginalDetails>
    </main>
  );
}
function Catalog({ products, navigate }) {
  const [term, setTerm] = useState("");
  const filtered = products.filter((p) =>
    p.title.toLowerCase().includes(term.toLowerCase()),
  );
  return (
    <main className="shell catalog-page">
      <section className="panel">
        <header className="panel-heading">
          <p className="eyebrow">Catalog</p>
          <h1>商品目录</h1>
          <label className="search">
            <Search size={18} />
            <input
              aria-label="搜索商品"
              placeholder="搜索商品关键词"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </label>
        </header>
        <div className="catalog-list">
          {filtered.map((p) => (
            <button
              className="catalog-row"
              key={p.id}
              onClick={() => navigate(`/item/${p.id}`)}
            >
              {p.cover && <img src={p.cover} alt="" />}
              <span>
                <strong>{p.title}</strong>
                <small>{p.summary}</small>
              </span>
              <b>¥{money(p.price)}</b>
            </button>
          ))}
          {!filtered.length && <p className="empty">暂无匹配商品</p>}
        </div>
      </section>
    </main>
  );
}
function Storefront({ openAdmin }) {
  const [store, setStore] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [path, setPath] = useState(location.pathname);
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [receipt, setReceipt] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem("last-order") || "null");
    } catch {
      return null;
    }
  });
  const toastTimer = useRef();
  function notify(message) {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 3000);
  }
  function navigate(url) {
    history.pushState({}, "", url);
    setPath(location.pathname);
    setMenu(false);
    setModal(null);
    scrollTo({ top: 0 });
  }
  async function refresh() {
    try {
      const r = await request("/api/storefront");
      setStore(r);
      setLoadError("");
    } catch (e) {
      setLoadError(e.message);
    }
  }
  useEffect(() => {
    refresh();
    const events = new EventSource("/api/events");
    events.addEventListener("storefront-update", refresh);
    const pop = () => setPath(location.pathname);
    window.addEventListener("popstate", pop);
    window.addEventListener("focus", refresh);
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 30000);
    return () => {
      events.close();
      clearInterval(interval);
      clearTimeout(toastTimer.current);
      window.removeEventListener("popstate", pop);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  function saveReceipt(r) {
    setReceipt(r);
    try {
      sessionStorage.setItem("last-order", JSON.stringify(r));
    } catch {}
  }
  async function buy(body) {
    if (busy) return;
    setBusy(true);
    setOrderError("");
    try {
      const r = await request("/api/orders", {
        method: "POST",
        body: JSON.stringify(body),
      });
      saveReceipt(r);
      setModal("payment");
    } catch (e) {
      setOrderError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const settings = store?.settings || {};
  const products = store?.products || [];
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool || !store) return;
    const lifecycle = new AbortController();
    const tools = [{
      name: 'list_shop_products', title: '查看店铺商品', description: '读取当前已上架商品，不会创建订单。',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => ({ products: store.products.map(({ id, title, summary, price, stock }) => ({ id, title, summary, price, stock })) }),
    }, {
      name: 'open_shop_product', title: '打开商品详情', description: '打开指定商品详情页；仅导航，不下单、不付款。',
      inputSchema: { type: 'object', properties: { productId: { type: 'string' } }, required: ['productId'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: (input) => {
        if (!input || typeof input.productId !== 'string' || !store.products.some((p) => p.id === input.productId)) throw new Error('商品不存在。');
        navigate(`/item/${encodeURIComponent(input.productId)}`);
        return { openedProductId: input.productId, orderCreated: false };
      },
    }];
    for (const tool of tools) try { Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {}
    return () => lifecycle.abort();
  }, [store]);
  const itemId = path.startsWith("/item/") ? path.slice(6) : null;
  const product = itemId
    ? products.find((p) => p.id === itemId)
    : null;
  const noticeSignature = announcementSignature(settings);
  useEffect(() => {
    if (!store || !['/', '/catalog'].includes(path)) return;
    try {
      const ack = JSON.parse(localStorage.getItem('shop_notice_ack_v1') || 'null');
      if (ack?.signature === noticeSignature && ack.expiresAt > Date.now()) return;
    } catch {}
    setModal('auto-notice');
  }, [path, noticeSignature, Boolean(store)]);
  useEffect(() => {
    // Product entry is independent of the homepage's one-hour acknowledgement.
    // Depend on route/id, not the refreshed product object, so polling cannot
    // reopen the notice while a customer is entering details or paying.
    if (product?.id) setModal('purchase-notice');
    else setModal((current) => current === 'purchase-notice' ? null : current);
  }, [path, product?.id]);
  function copyQQ() {
    copyText(settings.qq || '').then(() => notify('QQ 号已复制')).catch((e) => notify(e.message));
  }
  function acknowledgeNotice() {
    if (modal !== 'purchase-notice') {
      try { localStorage.setItem('shop_notice_ack_v1', JSON.stringify({ signature: noticeSignature, expiresAt: Date.now() + 3600000 })); } catch {}
    }
    setModal(null);
  }
  useEffect(() => {
    document.title = `${product?.title || "购物"} - ${settings.brandName || "我的小店"}`;
  }, [product?.title, settings.brandName]);
  return (
    <>
      <header className="nav-shell">
        <nav className={`navigation ${menu ? "open" : ""}`}>
          <a
            className="brand"
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigate("/");
            }}
          >
            <span className="brand-mark">
              <ShoppingCart size={23} />
            </span>
            <span className="brand-name">
              {settings.brandName || "我的小店"}
            </span>
          </a>
          <button
            className="icon-button nav-toggle"
            aria-expanded={menu}
            aria-label="展开导航"
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X size={22} /> : <Menu size={22} />}
          </button>
          <div className="nav-main">
            <div className="nav-links">
              <a
                href="/"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/");
                }}
              >
                <ShoppingCart size={17} />
                购物
              </a>
              <a
                href="/user/index/query"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/user/index/query");
                }}
              >
                <Folders size={17} />
                订单查询
              </a>
              <button onClick={() => setModal("notice")}>
                <Megaphone size={17} />
                公告
              </button>
            </div>
            <div className="nav-tools">
              <span className="language">
                <Globe2 size={17} />
                简中
              </span>
              <button className="button" onClick={() => setModal("contact")}>
                <MessageCircle size={16} />
                联系客服
              </button>
              <a className="button dark" href="/manage" onClick={(event) => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                openAdmin();
              }}>
                <LogIn size={16} />
                店主管理
              </a>
            </div>
          </div>
        </nav>
      </header>
      {!store ? (
        <main className="shell">
          <div className="panel loading">
            {loadError ? (
              <>
                <p role="alert">{loadError}</p>
                <button className="button" onClick={refresh}>
                  重新加载
                </button>
              </>
            ) : (
              <>
                <LoaderCircle size={24} className="spin" />
                <p>正在加载商品…</p>
              </>
            )}
          </div>
        </main>
      ) : path === "/user/index/query" ? (
        <QueryPage
          settings={settings}
          notify={notify}
          lastReceipt={receipt}
          resume={(r) => {
            saveReceipt(r);
            setModal("payment");
          }}
        />
      ) : path === "/catalog" || path === "/" ? (
        <Home products={products} settings={settings} navigate={navigate} copyQQ={copyQQ} />
      ) : product ? (
        <ItemPage
          key={product.id}
          product={product}
          settings={settings}
          notify={notify}
          buy={buy}
          busy={busy}
          error={orderError}
          setModal={setModal}
        />
      ) : (
        <main className="shell">
          <section className="panel empty">
            <h1>商品暂未上架</h1>
            <button className="button" onClick={() => navigate("/catalog")}>
              查看商品目录
            </button>
          </section>
        </main>
      )}
      <button
        className="floating-contact"
        aria-label="联系 QQ 客服"
        onClick={() => setModal("contact")}
      >
        <MessageCircle size={23} />
        <span>联系客服</span>
      </button>
      {modal === "contact" && (
        <Modal title="联系客服" close={() => setModal(null)}>
          <Contact settings={settings} notify={notify} />
        </Modal>
      )}
      {['notice', 'auto-notice', 'purchase-notice'].includes(modal) && <Announcement key={`${modal}-${path}`} settings={settings} close={() => setModal(null)} acknowledge={acknowledgeNotice} manual={modal === 'notice'} purchase={modal === 'purchase-notice'} copyQQ={copyQQ} />}
      {modal === "image" && product?.cover && (
        <Modal title="商品原图" close={() => setModal(null)} wide>
          <img className="full-image" src={product.cover} alt={product.title} />
        </Modal>
      )}
      {modal === "payment" && receipt && (
        <Payment
          receipt={receipt}
          settings={settings}
          onUpdate={saveReceipt}
          notify={notify}
          close={() => setModal(null)}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
export function App() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const updatePath = () => setPath(location.pathname);
    window.addEventListener('popstate', updatePath);
    return () => window.removeEventListener('popstate', updatePath);
  }, []);
  function openAdmin() {
    history.pushState({}, '', '/manage');
    setPath('/manage');
    scrollTo({ top: 0 });
  }
  return /^\/manage(?:\/|$)/.test(path) ? <Admin /> : <Storefront openAdmin={openAdmin} />;
}
