/** BetterOPC public snapshot: normalization and side-effect-free card templates. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

/** Allow HTTP(S) sources and same-origin absolute asset paths only. */
export function safeUrl(value) {
  const url = String(value ?? '').trim();
  if (!url || /[\u0000-\u001f\u007f\\]/.test(url)) return '';
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch { return ''; }
}

const asArray = value => Array.isArray(value) ? value : [];
const strings = values => [...new Set(asArray(values).map(value => String(value?.label ?? value ?? '').trim()).filter(Boolean))];
const readableText = value => Array.isArray(value) ? value.map(readableText).filter(Boolean).join('；') : value && typeof value === 'object' ? readableText(value.text || value.label || value.title || value.description || '') : String(value ?? '').trim();
const dateOnly = value => /^\d{4}-\d{2}-\d{2}/.test(String(value ?? '')) ? String(value).slice(0, 10) : '';
const coordinate = (value, limit) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= limit ? Number(value) : null;
const conflictingOPCMeaning = value => /OPC\s*[（(][^）)]*(?:开放平台通信|开放过程控制|Open Platform for Commerce|Open Platform Communication)/i.test(String(value || ''));

function activityDate(item) {
  const start = dateOnly(item.startsAt || item.startDate);
  const end = dateOnly(item.endsAt || item.endDate);
  if (start && end) return `${start} 至 ${end}`;
  if (start) return `${start} 起，截止日期未公布`;
  if (end) return `截至 ${end}，开始日期未公布`;
  return '未公布统一起止时间，请查看官方规则';
}

function policyCategory(item) {
  const title = String(item.title ?? '');
  if (/住房|人才|安居|公寓/.test(title)) return '人才安居';
  if (/算力|Token|模型券|算力券/i.test(title)) return '算力支持';
  if (/补贴|补助|奖励|融资|基金|资金/.test(title)) return '资金补贴';
  if (/工位|空间|租金|场地|园区建设/.test(title)) return '空间支持';
  if (/政策|措施|行动|方案|举措|扶持|支持/.test(title)) return '综合扶持';
  return '行业动态';
}

