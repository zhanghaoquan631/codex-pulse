import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('direct admin and product links serve the app without redirecting to the storefront', async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({
    name: 'admin-entry-test', modules: true, scriptPath: 'dist/server/index.js',
    compatibilityDate: '2026-09-01', port: 0,
    assets: {
      directory: 'dist/client', binding: 'ASSETS', run_worker_first: true,
      routerConfig: { has_user_worker: true },
      assetConfig: { html_handling: 'auto-trailing-slash', not_found_handling: 'none' },
    },
  }));
  try {
    for (const route of ['/manage', '/manage/', '/item/4', '/catalog', '/user/index/query']) {
      for (const accept of ['text/html', '*/*', null]) {
        const response = await mf.dispatchFetch(`http://localhost${route}?entry=shared`, {
          redirect: 'manual', headers: accept ? { accept } : {},
        });
        assert.equal(response.status, 200, `${route}, Accept=${accept}, Location=${response.headers.get('location')}`);
        assert.equal(response.headers.get('location'), null);
        assert.match(await response.text(), /id="root"/);
      }
    }
    const missing = await mf.dispatchFetch('http://localhost/assets/missing.js', { redirect: 'manual' });
    assert.equal(missing.status, 404);
    const head = await mf.dispatchFetch('http://localhost/manage', { method: 'HEAD', redirect: 'manual' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  } finally { await mf.dispose(); }
});
