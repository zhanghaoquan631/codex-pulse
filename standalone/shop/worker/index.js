import { apiFetch, uploadFetch } from './api.js';

export default {
  async fetch(request, env, ctx) {
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith('/api/')) return apiFetch(request, env, ctx);
    if (pathname.startsWith('/uploads/')) return uploadFetch(request, env);
    const response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get("accept")?.includes("text/html");
    const isAppRoute = /^\/(?:manage\/?|catalog\/?|item\/[^/]+\/?|user\/index\/query\/?)$/.test(pathname);

    if (response.status !== 404 || !(isAppRoute || acceptsHtml) || !["GET", "HEAD"].includes(request.method)) {
      return response;
    }

    const indexUrl = new URL(request.url);
    // Fetch the canonical root internally. /index.html can redirect to / in
    // Workers Assets, which would otherwise send /manage back to the storefront.
    indexUrl.pathname = "/";
    indexUrl.search = "";
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};
