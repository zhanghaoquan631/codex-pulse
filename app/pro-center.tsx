import { ArrowUpRight, ExternalLink, Gamepad2, ImageIcon, LogIn, Monitor, ShieldCheck, Sparkles, UserRound } from 'lucide-react';

const proOrigin = 'https://mezip-art-playground.wozhe0196.chatgpt.site';
const sections = [
  { title: '个人空间', subtitle: '打开个人吊牌与账号空间', description: '使用原站账号，继续管理你的个人内容。', path: '/account/', icon: UserRound, tone: 'lavender' },
  { title: '作品与游戏', subtitle: '浏览作品，探索互动体验', description: '从作品主页进入你喜欢的画廊和游戏。', path: '/playground/', icon: Gamepad2, tone: 'green' },
] as const;

export default function ProCenter() {
  return <section className="pro-center">
    <div className="intro"><div><p className="eyebrow">我的应用 · 灵感与个人空间</p><h1>ME·zip Pro</h1><p className="intro-description">登录、个人空间和作品游戏，都从这里进入。</p></div><span className="pro-status"><ShieldCheck size={14}/>沿用原站账号</span></div>

    <div className="pro-launch-grid">
      <article className="pro-login-card">
        <div className="pro-brand"><span className="pro-brand-icon"><Sparkles size={23}/></span><span>ME·zip <b>PRO</b></span><span className="pro-cloud-label">线上应用</span></div>
        <div className="pro-login-copy"><p className="pro-kicker">欢迎回来</p><h2>打开你的<br/>灵感与收藏空间。</h2><p>登录 ME·zip Pro，继续浏览作品、管理个人内容，或开启下一场游戏。</p></div>
        <a className="pro-primary-link" href={`${proOrigin}/#login`} target="_blank" rel="noopener noreferrer"><LogIn size={17}/>打开登录页<ArrowUpRight size={17}/><span className="sr-only">（新页面）</span></a>
        <p className="pro-login-note">在原站使用 ChatGPT 登录，个人记录由原应用保存。</p>
      </article>

      <nav className="pro-shortcuts" aria-label="ME·zip Pro 功能入口">
        {sections.map(item => { const Icon = item.icon; return <a key={item.path} className={`pro-shortcut ${item.tone}`} href={proOrigin + item.path} target="_blank" rel="noopener noreferrer">
          <div className="pro-shortcut-top"><span className="pro-shortcut-icon"><Icon size={22}/></span><ExternalLink size={17}/></div>
          <h2>{item.title}<span className="sr-only">（新页面）</span></h2><strong>{item.subtitle}</strong><p>{item.description}</p><span className="pro-shortcut-action">进入应用<ArrowUpRight size={15}/></span>
        </a>; })}
      </nav>
    </div>

    <div className="pro-notes-grid">
      <section className="pro-info-card"><span className="pro-info-icon"><ImageIcon size={19}/></span><div><h2>熟悉的应用，独立打开</h2><p>每个入口会在新页面打开，保留原站完整的登录和使用流程。手机与其他电脑可使用上方线上入口。</p></div></section>
      <section className="pro-info-card pro-local-card"><span className="pro-info-icon"><Monitor size={19}/></span><div><h2>继续使用原本机版</h2><p>本机版和线上版分别保存数据。本机内容请在原电脑打开查看。</p><a href="http://127.0.0.1:5202/#login" target="_blank" rel="noopener noreferrer">打开本机 ME·zip Pro<ArrowUpRight size={14}/><span className="sr-only">（新页面，仅原电脑）</span></a></div></section>
    </div>
  </section>;
}
