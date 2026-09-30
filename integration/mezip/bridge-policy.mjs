// Both ends enforce this fixed API surface. Never accept an arbitrary URL.
export function allowedBridgeRequest(method, path) {
  if (typeof path !== 'string' || path.length > 1600 || /[\\\x00-\x20#%]/.test(path)) return false;
  const [pathname, query = '', extra] = path.split('?');
  if (extra !== undefined || !pathname.startsWith('/v1/')) return false;
  if (query && (method !== 'GET' || !/^limit=\d{1,3}$/.test(query) || Number(query.slice(6)) > 500)) return false;
  const id = '[a-zA-Z0-9_-]{1,160}';
  const base = '/v1/x/local-capture';
  const routes = {
    GET: [`${base}/(health|settings|stats|timeline|private-library|private-library/collections)`, `/v1/(watch|resources)/records`, `/v1/(watch|resources)/records/${id}`, '/v1/watch/movies', '/v1/activity/clicks', `/v1/activity/clicks/${id}`],
    POST: [`${base}/(events|private-library|private-library/batch|private-library/collections)`, '/v1/resources/records', `/v1/(watch|resources)/records/${id}/private-library`, `/v1/resources/records/${id}/open`, '/v1/activity/clicks'],
    PATCH: [`${base}/settings`, `${base}/private-library/${id}`, `${base}/private-library/collections/${id}`, `/v1/resources/records/${id}`],
    DELETE: [`${base}/history`, `${base}/private-library/${id}`, `${base}/private-library/collections/${id}`, `/v1/(watch|resources)/records/${id}`],
  };
  return (routes[method] || []).some(pattern => new RegExp(`^${pattern}$`).test(pathname));
}
