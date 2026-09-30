import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./pulse.css";
import "./websites.css";
import "./ledger.css";
import "./activity.css";
import "./console.css";
import "./token-sections.css";
import "./shop.css";
import "./atlas.css";
import "./pro.css";
import "./knowledge.css";
import "./theme.css";
import "./snow.css";
import "./music.css";
import "./microphone.css";
import "./booking.css";
import "./rooster.css";
import "./betteropc.css";
import "./account-overview.css";
import "./edge-scenes.css";
import "./interactions.css";
import "./qduo.css";
import "./qduo-safety.css";
import "./fullscreen.css";
import "./bookshelf.css";
import "./mobile.css";
import "./source-actions.css";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export const metadata: Metadata = {
  title: "Codex Pulse · 个人数据中心",
  description: "实时查看本机 Codex 用量、缓存命中和自动保存的网站收藏。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("codex-pulse:theme:v1");document.documentElement.dataset.pulseTheme=t==="dark"||t==="eink"?t:"light"}catch(e){document.documentElement.dataset.pulseTheme="light"}` }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
