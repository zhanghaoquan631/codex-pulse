import { database } from "@/db/raw";
import { boundedJson, canWrite, isOwner, websiteId } from "@/lib/website-api";
import { validMicSdp, validRoomId, validRoomToken } from "@/lib/microphone-utils";

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store, private", Vary: "Cookie, Authorization", "X-Content-Type-Options": "nosniff" } });
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
const tokenFrom = (request: Request) => request.headers.get("Authorization")?.replace(/^Bearer /, "") || "";
type Room = { offer: string; answer: string | null; expires_at: number };
async function authorizedRoom(request: Request, role: "sender" | "receiver", id: string) {
  const token = tokenFrom(request); if (!validRoomToken(token)) return null;
  const hash = await websiteId(token);
  return database().prepare(`SELECT offer,answer,expires_at FROM microphone_rooms WHERE id=? AND ${role === "sender" ? "sender_hash" : "receiver_hash"}=? AND expires_at>?`).bind(id, hash, Date.now()).first<Room>();
}

export async function GET(request: Request) {
  const url = new URL(request.url), id = url.searchParams.get("room");
  if (id === null) return reply({ canCreate: isOwner(request) });
  const role = request.headers.get("X-Mic-Role");
  if (!validRoomId(id) || (role !== "sender" && role !== "receiver")) return reply({ error: "连接信息无效，请重新生成链接。" }, 400);
  try {
    const room = await authorizedRoom(request, role, id);
    if (!room) return reply({ error: "连接链接已失效，请在电脑上重新生成。" }, 404);
    if (role === "sender") return reply({ offer: JSON.parse(room.offer), expiresAt: room.expires_at, claimed: !!room.answer });
    return reply({ answer: room.answer ? JSON.parse(room.answer) : null, expiresAt: room.expires_at });
  } catch { return reply({ error: "连接服务暂时不可用，请稍后重试。" }, 503); }
}

export async function POST(request: Request) {
  if (request.headers.get("Origin") !== new URL(request.url).origin) return reply({ error: "请从本站创建连接。" }, 403);
  let body;
  try { body = await boundedJson(request, 32000); } catch { return reply({ error: "连接信息过大或格式无效。" }, 400); }
  if (body?.action === "create") {
    if (!canWrite(request)) return reply({ error: "请先使用网站管理账号登录，再创建手机连接。" }, 403);
    if (!validMicSdp(body.offer, "offer")) return reply({ error: "音频连接信息无效，请重试。" }, 400);
    const id = crypto.randomUUID(), receiverToken = randomToken(), senderToken = randomToken(), expiresAt = Date.now() + 600000;
    try {
      const owner = await websiteId(request.headers.get("oai-authenticated-user-email")!.toLowerCase());
      await database().batch([
        database().prepare("DELETE FROM microphone_rooms WHERE expires_at<=?").bind(Date.now()),
        database().prepare("INSERT INTO microphone_rooms(id,owner,receiver_hash,sender_hash,offer,answer,expires_at) VALUES(?,?,?,?,?,NULL,?) ON CONFLICT(owner) DO UPDATE SET id=excluded.id,receiver_hash=excluded.receiver_hash,sender_hash=excluded.sender_hash,offer=excluded.offer,answer=NULL,expires_at=excluded.expires_at").bind(id, owner, await websiteId(receiverToken), await websiteId(senderToken), JSON.stringify(body.offer), expiresAt),
      ]);
      return reply({ room: id, receiverToken, senderToken, expiresAt }, 201);
    } catch { return reply({ error: "未能创建连接，请稍后重试。" }, 503); }
  }
  if (body?.action === "answer") {
    const token = tokenFrom(request);
    if (!validRoomId(body.room) || !validRoomToken(token) || !validMicSdp(body.answer, "answer")) return reply({ error: "音频连接信息无效，请重新打开连接链接。" }, 400);
    try {
      const hash = await websiteId(token), answer = JSON.stringify(body.answer);
      const result = await database().prepare("UPDATE microphone_rooms SET answer=? WHERE id=? AND sender_hash=? AND answer IS NULL AND expires_at>?").bind(answer, body.room, hash, Date.now()).run();
      if (result.meta.changes === 1) return reply({ ok: true });
      const existing = await authorizedRoom(request, "sender", body.room);
      if (existing?.answer === answer) return reply({ ok: true });
      return reply({ error: existing ? "这个链接已被另一台手机使用，请重新生成连接。" : "连接链接已失效，请在电脑上重新生成。" }, existing ? 409 : 404);
    } catch { return reply({ error: "连接服务暂时不可用，请重试。" }, 503); }
  }
  return reply({ error: "未知连接操作。" }, 400);
}

export async function DELETE(request: Request) {
  if (request.headers.get("Origin") !== new URL(request.url).origin) return reply({ error: "请从本站结束连接。" }, 403);
  const id = new URL(request.url).searchParams.get("room"), token = tokenFrom(request);
  if (!validRoomId(id) || !validRoomToken(token)) return reply({ error: "连接信息无效。" }, 400);
  try { await database().prepare("DELETE FROM microphone_rooms WHERE id=? AND receiver_hash=?").bind(id, await websiteId(token)).run(); return reply({ ok: true }); }
  catch { return reply({ error: "未能清除配对链接，它将在 10 分钟内自动失效。" }, 503); }
}
