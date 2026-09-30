# 本机采集与 ME.zip 连接

Windows 的启动文件夹已经有 `Codex Pulse.lnk` 和 `ME.zip Local Apps.vbs`。登录 Windows 后会自动运行；无需再创建启动项或重新配对网站。

`supervise.ps1` 保持采集器运行，ME.zip 连接随 `service.mjs` 一起启动。电脑每两秒主动联系已配置的网站；断网时自动延长重试间隔，恢复网络后继续连接。本机 ME.zip 停止时，仅尝试恢复它的采集后端，不会重启其他 ME.zip 应用。电脑关机或休眠期间无法读取本机内容。

连接使用现有 `config.json` 的网站和凭证。可选的 `mezipRoot` 仅用于指定本机 ME.zip 安装目录，不会上传。请勿公开配置文件或 `data` 文件夹。

本机操作回执保存在 `data/mezip.sqlite`。重复请求会复用回执；操作过期后不会开始执行；若电脑在写操作中途退出，界面会提示核实结果，不会自动再写一次。

检查连接：打开 <http://127.0.0.1:43871/health>，查看 `mezip.online`、`mezip.state` 和 `mezip.backend`。正常连接时分别为 `true`、`connected` 和 `connected`。`http-404` 表示网站尚未发布连接接口；`http-401` / `http-403` 表示凭证需要检查。

隔离测试：`node --test collector/mezip.test.mjs`。测试使用临时数据库和模拟传输，不会修改实际 ME.zip 记录。

## Gmail 验证码与二次认证

安装本机 Gmail 依赖：在项目目录运行 `npm ci --prefix collector --omit=dev --ignore-scripts`。账号页面的 Gmail 连接仅供网站管理账号访问；每个邮箱需在 Google 开启两步验证并自行生成应用专用密码，再通过网站的私密连接表单输入。不要填写 Google 登录密码。忘记的应用专用密码全文无法重新查看，Google 页面只能查看已有记录或生成新密码。

密码使用 Windows 当前用户的 DPAPI 加密，保存在 `data/gmail-connections.dpapi`，不进入网站快照或操作回执。断开本机连接会移除本机保存的密码，Google 端的应用专用密码需另行管理。读取使用只读 INBOX，不发送邮件、不更改已读状态；展示最近 15 分钟识别到的验证码候选邮件，前端每 15 秒刷新。

Authenticator 密钥及二维码只在浏览器中解析。兼容六位 TOTP、标准 otpauth 链接与可识别的 Google 导出二维码；批量二维码需由用户选择对应条目。密钥采用独立解锁密码加密保存在当前浏览器，重新打开浏览器后需解锁，不进入服务器或账号下载文件。清空浏览器数据会移除本机副本，请保留原 Authenticator。

查询重置卡只读取这台电脑当前 Codex 登录账号；其他账号显示最后采集记录或“尚未查询”，不会把未知值记为零。
