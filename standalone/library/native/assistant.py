"""Lingan Jianying media bridge. No editable draft formats are written."""
import argparse
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import uuid
import urllib.error
import urllib.parse
import urllib.request
import winreg

SITE = 'https://lingan-library.wozhe0196.chatgpt.site'
ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data'
SOURCES = DATA / '素材'
EXPORTS = DATA / '成品'
CONFIG = DATA / 'connection.bin'
MAX_BYTES = 25 * 1024 * 1024

class BLOB(ctypes.Structure):
    _fields_ = [('cbData', wintypes.DWORD), ('pbData', ctypes.POINTER(ctypes.c_ubyte))]

def protect(value, decrypt=False):
    buf = ctypes.create_string_buffer(value)
    source = BLOB(len(value), ctypes.cast(buf, ctypes.POINTER(ctypes.c_ubyte)))
    target = BLOB()
    fn = ctypes.windll.crypt32.CryptUnprotectData if decrypt else ctypes.windll.crypt32.CryptProtectData
    if not fn(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(target)):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(target.pbData, target.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(target.pbData)

def read_config():
    return json.loads(protect(CONFIG.read_bytes(), True))

def write_json(path, value):
    temp = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        temp.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)

def status(message, **extra):
    try:
        write_json(DATA / 'status.json', {'time': time.strftime('%Y-%m-%d %H:%M:%S'), 'message': message, **extra})
    except OSError:
        pass

