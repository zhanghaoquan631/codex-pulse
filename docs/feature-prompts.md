# 逐功能复现提示词

以下为按现有功能整理的提示词，不是原始对话记录。每项链接对应真实源码入口；共用实现的子功能共用完整模块包。

## Token 统计

### 用量总览

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/dashboard.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/tokens.zip)

```text
请实现“Token 统计”中的“用量总览”功能，交付可编辑源码和运行说明。

功能要求：汇总输入、输出、缓存、调用次数，按时间和账号筛选，绘制趋势与热力图。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 账号与额度

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/dashboard.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/tokens.zip)

```text
请实现“Token 统计”中的“账号与额度”功能，交付可编辑源码和运行说明。

功能要求：按账号观察用量、额度和历史证据，不推测无法归属的旧记录。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 额度账本

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/dashboard.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/tokens.zip)

```text
请实现“Token 统计”中的“额度账本”功能，交付可编辑源码和运行说明。

功能要求：记录额度变化、手工支出、汇率与原币金额，区分已确认支出和待核实变化。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 用量明细

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/dashboard.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/tokens.zip)

```text
请实现“Token 统计”中的“用量明细”功能，交付可编辑源码和运行说明。

功能要求：按日期、账号、模型查看明细并导出防公式注入的 CSV。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 连接与采集

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/dashboard.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/tokens.zip)

```text
请实现“Token 统计”中的“连接与采集”功能，交付可编辑源码和运行说明。

功能要求：本机日志增量采集、去重、断线恢复、开机启动及同步鉴权。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

## 网站收藏

### 收藏管理

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/websites.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/websites.zip)

```text
请实现“网站收藏”中的“收藏管理”功能，交付可编辑源码和运行说明。

功能要求：整理网址、搜索、分类和去重；新增、编辑、删除需要管理权限。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 历史补录

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/websites.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/websites.zip)

```text
请实现“网站收藏”中的“历史补录”功能，交付可编辑源码和运行说明。

功能要求：从本机助手正式回复补录开发链接，过滤授权参数、密钥与私密地址。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

## BetterOPC

### 社区接入

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/betteropc-center.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/betteropc.zip)

```text
请实现“BetterOPC”中的“社区接入”功能，交付可编辑源码和运行说明。

功能要求：嵌入 BetterOPC 原站，提供重载、超时提示和独立打开；此模块是外站接入，不包含外站服务器源码。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含本站的外站接入模块；BetterOPC 的服务器由第三方运营。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

## ME.zip 记录

### 活动总览

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip-local) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip-local.zip)

```text
请实现“ME.zip 记录”中的“活动总览”功能，交付可编辑源码和运行说明。

功能要求：汇总本机活动、阅读、观看和收藏，显示真实连接状态。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 全局时间轴

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip-local) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip-local.zip)

```text
请实现“ME.zip 记录”中的“全局时间轴”功能，交付可编辑源码和运行说明。

功能要求：按时间统一呈现真实活动，支持筛选与定位。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### X 行为

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip-local) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip-local.zip)

```text
请实现“ME.zip 记录”中的“X 行为”功能，交付可编辑源码和运行说明。

功能要求：采集与检索用户授权的 X 浏览及互动记录。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 观看记录

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip-local) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip-local.zip)

```text
请实现“ME.zip 记录”中的“观看记录”功能，交付可编辑源码和运行说明。

功能要求：记录视频观看位置和进度，回到上次位置。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### X 链接收集

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip-local) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip-local.zip)

```text
请实现“ME.zip 记录”中的“X 链接收集”功能，交付可编辑源码和运行说明。

功能要求：收藏链接并维护标签、说明和用途。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 网页、文章与代码

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip-local) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip-local.zip)

```text
请实现“ME.zip 记录”中的“网页、文章与代码”功能，交付可编辑源码和运行说明。

功能要求：归档网页与代码资源，保留来源、检索与整理功能。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 阅读与研究

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip-local) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip-local.zip)

```text
请实现“ME.zip 记录”中的“阅读与研究”功能，交付可编辑源码和运行说明。

功能要求：保存阅读进度、研究材料与标记。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 私人资料库

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip-local) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip-local.zip)

```text
请实现“ME.zip 记录”中的“私人资料库”功能，交付可编辑源码和运行说明。

功能要求：使用收藏夹和标签管理长期资料并隔离用户。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 兴趣档案

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip-local) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip-local.zip)

```text
请实现“ME.zip 记录”中的“兴趣档案”功能，交付可编辑源码和运行说明。

功能要求：基于真实记录整理兴趣，说明数据来源和范围。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 隐私设置

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip-local) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip-local.zip)

```text
请实现“ME.zip 记录”中的“隐私设置”功能，交付可编辑源码和运行说明。

功能要求：控制采集范围、暂停、导出与删除本机历史。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

## 知识库

### Compass 今日

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/library) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/knowledge.zip)

