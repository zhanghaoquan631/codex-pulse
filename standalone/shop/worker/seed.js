// Public launch content only. Never import server/data/store.json: it holds customer orders.
export const seedSettings = {
  brandName: '我的小店',
  announcement: '官方GPT代充 · 正规渠道\n菲律宾官方资金 · 自动发货 · 15秒左右到账\n小本生意，售后靠谱，有问题随时找我\n第一次打开网站加载会慢一点\n请耐心等几秒钟就好啦～别急着关',
  wechat: '', qq: 'YOUR_QQ', backupQq: 'YOUR_BACKUP_QQ', telegram: '', paymentQr: '',
  wechatPaymentQr: '/assets/payment-placeholder.svg', alipayPaymentQr: '/assets/payment-placeholder.svg',
  contactQr: '', contactLabel: '联系咨询',
};
export const seedProduct = {
  id: '4', title: '✨ GPT /Codex 5X月卡 菲区CDK 自助充值 ·官充·秒到账·质保30天',
  summary: '菲律宾官方代充 · 5X套餐', description: '', price: 695, stock: null,
  status: 'published', cover: '/assets/product-4.png',
  createdAt: '2026-09-18T00:00:00.000Z', updatedAt: '2026-09-18T00:00:00.000Z',
};