export function normalizeContent(raw = {}) {
  const communities = asArray(raw.communities).map((item, index) => {
    const details = item.details || {};
    const profile = details.profile || {};
    const coords = profile.coordinates || {};
    const rating = profile.sourceRating;
    return {
      ...item,
      id: String(item.id || `community-${index + 1}`),
      name: String(item.name || '未命名社区'),
      city: String(item.city || profile.sourceCity || '城市待补'),
      district: String(item.district || ''),
      image: safeUrl(item.localImage || item.coverLocalUrl || item.image || item.coverUrl),
      imageCredit: String(item.coverCredit || '图片来源：BetterOPC / 原资料方'),
      summary: String(item.summary || profile.description || '社区介绍待补充，可查看来源了解详细信息。'),
      tags: strings([...asArray(details.resources), ...asArray(profile.focusTracks), ...asArray(item.tags)]),
      sourceUrl: safeUrl(asArray(item.sources).find(source => safeUrl(source.url))?.url || profile.website || item.referenceUrl),
      referenceUrl: safeUrl(item.referenceUrl || `https://betteropc.com/opc-communities?selected=${encodeURIComponent(item.id || '')}`),
      address: String(item.address || ''),
      operator: String(profile.operator || ''),
      fee: String(details.feeText || '费用信息待核实'),
      admission: String(details.admissionText || '入驻条件请向运营方了解'),
      lng: coordinate(item.lng ?? coords.longitude, 180),
      lat: coordinate(item.lat ?? coords.latitude, 90),
      board: ['red', 'black'].includes(item.board) ? item.board : '',
      sourceRank: asArray(raw.rankings?.[item.board]).includes(item.id) ? asArray(raw.rankings[item.board]).indexOf(item.id) + 1 : null,
      reason: String(item.reason || ''),
      sourceRating: rating !== null && rating !== undefined && rating !== '' && Number.isFinite(Number(rating)) ? Number(rating) : null,
      sourceDate: dateOnly(item.snapshotDate || raw.meta?.snapshotDate),
      sourceNotice: String(item.sourceNotice || 'BetterOPC 公开页面快照；评价为来源平台观点。'),
    };
  });

  const policyRows = Array.isArray(raw.policies) ? raw.policies : asArray(raw.policies?.cities).flatMap(city => asArray(city.items).map(item => ({ ...item, city: item.city || city.name })));
  const seenPolicyIds = new Set();
  const policies = policyRows.filter(item => {
    const key = String(item.id || item.href || `${item.city}:${item.title}`);
    if (seenPolicyIds.has(key)) return false;
    seenPolicyIds.add(key);
    return true;
  }).map((item, index) => ({
    ...item,
    id: String(item.id || `policy-${index + 1}`),
    title: String(item.title || '政策信息'),
    sourceSummary: String(item.sourceSummary || item.summary || ''),
    summary: conflictingOPCMeaning(item.summary) ? '来源摘要中的 OPC 释义与“一人公司”主题存在冲突，暂不展示该摘要。请查看来源核实政策内容与适用对象。' : String(item.summary || '请查看来源了解政策详情。'),
    contentNotice: conflictingOPCMeaning(item.summary) ? '来源摘要存在术语歧义，政策内容尚待核实。' : String(item.contentNotice || ''),
    city: String(item.city || '全国'),
    category: String(item.category || 'industry'),
    categoryLabel: /[\u3400-\u9fff]/.test(String(item.categoryLabel || '')) ? String(item.categoryLabel) : policyCategory(item),
    tags: strings(item.tags),
    date: dateOnly(item.publishedAt || item.date),
    sourceDate: dateOnly(item.snapshotDate || raw.meta?.snapshotDate),
    sourceName: String(item.sourceName || 'BetterOPC'),
    url: safeUrl(item.officialUrl) || safeUrl(item.url) || safeUrl(item.href),
    referenceUrl: safeUrl(item.href || item.referenceUrl),
    urlLabel: '查看来源资料',
    statusNote: String(item.statusNote || '来源平台政策摘要；有效期与申报条件以原文为准。'),
  })).sort((a, b) => b.date.localeCompare(a.date, 'en'));

  const activities = asArray(raw.activities).filter(item => item.enabled !== false).map((item, index) => ({
    ...item,
    id: String(item.id || `activity-${index + 1}`),
    title: String(item.title || '创业活动'),
    summary: String(item.summary || '请查看官方页面了解活动详情。'),
    city: String(item.city || '全国'),
    image: safeUrl(item.localImage || item.coverLocalUrl || item.image || item.coverImage),
    imageAlt: String(item.coverAlt || item.title || '活动封面'),
    date: activityDate(item),
    startDate: dateOnly(item.startsAt || item.startDate),
    endDate: dateOnly(item.endsAt || item.endDate),
    publishedDate: dateOnly(item.publishedAt),
    sourceDate: dateOnly(item.officialVerifiedAt || item.snapshotDate || raw.meta?.snapshotDate),
    eligibility: readableText(item.eligibility),
    officialHighlights: strings(item.officialHighlights),
    providerLogo: /\$undefined|\$null/.test(String(item.providerLogo || '')) ? '' : safeUrl(item.providerLogo),
    url: safeUrl(item.officialUrl || item.url),
    secondaryUrl: safeUrl(item.secondaryUrl),
    sourceName: String(item.provider || item.sourceLabel || '官方活动'),
    tags: strings(item.tags),
    benefits: asArray(item.benefits),
  })).sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));

  const rankings = {
    ...(raw.rankings || {}),
    red: asArray(raw.rankings?.red).filter(id => communities.some(item => item.id === id)),
    black: asArray(raw.rankings?.black).filter(id => communities.some(item => item.id === id)),
    sourceUrl: safeUrl(raw.rankings?.sourceUrl || 'https://betteropc.com/opc-communities/rankings'),
    notice: String(raw.rankings?.notice || '榜单为 BetterOPC 的公开快照，评价为来源平台观点。'),
  };
  return {
    meta: { ...(raw.meta || {}), policyMetrics: raw.policies?.metrics || null, loadedCommunityCount: communities.length, loadedPolicyCount: policies.length, loadedActivityCount: activities.length },
    communities, activities, policies, rankings,
  };
}

export async function loadContent() {
  const response = await fetch('/local-apps/chaoshan-atlas/data/opc-reference.json');
  if (!response.ok) throw new Error(`社区资料加载失败（HTTP ${response.status}）`);
  return normalizeContent(await response.json());
}

const arrow = '<svg class="opc-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
const bookmark = '<svg class="opc-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M6 4h12v17l-6-4-6 4z"/></svg>';
const pin = '<svg class="opc-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>';