def read_finished(path):
    # Deny all sharing while reading. A producer with an open write handle prevents acquisition.
    import msvcrt
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
    kernel.CreateFileW.restype = wintypes.HANDLE
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.CloseHandle.restype = wintypes.BOOL
    handle = kernel.CreateFileW(str(path), 0x80000000, 0, None, 3, 0x80, None)
    if handle == wintypes.HANDLE(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        descriptor = msvcrt.open_osfhandle(handle, os.O_RDONLY | os.O_BINARY)
    except Exception:
        kernel.CloseHandle(handle)
        raise
    with os.fdopen(descriptor, 'rb') as stream:
        if os.fstat(stream.fileno()).st_size > MAX_BYTES:
            raise ValueError('视频超过 25 MB')
        raw = stream.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError('视频超过 25 MB')
        return raw

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def request(path, token=None, body=None, headers=None):
    # Exact fixed origin; credentials are never followed to redirects.
    if not path.startswith('/api/jianying/'):
        raise ValueError('Unsupported endpoint')
    headers = dict(headers or {})
    headers['User-Agent'] = 'LinganJianying/1.0 (Windows; Desktop media bridge)'
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(SITE + path, data=body, headers=headers)
    return urllib.request.build_opener(NoRedirect()).open(req, timeout=90)

def versioned_app(candidate):
    # Some vendor installs leave the root launcher's last_version unset.
    # Prefer the installed application, whose DLLs live beside this executable.
    versions = []
    try:
        for folder in candidate.parent.iterdir():
            if folder.is_dir() and re.fullmatch(r'\d+(?:\.\d+){2,4}', folder.name):
                executable = folder / 'JianyingPro.exe'
                if executable.is_file():
                    versions.append((tuple(int(part) for part in folder.name.split('.')), executable))
    except OSError:
        pass
    return max(versions, key=lambda entry: entry[0])[1] if versions else candidate

def locate_app():
    for hive in [winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE]:
        for subkey in [r'Software\Microsoft\Windows\CurrentVersion\Uninstall\JianyingPro',
                       r'Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\JianyingPro']:
            try:
                with winreg.OpenKey(hive, subkey) as key:
                    for name in ['DisplayIcon', 'InstallLocation']:
                        try:
                            value = winreg.QueryValueEx(key, name)[0]
                            path = Path(str(value).strip('"').split(',')[0])
                            choices = [path] if path.suffix.lower() == '.exe' else list(path.glob('**/JianyingPro.exe'))
                            for candidate in choices:
                                if candidate.is_file() and candidate.name.lower() == 'jianyingpro.exe':
                                    return versioned_app(candidate)
                        except OSError:
                            pass
            except OSError:
                pass
    # Inspect the vendor's registered executable; never invoke its command string.
    for hive in [winreg.HKEY_CURRENT_USER, winreg.HKEY_CLASSES_ROOT]:
        keyname = r'Software\Classes\vega\shell\open\command' if hive == winreg.HKEY_CURRENT_USER else r'vega\shell\open\command'
        try:
            with winreg.OpenKey(hive, keyname) as key:
                command = winreg.QueryValue(key, None)
                match = re.match(r'^"([^"]+\.exe)"', command)
                candidate = Path(match[1]) if match else None
                if candidate and candidate.is_file() and candidate.name.lower() == 'jianyingpro.exe':
                    return versioned_app(candidate)
        except OSError:
            pass
    return None

def open_app():
    app = locate_app()
    if app:
        subprocess.Popen([str(app)], cwd=str(app.parent))
    else:
        os.startfile('ms-windows-store://pdp/?ProductId=XPDM5FWDZZVHBX')
        status('未发现剪映，请从微软商店安装剪映专业版后重试')

def start_watch():
    pythonw = Path(sys.executable).with_name('pythonw.exe')
    subprocess.Popen([str(pythonw if pythonw.exists() else Path(sys.executable)), str(Path(__file__).resolve()), '--watch'],
                     creationflags=0x08000000)

def handle_uri(value):
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme != 'lingan-jianying' or parsed.query or parsed.fragment or parsed.username or parsed.port:
        raise ValueError('无效的联动地址')
    action = parsed.hostname
    argument = parsed.path.strip('/')
    if action == 'pair' and re.fullmatch('[a-f0-9]{64}', argument):
        with request('/api/jianying/pair', body=json.dumps({'code': argument}).encode(), headers={'Content-Type': 'application/json'}) as response:
            connection = json.load(response)
        if not re.fullmatch('[a-f0-9]{64}', connection.get('token', '')):
            raise ValueError('连接响应不正确')
        temp = CONFIG.with_name(CONFIG.name + '.' + uuid.uuid4().hex + '.tmp')
        temp.write_bytes(protect(json.dumps(connection).encode()))
        os.replace(temp, CONFIG)
        status('已连接；请将剪映导出目录设置为本助手的成品文件夹')
        start_watch()
        os.startfile(str(EXPORTS))
    elif action == 'import' and re.fullmatch('[a-f0-9]{32}', argument):
        connection = read_config()
        with request('/api/jianying/native/files/' + argument, connection['token']) as response:
            mime = response.headers.get('Content-Type', '').split(';')[0]
            if mime not in ['video/mp4', 'video/webm']:
                raise ValueError('仅允许视频素材')
            extension = '.mp4' if mime == 'video/mp4' else '.webm'
            destination = SOURCES / (argument + extension)
            temp = destination.with_name(destination.name + '.' + uuid.uuid4().hex + '.tmp')
            expected_hash = response.headers.get('X-Lingan-SHA256', '')
            if not re.fullmatch('[a-f0-9]{64}', expected_hash):
                raise ValueError('视频缺少校验信息')
            total = 0
            try:
                with temp.open('wb') as output:
                    while True:
                        chunk = response.read(1024 * 1024)
                        if not chunk:
                            break
                        total += len(chunk)
                        if total > MAX_BYTES:
                            raise ValueError('视频超过 25 MB')
                        output.write(chunk)
                if hashlib.sha256(temp.read_bytes()).hexdigest() != expected_hash:
                    raise ValueError('视频校验失败')
                os.replace(temp, destination)
            finally:
                temp.unlink(missing_ok=True)
        status('素材已保存，请在剪映中点击导入选择素材文件夹中的视频')
        open_app()
        os.startfile(str(SOURCES))
        start_watch()
    elif action == 'open' and not argument:
        open_app()
        start_watch()
    elif action in ['sources', 'exports', 'status'] and not argument:
        os.startfile(str({'sources': SOURCES, 'exports': EXPORTS, 'status': DATA}[action]))
    else:
        raise ValueError('不支持此操作')

def watch():
    import msvcrt
    lock = (DATA / 'watch.lock').open('a+b')
    lock.write(b'0'); lock.flush(); lock.seek(0)
    try:
        msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        return
    sent_path = DATA / 'sent.json'
    try:
        sent = json.loads(sent_path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        sent = {}
    observed = {}
    retry_at = {}
    heartbeat = 0
    while True:
        try:
            connection = read_config()
            if time.time() > heartbeat:
                with request('/api/jianying/native/status', connection['token']) as response:
                    json.load(response)
                heartbeat = time.time() + 60
            for path in EXPORTS.iterdir():
                if path.is_symlink() or not path.is_file() or path.suffix.lower() not in ['.mp4', '.webm']:
                    continue
                try:
                    before = path.stat()
                    stamp = (before.st_size, before.st_mtime_ns)
                    key = path.name
                    previous = observed.get(key)
                    observed[key] = stamp
                    if previous != stamp or not before.st_size or time.time() - before.st_mtime < 10:
                        continue
                    if before.st_size > MAX_BYTES:
                        status('成品超过 25 MB，原文件保留；请降低导出码率或拆分片段', file=key)
                        continue
                    if retry_at.get(key, 0) > time.time():
                        continue
                    # A producer holding a write handle blocks this read on Windows.
                    raw = read_finished(path)
                    after = path.stat()
                    if (after.st_size, after.st_mtime_ns) != stamp:
                        continue
                    digest = hashlib.sha256(raw).hexdigest()
                    if sent.get(key) == digest:
                        continue
                    with request('/api/jianying/native/returns', connection['token'], raw,
                                 {'Content-Type': 'application/octet-stream', 'X-File-Name': urllib.parse.quote(key, safe='')}) as response:
                        result = json.load(response)
                    if not result.get('item', {}).get('id'):
                        raise ValueError('云端没有确认保存')
                    sent[key] = digest
                    write_json(sent_path, sent)
                    status('成品已自动进入网站待处理；本机文件仍保留', file=key)
                    retry_at.pop(key, None)
                except urllib.error.HTTPError as error:
                    # Save no response bodies, tokens, URLs or private library data.
                    status('成品回传未完成，原文件保留；401 时请重新连接电脑', httpStatus=error.code)
                    retry_at[key] = time.time() + (300 if error.code in [400, 401, 403, 413] else 30)
                except (OSError, ValueError):
                    retry_at[key] = time.time() + 30
                    status('成品暂时无法回传，将自动重试；原文件保留')
        except (OSError, ValueError, urllib.error.URLError):
            status('等待连接或网络恢复；原文件保留')
            time.sleep(20)
        time.sleep(5)

def main():
    for folder in [DATA, SOURCES, EXPORTS]:
        folder.mkdir(parents=True, exist_ok=True)
    parser = argparse.ArgumentParser()
    parser.add_argument('--uri')
    parser.add_argument('--watch', action='store_true')
    options = parser.parse_args()
    try:
        if options.uri:
            handle_uri(options.uri)
        if options.watch:
            watch()
    except Exception:
        status('操作未完成。请检查剪映是否安装，并在网站重新连接此电脑')
        # Deliberately do not include raw URI or credentials in diagnostics.
        if options.uri:
            ctypes.windll.user32.MessageBoxW(None, '操作未完成。请确认已安装剪映，或返回灵感库重新连接此电脑。', '剪映联动', 0)

if __name__ == '__main__':
    main()
