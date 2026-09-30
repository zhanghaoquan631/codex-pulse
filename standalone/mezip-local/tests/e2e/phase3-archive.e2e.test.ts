import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

async function sourceTree(directory: string): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const path = `${directory}/${entry.name}`;
        if (entry.isDirectory()) return sourceTree(path);
        return !entry.name.includes('.test.') &&
          /\.(?:ts|tsx|wxml|wxss|json)$/.test(entry.name)
          ? readFile(path, 'utf8')
          : '';
      }),
    )
  ).join('\n');
}

describe('Phase 3 archive delivery contract', () => {
  it('exposes real archive routes and owner-safe local workflows', async () => {
    const [appModel, archiveStore, app, miniJson, miniStore, migration] =
      await Promise.all([
        readFile(`${repositoryRoot}/apps/web/src/appModel.ts`, 'utf8'),
        readFile(`${repositoryRoot}/apps/web/src/archiveStore.ts`, 'utf8'),
        readFile(`${repositoryRoot}/apps/web/src/App.tsx`, 'utf8'),
        readFile(
          `${repositoryRoot}/apps/wechat-miniprogram/miniprogram/app.json`,
          'utf8',
        ),
        readFile(
          `${repositoryRoot}/apps/wechat-miniprogram/miniprogram/lib/archive-store.ts`,
          'utf8',
        ),
        readFile(
          `${repositoryRoot}/infrastructure/database/003_phase3_archive.sql`,
          'utf8',
        ),
      ]);
    for (const expected of [
      '/life',
      '/timeline',
      '/history',
      '/fitness',
      '/daily-pack',
      '/trash',
      '/export',
      '/privacy',
    ])
      expect(appModel).toContain(expected);
    for (const expected of [
      'localStorage',
      'PRIVATE',
      'ArchiveConflictError',
      'permanentDelete',
      'dailyPack',
      'quota',
      'summary',
    ])
      expect(archiveStore).toContain(expected);
    for (const expected of [
      'LIFE / PRIVATE',
      'PRIVATE BY DEFAULT',
      '回收站',
      '导出 JSON',
      'archive-inline-confirm',
      'Daily Pack',
      'archiveSummary',
      'PrivacyCenterPage',
      'localArchiveAdapter.search',
    ])
      expect(app).toContain(expected);
    for (const expected of [
      'schema_version',
      'media_policy',
      'EXCLUDED_BY_DEFAULT',
      'timeline_metadata',
    ])
      expect(archiveStore).toContain(expected);
    const mini = JSON.parse(miniJson) as { pages: string[] };
    expect(mini.pages).toEqual(
      expect.arrayContaining([
        'pages/life/index',
        'pages/timeline/index',
        'pages/history/index',
        'pages/fitness/index',
        'pages/steps/index',
        'pages/daily-pack/index',
        'pages/trash/index',
        'pages/export/index',
        'pages/privacy/index',
      ]),
    );
    for (const expected of [
      'wx.setStorageSync',
      'PRIVATE_BY_DEFAULT',
      'permanentDelete',
      'MANIFEST_ONLY',
      'schema_version',
      'media_policy',
      'trash_policy',
      'timeline_metadata',
      'daily_pack',
      'revision',
      'ownerId',
    ])
      expect(miniStore).toContain(expected);
    for (const expected of [
      'life_entries',
      'life_type',
      'record_source',
      'server_received_at',
      'mezip_record_kind',
      'life_revisions',
      'life_published_snapshots',
      'life_ai_insights',
      'output_type',
      'archive_timeline_events',
      'archive_daily_packs',
      'archive_media_assets',
      'archive_offline_mutations',
      'ROW LEVEL SECURITY',
    ])
      expect(migration).toContain(expected);
    expect(migration).toMatch(
      /CREATE TABLE IF NOT EXISTS life_ai_insights[\s\S]*?output_type text NOT NULL DEFAULT 'AI_GENERATED'/,
    );
  });

  it('keeps destructive actions inline and never uses application popups', async () => {
    const [web, mini] = await Promise.all([
      sourceTree(`${repositoryRoot}/apps/web/src`),
      sourceTree(`${repositoryRoot}/apps/wechat-miniprogram/miniprogram`),
    ]);
    expect(web).not.toMatch(/\b(?:alert|confirm|prompt)\s*\(/);
    expect(mini).not.toMatch(/wx\.show(?:Toast|ActionSheet|Modal)\s*\(/);
  });
});
