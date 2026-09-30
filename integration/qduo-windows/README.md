# QDuo Windows

Windows 10/11 x64 的本机划词与电脑体检工具。独立 Windows 实现，功能参考 [XueshiQiao/qduo](https://github.com/XueshiQiao/qduo)，按 GPL-3.0-or-later 分发。依赖系统 .NET Framework 4.8，无需安装 Node、Python、Electron 或运行云端代理。

## 运行与网站配对

1. 将完整 ZIP 解压到一个文件夹，双击 `QDuoWindows.exe`。请保留同目录的 `Ocr.ps1`、`Ocr.sha256`、`Security.ps1` 和 `Security.sha256`。
2. 在「连接与设置」复制本机配对码。打开 [你的网站](https://codex-pulse-willow-0911.wozhe0196.chatgpt.site/#qduo)，在 QDuo 板块填写配对码。
3. 浏览器首次连接本机可能要求允许访问本地网络。接口只绑定 `127.0.0.1:17643`，验证指定网站来源和 `X-QDuo-Token`；不会开放公网监听。配对码不放在 URL 中。
4. 点击关闭窗口会留在托盘；退出请右击托盘图标选择「退出」。默认不会注册开机自启动或改 Windows 配置。

## 划词、截图与文本

在其他应用选中文本后按 **Ctrl+Alt+Q** 调出动作胶囊。先读取 Windows UI Automation 选区，无法读取时模拟复制并恢复剪贴板。部分应用、受保护窗口或以管理员身份运行的应用不允许读取；此时可手动粘贴到工作台。快捷键冲突时使用主窗口按钮。

**Ctrl+Alt+S** 框选屏幕区域并使用 Windows `Windows.Media.Ocr` 本机识字。需要 Windows 已安装对应 OCR 语言；可在系统语言设置中安装。识字不联网，临时截图识别后删除。过大区域需缩小框选。截图中的文字没有可回写原选区，结果提供复制。

支持翻译、润色、总结、解释与自定义 AI 提示词（`{{text}}` 替换输入）；兼容 OpenAI Chat Completions API。填写 Base URL、模型名称和你的 API Key；API Key 与网站配对码用当前 Windows 用户的 DPAPI 加密保存在 `%LOCALAPPDATA%\QDuoWindows\settings.json`。远程服务需要 HTTPS。本地 Ollama 可填 `http://localhost:11434/v1` 和你已经安装的模型，密钥可以留空。程序不会安装或下载模型。AI 会将输入和提示词发到你指定的服务。

22 个本地文本动作：大写、小写、英文标题与句首大小写、camelCase、PascalCase、snake_case、kebab-case、每行去空格、合并空白、删除空行、排序、去重、合并行、简繁转换、JSON 格式化/压缩、URL 编码/解码、删除常见追踪参数、字数统计。简繁转换使用 Windows 系统转换。没有拼音词典，也不宣称拼音或词义转换。

输出可复制，或尝试替换/追加到原选区。回写会检查原窗口、进程以及当前选区文本与捕获时一致；无法确认时只复制结果。目标应用是否接受粘贴需用户确认。输入改变之后建议直接复制结果，避免回写陈旧选区。

朗读使用 Windows 已安装的语音。搜索支持含 `{{text}}` 的 HTTP/HTTPS URL 模板。自定义 PowerShell 动作仅可在本机编辑、审核和运行；首次及内容修改后需阅读脚本并确认当前版本。脚本以当前用户权限运行，可访问本机文件及网络；网页接口不会执行任意脚本。脚本输入为 `$QDuoText`，输出为标准输出，30 秒超时。

## 应用与 C 盘

快速体检包括磁盘空间、内存、进程、已安装应用、常见缓存目录和启动项；扩展扫描读取已知缓存目录以及 Downloads 大文件，不是全 C 盘逐文件扫描。访问受限目录会记录为错误/限制，报告大小为文件逻辑大小，不保证等同文件实际分配空间；硬链接、压缩与系统保留空间可产生差异。网页与桌面均可查看报告，桌面可导出 JSON。

体检为只读。「Windows 存储设置」打开系统清理入口；网页「清理与文件」提供下述独立清理、文件详情和 Defender 功能。当前浏览器配对后，刷新网页会自动尝试连接正在运行的客户端。

## 自动清理、恢复与病毒防护（1.1.0）

清理只接受本机已扫描出的文件编号，不接受网页传入删除路径或命令。低风险范围是固定的 npm/pip/uv/NuGet 与浏览器下载缓存，要求至少 7 天未修改或访问，相关应用运行时整处缓存跳过。中风险仅限至少 30 天未使用的用户临时文件，并要求电脑端弹出窗口确认具体清单。扫描保护源码、文档、图片音视频、数据库、密钥、可执行文件、项目标志目录、恢复资料、只读/加密/锁定文件、硬链接和重解析点。

每次最多处理 500 个文件、128 MiB，单文件不超过 32 MiB。执行前重新验证属性、时间、路径、应用使用状态和句柄；先生成主流 ZIP 备份并校验 SHA-256、落盘恢复日志，再把完整原文件对象同盘原子重命名到 `%LOCALAPPDATA%\QDuoWindows\Recovery`。完整原件保留所有数据流、权限和文件身份，随后尝试 Windows NTFS 压缩；不支持压缩时原件仍完整留存。同盘之外的隔离不执行。已有附加数据流的文件直接保护，检查后才出现的附加流也随完整原件保留。

Codex 包环境可能把恢复目录映射到自己的 LocalCache，界面显示真实位置。网页逐项显示成功、跳过和失败原因，提供恢复按钮；新版恢复将同一原文件对象移回，不覆盖已有文件，恢复原时间和压缩状态。隔离不会自动销毁原件或备份。隔离区占用包括完整原件的分配大小和 ZIP 大小，因此压缩收益少时全盘实测空间差额可能为零或负值。界面区分文件逻辑大小、隔离区占用和磁盘可用空间变化。

病毒防护调用 Windows Defender 固定操作：读取状态、快速/完整扫描、更新签名、处理 Defender 已确认的活动威胁。威胁处理在本机窗口确认，不接受网页指定文件或排除规则，不关闭系统保护。Defender 不可用、权限不足、超时或需要重启时显示实际状态与建议；「没有检测到」不能保证绝对无病毒。杀毒隔离由 Windows Defender 管理，QDuo 缓存恢复按钮不管理杀毒隔离。

## 文件时间、创建应用与收藏链接

文件目录扫描覆盖已发现的个人目录、项目目录与已知缓存，显示扫描范围、时间/数量限额、未读取目录和分页结果，不是全盘无限遍历。每项显示 Windows 当前记录的创建、修改和访问时间，网页按台北时区显示到秒。复制、迁移或工具可能改变创建时间，访问时间更新也取决于系统设置。

Windows 普通文件属性不保存完整的「哪个应用创建」历史。仅当电脑已存在匹配的 Sysmon 文件创建事件时显示相应记录；固定缓存目录只能推断所属应用，其余显示未知。程序不安装 Sysmon，也不补造历史。收藏关联使用现有网站收藏、下载来源元数据、精确 Git/部署项目标识或你明确绑定的根目录，并显示证据和置信度；仅同域名时标为同域参考。

图片通过本机认证接口生成小尺寸 JPEG 预览，支持 PNG/JPEG/GIF/BMP；WebP 仅列为图片，不保证系统解码。文件名、路径、报告和预览留在电脑与当前浏览器，不上传网站服务器。只从网站读取收藏，再送到本机匹配。映射保存在本机 `file-bindings.json`；模型设置和配对码仍使用原来的 DPAPI 配置。

## 从源码构建

在 Windows PowerShell 中运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\build.ps1
```

`build\QDuoWindows.exe` 为输出。使用 Windows 自带 `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`，C# 5 和系统程序集编译。`Core.cs` 提供体检与认证桥，`ServiceRoutes.cs` 校验固定参数，`Safety.cs` 提供隔离/恢复，`FileCatalog.cs` 提供元数据与预览，`Desktop.cs` 提供桌面与本机确认，两个 `.ps1` 是固定系统桥。

命令行（不会注册启动项）：

```powershell
Start-Process -FilePath .\build\QDuoWindows.exe -ArgumentList '--self-test' -Wait -PassThru
Start-Process -FilePath .\build\QDuoWindows.exe -ArgumentList '--report','C:\path\report.json' -Wait -PassThru
Start-Process -FilePath .\build\QDuoWindows.exe -ArgumentList '--headless'
```

`--report` 加 `--deep` 做深度扫描；`--headless` 在托盘启动同一程序和本机接口。`--serve-test` 与 `--headless` 等价，仅供本机集成测试，不放宽来源或认证检查。`--self-test` 检查本地转换、无效输入拒绝、DPAPI 与 URI 规则，不访问外部 AI 服务。GUI 程序没有控制台，调试构建可将 `/target:winexe` 改成 `/target:exe` 获取自检文字输出。

## 安全边界与限制

网站可通过已授权配对请求报告、扫描、受限缓存隔离与恢复、Defender 固定操作、文件目录与预览、预定义文本动作、AI、朗读、复制和打开 HTTP/HTTPS 网页；不能传入 PowerShell、任意命令或删除路径。配对码可在本机重新生成使旧码失效。EXE 尚未代码签名，Windows SmartScreen 可能显示发布者未知；源码可自行编译验证。
