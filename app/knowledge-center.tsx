import { ArrowRight, ArrowUpRight, BookOpen, FolderOpen, Library, Link2, MapPinned, Plus, ShieldCheck, Smartphone, Tags } from "lucide-react";
import SourceActions from './source-actions';

const libraryUrl = "https://lingan-library.wozhe0196.chatgpt.site/";
const maps = [
  {
    title: "厦门 3D 地图",
    sourceId: 'xiamen-map' as const,
    url: "https://xiamen-3d-map.wozhe0196.chatgpt.site/",
    preview: "/previews/xiamen-3d-map.jpg",
    alt: "鼓浪屿海岸、建筑与街巷的厦门三维地图预览",
    description: "鼓浪屿的街巷与海岸，中山路的老街风貌。",
    topics: ["鼓浪屿", "中山路", "轮渡码头", "酒店"],
  },
  {
    title: "潮汕 3D 地图",
    sourceId: 'chaoshan-map' as const,
    url: "https://chaoshan-3d-map.wozhe0196.chatgpt.site/",
    preview: "/previews/chaoshan-3d-map.jpg",
    alt: "潮汕山林、城市、河流与海岸的三维地图全景",
    description: "汕头、潮州与揭阳的山海古城，连起南澳岛的海岸风光。",
    topics: ["汕头", "潮州", "揭阳", "南澳岛"],
  },
];
const features = [
  { icon: Library, title: "内容库", text: "把抖音、X 和网页收藏放在一起，大卡片浏览，点开专注阅读。" },
  { icon: BookOpen, title: "我的周刊", text: "挑选值得留下的内容，自己决定放进哪一期周刊。" },
  { icon: Tags, title: "标签归纳", text: "用自己的关键词整理主题，让收藏更容易找回来。" },
  { icon: FolderOpen, title: "素材箱", text: "收好自己制作的图片、文案和脚本，留待下一次创作。" },
];

export function KnowledgeEntry() {
  return <a className="knowledge-entry" href="#knowledge">
    <span className="knowledge-entry-icon"><Library size={27} aria-hidden="true" /></span>
    <span className="knowledge-entry-copy"><span className="knowledge-kicker">我的知识空间</span><strong>灵感库</strong><span>收集多平台内容 · 整理自己的周刊 · 手机随时记录</span></span>
    <span className="knowledge-entry-action">进入灵感库<ArrowRight size={18} aria-hidden="true" /></span>
  </a>;
}

export default function KnowledgeCenter() {
  return <section className="knowledge-center">
    <div className="intro"><div><p className="eyebrow">我的应用 · 记录与沉淀</p><h1>灵感库</h1><p className="intro-description">把每天遇见的好内容，整理成自己的知识。</p></div><span className="knowledge-private"><ShieldCheck size={15} aria-hidden="true" />登录后查看私人资料</span></div>

    <section className="knowledge-maps" aria-label="旅行地图">
      {maps.map(map => <article className="knowledge-map-card" key={map.url}>
        <a className="knowledge-map-preview" href={map.url} target="_blank" rel="noopener noreferrer" aria-label={`打开${map.title}`}>
          {/* Static screenshot of the published map, served without an image proxy. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={map.preview} width={1200} height={800} alt={map.alt} decoding="async" />
        </a>
        <div className="knowledge-map-copy">
          <p className="knowledge-map-kicker"><MapPinned size={16} aria-hidden="true" />山海行旅 · 公开地图</p>
          <h2>{map.title}</h2>
          <p className="knowledge-map-description">{map.description}</p>
          <ul className="knowledge-map-topics" aria-label="地图内容">{map.topics.map(topic => <li key={topic}>{topic}</li>)}</ul>
          <a className="knowledge-map-action" href={map.url} target="_blank" rel="noopener noreferrer">打开地图<span className="sr-only">（新页面）</span></a>
          <SourceActions project={map.sourceId}/>
        </div>
      </article>)}
    </section>

    <div className="knowledge-launch">
      <article className="knowledge-hero">
        <div className="knowledge-brand"><span><Library size={24} aria-hidden="true" /></span>灵感库<small>个人知识空间</small></div>
        <div className="knowledge-hero-copy"><p className="knowledge-kicker">先收下来，再慢慢整理</p><h2>每一份收藏，<br />都有自己的位置。</h2><p>从一条视频、一篇文章，到一期亲手编排的周刊。让散落在各个平台的灵感，在这里相遇。</p></div>
        <div className="knowledge-actions">
          <a className="knowledge-primary" href={libraryUrl} target="_blank" rel="noopener noreferrer">打开我的灵感库<ArrowUpRight size={18} aria-hidden="true" /><span className="sr-only">（新页面）</span></a>
          <a className="knowledge-secondary" href={`${libraryUrl}?capture=1`} target="_blank" rel="noopener noreferrer"><Plus size={17} aria-hidden="true" />收集一条灵感<span className="sr-only">（新页面）</span></a>
        </div>
        <p className="knowledge-login-note">手机和电脑使用同一个 ChatGPT 账号登录，即可查看云端资料。</p>
      </article>

      <div className="knowledge-features" aria-label="灵感库功能">
        {features.map(({ icon: Icon, title, text }) => <article className="knowledge-feature" key={title}><span className="knowledge-feature-icon"><Icon size={22} aria-hidden="true" /></span><h2>{title}</h2><p>{text}</p></article>)}
      </div>
    </div>

    <section className="knowledge-phone" aria-labelledby="knowledge-phone-title">
      <div className="knowledge-phone-heading"><span className="knowledge-phone-icon"><Smartphone size={23} aria-hidden="true" /></span><div><h2 id="knowledge-phone-title">手机怎么收集？</h2><p>在手机浏览器打开灵感库，登录同一个账号。</p></div></div>
      <ol className="knowledge-steps">
        <li><span>01</span><div><h3>复制链接</h3><p>在抖音或 X 的分享菜单中，复制想收藏的内容链接。</p></div></li>
        <li><span>02</span><div><h3>粘贴并保存</h3><p>进入灵感库，点「新建」，粘贴链接，确认封面和文案后点「保存内容」。</p></div></li>
        <li><span>03</span><div><h3>选择归属周刊</h3><p>到「内容库」选中条目，再选择要加入的周刊；也可以先收藏，以后再整理。</p></div></li>
      </ol>
      <div className="knowledge-phone-foot"><Link2 size={15} aria-hidden="true" /><p>可以将灵感库网址加入手机浏览器书签，方便下次打开。</p></div>
    </section>
  </section>;
}
