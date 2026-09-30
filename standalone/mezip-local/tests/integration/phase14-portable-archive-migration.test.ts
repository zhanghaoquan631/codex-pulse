import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Phase 14 migration contract', () => {
  it('keeps portable tables owner-scoped, force-RLS protected and manual-only for legacy release', () => {
    const sql = readFileSync(
      new URL(
        '../../infrastructure/database/016_phase14_portable_archives.sql',
        import.meta.url,
      ),
      'utf8',
    );
    for (const table of [
      'archive_exports',
      'archive_imports',
      'archive_import_conflicts',
      'archive_backups',
      'archive_versions',
      'archive_download_tokens',
      'annual_archives',
      'legacy_plans',
      'legacy_recipients',
      'legacy_scope_rules',
    ]) {
      expect(sql).toMatch(new RegExp(table, 'u'));
      expect(sql).toContain('ALTER TABLE %I ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('ALTER TABLE %I FORCE ROW LEVEL SECURITY');
    }
    expect(sql).toContain('auto_release_enabled boolean NOT NULL DEFAULT false');
    expect(sql).toContain('CHECK (auto_release_enabled = false)');
    expect(sql).toContain('owner_user_id');
    expect(sql).not.toMatch(
      /CREATE POLICY .* ON (archive_exports|archive_imports|archive_backups)/u,
    );
  });
});