```text
请实现“知识库”中的“Compass 今日”功能，交付可编辑源码和运行说明。

功能要求：生成每日工作摘要，保留条目、日期、来源与管理权限。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 开源趋势

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/library) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/knowledge.zip)

```text
请实现“知识库”中的“开源趋势”功能，交付可编辑源码和运行说明。

功能要求：浏览开源项目趋势，搜索、筛选并查看来源与更新时间。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 灵感内容库

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/library) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/knowledge.zip)

```text
请实现“知识库”中的“灵感内容库”功能，交付可编辑源码和运行说明。

功能要求：收集多平台内容，分类、标签、搜索、查看详情与用户隔离。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 我的周刊

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/library) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/knowledge.zip)

```text
请实现“知识库”中的“我的周刊”功能，交付可编辑源码和运行说明。

功能要求：从收藏中选内容编排周刊，支持顺序、编辑与预览。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 素材箱

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/library) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/knowledge.zip)

```text
请实现“知识库”中的“素材箱”功能，交付可编辑源码和运行说明。

功能要求：整理图片、文案、脚本和文件，维护来源与下载。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 内容收集

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/library) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/knowledge.zip)

```text
请实现“知识库”中的“内容收集”功能，交付可编辑源码和运行说明。

功能要求：从链接创建收集草稿，支持手机入口、解析错误与重试。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 文档与长图

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/library) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/knowledge.zip)

```text
请实现“知识库”中的“文档与长图”功能，交付可编辑源码和运行说明。

功能要求：查看文档和长图，保留内容结构、缩放与导出。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 视频编辑

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/library) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/knowledge.zip)

```text
请实现“知识库”中的“视频编辑”功能，交付可编辑源码和运行说明。

功能要求：整理素材、剪辑与渲染，明确浏览器和本机能力差异。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 录屏与直播

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/library) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/knowledge.zip)

```text
请实现“知识库”中的“录屏与直播”功能，交付可编辑源码和运行说明。

功能要求：提供镜头、布局、录制与上传，保留 OBS 模板和本机辅助端源码。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 标签归纳

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/library) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/knowledge.zip)

```text
请实现“知识库”中的“标签归纳”功能，交付可编辑源码和运行说明。

功能要求：维护内容标签、搜索和多条件筛选，重命名标签时保留内容关联。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### Compass 待办

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/compass-today.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/knowledge.zip)

```text
请实现“知识库”中的“Compass 待办”功能，交付可编辑源码和运行说明。

功能要求：新增与完成待办，保留截止日期、跨日期记录和版本冲突处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### Compass 日记

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/compass-today.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/knowledge.zip)

```text
请实现“知识库”中的“Compass 日记”功能，交付可编辑源码和运行说明。

功能要求：按日期记录日记、收获和感恩，保存原文与时间并支持自定义分类名。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### Compass 每日自问

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/compass-today.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/knowledge.zip)

```text
请实现“知识库”中的“Compass 每日自问”功能，交付可编辑源码和运行说明。

功能要求：配置六个自问问题，逐项评分、保存和放弃未保存修改。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### Compass 习惯打卡

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/compass-today.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/knowledge.zip)

```text
请实现“知识库”中的“Compass 习惯打卡”功能，交付可编辑源码和运行说明。

功能要求：配置三个习惯，按日打卡与取消，防止覆盖正在编辑的评分。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### Compass 专注计时

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/compass-studio.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/knowledge.zip)

```text
请实现“知识库”中的“Compass 专注计时”功能，交付可编辑源码和运行说明。

功能要求：配置专注与休息时间，启动、暂停、恢复和结束计时，按服务器时间恢复状态并提供通知。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### Compass 伙伴与重要事项

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/compass-studio.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/knowledge.zip)

```text
请实现“知识库”中的“Compass 伙伴与重要事项”功能，交付可编辑源码和运行说明。

功能要求：切换互动伙伴，保存、编辑、完成和删除重要事项，配置优先级与提醒；伙伴采用固定互动语句，不能宣称为 AI 对话。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### Compass 板块自定义

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/compass-studio.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/knowledge.zip)

```text
请实现“知识库”中的“Compass 板块自定义”功能，交付可编辑源码和运行说明。

功能要求：编辑标题、板块名称、说明、标签、颜色与图片，上传封面和头像，保留鉴权、并发版本与数据恢复。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

## 我的书架

### 浏览书架

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/bookshelf) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/bookshelf.zip)

```text
请实现“我的书架”中的“浏览书架”功能，交付可编辑源码和运行说明。

功能要求：按分类搜索浏览书籍，查看封面、作者与书籍信息。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 后台管理

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/bookshelf) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/bookshelf.zip)

```text
请实现“我的书架”中的“后台管理”功能，交付可编辑源码和运行说明。

功能要求：管理员维护书籍、分类、封面和私人笔记。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 手机上传与电子书

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/bookshelf) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/bookshelf.zip)

```text
请实现“我的书架”中的“手机上传与电子书”功能，交付可编辑源码和运行说明。

