# MEZIP 独立应用源码

包含个人空间、作品主页、画廊、预约、媒体管理与账号服务器。来源提交见 `SOURCE-PROVENANCE.json`。个人配置已改示例，原站数据库、R2 与身份绑定不提供。

```bash
npm run install:ci
npm run build
```

构建脚本分别构建 `apps/main`、`apps/account`、`apps/gallery`，再打包 Worker。数据库结构在 `db/` / `drizzle/`，身份与邮件变量见 `.env.example`。需自行配置 Worker 的 D1、R2、认证客户端、公开域名和邮件来源。

`apps/main/src` 是各互动作品的可编辑 React 组件。`apps/racing` 只保留自编扩展与接入代码；原版 APEX 的工程源码未取得，其构建代码、模型与音频不随公开包分发，详见该目录 `SOURCE-NOTES.md`。
