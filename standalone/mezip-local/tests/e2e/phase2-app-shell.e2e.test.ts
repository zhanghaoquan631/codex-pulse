import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

async function readSourceTree(directory: string): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        return readSourceTree(path);
      }

      if (entry.name.includes('.test.') || !/\.(?:ts|tsx)$/.test(entry.name)) {
        return '';
      }

      return readFile(path, 'utf8');
    }),
  );

  return contents.join('\n');
}

describe('Phase 2 app-shell delivery contract', () => {
  it('keeps Web shell navigation, privacy copy, honest loading states and responsive fallbacks together', async () => {
    const [app, styles, membershipCenter, codeHubPage] = await Promise.all([
      readFile(`${repositoryRoot}/apps/web/src/App.tsx`, 'utf8'),
      readFile(`${repositoryRoot}/apps/web/src/styles.css`, 'utf8'),
      readFile(`${repositoryRoot}/apps/web/src/MembershipCenter.tsx`, 'utf8'),
      readFile(`${repositoryRoot}/apps/web/src/CodeHubPage.tsx`, 'utf8'),
    ]);

    // Phase 6 moved membership into its own server-projected boundary. Keep
    // this shell contract tied to the actual rendered membership source rather
    // than resurrecting a legacy placeholder in App.tsx.
    const applicationSource = `${app}\n${membershipCenter}\n${codeHubPage}`;

    for (const expected of [
      'function WorkspaceShell',
      'function HomePage',
      'function TownPage',
      'function ConstellationPage',
      'function CommunityPage',
      'function MessagesPage',
      'function ActivitiesPage',
      'function MembershipPage',
      '<AiUsageDashboardPage',
      'function CreatorPage',
      'function CodeHubPage',
      'function SettingsPage',
      'PRIVATE BY DEFAULT',
      '未展示虚构数据',
      '当前界面不会把任何按钮点击视为支付成功。',
      '方案、到期日、订单和权益均由服务端投影。',
    ]) {
      expect(applicationSource).toContain(expected);
    }

    for (const expected of [
      '.border-beam-active',
      '.music-visualizer',
      '.constellation-card',
      '@media (max-width: 760px)',
      '@media (prefers-reduced-motion: reduce)',
      '@keyframes mz-border-beam',
    ]) {
      expect(styles).toContain(expected);
    }
    expect(app).not.toContain('function CreateMenu');
    expect(styles).not.toContain('.create-menu-backdrop');
    expect(app).toContain('服务端 AI 使用记录未连接');
    expect(app).not.toContain('archiveSummary.byKind.AI_USAGE');
  });

  it('keeps Mini Program routes, CNY fen presentation, static Town fallback and limited AI Usage boundary explicit', async () => {
    const [
      appJsonText,
      miniData,
      townPage,
      aiPage,
      homePage,
      membershipPage,
      mePage,
      settingsPage,
      preferences,
      miniApp,
      miniAuth,
      mockSession,
      lifePage,
      historyPage,
      fitnessPage,
      stepsPage,
    ] = await Promise.all([
      readFile(
        `${repositoryRoot}/apps/wechat-miniprogram/miniprogram/app.json`,
        'utf8',
      ),
      readFile(
        `${repositoryRoot}/apps/wechat-miniprogram/miniprogram/lib/mock-data.ts`,
        'utf8',
      ),
      readFile(
        `${repositoryRoot}/apps/wechat-miniprogram/miniprogram/pages/town/index.wxml`,
        'utf8',
      ),
      readFile(
        `${repositoryRoot}/apps/wechat-miniprogram/miniprogram/pages/ai/index.wxml`,
        'utf8',
      ),
      readFile(
        `${repositoryRoot}/apps/wechat-miniprogram/miniprogram/pages/home/index.wxml`,
        'utf8',
      ),
      readFile(
        `${repositoryRoot}/apps/wechat-miniprogram/miniprogram/pages/membership/index.wxml`,
        'utf8',
      ),
      readFile(
        `${repositoryRoot}/apps/wechat-miniprogram/miniprogram/pages/me/index.ts`,
        'utf8',
      ),
      readFile(
        `${repositoryRoot}/apps/wechat-miniprogram/miniprogram/pages/settings/index.wxml`,
        'utf8',
      ),
      readFile(
        `${repositoryRoot}/apps/wechat-miniprogram/miniprogram/lib/preferences.ts`,
        'utf8',
      ),
      readFile(`${repositoryRoot}/apps/wechat-miniprogram/miniprogram/app.ts`, 'utf8'),
      readFile(
        `${repositoryRoot}/apps/wechat-miniprogram/miniprogram/pages/auth/index.ts`,
        'utf8',
      ),
      readFile(
        `${repositoryRoot}/apps/wechat-miniprogram/miniprogram/lib/mock-session.ts`,
        'utf8',
      ),
      readFile(
        `${repositoryRoot}/apps/wechat-miniprogram/miniprogram/pages/life/index.ts`,
        'utf8',
      ),
      readFile(
        `${repositoryRoot}/apps/wechat-miniprogram/miniprogram/pages/history/index.ts`,
        'utf8',
      ),
      readFile(
        `${repositoryRoot}/apps/wechat-miniprogram/miniprogram/pages/fitness/index.ts`,
        'utf8',
      ),
      readFile(
        `${repositoryRoot}/apps/wechat-miniprogram/miniprogram/pages/steps/index.ts`,
        'utf8',
      ),
    ]);
    const appJson = JSON.parse(appJsonText) as {
      pages: string[];
      tabBar: { list: { pagePath: string }[] };
    };

    expect(appJson.pages).toEqual(
      expect.arrayContaining([
        'pages/home/index',
        'pages/town/index',
        'pages/constellation/index',
        'pages/community/index',
        'pages/messages/index',
        'pages/activities/index',
        'pages/membership/index',
        'pages/ai/index',
        'pages/creator/index',
        'pages/code/index',
        'pages/benefits/index',
        'pages/me/index',
        'pages/settings/index',
      ]),
    );
    expect(appJson.tabBar.list.map((item) => item.pagePath)).toContain(
      'pages/me/index',
    );
    expect(miniData).toContain('amountFen: 8000');
    expect(miniData).toContain('configured: false');
    expect(townPage).toContain('TOWN FALLBACK');
    expect(townPage).toContain('Town 不依赖 WebGL、物理引擎或持续 60 FPS 场景');
    expect(aiPage).toContain('AI USAGE / PRIVATE BY DEFAULT');
    expect(aiPage).toContain('小程序不能后台监测所有移动应用');
    expect(aiPage).not.toContain('providerConfigured');
    expect(homePage).not.toContain('create-overlay');
    expect(membershipPage).not.toContain('showPaymentComingLater');
    expect(mePage).not.toContain('wx.showModal');
    expect(settingsPage).toContain('audioTracksConfigured');
    expect(settingsPage).toContain('背景音乐（待授权音轨）');
    expect(settingsPage).toContain('Town 环境声音（待授权音轨）');
    expect(preferences).toContain('MINI_AUDIO_TRACKS_CONFIGURED = false');
    expect(miniApp).toContain('archiveStore.setOwner');
    expect(miniAuth).toContain('DevelopmentMiniAuthAdapter');
    expect(miniAuth).toContain('developmentAuth.verify');
    expect(miniAuth).toContain('archiveStore.setOwner(result.session.ownerId)');
    expect(mockSession).toContain('subjectFingerprint');
    expect(mockSession).not.toContain(
      'wx.setStorageSync(MOCK_SESSION_STORAGE_KEY, identifier',
    );
    for (const archivePage of [lifePage, historyPage, fitnessPage, stepsPage]) {
      expect(archivePage).toContain('createArchiveMutationKey');
      expect(archivePage).toContain('idempotencyKey');
    }
  });

  it('keeps Phase 2 interactions inline instead of using application popups', async () => {
    const [webSources, miniProgramSources] = await Promise.all([
      readSourceTree(`${repositoryRoot}/apps/web/src`),
      readSourceTree(`${repositoryRoot}/apps/wechat-miniprogram/miniprogram`),
    ]);

    expect(webSources).not.toMatch(/\b(?:alert|confirm|prompt)\s*\(/);
    expect(miniProgramSources).not.toMatch(/wx\.show(?:Toast|ActionSheet|Modal)\s*\(/);
  });
});
