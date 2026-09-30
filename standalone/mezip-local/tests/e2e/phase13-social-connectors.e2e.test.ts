import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('Phase 13 social connector user path', () => {
  it('keeps the Social Archive route reachable and fail-closed', async () => {
    const [app, webPage, webClient, miniApp, miniPage, miniClient, report] = await Promise.all([
      readFile(`${repositoryRoot}/apps/web/src/App.tsx`, 'utf8'),
      readFile(`${repositoryRoot}/apps/web/src/SocialArchivePage.tsx`, 'utf8'),
      readFile(`${repositoryRoot}/apps/web/src/socialClient.ts`, 'utf8'),
      readFile(`${repositoryRoot}/apps/wechat-miniprogram/miniprogram/app.json`, 'utf8'),
      readFile(`${repositoryRoot}/apps/wechat-miniprogram/miniprogram/pages/social/index.wxml`, 'utf8'),
      readFile(`${repositoryRoot}/apps/wechat-miniprogram/miniprogram/lib/social-client.ts`, 'utf8'),
      readFile(`${repositoryRoot}/docs/operations/PHASE_13_FINAL_REPORT.md`, 'utf8'),
    ]);

    expect(app).toContain("route === '/social'");
    expect(webPage).toContain('MY MOMENTS / LOCAL ONLY');
    expect(webPage).toContain('localArchiveAdapter');
    expect(webPage).toContain('不会自动公开');
    expect(webClient).toContain("'UNAVAILABLE'");
    expect(JSON.parse(miniApp).pages).toContain('pages/social/index');
    expect(miniPage).toContain('SOCIAL ARCHIVE');
    expect(miniClient).toContain('不会展示演示数据');
    expect(report).toContain('X provider boundary: implemented, real capability NOT_VERIFIED.');
  });

  it('does not add scraping, private-message sync or popup success paths', async () => {
    const [web, mini, service] = await Promise.all([
      readFile(`${repositoryRoot}/apps/web/src/socialClient.ts`, 'utf8'),
      readFile(`${repositoryRoot}/apps/wechat-miniprogram/miniprogram/lib/social-client.ts`, 'utf8'),
      readFile(`${repositoryRoot}/services/social-connectors/src/index.ts`, 'utf8'),
    ]);
    const source = `${web}\n${mini}\n${service}`;
    expect(source).not.toMatch(/(?:showModal|showToast|showActionSheet|alert\(|confirm\(|prompt\()/);
    expect(source).not.toMatch(/(?:scrape|private[ _-]?api|dm[ _-]?sync|cookie[ _-]?import)/i);
    expect(source).not.toMatch(/(?:client_secret|refresh_token|access_token)\s*:/i);
  });
});
