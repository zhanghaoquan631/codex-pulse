require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '24kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 5241;
const TIME_ZONE_LABEL = 'China';
const smtpUser = String(process.env.SMTP_USER || '').trim();
const smtpPass = String(process.env.SMTP_PASS || '').trim();
const smtpConfigured = Boolean(
  smtpUser
  && smtpPass
  && !/请填|授权码|password|稍后|手动填写/iu.test(smtpPass)
);

// 163 信箱 SMTP 設定
// SMTP_PASS 必須是 163 信箱的「授權碼」，不是登入密碼！
// 取得方式：登入 163 信箱網頁版 -> 設定 -> POP3/SMTP/IMAP -> 開啟 SMTP 服務 -> 產生授權碼
const transporter = smtpConfigured ? nodemailer.createTransport({
  host: 'smtp.163.com',
  port: 465,
  secure: true, // 465 用 SSL
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
}) : null;

// 伺服器啟動時先檢查一次帳密是否能登入 SMTP，方便你排查問題
if (transporter) {
  transporter.verify((err) => {
    if (err) {
      console.error('❌ SMTP 連線/登入失敗，請檢查 .env 裡的 SMTP_USER / SMTP_PASS：', err.message);
    } else {
      console.log('✅ SMTP 連線成功，寄信功能可以正常使用');
    }
  });
} else {
  console.warn('⚠️ 尚未設定 163 SMTP 授權碼；頁面可以預覽，但寄信功能會保持停用。');
}

const attempts = new Map();
function bookingRateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || 'local';
  const now = Date.now();
  const active = (attempts.get(key) || []).filter((time) => now - time < 15 * 60 * 1000);
  if (active.length >= 5) return res.status(429).json({ ok: false, error: '预约提交过于频繁，请 15 分钟后再试。' });
  active.push(now);
  attempts.set(key, active);
  next();
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

const validTime = (value) => /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/u.test(value);
const cleanText = (value, max) => String(value || '').trim().slice(0, max);

app.post('/api/book', bookingRateLimit, async (req, res) => {
  const date = cleanText(req.body?.date, 10);
  const time = cleanText(req.body?.time, 8);
  const name = cleanText(req.body?.name, 120);
  const email = cleanText(req.body?.email, 254);
  const notes = cleanText(req.body?.notes, 2_000);

  if (!validDate(date)) return res.status(400).json({ ok: false, error: '预约日期格式无效' });
  if (!validTime(time)) return res.status(400).json({ ok: false, error: '预约时间必须包含时、分、秒，例如 09:30:00' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) return res.status(400).json({ ok: false, error: '联系邮箱格式无效' });
  if (!transporter) return res.status(503).json({ ok: false, error: '邮件服务尚未设定，请先在 .env 填入 163 SMTP 授权码。' });

  const displayName = name || '未填写';
  const displayEmail = email || '未填写';
  const displayNotes = notes || '（无）';

  const notifyTarget = String(process.env.NOTIFY_TARGET || smtpUser).trim();

  const mailOptions = {
    from: `"Alex 预约系统" <${smtpUser}>`,
    to: notifyTarget,
    subject: `新預約通知：${date} ${time}`,
    text:
`收到一笔新的 Alex Discovery Call 预约

时间：${date} ${time} · 15 分钟 · ${TIME_ZONE_LABEL}
称呼：${displayName}
联系邮箱：${displayEmail}
意见建议：${displayNotes}
`,
    replyTo: email || undefined,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ 已寄出通知信給 ${notifyTarget}（預約：${date} ${time}）`);
    res.json({ ok: true, message: '通知信已送出' });
  } catch (err) {
    console.error('❌ 寄信失敗：', err.message);
    res.status(500).json({ ok: false, error: '寄信失敗，請稍後再試，或直接聯絡我們。' });
  }
});

// 健康檢查，方便部署平台確認服務是否存活
app.get('/api/health', (req, res) => res.json({ ok: true, mailConfigured: smtpConfigured, timeZone: TIME_ZONE_LABEL }));

app.listen(PORT, () => {
  console.log(`伺服器已啟動：http://localhost:${PORT}`);
});
