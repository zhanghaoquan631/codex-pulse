import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('Phase 14.5 Creator Identity Reveal delivery contract', () => {
  it('keeps the existing login path fail-open while layering a public creator reveal on top', async () => {
    const [
      app,
      webReveal,
      webModel,
      webStyles,
      webReference,
      sharedProfile,
      miniWelcome,
      miniPage,
      miniStyles,
      miniReference,
      miniController,
      miniApp,
    ] = await Promise.all([
      readFile(`${repositoryRoot}/apps/web/src/App.tsx`, 'utf8'),
      readFile(`${repositoryRoot}/apps/web/src/CreatorIdentityReveal.tsx`, 'utf8'),
      readFile(`${repositoryRoot}/apps/web/src/creatorIntroModel.ts`, 'utf8'),
      readFile(`${repositoryRoot}/apps/web/src/styles.css`, 'utf8'),
      readFile(`${repositoryRoot}/apps/web/public/creator-intro-reference.jpg`),
      readFile(`${repositoryRoot}/packages/shared-types/src/index.ts`, 'utf8'),
      readFile(
        `${repositoryRoot}/apps/wechat-miniprogram/miniprogram/pages/welcome/index.ts`,
        'utf8',
      ),
      readFile(
        `${repositoryRoot}/apps/wechat-miniprogram/miniprogram/pages/creator-intro/index.wxml`,
        'utf8',
      ),
      readFile(
        `${repositoryRoot}/apps/wechat-miniprogram/miniprogram/pages/creator-intro/index.wxss`,
        'utf8',
      ),
      readFile(
        `${repositoryRoot}/apps/wechat-miniprogram/miniprogram/images/creator-intro-reference.jpg`,
      ),
      readFile(
        `${repositoryRoot}/apps/wechat-miniprogram/miniprogram/pages/creator-intro/index.ts`,
        'utf8',
      ),
      readFile(
        `${repositoryRoot}/apps/wechat-miniprogram/miniprogram/app.json`,
        'utf8',
      ),
    ]);

    expect(app).toContain('function AuthShell');
    expect(app).toContain('已有账号，登录');
    expect(app).toContain('requestLogin');
    expect(app).toContain('openOriginalLogin');
    expect(app).toContain('<CreatorIdentityReveal');
    expect(app).toContain('firstProviderRef.current?.focus()');
    expect(webModel).toContain("tier === 'FULL'");
    expect(webModel).toContain('read.available && !read.preference.disabled');
    expect(webStyles).toContain('.creator-intro-stage *');
    expect(webStyles).toContain("'Snell Roundhand'");
    expect(webStyles).toContain('creator-intro-reference.jpg');
    expect(webReference.byteLength).toBeGreaterThan(1000);
    expect(sharedProfile).toContain('我喜欢探索设计与技术之间那块还没有名字的区域：');
    expect(sharedProfile).toContain(
      '咖啡、写字、乱涂和小工具。近期：手绘小镇、极简摄影、AI 实验。',
    );
    expect(webReveal).toContain('CreatorIntroErrorBoundary');
    expect(webReveal).toContain('creator-intro-townscape');
    expect(webReveal).toContain('--creator-scroll-reveal');
    expect(webReveal).toContain('reachedBottom');
    expect(webReveal).toContain('creator-font-preserve');
    expect(webReveal).toContain('role="dialog"');
    expect(webReveal).toContain('onKeyDown={onKeyDown}');
    expect(webReveal).toContain('Copy Email');
    expect(webReveal).toContain('mailto:');
    expect(webReveal).toContain('不会读取你的私人档案、消息、AI 或健康记录');
    expect(miniWelcome).toContain('shouldOpenCreatorIntro');
    expect(miniWelcome).toContain("'/pages/creator-intro/index'");
    expect(miniController).toContain('CONTENT_REVEAL');
    expect(miniStyles).toContain('.creator-intro-page *');
    expect(miniStyles).toContain("'Snell Roundhand'");
    expect(miniPage).toContain('creator-signature');
    expect(miniPage).toContain('creator-intro-reference.jpg');
    expect(miniReference.byteLength).toBeGreaterThan(1000);
    expect(miniController).toContain('onProfileScroll');
    expect(miniController).toContain('completeProfileReveal');
    expect(miniPage).toContain('Copy Email');
    expect(JSON.parse(miniApp).pages).toContain('pages/creator-intro/index');
  });

  it('has no popup, remote profile asset, archive read or credential path in the reveal surfaces', async () => {
    const source = (
      await Promise.all([
        readFile(`${repositoryRoot}/apps/web/src/CreatorIdentityReveal.tsx`, 'utf8'),
        readFile(`${repositoryRoot}/apps/web/src/creatorIntroModel.ts`, 'utf8'),
        readFile(
          `${repositoryRoot}/apps/wechat-miniprogram/miniprogram/pages/creator-intro/index.ts`,
          'utf8',
        ),
        readFile(
          `${repositoryRoot}/apps/wechat-miniprogram/miniprogram/lib/creator-intro.ts`,
          'utf8',
        ),
      ])
    ).join('\n');

    expect(source).not.toMatch(/(?:window\.)?(?:alert|confirm|prompt)\s*\(/);
    expect(source).not.toMatch(/wx\.show(?:Toast|Modal|ActionSheet)\s*\(/);
    expect(source).not.toMatch(/https?:\/\//i);
    expect(source).not.toMatch(
      /(?:archiveStore|messaging|private message|access[_-]?token|refresh[_-]?token)/i,
    );
  });
});
