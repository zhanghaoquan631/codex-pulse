"""Two-way local/cloud synchronization with field-level conflict protection."""
import copy
import hashlib
import json
import os
import re
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError
from urllib.parse import urlparse, quote

from backup import file_references
from uploads import metadata

COLLECTIONS = ('content', 'materials', 'materialBoxes', 'backupCaches', 'tags', 'newsletters')
CLOUD_FILE_LIMIT = 25 * 1024 * 1024
CLOUD_ORIGIN = 'https://lingan-library.wozhe0196.chatgpt.site'
MISSING = object()


class SyncConflict(ValueError):
    pass


class SyncError(ValueError):
    """A diagnostic deliberately safe to display without transport credentials."""
    pass


def merge_states(base, local, remote):
    def merge_value(old, ours, theirs, label, prefer=None):
        if ours == old:
            return copy.deepcopy(theirs) if theirs is not MISSING else MISSING
        if theirs == old or ours == theirs:
            return copy.deepcopy(ours) if ours is not MISSING else MISSING
        if all(isinstance(x, dict) for x in (old, ours, theirs)):
            merged = {}
            for key in set(old) | set(ours) | set(theirs):
                if key == 'updatedAt':
                    value = ours.get(key, theirs.get(key, MISSING))
                else:
                    value = merge_value(old.get(key, MISSING), ours.get(key, MISSING), theirs.get(key, MISSING), label + '/' + key, prefer)
                if value is not MISSING:
                    merged[key] = value
            return merged
        if old is MISSING and isinstance(ours, dict) and isinstance(theirs, dict):
            return merge_value({}, ours, theirs, label, prefer)
        if prefer is not None:
            value = ours if prefer == 'ours' else theirs
            return copy.deepcopy(value) if value is not MISSING else MISSING
        raise SyncConflict('手机和电脑修改了同一项，请先核对：' + label)

    def merge_record(old, ours, theirs, label):
        """A missing deletion flag is legacy data, never an explicit restore."""
        rows = [value if isinstance(value, dict) else {} for value in (old, ours, theirs)]
        old_marker = rows[0].get('deletedAt')
        deleted = [(index, row) for index, row in enumerate(rows[1:], 1) if row.get('deletedAt')]
        restores = [(index, row) for index, row in enumerate(rows[1:], 1)
                    if old_marker and 'deletedAt' in row and row['deletedAt'] is None]
        new_deletes = [(index, row) for index, row in deleted if row['deletedAt'] != old_marker]
        chosen = new_deletes or ([] if restores else deleted)
        if chosen:
            index, winner = max(chosen, key=lambda pair: (str(pair[1]['deletedAt']), json.dumps(pair[1], sort_keys=True, ensure_ascii=False)))
            marker, prefer = winner['deletedAt'], 'ours' if index == 1 else 'theirs'
        elif restores:
            _, winner = max(restores, key=lambda pair: str(pair[1].get('updatedAt') or ''))
            marker, prefer = None, None
        elif old_marker:
            winner, marker, prefer = rows[0], old_marker, None
        else:
            return merge_value(old, ours, theirs, label)
        # Keep deleted records even if an older client omits the whole row.
        records = [dict(row) for row in (rows[0], rows[1] if isinstance(ours, dict) else rows[0], rows[2] if isinstance(theirs, dict) else rows[0])]
        for row in records:
            row.pop('deletedAt', None)
        merged = merge_value(*records, label, prefer)
        merged['deletedAt'] = marker
        if winner.get('updatedAt'):
            merged['updatedAt'] = winner['updatedAt']
        return merged

    result = {key: [] for key in COLLECTIONS}
    result['profile'] = merge_value(base.get('profile') or {}, local.get('profile', base.get('profile')) or {}, remote.get('profile', base.get('profile')) or {}, 'profile')
    diagnostics = [source.get('xActivity') for source in (base, local, remote) if isinstance(source.get('xActivity'), dict)]
    if diagnostics:
        def checked_at(value):
            try:
                return datetime.fromisoformat(str(value.get('checkedAt') or '').replace('Z', '+00:00')).timestamp()
            except (ValueError, TypeError, OSError):
                return 0
        result['xActivity'] = copy.deepcopy(max(diagnostics, key=lambda value: (checked_at(value), json.dumps(value, sort_keys=True, ensure_ascii=False))))
    for collection in COLLECTIONS:
        key = 'name' if collection == 'tags' else 'id'
        sources = [{item[key]: item for item in source.get(collection, [])} for source in (base, local, remote)]
        keys = list(dict.fromkeys([*sources[1], *sources[2], *sources[0]]))
        for identity in keys:
            values = [source.get(identity, MISSING) for source in sources]
            if collection in ('materialBoxes', 'backupCaches'):
                # This release only creates/renames boxes; old clients cannot remove them by omission.
                values = [values[0], *(values[0] if value is MISSING else value for value in values[1:])]
            merged = (merge_record if collection in ('content', 'newsletters') else merge_value)(*values, collection + '/' + identity)
            if merged is not MISSING:
                result[collection].append(merged)
    return result


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, name = tempfile.mkstemp(prefix='sync-', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            json.dump(value, output, ensure_ascii=False, indent=2)
        Path(name).replace(path)
    finally:
        Path(name).unlink(missing_ok=True)


class CloudSync:
    def __init__(self, read_store, write_store, data_dir, store_lock):
        self.read_store, self.write_store = read_store, write_store
        self.data_dir, self.store_lock = Path(data_dir), store_lock
        self.lock = threading.Lock()
        self.status = {'state': 'not_configured', 'message': '云端同步尚未配置'}

    def open_response(self, config, path, payload=None, method='GET', headers=None):
        # Scope both app and platform credentials before constructing a request.
        if config.get('url', '').rstrip('/') != CLOUD_ORIGIN or not path.startswith('/api/') or '\\' in path or any(char in path for char in '\r\n'):
            raise SyncError('云端请求地址不匹配')
        for token in (config.get('token'), config.get('sitesAuthorization', 'unused')):
            if not isinstance(token, str) or not token or any(ord(char) < 33 or ord(char) > 126 for char in token):
                raise SyncError('云端授权配置无效，请重新连接')
        request_headers = {**(headers or {}), 'Authorization': 'Bearer ' + config['token']}
        if config.get('sitesAuthorization'):
            request_headers['OAI-Sites-Authorization'] = 'Bearer ' + config['sitesAuthorization']
        if isinstance(payload, dict):
            payload = json.dumps(payload, ensure_ascii=False).encode('utf-8')
            request_headers['Content-Type'] = 'application/json'
        req = Request(config['url'].rstrip('/') + path, data=payload, method=method, headers=request_headers)
        # Credentials travel only to the configured HTTPS Site, never through redirects.
        class NoRedirect(HTTPRedirectHandler):
            def redirect_request(self, *args):
                return None
        # Respect the owner's existing network configuration for this remote Site.
        return build_opener(NoRedirect()).open(req, timeout=30)

    def request(self, config, path, payload=None, method='GET', headers=None, raw=False):
        with self.open_response(config, path, payload, method, headers) as response:
            if method == 'HEAD':
                return response.status
            binary = response.read(100 * 1024 * 1024 + 1)
            if len(binary) > 100 * 1024 * 1024:
                raise SyncError('同步响应过大')
            return binary if raw else json.loads(binary)

    def sync_files(self, config, state):
        for file_id in file_references(state):
            url = '/api/files/' + file_id
            local = metadata(self.data_dir, url)
            try:
                self.request(config, url, method='HEAD')
                exists = True
            except HTTPError as error:
                if error.code != 404:
                    raise
                exists = False
            if not exists:
                if not local:
                    raise SyncError('同步附件缺失：' + file_id)
                if local.get('size', 0) > CLOUD_FILE_LIMIT:
                    raise SyncError('附件“' + str(local.get('name') or file_id) + '”超过云端单文件 25 MB 上限；请压缩文件并替换该素材后重试。原文件仍保存在本机。')
                binary = (self.data_dir / 'files' / file_id).read_bytes()
                if len(binary) != local['size'] or hashlib.sha256(binary).hexdigest() != local['sha256']:
                    raise SyncError('本地附件校验失败：' + file_id)
                self.request(config, '/api/files', binary, 'POST', {'Content-Type': 'application/octet-stream', 'X-File-Name': quote(local['name']), 'X-File-Id': file_id})
            elif not local:
                info = self.request(config, '/api/sync/files/' + file_id)
                self.download_file(config, file_id, info)

    def download_file(self, config, file_id, info):
        url = '/api/files/' + file_id
        expected = info.get('size')
        if (not re.fullmatch(r'[a-f0-9]{32}', file_id) or info.get('id') != file_id or info.get('url') != url
                or not isinstance(expected, int) or isinstance(expected, bool) or not 0 < expected <= 8 * 1024 * 1024 * 1024
                or not re.fullmatch(r'[a-f0-9]{64}', str(info.get('sha256', '')))):
            raise SyncError('云端附件信息不正确')
        root = self.data_dir / 'files'
        root.mkdir(parents=True, exist_ok=True)
        fd, name = tempfile.mkstemp(prefix='download-', dir=root)
        try:
            digest, size = hashlib.sha256(), 0
            with os.fdopen(fd, 'wb') as target, self.open_response(config, url) as response:
                if response.status != 200:
                    raise SyncError('云端附件未完整返回')
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > expected:
                        raise SyncError('云端附件大小不一致')
                    target.write(chunk)
                    digest.update(chunk)
            if size != expected or digest.hexdigest() != info['sha256']:
                raise SyncError('云端附件校验失败：' + file_id)
            Path(name).replace(root / file_id)
            atomic_json(root / (file_id + '.json'), info)
        finally:
            Path(name).unlink(missing_ok=True)

    def share_link(self, token):
        """Only advertise a public issue after the exact snapshot was committed."""
        if not re.fullmatch(r'[A-Za-z0-9_-]{16,100}', token):
            return {'available': False, 'mode': 'missing', 'message': '周刊链接不存在'}
        with self.store_lock:
            issue = next((x for x in self.read_store()['newsletters'] if x.get('token') == token and not x.get('deletedAt')), None)
            if issue is None:
                return {'available': False, 'mode': 'missing', 'message': '周刊链接不存在'}
            config_path = self.data_dir / 'cloud-sync.json'
            baseline_path = self.data_dir / 'cloud-sync-baseline.json'
            if not config_path.exists() or not baseline_path.exists():
                return {'available': False, 'mode': 'local', 'message': '公网分享尚未启用'}
            try:
                config = json.loads(config_path.read_text(encoding='utf-8'))
                destination = urlparse(config.get('url', ''))
                if destination.scheme != 'https' or destination.hostname != 'lingan-library.wozhe0196.chatgpt.site' or destination.username or destination.password or destination.port:
                    raise ValueError('Invalid cloud destination')
                baseline = json.loads(baseline_path.read_text(encoding='utf-8'))
                published = next((x for x in baseline['newsletters'] if x.get('token') == token), None)
                if published == issue:
                    return {'available': True, 'mode': 'public', 'url': 'https://' + destination.hostname + '/share/' + token}
                return {'available': False, 'mode': 'pending', 'message': '本期最新内容还未同步到云端'}
            except (OSError, ValueError, KeyError, TypeError):
                return {'available': False, 'mode': 'unavailable', 'message': '无法确认本期同步状态，请在设置中核对'}

    def run(self):
        if not self.lock.acquire(blocking=False):
            return dict(self.status, state='running')
        try:
            config_path = self.data_dir / 'cloud-sync.json'
            if not config_path.exists():
                self.status = {'state': 'not_configured', 'message': '云端同步待启用，首次迁移完成后自动开始。'}
                return self.status
            config = json.loads(config_path.read_text(encoding='utf-8'))
            url = urlparse(config.get('url', ''))
            if url.scheme != 'https' or url.hostname != 'lingan-library.wozhe0196.chatgpt.site' or url.username or url.password or url.port or len(config.get('token', '')) < 32:
                raise SyncError('云端配置尚未完成')
            baseline_path = self.data_dir / 'cloud-sync-baseline.json'
            if not baseline_path.exists():
                self.status = {'state': 'awaiting_migration', 'url': config['url'], 'message': '云端同步待启用：首次资料迁移尚未完成，本机资料已保留。'}
                return self.status
            baseline = json.loads(baseline_path.read_text(encoding='utf-8'))
            self.status = {**self.status, 'state': 'running', 'url': config['url'], 'message': '正在同步手机与电脑资料…'}
            for attempt in range(3):
                with self.store_lock:
                    local = self.read_store()
                remote = self.request(config, '/api/sync/state')
                merged = merge_states(baseline, local, remote)
                self.sync_files(config, merged)
                merged['cloudSync'] = {'at': datetime.now(timezone.utc).isoformat()}
                try:
                    committed = self.request(config, '/api/sync/commit', {'state': merged, 'expectedUpdatedAt': remote.get('updatedAt')}, 'POST')
                    break
                except HTTPError as error:
                    if error.code != 409 or attempt == 2:
                        raise
            with self.store_lock:
                current = self.read_store()
                # Changes made during network I/O remain unsent local edits against this baseline.
                final = merge_states(local, current, committed)
                self.write_store(final)
                atomic_json(baseline_path, committed)
            self.status = {'state': 'connected', 'lastSyncedAt': merged['cloudSync']['at'], 'url': config['url'], 'message': '手机与电脑资料已同步'}
        except SyncConflict as error:
            self.status = {'state': 'conflict', 'message': str(error)}
        except Exception as error:
            # Do not surface HTTP headers, config or credentials in diagnostic output.
            detail = ' HTTP ' + str(error.code) if isinstance(error, HTTPError) else str(error) if isinstance(error, SyncError) else '请检查网络或稍后重试。'
            self.status = {'state': 'unavailable', 'message': '云端暂时无法同步，已保留本地资料。' + detail}
        finally:
            self.lock.release()
        return self.status

    def start(self):
        def loop():
            while True:
                self.run()
                threading.Event().wait(60)
        threading.Thread(target=loop, name='lingan-cloud-sync', daemon=True).start()
