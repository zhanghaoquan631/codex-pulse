# SweetCam 手机桥（最小独立服务）

这个服务让同一局域网内、已配对手机安全进入 **SweetCam V1 手机工作台**，并把手机选择的**原始照片或录像**落到本机，再由 SweetCam V1 桌面页导入自己的本地图库。

它不会修改现有的 5174 Vite 服务、不会迁移或删除 SweetCam 既有浏览器记录，也不会覆盖任何上传文件。

## 启动

在 ME.zip 仓库根目录执行：

```powershell
node services/sweetcam-mobile-bridge/src/sweetcam-mobile-bridge.mjs
```

默认监听 `0.0.0.0:4330`。可选环境变量：

```powershell
$env:MEZIP_SWEETCAM_MOBILE_PORT = '4330'
$env:MEZIP_SWEETCAM_MOBILE_HOST = '0.0.0.0'
node services/sweetcam-mobile-bridge/src/sweetcam-mobile-bridge.mjs
```

也可以在服务目录执行：

```powershell
npm run start
```

运行测试：

```powershell
node --test services/sweetcam-mobile-bridge/src/sweetcam-mobile-bridge.test.mjs
```

## 桌面端协议

桌面 SweetCam V1 从 `http://127.0.0.1:5174` 以 `credentials: 'include'` 调用：

1. `GET /v1/sweetcam/mobile/desktop-session` 建立仅限本机的桌面会话；
2. `POST /v1/sweetcam/mobile/invite` 获取手机链接；
3. `GET /v1/sweetcam/media` 获取已上传的媒体列表；
4. `GET /v1/sweetcam/media/:id` 下载一个原始文件并导入 V1 的 IndexedDB。

服务只对精确 Origin `http://127.0.0.1:5174` 返回 CORS 许可；产生手机链接与读取桌面列表还同时要求请求来自本机 loopback。手机首次打开带随机 token 的链接后，token 会一次性换成 HttpOnly、SameSite=Strict 会话 Cookie，并立刻重定向到受保护的手机工作台；token 不会留在工作台地址栏或落盘状态里。

## 手机端协议

手机链接以 `/mobile?pair=...` 开始，但该路径只负责一次性配对，随后会重定向到受保护的 `/studio/index.html`。工作台在本服务的 `4330` 端口提供现有 SweetCam V1 的 `index.html`、`sweetcam.css` 与 `sweetcam.js`；不会把原有 `5174` Vite 服务开放到局域网。

工作台上传原始照片或录像时使用：

```text
POST /v1/sweetcam/mobile/uploads
Content-Type: <真实 MIME 类型>
X-SweetCam-Filename: <编码后的原文件名>
<原始二进制请求体>
```

服务校验 MIME、文件头和实际流式大小。支持 JPEG、PNG、WebP、GIF、HEIC、HEIF、MP4、WebM 与 MOV；照片单个上限 25 MB，视频单个上限 250 MB。文件保存到：

```text
%LOCALAPPDATA%\SweetCam\mobile-bridge\media
```

所有落盘文件由随机 UUID 命名并以“不存在才创建”的原子方式落盘；原文件名只作为展示元数据，因此上传不会覆盖任何旧文件。

## 当前边界

- 手机工作台复用 SweetCam V1 的现有拍摄、滤镜和编辑界面；桥本身不会擅自重编码或篡改上传原文件。
- 桥提供已上传媒体的受保护列表和原文件读取接口；SweetCam V1 页面需调用它的导入逻辑，才会把新媒体加入自己的浏览器图库。
- 该服务只适合手机和电脑处于同一可信 Wi-Fi。它不提供公网访问；如 Windows 防火墙启用，请仅为 4330 放行本地子网。
- 为遵守“只新增独立服务”的边界，本次没有把它加入现有开机 supervisor；需先手动启动，后续可单独接入启动守护。
