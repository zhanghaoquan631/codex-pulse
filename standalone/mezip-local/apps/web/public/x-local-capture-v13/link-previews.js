(function registerLinkPreviews(global) {
  'use strict';

  const DEFAULT_KEY = 'mezip.link.previews.v1';
  const RETRY_DELAY_MS = 10 * 60 * 1000;
  const FIELDS = Object.freeze([
    'title', 'description', 'previewStatus', 'coverKind', 'metadataSource', 'coverStorage',
  ]);

  function normalizedUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value.trim());
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
      url.hash = '';
      return url.href;
    } catch { return null; }
  }

  function imageUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const candidate = value.trim();
    if (/^data:image\/(?:png|jpeg|webp|gif|avif);base64,[A-Za-z0-9+/]+={0,2}$/iu.test(candidate)) return candidate;
    return normalizedUrl(candidate);
  }

  function sanitize(value, requestedUrl) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    // The API's url can be a redirect destination. requestedUrl binds the
    // metadata to the original request and takes precedence when supplied.
    const responseRequest = value.requestedUrl !== undefined ? value.requestedUrl : value.url;
    if (normalizedUrl(responseRequest) !== requestedUrl) return null;
    const preview = { requestedUrl, url: normalizedUrl(value.url) || requestedUrl };
    for (const field of FIELDS) {
      if (typeof value[field] === 'string') preview[field] = value[field].trim().slice(0, field === 'description' ? 5000 : 1000);
    }
    const cover = imageUrl(value.coverUrl);
    const original = imageUrl(value.originalCoverUrl);
    if (cover) preview.coverUrl = cover;
    if (original) preview.originalCoverUrl = original;
    if (Array.isArray(value.warnings)) {
      preview.warnings = value.warnings.filter(item => typeof item === 'string')
        .slice(0, 20).map(item => item.trim().slice(0, 1000));
    }
    return preview;
  }

  function copy(preview) {
    return preview ? { ...preview, ...(preview.warnings ? { warnings: [...preview.warnings] } : {}) } : null;
  }

  function equal(left, right) {
    return JSON.stringify(left || null) === JSON.stringify(right || null);
  }

  function create(options = {}) {
    const storage = options.storage;
    const key = typeof options.key === 'string' && options.key ? options.key : DEFAULT_KEY;
    const clock = typeof options.clock === 'function' ? options.clock : Date.now;
    const fetchPreview = options.fetchPreview;
    const onUpdate = typeof options.onUpdate === 'function' ? options.onUpdate : () => {};
    const entries = new Map();
    const pending = new Map();
    const queue = [];
    let active = 0;
    const now = () => {
      const value = Number(clock());
      return Number.isFinite(value) ? value : Date.now();
    };

    function persist() {
      try {
        storage?.setItem(key, JSON.stringify({ version: 1, entries: [...entries].map(([url, entry]) => ({
          url, preview: entry.preview, retryAt: entry.retryAt, successful: entry.successful,
        })) }));
      } catch { /* Cache persistence must never block saving or displaying a link. */ }
    }

    try {
      const saved = JSON.parse(storage?.getItem(key) || 'null');
      const rows = saved?.version === 1 && Array.isArray(saved.entries) ? saved.entries : [];
      for (const row of rows) {
        const url = normalizedUrl(row?.url);
        if (!url) continue;
        const preview = row.preview === null ? null : sanitize(row.preview, url);
        if (!preview && row.preview !== null) continue;
        entries.set(url, {
          preview,
          retryAt: Number.isFinite(row.retryAt) && row.retryAt > 0 ? row.retryAt : 0,
          successful: row.successful !== false,
        });
      }
    } catch { /* Missing, corrupt, or inaccessible storage is a cache miss. */ }

    function notify(url, preview) {
      try { onUpdate(url, copy(preview)); } catch { /* Rendering errors do not reject a preview request. */ }
    }

    function finish(url, incoming, failed, retryable = false) {
      const previous = entries.get(url);
      let preview = incoming;
      if (failed) {
        preview = previous?.preview || null;
      } else if (previous?.preview?.coverUrl && !incoming?.coverUrl) {
        // A refresh that has no usable cover must preserve the known image.
        preview = { ...incoming, coverUrl: previous.preview.coverUrl };
        for (const field of ['originalCoverUrl', 'coverKind', 'coverStorage']) {
          if (previous.preview[field] !== undefined) preview[field] = previous.preview[field];
        }
      }
      entries.set(url, { preview, retryAt: failed || retryable ? now() + RETRY_DELAY_MS : 0,
        successful: !failed || previous?.successful === true });
      persist();
      if (!equal(previous?.preview, preview)) notify(url, preview);
      return copy(preview);
    }

    function pump() {
      while (active < 2 && queue.length) {
        const job = queue.shift();
        active += 1;
        Promise.resolve().then(() => {
          if (typeof fetchPreview !== 'function') throw new Error('Preview fetcher is unavailable.');
          return fetchPreview(job.url);
        }).then(value => {
          const preview = sanitize(value, job.url);
          if (!preview || /^(?:failed|error|unavailable|timeout|invalid_url)$/iu.test(preview.previewStatus || '')) return finish(job.url, null, true);
          return finish(job.url, preview, false, /^(?:pending|incomplete)$/iu.test(preview.previewStatus || ''));
        }).catch(() => finish(job.url, null, true)).then(result => {
          pending.delete(job.url);
          active -= 1;
          job.resolve(result);
          pump();
        });
      }
    }

    function get(value) {
      const url = normalizedUrl(value);
      return url ? copy(entries.get(url)?.preview) : null;
    }

    function ensure(value, { force = false, priority = false } = {}) {
      const url = normalizedUrl(value);
      if (!url) return Promise.resolve(null);
      if (pending.has(url)) {
        if (priority) {
          const position = queue.findIndex(job => job.url === url);
          if (position > 0) queue.unshift(queue.splice(position, 1)[0]);
        }
        return pending.get(url);
      }
      const entry = entries.get(url);
      if (!force && entry && (entry.retryAt > now() || (entry.successful && entry.retryAt === 0))) {
        return Promise.resolve(copy(entry.preview));
      }
      let resolve;
      const promise = new Promise(done => { resolve = done; });
      pending.set(url, promise);
      const job = { url, resolve };
      if (priority) queue.unshift(job);
      else queue.push(job);
      pump();
      return promise;
    }

    function invalidateImage(value, failedImage) {
      const url = normalizedUrl(value);
      const entry = url && entries.get(url);
      if (!entry?.preview?.coverUrl || imageUrl(failedImage) !== entry.preview.coverUrl) return false;
      // Expire this cache entry without erasing its metadata or cover. The
      // caller can show its image-error fallback while ensure retries it.
      entry.successful = false;
      entry.retryAt = 0;
      persist();
      return true;
    }

    return Object.freeze({ get, ensure, invalidateImage });
  }

  global.MEZIP_LINK_PREVIEWS = Object.freeze({ create });
})(typeof window === 'object' ? window : globalThis);
