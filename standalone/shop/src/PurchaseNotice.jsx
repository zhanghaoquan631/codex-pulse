// Owner's final notice, shared by the announcement and every product-entry popup.
export const PURCHASE_NOTICE_REVISION = '2026-09-19-v1';

export default function PurchaseNotice() {
  return <section className="purchase-notice" aria-labelledby="purchase-notice-title">
    <h3 id="purchase-notice-title">🔔 下单须知（请务必阅读）</h3>
    <p><strong>下单即视为已阅读并同意以下规则：</strong></p>
    <ol aria-label="下单规则">
      <li><span aria-hidden="true">1️⃣</span><strong>建议注册账号后下单，便于订单查询及售后处理</strong></li>
      <li><span aria-hidden="true">2️⃣</span><strong>所有 卡密 / 账户相关数据仅保留 7 天，请及时保存，逾期不补</strong></li>
      <li><span aria-hidden="true">3️⃣</span><strong>虚拟产品一经交付，不因密码被修改、个人操作失误等原因提供售后</strong></li>
      <li><span aria-hidden="true">4️⃣</span><strong>请按页面选择对应支付方式！</strong></li>
      <li><span aria-hidden="true">5️⃣</span><strong>欧易支付推荐使用X Layer支付链 无手续费！</strong></li>
      <li><span aria-hidden="true">6️⃣</span><strong>下单GPT Claude 每单都会送中转站余额5元【送给充值会员的用户，并非代理，请把余额送给用户，代理不要私吞】中转站地址：<a href="https://daitu.cc/" target="_blank" rel="noopener noreferrer">daitu.cc</a></strong></li>
      <li><span aria-hidden="true">7️⃣</span><strong>下单后请把你的订单号和已注册中转站的账号发我等待充值余额</strong></li>
    </ol>
  </section>;
}
