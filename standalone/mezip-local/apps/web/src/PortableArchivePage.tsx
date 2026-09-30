import { useEffect, useMemo, useRef, useState } from 'react';

import type { AppRoute } from './appModel.js';
import type { ExperienceTier } from './experienceSettings.js';
import type { PortableArchiveSection } from '@me-zip/shared-types';
import {
  portableArchiveClient,
  type PortableArchiveCenterClient,
  type PortableArchiveCenterSnapshot,
} from './portableArchiveClient.js';

const sections = [
  ['LIFE', '生活'],
  ['TIMELINE', '时间轴'],
  ['HISTORY', '读书感悟'],
  ['FITNESS', '健身'],
  ['STEPS', '步数'],
  ['DAILY_PACK', 'Daily Pack'],
  ['AI_USAGE', 'AI 使用'],
  ['AI_INSIGHTS', 'AI Insight'],
  ['SOCIAL', '社交档案'],
  ['PRIVACY', '隐私设置'],
  ['DEVICES', '设备元数据'],
  ['MEDIA', '媒体清单'],
] as const;

function stateLabel(status: string): string {
  const labels: Readonly<Record<string, string>> = {
    READY: '已准备',
    FAILED: '失败',
    PREVIEW_READY: '预览已生成',
    VERIFYING: '校验中',
    IMPORTING: '恢复中',
    DRAFT: '草稿',
    DISABLED: '已禁用',
  };
  return labels[status] ?? status;
}
function formatBytes(value: number | null): string {
  if (value === null) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function PortableArchivePage({
  client = portableArchiveClient,
  tier,
  onNavigate,
}: {
  readonly client?: PortableArchiveCenterClient;
  readonly tier: ExperienceTier;
  readonly onNavigate?: (route: AppRoute) => void;
}) {
  const [snapshot, setSnapshot] = useState<PortableArchiveCenterSnapshot | null>(null);
  const [kind, setKind] = useState<
    'FULL_ARCHIVE' | 'YEAR_ARCHIVE' | 'CUSTOM_RANGE' | 'SELECTED_MODULES'
  >('YEAR_ARCHIVE');
  const [year, setYear] = useState(new Date().getFullYear());
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [includeMedia, setIncludeMedia] = useState(false);
  const [includeTrash, setIncludeTrash] = useState(false);
  const [encrypted, setEncrypted] = useState(false);
  const [password, setPassword] = useState('');
  const [selected, setSelected] = useState<readonly PortableArchiveSection[]>([
    'LIFE',
    'TIMELINE',
    'HISTORY',
    'FITNESS',
    'STEPS',
    'DAILY_PACK',
  ]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setSnapshot(null);
    void client.load(year).then(setSnapshot);
  };
  useEffect(load, [client, year]);
  const request = useMemo(
    () => ({
      type: kind,
      ...(kind === 'YEAR_ARCHIVE' ? { year } : {}),
      ...(kind === 'CUSTOM_RANGE'
        ? {
            dateRange: {
              from:
                customFrom === ''
                  ? null
                  : new Date(`${customFrom}T00:00:00.000Z`).toISOString(),
              to:
                customTo === ''
                  ? null
                  : new Date(`${customTo}T23:59:59.999Z`).toISOString(),
            },
          }
        : {}),
      ...(kind === 'SELECTED_MODULES' ? { sections: selected } : {}),
      includeMedia,
      includeTrash,
      encryptionMode: encrypted ? ('PASSWORD_AES_256_GCM' as const) : ('NONE' as const),
      ...(encrypted ? { password } : {}),
    }),
    [
      kind,
      year,
      customFrom,
      customTo,
      selected,
      includeMedia,
      includeTrash,
      encrypted,
      password,
    ],
  );
  const create = async () => {
    setBusy(true);
    setNotice('正在整理档案并验证校验信息…');
    try {
      await client.createExport(request);
      setNotice('导出已创建；可以在导出历史中下载。');
      load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '导出失败。');
    } finally {
      setBusy(false);
    }
  };
  const download = async (jobId: string) => {
    setBusy(true);
    setNotice('正在准备下载…');
    try {
      const result = await client.download(jobId);
      const blob = new Blob([result.rawBytes.slice().buffer as ArrayBuffer], {
        type: 'application/json',
      });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = result.fileName;
      anchor.click();
      URL.revokeObjectURL(href);
      setNotice('下载已准备；密码不会上传或写入日志。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '下载失败。');
    } finally {
      setBusy(false);
    }
  };
  const importFile = async (file: File) => {
    setBusy(true);
    setNotice('正在校验 Archive manifest 与 SHA-256 checksums…');
    try {
      const raw = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(raw)));
      const preview = await client.previewImport(base64, encrypted ? { password } : {});
      setNotice(
        `Integrity ${preview.integrity}；发现 ${preview.conflicts.length} 个可审阅冲突。`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '导入校验失败。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="portable-archive-page" data-motion-tier={tier}>
      <header className="portable-archive-hero">
        <p className="eyebrow">PORTABLE ARCHIVE / PRIVATE BY DEFAULT</p>
        <h1>把这一年打包保存。</h1>
        <p>
          `.mezip`
          是可验证、可迁移、可恢复的结构化个人档案。原始数据优先；密码、Token、OAuth、BYOK、支付凭据与原始向量永不导出。
        </p>
        <div className="portable-archive-actions">
          <button
            className="create-button glass-control"
            type="button"
            onClick={create}
            disabled={busy}
          >
            创建 Archive
          </button>
          <button
            className="quiet-button glass-control"
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            校验 / 预览导入
          </button>
          <input
            ref={fileRef}
            className="sr-only"
            type="file"
            accept=".mezip,application/json"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file !== undefined) void importFile(file);
            }}
          />
        </div>
      </header>

      <section
        className="portable-archive-builder glass-layer-card"
        aria-labelledby="portable-builder-title"
      >
        <div>
          <p className="eyebrow">EXPORT BUILDER</p>
          <h2 id="portable-builder-title">选择范围与保护方式</h2>
        </div>
        <div className="portable-archive-fields">
          <label>
            类型
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as typeof kind)}
            >
              <option value="YEAR_ARCHIVE">年度 Archive</option>
              <option value="FULL_ARCHIVE">完整 Archive</option>
              <option value="SELECTED_MODULES">选择模块</option>
              <option value="CUSTOM_RANGE">自定义范围</option>
            </select>
          </label>
          {kind === 'YEAR_ARCHIVE' ? (
            <label>
              年份
              <input
                type="number"
                min={1970}
                max={9999}
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
              />
            </label>
          ) : null}
          {kind === 'CUSTOM_RANGE' ? (
            <>
              <label>
                开始日期
                <input
                  type="date"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                />
              </label>
              <label>
                结束日期
                <input
                  type="date"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                />
              </label>
            </>
          ) : null}
          <label className="portable-archive-check">
            <input
              type="checkbox"
              checked={includeMedia}
              onChange={(event) => setIncludeMedia(event.target.checked)}
            />
            包含媒体（当前仅安全 manifest/已授权字节）
          </label>
          <label className="portable-archive-check">
            <input
              type="checkbox"
              checked={includeTrash}
              onChange={(event) => setIncludeTrash(event.target.checked)}
            />
            包含回收区（默认关闭）
          </label>
          <label className="portable-archive-check">
            <input
              type="checkbox"
              checked={encrypted}
              onChange={(event) => setEncrypted(event.target.checked)}
            />
            使用密码保护
          </label>
          {encrypted ? (
            <label>
              Archive 密码
              <input
                type="password"
                minLength={12}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="至少 12 个字符"
                autoComplete="new-password"
              />
            </label>
          ) : null}
        </div>
        {kind === 'SELECTED_MODULES' ? (
          <fieldset className="portable-archive-sections">
            <legend>模块</legend>
            {sections.map(([value, label]) => (
              <label key={value} className="portable-archive-check">
                <input
                  type="checkbox"
                  checked={selected.includes(value)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, value]
                        : current.filter((item) => item !== value),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
        ) : null}
        <p className="portable-archive-safety">
          敏感健康数据会在 manifest 中明确标记；第三方社交媒体默认只保留
          URL、metadata、excerpt 与个人备注。Legacy
          目前仅是手动审阅基础，自动释放始终关闭。
        </p>
      </section>

      {notice.length > 0 ? (
        <p className="portable-archive-inline-status" aria-live="polite">
          {notice}
        </p>
      ) : null}
      {snapshot === null ? (
        <section className="portable-archive-state glass-layer-card">
          <strong>正在读取服务端 Archive 状态…</strong>
        </section>
      ) : snapshot.availability === 'UNAVAILABLE' ? (
        <section className="portable-archive-state glass-layer-card">
          <strong>便携档案服务未连接</strong>
          <p>{snapshot.message}</p>
          <p>页面保持 fail-closed；不会展示本地伪造的导出、备份或恢复成功。</p>
        </section>
      ) : (
        <>
          <section className="portable-archive-history glass-layer-card">
            <div className="portable-archive-section-heading">
              <div>
                <p className="eyebrow">EXPORT HISTORY</p>
                <h2>导出与下载</h2>
              </div>
              <span>{snapshot.exports.length} 个任务</span>
            </div>
            {snapshot.exports.length === 0 ? (
              <p>还没有导出任务。</p>
            ) : (
              <ul>
                {snapshot.exports.map((job) => (
                  <li key={job.id}>
                    <div>
                      <strong>{job.type}</strong>
                      <span>
                        {stateLabel(job.status)} · {formatBytes(job.fileSize)}
                      </span>
                    </div>
                    {job.status === 'READY' ? (
                      <button
                        className="quiet-button glass-control"
                        type="button"
                        onClick={() => void download(job.id)}
                        disabled={busy}
                      >
                        下载 .mezip
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="portable-archive-grid">
            <article className="glass-layer-card">
              <p className="eyebrow">ANNUAL REVIEW</p>
              <h2>{snapshot.annual?.year ?? year} Annual Archive</h2>
              <p>
                {snapshot.annual === null
                  ? '年度投影不可用。'
                  : `当前为 ${stateLabel(snapshot.annual.status)}；统计 ${Object.values(snapshot.annual.statistics).reduce((a, b) => a + b, 0)} 条。`}
              </p>
              {onNavigate ? (
                <button
                  className="quiet-button glass-control"
                  type="button"
                  onClick={() => onNavigate('/constellation')}
                >
                  查看年度时间轴
                </button>
              ) : null}
            </article>
            <article className="glass-layer-card">
              <p className="eyebrow">BACKUP DOMAIN</p>
              <h2>备份历史</h2>
              <p>{snapshot.backups.length} 个备份；生产对象存储与灾备仍待人工配置。</p>
            </article>
            <article className="glass-layer-card">
              <p className="eyebrow">DIGITAL LEGACY / FOUNDATION ONLY</p>
              <h2>数字遗产</h2>
              <p>
                {snapshot.legacyPolicy?.autoReleaseEnabled === false
                  ? '自动释放已禁用。'
                  : '状态待服务端确认。'}{' '}
                收件人不等于立即授权。
              </p>
            </article>
          </section>
        </>
      )}
    </main>
  );
}