功能要求：支持 PDF、EPUB、TXT 上传、容量校验、鉴权下载与阅读入口。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

## ME·zip Pro

### 登录与账号

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“登录与账号”功能，交付可编辑源码和运行说明。

功能要求：提供原应用登录、会话校验、退出与跨页面身份状态。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 个人空间

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“个人空间”功能，交付可编辑源码和运行说明。

功能要求：展示并管理个人吊牌、账号空间与交互视觉。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 作品与游戏

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“作品与游戏”功能，交付可编辑源码和运行说明。

功能要求：提供画廊、互动作品、游戏与各独立应用入口。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 无限画廊

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/gallery) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“无限画廊”功能，交付可编辑源码和运行说明。

功能要求：浏览三维画廊、切换图片与视角，并处理触控和资源加载。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 纸上赛车

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/racing) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“纸上赛车”功能，交付可编辑源码和运行说明。

功能要求：实现本站自编的纸面样式、浏览器适配、竞赛房间与手机控制器接入；原版 APEX 赛车引擎是外部依赖，未取得原版工程，不把压缩构建产物称为原始源码。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 预约工作室

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/BookingStudio.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“预约工作室”功能，交付可编辑源码和运行说明。

功能要求：管理会谈时段、联系人和邮件通知，保留独立页面及服务器接口。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 电脑与手机上传

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/SessionImageUpload.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“电脑与手机上传”功能，交付可编辑源码和运行说明。

功能要求：授权上传图片、管理临时预览和持久化媒体，验证大小类型与访问权限。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 照片记忆游戏

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/PhotoMemoryGame.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“照片记忆游戏”功能，交付可编辑源码和运行说明。

功能要求：实现照片记忆游戏现有组件的交互、参数和内容编辑能力；以 PhotoMemoryGame.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 光标特效

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/CursorEffects.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“光标特效”功能，交付可编辑源码和运行说明。

功能要求：实现光标特效现有组件的交互、参数和内容编辑能力；以 CursorEffects.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 打字文本

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/TextType.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“打字文本”功能，交付可编辑源码和运行说明。

功能要求：实现打字文本现有组件的交互、参数和内容编辑能力；以 TextType.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 滚动展开

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/ScrollExpand.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“滚动展开”功能，交付可编辑源码和运行说明。

功能要求：实现滚动展开现有组件的交互、参数和内容编辑能力；以 ScrollExpand.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 波动失真

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/RippleDistortion.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“波动失真”功能，交付可编辑源码和运行说明。

功能要求：实现波动失真现有组件的交互、参数和内容编辑能力；以 RippleDistortion.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 弹性网格

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/ElasticMesh.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“弹性网格”功能，交付可编辑源码和运行说明。

功能要求：实现弹性网格现有组件的交互、参数和内容编辑能力；以 ElasticMesh.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 半色调揭示

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/HalftoneReveal.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“半色调揭示”功能，交付可编辑源码和运行说明。

功能要求：实现半色调揭示现有组件的交互、参数和内容编辑能力；以 HalftoneReveal.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 轨道图像

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/OrbitImages.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“轨道图像”功能，交付可编辑源码和运行说明。

功能要求：实现轨道图像现有组件的交互、参数和内容编辑能力；以 OrbitImages.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 翻滚轮播

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/TumbleCarousel.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“翻滚轮播”功能，交付可编辑源码和运行说明。

功能要求：实现翻滚轮播现有组件的交互、参数和内容编辑能力；以 TumbleCarousel.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 扭曲卡片

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/WarpedCard.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“扭曲卡片”功能，交付可编辑源码和运行说明。

功能要求：实现扭曲卡片现有组件的交互、参数和内容编辑能力；以 WarpedCard.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 彩色边缘卡片

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/ChromaCard.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“彩色边缘卡片”功能，交付可编辑源码和运行说明。

功能要求：实现彩色边缘卡片现有组件的交互、参数和内容编辑能力；以 ChromaCard.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 环形图库

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/CircleGallery.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“环形图库”功能，交付可编辑源码和运行说明。

功能要求：实现环形图库现有组件的交互、参数和内容编辑能力；以 CircleGallery.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 图片对比滑块

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/ComparisonSlider.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“图片对比滑块”功能，交付可编辑源码和运行说明。

功能要求：实现图片对比滑块现有组件的交互、参数和内容编辑能力；以 ComparisonSlider.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 渐变模糊

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/GradualBlur.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“渐变模糊”功能，交付可编辑源码和运行说明。

功能要求：实现渐变模糊现有组件的交互、参数和内容编辑能力；以 GradualBlur.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 完整分割图像

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/CompleteSplitImage.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“完整分割图像”功能，交付可编辑源码和运行说明。

功能要求：实现完整分割图像现有组件的交互、参数和内容编辑能力；以 CompleteSplitImage.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 点击火花

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/ClickSpark.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“点击火花”功能，交付可编辑源码和运行说明。

