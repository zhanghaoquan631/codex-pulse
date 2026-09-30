// Content reference: https://0xzheng.com/item/4, retrieved 2026-09-19.
// Owner confirmed permission to reuse this content on 2026-09-19. No original site scripts are copied.
// Delivery wording is deliberately unchanged at the owner's explicit request.
import BackupQQ from './BackupQQ.jsx';

const block = (from, to, shadow, overrides = {}) => ({
  background: `linear-gradient(90deg, ${from}, ${to})`,
  padding: '14px 18px', borderRadius: 10, margin: '15px 0',
  textAlign: 'center', boxShadow: `0 4px 12px ${shadow}`, ...overrides,
});
const mainText = {fontSize: 18, color: '#fff', fontWeight: 600};
const linkText = {color: '#fff', fontSize: 20, fontWeight: 'bold', textDecoration: 'none', letterSpacing: '0.5px'};
const smallText = {fontSize: 15, marginTop: 6, display: 'inline-block', lineHeight: 1.6};

function ContactBlock({qq, backupQq, bottom = false}) {
  return <div style={block('#0088cc', '#00a0e3', bottom ? 'rgba(0,136,204,0.4)' : 'rgba(0,136,204,0.35)', bottom ? {padding: '16px 18px', margin: '25px 0 10px', boxShadow: '0 4px 15px rgba(0,136,204,0.4)'} : {})}>
    <div style={{...mainText, marginBottom: 6}}>{bottom ? '有问题随时找我' : '需要联系客服？直接戳我'}</div>
    <a href={`https://wpa.qq.com/msgrd?v=3&uin=${encodeURIComponent(qq)}&site=qq&menu=yes`} target="_blank" rel="noreferrer" style={linkText}>QQ：{qq}</a>
    <div style={{fontSize: 14, color: '#e3f2fd', marginTop: 6}}>点击直接跳转QQ · 秒回</div>
    <BackupQQ number={backupQq} />
  </div>;
}

export default function OriginalDetails({settings = {}, children}) {
  const qq = String(settings.qq || 'YOUR_QQ');
  const redeemUrl = settings.redeemUrl || 'https://cz.0xzheng.com/';
  return <section className="panel original-details" style={{marginBottom: 22}}>
    <header className="panel-header"><h2 className="panel-title" style={{fontSize: 'clamp(1rem, 1.35vw, 1.45rem)', letterSpacing: '-0.04em'}}>宝贝详情</h2></header>
    <div className="panel-body original-rich" style={{overflowWrap: 'anywhere'}}>
      {children}
      <style>{`.original-rich h2{margin:1.4em 0 .6em;line-height:1.35;font-weight:700;font-size:1.3em}.original-rich ul{margin:0 0 1em;padding-left:1.6em}.original-rich li{margin:.25em 0;list-style:disc}.original-rich>:first-child{margin-top:0}.original-rich>:last-child{margin-bottom:0}`}</style>
      <div style={block('#6a1b9a', '#8e24aa', 'rgba(106,27,154,0.4)', {margin: '0 0 18px', boxShadow: '0 4px 15px rgba(106,27,154,0.4)'})}>
        <div style={{fontSize: 16, color: '#f3e5f5', marginBottom: 4}}>兑换网站（点这里进去兑换）</div>
        <a href={redeemUrl} target="_blank" rel="noreferrer" style={{...linkText, fontSize: 22}}>{redeemUrl}</a>
      </div>

      <h2 style={{color: '#e74c3c'}}><strong>菲律宾官方代充 · 5X套餐</strong></h2>

      <div style={block('#ef6c00', '#f57c00', 'rgba(239,108,0,0.35)')}>
        <span style={{fontSize: 20, color: '#fff', fontWeight: 'bold'}}>支持 PLUS ➡️ 5X ➡️ 20X 覆盖升级</span><br />
        <span style={{...smallText, color: '#fff8e1'}}>已有Plus可直接升5X · 后续还能继续升20X<br />不用重新开号，覆盖升级更省心</span>
      </div>

      <div style={block('#00796b', '#00897b', 'rgba(0,121,107,0.35)', {padding: '12px 18px'})}>
        <span style={{fontSize: 22, color: '#fff', fontWeight: 'bold', textShadow: '1px 1px 3px rgba(0,0,0,0.3)'}}>⚡ 下单后<strong>全自动发货</strong> ｜ <strong>15秒极速充值到账</strong> ⚡</span><br />
        <span style={{fontSize: 16, color: '#fff', marginTop: 6, display: 'inline-block'}}>无需人工等待 · 24小时无人值守 · 秒充即用！</span>
      </div>

      <ContactBlock qq={qq} backupQq={settings.backupQq} />

      <div style={block('#37474f', '#455a64', 'rgba(55,71,79,0.3)', {padding: '12px 18px'})}>
        <span style={mainText}>⭐ 按 <strong>Ctrl + D</strong>（Windows）或 <strong>Command + D</strong>（Mac）</span><br />
        <span style={{fontSize: 15, color: '#eceff1', marginTop: 5, display: 'inline-block'}}>一键收藏本站，方便不时之需，下次直接打开更省心</span>
      </div>

      <div style={block('#5d4037', '#6d4c41', 'rgba(93,64,55,0.3)')}>
        <span style={mainText}>🙏 小本生意 · 利润微薄</span><br />
        <span style={{...smallText, color: '#efebe9'}}>我不是大店，赚的不多，全靠用心服务和靠谱售后撑着<br />有问题随时找我，售后绝不推诿、不拖延，承诺负责到底<br />希望每一位买家都能买得放心、用得安心</span>
      </div>

      <h2 style={{color: '#e67e22'}}>下单前必读 以下条款请确认接受后再拍，任意一条不能接受都不建议购买。</h2>
      <ul>
        <li style={{color: '#27ae60'}}>✅需已有GPT账号，没有账号无法使用。</li>
        <li style={{color: '#27ae60'}}>✅账号需为个人版，如果加入过Team空间，请先切回个人版再获取Token，否则可能充值失败。</li>
        <li style={{color: '#27ae60'}}>✅接受不退不换，卡密售出后，除非出现卡密无法兑换问题，否则不退不换。</li>
        <li style={{color: '#27ae60'}}>✅30天掉订阅包赔：承诺质保30天不掉订阅！若期间出现掉订阅情况，按天为您退还差价，售后到底。</li>
        <li style={{color: '#c0392b'}}>✅仅限个人正常使用，若拿去中转反代、代认证过KYC 或其它可能会导致封号的行为，则不在质保范围内。【封号官方一般不退款】</li>
      </ul>

      <ContactBlock qq={qq} backupQq={settings.backupQq} bottom />
    </div>
  </section>;
}
