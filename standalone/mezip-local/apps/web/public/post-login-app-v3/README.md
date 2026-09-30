# ME.zip 登录后空间 V3

这是一个新的、独立可访问的登录后入口：

`/post-login-app-v3/index.html`

旧的 `/post-login-app/index.html` 保留不变。V3 在原有介绍卡和功能区基础上增加：

- GitHub 工作台连接状态检查，连接状态来自 `/v1/github-workspace/connection` 的真实响应；
- GitHub 工作台入口指向 `/github-workspace-v6/index.html#overview`；
- 全局行为时间轴入口指向 `/x-local-capture-v7/global-timeline.html`；
- 阅读历史入口继续指向 `/x-local-capture-v6/reading.html`。

## 授权持久化语义

本地 GitHub bridge 使用稳定的 loopback owner，并将连接状态和 token 保存在加密本地存储中。浏览器 cookie 只是本地会话引导，不代表永久 OAuth token：只要 GitHub App 安装仍有效、token 未被撤销，重新打开页面会恢复同一连接；如果 GitHub 撤销安装或 token 失效，页面会如实要求重新授权。

## 本地地址

开发时统一使用 `http://127.0.0.1:5174`，以便与项目的 `PUBLIC_APP_URL` 和 callback 配置保持一致。