功能要求：实现点击火花现有组件的交互、参数和内容编辑能力；以 ClickSpark.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 磁吸交互

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/Magnet.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“磁吸交互”功能，交付可编辑源码和运行说明。

功能要求：实现磁吸交互现有组件的交互、参数和内容编辑能力；以 Magnet.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 贴纸揭开

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/StickerPeel.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“贴纸揭开”功能，交付可编辑源码和运行说明。

功能要求：实现贴纸揭开现有组件的交互、参数和内容编辑能力；以 StickerPeel.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 十字准星

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/Crosshair.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“十字准星”功能，交付可编辑源码和运行说明。

功能要求：实现十字准星现有组件的交互、参数和内容编辑能力；以 Crosshair.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 遮罩标题

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/MaskedHeading.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“遮罩标题”功能，交付可编辑源码和运行说明。

功能要求：实现遮罩标题现有组件的交互、参数和内容编辑能力；以 MaskedHeading.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 三维字母切换

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/LetterSwap3D.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“三维字母切换”功能，交付可编辑源码和运行说明。

功能要求：实现三维字母切换现有组件的交互、参数和内容编辑能力；以 LetterSwap3D.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 模糊高亮

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/BlurHighlight.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“模糊高亮”功能，交付可编辑源码和运行说明。

功能要求：实现模糊高亮现有组件的交互、参数和内容编辑能力；以 BlurHighlight.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 文本散射

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/TextScatter.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“文本散射”功能，交付可编辑源码和运行说明。

功能要求：实现文本散射现有组件的交互、参数和内容编辑能力；以 TextScatter.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 文字掉落

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/FallingText.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“文字掉落”功能，交付可编辑源码和运行说明。

功能要求：实现文字掉落现有组件的交互、参数和内容编辑能力；以 FallingText.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 水彩背景

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/Watercolor.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“水彩背景”功能，交付可编辑源码和运行说明。

功能要求：实现水彩背景现有组件的交互、参数和内容编辑能力；以 Watercolor.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 线框球导航

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/WireframeBall.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“线框球导航”功能，交付可编辑源码和运行说明。

功能要求：实现线框球导航现有组件的交互、参数和内容编辑能力；以 WireframeBall.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 深度卡片

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/DepthCard.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“深度卡片”功能，交付可编辑源码和运行说明。

功能要求：实现深度卡片现有组件的交互、参数和内容编辑能力；以 DepthCard.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 透镜翻转轮播

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/LenticularCarousel.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“透镜翻转轮播”功能，交付可编辑源码和运行说明。

功能要求：实现透镜翻转轮播现有组件的交互、参数和内容编辑能力；以 LenticularCarousel.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 翻页图库

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/PageFlip.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“翻页图库”功能，交付可编辑源码和运行说明。

功能要求：实现翻页图库现有组件的交互、参数和内容编辑能力；以 PageFlip.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 视差轮播

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/ParallaxCarousel.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“视差轮播”功能，交付可编辑源码和运行说明。

功能要求：实现视差轮播现有组件的交互、参数和内容编辑能力；以 ParallaxCarousel.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 视差卡片工作室

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/ParallaxCardsStudio.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“视差卡片工作室”功能，交付可编辑源码和运行说明。

功能要求：实现视差卡片工作室现有组件的交互、参数和内容编辑能力；以 ParallaxCardsStudio.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 胶片图库工作室

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/ReelGalleryStudio.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“胶片图库工作室”功能，交付可编辑源码和运行说明。

功能要求：实现胶片图库工作室现有组件的交互、参数和内容编辑能力；以 ReelGalleryStudio.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 滚动堆叠工作室

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/ScrollStackStudio.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“滚动堆叠工作室”功能，交付可编辑源码和运行说明。

功能要求：实现滚动堆叠工作室现有组件的交互、参数和内容编辑能力；以 ScrollStackStudio.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 渐变轮播工作室

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/GradientCarouselStudio.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“渐变轮播工作室”功能，交付可编辑源码和运行说明。

功能要求：实现渐变轮播工作室现有组件的交互、参数和内容编辑能力；以 GradientCarouselStudio.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 液态切换工作室

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/LiquidSwapStudio.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“液态切换工作室”功能，交付可编辑源码和运行说明。

功能要求：实现液态切换工作室现有组件的交互、参数和内容编辑能力；以 LiquidSwapStudio.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 像素切换工作室

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/PixelSwapStudio.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“像素切换工作室”功能，交付可编辑源码和运行说明。

功能要求：实现像素切换工作室现有组件的交互、参数和内容编辑能力；以 PixelSwapStudio.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 变换工作室

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/MagicTransformStudio.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“变换工作室”功能，交付可编辑源码和运行说明。

