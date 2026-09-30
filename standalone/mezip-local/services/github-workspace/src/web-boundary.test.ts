import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const appUrl = new URL(
  '../../../apps/web/public/github-workspace-v1/app.js',
  import.meta.url,
);
const htmlUrl = new URL(
  '../../../apps/web/public/github-workspace-v1/index.html',
  import.meta.url,
);
const realOnlyHtmlUrl = new URL(
  '../../../apps/web/public/github-workspace-v2/index.html',
  import.meta.url,
);
const v3HtmlUrl = new URL(
  '../../../apps/web/public/github-workspace-v3/index.html',
  import.meta.url,
);
const v4HtmlUrl = new URL(
  '../../../apps/web/public/github-workspace-v4/index.html',
  import.meta.url,
);
const v5HtmlUrl = new URL(
  '../../../apps/web/public/github-workspace-v5/index.html',
  import.meta.url,
);

describe('GitHub Workspace static client boundary', () => {
  it('keeps official GitHub navigation exact and gates fixtures behind explicit loopback preview', async () => {
    const source = await readFile(appUrl, 'utf8');
    expect(source).toContain("const OFFICIAL_GITHUB_URL = 'https://github.com/'");
    expect(source).toContain(
      "new URLSearchParams(location.search).get('preview') === '1'",
    );
    expect(source).toContain("['127.0.0.1', 'localhost'].includes(location.hostname)");
    expect(source).toContain('本地界面预览 · 未连接真实 GitHub');
    expect(source).toContain('页面不会伪造连接或同步成功');
  });

  it('contains all six requested work areas and no client credential storage', async () => {
    const source = await readFile(appUrl, 'utf8');
    for (const view of [
      'overview',
      'repositories',
      'snippets',
      'issues',
      'tasks',
      'activity',
    ]) {
      expect(source).toContain(view);
    }
    expect(source).not.toMatch(
      /localStorage|sessionStorage|document\.cookie|access[_-]?token|client[_-]?secret/iu,
    );
  });

  it('is independently addressable from the preserved ME.zip site', async () => {
    const html = await readFile(htmlUrl, 'utf8');
    expect(html).toContain('/github-workspace-v1/styles.css');
    expect(html).toContain('/github-workspace-v1/app.js');
    expect(html).not.toContain('/post-login-app/');
  });

  it('provides a real-account-only entry that removes fixture preview mode', async () => {
    const [html, guard] = await Promise.all([
      readFile(realOnlyHtmlUrl, 'utf8'),
      readFile(
        new URL(
          '../../../apps/web/public/github-workspace-v2/real-account-guard.js',
          import.meta.url,
        ),
        'utf8',
      ),
    ]);
    expect(html).toContain("url.searchParams.delete('preview')");
    expect(html).toContain("a[href*='preview=1']");
    expect(html).toContain('/github-workspace-v1/app.js');
    expect(html).toContain('/github-workspace-v2/real-account-guard.js');
    expect(html).not.toContain('tom-preview');
    expect(guard).toContain('等待 GitHub App 配置');
    expect(guard).toContain('当前没有读取任何 GitHub 账号数据');
  });

  it('keeps V3 on the real bridge and makes non-configuration failures retryable', async () => {
    const [html, guard, readme] = await Promise.all([
      readFile(v3HtmlUrl, 'utf8'),
      readFile(
        new URL(
          '../../../apps/web/public/github-workspace-v3/connection-guard.js',
          import.meta.url,
        ),
        'utf8',
      ),
      readFile(
        new URL(
          '../../../apps/web/public/github-workspace-v3/README.md',
          import.meta.url,
        ),
        'utf8',
      ),
    ]);
    expect(html).toContain("url.searchParams.delete('preview')");
    expect(html).toContain('/github-workspace-v1/app.js');
    expect(html).toContain('/github-workspace-v3/connection-guard.js');
    expect(html).not.toContain('tom-preview');
    expect(guard).toContain('GITHUB_CALLBACK_REQUIRES_CONFIGURATION');
    expect(guard).toContain('data-v3-retry');
    expect(guard).toContain('location.reload()');
    expect(readme).toContain('/v1/github-workspace/*');
    expect(readme).toContain('no fixture fallback');
  });

  it('makes V4 auto-sync after OAuth and keeps the requested feature views real-only', async () => {
    const [html, sync, enhancements, controls, readme] = await Promise.all([
      readFile(v4HtmlUrl, 'utf8'),
      readFile(
        new URL(
          '../../../apps/web/public/github-workspace-v4/auto-sync.js',
          import.meta.url,
        ),
        'utf8',
      ),
      readFile(
        new URL(
          '../../../apps/web/public/github-workspace-v4/enhancements.js',
          import.meta.url,
        ),
        'utf8',
      ),
      readFile(
        new URL(
          '../../../apps/web/public/github-workspace-v4/feature-controls.js',
          import.meta.url,
        ),
        'utf8',
      ),
      readFile(
        new URL(
          '../../../apps/web/public/github-workspace-v4/README.md',
          import.meta.url,
        ),
        'utf8',
      ),
    ]);
    expect(html).toContain("url.searchParams.delete('preview')");
    expect(html).toContain('/github-workspace-v4/auto-sync.js');
    expect(html).toContain('/github-workspace-v1/app.js');
    expect(sync).toContain('connection.lastSyncedAt');
    expect(sync).toContain('${API_ROOT}/sync');
    expect(sync).toContain('Idempotency-Key');
    expect(enhancements).toContain('${API_ROOT}/overview');
    expect(enhancements).toContain('连续贡献');
    expect(enhancements).toContain('task.dueAt');
    expect(enhancements).toContain('task.linkedIssue');
    expect(controls).toContain('repositoryVisibility');
    expect(controls).toContain('snippetLanguage');
    expect(controls).toContain('issueState');
    expect(readme).toContain('no fixture fallback');
  });

  it('keeps V5 independently addressable and tolerant of optional endpoint failures', async () => {
    const [html, bridge, controls, readme] = await Promise.all([
      readFile(v5HtmlUrl, 'utf8'),
      readFile(
        new URL(
          '../../../apps/web/public/github-workspace-v5/resilient-bridge.js',
          import.meta.url,
        ),
        'utf8',
      ),
      readFile(
        new URL(
          '../../../apps/web/public/github-workspace-v5/workspace-controls.js',
          import.meta.url,
        ),
        'utf8',
      ),
      readFile(
        new URL(
          '../../../apps/web/public/github-workspace-v5/README.md',
          import.meta.url,
        ),
        'utf8',
      ),
    ]);
    expect(html).toContain('/github-workspace-v5/resilient-bridge.js');
    expect(html).toContain('/github-workspace-v1/app.js');
    expect(html).toContain('/github-workspace-v5/workspace-controls.js');
    expect(html).toContain('/github-workspace-v5/dashboard-overview.js');
    expect(html).toContain('/github-workspace-v5/pull-requests-view.js');
    expect(html).not.toContain('/post-login-app/');
    expect(bridge).toContain('OPTIONAL_GETS');
    expect(bridge).toContain('X-MEZIP-Partial');
    expect(bridge).not.toMatch(
      /localStorage|sessionStorage|document\.cookie|access[_-]?token|client[_-]?secret/iu,
    );
    expect(controls).toContain('data-v5-retry');
    expect(controls).toContain("method: 'PATCH'");
    expect(controls).toContain('Idempotency-Key');
    expect(readme).toContain('贡献热力图');
    expect(readme).toContain('单项失败');
    expect(readme).toContain('拖拽移动');
    expect(readme).toContain('Pull Requests：');
  });
});
