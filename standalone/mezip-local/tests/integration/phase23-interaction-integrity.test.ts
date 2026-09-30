import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  appRoutes,
  normalizeRoute,
  phase3ArchiveRoutes,
} from '../../apps/web/src/appModel.js';
import { routes as miniRoutes } from '../../apps/wechat-miniprogram/miniprogram/lib/navigation.js';

const root = path.resolve(import.meta.dirname, '..', '..');
const webAppPath = path.join(root, 'apps', 'web', 'src', 'App.tsx');
const miniRoot = path.join(root, 'apps', 'wechat-miniprogram', 'miniprogram');

describe('Phase 23 interaction integrity', () => {
  it('keeps every registered Web route normalizable and rendered by the application shell', async () => {
    const source = await readFile(webAppPath, 'utf8');
    for (const route of [
      ...appRoutes.map(({ path: routePath }) => routePath),
      ...phase3ArchiveRoutes,
    ]) {
      expect(normalizeRoute(route)).toBe(route);
      expect(source).toMatch(
        new RegExp(`(?:case|route ===) '${route.replaceAll('/', '\\/')}'`, 'u'),
      );
    }
    expect(normalizeRoute('/unknown-route')).toBe('/');
  });

  it('keeps every registered Mini Program page and named navigation target resolvable', async () => {
    const appConfig = JSON.parse(
      await readFile(path.join(miniRoot, 'app.json'), 'utf8'),
    ) as { readonly pages: readonly string[] };
    for (const page of appConfig.pages) {
      for (const extension of ['.ts', '.wxml', '.json']) {
        await expect(
          stat(path.join(miniRoot, `${page}${extension}`)),
        ).resolves.toBeDefined();
      }
    }

    for (const route of Object.values(miniRoutes)) {
      expect(appConfig.pages).toContain(route.replace(/^\//u, ''));
    }
  });

  it('does not retain no-op UI handlers or blocking browser dialogs in runtime source', async () => {
    const [webSource, miniFiles] = await Promise.all([
      readFile(webAppPath, 'utf8'),
      readFile(path.join(miniRoot, 'app.json'), 'utf8'),
    ]);
    expect(webSource).not.toMatch(/onClick=\{\(\)\s*=>\s*\{\s*\}\}/u);
    expect(webSource).not.toMatch(/(?:window\.)?(?:alert|confirm|prompt)\(/u);
    expect(miniFiles).toContain('pages/social/index');
  });
});