功能要求：实现变换工作室现有组件的交互、参数和内容编辑能力；以 MagicTransformStudio.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 弹窗卡片工作室

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/ModalCardsStudio.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“弹窗卡片工作室”功能，交付可编辑源码和运行说明。

功能要求：实现弹窗卡片工作室现有组件的交互、参数和内容编辑能力；以 ModalCardsStudio.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 像素显影

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/PixelReveal.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“像素显影”功能，交付可编辑源码和运行说明。

功能要求：实现像素显影现有组件的交互、参数和内容编辑能力；以 PixelReveal.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 悬停像素

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/PixelateHover.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“悬停像素”功能，交付可编辑源码和运行说明。

功能要求：实现悬停像素现有组件的交互、参数和内容编辑能力；以 PixelateHover.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 旋转卡片

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/RotatingCards.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“旋转卡片”功能，交付可编辑源码和运行说明。

功能要求：实现旋转卡片现有组件的交互、参数和内容编辑能力；以 RotatingCards.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 着色器卡片

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/ShaderCard.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“着色器卡片”功能，交付可编辑源码和运行说明。

功能要求：实现着色器卡片现有组件的交互、参数和内容编辑能力；以 ShaderCard.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 着色器显影

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/ShaderReveal.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“着色器显影”功能，交付可编辑源码和运行说明。

功能要求：实现着色器显影现有组件的交互、参数和内容编辑能力；以 ShaderReveal.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 倾斜名片

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/CreditCard.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“倾斜名片”功能，交付可编辑源码和运行说明。

功能要求：实现倾斜名片现有组件的交互、参数和内容编辑能力；以 CreditCard.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 个人漂浮墙

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/PersonalDriftWallStudio.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“个人漂浮墙”功能，交付可编辑源码和运行说明。

功能要求：实现个人漂浮墙现有组件的交互、参数和内容编辑能力；以 PersonalDriftWallStudio.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 无限图库

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/InfiniteGallerySection.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“无限图库”功能，交付可编辑源码和运行说明。

功能要求：实现无限图库现有组件的交互、参数和内容编辑能力；以 InfiniteGallerySection.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 关系图工作室

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip/apps/main/src/SimpleGraphStudio.jsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/mezip.zip)

```text
请实现“ME·zip Pro”中的“关系图工作室”功能，交付可编辑源码和运行说明。

功能要求：实现关系图工作室现有组件的交互、参数和内容编辑能力；以 SimpleGraphStudio.jsx 及同名样式为入口，保留实际依赖、触控适配与资源加载失败处理。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

## 票据收件箱

### 票据收件箱

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip-local/services/finance-mobile-bridge) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/finance.zip)

```text
请实现“票据收件箱”中的“票据收件箱”功能，交付可编辑源码和运行说明。

功能要求：导入图片凭证，整理待处理票据、解析状态与重复项。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 财务账单

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip-local/services/finance-mobile-bridge) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/finance.zip)

```text
请实现“票据收件箱”中的“财务账单”功能，交付可编辑源码和运行说明。

功能要求：核对收支、分类、日期、账户和金额，支持导入导出。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 商家分析

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip-local/services/finance-mobile-bridge) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/finance.zip)

```text
请实现“票据收件箱”中的“商家分析”功能，交付可编辑源码和运行说明。

功能要求：归纳商家与消费分布，并从汇总回查原始凭证。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 手机拍照上传

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip-local/services/finance-mobile-bridge) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/finance.zip)

```text
请实现“票据收件箱”中的“手机拍照上传”功能，交付可编辑源码和运行说明。

功能要求：配对手机上传凭证，验证授权、同步状态与连接失效。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

## 我的小店

### 商品商城

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/shop) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/shop.zip)

```text
请实现“我的小店”中的“商品商城”功能，交付可编辑源码和运行说明。

功能要求：展示商品详情、数量、订单与用户自配收款方式。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 订单查询

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/shop) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/shop.zip)

```text
请实现“我的小店”中的“订单查询”功能，交付可编辑源码和运行说明。

功能要求：按订单标识查询状态，限制越权查看和重复提交。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 店铺管理

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/shop) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/shop.zip)

```text
请实现“我的小店”中的“店铺管理”功能，交付可编辑源码和运行说明。

功能要求：管理商品、订单、店铺设置和登录权限。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 重置日历与通知

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/shop) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/shop.zip)

```text
请实现“我的小店”中的“重置日历与通知”功能，交付可编辑源码和运行说明。

功能要求：维护重置计划、状态与邮件通知，邮件凭据由部署者配置。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

## 潮汕地图

### 全国社区地图

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/public/local-apps/chaoshan-atlas) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v1.0.0/chaoshan-map.zip)

```text
请实现“潮汕地图”中的“全国社区地图”功能，交付可编辑源码和运行说明。

功能要求：展示社区地图与列表、分类、详情和有来源的数据快照。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 社区榜单

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/public/local-apps/chaoshan-atlas) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v1.0.0/chaoshan-map.zip)

