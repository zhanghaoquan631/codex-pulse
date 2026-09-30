"""Read public 2nyy playback metadata through the normal system proxy.

No media, keys, cookies or library data are read or written by this helper.
"""
import hashlib
import ipaddress
import json
import re
import socket
import sys
import time
from html.parser import HTMLParser
from urllib.parse import quote, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

MAX_PAGE_BYTES = 1_000_000
MAX_API_BYTES = 128_000
MAX_SOURCES = 16
DEADLINE_SECONDS = 22


def public_url(value):
    if not isinstance(value, str) or len(value) > 4000:
        raise ValueError('Invalid public URL')
    parsed = urlparse(value)
    if (parsed.scheme not in {'http', 'https'} or not parsed.hostname
            or parsed.username or parsed.password or parsed.port not in {None, 80, 443}):
        raise ValueError('Invalid public URL')
    addresses = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == 'https' else 80), type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise ValueError('Non-public address')
    return value


def source_identity(value):
    parsed = urlparse(value)
    host = (parsed.hostname or '').lower()
    match = re.fullmatch(r'/dianying/(\d+)\.html', parsed.path)
    if (parsed.scheme in {'http', 'https'} and not parsed.username and not parsed.password
            and parsed.port in {None, 80, 443} and host in {'2nyy.com', 'www.2nyy.com'} and match):
        return match.group(1)
    raise ValueError('Unsupported movie source')


class BoundRedirect(HTTPRedirectHandler):
    max_redirections = 3
    max_repeats = 1

    def __init__(self, movie_id, path):
        self.movie_id, self.path = movie_id, path

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urlparse(public_url(newurl))
        if (parsed.hostname not in {'2nyy.com', 'www.2nyy.com'}
                or parsed.path != self.path or parsed.query or parsed.fragment):
            raise ValueError('Unbound movie redirect')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def read_page(url, movie_id, limit, deadline):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError('Metadata deadline exceeded')
    parsed = urlparse(public_url(url))
    opener = build_opener(BoundRedirect(movie_id, parsed.path))
    request = Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html,application/json'})
    with opener.open(request, timeout=min(6, remaining)) as response:
        public_url(response.geturl())
        if urlparse(response.geturl()).path != parsed.path:
            raise ValueError('Unbound movie response')
        length = response.headers.get('Content-Length')
        if length and int(length) > limit:
            raise ValueError('Metadata response too large')
        raw = response.read(limit + 1)
        if len(raw) > limit:
            raise ValueError('Metadata response too large')
        return raw.decode(response.headers.get_content_charset() or 'utf-8', 'strict')


class MoviePage(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.titles, self.versions, self.current_title = [], [], None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = set((attrs.get('class') or '').split())
        if tag == 'h1' and 'product-title' in classes:
            self.titles.append('')
            self.current_title = len(self.titles) - 1
        if tag == 'li' and 'play-btn' in classes:
            value = attrs.get('ep_slug') or ''
            if value and len(value) <= 60 and value not in self.versions:
                self.versions.append(value)

    def handle_endtag(self, tag):
        if tag == 'h1':
            self.current_title = None

    def handle_data(self, value):
        if self.current_title is not None:
            self.titles[self.current_title] += value


class SourceLabels(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.labels, self.current = [], None

    def handle_starttag(self, tag, attrs):
        if tag == 'button':
            self.labels.append('')
            self.current = len(self.labels) - 1

    def handle_endtag(self, tag):
        if tag == 'button':
            self.current = None

    def handle_data(self, value):
        if self.current is not None:
            self.labels[self.current] += value


def parse_movie_page(html, movie_id):
    parser = MoviePage()
    parser.feed(html)
    mids = re.findall(r'\bvar\s+mid\s*=\s*[\'\"](\d+)[\'\"]\s*;', html)
    defaults = re.findall(r'\bvar\s+first_ep\s*=\s*[\'\"]([^\'\"\r\n]{1,60})[\'\"]\s*;', html)
    if mids != [movie_id] or len(defaults) != 1 or len(parser.titles) != 1 or defaults[0] not in parser.versions:
        raise ValueError('Movie page identity could not be verified')
    versions = []
    for value in ('正片', defaults[0], 'HD'):
        if value in parser.versions and value not in versions:
            versions.append(value)
    title = re.sub(r'\s+', ' ', parser.titles[0]).strip()[:500]
    if not title or '\ufffd' in title:
        raise ValueError('Movie title could not be verified')
    return title, versions[:3]


def playback(source_url):
    movie_id = source_identity(source_url)
    deadline = time.monotonic() + DEADLINE_SECONDS
    detail = 'https://www.2nyy.com/dianying/' + movie_id + '.html'
    title, versions = parse_movie_page(read_page(detail, movie_id, MAX_PAGE_BYTES, deadline), movie_id)
    sources, warnings, seen = [], [], set()
    for version in versions:
        if time.monotonic() >= deadline:
            warnings.append('其他版本的公开元数据读取超时。')
            break
        endpoint = 'https://www.2nyy.com/vod/' + movie_id + '/' + quote(version, safe='')
        try:
            payload = json.loads(read_page(endpoint, movie_id, MAX_API_BYTES, deadline))
            if not isinstance(payload, dict) or not isinstance(payload.get('video_plays'), list):
                raise ValueError('Unsupported playback metadata')
            labels = SourceLabels()
            labels.feed(str(payload.get('html_content') or '')[:MAX_API_BYTES])
            for index, item in enumerate(payload['video_plays'][:MAX_SOURCES]):
                if len(sources) >= MAX_SOURCES or time.monotonic() >= deadline:
                    break
                if not isinstance(item, dict):
                    continue
                try:
                    media = public_url(item.get('play_data'))
                    path = urlparse(media).path.lower()
                    mime = ('application/vnd.apple.mpegurl' if path.endswith('.m3u8') else
                            'video/mp4' if path.endswith('.mp4') else 'video/webm' if path.endswith('.webm') else '')
                    if not mime or media in seen:
                        continue
                except (OSError, ValueError, TypeError):
                    continue
                seen.add(media)
                label = re.sub(r'\s+', ' ', labels.labels[index]).strip()[:80] if index < len(labels.labels) else ''
                identity = hashlib.sha256((version + '\n' + str(item.get('sid', index)) + '\n' + media).encode()).hexdigest()[:20]
                sources.append({'id': identity, 'label': version + ' · ' + (label or '线路 ' + str(index + 1)),
                                'url': media, 'mimeType': mime})
        except (OSError, ValueError, TypeError):
            warnings.append(version + '：公开播放元数据暂不可用。')
    return {'sourceUrl': source_url, 'title': title, 'platform': '2nyy', 'sources': sources,
            'warnings': warnings, 'metadataOnly': True}


if __name__ == '__main__':
    try:
        if len(sys.argv) != 2:
            raise ValueError('Invalid helper arguments')
        print(json.dumps(playback(sys.argv[1]), ensure_ascii=True, separators=(',', ':')))
    except Exception:
        print(json.dumps({'error': 'Public movie metadata is unavailable.'}))
        sys.exit(1)