function tagsHtml(tags, limit = 3) {
  return strings(tags).slice(0, limit).map(tag => `<span class="opc-tag">${esc(tag)}</span>`).join('');
}

function imageHtml(src, alt) {
  const url = safeUrl(src);
  return url ? `<img class="opc-card-image" src="${esc(url)}" alt="${esc(alt)}" width="640" height="400" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '<div class="opc-image-placeholder" role="img" aria-label="暂无图片"><span>OPC · 社区空间</span></div>';
}

export function communityCard(item, { saved = false, rank = null } = {}) {
  const ranked = rank !== null && Number.isFinite(Number(rank));
  const boardLabel = item.board === 'red' ? '来源红榜' : item.board === 'black' ? '来源观察榜' : '社区资料';
  return `<article class="opc-card opc-community-card${ranked ? ' opc-ranked-card' : ''}" data-community-card="${esc(item.id)}">
    <div class="opc-card-media">
      ${imageHtml(item.image, `${item.name} · 社区环境`)}
      <span class="opc-city-pill">${pin}${esc(item.city)}</span>
      ${ranked ? `<span class="opc-rank-number" aria-label="来源榜单第 ${esc(rank)} 名">${esc(String(rank).padStart(2, '0'))}</span>` : ''}
      <button type="button" class="opc-save-button${saved ? ' is-saved' : ''}" data-save="${esc(item.id)}" aria-label="${saved ? '取消收藏' : '收藏'}${esc(item.name)}" aria-pressed="${saved}">${bookmark}</button>
    </div>
    <div class="opc-card-body">
      <div class="opc-card-eyebrow"><span>${esc(item.district || item.city)}</span><span class="opc-board-tag opc-board-${esc(item.board || 'neutral')}">${boardLabel}</span></div>
      <h3 class="opc-card-title">${esc(item.name)}</h3>
      <p class="opc-card-summary">${esc(item.summary)}</p>
      <div class="opc-card-tags">${tagsHtml(item.tags)}</div>
      <div class="opc-card-footer"><span class="opc-card-source">${item.sourceRating !== null && item.sourceRating !== undefined ? `来源评分 ${esc(item.sourceRating)}` : 'BetterOPC 快照'}</span><button type="button" class="opc-card-action" data-community="${esc(item.id)}">了解社区 ${arrow}</button></div>
    </div>
  </article>`;
}

export function policyCard(item) {
  return `<article class="opc-card opc-policy-card" data-policy-card="${esc(item.id)}">
    <div class="opc-policy-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7"/></svg></div>
    <div class="opc-card-body">
      <div class="opc-card-eyebrow"><span class="opc-policy-city">${pin}${esc(item.city)}</span><span class="opc-category-tag">${esc(item.categoryLabel || '政策信息')}</span>${item.date ? `<time datetime="${esc(item.date)}">${esc(item.date.replaceAll('-', '.'))}</time>` : ''}</div>
      <h3 class="opc-card-title">${esc(item.title)}</h3>
      <p class="opc-card-summary">${esc(item.summary)}</p>
      <div class="opc-card-footer"><span class="opc-card-source" title="${esc(item.sourceName)}">${esc(item.sourceName)}</span><button type="button" class="opc-card-action" data-policy="${esc(item.id)}">查看详情 ${arrow}</button></div>
    </div>
  </article>`;
}

export function activityCard(item) {
  const dateLabel = item.date || activityDate(item);
  return `<article class="opc-card opc-activity-card" data-activity-card="${esc(item.id)}">
    <div class="opc-card-media">${imageHtml(item.image, item.imageAlt || item.title)}<span class="opc-city-pill">${esc(item.sourceName || '官方活动')}</span></div>
    <div class="opc-card-body">
      <div class="opc-card-eyebrow"><span>${esc(item.city || '全国')}可关注</span><span>${esc(dateLabel)}</span></div>
      <h3 class="opc-card-title">${esc(item.title)}</h3>
      <p class="opc-card-summary">${esc(item.summary)}</p>
      <div class="opc-card-tags">${tagsHtml(item.tags)}</div>
      <div class="opc-card-footer"><span class="opc-card-source">官方活动 · 来源快照</span><button type="button" class="opc-card-action" data-activity="${esc(item.id)}">了解权益 ${arrow}</button></div>
    </div>
  </article>`;
}
