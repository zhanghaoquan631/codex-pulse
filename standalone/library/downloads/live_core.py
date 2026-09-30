"""Lingan Live helper protocol and file watcher (Python standard library only)."""
from __future__ import annotations

import ctypes
import hashlib
import json
import os
from pathlib import Path
import re
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Callable

ORIGIN = "https://lingan-library.wozhe0196.chatgpt.site"
CHUNK_SIZE = 8 * 1024 * 1024
MAX_SIZE = 8 * 1024 * 1024 * 1024
PLATFORMS = ("douyin", "bilibili", "kuaishou", "youtube", "twitch", "other")
EXTENSIONS = {".mp4", ".mkv", ".webm"}
PAIRING_RE = re.compile(r"^llive_[A-Za-z0-9_-]{8,128}\.[A-Za-z0-9_-]{16,512}$")


class ApiError(Exception):
    def __init__(self, message: str, status: int = 0):
        super().__init__(message)
        self.status = status

    @property
    def auth_failed(self):
        return self.status in (401, 403)


class UploadChanged(Exception):
    pass


class Cancelled(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # A redirect must never forward a pairing credential to another origin.
        return None


def valid_pairing(value: str) -> bool:
    return bool(PAIRING_RE.fullmatch(value.strip()))


def friendly_error(exc: Exception, credential: str = "") -> str:
    message = str(exc) or type(exc).__name__
    if credential:
        message = message.replace(credential, "[配对凭据已隐藏]")
    message = re.sub(r"llive_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[配对凭据已隐藏]", message)
    return message[:240]


class ApiClient:
    """Fixed-origin authenticated client. Transport injection is for local tests."""
    def __init__(self, pairing: str, transport: Callable | None = None):
        if not valid_pairing(pairing):
            raise ValueError("配对码格式不正确，请从网站复制完整配对码。")
        self._pairing = pairing.strip()
        self._transport = transport
        self._opener = urllib.request.build_opener(NoRedirect())

    def request(self, method: str, route: str, data=None, raw=False):
        if not route.startswith("/api/live/") or "?" in route or "#" in route:
            raise ValueError("不允许的接口路径。")
        payload = data if raw else (json.dumps(data, ensure_ascii=False).encode("utf-8") if data is not None else None)
        headers = {"Authorization": "Bearer " + self._pairing, "Accept": "application/json",
                   "Content-Type": "application/octet-stream" if raw else "application/json",
                   "User-Agent": "LinganLive/1.0"}
        try:
            if self._transport:
                status, body = self._transport(method, ORIGIN + route, headers, payload)
            else:
                req = urllib.request.Request(ORIGIN + route, payload, headers, method=method)
                with self._opener.open(req, timeout=90) as response:
                    status = response.status
                    body = response.read(1024 * 1024)
            try:
                result = json.loads(body.decode("utf-8"))
            except (ValueError, UnicodeError):
                raise ApiError("网站返回了无法识别的响应，请稍后重试。", status)
            if not isinstance(result, dict):
                raise ApiError("网站接口响应格式不正确。", status)
            if not 200 <= status < 300:
                raise ApiError(friendly_error(Exception(str(result.get("message", "请求未成功。"))), self._pairing), status)
            return result
        except urllib.error.HTTPError as exc:
            try:
                body = json.loads(exc.read(64 * 1024).decode("utf-8"))
                message = body.get("message", "请求未成功。")
            except Exception:
                message = "网站拒绝了请求，请稍后重试。"
            raise ApiError(friendly_error(Exception(message), self._pairing), exc.code) from None
        except urllib.error.URLError:
            raise ApiError("无法连接网站，请检查网络；助手会自动重试。") from None

    def device(self):
        return self.request("GET", "/api/live/device")

    def upload(self, path: Path, platform: str, sha256: str, progress: Callable,
               cancelled: Callable = lambda: False, saved_id: Callable = lambda _id: None):
        if platform not in PLATFORMS:
            raise ValueError("不支持的直播平台。")
        # Keep an exclusive read handle throughout the upload on Windows.
        with exclusive_reader(path) as stream:
            original = os.fstat(stream.fileno())
            if not 0 < original.st_size <= MAX_SIZE:
                raise ValueError("文件应大于 0 且不超过 8 GiB。")
            if path.suffix.lower() not in EXTENSIONS:
                raise ValueError("仅支持 MP4、WebM 和 MKV 文件。")
            info = {"name": path.name, "size": original.st_size, "sha256": sha256,
                    "platform": platform, "title": path.stem,
                    "endedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(original.st_mtime))}
            result = self.request("POST", "/api/live/uploads", info)
            upload_id = str(result.get("id", ""))
            if not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", upload_id):
                raise ApiError("网站返回了无效的上传编号。")
            saved_id(upload_id)
            if result.get("complete") is True:
                progress(original.st_size, original.st_size)
                return {"alreadySaved": True, "id": upload_id}
            if result.get("chunkSize") != CHUNK_SIZE:
                raise ApiError("网站使用了不兼容的分块大小，请更新助手。")
            uploaded = 0
            digest = hashlib.sha256()
            part = 0
            while True:
                if cancelled():
                    raise Cancelled()
                chunk = stream.read(CHUNK_SIZE)
                if not chunk:
                    break
                digest.update(chunk)
                part += 1
                response = self.request("PUT", f"/api/live/uploads/{upload_id}/parts/{part}", chunk, raw=True)
                if response.get("partNumber") != part or not isinstance(response.get("etag"), str) or not response["etag"]:
                    raise ApiError("分块确认失败，助手会重新尝试上传。")
                uploaded += len(chunk)
                progress(uploaded, original.st_size)
            current = os.fstat(stream.fileno())
            if (uploaded != original.st_size or digest.hexdigest() != sha256 or
                    current.st_mtime_ns != original.st_mtime_ns or current.st_size != original.st_size):
                raise UploadChanged("文件在上传过程中发生变化，等待录制结束后再试。")
            if cancelled():
                raise Cancelled()
            completed = self.request("POST", f"/api/live/uploads/{upload_id}/complete", {})
            if not isinstance(completed.get("item"), dict):
                raise ApiError("网站尚未确认回放已保存，助手会重新确认。")
            return completed


class exclusive_reader:
    """A read-only exclusive Windows handle; never writes or removes recordings."""
    def __init__(self, path: Path):
        self.path = path
        self.stream = None

    def __enter__(self):
        if os.name != "nt":
            self.stream = open(self.path, "rb")
            return self.stream
        import msvcrt
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.CreateFileW.argtypes = [ctypes.c_wchar_p, ctypes.c_uint32, ctypes.c_uint32,
                                      ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p]
        kernel.CreateFileW.restype = ctypes.c_void_p
        kernel.CloseHandle.argtypes = [ctypes.c_void_p]
        handle = kernel.CreateFileW(str(self.path), 0x80000000, 0, None, 3, 0x80, None)
        if handle == ctypes.c_void_p(-1).value:
            raise OSError(ctypes.get_last_error(), "文件仍被录制程序占用，稍后重试。")
        try:
            descriptor = msvcrt.open_osfhandle(handle, os.O_RDONLY | os.O_BINARY)
        except Exception:
            kernel.CloseHandle(handle)
            raise
        self.stream = os.fdopen(descriptor, "rb")
        return self.stream

    def __exit__(self, *_):
        if self.stream:
            self.stream.close()


def file_ready(path: Path) -> bool:
    try:
        with exclusive_reader(path):
            return True
    except (OSError, PermissionError):
        return False


def file_signature(path: Path):
    stat = path.stat()
    return stat.st_size, stat.st_mtime_ns


def hash_file(path: Path, progress: Callable = lambda *_: None,
              cancelled: Callable = lambda: False):
    with exclusive_reader(path) as stream:
        stat = os.fstat(stream.fileno())
        if path.suffix.lower() not in EXTENSIONS or not 0 < stat.st_size <= MAX_SIZE:
            raise ValueError("仅支持大于 0 且不超过 8 GiB 的 MP4、WebM、MKV 文件。")
        digest = hashlib.sha256()
        read = 0
        while True:
            if cancelled():
                raise Cancelled()
            chunk = stream.read(CHUNK_SIZE)
            if not chunk:
                break
            digest.update(chunk)
            read += len(chunk)
            progress(read, stat.st_size)
        final = os.fstat(stream.fileno())
        if file_signature(path) != (stat.st_size, stat.st_mtime_ns) or final.st_size != stat.st_size:
            raise UploadChanged("文件仍在变化，等待录制结束后再试。")
        return digest.hexdigest(), (stat.st_size, stat.st_mtime_ns)


@dataclass
class Candidate:
    signature: tuple
    stable_since: float


class DirectoryWatcher:
    def __init__(self, folder: Path, stable_seconds=60, ready=file_ready, now=time.monotonic):
        self.folder = folder.resolve()
        self.stable_seconds = stable_seconds
        self.ready = ready
        self.now = now
        self.baseline = set(self.files())
        self.candidates = {}
        self.delivered = set()
        self.delivered_stems = set()

    def files(self):
        # OBS and Douyin normally record directly inside the selected folder.
        try:
            return [p.resolve() for p in self.folder.iterdir() if p.is_file() and p.suffix.lower() in EXTENSIONS]
        except OSError:
            return []

    def poll(self):
        current_time = self.now()
        current = set(self.files())
        output = []
        for deleted in self.candidates.keys() - current:
            self.candidates.pop(deleted, None)
        for path in sorted(current, key=lambda p: (p.suffix.lower() != ".mp4", str(p))):
            stem = str(path.with_suffix("")).casefold()
            if path in self.baseline or path in self.delivered or stem in self.delivered_stems:
                continue
            try:
                signature = file_signature(path)
            except OSError:
                continue
            candidate = self.candidates.get(path)
            if candidate is None or candidate.signature != signature:
                self.candidates[path] = Candidate(signature, current_time)
                continue
            if not 0 < signature[0] <= MAX_SIZE or current_time - candidate.stable_since < self.stable_seconds:
                continue
            if path.suffix.lower() == ".mkv" and any(
                    other.suffix.lower() == ".mp4" and str(other.with_suffix("")).casefold() == stem for other in current):
                continue
            if not self.ready(path):
                continue
            self.delivered.add(path)
            self.delivered_stems.add(stem)
            output.append(path)
        return output


class CredentialVault:
    """DPAPI encryption tied to this Windows user. Plaintext is never persisted."""
    def __init__(self, folder: Path):
        self.path = folder / "pairing.dpapi"

    @staticmethod
    def _crypt(value: bytes, decrypt=False):
        if os.name != "nt":
            raise RuntimeError("配对凭据仅支持 Windows DPAPI 安全保存。")
        from ctypes import wintypes

        class Blob(ctypes.Structure):
            _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_ubyte))]

        buffer = (ctypes.c_ubyte * len(value)).from_buffer_copy(value)
        source = Blob(len(value), buffer)
        target = Blob()
        crypto = ctypes.WinDLL("crypt32", use_last_error=True)
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.LocalFree.argtypes = [ctypes.c_void_p]
        kernel.LocalFree.restype = ctypes.c_void_p
        # CRYPTPROTECT_UI_FORBIDDEN: do not show native credential dialogs.
        if decrypt:
            result = crypto.CryptUnprotectData(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(target))
        else:
            result = crypto.CryptProtectData(ctypes.byref(source), "Lingan Live pairing", None, None, None, 1, ctypes.byref(target))
        if not result:
            raise OSError(ctypes.get_last_error(), "无法安全读取或保存配对凭据。")
        try:
            return ctypes.string_at(target.pbData, target.cbData)
        finally:
            kernel.LocalFree(target.pbData)

    def load(self):
        if not self.path.exists():
            return None
        token = self._crypt(self.path.read_bytes(), decrypt=True).decode("utf-8")
        if not valid_pairing(token):
            raise ValueError("保存的配对凭据已失效，请重新配对。")
        return token

    def save(self, pairing):
        if not valid_pairing(pairing):
            raise ValueError("配对码格式不正确。")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        encrypted = self._crypt(pairing.encode("utf-8"))
        atomic_write(self.path, encrypted)


def atomic_write(path: Path, content: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    with open(temporary, "wb") as stream:
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
