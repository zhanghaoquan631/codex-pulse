# 全功能源码运行导览

主站的 16 个导航板块与通用工具均有源码入口。按板块选择子功能后，可复制整理版提示词和实际代码，或下载模块 ZIP。代码中的 `===== FILE: 路径 =====` 标明文件边界；二进制资源保存在 ZIP。完整集成优先克隆仓库，模块包包含主站共享代码及该模块服务，不能把一段文本当作单文件应用运行。

功能定义见 [功能清单](../lib/feature-source-catalog.json)，逐项提示词见 [提示词目录](feature-prompts.md)，包大小和对应关系见 [覆盖记录](feature-source-coverage.json)。

## 主工作台

`npm run install:ci`、`npm run dev`、`npm run build`。页面与 API 在 `app/`，身份校验、数据处理在 `lib/`，数据库结构与迁移在 `db/`、`drizzle/`。本机增量采集在 `collector/`；先按 [开发说明](development.md) 配置 D1、采集鉴权和管理账号。

| 板块 | 主要实现与依赖 |
| --- | --- |
| Token 统计、网站收藏 | `app/dashboard.tsx`、`app/websites.tsx`、`collector/`，需要自己的日志和采集配置 |
| BetterOPC | `app/betteropc-center.tsx`，第三方原站 iframe 接入；没有第三方服务器代码 |
| 活动、财务、GitHub、媒体 | `standalone/mezip-local/`，本机服务通过 `collector/` 与 `integration/` 接入 |
| 知识库 | 主站 Compass / Trendshift API，加 `standalone/library/` 的完整内容库应用 |
| 书架、个人空间、小店 | `standalone/bookshelf/`、`standalone/mezip/`、`standalone/shop/` |
| 音乐 | `app/music-*`、`app/api/music/` 与 `standalone/go-music-dl/`；音乐平台本身为外部服务 |
| 预约 | `app/booking-center.tsx`、`app/api/booking/` 与 `standalone/booking-mail/` SMTP 服务 |
| QDuo | `app/qduo-center.tsx` 与 `integration/qduo-windows/`，按该目录文档构建 Windows 客户端 |
| 地图与游戏 | `examples/` 和 `public/` 中相应目录；保持原来源与资源许可 |
| 主题、阅读笔、权限、源码按钮 | `app/`、`lib/` 中对应组件及接口 |

## 独立应用

这些是独立源码快照，根目录的 npm 安装不会自动安装它们。

- `standalone/mezip/`：`npm run install:ci` 后 `npm run build`。包含个人空间、画廊、预约、交互作品、媒体及账号 API；查看该目录 README 配置 D1、R2、身份认证与邮件。赛车原版工程未取得，公开副本只提供自编扩展和外站入口。
- `standalone/library/`：在该目录 `npm ci`、`npm run build`。配置独立 Worker 的 D1/R2、登录及可选浏览器解析凭据；本机辅助脚本随源码提供。视频和直播还取决于浏览器能力及用户授权。
- `standalone/bookshelf/`：在该目录 `npm ci`、`npm run build`，之后 `npm run dev` 启动其 Wrangler 配置。按其脚本配置数据库与存储；公开副本的书籍和横幅种子为空。
- `standalone/shop/`：`npm ci`、`npm run start`；或按原 README 分别启动 Vite 与 API。自行设置管理员密码、SMTP、联系人和收款图。示例不具有原作者收款能力。
- `standalone/booking-mail/`：`npm ci`，复制 `.env.example` 为未跟踪 `.env`，填写自己的 SMTP 用户、授权码和接收地址，再 `npm start`。
- `standalone/go-music-dl/`：保留上游 Go 源码、`go.mod`、`go.sum`、Dockerfile、README 与 AGPL-3.0。按其 README 安装 Go 工具链、构建和启动，主站音乐接口另行设置服务地址；平台授权与内容不随仓库提供。

## 本机服务

`standalone/mezip-local/` 保留本工作台使用的 Web、服务、共享包、数据库迁移与测试。使用 Node.js 24.14+、pnpm 11.19+：

```bash
pnpm install
pnpm build
pnpm --filter @me-zip/web dev
pnpm --filter @me-zip/github-workspace dev:server
pnpm --filter @me-zip/social-connectors dev:local-capture
node services/finance-mobile-bridge/src/finance-mobile-bridge.mjs
```

各服务在独立终端启动。Web 中间件承担录制和截图接口；GitHub 服务使用部署者自己的授权；财务 OCR 需要额外 Python 环境，见其 README。本仓库未带入原机的 node_modules、编译目录、虚拟环境、运行数据库和个人媒体库。

## 发布与验证范围

v2 发布主应用和新增模块包；五个地图/游戏包仍在 v1。每个独立项目保留来源信息，公开副本去除原站绑定和个人配置。主站类型检查、生产构建以及源码复制入口均单独验证；导入的独立服务做了源码和依赖闭包检查，未声称所有服务都在全新环境完成部署或全部测试。邮件、账号授权、OCR 和第三方数据源需要使用者配置后联调。
