import { useEffect, useState } from 'react';

import type { AppRoute } from './appModel.js';
import type { ExperienceTier } from './experienceSettings.js';
import {
  canUseMembershipSimulator,
  formatBytes,
  formatCnyFen,
  membershipPreviewScenarios,
  planLabel,
  readMembershipCenterPreview,
  type MembershipBenefitState,
  type MembershipCenterReadResult,
  type MembershipCenterSnapshot,
  type MembershipOrderStatus,
  type MembershipPreviewScenario,
} from './membershipCenterClient.js';

function formatDate(iso: string | null): string {
  if (iso === null) return '不适用';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '待服务端确认';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function sourceLabel(snapshot: MembershipCenterSnapshot): string {
  return snapshot.source === 'SERVER' ? 'SERVER CONFIRMED' : 'DEV SYNTHETIC PROJECTION';
}

function statusClass(status: string): string {
  return `membership-state membership-state-${status.toLowerCase()}`;
}

function stateLabel(state: MembershipBenefitState | MembershipOrderStatus): string {
  const labels: Readonly<Record<string, string>> = {
    AVAILABLE: '可使用',
    ACTIVE: '生效中',
    USED: '已使用',
    EXPIRED: '已到期',
    PENDING_PAYMENT: '等待支付确认',
    PAID: '已支付',
    FULFILLED: '已开通',
    FAILED: '失败',
    CANCELLED: '已取消',
    CREATED: '已创建，等待确认',
    REFUNDING: '退款处理中',
    REFUNDED: '已退款',
  };
  return labels[state] ?? state;
}

function useMembershipCenter(
  scenario: MembershipPreviewScenario,
  refreshKey = 0,
): MembershipCenterReadResult | null {
  const [result, setResult] = useState<MembershipCenterReadResult | null>(null);

  useEffect(() => {
    let active = true;
    setResult(null);
    void readMembershipCenterPreview(scenario).then((next) => {
      if (active) setResult(next);
    });
    return () => {
      active = false;
    };
  }, [refreshKey, scenario]);

  return result;
}

function MembershipDataNotice({
  snapshot,
}: {
  readonly snapshot: MembershipCenterSnapshot;
}) {
  return (
    <section className="membership-data-notice" aria-live="polite">
      <span className={statusClass(snapshot.serverConfirmed ? 'active' : 'mock_dev')}>
        {sourceLabel(snapshot)}
      </span>
      <p>
        {snapshot.serverConfirmed
          ? '方案、到期日、订单和权益均由服务端投影。'
          : '这是开发期合成投影，只用于检查界面状态；不会创建订单、扣款、授予权益或改变账户。'}
      </p>
    </section>
  );
}

function MembershipPreviewControls({
  scenario,
  onScenarioChange,
}: {
  readonly scenario: MembershipPreviewScenario;
  readonly onScenarioChange: (scenario: MembershipPreviewScenario) => void;
}) {
  if (!canUseMembershipSimulator()) return null;
  return (
    <section
      className="membership-preview-controls"
      aria-labelledby="membership-preview-title"
    >
      <div>
        <p className="eyebrow">DEV-ONLY / READ-ONLY VIEW SIMULATOR</p>
        <h2 id="membership-preview-title">会员状态预览</h2>
        <p>
          仅切换本地只读视觉投影，不会模拟付款、创建订单、授予会员，也不改变任何账户或
          Root 权限。
        </p>
      </div>
      <fieldset>
        <legend className="sr-only">选择预览状态</legend>
        {membershipPreviewScenarios.map((item) => (
          <button
            aria-pressed={scenario === item.code}
            className={scenario === item.code ? 'selected' : undefined}
            key={item.code}
            type="button"
            onClick={() => onScenarioChange(item.code)}
          >
            {item.label}
          </button>
        ))}
      </fieldset>
    </section>
  );
}

function MembershipCurrentCard({
  snapshot,
}: {
  readonly snapshot: MembershipCenterSnapshot;
}) {
  const { membership } = snapshot;
  return (
    <section
      className="membership-current-card"
      aria-labelledby="current-membership-title"
    >
      <div className="membership-current-head">
        <div>
          <p className="eyebrow">CURRENT MEMBERSHIP</p>
          <h2 id="current-membership-title">{planLabel(membership.planCode)}</h2>
        </div>
        <span className={statusClass(membership.status)}>
          {membership.status === 'ACTIVE'
            ? '生效中'
            : membership.status === 'EXPIRED'
              ? '已到期'
              : '免费方案'}
        </span>
      </div>
      <dl className="membership-current-details">
        <div>
          <dt>开始时间</dt>
          <dd>{formatDate(membership.startsAt)}</dd>
        </div>
        <div>
          <dt>到期时间</dt>
          <dd>{formatDate(membership.expiresAt)}</dd>
        </div>
        <div>
          <dt>续期方式</dt>
          <dd>{membership.autoRenewing ? '自动续期' : '主动续期，不自动扣费'}</dd>
        </div>
      </dl>
      <p className="membership-private-note">
        所有私人 Life、Timeline、媒体、健身与消息仍以 owner scope
        隔离；任何会员等级都不会开放其他人的私人数据。
      </p>
    </section>
  );
}

function MembershipPlans({
  snapshot,
  onCheckoutNotice,
}: {
  readonly snapshot: MembershipCenterSnapshot;
  readonly onCheckoutNotice: () => void;
}) {
  return (
    <section aria-labelledby="membership-plans-title">
      <div className="membership-section-heading">
        <div>
          <p className="eyebrow">PLANS / CNY FEN</p>
          <h2 id="membership-plans-title">月度通行证</h2>
        </div>
        <p>价格仅展示服务端目录的整数 CNY fen；浏览器不能传入金额。</p>
      </div>
      <div className="membership-plan-grid">
        {snapshot.plans.map((plan) => {
          const current = snapshot.membership.planCode === plan.code;
          const checkoutUnavailable = snapshot.actions.checkout !== 'AVAILABLE';
          return (
            <article
              className={`membership-plan-card membership-plan-card-${plan.code.toLowerCase()}${plan.featured ? ' membership-plan-card-featured' : ''}`}
              data-amount-fen={plan.amountFen}
              key={plan.code}
            >
              <div className="membership-plan-card-head">
                <p>{plan.label}</p>
                {current ? (
                  <span className={statusClass('active')}>当前方案</span>
                ) : null}
              </div>
              <strong>{plan.priceLabel}</strong>
              <p>{plan.summary}</p>
              <ul>
                {plan.additions.map((addition) => (
                  <li key={addition}>{addition}</li>
                ))}
              </ul>
              <button
                aria-describedby={
                  checkoutUnavailable ? 'membership-payment-unavailable' : undefined
                }
                className="membership-primary-action"
                disabled={current || checkoutUnavailable}
                type="button"
                onClick={onCheckoutNotice}
              >
                {current
                  ? '当前方案'
                  : checkoutUnavailable
                    ? '等待服务端支付配置'
                    : '继续到安全结算'}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MembershipHistory({
  snapshot,
}: {
  readonly snapshot: MembershipCenterSnapshot;
}) {
  return (
    <section
      className="membership-history-panel"
      aria-labelledby="membership-history-title"
    >
      <div className="membership-section-heading">
        <div>
          <p className="eyebrow">MEMBERSHIP HISTORY / SERVER AUDIT</p>
          <h2 id="membership-history-title">会员状态记录</h2>
        </div>
        <p>只显示当前会话有权读取的去标识化状态记录，不展示用户或操作人身份。</p>
      </div>
      <div className="membership-coupon-list">
        {snapshot.history.length === 0 ? (
          <p className="membership-empty-state">暂时没有可展示的会员状态记录。</p>
        ) : (
          snapshot.history.map((event) => (
            <article key={event.id}>
              <div>
                <h4>{event.title}</h4>
                <p>状态由服务端记录，浏览器不能自行写入或改写。</p>
              </div>
              <div>
                <span className={statusClass('active')}>已记录</span>
                <small>{formatDate(event.occurredAt)}</small>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function Entitlements({ snapshot }: { readonly snapshot: MembershipCenterSnapshot }) {
  return (
    <section
      className="membership-entitlement-panel"
      aria-labelledby="membership-entitlements-title"
    >
      <div className="membership-section-heading">
        <div>
          <p className="eyebrow">ENTITLEMENTS / SERVER DECISION</p>
          <h2 id="membership-entitlements-title">当前权益</h2>
        </div>
        <p>权限由服务端逐项决策，不以浏览器中的套餐名称授权。</p>
      </div>
      <div className="membership-entitlement-list">
        {snapshot.membership.entitlements.map((entry) => (
          <article key={entry.code}>
            <div>
              <strong>{entry.label}</strong>
              <small>{entry.code}</small>
            </div>
            <div>
              <span className={statusClass(entry.state)}>
                {entry.state === 'ACTIVE'
                  ? '可用'
                  : entry.state === 'EXPIRED'
                    ? '已到期'
                    : '未授予'}
              </span>
              {entry.expiresAt !== null ? (
                <small>至 {formatDate(entry.expiresAt)}</small>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function StorageCard({ snapshot }: { readonly snapshot: MembershipCenterSnapshot }) {
  const { storage } = snapshot;
  const ratio =
    storage.limitBytes === 0
      ? 0
      : Math.min(100, Math.round((storage.usedBytes / storage.limitBytes) * 100));
  return (
    <section
      className={`membership-storage-card membership-storage-${storage.state.toLowerCase()}`}
      aria-labelledby="membership-storage-title"
    >
      <div className="membership-current-head">
        <div>
          <p className="eyebrow">STORAGE / SERVER-CALCULATED</p>
          <h2 id="membership-storage-title">媒体存储</h2>
        </div>
        <span className={statusClass(storage.state)}>
          {storage.state === 'OVER_QUOTA' ? '超额' : '额度内'}
        </span>
      </div>
      <strong>
        {formatBytes(storage.usedBytes)}{' '}
        <small>/ {formatBytes(storage.limitBytes)}</small>
      </strong>
      <div
        aria-label={`已使用 ${ratio}%`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={ratio}
        className="membership-storage-meter"
        role="progressbar"
      >
        <span style={{ width: `${ratio}%` }} />
      </div>
      <p>{storage.detail}</p>
    </section>
  );
}

function OrderHistory({ snapshot }: { readonly snapshot: MembershipCenterSnapshot }) {
  return (
    <section
      className="membership-orders-panel"
      aria-labelledby="membership-orders-title"
    >
      <div className="membership-section-heading">
        <div>
          <p className="eyebrow">ORDERS / SERVER HISTORY</p>
          <h2 id="membership-orders-title">订单与购买记录</h2>
        </div>
        <p>
          订单归属、金额和状态均须由服务端验证；不能通过 URL 或客户端 ID
          读取其他用户订单。
        </p>
      </div>
      <div className="membership-order-table-wrap" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">订单</th>
              <th scope="col">方案</th>
              <th scope="col">应付</th>
              <th scope="col">状态</th>
              <th scope="col">创建时间</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.orders.map((item) => (
              <tr key={item.id}>
                <td>
                  <code>{item.orderNo}</code>
                </td>
                <td>{planLabel(item.planCode)}</td>
                <td>{formatCnyFen(item.payableAmountFen)}</td>
                <td>
                  <span className={statusClass(item.status)}>
                    {stateLabel(item.status)}
                  </span>
                </td>
                <td>{formatDate(item.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PaymentState({
  snapshot,
  notice,
}: {
  readonly snapshot: MembershipCenterSnapshot;
  readonly notice: string;
}) {
  const isPending = snapshot.payment.state === 'PENDING';
  return (
    <section
      className={`membership-payment-panel membership-payment-${snapshot.payment.state.toLowerCase()}`}
      aria-labelledby="membership-payment-title"
    >
      <div>
        <p className="eyebrow">PAYMENT / PROVIDER CALLBACK REQUIRED</p>
        <h2 id="membership-payment-title">支付确认</h2>
      </div>
      <span className={statusClass(snapshot.payment.state)}>
        {isPending
          ? '正在确认支付结果'
          : snapshot.payment.state === 'FAILED'
            ? '支付未确认'
            : snapshot.payment.state === 'VERIFIED'
              ? '已验证投影样例'
              : '尚未配置'}
      </span>
      <p id="membership-payment-unavailable">{snapshot.payment.detail}</p>
      <p>
        会员仅会在 Provider
        回调签名、订单金额、币种和幂等性全部由服务端验证后开通。当前界面不会把任何按钮点击视为支付成功。
      </p>
      <div className="membership-payment-provider-projection">
        <div>
          <p className="eyebrow">PROVIDER / SERVER CAPABILITY</p>
          <h3>支付渠道状态</h3>
        </div>
        <p>这只是服务端能力投影；当前 Web 版本不会创建订单、跳转付款或调用原生支付。</p>
        <div className="membership-coupon-list">
          {snapshot.paymentProviders.length === 0 ? (
            <p className="membership-empty-state">
              服务端尚未确认可展示的支付渠道，结算入口保持关闭。
            </p>
          ) : (
            snapshot.paymentProviders.map((provider) => {
              const verified =
                provider.checkoutAvailable && provider.callbackVerificationAvailable;
              return (
                <article key={provider.provider}>
                  <div>
                    <h4>{provider.label}</h4>
                    <p>
                      {verified
                        ? `${provider.readiness}：服务端已确认具备结算与回调验证能力；此版本仍未开放 Web 结算。`
                        : `${provider.readiness}：服务端尚未确认完整的结算与回调验证条件。`}
                    </p>
                  </div>
                  <div>
                    <span
                      className={statusClass(verified ? 'available' : 'not_configured')}
                    >
                      {verified ? '服务端已确认' : '尚未完整配置'}
                    </span>
                    <small>
                      {provider.callbackVerificationAvailable
                        ? '回调验证已投影'
                        : '回调验证未确认'}
                    </small>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
      {notice.length > 0 ? (
        <p className="membership-inline-notice" role="status">
          {notice}
        </p>
      ) : null}
    </section>
  );
}

function BenefitsAndCoupons({
  snapshot,
  compact,
  onNavigate,
  onRefresh,
}: {
  readonly snapshot: MembershipCenterSnapshot;
  readonly compact: boolean;
  readonly onNavigate?: (route: AppRoute) => void;
  readonly onRefresh?: () => void;
}) {
  const [redemptionNotice, setRedemptionNotice] = useState('');
  const visibleBenefits = compact ? snapshot.benefits.slice(0, 2) : snapshot.benefits;
  return (
    <section
      className="membership-benefits-panel"
      aria-labelledby="membership-benefits-title"
    >
      <div className="membership-section-heading">
        <div>
          <p className="eyebrow">BENEFITS / AUDITABLE GRANTS</p>
          <h2 id="membership-benefits-title">我的福利</h2>
        </div>
        {compact && onNavigate !== undefined ? (
          <button
            className="quiet-button"
            type="button"
            onClick={() => onNavigate('/benefits')}
          >
            查看全部福利
          </button>
        ) : !compact && onRefresh !== undefined ? (
          <button className="quiet-button" type="button" onClick={onRefresh}>
            重新检查福利服务
          </button>
        ) : null}
      </div>
      <div className="membership-benefit-grid">
        {visibleBenefits.map((benefit) => (
          <article key={benefit.id}>
            <span className={statusClass(benefit.state)}>
              {stateLabel(benefit.state)}
            </span>
            <h3>{benefit.title}</h3>
            <p>{benefit.detail}</p>
            <small>
              {benefit.expiresAt === null
                ? '长期有效或由服务端状态决定'
                : `至 ${formatDate(benefit.expiresAt)}`}
            </small>
          </article>
        ))}
      </div>
      {!compact ? (
        <>
          <div className="membership-coupon-heading">
            <div>
              <p className="eyebrow">COUPONS / SERVER VALIDATION</p>
              <h3>优惠券</h3>
            </div>
            <p>折扣、可用次数、到期与订单归属均由服务端验证。</p>
          </div>
          <div className="membership-coupon-list">
            {snapshot.coupons.map((coupon) => (
              <article key={coupon.id}>
                <div>
                  <h4>{coupon.title}</h4>
                  <p>{coupon.detail}</p>
                  {coupon.codeHint !== null ? <code>{coupon.codeHint}</code> : null}
                </div>
                <div>
                  <span className={statusClass(coupon.state)}>
                    {stateLabel(coupon.state)}
                  </span>
                  <small>
                    {coupon.expiresAt === null
                      ? '无单独到期日'
                      : `至 ${formatDate(coupon.expiresAt)}`}
                  </small>
                </div>
              </article>
            ))}
          </div>
          <div className="membership-coupon-heading">
            <div>
              <p className="eyebrow">REDEMPTIONS / SERVER HISTORY</p>
              <h3>兑换记录</h3>
            </div>
            <p>兑换、防重放和权益兑现均以服务端记录为准。</p>
          </div>
          <div className="membership-coupon-list">
            {snapshot.redemptions.length === 0 ? (
              <p className="membership-empty-state">暂时没有可展示的兑换记录。</p>
            ) : (
              snapshot.redemptions.map((redemption) => (
                <article key={redemption.id}>
                  <div>
                    <h4>{redemption.title}</h4>
                    <p>{redemption.detail}</p>
                  </div>
                  <div>
                    <span className={statusClass(redemption.state)}>
                      {stateLabel(redemption.state)}
                    </span>
                    <small>
                      {redemption.redeemedAt === null
                        ? '未产生可展示兑换时间'
                        : `于 ${formatDate(redemption.redeemedAt)} 兑换`}
                    </small>
                  </div>
                </article>
              ))
            )}
          </div>
          <form
            className="membership-redemption-form"
            onSubmit={(event) => {
              event.preventDefault();
              setRedemptionNotice(
                snapshot.actions.redemption === 'AVAILABLE'
                  ? '服务端已允许展示兑换能力，但此 Web 版本尚未开放提交兑换；没有发送、记录或兑现任何兑换码。'
                  : '兑换服务尚未配置；没有发送、记录或兑现任何兑换码。你可以先重新检查福利服务。',
              );
            }}
          >
            <div>
              <label htmlFor="membership-redemption-code">兑换码</label>
              <input
                autoComplete="off"
                id="membership-redemption-code"
                inputMode="text"
                maxLength={128}
                name="redemptionCode"
                placeholder="服务端接入后可安全验证"
              />
            </div>
            <button
              aria-describedby={
                snapshot.actions.redemption !== 'AVAILABLE'
                  ? 'membership-redemption-unavailable'
                  : undefined
              }
              type="submit"
            >
              {snapshot.actions.redemption === 'AVAILABLE'
                ? '检查兑换状态'
                : '检查兑换服务'}
            </button>
            {snapshot.actions.redemption !== 'AVAILABLE' ? (
              <p id="membership-redemption-unavailable">
                兑换入口尚未由服务端开启；此按钮只说明当前状态，不会提交兑换码。
              </p>
            ) : null}
            {redemptionNotice.length > 0 ? (
              <p role="status">{redemptionNotice}</p>
            ) : null}
          </form>
        </>
      ) : null}
    </section>
  );
}

function MembershipUnavailable({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry?: () => void;
}) {
  return (
    <section className="membership-unavailable" aria-live="polite">
      <p className="eyebrow">MEMBERSHIP / FAIL CLOSED</p>
      <h1>会员服务等待安全连接</h1>
      <p>{message}</p>
      <p>为保护价格、订单和私人权益，未确认的浏览器状态不会替代服务端结果。</p>
      {onRetry !== undefined ? (
        <button className="quiet-button" type="button" onClick={onRetry}>
          重新检查服务连接
        </button>
      ) : null}
    </section>
  );
}

export function MembershipCenterPage({
  tier,
  onNavigate,
}: {
  readonly tier: ExperienceTier;
  readonly onNavigate: (route: AppRoute) => void;
}) {
  // Keep the membership centre visually aligned with the monthly-pass preview
  // in the post-login space. This changes presentation only; all membership,
  // entitlement and payment states still come from the existing projection.
  const referencePalette = true;
  const [scenario, setScenario] = useState<MembershipPreviewScenario>('ACTIVE');
  const [checkoutNotice, setCheckoutNotice] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const retry = () => setRefreshKey((value) => value + 1);
  const result = useMembershipCenter(scenario, refreshKey);

  if (result === null) {
    return (
      <section className="membership-loading" aria-live="polite">
        <p>正在读取服务端会员投影…</p>
      </section>
    );
  }
  if (result.kind === 'UNAVAILABLE')
    return <MembershipUnavailable message={result.message} onRetry={retry} />;

  const { snapshot } = result;
  return (
    <div className={`page-stack route-shell membership-center-page${referencePalette ? ' membership-color-reference-v2' : ''}`} data-tier={tier}>
      <section className="route-heading membership-route-heading">
        <div>
          <p className="eyebrow">MEMBERSHIP / ENTITLEMENTS / BENEFITS</p>
          <h1>会员中心</h1>
          <p className="lede">
            你的月度通行证、权益、福利、存储和订单只以服务端确认结果为准。
          </p>
        </div>
      </section>
      <MembershipDataNotice snapshot={snapshot} />
      <MembershipPreviewControls scenario={scenario} onScenarioChange={setScenario} />
      <MembershipCurrentCard snapshot={snapshot} />
      <MembershipHistory snapshot={snapshot} />
      <MembershipPlans
        snapshot={snapshot}
        onCheckoutNotice={() =>
          setCheckoutNotice(
            '支付 Provider 尚未配置；未创建订单、未扣款、未改变会员权益。',
          )
        }
      />
      <div className="membership-center-split">
        <Entitlements snapshot={snapshot} />
        <StorageCard snapshot={snapshot} />
      </div>
      <BenefitsAndCoupons compact snapshot={snapshot} onNavigate={onNavigate} />
      <OrderHistory snapshot={snapshot} />
      <PaymentState notice={checkoutNotice} snapshot={snapshot} />
    </div>
  );
}

export function BenefitsCenterPage({ tier }: { readonly tier: ExperienceTier }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const retry = () => setRefreshKey((value) => value + 1);
  const result = useMembershipCenter('ACTIVE', refreshKey);
  if (result === null)
    return (
      <section className="membership-loading" aria-live="polite">
        <p>正在读取福利投影…</p>
      </section>
    );
  if (result.kind === 'UNAVAILABLE')
    return <MembershipUnavailable message={result.message} onRetry={retry} />;
  return (
    <div className="page-stack route-shell membership-center-page" data-tier={tier}>
      <section className="route-heading membership-route-heading">
        <div>
          <p className="eyebrow">BENEFITS / COUPONS / REDEMPTION</p>
          <h1>福利中心</h1>
          <p className="lede">福利授予、优惠券与兑换均可审计，并且需要服务端验证。</p>
        </div>
      </section>
      <MembershipDataNotice snapshot={result.snapshot} />
      <BenefitsAndCoupons
        compact={false}
        snapshot={result.snapshot}
        onRefresh={retry}
      />
    </div>
  );
}
