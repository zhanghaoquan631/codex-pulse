剪映联动助手（Windows + Python 3）

本助手管理普通视频素材和成品，不修改剪映的工程或草稿格式。
1. 解压 ZIP，在此文件夹运行 PowerShell：powershell -ExecutionPolicy Bypass -File .\install.ps1
2. 网站剪映板块点击“连接此电脑”，允许浏览器打开“剪映联动”。连接码五分钟有效、只能使用一次。
3. 在网站选视频并点击“保存素材并打开剪映”。素材文件夹自动打开；在剪映中点击“导入”，选择该视频。
4. 剪映的工程仍由剪映自身保存。首次导出时，设置目录为助手 data\成品 文件夹（网站“打开成品文件夹”可定位）。
5. 电脑开机、助手运行且联网时，新导出的 MP4/WebM 自动进入网站待处理；关闭网页仍可回传。

单文件当前上限 25 MB。大文件、离线和失败均保留本机原件，不显示成品已入库；网络恢复后重试。
网站可断开此电脑连接。令牌限于视频下载与成品入库，90 天有效，使用 Windows 当前用户 DPAPI 加密保存在 connection.bin。
设备断开后助手不能再读取或上传文件。卸载：删除 HKCU\Software\Classes\lingan-jianying 协议注册，
删除 HKCU\Software\Microsoft\Windows\CurrentVersion\Run 下 LinganJianying 启动项，并删除助手程序；素材和成品请先另行保存。
剪映官方下载：https://apps.microsoft.com/detail/xpdm5fwdzzvhbx?gl=CN&hl=zh-CN
微软 WinGet 官方厂商安装包：winget install --id ByteDance.JianyingPro --exact --source winget --scope user --silent --accept-source-agreements --accept-package-agreements
