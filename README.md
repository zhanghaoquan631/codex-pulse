# Codex Pulse

一个集用量统计、知识整理、本机工具、3D 地图和游戏于一体的个人工作台。

[在线体验](https://codex-pulse-willow-0911.wozhe0196.chatgpt.site/) · [全功能源码包](https://github.com/zhanghaoquan631/codex-pulse/releases/tag/source-v2.0.0) · [提示词](docs/feature-prompts.md) · [运行导览](docs/full-source-guide.md)

![地图与互动体验](docs/screenshots/maps.png)

## 功能

- Token 统计、网站收藏、活动记录、知识库、书架与个人空间。
- 票据整理、小店、GitHub 工作台、录制截图、音乐和预约。
- 潮汕与厦门 3D 地图、潮汕行旅、公鸡快跑、浙大校园漫游。
- QDuo Windows 工具、主题、阅读笔，以及各板块的**复制提示词、复制源码、下载源码包**。

进入任一板块，在顶部选择具体功能即可复制。每个子功能有对应提示词，共用实现的子功能共用完整模块包。提示词根据现有功能整理，并非原始对话逐字记录。

![各功能的源码入口](docs/screenshots/all-features.png)

## 本地运行

使用 Node.js 24.5 或更新版本：

```bash
git clone https://github.com/zhanghaoquan631/codex-pulse.git
cd codex-pulse
npm run install:ci
npm run dev
```

运行 `npm run build` 构建主工作台。数据库、邮件、音乐来源、本机采集与 Windows 服务需要自行配置；各独立应用按 [运行导览](docs/full-source-guide.md) 启动。仓库不含线上数据库、登录凭据或个人采集记录。

## 源码目录

| 内容 | 目录 |
| --- | --- |
| 主界面、API 与数据库 | `app/`、`lib/`、`components/`、`drizzle/` |
| 灵感库、书架、个人空间、小店 | `standalone/library/`、`bookshelf/`、`mezip/`、`shop/` |
| 活动、票据、GitHub 与录制服务 | `standalone/mezip-local/`、`collector/`、`integration/` |
| SMTP 与音乐来源服务 | `standalone/booking-mail/`、`standalone/go-music-dl/` |
| 地图与游戏 | `examples/`、`public/local-apps/chaoshan-atlas/`、`public/games/` |
| 功能清单、提示词与复制组件 | `lib/feature-source-catalog.json`、`lib/source-library.ts`、`app/feature-source-panel.tsx` |

复制源码得到按文件路径分段的真实代码；ZIP 保留目录和可分发资源。[地图与游戏 v1 包](https://github.com/zhanghaoquan631/codex-pulse/releases/tag/source-v1.0.0) 继续有效。[完整功能清单](docs/feature-source-coverage.json) 标明模块对应关系。

## 来源与许可

React 19 · Vinext · TypeScript · Three.js · Cloudflare Workers / D1

这是源码公开集合，没有统一的全仓库 MIT 授权。新增复制功能采用 MIT；QDuo 为 GPL-3.0-or-later，Go Music DL 为 AGPL-3.0，其他代码和资源保留各自许可。BetterOPC 提供本站接入代码；APEX 赛车仅提供自编扩展与接入代码，未取得原版工程。受限模型与部分第三方插画不随包分发。详见 [LICENSES.md](LICENSES.md)。
