export type MicProfile = "voice" | "music";
export type MicTone = { gain: number; low: number; mid: number; high: number };
export type MicRoomResponse = { canCreate?: boolean; error?: string; offer?: unknown; answer?: unknown; expiresAt?: number; claimed?: boolean; ok?: boolean };
export const flatTone: MicTone = { gain: 1, low: 0, mid: 0, high: 0 };

export function microphoneConstraints(profile: MicProfile, deviceId: string): MediaTrackConstraints {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    channelCount: { ideal: 1 }, sampleRate: { ideal: 48000 },
    echoCancellation: profile === "voice", noiseSuppression: profile === "voice",
    autoGainControl: false,
  };
}

export function recordingType(supports: (type: string) => boolean) {
  return ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find(supports) || "";
}
export function recordingExtension(type: string) {
  return type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
}
export function clockTime(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}
export function micError(cause: unknown) {
  const name = cause instanceof Error ? cause.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "麦克风权限未开启。请在浏览器的网站权限里允许麦克风，再重试。";
  if (name === "NotFoundError") return "未找到麦克风。请插入麦克风或安装虚拟输入设备，再刷新设备。";
  if (name === "NotReadableError") return "麦克风暂时无法使用，可能被其他程序占用。关闭占用程序后重试。";
  if (name === "OverconstrainedError") return "这个输入设备已不可用，请刷新设备并重新选择。";
  return cause instanceof Error ? cause.message : "未能开启麦克风，请重试。";
}

// MicYou's built-in Web client must be opened on its own local origin.
export function micYouAddress(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    const local = host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".local") || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) || /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host);
    if (url.protocol !== "https:" || !local || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    if (!url.port) url.port = "8443";
    return url.href;
  } catch { return null; }
}

export function validMicSdp(value: unknown, type: "offer" | "answer"): value is RTCSessionDescriptionInit {
  if (!value || typeof value !== "object") return false;
  const description = value as RTCSessionDescriptionInit;
  return description.type === type && typeof description.sdp === "string" && description.sdp.length <= 24000 && description.sdp.startsWith("v=0") && /(?:^|\r?\n)m=audio /.test(description.sdp) && !/(?:^|\r?\n)m=(?:video|application) /.test(description.sdp);
}

export const validRoomId = (value: unknown): value is string => typeof value === "string" && /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/.test(value);
export const validRoomToken = (value: unknown): value is string => typeof value === "string" && /^[a-f\d]{64}$/.test(value);

export async function gatherMicIce(peer: RTCPeerConnection) {
  if (peer.iceGatheringState === "complete") return;
  await new Promise<void>((resolve, reject) => {
    const done = () => { clearTimeout(timer); peer.removeEventListener("icegatheringstatechange", changed); peer.removeEventListener("connectionstatechange", closed); };
    const changed = () => { if (peer.iceGatheringState === "complete") { done(); resolve(); } };
    const closed = () => { if (peer.connectionState === "closed") { done(); reject(new Error("连接已取消。")); } };
    const timer = setTimeout(() => { done(); reject(new Error("未能准备网络连接，请重试或换一个网络。")); }, 15000);
    peer.addEventListener("icegatheringstatechange", changed);
    peer.addEventListener("connectionstatechange", closed);
    changed();
  });
}