```text
请实现“潮汕地图”中的“社区榜单”功能，交付可编辑源码和运行说明。

功能要求：按指标浏览社区榜单并标明日期与来源。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 活动与城市政策

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/public/local-apps/chaoshan-atlas) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v1.0.0/chaoshan-map.zip)

```text
请实现“潮汕地图”中的“活动与城市政策”功能，交付可编辑源码和运行说明。

功能要求：浏览活动和政策，保留来源、时间与真实性边界。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 潮汕 3D 地图

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/public/local-apps/chaoshan-atlas) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v1.0.0/chaoshan-map.zip)

```text
请实现“潮汕地图”中的“潮汕 3D 地图”功能，交付可编辑源码和运行说明。

功能要求：地区探索、缩放、朝北、平面、昼夜、巡游、全屏与景点详情。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 收藏与我的地点

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/public/local-apps/chaoshan-atlas) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v1.0.0/chaoshan-map.zip)

```text
请实现“潮汕地图”中的“收藏与我的地点”功能，交付可编辑源码和运行说明。

功能要求：在当前浏览器管理收藏与自定义地点，支持定位和恢复。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

## 公鸡快跑

### 游戏与操控

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/public/games/rooster-rush) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v1.0.0/rooster-rush.zip)

```text
请实现“公鸡快跑”中的“游戏与操控”功能，交付可编辑源码和运行说明。

功能要求：左右移动、跳跃、收集金币、踩敌人、火箭、暂停与重开；兼容手机触控。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

## GitHub 工作台

### 开发总览

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip-local/services/github-workspace) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/github.zip)

```text
请实现“GitHub 工作台”中的“开发总览”功能，交付可编辑源码和运行说明。

功能要求：汇总真实仓库、活动与任务；使用本机 GitHub 授权。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 仓库管理

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip-local/services/github-workspace) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/github.zip)

```text
请实现“GitHub 工作台”中的“仓库管理”功能，交付可编辑源码和运行说明。

功能要求：浏览仓库、文件、README、分支与变更。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 代码片段

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip-local/services/github-workspace) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/github.zip)

```text
请实现“GitHub 工作台”中的“代码片段”功能，交付可编辑源码和运行说明。

功能要求：维护可检索代码片段、标签、来源与编辑状态。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 开发任务

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip-local/services/github-workspace) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/github.zip)

```text
请实现“GitHub 工作台”中的“开发任务”功能，交付可编辑源码和运行说明。

功能要求：维护任务状态、关联仓库与记录。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 开发活动

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip-local/services/github-workspace) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/github.zip)

```text
请实现“GitHub 工作台”中的“开发活动”功能，交付可编辑源码和运行说明。

功能要求：展示真实提交和开发历史，处理分页、离线与权限失败。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

## 录制与截图库

### 屏幕录制

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip-local/apps/web) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/media.zip)

```text
请实现“录制与截图库”中的“屏幕录制”功能，交付可编辑源码和运行说明。

功能要求：用户主动授权后录制屏幕、窗口和声音，支持停止与保存。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 视频资料库

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip-local/apps/web) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/media.zip)

```text
请实现“录制与截图库”中的“视频资料库”功能，交付可编辑源码和运行说明。

功能要求：浏览本机视频，播放、筛选、整理与管理元数据。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 截图资料库

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/standalone/mezip-local/apps/web) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/media.zip)

```text
请实现“录制与截图库”中的“截图资料库”功能，交付可编辑源码和运行说明。

功能要求：捕捉与整理画面，支持查看、标签、检索及下载。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

## 音乐空间

### 选歌与播放

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/music-center.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/music.zip)

```text
请实现“音乐空间”中的“选歌与播放”功能，交付可编辑源码和运行说明。

功能要求：搜索歌曲、切换来源、播放和暂停；失败时明确提示，不能伪造可播放状态。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 播放历史

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/music-center.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/music.zip)

```text
请实现“音乐空间”中的“播放历史”功能，交付可编辑源码和运行说明。

功能要求：保存歌曲和播放进度，恢复历史并明确同步状态。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 音乐来源站

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/music-center.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/music.zip)

```text
请实现“音乐空间”中的“音乐来源站”功能，交付可编辑源码和运行说明。

功能要求：接入 Go Music DL 来源站，保留原站链接与备用曲库选择。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 手机麦克风

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/music-center.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/music.zip)

```text
请实现“音乐空间”中的“手机麦克风”功能，交付可编辑源码和运行说明。

功能要求：生成配对房间，授权采集音频，经 WebRTC 实时传输到接收端并支持断开。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

## 预约系统

### 预约日期与时段

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/booking-center.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/booking.zip)

```text
请实现“预约系统”中的“预约日期与时段”功能，交付可编辑源码和运行说明。

功能要求：按 UTC+8 选择日期与 15 分钟时段，服务端拒绝重叠并幂等保存。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 预约管理

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/booking-center.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/booking.zip)

