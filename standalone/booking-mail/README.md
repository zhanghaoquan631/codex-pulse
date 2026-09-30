# Alex Discovery Call 预约系统（163 SMTP 真正寄信版）

这是一个 Node.js 后端 + 前端预约页面，透过 **163 信箱 SMTP** 真正把预约通知信寄到你的信箱，不用再靠使用者手动按「打开邮件客户端」。页面姓名为 **Alex**，时区显示为 **China**，日期日历沿用原版，时间可以在全天范围内精确选择到时、分、秒。

```
booking-backend-alex-all-day/
├── server.js          後端主程式（Express + Nodemailer）
├── package.json
├── .env.example        環境變數範本（複製成 .env 使用）
├── .gitignore
└── public/
    └── index.html       预约页面前端
```

---

## 第一步：取得 163 信箱的「授权码」

**注意：SMTP 不能用你 163 信箱的登入密码，必须用「授权码」。**

1. 网页登入 163 信箱：https://mail.163.com
2. 上方选单：**设置** → **POP3/SMTP/IMAP**
3. 找到「IMAP/SMTP服务」或「POP3/SMTP服务」，点击**开启**
4. 系统会要求手机验证，验证后会显示一组 16 位左右的**授权码**（例如 `ABCDEFGHIJKLMNOP`）
5. **把这组授权码记下来** — 它只会显示一次，等一下要填进 `.env`

---

## 第二步：本机安装与设定

你的电脑需要先安装 [Node.js](https://nodejs.org/)（18 版以上）。装好后：

```bash
# 1. 进入专案资料夹
cd booking-backend

# 2. 安装套件
npm install

# 3. 建立 .env（把范本复制一份）
Copy-Item .env.example .env
```

打开 `.env`，把里面的值改成你自己的：

```
SMTP_USER=owner@example.com
SMTP_PASS=你剛剛拿到的163授權碼
NOTIFY_TARGET=owner@example.com
PORT=5241
```

---

## 第三步：本机测试

```bash
npm start
```

看到终端机出现：

```
✅ SMTP 连线成功，寄信功能可以正常使用
伺服器已启动：http://localhost:5241
```

代表设定成功。打开浏览器输入 `http://localhost:5241`，走一遍预约流程，选择日期以及准确的时、分、秒，填写资料并确认；最后一页应该会显示「✅ 通知信已成功送出」，同时你的 163 信箱会收到一封新预约通知信。

如果还没有填写授权码，页面仍可正常打开与测试；健康检查会显示 `mailConfigured: false`，提交预约时会明确提示“邮件服务尚未设定”，不会假装已经寄出。

如果显示 `❌ SMTP 连线/登入失败`，通常是：
- `.env` 里的 `SMTP_PASS` 填错（记得是授权码不是登入密码）
- 163 信箱的 SMTP 服务还没开启

---

## 第四步：部署上线（让别人也能预约）

本机测试没问题后，要放到网路上让其他人也能使用，推荐用 **Render.com**（有免费方案，操作简单）：

1. 把这个专案上传到 GitHub（新建一个 repository，把 `booking-backend` 资料夹的内容 push 上去；`.env` 不会被上传，因为 `.gitignore` 已经排除它）
2. 登入 https://render.com → **New** → **Web Service**
3. 选择你刚刚建立的 GitHub repository
4. 设定：
   - **Build Command**：`npm install`
   - **Start Command**：`npm start`
5. 在 **Environment**（环境变数）分页，手动加入以下三个变数（就是 `.env` 里的内容）：
   - `SMTP_USER` = `owner@example.com`
   - `SMTP_PASS` = 你的163授权码
   - `NOTIFY_TARGET` = `owner@example.com`
6. 按 **Create Web Service**，等它部署完成，会给你一个网址，例如 `https://your-app.onrender.com`
7. 打开这个网址，就是一个真正能寄信的线上预约页面了

其他也可以用的平台：Railway、Fly.io、或是自己的 VPS（用 `pm2 start server.js` 常驻执行）。原理都一样：跑起 `server.js`，并把三个环境变数设定好。

---

## 安全提醒

- **授权码不要放进程式码或分享给别人**，只放在 `.env`（本机）或部署平台的「环境变数」设定里。
- 如果哪天授权码外泄，回到 163 信箱设置页面重新产生一组新的即可，旧的会失效。
