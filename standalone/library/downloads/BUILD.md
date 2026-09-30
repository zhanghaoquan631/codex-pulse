# 灵感库 Windows 直播回放助手

`LinganLive.py` 是 Tkinter 界面与后台队列，`live_core.py` 是固定站点协议、文件稳定判定及 DPAPI 凭据存储。运行只依赖 Python 3.11+ 标准库；发行 EXE 内置 Python 与 Tkinter。

在此目录构建（PowerShell）：

```powershell
python -m pip install --target build-deps pyinstaller
$env:PYTHONPATH = (Resolve-Path build-deps).Path
$env:PYINSTALLER_CONFIG_DIR = Join-Path (Get-Location).Path 'build-cache'
python -m PyInstaller --onefile --windowed --name LinganLive --distpath dist --workpath build --specpath . --noconfirm LinganLive.py
python -m unittest discover -s tests -v
python package_release.py
```

打包 ZIP 包含 `dist/LinganLive.exe`、`使用说明.txt` 与 `obs-scenes/templates` 的三种 OBS 场景和 `basic.ini` 配置，附场景教程。凭据、队列、用户录像与测试数据不会加入发行包。三种场景的下载 ZIP 从相同模板生成；运行 `python obs-scenes/validate_templates.py` 校验包内容，运行 `python obs-scenes/build_templates.py` 可重新生成场景 ZIP。更新根场景说明时同步 `templates/README-使用说明.md` 到 `obs-scenes/使用说明.txt`。

安全与行为：

- Origin 固定为 `https://lingan-library.wozhe0196.chatgpt.site`，拒绝重定向。
- 配对凭据通过当前 Windows 用户的 DPAPI 加密，保存在 `%LOCALAPPDATA%\LinganLive\pairing.dpapi`。
- 初始目录快照排除已有文件；新文件大小与修改时间稳定至少 60 秒且 Windows 独占打开成功后入队。
- 仅只读访问本地录像，单文件不超过 8 GiB；同名 MP4 优先于 MKV。
- SHA256 对整个文件逐块计算；上传期间再计算并校验，完成接口返回确认后才记为已保存。
- 重试重新初始化同一个 SHA256 上传，后端返回同一个上传 ID；已完成上传幂等返回。
- 401 / 403 停止自动重试及监测，等待重新配对。其他失败使用 15 秒至 15 分钟退避。
- 停止监测不取消已入队文件；关闭程序暂停队列，下次启动恢复。

验证通过本地 HTTP mock，测试运输层替换不会进入发行版的正常请求路径。验证涵盖双分块原始字节、整文件 hash、元数据、完成与幂等、认证拒绝、重定向拒绝、Windows DPAPI、独占打开、目录初始快照、60 秒稳定、MP4 优先、空文件及大小上限。未主动启动原生 GUI 或用户直播软件。
