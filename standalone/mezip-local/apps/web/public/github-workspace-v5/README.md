# GitHub Workspace V5

这是一个独立的新入口，原有 `/github-workspace-v1/`、`/github-workspace-v3/`、`/github-workspace-v4/` 和登录后页面均未修改。

V5 继续使用已授权的 `/v1/github-workspace/*` 真实只读服务：

- 概览：贡献热力图、年度贡献、连续贡献、Commit / PR / Issue / 仓库统计、最近活动、常用仓库、语言分布。
- 仓库：公开/私有仓库、语言、Star、Fork、Issue、更新时间，以及 README、文件、Commit、Branch、Issues、Pull Requests 详情。
- 代码片段：搜索、语言/来源筛选、收藏、复制、新建与删除。
- Issues：Open / Closed、仓库筛选、标签、详情与只读权限提示。
- 任务：Issue / PR 汇入待处理、进行中、审核中、已完成；支持箭头移动和拖拽移动，状态通过服务端持久化。
- Pull Requests：从概览功能卡进入独立的真实只读列表，可按状态和关键词筛选，并安全打开 GitHub 原始详情。
- 活动：Push、Issues、Pull Requests、评论、Review、Star、Fork 筛选。

V5 的可选接口采用单项失败策略：片段、Issues、Pull Requests、任务或活动接口失败时，只显示该模块的空状态和重试提示，不会吞掉已经成功读取的概览与仓库数据，也不会用演示数据冒充真实数据。