```text
请实现“预约系统”中的“预约管理”功能，交付可编辑源码和运行说明。

功能要求：仅管理账号可查看预约联系人和处理状态。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 邮件确认

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/booking-center.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/booking.zip)

```text
请实现“预约系统”中的“邮件确认”功能，交付可编辑源码和运行说明。

功能要求：通过独立 SMTP 服务发送通知，记录不确定结果并避免重复发送。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

## QDuo Windows

### 电脑体检

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/integration/qduo-windows) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/qduo.zip)

```text
请实现“QDuo Windows”中的“电脑体检”功能，交付可编辑源码和运行说明。

功能要求：查看硬件、应用、缓存、大文件与扫描限制，支持导入导出报告。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 清理与文件

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/integration/qduo-windows) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/qduo.zip)

```text
请实现“QDuo Windows”中的“清理与文件”功能，交付可编辑源码和运行说明。

功能要求：查看缓存、大文件、回收站与文件定位；仅对用户选中的目标执行客户端允许的操作，显示预览、确认和错误。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 文本工具

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/integration/qduo-windows) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/qduo.zip)

```text
请实现“QDuo Windows”中的“文本工具”功能，交付可编辑源码和运行说明。

功能要求：JSON、URL 编解码、格式处理、朗读及可选模型翻译润色总结。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 客户端与配对

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/integration/qduo-windows) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/qduo.zip)

```text
请实现“QDuo Windows”中的“客户端与配对”功能，交付可编辑源码和运行说明。

功能要求：提供 Windows 客户端源码、构建说明、本机配对、鉴权和断开。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 已安装应用

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/qduo-center.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/qduo.zip)

```text
请实现“QDuo Windows”中的“已安装应用”功能，交付可编辑源码和运行说明。

功能要求：从本机报告显示真实安装应用、发布者和筛选结果。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 运行进程

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/qduo-center.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/qduo.zip)

```text
请实现“QDuo Windows”中的“运行进程”功能，交付可编辑源码和运行说明。

功能要求：查看真实运行进程并搜索名称，明确本机连接状态。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 启动项

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/qduo-center.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/qduo.zip)

```text
请实现“QDuo Windows”中的“启动项”功能，交付可编辑源码和运行说明。

功能要求：读取并展示本机启动项状态与来源。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 大文件列表

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/qduo-center.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/qduo.zip)

```text
请实现“QDuo Windows”中的“大文件列表”功能，交付可编辑源码和运行说明。

功能要求：分页显示扫描到的大文件、大小和时间，保留扫描边界与失败说明。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 安全清理

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/qduo-safety.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/qduo.zip)

```text
请实现“QDuo Windows”中的“安全清理”功能，交付可编辑源码和运行说明。

功能要求：按风险扫描缓存、预览选中目标、确认计划、隔离及恢复；禁止越过受保护目标。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 文件与图片浏览

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/qduo-safety.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/qduo.zip)

```text
请实现“QDuo Windows”中的“文件与图片浏览”功能，交付可编辑源码和运行说明。

功能要求：分页搜索文件及图片缩略图，查看时间、来源与关联收藏，保留本机访问限制。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### Windows 防护状态

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app/qduo-safety.tsx) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/qduo.zip)

```text
请实现“QDuo Windows”中的“Windows 防护状态”功能，交付可编辑源码和运行说明。

功能要求：读取 Windows Defender 状态，显示建议、刷新与失败状态，不伪造已修复。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

## 界面与通用工具

### 主题与手机布局

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/core.zip)

```text
请实现“界面与通用工具”中的“主题与手机布局”功能，交付可编辑源码和运行说明。

功能要求：提供浅色、暗色、墨水风格与响应式导航，保存偏好。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 阅读笔与交互

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/core.zip)

```text
请实现“界面与通用工具”中的“阅读笔与交互”功能，交付可编辑源码和运行说明。

功能要求：提供阅读标注、交互音效、雪花、装饰层和全屏开关。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 登录与权限

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/core.zip)

```text
请实现“界面与通用工具”中的“登录与权限”功能，交付可编辑源码和运行说明。

功能要求：区分公开查看与管理写入，对本机代理、数据接口验证身份。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

### 源码与提示词

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/app) · [模块 ZIP](https://github.com/zhanghaoquan631/codex-pulse/releases/download/source-v2.0.2/core.zip)

```text
请实现“界面与通用工具”中的“源码与提示词”功能，交付可编辑源码和运行说明。

功能要求：每个功能提供真实代码复制、复现提示词、文件下载和权限拒绝回退。

沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。
个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。
源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。
提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。
```

## 独立地图与游戏

### 潮汕共创地图

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/public/local-apps/chaoshan-atlas)

