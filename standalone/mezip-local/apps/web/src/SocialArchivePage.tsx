import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import type { ExperienceTier } from './experienceSettings.js';
import {
  localArchiveAdapter,
  type ArchiveMediaMetadata,
  type ArchiveRecord,
} from './archiveStore.js';
import { localMediaVault } from './localMediaVault.js';

interface LocalImageDraft {
  readonly metadata: ArchiveMediaMetadata;
  readonly file: File;
  readonly previewUrl: string;
}

function mediaId(file: File): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `local-social-image-${random}-${file.name.replace(/[^A-Za-z0-9._-]/g, '-')}`;
}

function createDraft(file: File): LocalImageDraft {
  return {
    file,
    metadata: {
      id: mediaId(file),
      name: file.name || 'camera-image.jpg',
      mimeType: file.type || 'image/jpeg',
      bytes: file.size,
    },
    previewUrl: URL.createObjectURL(file),
  };
}

function privateMoments(): readonly ArchiveRecord[] {
  return localArchiveAdapter
    .list()
    .filter(
      (record) =>
        record.kind === 'LIFE' ||
        record.kind === 'HISTORY' ||
        record.media.length > 0 ||
        record.body.length > 0,
    );
}

function formatMomentDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * A deliberate no-API page. Photos and writing are held in the current
 * browser's local archive; no external social account is connected or read.
 */
