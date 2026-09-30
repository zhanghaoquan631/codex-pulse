import { database } from '@/db/raw';
import { boundedJson, isOwner, websiteId } from '@/lib/website-api';
import { bookingFields, bookingReply, notifyBooking, type Booking } from '@/lib/booking';

export async function GET(request: Request) {
  if (!isOwner(request)) return bookingReply({ canManage: false, bookings: [] });
  try {
    const result = await database().prepare(`SELECT ${bookingFields} FROM booking_requests ORDER BY created DESC LIMIT 100`).all<Booking>();
    const bookings = result.results;
    // Reconcile only mail already attempted; reading the list never sends new mail.
    await Promise.allSettled(bookings.filter(b => b.notification === 'sending').slice(0, 5).map(async booking => { booking.notification = await notifyBooking(booking); }));
    return bookingReply({ canManage: true, bookings: bookings.map(({id,date,time,name,email,notes,notification,created}) => ({id,date,time,name,email,notes,notification,created})) });
  } catch { return bookingReply({ canManage: true, error: '预约记录暂时无法读取，请稍后刷新。' }, 503); }
}

export async function POST(request: Request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin) return bookingReply({ ok: false, error: '请从预约页面提交。' }, 403);
  let data;
  try { data = await boundedJson(request, 12000); } catch { return bookingReply({ ok: false, error: '预约内容格式无效或过长。' }, 400); }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!data || typeof data !== 'object' || typeof data.id !== 'string' || !uuid.test(data.id)) return bookingReply({ ok: false, error: '预约编号无效，请重新提交。' }, 400);
  if (['date','time','name','email','notes'].some(field => typeof data[field] !== 'string')) return bookingReply({ ok: false, error: '请完整填写预约资料。' }, 400);
  const { date, time } = data;
  const name = data.name.trim(), email = data.email.trim(), notes = data.notes.trim(), id = data.id.toLowerCase();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time)) return bookingReply({ ok: false, error: '请选择有效的日期和时间。' }, 400);
  const starts = Date.parse(`${date}T${time}+08:00`), ends = starts + 15 * 60000;
  if (!Number.isFinite(starts) || new Date(starts + 8 * 3600000).toISOString().slice(0, 10) !== date || name.length > 120 || email.length > 254 || notes.length > 2000 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bookingReply({ ok: false, error: '请检查日期、联系邮箱及资料长度。' }, 400);
  try {
    const db = database(), fingerprint = await websiteId(JSON.stringify([date,time,name,email,notes]));
    const existing = await db.prepare(`SELECT ${bookingFields} FROM booking_requests WHERE id=?`).bind(id).first<Booking>();
    if (existing) {
      if (existing.fingerprint !== fingerprint) return bookingReply({ ok: false, error: '此预约编号已使用，请重新开始预约。' }, 409);
      return bookingReply({ ok: true, id, saved: true, notification: await notifyBooking(existing, true) });
    }
    if (starts <= Date.now()) return bookingReply({ ok: false, error: '这个时间已经过去，请选择未来的时间。' }, 400);
    const ip = await websiteId(request.headers.get('cf-connecting-ip') || 'local'), created = Date.now();
    // One atomic INSERT prevents overlapping 15-minute bookings and concurrent quota bypass.
    const inserted = await db.prepare(`INSERT INTO booking_requests(id,fingerprint,date,time,name,email,notes,starts,ends,notification,ip_hash,created)
      SELECT ?,?,?,?,?,?,?,?,?,'pending',?,?
      WHERE NOT EXISTS (SELECT 1 FROM booking_requests WHERE starts<? AND ends>?)
      AND (SELECT COUNT(*) FROM booking_requests WHERE ip_hash=? AND created>?)<5
      ON CONFLICT(id) DO NOTHING`).bind(id,fingerprint,date,time,name,email,notes,starts,ends,ip,created,ends,starts,ip,created-15*60000).run();
    const saved = await db.prepare(`SELECT ${bookingFields} FROM booking_requests WHERE id=?`).bind(id).first<Booking>();
    if (!saved) {
      const count = await db.prepare('SELECT COUNT(*) count FROM booking_requests WHERE ip_hash=? AND created>?').bind(ip,created-15*60000).first<{count:number}>();
      if ((count?.count || 0) >= 5) return bookingReply({ ok: false, error: '预约提交过于频繁，请 15 分钟后再试。' }, 429);
      return bookingReply({ ok: false, error: '这个时间段已有预约，请选择另一个时间。' }, 409);
    }
    if (saved.fingerprint !== fingerprint) return bookingReply({ ok: false, error: '预约编号已用于其他内容。' }, 409);
    const notification = await notifyBooking(saved, !!inserted.meta.changes);
    return bookingReply({ ok: true, id, saved: true, notification }, inserted.meta.changes ? 201 : 200);
  } catch { return bookingReply({ ok: false, error: '暂时无法确认保存结果。请保留页面，使用重新提交核对同一预约。' }, 503); }
}
