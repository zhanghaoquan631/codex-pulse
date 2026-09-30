# ME.zip 本机服务源码快照

提供 Codex Pulse 使用的 Web、活动采集、财务、GitHub 工作台、录制与截图服务，以及它们依赖的共享包、数据库迁移和测试。原项目的小程序和 iOS 应用未被此工作台使用，不属于此快照。

使用 Node.js 24.14+、pnpm 11.19+，在本目录执行 `pnpm install`、`pnpm build`。按需分别启动：

```bash
pnpm --filter @me-zip/web dev
pnpm --filter @me-zip/github-workspace dev:server
pnpm --filter @me-zip/social-connectors dev:local-capture
node services/finance-mobile-bridge/src/finance-mobile-bridge.mjs
```

Web 的 Vite 中间件包含媒体 API；数据库迁移在 `infrastructure/database`。GitHub 与外部服务由使用者提供自己的凭据，创建的数据库、配对信息与 `.env` 保持本地不提交。本快照不要求复制一个不存在的全局环境文件；各服务按其实际环境变量读取进行配置。

财务 OCR 的 Python 安装步骤见 `services/finance-mobile-bridge/README.md`。这些是源码导入与静态依赖检查通过的快照，未在本次发布中运行全部服务测试。完整接入说明见主仓库 `docs/full-source-guide.md`。