```text
请制作一个适配电脑和手机的潮汕三维地图与全国社区浏览应用。
使用 Three.js 表现汕头、潮州、揭阳、南澳等地区的山地、河流、海岸、城镇和地标；提供地区选择、地名开关、缩放、朝北、平面视图、昼夜切换、自动巡游、全屏和景点详情。地图是资料快照与艺术化表达，不能冒充实时导航或测绘成果。
全国社区页提供地图、列表、榜单、活动与政策，并标记资料日期和来源。收藏与自定义地点保存在当前浏览器；未知数据不编造，个人记录不打包。
在地图中保留潮汕行旅十二章游戏入口。对加载过程提供阶段提示、停止和重试；离开屏幕或切换栏目时暂停渲染。保持地图与游戏通信的来源和窗口校验。
交付完整可运行源码、安装/启动说明和资源来源。保留第三方许可证；未获得再分发许可的模型、照片、精灵需由使用者另行提供。验证电脑、手机、地图交互及入口，不把截图作为功能完成证明。
```

### 潮汕行旅 · 十二地墨潮

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/public/local-apps/chaoshan-atlas/adventure)

```text
请用原生 JavaScript ES modules 与 Three.js 制作潮汕主题的浏览器三维冒险游戏，名称为“潮汕行旅 · 十二地墨潮”。
以十二个地区/章节组织探索，表现小公园、广济桥、揭阳和南澳等地方特色；关卡规则、战斗、任务、天气、角色成长与渲染分模块实现。提供可切换视角、移动与跳跃、室内探索、NPC 互动、任务记录、装备、战斗反馈、章节选择、暂停与重开。
支持键盘鼠标和手机触控，兼顾横竖屏；声音由用户主动开启。进度保存在当前浏览器，支持导出存档，不能声称和其他设备自动同步。
使用程序化默认角色。外部动物精灵按需加载并保留来源；模型或贴图无法加载时仍可游玩，不擅自包含禁止再分发的角色资产。保留返回地图入口与同源消息校验。
交付 HTML、CSS、各 ES module、合法可分发资源、许可说明、HTTP 启动步骤和实际验证结果。新生成结果不承诺与现有版本逐像素一致。
```

### 公鸡快跑

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/public/games/rooster-rush)

```text
请用原生 JavaScript 和 Three.js 制作可在电脑和手机直接玩的“公鸡快跑”游戏。
玩家左右移动并跳跃，收集金币、踩敌人、使用火箭，挑战 10,000 分。键盘支持方向键或 A/D、空格跳跃、长按跳得更高、P 暂停、R 重开；手机提供摇杆与 JUMP 按钮。分数必须来自真实规则。
将规则与碰撞放在 engine.js，角色和场景资产放在 assets.js，输入、渲染、声音及界面放在 app.js。提供加载失败重试、全屏、独立打开和适配手机的界面。
在用户主动操作后播放声音。切换网页栏目时停止当前游戏，高分保存范围应明确；保留嵌入宿主的同源状态消息。
交付完整源码、Three.js 与字体许可、静态 HTTP 启动说明，并验证移动、跳跃、得分、暂停和重开。
```

### 厦门 3D 地图

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/examples/xiamen-3d-map)

```text
请用 Vite、原生 JavaScript 与 Three.js 制作厦门和鼓浪屿三维旅行地图，适配手机与电脑。
以有来源的地理数据表现鼓浪屿的街巷、海岸、建筑与码头，以及厦门中山路等景点；提供景点、酒店和码头分类、地图缩放与方向控制、自动巡游、图文详情和路线探索。
支持浏览器定位，但只能在用户主动授权后读取位置；行程保存在本机，未取得定位时仍可浏览。明确地图资料的日期、近似程度和来源，不将艺术化场景当成精确导航。
地图加载应有进度、错误提示与重试；手机触控不遮挡关键按钮。将地图生成、几何、渲染、查询和界面分为可维护模块。
交付完整源文件、依赖锁文件、构建和启动说明。保留地图数据与第三方代码、照片许可，未获授权的资源单独说明。验证地图初次载入、景点切换、巡游、手机操作和定位拒绝状态。
```

### 浙大校园漫游

[源码](https://github.com/zhanghaoquan631/codex-pulse/tree/main/examples/zju-overworld)

```text
请用原生 JavaScript ES modules 与 Three.js 制作浙大紫金港主题的浏览器三维校园漫游游戏。
用有来源的地图数据和程序化几何呈现校园道路、建筑、绿地与水面，提供可操作的俯视视角、步行与自由探索；地图为艺术化近似，不能作为精确导航。
加入课程与微课、校园运动、搭建与物品、动物，以及夜间怪兽和生存玩法。微课使用原创内容与有权使用的声音，模型优先程序生成。
兼容键盘鼠标和手机触控，支持暂停、昼夜变化与浏览器本地存档；用户操作后才播放声音。保留来源说明和加载失败提示。
按世界、校园活动、教学、动物与夜间玩法拆分模块。交付可通过静态 HTTP 运行的 HTML、CSS、全部 ES modules、数据、资源许可与启动说明。提示词描述功能方向，不承诺与已有版本逐像素一致。
```
