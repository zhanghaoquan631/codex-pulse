import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const root = '../../../apps/web/public/github-workspace-v6/';

describe('GitHub Workspace V6 stability boundary', () => {
  it('uses the independent entry point and replaces the two looping controls', async () => {
    const [html, featureControls, workspaceControls, guard, heatmap] =
      await Promise.all([
        readFile(new URL(`${root}index.html`, import.meta.url), 'utf8'),
        readFile(new URL(`${root}feature-controls.js`, import.meta.url), 'utf8'),
        readFile(new URL(`${root}workspace-controls.js`, import.meta.url), 'utf8'),
        readFile(new URL(`${root}route-guard.js`, import.meta.url), 'utf8'),
        readFile(new URL(`${root}heatmap-time.js`, import.meta.url), 'utf8'),
      ]);
    expect(html).toContain('/github-workspace-v6/connection-bridge.js');
    expect(html).toContain('/github-workspace-v6/feature-controls.js');
    expect(html).toContain('/github-workspace-v6/workspace-controls.js');
    expect(html).not.toContain('/post-login-app/');
    expect(featureControls).toContain('const bound = new WeakSet()');
    expect(featureControls).toContain('if (!toolbar || bound.has(toolbar)) return');
    expect(workspaceControls).toContain('partialSignature');
    expect(workspaceControls).toContain('data-v6-partial-state');
    expect(guard).toContain('v6RouteGuard');
    expect(guard).toContain('/api/integrations/github/connect');
    expect(html).toContain('/github-workspace-v6/heatmap-time.js');
    expect(heatmap).toContain('dataset.date');
    expect(heatmap).toContain('每格 = 当天贡献次数');
  });

  it('keeps credentials out of the connection bridge', async () => {
    const bridge = await readFile(
      new URL(`${root}connection-bridge.js`, import.meta.url),
      'utf8',
    );
    expect(bridge).toContain('AUTH_REQUIRED');
    expect(bridge).not.toMatch(
      /localStorage|sessionStorage|document\.cookie|access[_-]?token|client[_-]?secret|private[_-]?key/iu,
    );
  });
});
