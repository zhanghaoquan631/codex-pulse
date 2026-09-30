# 独立财务副本

构建时只读取原 ME.zip `apps/web/public`，不会写入原页面、财务服务或原账本：

```powershell
node integration/local-apps/finance-build.mjs 'C:/Users/your-user/Documents/Codex/2026-08-16/x-github-ai/work/me-zip/apps/web/public'
node --test integration/local-apps/finance-adapter.test.mjs integration/local-apps/finance-pages.test.mjs
```

生成 `public/local-apps/finance-receipt-inbox-v12`、`finance-center-v2`，以及共享的 `finance-adapter.js` 和 `finance-theme.css`。原 DOM 和业务脚本保留；仅适配地址、实时传输、持久化时机和对应文案。未加载的旧 V2 内联脚本继续保持 `text/plain`。

## 数据边界

全部 `/api/local-apps/finance/**` 请求都要求网站主人身份。网页可公开，账本和图片不能公开。Cookie 只由本机网关维护，浏览器适配层不接触本机 Cookie。

新版和原本机浏览器账本是独立的。第一次打开新版必须先明确复制原账本，或者明确确认新建空账本。绝不能将桥接失败解释为空账本。

`finance-transfer/index.html` 是单独迁移助手的源文件，需要安装到原网页服务的 `/pulse-finance-transfer/index.html`；不得更改任何原页面。助手只读取该 origin 的 `mezip.finance.center.v2`，向 **不公开到隧道** 的 `http://127.0.0.1:43873/storage/finance/import` 请求导入。GET 仅返回 `{initialized}`；POST `{data:<原字符串>}` 仅允许首次初始化；第二次返回 409。用户原浏览器数据保持原样。

## 端点协议

- `/api/local-apps/finance/storage/finance`：GET `{initialized,revision,data}`，PUT `{revision,data}`，返回包含新 revision 的对象。PUT 每次带稳定 `X-Pulse-Operation-Id`。同 operationId 重试必须返回已提交结果，不得再次保存。版本不同返回 409。财务数据驻留本机服务端，网页不写入公开网站的 browser localStorage。
- `/api/local-apps/finance/v1/finance/mobile/...`：代理原 4325 JSON / 图片接口。原 GET invite 在新版以 POST 发出，避免错误重试导致链接轮换。其他 POST/PATCH 同样带稳定 operationId。
- 写操作超过短时窗口：返回 `202 {relayPending:true,operationId}`。浏览器只查询 `/api/local-apps/operations/:id`，不会重新发送业务写。回执 `{state:'done',status,body}` 转成原 API 响应；uncertain 显示请刷新核实。
- 原 SSE 改为 8 秒有界轮询；编辑对话框打开时暂缓刷新，避免覆盖正在填写的字段。
- 相同收件箱结果不重绘；“完整财务中心”只更新外部商家汇总，保持 iframe、子页面和详情窗口。账本完成加载后立即显示页面，不等待独立凭证服务。

## 持久化行为

原同步 localStorage 调用由限定两个财务 key 的代理替代。财务脚本在服务端账本 hydration 后才运行；top window 协调嵌套 V12/V2，串行带版本号保存并通知其它视图。不同标签或设备并发更新由服务端 revision 控制。

新版默认展示“全部时间”和可见金额；顶部可切换隐藏金额，该选择仅存于当前页面的共享视图状态，不修改原账本 `privacy.hideAmounts`。历史趋势覆盖所选完整期间。10 秒账本检查在任何嵌套详情/编辑窗口打开或输入框正在使用时暂缓，并在网络响应后再次检查交互状态和版本，避免旧响应覆盖新保存。

已经加载账本后，后台 GET 的网络错误、5xx、408/425/429 进入“离线只读”，保留当前记录和详情，暂停写入，继续每 10 秒自动重连，也可立即重试。同版本恢复只更新连接提示；更高版本会等详情、输入和未完成的表单结束后同步，不刷新整页。离线状态在事件捕获、账本存储和业务写请求三个位置拦截修改；V2 自动补全凭证明细也暂停。首次加载失败、鉴权失败、损坏数据、保存失败或版本冲突仍严格保护，失败保存的队列不会被自动重连丢弃。

共享 store 使用明确的 `runtimeVersion`。部署后若父工作台仍持有旧版 store，新子页先显示升级提示，不安装新版业务逻辑、不新建第二个 store、不修改原数据、队列或计时器。只有用户点击刷新按钮，且当前没有保存队列、正在保存或打开的编辑窗口，再确认其他页面修改已保存，才刷新最外层工作台。兼容版本的定时器保存在 store 中，仅创建一次；嵌套页和重复加载不会叠加计时器。

保存中有持续状态提示；失败锁定编辑，未保存内容留在当前页面。普通网络错误可重试同一个保存回执；并发冲突必须用户明确放弃本页未保存内容后读取最新账本。所有已有 finance receipt 写操作先等待账本 flush；“确认入账”更会先完成账本持久化，才调用原 receipt confirm。

待上线端到端验证：原 origin 迁移、嵌套 V2 编辑联动、3 MB 图片传输/下载、OCR 异步回执、手机邀请链接、断网后保存恢复。单元测试用纯虚构账本，不访问真实财务内容。