export function SocialArchivePage({ tier }: { readonly tier: ExperienceTier }) {
  const [records, setRecords] = useState<readonly ArchiveRecord[]>(() => privateMoments());
  const [mediaUrls, setMediaUrls] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [title, setTitle] = useState('');
  const [reflection, setReflection] = useState('');
  const [tags, setTags] = useState('');
  const [drafts, setDrafts] = useState<readonly LocalImageDraft[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    const nextRecords = privateMoments();
    const nextUrls = new Map<string, string>();
    const priorUrls = objectUrlsRef.current;
    priorUrls.forEach((url) => URL.revokeObjectURL(url));
    priorUrls.clear();

    await Promise.all(
      nextRecords.flatMap((record) =>
        record.media.map(async (media) => {
          try {
            const image = await localMediaVault.read({
              ownerId: record.ownerId,
              mediaId: media.id,
            });
            if (image === null) return;
            const url = URL.createObjectURL(image);
            nextUrls.set(media.id, url);
            priorUrls.add(url);
          } catch {
            // A record remains visible even when this device no longer has its local image.
          }
        }),
      ),
    );
    setRecords(nextRecords);
    setMediaUrls(nextUrls);
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
    };
  }, [refresh]);

  const clearDrafts = () => {
    setDrafts((current) => {
      current.forEach((draft) => URL.revokeObjectURL(draft.previewUrl));
      return [];
    });
  };

  const addPhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith('image/'));
    event.target.value = '';
    if (files.length === 0) {
      setMessage('请选择图片文件，或在手机上使用相机拍摄。');
      return;
    }
    setDrafts((current) => [...current, ...files.map(createDraft)]);
    setMessage('');
  };

  const removeDraft = (id: string) => {
    setDrafts((current) => {
      const removed = current.find((draft) => draft.metadata.id === id);
      if (removed !== undefined) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((draft) => draft.metadata.id !== id);
    });
  };

  const saveMoment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (title.trim().length === 0 && reflection.trim().length === 0 && drafts.length === 0) {
      setMessage('请先写下感悟、标题，或选择一张图片。');
      return;
    }
    setBusy(true);
    setMessage('');
    let record: ArchiveRecord | null = null;
    try {
      const createdRecord = localArchiveAdapter.create({
        kind: 'LIFE',
        title: title.trim() || '我的此刻感悟',
        body: reflection.trim(),
        tags: ['我的照片与感悟', ...tags.split(',').map((tag) => tag.trim()).filter(Boolean)],
        media: drafts.map((draft) => draft.metadata),
      });
      record = createdRecord;
      await Promise.all(
        drafts.map((draft) =>
          localMediaVault.save(
            { ownerId: createdRecord.ownerId, mediaId: draft.metadata.id },
            draft.file,
          ),
        ),
      );
      setTitle('');
      setReflection('');
      setTags('');
      clearDrafts();
      await refresh();
      setMessage('已只保存在这台设备的私密档案中；照片、感悟和文字都没有发布到外部平台。');
    } catch (error) {
      if (record !== null) {
        const incompleteRecord = record;
        await Promise.all(
          incompleteRecord.media.map((media) =>
            localMediaVault.remove({ ownerId: incompleteRecord.ownerId, mediaId: media.id }),
          ),
        );
        localArchiveAdapter.permanentDelete(incompleteRecord.id);
      }
      setMessage(error instanceof Error ? error.message : '本机保存失败；没有保留不完整内容。');
    } finally {
      setBusy(false);
    }
  };

  const deleteMoment = async (record: ArchiveRecord) => {
    setBusy(true);
    try {
      await Promise.all(
        record.media.map((media) =>
          localMediaVault.remove({ ownerId: record.ownerId, mediaId: media.id }),
        ),
      );
      localArchiveAdapter.permanentDelete(record.id);
      setConfirmDeleteId(null);
      await refresh();
      setMessage('这条私密内容及其本机图片已删除。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '删除失败，请重试。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="social-page local-moments-page" data-motion-tier={tier}>
      <header className="page-heading social-heading">
        <div>
          <p className="eyebrow">MY MOMENTS / LOCAL ONLY</p>
          <h1>我的照片与感悟</h1>
          <p className="page-lede">照片直接显示，感悟与文字一起保存。所有内容只留在当前浏览器的本机档案，不调用社交平台 API，也不会自动公开。</p>
        </div>
        <button className="quiet-button" type="button" onClick={() => void refresh()} disabled={busy}>刷新本机内容</button>
      </header>

      {message.length > 0 ? <p className="inline-status" role="status">{message}</p> : null}

      <section className="social-moment-composer glass-layer-card" aria-labelledby="moment-composer-title">
        <div>
          <p className="eyebrow">PRIVATE NOTE / THIS DEVICE</p>
          <h2 id="moment-composer-title">记录一张照片，写下你的感悟</h2>
          <p className="muted">图片文件保存在本机浏览器的图片库；清理浏览器站点数据或换设备后，图片不会自动迁移。</p>
        </div>
        <form onSubmit={(event) => void saveMoment(event)}>
          <label htmlFor="local-moment-title">标题</label>
          <input id="local-moment-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：今天的读书感悟" />
          <label htmlFor="local-moment-reflection">我的感悟 / 想写的话</label>
          <textarea id="local-moment-reflection" value={reflection} onChange={(event) => setReflection(event.target.value)} placeholder="把你此刻的感受写下来…" rows={5} />
          <label htmlFor="local-moment-tags">标签（选填，以逗号分隔）</label>
          <input id="local-moment-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="读书, 灵感, 日常" />
          <input ref={fileInputRef} id="local-moment-image" accept="image/*" capture="environment" multiple type="file" className="sr-only" onChange={addPhotos} />
          <div className="social-moment-composer__actions">
            <button className="quiet-button" type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>拍照或选择图片</button>
            <button className="create-button glow-button" type="submit" disabled={busy}>{busy ? '保存中…' : '保存到我的私密档案'}</button>
          </div>
          {drafts.length > 0 ? <ul className="social-draft-photo-list" aria-label="待保存图片">{drafts.map((draft) => <li key={draft.metadata.id}><img src={draft.previewUrl} alt="待保存的本机图片预览" /><span><strong>{draft.metadata.name}</strong><small>{Math.max(1, Math.ceil(draft.metadata.bytes / 1024))} KB</small></span><button className="quiet-button quiet-button-danger" type="button" onClick={() => removeDraft(draft.metadata.id)} disabled={busy}>移除</button></li>)}</ul> : null}
        </form>
      </section>

      <section className="social-moments-feed" aria-labelledby="moments-feed-title">
        <div className="section-heading"><div><p className="eyebrow">PRIVATE FEED / {records.length}</p><h2 id="moments-feed-title">我写下的内容</h2></div></div>
        {records.length === 0 ? <div className="social-state empty-state"><h3>还没有内容</h3><p>从上方拍一张照片，或写下一段感悟，它会立刻在这里显示。</p></div> : <div className="social-moments-grid">{records.map((record) => <article className="social-moment-card" key={record.id}><div className="social-moment-card__meta"><span>仅自己可见</span><time dateTime={record.occurredAt}>{formatMomentDate(record.occurredAt)}</time></div>{record.media.length > 0 ? <div className="social-moment-card__photos">{record.media.map((media) => { const source = mediaUrls.get(media.id); return source !== undefined ? <img key={media.id} src={source} alt={`${record.title} 的本机图片`} /> : <div className="social-moment-card__image-missing" key={media.id}>图片在这台设备上不可用<br /><small>{media.name}</small></div>; })}</div> : null}<h3>{record.title}</h3>{record.body.length > 0 ? <p className="social-moment-card__body">{record.body}</p> : <p className="muted">这是一条仅含图片的记录。</p>}{record.tags.length > 0 ? <p className="social-moment-card__tags">{record.tags.map((tag) => <span key={tag}>#{tag}</span>)}</p> : null}<div className="social-moment-card__actions">{confirmDeleteId === record.id ? <><span className="muted">确定永久删除这条内容和本机图片？</span><button className="quiet-button quiet-button-danger" type="button" onClick={() => void deleteMoment(record)} disabled={busy}>确认删除</button><button className="quiet-button" type="button" onClick={() => setConfirmDeleteId(null)} disabled={busy}>取消</button></> : <button className="quiet-button quiet-button-danger" type="button" onClick={() => setConfirmDeleteId(record.id)} disabled={busy}>删除</button>}</div></article>)}</div>}
      </section>

      <section className="social-local-boundary glass-layer-card">
        <p className="eyebrow">EXTERNAL ACCOUNTS / NOT USED</p>
        <h2>外部社交平台暂不接入</h2>
        <p className="muted">X、抖音及其他第三方账号需要各自的正式授权与服务端配置。当前离线版不会读取账号、Cookie、私信或网页内容，也不会把你的照片和文字上传给它们。</p>
      </section>
    </main>
  );
}
