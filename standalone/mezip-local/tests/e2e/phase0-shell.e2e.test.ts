import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('Phase 0 shell smoke test', () => {
  it('keeps Web and Mini Program shells credential-free and privacy-first', async () => {
    const [webApp, miniProject, productFreeze] = await Promise.all([
      readFile(`${repositoryRoot}/apps/web/src/App.tsx`, 'utf8'),
      readFile(`${repositoryRoot}/apps/wechat-miniprogram/project.config.json`, 'utf8'),
      readFile(`${repositoryRoot}/PRODUCT_FREEZE.md`, 'utf8'),
    ]);

    expect(webApp).toContain('未展示虚构数据');
    expect(miniProject).toContain('YOUR_WECHAT_APP_ID');
    expect(productFreeze).toContain(
      'Private Record → user selects Share → Public Snapshot',
    );
  });
});
