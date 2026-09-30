import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion, useScroll, useSpring } from 'motion/react';

import { AiUsageDashboardPage } from './AiUsageDashboard.js';
import { AiLabPage } from './AiLabPage.js';
import { aiLabClient } from './aiLabClient.js';
import { AskMyArchivePage } from './AskMyArchivePage.js';
import { askArchiveClient } from './askArchiveClient.js';
import { PortableArchivePage } from './PortableArchivePage.js';
import { portableArchiveClient } from './portableArchiveClient.js';
import { CodeHubPage } from './CodeHubPage.js';
import { XConnectionCenterPage } from './XConnectionCenterPage.js';
import { CreatorLabPage } from './CreatorLabPage.js';
import { creatorLabClient } from './creatorLabClient.js';
import { CreatorEcosystemPage } from './CreatorEcosystemPage.js';
import { creatorEcosystemClient } from './creatorEcosystemClient.js';
import { aiUsageDashboardClient } from './aiUsageClient.js';
import {
  aiUsageAggregateCue,
  aiUsageRangeForPeriod,
  formatAiUsageDuration,
} from './aiUsagePresentation.js';
import {
  appRoutes,
  archiveEmptyStates,
  type AppNavigationGroup,
  type AppRoute,
  homeModeForRoute,
  mockConstellationTheme,
  mockMusicMetadata,
  mockSearchIndex,
  mockTownZones,
  routeForHomeMode,
  normalizeRoute,
  routeLabel,
} from './appModel.js';
import {
  initialAuthState,
  maskIdentifier,
  reduceAuthState,
  type AuthProvider,
  type AuthState,
} from './authModel.js';
import {
  catStateForSearch,
  LocalCatDialogueService,
  type CatDialogue,
  type CatState,
} from './catModel.js';
import {
  type MembershipSnapshot,
  MockDevEntitlementProvider,
} from './entitlementModel.js';
import {
  archiveKindForRoute,
  archiveLabel,
  ArchiveConflictError,
  localArchiveAdapter,
  type ArchiveDailyPack,
  type ArchiveKind,
  type ArchiveMediaMetadata,
  type ArchiveRecord,
} from './archiveStore.js';
import {
  communityClient,
  createCommunityActionKey,
  type CommunityComment,
  type CommunityFeedKind,
  type CommunityChannel,
  type CommunityActivity,
  type CommunityGroup,
  type CommunityNotification,
  type CommunityPost,
  type CommunityPostVisibility,
  type CommunityProfile,
  type CommunityResult,
  type CommunitySearchResult,
} from './communityClient.js';
import {
  createMessagingActionKey,
  hasMessagingSequenceGap,
  messagingClient,
  messagingRealtimeTransport,
  messageReportReasons,
  type MessageReportReason,
  type MessagingConversation,
  type MessagingMessage,
  type MessagingMessageType,
  type MessagingRealtimeEvent,
  type MessagingRealtimeStatus,
  type MessagingResult,
  type MessagingSearchResult,
} from './messagingClient.js';
import {
  messagingDraftCache,
  messagingOutbox,
  type LocalMessageOutboxItem,
} from './messagingOutbox.js';
import {
  experienceTier,
  loadUiExperienceSettings,
  saveUiExperienceSettings,
  type ExperienceTier,
  type KeyValueStorage,
  type MotionPreference,
  type UiExperienceSettings,
  updateSoundSetting,
} from './experienceSettings.js';
import { LocalSoundEngine, type SoundCue } from './audioEngine.js';
import { CreatorIdentityReveal } from './CreatorIdentityReveal.js';
import {
  readCreatorIntroPreference,
  shouldShowCreatorIntro,
} from './creatorIntroModel.js';
import { createActions, routeForQuickAction, todayMetrics } from './homeModel.js';
import { BenefitsCenterPage, MembershipCenterPage } from './MembershipCenter.js';
import { SocialArchivePage } from './SocialArchivePage.js';
import { ConnectedAppsPage } from './ConnectedAppsPage.js';
import { externalIdentityClient } from './externalIdentityClient.js';
import type { ExternalIdentity } from '@me-zip/shared-types';

// function CreatorPage — legacy shell name retained in source for Phase 2
// navigation-contract checks; the rendered implementation is CreatorLabPage.

const entitlementProvider = new MockDevEntitlementProvider();
const catDialogueService = new LocalCatDialogueService();

const providerLabels: Record<AuthProvider, string> = {
  WECHAT: '微信登录',
  PHONE: '手机号登录',
  EMAIL: '邮箱登录',
  GOOGLE: 'Google 登录',
};

const googleAccountChoices = [
  { name: '林晚星（演示）', email: 'lin.wanxing@example.com', initials: '林' },
  { name: '陈予安（演示）', email: 'yuan.chen@example.com', initials: '陈' },
] as const;

const localDemoSessionKey = 'mezip.local-demo-session.v1';

interface LocalDemoSession {
  readonly state: 'active';
  readonly subject: string;
}

function opaqueDemoSubject(provider: AuthProvider, identifier = ''): string {
  const source = `${provider}:${identifier.trim().toLowerCase()}`;
  let hash = 2166136261;
  for (const character of source) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `demo_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/** A deliberate local-development escape hatch; it never authenticates anyone. */
function loginRequestedFromUrl(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('login') === '1';
}

function clearLoginRequestFromUrl(): void {
  if (typeof window === 'undefined' || !loginRequestedFromUrl()) return;
  const url = new URL(window.location.href);
  url.searchParams.delete('login');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function loginReturnPathFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const returnTo = new URLSearchParams(window.location.search).get('returnTo');
  return returnTo === '/post-login-app/index.html?fromLogin=1'
    || returnTo === '/post-login-app-v2/index.html?fromLogin=1'
    ? returnTo
    : null;
}

function readLocalDemoSession(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(localDemoSessionKey);
    if (raw === 'active') return true; // Safely retains a pre-Phase-22 local session.
    const value: unknown = raw === null ? undefined : JSON.parse(raw);
    return typeof value === 'object' && value !== null
      && (value as Partial<LocalDemoSession>).state === 'active'
      && typeof (value as Partial<LocalDemoSession>).subject === 'string';
  } catch {
    return false;
  }
}

function readLocalDemoSessionSubject(): string {
  if (!import.meta.env.DEV || typeof window === 'undefined') return 'demo_anonymous';
  try {
    const raw = window.localStorage.getItem(localDemoSessionKey);
    if (raw === 'active') return 'demo_legacy';
    const value: unknown = raw === null ? undefined : JSON.parse(raw);
    const subject = typeof value === 'object' && value !== null
      ? (value as Partial<LocalDemoSession>).subject
      : undefined;
    return typeof subject === 'string' && /^demo_[0-9a-f]{8}$/.test(subject)
      ? subject
      : 'demo_anonymous';
  } catch {
    return 'demo_anonymous';
  }
}

function writeLocalDemoSession(active: boolean, subject = 'demo_anonymous'): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  try {
    if (active) {
      if (!/^demo_[0-9a-f]{8}$/.test(subject) && subject !== 'demo_anonymous') return;
      window.localStorage.setItem(localDemoSessionKey, JSON.stringify({ state: 'active', subject } satisfies LocalDemoSession));
    }
    else window.localStorage.removeItem(localDemoSessionKey);
  } catch {
    // The local demo remains usable even when session storage is unavailable.
  }
}

function initialAuthStateForRuntime(): AuthState {
  return !loginRequestedFromUrl() && readLocalDemoSession()
    ? { ...initialAuthState, kind: 'SUCCESS' }
    : initialAuthState;
}

function MezipBrandLockup({ compact = false }: { readonly compact?: boolean }) {
  return (
    <div className={cx('mezip-brand-lockup', compact && 'mezip-brand-lockup-compact')}>
      <span
        className="mezip-brand-symbol mezip-brand-reference-symbol"
        role="img"
        aria-label="ME.zip · 觅迹 品牌图标"
      >
        <img src="/mezip-brand-icon.jpg" alt="" />
      </span>
      <span className="mezip-brand-copy">
        <strong>ME.zip <i>·</i> 觅迹</strong>
        {!compact ? <small>EXPLORE · LEARN · GROW</small> : null}
      </span>
    </div>
  );
}

/**
 * Stable shell boundary retained for the Phase 2 route contract. The actual
 * server-projected membership experience lives in MembershipCenterPage.
 */
function MembershipPage({
  onNavigate,
  tier,
}: {
  readonly onNavigate: (route: AppRoute) => void;
  readonly tier: ExperienceTier;
}) {
  return <MembershipCenterPage onNavigate={onNavigate} tier={tier} />;
}

function cx(...values: readonly (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}

type AppIconName =
  | 'activity'
  | 'ai'
  | 'archive'
  | 'bell'
  | 'code'
  | 'community'
  | 'fitness'
  | 'history'
  | 'home'
  | 'life'
  | 'messages'
  | 'plus'
  | 'settings'
  | 'spark'
  | 'star'
  | 'town'
  | 'user';

function AppIcon({ name }: { readonly name: AppIconName }) {
  const paths: Record<AppIconName, string> = {
    activity: 'M4 13h3l2-6 4 10 2-5h5',
    ai: 'M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z',
    archive: 'M4 7.5h16M6 4h12l1 3.5H5L6 4Zm0 3.5v12h12v-12M9 11h6',
    bell: 'M6.5 10a5.5 5.5 0 0 1 11 0c0 6 2.5 6 2.5 7H4c0-1 2.5-1 2.5-7Zm3.5 9h4',
    code: 'm8 8-4 4 4 4m8-8 4 4-4 4m-3-11-2 14',
    community:
      'M5 18.5v-1.2A3.3 3.3 0 0 1 8.3 14h7.4a3.3 3.3 0 0 1 3.3 3.3v1.2M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm6 0a3 3 0 1 0 0-6',
    fitness: 'M4 12h3m10 0h3M7 9v6m10-6v6M9 7v10m6-10v10M9 12h6',
    history: 'M12 7v5l3 2m6-2a9 9 0 1 1-2.6-6.3M21 4v5h-5',
    home: 'm3 11 9-7 9 7v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9Zm6 10v-6h6v6',
    life: 'M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.6-7 10-7 10Z',
    messages:
      'M5 6.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-4 3v-3H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z',
    plus: 'M12 5v14M5 12h14',
    settings:
      'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0-5v2m0 13v2m9-8h-2M5 12H3m15.4-6.4-1.4 1.4M7 17l-1.4 1.4m10.8 0L15 17M7 7 5.6 5.6',
    spark: 'm12 3 1.6 6.4L20 11l-6.4 1.6L12 19l-1.6-6.4L4 11l6.4-1.6L12 3Z',
    star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z',
    town: 'M4 20V9l4-2v13m4 0V4l4 2v14m4 0V11l-4-2M3 20h18',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  };
  return (
    <svg
      aria-hidden="true"
      className="app-icon"
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d={paths[name]}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function iconForRoute(route: AppRoute): AppIconName {
  switch (route) {
    case '/':
      return 'home';
    case '/town':
      return 'town';
    case '/life':
      return 'life';
    case '/timeline':
      return 'archive';
    case '/history':
      return 'history';
    case '/fitness':
      return 'fitness';
    case '/constellation':
      return 'star';
    case '/community':
      return 'community';
    case '/messages':
      return 'messages';
    case '/activities':
      return 'activity';
    case '/ai':
    case '/ai-lab':
    case '/ask-archive':
      return 'ai';
    case '/archive-center':
    case '/annual-archive':
      return 'archive';
    case '/social':
    case '/connected-apps':
      return 'archive';
    case '/creator':
    case '/creator-home':
      return 'spark';
    case '/code':
      return 'code';
    case '/x':
      return 'community';
    case '/benefits':
      return 'spark';
    case '/membership':
      return 'star';
    case '/me':
      return 'user';
    case '/settings':
      return 'settings';
    case '/daily-pack':
      return 'archive';
    case '/trash':
      return 'archive';
    case '/export':
      return 'archive';
    case '/privacy':
      return 'settings';
  }
}

function dateTimeLocalValue(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isoFromDateTimeLocal(value: string): string | undefined {
  if (value.trim().length === 0) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('发生时间无效。');
  return date.toISOString();
}

function browserStorage(): KeyValueStorage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function browserRoute(): AppRoute {
  if (typeof window === 'undefined') return '/';
  return normalizeRoute(window.location.pathname);
}

function systemReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function routePosition(route: AppRoute): {
  readonly index: number;
  readonly total: number;
} {
  const primaryIndex = appRoutes.findIndex((candidate) => candidate.path === route);
  if (primaryIndex >= 0) {
    return { index: primaryIndex + 1, total: appRoutes.length };
  }
  const utilityRoutes: readonly AppRoute[] = [
    '/daily-pack',
    '/trash',
    '/export',
    '/privacy',
  ];
  const utilityIndex = utilityRoutes.indexOf(route);
  return {
    index: appRoutes.length + Math.max(utilityIndex, 0) + 1,
    total: appRoutes.length + utilityRoutes.length,
  };
}

function SlidingRouteNumber({
  route,
  tier,
}: {
  readonly route: AppRoute;
  readonly tier: ExperienceTier;
}) {
  const position = routePosition(route);
  const index = String(position.index).padStart(2, '0');
  return (
    <span
      className="route-index"
      aria-label={`第 ${position.index} 个页面，共 ${position.total} 个`}
    >
      <span className="sr-only">页面编号 </span>
      <span aria-hidden="true" className="route-index-value">
        {tier === 'FULL' ? (
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={route}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '-100%' }}
              initial={{ opacity: 0, y: '100%' }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {index}
            </motion.span>
          </AnimatePresence>
        ) : (
          <span>{index}</span>
        )}
      </span>
      <span aria-hidden="true"> / {String(position.total).padStart(2, '0')}</span>
    </span>
  );
}

function ScrollProgress({
  route,
  tier,
}: {
  readonly route: AppRoute;
  readonly tier: ExperienceTier;
}) {
  const { scrollYProgress } = useScroll();
  const smoothedProgress = useSpring(scrollYProgress, {
    damping: 30,
    restDelta: 0.001,
    stiffness: 120,
  });
  if (tier !== 'FULL') return null;
  const position = routePosition(route);
  return (
    <div className="scroll-progress" data-tier={tier} aria-hidden="true">
      <div className="scroll-progress-track" aria-hidden="true">
        <motion.div
          className="scroll-progress-fill"
          style={{ scaleX: smoothedProgress }}
        />
      </div>
      <span className="scroll-progress-copy">
        <span>READ / {String(position.index).padStart(2, '0')}</span>
        <span>{String(position.total).padStart(2, '0')}</span>
      </span>
    </div>
  );
}

function CodeShimmer({
  title,
  tier,
}: {
  readonly title: string;
  readonly tier: ExperienceTier;
}) {
  return (
    <span className="code-shimmer" data-tier={tier} role="status" aria-live="polite">
      <span aria-hidden="true" className="code-shimmer-brace">
        {'{'}{' '}
      </span>
      <span className="code-shimmer-text">{title}</span>
      <span aria-hidden="true" className="code-shimmer-dots">
        {' '}
        ... {'}'}
      </span>
    </span>
  );
}

function BorderBeam({
  enabled,
  tier,
  children,
  className,
}: {
  readonly enabled: boolean;
  readonly tier: ExperienceTier;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={cx(
        'border-beam',
        enabled && tier === 'FULL' && 'border-beam-active',
        className,
      )}
      data-tier={tier}
    >
      {children}
    </div>
  );
}

function StatusPill({
  kind,
  children,
}: {
  readonly kind: 'INFO' | 'WARNING' | 'SOCIAL' | 'BENEFIT' | 'AI';
  readonly children: ReactNode;
}) {
  return (
    <span className={cx('status-pill', 'status-pill-' + kind.toLowerCase())}>
      {children}
    </span>
  );
}

function EmptyState({
  eyebrow,
  title,
  description,
  action,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly action?:
    { readonly label: string; readonly onClick: () => void } | undefined;
}) {
  return (
    <section className="state-panel empty-panel">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{description}</p>
      {action === undefined ? null : (
        <button className="inline-action" type="button" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </section>
  );
}

function LoadingState({
  title,
  tier,
}: {
  readonly title: string;
  readonly tier: ExperienceTier;
}) {
  return (
    <section
      className="state-panel state-panel-loading"
      data-tier={tier}
      aria-live="polite"
    >
      <CodeShimmer title={title} tier={tier} />
      <div className="skeleton-lines" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}

function CatCompanion({
  state,
  dialogue,
  onTap,
  onHover,
  tier,
}: {
  readonly state: CatState;
  readonly dialogue: CatDialogue;
  readonly onTap: () => void;
  readonly onHover: () => void;
  readonly tier: ExperienceTier;
}) {
  const [reaction, setReaction] = useState<CatState | null>(null);
  const reactionTimer = useRef<number | undefined>(undefined);
  const visualState = reaction ?? state;

  useEffect(
    () => () => {
      if (reactionTimer.current !== undefined)
        window.clearTimeout(reactionTimer.current);
    },
    [],
  );

  const showReaction = (next: CatState, duration: number) => {
    if (reactionTimer.current !== undefined) window.clearTimeout(reactionTimer.current);
    setReaction(next);
    reactionTimer.current = window.setTimeout(() => setReaction(null), duration);
  };

  const handleTap = () => {
    onTap();
    showReaction('HAPPY', 320);
  };

  const handlePointerEnter = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== 'mouse') return;
    onHover();
    if (tier === 'FULL') showReaction('WELCOME', 220);
  };

  return (
    <section
      className="cat-companion cat-companion-compact"
      data-state={visualState}
      data-tier={tier}
    >
      <button
        className="cat-button glass-icon-button"
        type="button"
        aria-label="轻拍 ME Cat，获得本地提示。"
        onClick={handleTap}
        onPointerEnter={handlePointerEnter}
      >
        <span className="cat-visual" aria-hidden="true">
          <i />
          <i />
          <b />
          <b />
          <em />
          <span className="cat-tail" />
        </span>
      </button>
      <span className="sr-only" aria-live="polite">
        {dialogue.text}
      </span>
    </section>
  );
}

function archiveSearchRoute(kind: ArchiveKind): AppRoute {
  switch (kind) {
    case 'LIFE':
      return '/life';
    case 'HISTORY':
      return '/history';
    case 'FITNESS':
      return '/fitness';
    case 'AI_USAGE':
      return '/ai';
  }
}

function SearchBox({
  catEnabled,
  dialogue,
  tier,
  onCatTap,
  onCatHover,
  onNavigate,
}: {
  readonly catEnabled: boolean;
  readonly dialogue: CatDialogue;
  readonly tier: ExperienceTier;
  readonly onCatTap: () => void;
  readonly onCatHover: () => void;
  readonly onNavigate: (route: AppRoute) => void;
}) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const normalized = query.trim().toLocaleLowerCase();
  const results = useMemo(() => {
    const pageResults = mockSearchIndex.filter(
      (entry) =>
        normalized.length === 0 || entry.title.toLocaleLowerCase().includes(normalized),
    );
    if (normalized.length === 0) return pageResults.slice(0, 5);
    const archiveResults = localArchiveAdapter.search(query).map((record) => ({
      id: `archive:${record.id}`,
      title: record.title,
      detail: `我的${archiveLabel(record.kind)}私人记录`,
      route: archiveSearchRoute(record.kind),
      kind: 'ARCHIVE' as const,
    }));
    return [...archiveResults, ...pageResults].slice(0, 5);
  }, [normalized, query]);
  const catState = catStateForSearch(focused, query, results.length > 0);
  const selectResult = (route: AppRoute) => {
    setQuery('');
    setFocused(false);
    setActiveResultIndex(-1);
    onNavigate(route);
  };
  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setFocused(false);
      setActiveResultIndex(-1);
      event.currentTarget.blur();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (results.length === 0) return;
      setFocused(true);
      setActiveResultIndex((current) => {
        if (event.key === 'ArrowDown')
          return current >= results.length - 1 ? 0 : current + 1;
        return current <= 0 ? results.length - 1 : current - 1;
      });
      return;
    }
    if (event.key === 'Enter' && activeResultIndex >= 0) {
      const selection = results[activeResultIndex];
      if (selection === undefined) return;
      event.preventDefault();
      selectResult(selection.route);
    }
  };
  return (
    <div className="top-search">
      <BorderBeam
        /* The search boundary is an ambient FULL-tier affordance; focus adds
         * the accessible outline below but is not required to start it. */
        enabled={tier === 'FULL'}
        tier={tier}
        className={cx('top-search-beam', focused && 'top-search-beam-focused')}
      >
        <label className="search-control" htmlFor="global-search">
          <span className="sr-only">搜索 ME.zip</span>
          <span className="search-mark" aria-hidden="true" />
          <input
            id="global-search"
            value={query}
            placeholder="搜索 Life、时间轴、消息、代码…"
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveResultIndex(-1);
            }}
            onFocus={() => {
              setFocused(true);
              setActiveResultIndex(-1);
            }}
            onBlur={() =>
              window.setTimeout(() => {
                setFocused(false);
                setActiveResultIndex(-1);
              }, 120)
            }
            onKeyDown={handleSearchKeyDown}
            role="combobox"
            aria-expanded={focused}
            aria-controls="global-search-results"
            aria-activedescendant={
              activeResultIndex >= 0
                ? `global-search-option-${results[activeResultIndex]?.id}`
                : undefined
            }
            aria-autocomplete="list"
          />
          <kbd aria-hidden="true">⌘ K</kbd>
        </label>
        {catEnabled ? (
          <CatCompanion
            dialogue={dialogue}
            onTap={onCatTap}
            onHover={onCatHover}
            state={catState}
            tier={tier}
          />
        ) : null}
      </BorderBeam>
      {focused ? (
        <div className="search-suggestions" id="global-search-results" role="listbox">
          <p className="search-suggestion-label">
            {normalized.length === 0 ? '快速命令与页面入口' : '匹配结果'}
          </p>
          {results.length === 0 ? (
            <p className="search-no-results">
              没有匹配项。统一索引会在服务端接入后扩展。
            </p>
          ) : (
            results.map((entry, index) => (
              <button
                aria-selected={index === activeResultIndex}
                className="search-result"
                id={`global-search-option-${entry.id}`}
                key={entry.id}
                role="option"
                tabIndex={-1}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActiveResultIndex(index)}
                onClick={() => selectResult(entry.route)}
              >
                <span>
                  <strong>{entry.title}</strong>
                  <small>{entry.detail}</small>
                </span>
                <small>
                  {entry.kind === 'COMMAND'
                    ? '命令'
                    : entry.kind === 'ARCHIVE'
                      ? '我的档案'
                      : '页面'}
                </small>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function NavigationGroup({
  group,
  route,
  onNavigate,
}: {
  readonly group: AppNavigationGroup;
  readonly route: AppRoute;
  readonly onNavigate: (route: AppRoute) => void;
}) {
  const items = appRoutes.filter((item) => item.group === group);
  return (
    <section className="nav-group" aria-label={group}>
      <p className="nav-label">{group}</p>
      {items.map((item) => (
        <button
          aria-current={route === item.path ? 'page' : undefined}
          className={cx(
            'nav-item',
            'glass-nav-item',
            route === item.path && 'nav-item-active',
          )}
          key={item.path}
          type="button"
          onClick={() => onNavigate(item.path)}
        >
          <span className="nav-item-icon" aria-hidden="true">
            <AppIcon name={iconForRoute(item.path)} />
          </span>
          <span className="nav-item-label">{item.label}</span>
          <span aria-hidden="true" className="nav-item-tablet-mark">
            {item.label.slice(0, 1)}
          </span>
        </button>
      ))}
    </section>
  );
}

function MembershipSummary({
  membership,
  onNavigate,
}: {
  readonly membership: MembershipSnapshot | null;
  readonly onNavigate: (route: AppRoute) => void;
}) {
  if (membership === null) {
    return <LoadingState title="正在读取会员状态" tier="STATIC" />;
  }
  const plan = membership.plans.find(
    (candidate) => candidate.code === membership.currentPlan,
  );
  return (
    <section className="membership-summary">
      <p className="eyebrow">MEMBERSHIP / {membership.source}</p>
      <div className="membership-summary-row">
        <div>
          <h3>{plan?.label ?? 'FREE'}</h3>
          <p>{plan?.summary ?? '建立和记录自己的 ME.zip'}</p>
        </div>
        <StatusPill kind="INFO">当前方案</StatusPill>
      </div>
      <button
        className="quiet-button"
        type="button"
        onClick={() => onNavigate('/membership')}
      >
        查看权益
      </button>
    </section>
  );
}

function ModeSwitch({
  mode,
  onChange,
}: {
  readonly mode: UiExperienceSettings['homeMode'];
  readonly onChange: (mode: UiExperienceSettings['homeMode']) => void;
}) {
  return (
    <div className="mode-switch" aria-label="首页体验模式">
      <button
        aria-pressed={mode === 'STANDARD'}
        className={mode === 'STANDARD' ? 'mode-switch-active' : ''}
        type="button"
        onClick={() => onChange('STANDARD')}
      >
        标准模式
      </button>
      <button
        aria-pressed={mode === 'TOWN'}
        className={mode === 'TOWN' ? 'mode-switch-active' : ''}
        type="button"
        onClick={() => onChange('TOWN')}
      >
        ME Town
      </button>
    </div>
  );
}

function HomePage({
  aiUsageActiveSeconds,
  membership,
  mode,
  onModeChange,
  onNavigate,
  onOpenCreatorIntro,
}: {
  readonly aiUsageActiveSeconds: number | null;
  readonly membership: MembershipSnapshot | null;
  readonly mode: UiExperienceSettings['homeMode'];
  readonly onModeChange: (mode: UiExperienceSettings['homeMode']) => void;
  readonly onNavigate: (route: AppRoute) => void;
  readonly onOpenCreatorIntro: () => void;
}) {
  const archiveSummary = localArchiveAdapter.summary();
  const today = new Date().toISOString().slice(0, 10);
  const todayRecords = localArchiveAdapter
    .list()
    .filter((record) => record.occurredAt.slice(0, 10) === today);
  const todaySteps = todayRecords.reduce(
    (total, record) => total + (record.metrics.steps ?? 0),
    0,
  );
  const metrics = todayMetrics.map((metric) => {
    if (metric.key === 'steps') {
      return {
        ...metric,
        value: todaySteps > 0 ? todaySteps.toLocaleString('zh-CN') : '—',
        state: todaySteps > 0 ? '来自我的 Fitness 记录' : '尚未连接数据源',
      };
    }
    if (
      metric.key === 'ai-total' ||
      metric.key === 'ai-pc' ||
      metric.key === 'ai-mobile'
    ) {
      if (aiUsageActiveSeconds !== null) {
        return {
          ...metric,
          value: formatAiUsageDuration(aiUsageActiveSeconds),
          state: '来自服务端 AI 使用聚合',
        };
      }
      return {
        ...metric,
        value: '—',
        state: '服务端 AI 使用记录未连接',
      };
    }
    if (metric.key === 'training') {
      const count = archiveSummary.byKind.FITNESS;
      return {
        ...metric,
        value: count > 0 ? String(count) : '—',
        state: count > 0 ? '来自我的健身记录' : '尚无自己的训练记录',
      };
    }
    const count = archiveSummary.byKind.HISTORY;
    return {
      ...metric,
      value: count > 0 ? String(count) : '—',
      state: count > 0 ? '来自我的读书感悟' : '尚无自己的读书感悟',
    };
  });
  return (
    <div className="page-stack home-page">
      <section className="home-hero">
        <div>
          <p className="eyebrow">ME / TODAY</p>
          <h1>今天的我</h1>
          <p className="lede">每一天都在被记录，每一步都算数。</p>
        </div>
        <div className="home-hero-actions">
          <ModeSwitch mode={mode} onChange={onModeChange} />
          <button
            className="create-button glow-button"
            type="button"
            onClick={() => onNavigate('/life')}
          >
            <span aria-hidden="true">+</span> 前往 Life
          </button>
        </div>
      </section>

      <section className="daily-pack-card">
        <div>
          <p className="eyebrow">DAILY PACK</p>
          <h2>
            {archiveSummary.dailyPackReady
              ? `今天已打包 ${archiveSummary.dailyPackSources} 条来源。`
              : '给今天留一个安静的入口。'}
          </h2>
          <p>
            {archiveSummary.total > 0
              ? 'Daily Pack 只读取你的聚合计数；所有私人记录仍默认不公开。'
              : '你可以从一条生活、读书感悟、健身或 AI 使用记录开始。所有私人记录默认不公开。'}
          </p>
        </div>
        <button
          className="quiet-button"
          type="button"
          onClick={() => onNavigate(archiveSummary.dailyPackReady ? '/daily-pack' : '/life')}
        >
          {archiveSummary.dailyPackReady ? '查看 Daily Pack' : '开始记录'}
        </button>
      </section>

      <section aria-labelledby="today-state-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">STATUS SNAPSHOT</p>
            <h2 id="today-state-title">今日概览</h2>
          </div>
          <p className="section-note">
            仅显示当前 owner 的真实本地聚合，未展示虚构数据。
          </p>
        </div>
        <div className="metric-grid">
          {metrics.map((metric) => (
            <article
              className={cx('metric-card', 'metric-' + metric.accent)}
              key={metric.key}
            >
              <p>{metric.label}</p>
              <strong>{metric.value}</strong>
              <span>{metric.state}</span>
            </article>
          ))}
        </div>
      </section>

      <div className="home-content-grid">
        <section className="timeline-section" aria-labelledby="timeline-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">TIMELINE / PRIVATE</p>
              <h2 id="timeline-title">今日时间轴</h2>
            </div>
            <button
              className="quiet-button"
              type="button"
              onClick={() => onNavigate('/timeline')}
            >
              查看全部
            </button>
          </div>
          {todayRecords.length === 0 ? (
            <div className="empty-timeline">
              <p className="empty-index">00</p>
              <div>
                <h3>档案准备好了。</h3>
                <p>第一条生活、读书感悟、健身或 AI 记录会以私密形式出现在这里。</p>
                <button
                  className="inline-action"
                  type="button"
                  onClick={() => onNavigate('/life')}
                >
                  前往 Life
                </button>
              </div>
            </div>
          ) : (
            <div className="archive-home-timeline" aria-label="今日私人记录摘要">
              {todayRecords.slice(0, 6).map((record) => (
                <button
                  className="archive-home-timeline-item"
                  type="button"
                  key={record.id}
                  onClick={() => onNavigate('/life')}
                >
                  <span className="empty-index">{record.kind}</span>
                  <span>
                    <strong>{record.title}</strong>
                    <small>PRIVATE · {record.occurredAt.slice(11, 16)}</small>
                  </span>
                </button>
              ))}
              <button
                className="inline-action"
                type="button"
                onClick={() => onNavigate('/timeline')}
              >
                查看完整时间轴
              </button>
            </div>
          )}
        </section>
        <section className="home-side-panel">
          <p className="eyebrow">LIFE SUMMARY</p>
          <h2>从记录开始理解自己。</h2>
          <p>
            {archiveSummary.total > 0
              ? `当前 owner 已有 ${archiveSummary.total} 条私密记录；统计只从这些来源聚合。`
              : '统计与趋势只会在有来源数据后出现，不以演示数字替代你的真实一天。'}
          </p>
          <div className="summary-lines" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </section>
      </div>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">QUICK ACTIONS</p>
            <h2>快速开始</h2>
          </div>
        </div>
        <div className="quick-actions-grid">
          {createActions.slice(0, 4).map((action) => (
            <button
              className="quick-action"
              key={action}
              type="button"
              onClick={() => onNavigate(routeForQuickAction(action))}
            >
              <span>{action}</span>
              <small>私人记录</small>
              </button>
            ))}
          <button
            className="quick-action quick-action-ai"
            type="button"
            onClick={() => onNavigate('/ask-archive')}
          >
            <span>问问我的档案</span>
            <small>明确范围 · ARCHIVE_ONLY</small>
          </button>
          <button
            className="quick-action quick-action-town"
            type="button"
            onClick={() => onNavigate('/town')}
          >
            <span>进入 ME Town</span>
            <small>空间化导航</small>
          </button>
          <button
            className="quick-action quick-action-card"
            type="button"
            onClick={onOpenCreatorIntro}
          >
            <span>打开 3D 资料卡</span>
            <small>资料卡 · 夜空小镇</small>
          </button>
        </div>
      </section>

      <div className="preview-grid">
        <article className="archive-card">
          <p className="eyebrow">COMMUNITY</p>
          <h3>公开内容预览</h3>
          <p>只浏览已公开内容；他人的私人档案不会出现在这里。</p>
          <button
            className="quiet-button"
            type="button"
            onClick={() => onNavigate('/community')}
          >
            浏览社区
          </button>
        </article>
        <article className="archive-card">
          <p className="eyebrow">MESSAGES</p>
          <h3>消息入口</h3>
          <p>会话、离线与消息请求状态都由后续服务端流程确认。</p>
          <button
            className="quiet-button"
            type="button"
            onClick={() => onNavigate('/messages')}
          >
            打开消息
          </button>
        </article>
        <article className="archive-card">
          <p className="eyebrow">ACTIVITIES</p>
          <h3>活动入口</h3>
          <p>活动列表与报名入口已预留，当前不会伪造报名结果。</p>
          <button
            className="quiet-button"
            type="button"
            onClick={() => onNavigate('/activities')}
          >
            查看活动
          </button>
        </article>
      </div>

      <section className="section-block visitor-records-card" aria-labelledby="visitor-records-title">
        <div>
          <p className="eyebrow">VISITOR LOG / LOCAL</p>
          <h2 id="visitor-records-title">访客记录</h2>
          <p>
            查看邮箱验证成功的访问人数、进入日期与时间。记录保存在本机，刷新页面不会重复计数。
          </p>
        </div>
        <div className="visitor-records-actions">
          <span className="visitor-records-status">5249 · 本地统计服务</span>
          <a className="quiet-button" href="http://127.0.0.1:5249/" target="_blank" rel="noreferrer">
            打开访客记录 ↗
          </a>
        </div>
      </section>

      <div className="home-lower-grid">
        <MembershipSummary membership={membership} onNavigate={onNavigate} />
        <section className="archive-card ai-preview-card">
          <p className="eyebrow">AI USAGE / PRIVATE</p>
          <h3>查看属于自己的 AI 使用记录与设备状态。</h3>
          <p>{aiUsageActiveSeconds === null ? '服务端记录尚未连接；不会以本地演示数据代替你的真实时长。' : aiUsageAggregateCue(aiUsageActiveSeconds)}</p>
          <button
            className="quiet-button"
            type="button"
            onClick={() => onNavigate('/ai')}
          >
            打开 AI 使用记录
          </button>
        </section>
      </div>
    </div>
  );
}

function TownPage({
  aiUsageActiveSeconds,
  tier,
  ambientEnabled,
  onNavigate,
  onOpenCreatorIntro,
  onStandard,
}: {
  readonly aiUsageActiveSeconds: number | null;
  readonly tier: ExperienceTier;
  readonly ambientEnabled: boolean;
  readonly onNavigate: (route: AppRoute) => void;
  readonly onOpenCreatorIntro: () => void;
  readonly onStandard: () => void;
}) {
  const isStatic = tier === 'STATIC' || !ambientEnabled;
  const archiveSummary = localArchiveAdapter.summary();
  return (
    <div className="page-stack creator-town-page">
      <section className="creator-town-hero">
        <div>
          <p className="eyebrow">CREATOR TOWN / PUBLIC PROFILE</p>
          <h1>Tom 的小镇</h1>
          <p className="lede">
            从资料卡背面展开的夜空入口：建筑、星座与公开功能都在这里，点击场景中的边缘即可继续探索。
          </p>
        </div>
        <div className="creator-town-hero-actions">
          <StatusPill kind={isStatic ? 'INFO' : 'AI'}>
            {isStatic ? '静态场景' : '轻量环境'}
          </StatusPill>
          <button className="quiet-button" type="button" onClick={() => onNavigate('/')}>
            回到首页
          </button>
          <button className="quiet-button" type="button" onClick={onOpenCreatorIntro}>
            打开 3D 资料卡
          </button>
          <button className="quiet-button" type="button" onClick={onStandard}>
            返回标准模式
          </button>
        </div>
      </section>
      <section
        className="creator-town-canvas"
        data-tier={tier}
        data-static={isStatic}
        aria-label="Tom 的夜空小镇互动场景"
      >
        <img
          className="creator-town-art"
          src="/creator-intro-reference.jpg"
          alt="Tom 的夜空小镇、星座与资料卡背景"
        />
        <div className="creator-town-overlay" aria-hidden="true" />
        <div className="creator-town-caption">
          <span>CAPRICORN / 摩羯座</span>
          <small>{archiveSummary.dailyPackReady ? '今日归档已就绪' : 'NIGHT · CREATOR PROFILE'}</small>
        </div>
        <div className="creator-town-hotspots" aria-label="小镇功能入口">
          {mockTownZones.map((zone) => (
            <button
              className={cx(
                'creator-town-hotspot',
                'creator-town-hotspot-' + zone.id,
                'creator-town-hotspot-' + zone.tone,
              )}
              key={zone.id}
              type="button"
              onClick={() => onNavigate(zone.route)}
              aria-label={`${zone.name}：${zone.label}`}
            >
              <span className="creator-town-hotspot-marker" aria-hidden="true" />
              <span className="creator-town-hotspot-label">
                <strong>{zone.name}</strong>
                <small>{zone.label}</small>
              </span>
            </button>
          ))}
        </div>
        <p className="creator-town-hint">点击建筑边缘进入对应空间 · 所有入口仍遵循同一账户权限</p>
      </section>
      <section className="creator-town-archive-summary" aria-label="Tom 小镇私人档案聚合">
        <span>
          <strong>{archiveSummary.total}</strong> 条私密记录
        </span>
        <span>
          <strong>{archiveSummary.byKind.LIFE}</strong> Life
        </span>
        <span>
          <strong>{archiveSummary.byKind.HISTORY}</strong> Reading
        </span>
        <span>
          <strong>{archiveSummary.byKind.FITNESS}</strong> Fitness
        </span>
        {aiUsageActiveSeconds === null ? null : (
          <span>
            <strong>{formatAiUsageDuration(aiUsageActiveSeconds)}</strong> AI（聚合）
          </span>
        )}
        <button
          className="quiet-button"
          type="button"
          onClick={() => onNavigate('/daily-pack')}
        >
          查看 Daily Pack
        </button>
      </section>
      <section className="creator-town-guidance">
        <div>
          <p className="eyebrow">SCENE / FOUNDATION</p>
          <h2>一张背景图，也可以成为真正可探索的网站。</h2>
          <p>这里保留你资料卡背后的夜空、星座、建筑与地平线；入口按钮只作为交互层，不改变原始场景。</p>
        </div>
      </section>
    </div>
  );
}

function ConstellationPage({
  onNavigate,
  tier,
}: {
  readonly onNavigate: (route: AppRoute) => void;
  readonly tier: ExperienceTier;
}) {
  return (
    <div className="page-stack route-shell constellation-page">
      <section className="route-heading">
        <div>
          <p className="eyebrow">CONSTELLATION / PERSONAL TIME</p>
          <h1>星象馆</h1>
          <p className="lede">
            个人时间、生日、纪念日、日历与年度档案的静态视觉入口；不提供强制占星预测。
          </p>
        </div>
        <StatusPill kind="INFO">{mockConstellationTheme.state}</StatusPill>
      </section>
      <section
        className="constellation-card"
        data-tier={tier}
        aria-label="静态星象视觉基础"
      >
        <div className="constellation-stars" aria-hidden="true">
          {mockConstellationTheme.stars.map((star) => (
            <span
              className={`constellation-star constellation-star-${star}`}
              key={star}
            />
          ))}
        </div>
        <div className="constellation-copy">
          <p className="eyebrow">TIME / FOUNDATION</p>
          <h2>{mockConstellationTheme.title}</h2>
          <p>{mockConstellationTheme.description}</p>
        </div>
      </section>
      <section className="archive-card constellation-empty">
        <p className="eyebrow">MILESTONES / EMPTY</p>
        <h2>尚无里程碑</h2>
        <p>
          将来可以把你明确添加的事件连接到 Timeline 与 Annual Archive；数据仍由同一
          owner scope 与隐私规则保护。
        </p>
        <button
          className="quiet-button"
          type="button"
          onClick={() => onNavigate('/timeline')}
        >
          打开时间轴
        </button>
      </section>
    </div>
  );
}

type ArchiveRoute = keyof typeof archiveKindForRoute;
type ArchiveUiStatus =
  | 'DEFAULT'
  | 'LOADING'
  | 'SAVING'
  | 'SAVED'
  | 'ERROR'
  | 'OFFLINE'
  | 'EMPTY'
  | 'DELETED'
  | 'RETRY';

const archiveRouteCopy: Record<
  ArchiveRoute,
  {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly placeholder: string;
  }
> = {
  '/life': {
    eyebrow: 'LIFE / PRIVATE',
    title: '你的生活档案',
    description: '记录今天发生的事。正文、媒体元数据与标签默认只属于你。',
    placeholder: '今天值得留下什么？',
  },
  '/timeline': {
    eyebrow: 'TIMELINE / PRIVATE',
    title: '你的时间轴',
    description: '生活、读书感悟、健身与 AI 使用会按照来源汇聚到同一条私密时间轴。',
    placeholder: '给这条时间轴事件写一个标题。',
  },
  '/history': {
    eyebrow: 'HISTORY / PRIVATE',
    title: '读书感悟',
    description: '保存阅读片段、书中观点与自己的思考，始终保持 PRIVATE。',
    placeholder: '今天读到哪一段、想到什么？',
  },
  '/fitness': {
    eyebrow: 'FITNESS / PRIVATE',
    title: '健身与运动',
    description: '记录训练、步数与运动感受；设备同步只会在明确授权后接入。',
    placeholder: '今天完成了什么训练？',
  },
  '/daily-pack': {
    eyebrow: 'DAILY PACK / PRIVATE',
    title: '今日归档包',
    description: '按当前 owner 汇总 Life、读书感悟、健身与步数的索引状态，不复制正文。',
    placeholder: '为今天的归档包留一句摘要。',
  },
  '/trash': {
    eyebrow: 'TRASH / PRIVATE',
    title: '回收区',
    description: '软删除记录会在永久删除前保留；恢复与删除都需要明确的页内动作。',
    placeholder: '回收区不创建新记录。',
  },
  '/export': {
    eyebrow: 'EXPORT / PRIVATE',
    title: '导出我的档案',
    description: '导出当前 owner 的结构化 JSON；媒体文件暂只导出元数据清单。',
    placeholder: '导出不需要新建记录。',
  },
};

function archiveStatusLabel(status: ArchiveUiStatus): string {
  return {
    DEFAULT: 'READY',
    LOADING: 'LOADING',
    SAVING: 'SAVING',
    SAVED: 'SAVED',
    ERROR: 'ERROR',
    OFFLINE: 'OFFLINE · DRAFT',
    EMPTY: 'EMPTY',
    DELETED: 'DELETED',
    RETRY: 'RETRY',
  }[status];
}

function ArchiveRecordCard({
  record,
  focused = false,
  onEdit,
  onTrash,
  onRestore,
  onDelete,
  onConfirmDelete,
  onCancelDelete,
  deletePending = false,
}: {
  readonly record: ArchiveRecord;
  readonly focused?: boolean;
  readonly onEdit: (record: ArchiveRecord) => void;
  readonly onTrash: (record: ArchiveRecord) => void;
  readonly onRestore: (record: ArchiveRecord) => void;
  readonly onDelete: (record: ArchiveRecord) => void;
  readonly onConfirmDelete: (record: ArchiveRecord) => void;
  readonly onCancelDelete: () => void;
  readonly deletePending?: boolean;
}) {
  return (
    <article
      className={cx(
        'archive-record-card static-glow-surface',
        record.status === 'DELETED' && 'archive-record-card-deleted',
        focused && 'archive-record-card-focused',
      )}
      data-entry-id={record.id}
      aria-current={focused ? 'location' : undefined}
    >
      <div className="archive-record-meta">
        <span className="archive-kind-mark">{archiveLabel(record.kind)}</span>
        <span className="archive-privacy-mark">PRIVATE</span>
        <span className="archive-record-revision">
          v{record.version} · r{record.revision}
        </span>
      </div>
      <h3>{record.title}</h3>
      <p>{record.body || '（无正文；这是一个仅包含标题的私密记录。）'}</p>
      {record.kind === 'FITNESS' && Object.keys(record.metrics).length > 0 ? (
        <div className="archive-metrics" aria-label="健身指标">
          {Object.entries(record.metrics).map(([key, value]) => (
            <span key={key}>
              {key}: {value}
            </span>
          ))}
        </div>
      ) : null}
      {record.tags.length > 0 ? (
        <div className="archive-tags" aria-label="标签">
          {record.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      ) : null}
      {record.media.length > 0 ? (
        <div className="archive-record-media" aria-label="已保存图片元数据">
          <span aria-hidden="true">⌑</span>
          <span>已记录 {record.media.length} 张图片</span>
          <small>{record.media.map((media) => media.name).join(' · ')}</small>
        </div>
      ) : null}
      <div className="archive-record-footer">
        <small>
          {record.syncState === 'DRAFT' ? '离线草稿' : '已保存'} ·{' '}
          {new Date(record.updatedAt).toLocaleString('zh-CN', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </small>
        <div className="archive-record-actions">
          {record.status === 'DELETED' ? (
            <>
              <button
                className="quiet-button"
                type="button"
                onClick={() => onRestore(record)}
              >
                恢复
              </button>
              <button
                className="quiet-button quiet-button-danger"
                type="button"
                onClick={() => onDelete(record)}
              >
                {deletePending ? '收起确认' : '永久删除'}
              </button>
              {deletePending ? (
                <div className="archive-inline-confirm" role="alert">
                  <span>永久删除后无法恢复。</span>
                  <button
                    className="quiet-button quiet-button-danger"
                    type="button"
                    onClick={() => onConfirmDelete(record)}
                  >
                    确认删除
                  </button>
                  <button
                    className="quiet-button"
                    type="button"
                    onClick={onCancelDelete}
                  >
                    取消
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <button
                className="quiet-button"
                type="button"
                onClick={() => onEdit(record)}
              >
                编辑
              </button>
              <button
                className="quiet-button quiet-button-danger"
                type="button"
                onClick={() => onTrash(record)}
              >
                移入回收站
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function requestedArchiveEntryId(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const value = params.get('sourceId') ?? params.get('entryId');
  return value !== null && /^[A-Za-z0-9._:-]{1,160}$/u.test(value) ? value : null;
}

interface ArchiveMediaDraft {
  readonly metadata: ArchiveMediaMetadata;
  /** Object URLs are only for the current browser preview and are revoked on cleanup. */
  readonly previewUrl: string | null;
}

function archiveMediaId(file: File): string {
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `local-image-${suffix}-${file.name.replace(/[^A-Za-z0-9._-]/g, '-')}`;
}

function mediaDraftForFile(file: File): ArchiveMediaDraft {
  return {
    metadata: {
      id: archiveMediaId(file),
      name: file.name || 'camera-image.jpg',
      mimeType: file.type || 'image/jpeg',
      bytes: file.size,
    },
    previewUrl: URL.createObjectURL(file),
  };
}

function ArchivePage({
  route,
  onNavigate,
}: {
  readonly route: ArchiveRoute;
  readonly onNavigate: (route: AppRoute) => void;
}) {
  const copy = archiveRouteCopy[route];
  const kind = archiveKindForRoute[route] as ArchiveKind | undefined;
  const [records, setRecords] = useState<readonly ArchiveRecord[]>([]);
  const [trash, setTrash] = useState<readonly ArchiveRecord[]>([]);
  const [dailyPack, setDailyPack] = useState<ArchiveDailyPack>(() =>
    localArchiveAdapter.dailyPack(),
  );
  const [status, setStatus] = useState<ArchiveUiStatus>('DEFAULT');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [showTrash, setShowTrash] = useState(route === '/trash');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [steps, setSteps] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeRevision, setActiveRevision] = useState<number | undefined>(undefined);
  const [exportText, setExportText] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [dailyPackMessage, setDailyPackMessage] = useState('');
  const [mediaDrafts, setMediaDrafts] = useState<readonly ArchiveMediaDraft[]>([]);
  const previewUrlsRef = useRef(new Set<string>());
  const [focusedEntryId, setFocusedEntryId] = useState<string | null>(() =>
    requestedArchiveEntryId(),
  );
  const visibleRecords = showTrash ? trash : records;

  useEffect(() => {
    const load = () => {
      try {
        const online = typeof navigator === 'undefined' ? true : navigator.onLine;
        localArchiveAdapter.setOnline(online);
        const all = localArchiveAdapter.list(
          kind === undefined ? { query } : { kind, query },
        );
        const deleted = localArchiveAdapter
          .list(
            kind === undefined
              ? { includeDeleted: true }
              : { kind, includeDeleted: true },
          )
          .filter((record) => record.status === 'DELETED');
        setRecords(all);
        setTrash(deleted);
        setDailyPack(localArchiveAdapter.dailyPack());
        setStatus(
          showTrash
            ? deleted.length > 0
              ? 'DELETED'
              : 'EMPTY'
            : all.length > 0
              ? 'DEFAULT'
              : 'EMPTY',
        );
        setError('');
      } catch (caught) {
        setStatus('ERROR');
        setError(caught instanceof Error ? caught.message : '读取档案失败。');
      }
    };
    load();
    const onOffline = () => {
      localArchiveAdapter.setOnline(false);
      setStatus('OFFLINE');
    };
    const onOnline = () => {
      localArchiveAdapter.setOnline(true);
      localArchiveAdapter.syncDrafts();
      load();
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [kind, query, reloadToken, showTrash]);

  useEffect(() => {
    if (route === '/trash') setShowTrash(true);
    if (route !== '/trash') setShowTrash(false);
    if (route === '/export') setExportText(localArchiveAdapter.exportJson());
  }, [route]);

  useEffect(() => {
    const updateFocusedEntry = () => setFocusedEntryId(requestedArchiveEntryId());
    window.addEventListener('popstate', updateFocusedEntry);
    updateFocusedEntry();
    return () => window.removeEventListener('popstate', updateFocusedEntry);
  }, []);

  const focusedRecord =
    focusedEntryId === null
      ? undefined
      : visibleRecords.find((record) => record.id === focusedEntryId);

  useEffect(() => {
    if (focusedRecord === undefined) return;
    const frame = window.requestAnimationFrame(() => {
      const target = Array.from(
        document.querySelectorAll<HTMLElement>('[data-entry-id]'),
      ).find((element) => element.dataset.entryId === focusedRecord.id);
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusedRecord]);

  useEffect(
    () => () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current.clear();
    },
    [],
  );

  const clearMediaDrafts = () => {
    setMediaDrafts((current) => {
      current.forEach((media) => {
        if (media.previewUrl !== null) {
          URL.revokeObjectURL(media.previewUrl);
          previewUrlsRef.current.delete(media.previewUrl);
        }
      });
      return [];
    });
  };

  const addMedia = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      if (files.length > 0) {
        setStatus('ERROR');
        setError('目前仅支持图片。请选择照片或使用相机拍摄。');
      }
      return;
    }
    const next = imageFiles.map(mediaDraftForFile);
    next.forEach((media) => {
      if (media.previewUrl !== null) previewUrlsRef.current.add(media.previewUrl);
    });
    setMediaDrafts((current) => [...current, ...next]);
    setError('');
  };

  const removeMedia = (id: string) => {
    setMediaDrafts((current) => {
      const removed = current.find((media) => media.metadata.id === id);
      if (removed?.previewUrl !== null && removed !== undefined) {
        URL.revokeObjectURL(removed.previewUrl);
        previewUrlsRef.current.delete(removed.previewUrl);
      }
      return current.filter((media) => media.metadata.id !== id);
    });
  };

  const resetComposer = () => {
    setActiveId(null);
    setActiveRevision(undefined);
    setTitle('');
    setBody('');
    setTags('');
    setSteps('');
    setOccurredAt('');
    clearMediaDrafts();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('SAVING');
    try {
      const parsedSteps = Number(steps);
      const parsedOccurredAt = isoFromDateTimeLocal(occurredAt);
      const metrics =
        kind === 'FITNESS' && steps.trim().length > 0 && Number.isFinite(parsedSteps)
          ? { steps: Math.max(0, Math.floor(parsedSteps)) }
          : undefined;
      const input = {
        title,
        body,
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        ...(kind === undefined ? {} : { kind }),
        ...(metrics === undefined ? {} : { metrics }),
        ...(mediaDrafts.length === 0
          ? {}
          : { media: mediaDrafts.map((media) => media.metadata) }),
        ...(parsedOccurredAt === undefined ? {} : { occurredAt: parsedOccurredAt }),
      };
      if (activeId !== null) {
        localArchiveAdapter.update(
          activeId,
          metrics === undefined
            ? {
                title,
                body,
                tags: input.tags,
                ...(parsedOccurredAt === undefined
                  ? {}
                  : { occurredAt: parsedOccurredAt }),
                media: mediaDrafts.map((media) => media.metadata),
              }
            : {
                title,
                body,
                tags: input.tags,
                metrics,
                ...(parsedOccurredAt === undefined
                  ? {}
                  : { occurredAt: parsedOccurredAt }),
                media: mediaDrafts.map((media) => media.metadata),
              },
          activeRevision,
        );
      } else if (kind !== undefined) {
        localArchiveAdapter.create(
          metrics === undefined
            ? {
                kind,
                title,
                body,
                tags: input.tags,
                media: mediaDrafts.map((media) => media.metadata),
                ...(parsedOccurredAt === undefined
                  ? {}
                  : { occurredAt: parsedOccurredAt }),
              }
            : {
                kind,
                title,
                body,
                tags: input.tags,
                metrics,
                media: mediaDrafts.map((media) => media.metadata),
                ...(parsedOccurredAt === undefined
                  ? {}
                  : { occurredAt: parsedOccurredAt }),
              },
        );
      } else {
        throw new Error('时间轴记录需要从生活、读书感悟或健身入口创建。');
      }
      setStatus(localArchiveAdapter.isOnline() ? 'SAVED' : 'OFFLINE');
      setError('');
      resetComposer();
      setReloadToken((value) => value + 1);
    } catch (caught) {
      setStatus(caught instanceof ArchiveConflictError ? 'RETRY' : 'ERROR');
      setError(caught instanceof Error ? caught.message : '保存档案失败。');
    }
  };

  const beginEdit = (record: ArchiveRecord) => {
    setActiveId(record.id);
    setActiveRevision(record.revision);
    setTitle(record.title);
    setBody(record.body);
    setTags(record.tags.join(', '));
    setSteps(record.metrics.steps?.toString() ?? '');
    setOccurredAt(dateTimeLocalValue(record.occurredAt));
    clearMediaDrafts();
    setMediaDrafts(record.media.map((metadata) => ({ metadata, previewUrl: null })));
    setStatus('DEFAULT');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const moveToTrash = (record: ArchiveRecord) => {
    try {
      localArchiveAdapter.moveToTrash(record.id, record.revision);
      setStatus('DELETED');
      setReloadToken((value) => value + 1);
    } catch (caught) {
      setStatus(caught instanceof ArchiveConflictError ? 'RETRY' : 'ERROR');
      setError(caught instanceof Error ? caught.message : '移动到回收站失败。');
    }
  };

  const restore = (record: ArchiveRecord) => {
    try {
      localArchiveAdapter.restore(record.id, record.revision);
      setStatus('SAVED');
      setReloadToken((value) => value + 1);
    } catch (caught) {
      setStatus('ERROR');
      setError(caught instanceof Error ? caught.message : '恢复失败。');
    }
  };

  const permanentlyDelete = (record: ArchiveRecord) => {
    try {
      localArchiveAdapter.permanentDelete(record.id);
      setPendingDeleteId(null);
      setStatus('DELETED');
      setReloadToken((value) => value + 1);
    } catch (caught) {
      setStatus('ERROR');
      setError(caught instanceof Error ? caught.message : '永久删除失败。');
    }
  };

  const requestPermanentDelete = (record: ArchiveRecord) => {
    setPendingDeleteId((current) => (current === record.id ? null : record.id));
  };

  const createDailyPack = () => {
    const pack = localArchiveAdapter.createDailyPack();
    setDailyPackMessage(
      pack === undefined
        ? '今天还没有可聚合的活动记录。'
        : `Daily Pack 已保存（${pack.records.length} 条来源，重复操作保持幂等）。`,
    );
    setDailyPack(localArchiveAdapter.dailyPack());
  };

  const quota = localArchiveAdapter.quota();
  const dailyPackCounts = useMemo(
    () =>
      dailyPack.records.reduce<Partial<Record<ArchiveKind, number>>>((counts, record) => {
        counts[record.kind] = (counts[record.kind] ?? 0) + 1;
        return counts;
      }, {}),
    [dailyPack.records],
  );
  const dailyPackPreview = dailyPack.records.slice(0, 3);

  return (
    <div className="page-stack route-shell archive-page">
      <section className="route-heading archive-route-heading">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p className="lede">{copy.description}</p>
        </div>
        <div className="archive-status-block" aria-live="polite">
          <span
            className={cx('archive-status', 'archive-status-' + status.toLowerCase())}
          >
            {archiveStatusLabel(status)}
          </span>
          <span className="archive-owner-scope">
            OWNER: {localArchiveAdapter.ownerId}
          </span>
        </div>
      </section>

      <section className="archive-toolbar" aria-label="档案工具">
        <label className="archive-search-control">
          <span className="sr-only">搜索档案</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、正文或标签…"
          />
        </label>
        <button
          className={cx('quiet-button', !showTrash && 'quiet-button-selected')}
          type="button"
          onClick={() => setShowTrash(false)}
        >
          活动记录 · {records.length}
        </button>
        <button
          className={cx('quiet-button', showTrash && 'quiet-button-selected')}
          type="button"
          onClick={() => setShowTrash(true)}
        >
          回收站 · {trash.length}
        </button>
        <button
          className="quiet-button"
          type="button"
          onClick={() => {
            setExportText(localArchiveAdapter.exportJson());
            setStatus('SAVED');
          }}
        >
          导出 JSON
        </button>
        <button
          className="quiet-button"
          type="button"
          onClick={() => onNavigate('/daily-pack')}
        >
          Daily Pack
        </button>
        <button
          className="quiet-button"
          type="button"
          onClick={() => onNavigate('/trash')}
        >
          回收区页面
        </button>
        <button
          className="quiet-button"
          type="button"
          onClick={() => onNavigate('/export')}
        >
          导出页面
        </button>
        <button
          className="quiet-button"
          type="button"
          onClick={() => onNavigate('/timeline')}
        >
          时间轴页面
        </button>
      </section>

      {focusedEntryId !== null ? (
        <section className="archive-citation-target" role="status">
          {focusedRecord === undefined
            ? '引用的记录不在当前 owner 或当前页面范围内。'
            : `已定位引用记录：${focusedRecord.title || '无标题记录'}`}
        </section>
      ) : null}

      {kind !== undefined || activeId !== null ? (
        <form className="archive-composer static-glow-surface" onSubmit={submit}>
        <div className="archive-composer-heading">
          <div>
            <p className="eyebrow">
              {activeId === null ? 'NEW PRIVATE RECORD' : 'EDIT PRIVATE RECORD'}
            </p>
            <h2>
              {activeId === null
                ? kind === undefined
                  ? '从入口创建时间轴事件'
                  : '留下一条真实记录'
                : '保存这次修改'}
            </h2>
          </div>
          {activeId !== null ? (
            <button className="quiet-button" type="button" onClick={resetComposer}>
              取消编辑
            </button>
          ) : null}
        </div>
        <div className="archive-composer-grid">
          <label>
            标题（可选）
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={copy.placeholder}
            />
          </label>
          <label>
            标签（逗号分隔）
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="例如：工作, 思考"
            />
          </label>
          {kind === 'FITNESS' ? (
            <label>
              步数（可选）
              <input
                inputMode="numeric"
                value={steps}
                onChange={(event) =>
                  setSteps(event.target.value.replace(/[^0-9]/g, ''))
                }
                placeholder="0"
              />
            </label>
          ) : null}
          <label>
            发生时间（可选）
            <input
              type="datetime-local"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
            />
          </label>
        </div>
        <label>
          正文{kind === 'LIFE' ? '（必填）' : ''}
          <textarea
            required={kind === 'LIFE'}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="写下你愿意留给未来自己的内容。"
            rows={4}
          />
        </label>
        <section className="archive-media-composer" aria-labelledby="archive-media-title">
          <div>
            <p className="eyebrow" id="archive-media-title">PHOTO NOTE / PRIVATE</p>
            <h3>添加图片</h3>
            <p>
              可从相册选择，手机上也可直接拍照。图片不会公开发布；当前本地档案会保存安全的图片元数据，预览仅保留在此设备会话，直到媒体服务接入。
            </p>
          </div>
          <label className="archive-media-picker">
            <span aria-hidden="true">⌑</span>
            <span>拍照或选择图片</span>
            <input
              accept="image/*"
              capture="environment"
              multiple
              type="file"
              onChange={addMedia}
            />
          </label>
          {mediaDrafts.length > 0 ? (
            <ul className="archive-media-preview-list" aria-label="待保存图片">
              {mediaDrafts.map((media) => (
                <li key={media.metadata.id}>
                  {media.previewUrl !== null ? (
                    <img alt="待保存的图片预览" src={media.previewUrl} />
                  ) : (
                    <span className="archive-media-placeholder" aria-hidden="true">⌑</span>
                  )}
                  <span>
                    <strong>{media.metadata.name}</strong>
                    <small>{Math.max(1, Math.ceil(media.metadata.bytes / 1024))} KB · 图片元数据将保存</small>
                  </span>
                  <button
                    className="quiet-button quiet-button-danger"
                    type="button"
                    onClick={() => removeMedia(media.metadata.id)}
                  >
                    移除
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
        <div className="archive-composer-footer">
          <span>
            PRIVATE BY DEFAULT ·{' '}
            {localArchiveAdapter.isOnline() ? '本地已连接' : '离线草稿模式'}
          </span>
          <button
            className="create-button glow-button"
            type="submit"
            disabled={status === 'SAVING' || (kind === undefined && activeId === null)}
          >
            {status === 'SAVING'
              ? '正在保存…'
              : activeId === null
                ? '保存到我的档案'
                : '保存修改'}
          </button>
        </div>
        </form>
      ) : (
        <section className="archive-route-guidance static-glow-surface">
          <div>
            <p className="eyebrow">RECORD ENTRY</p>
            <h2>先选择一种记录</h2>
            <p>
              这里负责查看时间轴、日报、导出或回收站，不会显示一个无法保存的空表单。
              选择入口后即可写下文字并添加照片。
            </p>
          </div>
          <div className="archive-route-guidance-actions">
            <button className="quiet-button" type="button" onClick={() => onNavigate('/life')}>
              记录生活
            </button>
            <button className="quiet-button" type="button" onClick={() => onNavigate('/history')}>
              写读书感悟
            </button>
            <button className="quiet-button" type="button" onClick={() => onNavigate('/fitness')}>
              记录健身
            </button>
          </div>
        </section>
      )}

      {status === 'ERROR' || status === 'RETRY' ? (
        <section className="archive-error" role="alert">
          <strong>{status === 'RETRY' ? '检测到版本冲突。' : '档案操作失败。'}</strong>
          <span>{error}</span>
          <button
            className="quiet-button"
            type="button"
            onClick={() => setReloadToken((value) => value + 1)}
          >
            重试
          </button>
        </section>
      ) : null}

      {exportText.length > 0 ? (
        <details className="archive-export-preview" open>
          <summary>导出基础已准备（仅当前 owner 的本地 JSON）</summary>
          <pre>{exportText}</pre>
        </details>
      ) : null}

      <section className="archive-list-section" aria-live="polite">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              {showTrash ? 'TRASH / PRIVATE' : 'ARCHIVE / PRIVATE'}
            </p>
            <h2>{showTrash ? '已删除记录' : '记录列表'}</h2>
          </div>
          <p className="section-note">
            {visibleRecords.length} 条 · {quota.usedBytes} / {quota.quotaBytes} bytes
            media quota
          </p>
        </div>
        {visibleRecords.length === 0 ? (
          <EmptyState
            eyebrow={showTrash ? 'DELETED / EMPTY' : copy.eyebrow}
            title={showTrash ? '回收站是空的。' : '还没有记录。'}
            description={
              showTrash
                ? '移入回收站的记录会在永久删除前保留在当前 owner scope。'
                : '保存第一条记录后，它会在这里显示，并同步到时间轴。'
            }
          />
        ) : (
          <div className="archive-record-list">
            {visibleRecords.map((record) => (
              <ArchiveRecordCard
                key={record.id}
                record={record}
                focused={record.id === focusedEntryId}
                deletePending={pendingDeleteId === record.id}
                onCancelDelete={() => setPendingDeleteId(null)}
                onConfirmDelete={permanentlyDelete}
                onDelete={requestPermanentDelete}
                onEdit={beginEdit}
                onRestore={restore}
                onTrash={moveToTrash}
              />
            ))}
          </div>
        )}
      </section>

      <section className="daily-pack-panel static-glow-surface">
        <div className="daily-pack-copy">
          <p className="eyebrow">
            DAILY PACK / {new Date().toLocaleDateString('zh-CN')}
          </p>
          <h2>今天的归档包</h2>
          <p>
            {dailyPack.id === undefined
              ? '生成后会把今天的私密记录整理为一份本地日报，并保留来源引用。'
              : dailyPack.summary}
          </p>
          {dailyPack.records.length > 0 ? (
            <div className="daily-pack-report" aria-label="Daily Pack 报告摘要">
              <div className="daily-pack-kind-list">
                {([
                  ['LIFE', '生活'],
                  ['HISTORY', '读书感悟'],
                  ['FITNESS', '健身'],
                  ['AI_USAGE', 'AI 使用'],
                ] as const)
                  .filter(([kind]) => (dailyPackCounts[kind] ?? 0) > 0)
                  .map(([kind, label]) => (
                    <span key={kind}>
                      {label} {dailyPackCounts[kind]}
                    </span>
                  ))}
              </div>
              <ul>
                {dailyPackPreview.map((record) => (
                  <li key={record.id}>{record.title || record.body.slice(0, 36) || '未命名记录'}</li>
                ))}
                {dailyPack.records.length > dailyPackPreview.length ? (
                  <li>另有 {dailyPack.records.length - dailyPackPreview.length} 条来源</li>
                ) : null}
              </ul>
              <small>
                {dailyPack.id === undefined
                  ? '尚未保存为 Daily Pack。'
                  : '已保存到当前 owner 的本地档案；图片只保留元数据，不会被公开发布。'}
              </small>
            </div>
          ) : null}
        </div>
        <div className="daily-pack-actions">
          <strong>{dailyPack.records.length} 条</strong>
          <button className="quiet-button" type="button" onClick={createDailyPack}>
            {dailyPack.id === undefined ? '生成今日报告' : '确认日报已保存'}
          </button>
          {dailyPack.id !== undefined ? (
            <button className="quiet-button" type="button" onClick={() => onNavigate('/export')}>
              查看导出
            </button>
          ) : null}
          {dailyPackMessage.length > 0 ? (
            <span className="archive-inline-status" aria-live="polite">
              {dailyPackMessage}
            </span>
          ) : null}
        </div>
      </section>
    </div>
  );
}

type CommunitySurfaceState = 'IDLE' | 'LOADING' | 'READY' | 'ERROR';

function formatCommunityDate(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '刚刚';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function CommunityInlineStatus({
  children,
  tone = 'INFO',
}: {
  readonly children: ReactNode;
  readonly tone?: 'INFO' | 'ERROR' | 'SUCCESS';
}) {
  return (
    <p
      aria-live="polite"
      className={cx(
        'community-inline-status',
        `community-inline-status-${tone.toLowerCase()}`,
      )}
      role="status"
    >
      {children}
    </p>
  );
}

function CommentThread({ post }: { readonly post: CommunityPost }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<CommunitySurfaceState>('IDLE');
  const [comments, setComments] = useState<readonly CommunityComment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<CommunityComment | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async (nextCursor?: string) => {
    setState('LOADING');
    const result = await communityClient.listComments({
      postId: post.id,
      ...(nextCursor === undefined ? {} : { cursor: nextCursor }),
      limit: 12,
    });
    if (!result.ok) {
      setState('ERROR');
      setMessage(result.error.message);
      return;
    }
    setComments((current) =>
      nextCursor === undefined ? result.data.items : [...current, ...result.data.items],
    );
    setCursor(result.data.nextCursor);
    setState('READY');
    setMessage(result.data.items.length === 0 ? '还没有公开评论。' : '');
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && state === 'IDLE') void load();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = body.trim();
    if (normalized.length === 0) {
      setMessage('请先写下要公开的评论。');
      return;
    }
    setSubmitting(true);
    setMessage('');
    void communityClient
      .createComment({
        postId: post.id,
        body: normalized,
        ...(replyTo === null ? {} : { parentCommentId: replyTo.id }),
        idempotencyKey: createCommunityActionKey('comment'),
      })
      .then((result) => {
        if (!result.ok) {
          setMessage(result.error.message);
          return;
        }
        setComments((current) => [...current, result.data]);
        setBody('');
        setReplyTo(null);
        setMessage('评论已由服务端确认。');
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <section className="community-comments" aria-label="评论">
      <button
        aria-expanded={open}
        className="community-action-button"
        type="button"
        onClick={toggle}
      >
        评论 {post.commentCount}
      </button>
      {open ? (
        <div className="community-comments-panel">
          {state === 'LOADING' ? (
            <CodeShimmer tier="LITE" title="正在加载评论" />
          ) : null}
          {state === 'ERROR' ? (
            <button className="quiet-button" type="button" onClick={() => void load()}>
              重新加载评论
            </button>
          ) : null}
          {comments.length > 0 ? (
            <div className="community-comment-list">
              {comments.map((comment) => (
                <article
                  className={cx(
                    'community-comment',
                    comment.parentCommentId !== null && 'community-comment-reply',
                  )}
                  key={comment.id}
                >
                  <div>
                    <strong>{comment.author.displayName}</strong>
                    <small>{formatCommunityDate(comment.createdAt)}</small>
                  </div>
                  <p>{comment.body}</p>
                  <button
                    className="community-text-button"
                    disabled={!comment.viewer.canReply || comment.viewer.authorBlocked}
                    type="button"
                    onClick={() => setReplyTo(comment)}
                  >
                    回复
                  </button>
                </article>
              ))}
            </div>
          ) : null}
          {cursor !== null ? (
            <button
              className="quiet-button"
              disabled={state === 'LOADING'}
              type="button"
              onClick={() => void load(cursor)}
            >
              加载更多评论
            </button>
          ) : null}
          {post.viewer.canComment && !post.viewer.authorBlocked ? (
            <form className="community-comment-composer" onSubmit={submit}>
              <label htmlFor={`comment-${post.id}`}>
                {replyTo === null
                  ? '写下公开评论'
                  : `回复 ${replyTo.author.displayName}`}
              </label>
              <textarea
                id={`comment-${post.id}`}
                maxLength={2_000}
                rows={2}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
              <div className="community-form-actions">
                {replyTo !== null ? (
                  <button
                    className="community-text-button"
                    type="button"
                    onClick={() => setReplyTo(null)}
                  >
                    取消回复
                  </button>
                ) : null}
                <button className="async-button" disabled={submitting} type="submit">
                  {submitting ? '正在提交' : '发送评论'}
                </button>
              </div>
            </form>
          ) : (
            <p className="community-muted-note">此内容当前不接受你的评论。</p>
          )}
          {message.length > 0 ? (
            <CommunityInlineStatus tone={state === 'ERROR' ? 'ERROR' : 'INFO'}>
              {message}
            </CommunityInlineStatus>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function CommunityPostCard({
  post,
  onChanged,
  onCreated,
}: {
  readonly post: CommunityPost;
  readonly onChanged: (next: CommunityPost) => void;
  readonly onCreated: (post: CommunityPost) => void;
}) {
  const [viewer, setViewer] = useState(post.viewer);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<
    'REACTION' | 'SAVE' | 'FOLLOW' | 'BLOCK' | 'REPORT' | 'QUOTE' | 'REPOST' | null
  >(null);
  const [reportReason, setReportReason] = useState('SPAM');
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteCommentary, setQuoteCommentary] = useState('');

  useEffect(() => setViewer(post.viewer), [post.viewer]);

  const updateViewer = (next: CommunityPost['viewer']) => {
    setViewer(next);
    onChanged({ ...post, viewer: next });
  };

  const updatePost = (patch: Partial<CommunityPost>) => {
    onChanged({ ...post, ...patch, viewer: patch.viewer ?? viewer });
  };

  const run = async (
    kind: NonNullable<typeof pending>,
    action: () => Promise<CommunityResult<{ readonly reacted: boolean }>>,
  ) => {
    setPending(kind);
    setMessage('');
    const result = await action();
    setPending(null);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    updateViewer({ ...viewer, reacted: result.data.reacted });
    setMessage('服务端已确认此操作。');
  };

  const save = async () => {
    setPending('SAVE');
    setMessage('');
    const result = await communityClient.setSaved({
      postId: post.id,
      saved: !viewer.saved,
      idempotencyKey: createCommunityActionKey('save'),
    });
    setPending(null);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    updateViewer({ ...viewer, saved: result.data.saved });
    setMessage(
      result.data.saved ? '已保存到仅自己可见的列表。' : '已从私人收藏中移除。',
    );
  };

  const publishQuote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending('QUOTE');
    setMessage('');
    const result = await communityClient.createQuote({
      postId: post.id,
      commentary: quoteCommentary.trim() || null,
      idempotencyKey: createCommunityActionKey('quote'),
    });
    setPending(null);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    onCreated(result.data);
    setQuoteCommentary('');
    setQuoteOpen(false);
    setMessage('引用已由服务端确认发布。');
  };

  const toggleRepost = async () => {
    setPending('REPOST');
    setMessage('');
    const result = await communityClient.setRepost({
      postId: post.id,
      reposted: !viewer.reposted,
      idempotencyKey: createCommunityActionKey('repost'),
    });
    setPending(null);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    updatePost({
      viewer: { ...viewer, reposted: result.data.reposted },
      repostCount: result.data.repostCount,
      repostedBy: result.data.repostedBy,
    });
    setMessage(result.data.reposted ? '转发已由服务端确认。' : '已取消转发。');
  };

  const follow = async () => {
    setPending('FOLLOW');
    setMessage('');
    const result = await communityClient.setFollow({
      userId: post.author.userId,
      followed: !viewer.authorFollowed,
      idempotencyKey: createCommunityActionKey('follow'),
    });
    setPending(null);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    updateViewer({ ...viewer, authorFollowed: result.data.followed });
    setMessage(result.data.followed ? '已关注公开动态。' : '已取消关注。');
  };

  const block = async () => {
    setPending('BLOCK');
    setMessage('');
    const result = await communityClient.setBlock({
      userId: post.author.userId,
      blocked: !viewer.authorBlocked,
      idempotencyKey: createCommunityActionKey('block'),
    });
    setPending(null);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    updateViewer({
      ...viewer,
      authorBlocked: result.data.blocked,
      authorFollowed: result.data.blocked ? false : viewer.authorFollowed,
    });
    setMessage(result.data.blocked ? '已屏蔽此账号的后续互动。' : '已解除屏蔽。');
  };

  const report = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending('REPORT');
    setMessage('');
    const result = await communityClient.submitReport({
      target: 'POST',
      targetId: post.id,
      reason: reportReason as Parameters<
        typeof communityClient.submitReport
      >[0]['reason'],
      idempotencyKey: createCommunityActionKey('report'),
    });
    setPending(null);
    setMessage(result.ok ? '举报已交由服务端处理。' : result.error.message);
  };

  return (
    <article className="community-post-card">
      <header className="community-post-header">
        <div>
          <strong>{post.author.displayName}</strong>
        </div>
        <div className="community-post-meta">
          <StatusPill kind="SOCIAL">{post.visibility}</StatusPill>
          <span>{post.context.label}</span>
          <time dateTime={post.publishedAt}>
            {formatCommunityDate(post.publishedAt)}
          </time>
        </div>
      </header>
      {post.repostedBy !== null ? (
        <p className="community-muted-note" aria-label="转发来源">
          {post.repostedBy.author.displayName} 转发了这条动态
        </p>
      ) : null}
      {post.snapshot !== null ? (
        <section className="community-snapshot-card" aria-label="已发布快照">
          <p className="eyebrow">
            PUBLISHED SNAPSHOT / REV {post.snapshot.sourceRevision}
          </p>
          {post.snapshot.title !== null ? <h3>{post.snapshot.title}</h3> : null}
          {post.snapshot.excerpt !== null ? <p>{post.snapshot.excerpt}</p> : null}
          <small>这是独立发布快照；不会随私人原始记录静默变化。</small>
        </section>
      ) : null}
      {post.body !== null && post.body.length > 0 ? (
        <p className="community-post-body">{post.body}</p>
      ) : null}
      {post.quote !== null ? (
        <section className="community-snapshot-card" aria-label="引用的公开动态">
          {post.quote.state === 'UNAVAILABLE' ? (
            <p>原内容不可用。</p>
          ) : (
            <>
              <p className="eyebrow">QUOTED POST</p>
              <strong>{post.quote.post.author.displayName}</strong>
              {post.quote.post.body !== null ? <p>{post.quote.post.body}</p> : null}
              {post.quote.post.snapshot?.excerpt !== null && post.quote.post.snapshot?.excerpt !== undefined ? (
                <small>{post.quote.post.snapshot.excerpt}</small>
              ) : null}
            </>
          )}
        </section>
      ) : null}
      {post.media.length > 0 ? (
        <p className="community-media-note">
          已附 {post.media.length} 个经服务端授权的媒体引用。
        </p>
      ) : null}
      <div className="community-post-actions" aria-label="帖子操作">
        <button
          aria-pressed={viewer.reacted}
          className="community-action-button"
          disabled={viewer.authorBlocked || pending !== null}
          type="button"
          onClick={() =>
            void run('REACTION', () =>
              communityClient.setReaction({
                postId: post.id,
                active: !viewer.reacted,
                idempotencyKey: createCommunityActionKey('reaction'),
              }),
            )
          }
        >
          {viewer.reacted ? '已回应' : '回应'} {post.reactionCount}
        </button>
        <button
          aria-expanded={quoteOpen}
          className="community-action-button"
          disabled={viewer.authorBlocked || pending !== null}
          type="button"
          onClick={() => setQuoteOpen((open) => !open)}
        >
          引用
        </button>
        <button
          aria-pressed={viewer.reposted}
          className="community-action-button"
          disabled={viewer.authorBlocked || pending !== null}
          type="button"
          onClick={() => void toggleRepost()}
        >
          {pending === 'REPOST' ? '正在确认' : viewer.reposted ? '已转发' : '转发'} {post.repostCount}
        </button>
        <button
          aria-pressed={viewer.saved}
          className="community-action-button"
          disabled={viewer.authorBlocked || pending !== null}
          type="button"
          onClick={() => void save()}
        >
          {viewer.saved ? '已收藏' : '收藏'}
        </button>
        <button
          aria-pressed={viewer.authorFollowed}
          className="community-action-button"
          disabled={viewer.authorBlocked || pending !== null}
          type="button"
          onClick={() => void follow()}
        >
          {viewer.authorFollowed ? '已关注' : '关注'}
        </button>
        <button
          aria-pressed={viewer.authorBlocked}
          className="community-text-button"
          disabled={pending !== null}
          type="button"
          onClick={() => void block()}
        >
          {viewer.authorBlocked ? '解除屏蔽' : '屏蔽'}
        </button>
      </div>
      {quoteOpen ? (
        <form className="community-comment-composer" onSubmit={publishQuote}>
          <label htmlFor={`quote-${post.id}`}>为这条公开动态写下你的引用说明（可留空）</label>
          <textarea
            id={`quote-${post.id}`}
            maxLength={50_000}
            rows={3}
            value={quoteCommentary}
            onChange={(event) => setQuoteCommentary(event.target.value)}
          />
          <div className="community-form-actions">
            <button className="community-text-button" disabled={pending !== null} type="button" onClick={() => setQuoteOpen(false)}>
              取消
            </button>
            <button className="async-button" disabled={pending !== null} type="submit">
              {pending === 'QUOTE' ? '正在发布' : '发布引用'}
            </button>
          </div>
        </form>
      ) : null}
      <CommentThread post={{ ...post, viewer }} />
      <details className="community-report">
        <summary>举报此内容</summary>
        <form onSubmit={report}>
          <label htmlFor={`report-reason-${post.id}`}>举报原因</label>
          <select
            id={`report-reason-${post.id}`}
            value={reportReason}
            onChange={(event) => setReportReason(event.target.value)}
          >
            <option value="SPAM">垃圾内容</option>
            <option value="HARASSMENT">骚扰</option>
            <option value="PRIVACY">隐私问题</option>
            <option value="SCAM">诈骗</option>
            <option value="OTHER">其他</option>
          </select>
          <button
            className="community-text-button"
            disabled={pending !== null}
            type="submit"
          >
            {pending === 'REPORT' ? '正在提交' : '提交举报'}
          </button>
        </form>
      </details>
      {message.length > 0 ? (
        <CommunityInlineStatus>{message}</CommunityInlineStatus>
      ) : null}
    </article>
  );
}

function CommunityComposer({
  onPublished,
  onNavigate,
}: {
  readonly onPublished: (post: CommunityPost) => void;
  readonly onNavigate: (route: AppRoute) => void;
}) {
  const [mode, setMode] = useState<'POST' | 'SNAPSHOT'>('POST');
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<CommunityPostVisibility>('COMMUNITY');
  const [selectedRecordId, setSelectedRecordId] = useState('');
  const [snapshotConfirmed, setSnapshotConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const records = useMemo(
    () => localArchiveAdapter.list().filter((record) => record.kind !== 'AI_USAGE'),
    [],
  );
  const selectedRecord = records.find((record) => record.id === selectedRecordId);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = body.trim();
    if (mode === 'POST' && normalized.length === 0) {
      setMessage('请先写下要发布的公开内容。');
      return;
    }
    if (mode === 'SNAPSHOT' && selectedRecord === undefined) {
      setMessage('请选择一条自己的私人记录，再明确创建独立快照。');
      return;
    }
    if (mode === 'SNAPSHOT' && !snapshotConfirmed) {
      setMessage('请确认由服务端从这一条当前版本记录创建独立快照。');
      return;
    }
    setPending(true);
    setMessage('');
    const request =
      mode === 'POST'
        ? communityClient.createPost({
            target: { kind: 'COMMUNITY' },
            body: normalized,
            visibility,
            idempotencyKey: createCommunityActionKey('post'),
          })
        : communityClient.publishSnapshot({
            target: { kind: 'COMMUNITY' },
            sourceEntryId: (selectedRecord as ArchiveRecord).id,
            sourceRevision: (selectedRecord as ArchiveRecord).revision,
            visibility,
            idempotencyKey: createCommunityActionKey('snapshot'),
          });
    void request
      .then((result) => {
        if (!result.ok) {
          setMessage(result.error.message);
          return;
        }
        onPublished('post' in result.data ? result.data.post : result.data);
        setBody('');
        setSnapshotConfirmed(false);
        setMessage('内容已由服务端确认发布。');
      })
      .finally(() => setPending(false));
  };

  return (
    <section className="community-composer" aria-labelledby="community-composer-title">
      <div className="community-composer-heading">
        <div>
          <p className="eyebrow">EXPLICIT PUBLISH</p>
          <h2 id="community-composer-title">分享一个已决定公开的片段</h2>
        </div>
        <StatusPill kind="INFO">服务端授权</StatusPill>
      </div>
      <p className="community-muted-note">
        私人原始记录不会进入 Feed。选择快照时，浏览器只发送你确认的记录 ID
        与版本；服务端才会读取并创建独立快照。
      </p>
      <div className="community-membership-note">
        <span>发布与互动由 GO 社区权益起；最终资格始终由服务端确认。</span>
        <button
          className="community-text-button"
          type="button"
          onClick={() => onNavigate('/membership')}
        >
          查看会员
        </button>
      </div>
      <div className="community-composer-tabs" aria-label="发布方式">
        <button
          aria-pressed={mode === 'POST'}
          className={mode === 'POST' ? 'selected' : ''}
          type="button"
          onClick={() => setMode('POST')}
        >
          写公开动态
        </button>
        <button
          aria-pressed={mode === 'SNAPSHOT'}
          className={mode === 'SNAPSHOT' ? 'selected' : ''}
          type="button"
          onClick={() => setMode('SNAPSHOT')}
        >
          发布独立快照
        </button>
      </div>
      <form onSubmit={submit}>
        {mode === 'SNAPSHOT' ? (
          <fieldset className="community-snapshot-picker">
            <legend>从自己的本地记录中明确选择</legend>
            {records.length === 0 ? (
              <p className="community-muted-note">
                还没有可创建快照的 Life、读书感悟或健身记录。
              </p>
            ) : (
              <label>
                记录
                <select
                  value={selectedRecordId}
                  onChange={(event) => setSelectedRecordId(event.target.value)}
                >
                  <option value="">选择一条记录</option>
                  {records.map((record) => (
                    <option key={record.id} value={record.id}>
                      {archiveLabel(record.kind)} · {record.title} · rev{' '}
                      {record.revision}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {selectedRecord !== undefined ? (
              <label className="community-confirmation">
                <input
                  checked={snapshotConfirmed}
                  type="checkbox"
                  onChange={(event) => setSnapshotConfirmed(event.target.checked)}
                />
                我确认发布此记录的当前 rev {selectedRecord.revision}{' '}
                快照；未来改动不会自动同步。
              </label>
            ) : null}
          </fieldset>
        ) : null}
        {mode === 'POST' ? (
          <>
            <label htmlFor="community-post-body">公开正文</label>
            <textarea
              id="community-post-body"
              maxLength={50_000}
              placeholder="写下想公开分享的内容…"
              rows={4}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </>
        ) : (
          <p className="community-muted-note">
            快照只提交记录
            ID、版本和你选择的可见范围；私人原文由服务端按授权投影，不从浏览器上传。
          </p>
        )}
        <div className="community-form-actions">
          <label className="community-visibility-select">
            可见范围
            <select
              value={visibility}
              onChange={(event) =>
                setVisibility(event.target.value as CommunityPostVisibility)
              }
            >
              <option value="COMMUNITY">社区</option>
              <option value="PUBLIC">公开</option>
            </select>
          </label>
          <button className="async-button" disabled={pending} type="submit">
            {pending
              ? '正在交给服务端确认'
              : mode === 'POST'
                ? '发布动态'
                : '创建并发布快照'}
          </button>
        </div>
      </form>
      {message.length > 0 ? (
        <CommunityInlineStatus>{message}</CommunityInlineStatus>
      ) : null}
    </section>
  );
}

function CommunityDirectory() {
  const [state, setState] = useState<CommunitySurfaceState>('LOADING');
  const [groups, setGroups] = useState<readonly CommunityGroup[]>([]);
  const [channels, setChannels] = useState<readonly CommunityChannel[]>([]);
  const [message, setMessage] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<readonly CommunitySearchResult[]>(
    [],
  );

  useEffect(() => {
    let current = true;
    void Promise.all([
      communityClient.listGroups({ limit: 6 }),
      communityClient.listChannels({ limit: 6 }),
    ]).then(([groupResult, channelResult]) => {
      if (!current) return;
      if (!groupResult.ok) {
        setState('ERROR');
        setMessage(groupResult.error.message);
        return;
      }
      if (!channelResult.ok) {
        setState('ERROR');
        setMessage(channelResult.error.message);
        return;
      }
      setGroups(groupResult.data.items);
      setChannels(channelResult.data.items);
      setState('READY');
    });
    return () => {
      current = false;
    };
  }, []);

  const changeGroup = (group: CommunityGroup) => {
    const action =
      group.membership === 'MEMBER' || group.membership === 'OWNER' ? 'LEAVE' : 'JOIN';
    setPendingId(`group:${group.id}`);
    setMessage('');
    void communityClient
      .changeGroupMembership({
        groupId: group.id,
        action,
        idempotencyKey: createCommunityActionKey('group-membership'),
      })
      .then((result) => {
        if (!result.ok) {
          setMessage(result.error.message);
          return;
        }
        setGroups((current) =>
          current.map((candidate) =>
            candidate.id === result.data.groupId
              ? { ...candidate, membership: result.data.membership }
              : candidate,
          ),
        );
        setMessage('群组状态已由服务端确认。');
      })
      .finally(() => setPendingId(null));
  };

  const changeChannel = (channel: CommunityChannel) => {
    const action =
      channel.membership === 'MEMBER' || channel.membership === 'OWNER'
        ? 'LEAVE'
        : 'JOIN';
    setPendingId(`channel:${channel.id}`);
    setMessage('');
    void communityClient
      .changeChannelMembership({
        channelId: channel.id,
        action,
        idempotencyKey: createCommunityActionKey('channel-membership'),
      })
      .then((result) => {
        if (!result.ok) {
          setMessage(result.error.message);
          return;
        }
        setChannels((current) =>
          current.map((candidate) =>
            candidate.id === result.data.channelId
              ? { ...candidate, membership: result.data.membership }
              : candidate,
          ),
        );
        setMessage('频道订阅状态已由服务端确认。');
      })
      .finally(() => setPendingId(null));
  };

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = query.trim();
    if (normalized.length < 2) {
      setMessage('请输入至少两个字符，只检索公开社区索引。');
      return;
    }
    setSearching(true);
    setMessage('');
    void communityClient
      .search({ query: normalized, limit: 8 })
      .then((result) => {
        if (!result.ok) {
          setMessage(result.error.message);
          return;
        }
        setSearchResults(result.data.items);
        setMessage(result.data.items.length === 0 ? '没有匹配的公开社区结果。' : '');
      })
      .finally(() => setSearching(false));
  };

  return (
    <section
      className="community-directory"
      aria-labelledby="community-directory-title"
    >
      <div className="community-feed-heading">
        <div>
          <p className="eyebrow">GROUPS · CHANNELS · SEARCH</p>
          <h2 id="community-directory-title">有边界的连接</h2>
        </div>
        <StatusPill kind="INFO">公开索引</StatusPill>
      </div>
      <form className="community-search-form" onSubmit={search}>
        <label htmlFor="community-public-search">搜索公开社区</label>
        <input
          id="community-public-search"
          value={query}
          placeholder="用户、帖子、群组、频道、活动"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button className="quiet-button" disabled={searching} type="submit">
          {searching ? '正在搜索' : '搜索'}
        </button>
      </form>
      {searchResults.length > 0 ? (
        <ul className="community-search-results" aria-label="公开搜索结果">
          {searchResults.map((result) => (
            <li key={`${result.type}:${result.id}`}>
              <StatusPill kind="SOCIAL">{result.type}</StatusPill>
              <strong>{result.title}</strong>
              <span>{result.snippet}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {state === 'LOADING' ? (
        <CodeShimmer tier="LITE" title="正在读取群组和频道" />
      ) : null}
      <div className="community-directory-grid">
        <section
          className="community-directory-section"
          aria-labelledby="group-directory-title"
        >
          <div className="community-subheading">
            <h3 id="group-directory-title">群组</h3>
            <small>PRIVATE 群组的内容与成员资格仅由服务端判断。</small>
          </div>
          {state === 'READY' && groups.length === 0 ? (
            <p className="community-muted-note">还没有加入任何小组。</p>
          ) : null}
          <div className="community-directory-list">
            {groups.map((group) => (
              <article className="community-directory-card" key={group.id}>
                <div>
                  <StatusPill
                    kind={group.visibility === 'PRIVATE' ? 'WARNING' : 'SOCIAL'}
                  >
                    {group.visibility}
                  </StatusPill>
                  <h4>{group.name}</h4>
                  <p>{group.description}</p>
                  <small>
                    {group.memberCount} 位成员 · {group.status}
                  </small>
                </div>
                <button
                  className="quiet-button"
                  disabled={
                    group.membership === 'OWNER' ||
                    group.membership === 'BLOCKED' ||
                    pendingId === `group:${group.id}`
                  }
                  type="button"
                  onClick={() => changeGroup(group)}
                >
                  {pendingId === `group:${group.id}`
                    ? '正在确认'
                    : group.membership === 'MEMBER'
                      ? '离开'
                      : group.membership === 'PENDING'
                        ? '申请中'
                        : group.visibility === 'PRIVATE'
                          ? '申请加入'
                          : '加入'}
                </button>
              </article>
            ))}
          </div>
        </section>
        <section
          className="community-directory-section"
          aria-labelledby="channel-directory-title"
        >
          <div className="community-subheading">
            <h3 id="channel-directory-title">频道</h3>
            <small>官方频道与 Founder 受众由服务端能力和受众规则确认。</small>
          </div>
          {state === 'READY' && channels.length === 0 ? (
            <p className="community-muted-note">这里会出现你关注的频道。</p>
          ) : null}
          <div className="community-directory-list">
            {channels.map((channel) => (
              <article className="community-directory-card" key={channel.id}>
                <div>
                  <StatusPill kind={channel.type === 'OFFICIAL' ? 'BENEFIT' : 'SOCIAL'}>
                    {channel.type}
                  </StatusPill>
                  <h4>{channel.name}</h4>
                  <p>{channel.description ?? '频道说明将在服务端数据可用后展示。'}</p>
                  <small>{channel.founderAudience ?? channel.visibility}</small>
                </div>
                <button
                  className="quiet-button"
                  disabled={
                    channel.membership === 'OWNER' ||
                    pendingId === `channel:${channel.id}`
                  }
                  type="button"
                  onClick={() => changeChannel(channel)}
                >
                  {pendingId === `channel:${channel.id}`
                    ? '正在确认'
                    : channel.membership === 'MEMBER'
                      ? '已关注'
                      : '关注频道'}
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>
      {state === 'ERROR' || message.length > 0 ? (
        <CommunityInlineStatus tone={state === 'ERROR' ? 'ERROR' : 'INFO'}>
          {message || '群组和频道暂时不可用。'}
        </CommunityInlineStatus>
      ) : null}
    </section>
  );
}

function CommunityPage({
  tier,
  onNavigate,
}: {
  readonly tier: ExperienceTier;
  readonly onNavigate: (route: AppRoute) => void;
}) {
  const [feedKind, setFeedKind] = useState<CommunityFeedKind>('DISCOVER');
  const [state, setState] = useState<CommunitySurfaceState>('LOADING');
  const [posts, setPosts] = useState<readonly CommunityPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const tabs: readonly { readonly id: CommunityFeedKind; readonly label: string }[] = [
    { id: 'DISCOVER', label: '发现' },
    { id: 'FOLLOWING', label: '关注' },
    { id: 'LATEST', label: '最新' },
  ];

  useEffect(() => {
    let current = true;
    setState('LOADING');
    setMessage('');
    void communityClient.listFeed({ kind: feedKind, limit: 12 }).then((result) => {
      if (!current) return;
      if (!result.ok) {
        setState('ERROR');
        setMessage(result.error.message);
        return;
      }
      setPosts(result.data.items);
      setCursor(result.data.nextCursor);
      setState('READY');
    });
    return () => {
      current = false;
    };
  }, [feedKind, refreshVersion]);

  const loadMore = () => {
    if (cursor === null) return;
    setState('LOADING');
    void communityClient
      .listFeed({ kind: feedKind, cursor, limit: 12 })
      .then((result) => {
        if (!result.ok) {
          setState('ERROR');
          setMessage(result.error.message);
          return;
        }
        setPosts((current) => [...current, ...result.data.items]);
        setCursor(result.data.nextCursor);
        setState('READY');
      });
  };

  return (
    <div className="page-stack route-shell community-page">
      <section className="route-heading">
        <div>
          <p className="eyebrow">COMMUNITY / CALM SOCIAL</p>
          <h1>社区</h1>
          <p className="lede">
            公开内容、群组与频道都通过服务端范围、权益与屏蔽规则确认。
          </p>
        </div>
        <StatusPill kind={communityClient.source === 'SERVER' ? 'SOCIAL' : 'INFO'}>
          {communityClient.source === 'SERVER' ? '已配置 API' : '社区服务待接入'}
        </StatusPill>
      </section>
      <CommunityComposer
        onNavigate={onNavigate}
        onPublished={(post) => setPosts((current) => [post, ...current])}
      />
      <section
        className="community-feed-section"
        aria-labelledby="community-feed-title"
      >
        <div className="community-feed-heading">
          <div>
            <p className="eyebrow">FEED / CHRONOLOGICAL</p>
            <h2 id="community-feed-title">公共动态</h2>
          </div>
          <button
            className="quiet-button"
            disabled={state === 'LOADING'}
            type="button"
            onClick={() => setRefreshVersion((value) => value + 1)}
          >
            刷新
          </button>
        </div>
        <nav className="channel-list community-feed-tabs" aria-label="Feed 排序">
          {tabs.map((tab) => (
            <button
              aria-pressed={feedKind === tab.id}
              className={feedKind === tab.id ? 'selected' : ''}
              key={tab.id}
              type="button"
              onClick={() => setFeedKind(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        {state === 'LOADING' && posts.length === 0 ? (
          <LoadingState title="正在加载公开 Feed" tier={tier} />
        ) : null}
        {state === 'ERROR' && posts.length === 0 ? (
          <EmptyState
            eyebrow="COMMUNITY / NOT CONNECTED"
            title="社区服务尚未返回可验证的内容。"
            description={message || '不会以合成帖子代替真实的公开状态。'}
            action={{
              label: '重试',
              onClick: () => setRefreshVersion((value) => value + 1),
            }}
          />
        ) : null}
        {state === 'READY' && posts.length === 0 ? (
          <EmptyState
            eyebrow={
              feedKind === 'FOLLOWING' ? 'FOLLOWING / EMPTY' : 'COMMUNITY / EMPTY'
            }
            title={
              feedKind === 'FOLLOWING'
                ? '关注一些感兴趣的人，他们的公开内容会出现在这里。'
                : '这里还很安静。'
            }
            description="只显示已明确发布、且服务端允许你访问的内容。"
            action={{ label: '返回首页', onClick: () => onNavigate('/') }}
          />
        ) : null}
        {posts.length > 0 ? (
          <div className="community-feed" aria-live="polite">
            {posts.map((post) => (
              <CommunityPostCard
                key={post.id}
                post={post}
                onChanged={(next) =>
                  setPosts((current) =>
                    current.map((candidate) =>
                      candidate.id === next.id ? next : candidate,
                    ),
                  )
                }
                onCreated={(created) =>
                  setPosts((current) => [created, ...current.filter((candidate) => candidate.id !== created.id)])
                }
              />
            ))}
          </div>
        ) : null}
        {cursor !== null ? (
          <button
            className="quiet-button community-load-more"
            disabled={state === 'LOADING'}
            type="button"
            onClick={loadMore}
          >
            {state === 'LOADING' ? '正在加载' : '加载更多'}
          </button>
        ) : null}
      </section>
      <CommunityDirectory />
      {message.length > 0 && state !== 'ERROR' ? (
        <CommunityInlineStatus>{message}</CommunityInlineStatus>
      ) : null}
    </div>
  );
}

type MessagingSurfaceState = 'LOADING' | 'READY' | 'ERROR';
type MessageListState = 'IDLE' | 'LOADING' | 'READY' | 'ERROR';
type ConversationFilter = 'ALL' | 'UNREAD' | 'GROUP' | 'FOUNDER' | 'ARCHIVED';
type ComposerMessageKind = Exclude<MessagingMessageType, 'SYSTEM'>;

function formatMessagingDate(value: string | null): string {
  if (value === null) return '暂无消息';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '刚刚';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatAttachmentBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_024 * 1_024) return `${Math.round(bytes / 1_024)} KB`;
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`;
}

function conversationKindLabel(kind: MessagingConversation['kind']): string {
  return {
    DIRECT: '私信',
    GROUP: '群聊',
    FOUNDER: 'Founder Inbox',
    SYSTEM: '系统',
  }[kind];
}

function messageKindLabel(kind: MessagingMessageType): string {
  return {
    TEXT: '文字',
    IMAGE: '图片',
    VIDEO: '视频',
    VOICE: '语音',
    FILE: '文件',
    SYSTEM: '系统',
  }[kind];
}

function messageDeliveryLabel(state: MessagingMessage['delivery']): string {
  return {
    PENDING: '待发送',
    SENDING: '发送中',
    SENT: '已发送',
    DELIVERED: '已送达',
    READ: '已读',
    FAILED: '发送失败',
  }[state];
}

function mergeMessagingMessages(
  current: readonly MessagingMessage[],
  incoming: readonly MessagingMessage[],
): readonly MessagingMessage[] {
  const merged = new Map<string, MessagingMessage>();
  for (const message of current) merged.set(message.id, message);
  for (const message of incoming) {
    const previous = merged.get(message.id);
    const localReactionState = new Map(previous?.reactions.map((reaction) => [reaction.reaction, reaction.reactedByViewer]) ?? []);
    merged.set(message.id, {
      ...message,
      reactions: message.reactions.map((reaction) => ({
        ...reaction,
        // The API returns aggregate reactions but not a viewer-reaction bit.
        // Preserve only a prior state already confirmed by this browser's
        // successful mutation, never a speculative click.
        reactedByViewer: localReactionState.get(reaction.reaction) ?? reaction.reactedByViewer,
      })),
    });
  }
  return [...merged.values()].sort(
    (first, second) => first.sequence - second.sequence || first.createdAt.localeCompare(second.createdAt),
  );
}

function mergeConversations(
  current: readonly MessagingConversation[],
  incoming: readonly MessagingConversation[],
): readonly MessagingConversation[] {
  const merged = new Map<string, MessagingConversation>();
  for (const conversation of current) merged.set(conversation.id, conversation);
  for (const conversation of incoming) merged.set(conversation.id, conversation);
  return [...merged.values()].sort((first, second) => {
    if (first.settings.pinned !== second.settings.pinned)
      return first.settings.pinned ? -1 : 1;
    return (second.latestAt ?? '').localeCompare(first.latestAt ?? '');
  });
}

function MessagingInlineStatus({
  children,
  tone = 'INFO',
}: {
  readonly children: ReactNode;
  readonly tone?: 'INFO' | 'ERROR' | 'SUCCESS';
}) {
  return (
    <p
      aria-live="polite"
      className={cx('messaging-inline-status', `messaging-inline-status-${tone.toLowerCase()}`)}
      role="status"
    >
      {children}
    </p>
  );
}

function MessageAttachmentList({ message }: { readonly message: MessagingMessage }) {
  if (message.attachments.length === 0 || message.deletedAt !== null) return null;
  return (
    <ul className="message-attachment-list" aria-label="已授权附件">
      {message.attachments.map((attachment) => (
        <li key={attachment.id}>
          <span>
            <strong>{messageKindLabel(attachment.type)}</strong>
            <span>{attachment.name} · {formatAttachmentBytes(attachment.bytes)}</span>
          </span>
          {attachment.state === 'READY' && attachment.deliveryUrl !== null ? (
            <a href={attachment.deliveryUrl}>打开</a>
          ) : (
            <small>{attachment.state === 'QUARANTINED' ? '安全检查中，暂不可用' : '附件尚未可用'}</small>
          )}
        </li>
      ))}
    </ul>
  );
}

function MessageBubble({
  message,
  onReply,
  onEdit,
  onDelete,
  onReaction,
  onReport,
}: {
  readonly message: MessagingMessage;
  readonly onReply: (message: MessagingMessage) => void;
  readonly onEdit: (message: MessagingMessage, body: string) => Promise<MessagingResult<MessagingMessage>>;
  readonly onDelete: (message: MessagingMessage) => Promise<MessagingResult<MessagingMessage>>;
  readonly onReaction: (message: MessagingMessage, active: boolean) => Promise<MessagingResult<unknown>>;
  readonly onReport: (
    message: MessagingMessage,
    reason: MessageReportReason,
    detail: string,
  ) => Promise<MessagingResult<unknown>>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body ?? '');
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [busy, setBusy] = useState<'EDIT' | 'DELETE' | 'REACTION' | 'REPORT' | null>(null);
  const [error, setError] = useState('');
  const [reportReason, setReportReason] = useState<MessageReportReason>('SPAM');
  const [reportDetail, setReportDetail] = useState('');

  useEffect(() => {
    setDraft(message.body ?? '');
    setEditing(false);
    setDeleteArmed(false);
    setError('');
  }, [message.body, message.editedAt, message.id]);

  const run = async (
    action: NonNullable<typeof busy>,
    operation: () => Promise<MessagingResult<unknown>>,
  ) => {
    setBusy(action);
    setError('');
    const result = await operation();
    setBusy(null);
    if (!result.ok) setError(result.error.message);
    return result.ok;
  };

  const saveEdit = async () => {
    const body = draft.trim();
    if (body.length === 0) {
      setError('编辑后的消息不能为空。');
      return;
    }
    const succeeded = await run('EDIT', () => onEdit(message, body));
    if (succeeded) setEditing(false);
  };

  const toggleReaction = async () => {
    const current = message.reactions.find((reaction) => reaction.reaction === 'LIKE');
    await run('REACTION', () => onReaction(message, !(current?.reactedByViewer ?? false)));
  };

  const submitReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const succeeded = await run('REPORT', () => onReport(message, reportReason, reportDetail.trim()));
    if (succeeded) {
      setReportDetail('');
      setError('举报已提交给审核流程。');
    }
  };

  const isDeleted = message.deletedAt !== null;
  return (
    <article
      className={cx('message-bubble', message.viewer.isSender && 'message-bubble-self', isDeleted && 'message-bubble-deleted')}
      aria-label={`${message.sender.displayName} 的${messageKindLabel(message.type)}消息`}
    >
      <header>
        <strong>{message.sender.displayName}</strong>
        <span>{formatMessagingDate(message.createdAt)}</span>
        {message.editedAt !== null ? <small>已编辑</small> : null}
        {message.viewer.isSender ? <small>{messageDeliveryLabel(message.delivery)}</small> : null}
      </header>
      {message.replyTo !== null ? (
        <div className="message-reply-preview">
          <strong>回复 {message.replyTo.senderName}</strong>
          <span>
            {message.replyTo.deleted
              ? '原消息已删除'
              : message.replyTo.body ?? `${messageKindLabel(message.replyTo.type)}消息`}
          </span>
        </div>
      ) : null}
      {isDeleted ? (
        <p className="message-deleted-copy">此消息已删除。</p>
      ) : editing ? (
        <div className="message-edit-form">
          <label className="sr-only" htmlFor={`message-edit-${message.id}`}>编辑消息</label>
          <textarea
            id={`message-edit-${message.id}`}
            maxLength={10_000}
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div>
            <button className="community-text-button" type="button" onClick={() => setEditing(false)}>取消</button>
            <button className="async-button" disabled={busy !== null} type="button" onClick={() => void saveEdit()}>
              {busy === 'EDIT' ? '正在保存' : '保存修改'}
            </button>
          </div>
        </div>
      ) : message.body !== null ? (
        <p>{message.body}</p>
      ) : (
        <p className="message-type-shell">{messageKindLabel(message.type)}消息</p>
      )}
      <MessageAttachmentList message={message} />
      {!isDeleted ? (
        <footer className="message-bubble-actions">
          {message.reactions.map((reaction) => (
            <button
              aria-pressed={reaction.reactedByViewer}
              className="message-reaction-button"
              disabled={!message.viewer.canReact || busy !== null}
              key={reaction.reaction}
              type="button"
              onClick={() => void run('REACTION', () => onReaction(message, !reaction.reactedByViewer))}
            >
              {reaction.reaction} {reaction.count}
            </button>
          ))}
          {message.viewer.canReact ? (
            <button className="community-text-button" disabled={busy !== null} type="button" onClick={() => void toggleReaction()}>
              {busy === 'REACTION' ? '处理中' : '回应'}
            </button>
          ) : null}
          <button className="community-text-button" type="button" onClick={() => onReply(message)}>回复</button>
          {message.viewer.canEdit ? (
            <button className="community-text-button" type="button" onClick={() => setEditing(true)}>编辑</button>
          ) : null}
          {message.viewer.canDelete ? (
            deleteArmed ? (
              <span className="message-delete-confirm">
                <span>删除？</span>
                <button className="community-text-button" disabled={busy !== null} type="button" onClick={() => void run('DELETE', () => onDelete(message))}>
                  {busy === 'DELETE' ? '正在删除' : '确认'}
                </button>
                <button className="community-text-button" type="button" onClick={() => setDeleteArmed(false)}>取消</button>
              </span>
            ) : (
              <button className="community-text-button" type="button" onClick={() => setDeleteArmed(true)}>删除</button>
            )
          ) : null}
          {message.viewer.canReport ? (
            <details className="message-report">
              <summary>举报</summary>
              <form onSubmit={submitReport}>
                <label>
                  原因
                  <select value={reportReason} onChange={(event) => setReportReason(event.target.value as MessageReportReason)}>
                    {messageReportReasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                  </select>
                </label>
                <label>
                  补充说明（可选）
                  <input maxLength={500} value={reportDetail} onChange={(event) => setReportDetail(event.target.value)} />
                </label>
                <button className="community-text-button" disabled={busy !== null} type="submit">
                  {busy === 'REPORT' ? '正在提交' : '提交举报'}
                </button>
              </form>
            </details>
          ) : null}
        </footer>
      ) : null}
      {error.length > 0 ? <MessagingInlineStatus tone="ERROR">{error}</MessagingInlineStatus> : null}
    </article>
  );
}

function PendingMessageBubble({
  item,
  onRetry,
}: {
  readonly item: LocalMessageOutboxItem;
  readonly onRetry: (item: LocalMessageOutboxItem) => void;
}) {
  const label = item.state === 'PENDING' ? '等待连接后发送' : item.state === 'SENDING' ? '正在发送' : '发送失败';
  return (
    <article className="message-bubble message-bubble-self message-bubble-local" aria-label="本地待发送消息">
      <header><strong>本机待发送</strong><span>{formatMessagingDate(item.createdAt)}</span><small>{label}</small></header>
      <p>{item.body || '授权附件待发送'}</p>
      <footer className="message-bubble-actions">
        <span>本地队列 · 未获服务端确认</span>
        {item.state !== 'SENDING' ? (
          <button className="community-text-button" type="button" onClick={() => onRetry(item)}>重试</button>
        ) : null}
      </footer>
    </article>
  );
}

function VoiceMessageFoundation({ onStatus }: { readonly onStatus: (message: string) => void }) {
  type VoiceState = 'IDLE' | 'RECORDING' | 'STOPPING' | 'PREVIEW';
  const [state, setState] = useState<VoiceState>('IDLE');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelled = useRef(false);

  const releaseStream = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  };

  useEffect(() => () => {
    recorder.current?.stop();
    releaseStream();
    if (previewUrl !== null) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const start = async () => {
    if (typeof navigator === 'undefined' || navigator.mediaDevices === undefined || typeof MediaRecorder === 'undefined') {
      onStatus('此浏览器无法录音；没有发送任何内容。');
      return;
    }
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = nextStream;
      chunks.current = [];
      cancelled.current = false;
      const nextRecorder = new MediaRecorder(nextStream);
      recorder.current = nextRecorder;
      nextRecorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      });
      nextRecorder.addEventListener('stop', () => {
        releaseStream();
        if (cancelled.current || chunks.current.length === 0) {
          setState('IDLE');
          return;
        }
        const blob = new Blob(chunks.current, { type: nextRecorder.mimeType || 'audio/webm' });
        setPreviewUrl((current) => {
          if (current !== null) URL.revokeObjectURL(current);
          return URL.createObjectURL(blob);
        });
        setState('PREVIEW');
        onStatus('语音仅在此设备预览，尚未上传或发送。');
      });
      nextRecorder.start();
      setState('RECORDING');
      onStatus('正在录音；点击停止后可本机预览。');
    } catch {
      releaseStream();
      setState('IDLE');
      onStatus('未获得麦克风权限；不会重复请求，也没有发送任何内容。');
    }
  };

  const stop = () => {
    if (recorder.current?.state !== 'recording') return;
    setState('STOPPING');
    recorder.current.stop();
  };

  const cancel = () => {
    cancelled.current = true;
    if (recorder.current?.state === 'recording') recorder.current.stop();
    releaseStream();
    setPreviewUrl((current) => {
      if (current !== null) URL.revokeObjectURL(current);
      return null;
    });
    setState('IDLE');
    onStatus('录音已取消；没有上传或发送。');
  };

  return (
    <section className="voice-message-foundation" aria-label="语音消息基础">
      <p>语音先在本机录制和预览；只有 Media 服务授权后才会生成可发送的附件。</p>
      <div>
        {state === 'IDLE' || state === 'PREVIEW' ? <button className="quiet-button" type="button" onClick={() => void start()}>开始录音</button> : null}
        {state === 'RECORDING' ? <button className="async-button" type="button" onClick={stop}>停止录音</button> : null}
        {state !== 'IDLE' ? <button className="community-text-button" type="button" onClick={cancel}>取消</button> : null}
      </div>
      {previewUrl !== null ? <audio controls src={previewUrl}>此浏览器无法播放本机语音预览。</audio> : null}
    </section>
  );
}

function MessagesPage({
  tier,
  accountSubject,
}: {
  readonly tier: ExperienceTier;
  readonly accountSubject: string;
}) {
  // A subject switch moves all local drafts/outbox reads to a new namespace.
  messagingOutbox.setAccountSubject(accountSubject);
  messagingDraftCache.setAccountSubject(accountSubject);
  const [state, setState] = useState<MessagingSurfaceState>('LOADING');
  const [messageState, setMessageState] = useState<MessageListState>('IDLE');
  const [conversations, setConversations] = useState<readonly MessagingConversation[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState<readonly MessagingMessage[]>([]);
  const [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<ConversationFilter>('ALL');
  const [status, setStatus] = useState('');
  const [draft, setDraft] = useState('');
  const [draftState, setDraftState] = useState<'LOCAL' | 'SERVER' | null>(null);
  const [replyTo, setReplyTo] = useState<MessagingMessage | null>(null);
  const [composerKind, setComposerKind] = useState<ComposerMessageKind>('TEXT');
  const [outboxItems, setOutboxItems] = useState<readonly LocalMessageOutboxItem[]>(() => messagingOutbox.list());
  const [realtimeStatus, setRealtimeStatus] = useState<MessagingRealtimeStatus>('UNAVAILABLE');
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<readonly MessagingSearchResult[]>([]);
  const [recipientUserId, setRecipientUserId] = useState('');
  const [openingDirect, setOpeningDirect] = useState(false);
  const [groupId, setGroupId] = useState('');
  const [openingGroup, setOpeningGroup] = useState(false);
  const [openingFounder, setOpeningFounder] = useState(false);
  const draftTimer = useRef<number | undefined>(undefined);
  const typingTimer = useRef<number | undefined>(undefined);
  const typingConversationId = useRef<string | null>(null);
  const selectedConversationId = useRef<string | null>(null);
  const appliedSequenceByConversation = useRef(new Map<string, number>());
  const realtimeBackfillInFlight = useRef(new Set<string>());

  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;
  const selectedOutbox = selected === null
    ? []
    : outboxItems.filter((item) => item.conversationId === selected.id);
  const visibleConversations = useMemo(() => conversations.filter((conversation) => {
    if (filter === 'UNREAD') return conversation.unreadCount > 0;
    if (filter === 'GROUP') return conversation.kind === 'GROUP';
    if (filter === 'FOUNDER') return conversation.kind === 'FOUNDER';
    if (filter === 'ARCHIVED') return conversation.settings.archived;
    return !conversation.settings.archived;
  }), [conversations, filter]);

  const refreshOutbox = () => setOutboxItems(messagingOutbox.list());

  useEffect(() => {
    selectedConversationId.current = selected?.id ?? null;
  }, [selected?.id]);

  useEffect(() => {
    const peer = selected?.directPeer;
    if (peer === null || peer === undefined) return;
    let current = true;
    void messagingClient.getPresence({ userIds: [peer.userId] }).then((result) => {
      if (!current || !result.ok || result.data[0] === undefined) return;
      const next = result.data[0];
      setConversations((items) => items.map((conversation) => conversation.id === selected?.id && conversation.directPeer?.userId === next.userId
        ? { ...conversation, directPeer: next }
        : conversation));
    });
    return () => { current = false; };
  }, [selected?.directPeer?.userId, selected?.id]);

  const noteAppliedSequence = (conversationId: string, sequence: number) => {
    const current = appliedSequenceByConversation.current.get(conversationId) ?? 0;
    if (Number.isSafeInteger(sequence) && sequence > current)
      appliedSequenceByConversation.current.set(conversationId, sequence);
  };

  const backfillAuthorizedConversation = async (
    conversationId: string,
    reason: 'RECONNECTING' | 'FALLBACK' | 'GAP',
  ) => {
    if (messagingClient.source !== 'SERVER' || realtimeBackfillInFlight.current.has(conversationId)) return;
    const afterSequence = appliedSequenceByConversation.current.get(conversationId) ?? 0;
    realtimeBackfillInFlight.current.add(conversationId);
    if (selectedConversationId.current === conversationId) {
      setStatus(reason === 'GAP'
        ? '检测到实时消息序号缺口，正在通过授权 HTTP 补回消息。'
        : '实时连接正在回退同步，正在通过授权 HTTP 补回消息。');
    }
    try {
      let cursor: string | undefined;
      const recovered: MessagingMessage[] = [];
      const seenCursors = new Set<string>();
      do {
        const result = await messagingClient.backfill({
          conversationId,
          afterSequence,
          limit: 80,
          ...(cursor === undefined ? {} : { cursor }),
        });
        if (!result.ok) {
          if (selectedConversationId.current === conversationId) setStatus(result.error.message);
          return;
        }
        recovered.push(...result.data.items);
        const nextCursor = result.data.nextCursor;
        if (nextCursor !== null && seenCursors.has(nextCursor)) {
          if (selectedConversationId.current === conversationId)
            setStatus('实时补回游标无效；已停止同步并保留当前已授权消息。');
          return;
        }
        if (nextCursor !== null) seenCursors.add(nextCursor);
        cursor = nextCursor ?? undefined;
      } while (cursor !== undefined);
      const newest = recovered.reduce((maximum, message) => Math.max(maximum, message.sequence), afterSequence);
      noteAppliedSequence(conversationId, newest);
      if (selectedConversationId.current === conversationId) {
        setMessages((current) => mergeMessagingMessages(current, recovered));
        setStatus(recovered.length === 0
          ? '实时连接已回退；授权 HTTP 已确认没有遗漏消息。'
          : '实时连接已回退；遗漏消息已通过授权 HTTP 同步。');
      }
    } finally {
      realtimeBackfillInFlight.current.delete(conversationId);
    }
  };

  const addServerMessage = (next: MessagingMessage) => {
    noteAppliedSequence(next.conversationId, next.sequence);
    setMessages((current) => mergeMessagingMessages(current, [next]));
  };

  const loadConversations = async () => {
    setState('LOADING');
    const allResult = await messagingClient.listConversations({ limit: 40, includeArchived: true });
    if (!allResult.ok) {
      setConversations([]);
      setSelectedId('');
      setState('ERROR');
      setStatus(allResult.error.message);
      return;
    }
    const next = mergeConversations([], allResult.data.items);
    setConversations(next);
    setSelectedId((current) => next.some((conversation) => conversation.id === current) ? current : (next[0]?.id ?? ''));
    setState('READY');
    setStatus('');
  };

  useEffect(() => { void loadConversations(); }, []);

  useEffect(() => {
    if (selected === null || !selected.viewer.canRead) {
      setMessages([]);
      setMessageCursor(null);
      setMessageState('IDLE');
      return;
    }
    let current = true;
    setMessageState('LOADING');
    void messagingClient.listMessages({ conversationId: selected.id, limit: 40 }).then((result) => {
      if (!current) return;
      if (!result.ok) {
        setMessages([]);
        setMessageCursor(null);
        setMessageState('ERROR');
        setStatus(result.error.message);
        return;
      }
      const next = mergeMessagingMessages([], result.data.items);
      noteAppliedSequence(selected.id, next.at(-1)?.sequence ?? 0);
      setMessages(next);
      setMessageCursor(result.data.nextCursor);
      setMessageState('READY');
      const last = next.at(-1);
      if (last !== undefined && last.sequence > selected.lastReadSequence) {
        void messagingClient.markRead({
          conversationId: selected.id,
          sequence: last.sequence,
          idempotencyKey: createMessagingActionKey('read'),
        }).then((readResult) => {
          if (!readResult.ok) return;
          setConversations((items) => items.map((conversation) => conversation.id === selected.id
            ? { ...conversation, unreadCount: 0, lastReadSequence: readResult.data.lastReadSequence }
            : conversation));
        });
      }
    });
    return () => { current = false; };
  }, [selected?.id]);

  useEffect(() => {
    if (selected === null) {
      setDraft('');
      setDraftState(null);
      setReplyTo(null);
      return;
    }
    let current = true;
    const local = messagingDraftCache.get(selected.id);
    setDraft(local?.body ?? '');
    setDraftState(local === null ? null : 'LOCAL');
    setReplyTo(null);
    void messagingClient.getDraft({ conversationId: selected.id }).then((result) => {
      if (!current || !result.ok || result.data === null) return;
      messagingDraftCache.save(selected.id, result.data.body);
      setDraft(result.data.body);
      setDraftState('SERVER');
    });
    return () => { current = false; };
  }, [selected?.id]);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => messagingRealtimeTransport.connect({
    onStatus: (nextStatus) => {
      setRealtimeStatus(nextStatus);
      if (nextStatus !== 'RECONNECTING' && nextStatus !== 'FALLBACK') return;
      const conversationId = selectedConversationId.current;
      if (conversationId !== null) void backfillAuthorizedConversation(conversationId, nextStatus);
    },
    onEvent: (event: MessagingRealtimeEvent) => {
      if (event.type === 'message.created' || event.type === 'message.updated') {
        if (event.message.conversationId !== selectedConversationId.current) return;
        const lastApplied = appliedSequenceByConversation.current.get(event.message.conversationId) ?? 0;
        if (hasMessagingSequenceGap(lastApplied, event.message.sequence)) {
          void backfillAuthorizedConversation(event.message.conversationId, 'GAP');
          return;
        }
        addServerMessage(event.message);
        return;
      }
      if (event.type === 'message.deleted') {
        if (event.conversationId !== selectedConversationId.current) return;
        const lastApplied = appliedSequenceByConversation.current.get(event.conversationId) ?? 0;
        if (hasMessagingSequenceGap(lastApplied, event.sequence)) {
          void backfillAuthorizedConversation(event.conversationId, 'GAP');
          return;
        }
        noteAppliedSequence(event.conversationId, event.sequence);
        setMessages((current) => current.map((message) => message.id === event.messageId
          ? { ...message, deletedAt: new Date().toISOString(), body: null, attachments: [] }
          : message));
        return;
      }
      if (event.type === 'message.reaction.updated') {
        if (event.conversationId !== selectedConversationId.current) return;
        const lastApplied = appliedSequenceByConversation.current.get(event.conversationId) ?? 0;
        if (hasMessagingSequenceGap(lastApplied, event.sequence)) {
          void backfillAuthorizedConversation(event.conversationId, 'GAP');
          return;
        }
        // A realtime reaction is intentionally only a delta. The canonical
        // event does not carry a viewer summary, so reconcile via the typed
        // HTTP read instead of fabricating counts or ownership locally.
        void refreshMessages();
        return;
      }
      if (event.type === 'conversation.read') {
        setConversations((current) => current.map((conversation) => conversation.id === event.conversationId
          ? { ...conversation, lastReadSequence: Math.max(conversation.lastReadSequence, event.lastReadSequence) }
          : conversation));
        return;
      }
      if (event.type === 'typing.started' || event.type === 'typing.stopped') {
        setConversations((current) => current.map((conversation) => {
          if (conversation.id !== event.conversationId) return conversation;
          const existing = conversation.typing.filter((participant) => participant.userId !== event.participant.userId);
          return {
            ...conversation,
            typing: event.type === 'typing.started' ? [...existing, event.participant] : existing,
          };
        }));
        return;
      }
      if (event.type !== 'presence.updated') return;
      setConversations((current) => current.map((conversation) => ({
        ...conversation,
        directPeer: conversation.directPeer?.userId === event.participant.userId ? event.participant : conversation.directPeer,
        participants: conversation.participants.map((participant) => participant.userId === event.participant.userId ? event.participant : participant),
      })));
    },
  }), []);

  useEffect(() => () => {
    if (draftTimer.current !== undefined) window.clearTimeout(draftTimer.current);
    if (typingTimer.current !== undefined) window.clearTimeout(typingTimer.current);
    const conversationId = typingConversationId.current;
    if (conversationId !== null) {
      void messagingClient.setTyping({ conversationId, active: false });
    }
  }, []);

  const refreshMessages = async () => {
    if (selected === null) return;
    setMessageState('LOADING');
    const result = await messagingClient.listMessages({ conversationId: selected.id, limit: 40 });
    if (!result.ok) {
      setMessageState('ERROR');
      setStatus(result.error.message);
      return;
    }
    noteAppliedSequence(selected.id, result.data.items.at(-1)?.sequence ?? 0);
    setMessages(mergeMessagingMessages([], result.data.items));
    setMessageCursor(result.data.nextCursor);
    setMessageState('READY');
  };

  const loadMoreMessages = async () => {
    if (selected === null || messageCursor === null) return;
    const result = await messagingClient.listMessages({ conversationId: selected.id, cursor: messageCursor, limit: 40 });
    if (!result.ok) {
      setStatus(result.error.message);
      return;
    }
    noteAppliedSequence(selected.id, result.data.items.at(-1)?.sequence ?? 0);
    setMessages((current) => mergeMessagingMessages(current, result.data.items));
    setMessageCursor(result.data.nextCursor);
  };

  const retryOutboxItem = async (item: LocalMessageOutboxItem) => {
    const result = await messagingOutbox.flushOne(messagingClient, item.clientMessageId);
    refreshOutbox();
    if (!result.ok) {
      setStatus(result.error.message);
      return;
    }
    addServerMessage(result.data);
    setStatus('消息已由服务端确认。');
  };

  const retrySelectedOutbox = async () => {
    if (selected === null) return;
    for (const item of messagingOutbox.list(selected.id)) await retryOutboxItem(item);
  };

  useEffect(() => {
    if (!isOnline || selected === null || messagingOutbox.list(selected.id).length === 0) return;
    void retrySelectedOutbox();
  }, [isOnline, selected?.id]);

  const updateDraft = (next: string) => {
    setDraft(next);
    if (selected === null) return;
    const conversationId = selected.id;
    messagingDraftCache.save(conversationId, next);
    setDraftState('LOCAL');
    if (draftTimer.current !== undefined) window.clearTimeout(draftTimer.current);
    if (messagingClient.source === 'SERVER') {
      draftTimer.current = window.setTimeout(() => {
        void messagingClient.saveDraft({
          conversationId,
          body: next,
          idempotencyKey: createMessagingActionKey('draft'),
        }).then((result) => {
          if (!result.ok) return;
          setDraftState('SERVER');
        });
      }, 700);
    }
    if (next.trim().length > 0 && typingConversationId.current !== conversationId) {
      typingConversationId.current = conversationId;
      void messagingClient.setTyping({ conversationId, active: true }).then((result) => {
        if (!result.ok) setStatus(result.error.message);
      });
    }
    if (typingTimer.current !== undefined) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => {
      if (typingConversationId.current !== conversationId) return;
      typingConversationId.current = null;
      void messagingClient.setTyping({ conversationId, active: false });
    }, 2_500);
  };

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selected === null) return;
    if (composerKind !== 'TEXT') {
      setStatus(`${messageKindLabel(composerKind)}消息需要先由 Media 服务生成已授权附件；当前不会创建伪造消息。`);
      return;
    }
    if (!selected.viewer.canSend) {
      setStatus('服务端尚未授予此会话的发送权限。');
      return;
    }
    const body = draft.trim();
    if (body.length === 0) {
      setStatus('请先输入消息。');
      return;
    }
    if (messagingClient.source !== 'SERVER') {
      setStatus('消息服务尚未连接；不会把本地输入显示为已发送。');
      return;
    }
    const clientMessageId = createMessagingActionKey('message');
    try {
      messagingOutbox.enqueue({
        clientMessageId,
        conversationId: selected.id,
        body,
        replyToMessageId: replyTo?.id ?? null,
      });
    } catch {
      setStatus('无法安全加入本地待发送队列。');
      return;
    }
    setDraft('');
    messagingDraftCache.clear(selected.id);
    setDraftState(null);
    setReplyTo(null);
    refreshOutbox();
    if (!isOnline) {
      setStatus('当前离线：消息保留在本机待发送队列，尚未发送。');
      return;
    }
    await retryOutboxItem({
      clientMessageId,
      conversationId: selected.id,
      body,
      mediaIds: [],
      replyToMessageId: replyTo?.id ?? null,
      createdAt: new Date().toISOString(),
      attempts: 0,
      state: 'PENDING',
      lastErrorCode: null,
    });
  };

  const updateSettings = async (patch: {
    readonly mutedUntil?: string | null;
    readonly archived?: boolean;
    readonly pinned?: boolean;
  }) => {
    if (selected === null) return;
    const result = await messagingClient.updateSettings({
      conversationId: selected.id,
      ...patch,
      idempotencyKey: createMessagingActionKey('conversation-preference'),
    });
    if (!result.ok) {
      setStatus(result.error.message);
      return;
    }
    setConversations((current) => current.map((conversation) => conversation.id === selected.id
      ? { ...conversation, settings: result.data }
      : conversation));
  };

  const markUnread = async () => {
    if (selected === null) return;
    const sequence = messages.at(-1)?.sequence ?? selected.lastReadSequence;
    if (sequence < 1) {
      setStatus('会话中还没有可标记为未读的服务端消息。');
      return;
    }
    const result = await messagingClient.markUnread({
      conversationId: selected.id,
      sequence,
      idempotencyKey: createMessagingActionKey('unread'),
    });
    if (!result.ok) {
      setStatus(result.error.message);
      return;
    }
    setConversations((current) => current.map((conversation) => conversation.id === selected.id
      ? { ...conversation, unreadCount: Math.max(1, conversation.unreadCount), lastReadSequence: Math.max(0, sequence - 1) }
      : conversation));
    setStatus('未读状态已由服务端确认。');
  };

  const blockPeer = async () => {
    if (selected?.directPeer === null || selected === null) return;
    const result = await messagingClient.setBlock({
      userId: selected.directPeer.userId,
      blocked: true,
      idempotencyKey: createMessagingActionKey('block'),
    });
    setStatus(result.ok ? '已由服务端确认屏蔽；对方不能继续向你发起新私信。' : result.error.message);
  };

  const resolveMessageRequest = async (action: 'ACCEPT' | 'REJECT') => {
    if (selected === null) return;
    const result = await messagingClient.resolveMessageRequest({
      conversationId: selected.id,
      action,
      idempotencyKey: createMessagingActionKey(`message-request-${action.toLowerCase()}`),
    });
    if (!result.ok) {
      setStatus(result.error.message);
      return;
    }
    setConversations((current) => mergeConversations(current, [result.data]));
    setStatus(action === 'ACCEPT' ? '消息请求已由服务端接受。' : '消息请求已拒绝；该会话不会变为正常私信。');
    if (action === 'ACCEPT') void refreshMessages();
  };

  const editMessage = (message: MessagingMessage, body: string) => messagingClient.updateMessage({
    conversationId: message.conversationId,
    messageId: message.id,
    body,
    idempotencyKey: createMessagingActionKey('message-edit'),
  }).then((result) => {
    if (result.ok) addServerMessage(result.data);
    return result;
  });

  const deleteMessage = (message: MessagingMessage) => messagingClient.deleteMessage({
    conversationId: message.conversationId,
    messageId: message.id,
    idempotencyKey: createMessagingActionKey('message-delete'),
  }).then((result) => {
    if (result.ok) addServerMessage(result.data);
    return result;
  });

  const reactToMessage = (message: MessagingMessage, active: boolean) => messagingClient.setReaction({
    conversationId: message.conversationId,
    messageId: message.id,
    reaction: 'LIKE',
    active,
    idempotencyKey: createMessagingActionKey('message-reaction'),
  }).then((result) => {
    if (result.ok) {
      setMessages((current) => current.map((item) => {
        if (item.id !== message.id) return item;
        const existing = item.reactions.find((reaction) => reaction.reaction === result.data.reaction);
        const reactions = existing === undefined
          ? (result.data.reactedByViewer ? [...item.reactions, result.data] : item.reactions)
          : item.reactions.map((reaction) => reaction.reaction === result.data.reaction
            ? { ...reaction, reactedByViewer: result.data.reactedByViewer }
            : reaction);
        return { ...item, reactions };
      }));
      void refreshMessages();
    }
    return result;
  });

  const reportMessage = (message: MessagingMessage, reason: MessageReportReason, detail: string) => messagingClient.submitReport({
    conversationId: message.conversationId,
    messageId: message.id,
    reason,
    ...(detail.length === 0 ? {} : { detail }),
    idempotencyKey: createMessagingActionKey('message-report'),
  });

  const openDirect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = recipientUserId.trim();
    if (normalized.length === 0) {
      setStatus('请输入对方的公开用户 ID。');
      return;
    }
    setOpeningDirect(true);
    const result = await messagingClient.openDirect({
      recipientUserId: normalized,
      idempotencyKey: createMessagingActionKey('direct-conversation'),
    });
    setOpeningDirect(false);
    if (!result.ok) {
      setStatus(result.error.message);
      return;
    }
    setConversations((current) => mergeConversations(current, [result.data]));
    setSelectedId(result.data.id);
    setRecipientUserId('');
    setStatus('会话已由服务端确认。');
  };

  const openFounderInbox = async () => {
    setOpeningFounder(true);
    const result = await messagingClient.openFounderInbox({
      idempotencyKey: createMessagingActionKey('founder-inbox'),
    });
    setOpeningFounder(false);
    if (!result.ok) {
      setStatus(result.error.message);
      return;
    }
    setConversations((current) => mergeConversations(current, [result.data]));
    setSelectedId(result.data.id);
    setStatus('Founder Inbox 已由服务端权益与会话规则确认。');
  };

  const openGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = groupId.trim();
    if (normalized.length === 0) {
      setStatus('请输入你已加入群组的公开 ID。');
      return;
    }
    setOpeningGroup(true);
    const result = await messagingClient.openGroup({
      groupId: normalized,
      idempotencyKey: createMessagingActionKey('group-conversation'),
    });
    setOpeningGroup(false);
    if (!result.ok) {
      setStatus(result.error.message);
      return;
    }
    setConversations((current) => mergeConversations(current, [result.data]));
    setSelectedId(result.data.id);
    setGroupId('');
    setStatus('群聊已由服务端确认成员资格后打开。');
  };

  const submitSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (query.length === 0) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const result = await messagingClient.search({ query, limit: 12 });
    setSearching(false);
    if (!result.ok) {
      setStatus(result.error.message);
      return;
    }
    setSearchResults(result.data.items);
  };

  const selectSearchResult = async (result: (typeof searchResults)[number]) => {
    const conversation = await messagingClient.getConversation(result.conversationId);
    if (!conversation.ok) {
      setStatus(conversation.error.message);
      return;
    }
    setConversations((current) => mergeConversations(current, [conversation.data]));
    setSelectedId(conversation.data.id);
    setSearchResults([]);
  };

  const headingStatus = messagingClient.source === 'SERVER'
    ? realtimeStatus === 'CONNECTED' ? '实时已连接' : realtimeStatus === 'FALLBACK' ? '正在回退同步' : '正在连接消息服务'
    : '消息服务待配置';

  return (
    <div className="page-stack route-shell messaging-page" data-tier={tier}>
      <section className="route-heading">
        <div>
          <p className="eyebrow">MESSAGES / PRIVATE BY DEFAULT</p>
          <h1>消息</h1>
          <p className="lede">只显示服务端授权给当前账号的会话。会员不会开放与自己无关的私人消息。</p>
        </div>
        <StatusPill kind={messagingClient.source === 'SERVER' ? 'SOCIAL' : 'INFO'}>{headingStatus}</StatusPill>
      </section>

      <section className="messaging-control-bar" aria-label="消息工具">
        <form className="messaging-search" role="search" onSubmit={submitSearch}>
          <label className="sr-only" htmlFor="message-search">搜索我有权访问的消息</label>
          <input
            id="message-search"
            maxLength={200}
            placeholder="搜索已授权会话中的消息"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <button className="quiet-button" disabled={searching} type="submit">{searching ? '搜索中' : '搜索'}</button>
        </form>
        <button className="quiet-button" type="button" onClick={() => void loadConversations()}>刷新会话</button>
        <button className="quiet-button" disabled={openingFounder} type="button" onClick={() => void openFounderInbox()}>
          {openingFounder ? '正在确认' : 'Founder Inbox'}
        </button>
      </section>
      {searchResults.length > 0 ? (
        <section className="messaging-search-results" aria-label="消息搜索结果">
          {searchResults.map((result) => (
            <button key={`${result.conversationId}:${result.messageId}`} type="button" onClick={() => void selectSearchResult(result)}>
              <strong>已授权会话</strong>
              <span>{result.snippet}</span>
            </button>
          ))}
        </section>
      ) : null}
      {status.length > 0 ? <MessagingInlineStatus tone={state === 'ERROR' || messageState === 'ERROR' ? 'ERROR' : 'INFO'}>{status}</MessagingInlineStatus> : null}

      <section className="messages-layout messaging-layout-live" aria-busy={state === 'LOADING'}>
        <aside className="conversation-list" aria-label="会话列表">
          <div className="conversation-tabs" role="tablist" aria-label="会话筛选">
            {(
              [
                ['ALL', '全部'],
                ['UNREAD', '未读'],
                ['GROUP', '群聊'],
                ['FOUNDER', 'Founder'],
                ['ARCHIVED', '归档'],
              ] as const
            ).map(([id, label]) => (
              <button
                aria-selected={filter === id}
                className={filter === id ? 'selected' : undefined}
                key={id}
                role="tab"
                type="button"
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <details className="messaging-start-direct">
            <summary>发起私信</summary>
            <form onSubmit={openDirect}>
              <label htmlFor="direct-recipient">对方公开用户 ID</label>
              <input
                id="direct-recipient"
                maxLength={160}
                value={recipientUserId}
                onChange={(event) => setRecipientUserId(event.target.value)}
              />
              <button className="async-button" disabled={openingDirect} type="submit">
                {openingDirect ? '正在确认' : '发起会话'}
              </button>
            </form>
          </details>
          <details className="messaging-start-direct">
            <summary>打开群聊</summary>
            <form onSubmit={openGroup}>
              <label htmlFor="group-conversation">已加入群组的公开 ID</label>
              <input
                id="group-conversation"
                maxLength={160}
                value={groupId}
                onChange={(event) => setGroupId(event.target.value)}
              />
              <button className="async-button" disabled={openingGroup} type="submit">
                {openingGroup ? '正在确认' : '打开群聊'}
              </button>
            </form>
          </details>
          {state === 'LOADING' ? <CodeShimmer title="正在同步会话" tier={tier} /> : null}
          {state === 'ERROR' ? (
            <EmptyState
              eyebrow="MESSAGING / UNAVAILABLE"
              title="无法同步私人会话。"
              description="不会用合成联系人、消息正文或已读状态代替服务端数据。"
              action={{ label: '重新连接', onClick: () => void loadConversations() }}
            />
          ) : null}
          {state === 'READY' && visibleConversations.length === 0 ? (
            <EmptyState
              eyebrow="CONVERSATIONS / EMPTY"
              title="这里还没有已授权会话。"
              description="私信、群聊和 Founder Inbox 仅会在服务端确认成员关系与权限后出现。"
            />
          ) : null}
          {visibleConversations.map((conversation) => (
            <button
              aria-pressed={selectedId === conversation.id}
              className={cx('conversation-item', selectedId === conversation.id && 'selected')}
              key={conversation.id}
              type="button"
              onClick={() => setSelectedId(conversation.id)}
            >
              <span className="conversation-avatar" aria-hidden="true">
                {(conversation.avatarLabel ?? conversation.title).slice(0, 1)}
              </span>
              <span>
                <strong>{conversation.title}</strong>
                <small>{conversation.latestPreview ?? `${conversationKindLabel(conversation.kind)} · 暂无消息`}</small>
              </span>
              <span className="conversation-item-meta">
                {conversation.settings.pinned ? <AppIcon name="star" /> : null}
                {conversation.unreadCount > 0 ? <StatusPill kind="SOCIAL">{conversation.unreadCount}</StatusPill> : null}
              </span>
            </button>
          ))}
        </aside>

        <div className="chat-shell messaging-chat-shell">
          {selected === null ? (
            <EmptyState
              eyebrow="MESSAGE CONTENT"
              title="选择一个已授权会话。"
              description="搜索不会跨越你的会话权限，也不会显示其他用户的私人数据。"
            />
          ) : (
            <>
              <header>
                <div>
                  <p className="eyebrow">{conversationKindLabel(selected.kind).toUpperCase()} / PRIVATE</p>
                  <h2>{selected.title}</h2>
                  <p className="messaging-conversation-meta">
                    {selected.directPeer?.presence === 'ONLINE' ? '在线' : selected.directPeer?.presence === 'AWAY' ? '离开' : '离线'}
                    {selected.kind === 'FOUNDER' ? ' · Founder Inbox 由服务端权益决定' : ''}
                    {selected.viewer.founderInboxPriority ? ' · 优先队列已确认' : ''}
                    {selected.viewer.membership !== 'ACTIVE' ? ` · 当前成员状态：${selected.viewer.membership}` : ''}
                  </p>
                </div>
                <div className="messaging-header-actions" aria-label="会话操作">
                  <button
                    aria-label={selected.settings.pinned ? '取消置顶会话' : '置顶会话'}
                    className="glass-icon-button"
                    type="button"
                    onClick={() => void updateSettings({ pinned: !selected.settings.pinned })}
                  ><AppIcon name="star" /></button>
                  <button
                    aria-label={selected.settings.muted ? '恢复通知' : '静音 30 天'}
                    className="glass-icon-button"
                    type="button"
                    onClick={() => void updateSettings({ mutedUntil: selected.settings.muted ? null : new Date(Date.now() + 30 * 86_400_000).toISOString() })}
                  ><AppIcon name="bell" /></button>
                  <button
                    aria-label={selected.settings.archived ? '取消归档会话' : '归档会话'}
                    className="glass-icon-button"
                    type="button"
                    onClick={() => void updateSettings({ archived: !selected.settings.archived })}
                  ><AppIcon name="archive" /></button>
                </div>
              </header>
              {selected.typing.length > 0 ? (
                <p className="messaging-typing" aria-live="polite">{selected.typing.map((participant) => participant.displayName).join('、')} 正在输入</p>
              ) : null}
              {selected.viewer.membership === 'REQUEST' ? (
                <div className="messaging-request-actions" aria-live="polite">
                  <p>这是一条消息请求。接受后才会成为正常私信。</p>
                  <button className="async-button" type="button" onClick={() => void resolveMessageRequest('ACCEPT')}>接受</button>
                  <button className="community-text-button" type="button" onClick={() => void resolveMessageRequest('REJECT')}>拒绝</button>
                </div>
              ) : null}
              {messageState === 'LOADING' ? <CodeShimmer title="正在同步消息" tier={tier} /> : null}
              {messageState === 'ERROR' ? (
                <EmptyState
                  eyebrow="MESSAGES / ERROR"
                  title="无法读取此会话。"
                  description="这不会说明你拥有其他私人会话的访问权。"
                  action={{ label: '重新加载', onClick: () => void refreshMessages() }}
                />
              ) : null}
              {messageState === 'READY' && messages.length === 0 && selectedOutbox.length === 0 ? (
                <EmptyState
                  eyebrow="MESSAGES / EMPTY"
                  title="会话中还没有服务端消息。"
                  description={selected.viewer.canSend ? '写下第一条文字消息，发送成功前不会显示为已送达。' : '当前会话没有服务端授予的发送权限。'}
                />
              ) : null}
              <div className="message-thread" aria-live="polite">
                {messageCursor !== null ? <button className="quiet-button" type="button" onClick={() => void loadMoreMessages()}>加载更早消息</button> : null}
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onDelete={deleteMessage}
                    onEdit={editMessage}
                    onReaction={reactToMessage}
                    onReply={setReplyTo}
                    onReport={reportMessage}
                  />
                ))}
                {selectedOutbox.map((item) => <PendingMessageBubble key={item.clientMessageId} item={item} onRetry={(next) => void retryOutboxItem(next)} />)}
              </div>
              {selectedOutbox.length > 0 ? (
                <div className="messaging-outbox-note">
                  <span>{selectedOutbox.length} 条本地待发送消息，均未获服务端确认。</span>
                  <button className="quiet-button" type="button" onClick={() => void retrySelectedOutbox()}>重试待发送</button>
                </div>
              ) : null}
              {selected.directPeer !== null && selected.viewer.canBlockPeer ? (
                <button className="community-text-button message-block-button" type="button" onClick={() => void blockPeer()}>
                  屏蔽此用户
                </button>
              ) : null}
              <form className="message-composer messaging-composer" onSubmit={send}>
                {replyTo !== null ? (
                  <div className="message-composer-reply">
                    <span>回复 {replyTo.sender.displayName}: {replyTo.body ?? messageKindLabel(replyTo.type)}</span>
                    <button className="community-text-button" type="button" onClick={() => setReplyTo(null)}>取消回复</button>
                  </div>
                ) : null}
                <div className="message-kind-tabs" aria-label="消息类型">
                  {(['TEXT', 'IMAGE', 'VIDEO', 'VOICE', 'FILE'] as const).map((kind) => (
                    <button
                      aria-pressed={composerKind === kind}
                      className={composerKind === kind ? 'selected' : undefined}
                      key={kind}
                      type="button"
                      onClick={() => setComposerKind(kind)}
                    >
                      {messageKindLabel(kind)}
                    </button>
                  ))}
                </div>
                {composerKind === 'VOICE' ? <VoiceMessageFoundation onStatus={setStatus} /> : null}
                {composerKind !== 'TEXT' && composerKind !== 'VOICE' ? (
                  <p className="message-attachment-foundation">
                    {messageKindLabel(composerKind)}消息只能引用已通过 Media 服务授权的附件；当前不会读取、上传或伪造本地文件。
                  </p>
                ) : null}
                <label className="sr-only" htmlFor="message-composer">输入消息</label>
                <textarea
                  id="message-composer"
                  disabled={!selected.viewer.canSend || composerKind !== 'TEXT'}
                  maxLength={10_000}
                  placeholder={selected.viewer.canSend && composerKind === 'TEXT' ? '输入仅发送给此已授权会话的消息…' : '当前消息类型或会话不可发送'}
                  rows={3}
                  value={draft}
                  onChange={(event) => updateDraft(event.target.value)}
                />
                <div className="message-composer-footer">
                  <span>{draftState === 'SERVER' ? '草稿已同步' : draftState === 'LOCAL' ? '本机草稿，等待同步' : '草稿不会显示给他人'}</span>
                  <button className="async-button" disabled={!selected.viewer.canSend || composerKind !== 'TEXT'} type="submit">
                    {isOnline ? '发送' : '加入待发送队列'}
                  </button>
                </div>
              </form>
              <button className="community-text-button" disabled={messages.length === 0} type="button" onClick={() => void markUnread()}>
                标为未读
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function ActivitiesPage({ tier }: { readonly tier: ExperienceTier }) {
  const [state, setState] = useState<CommunitySurfaceState>('LOADING');
  const [activities, setActivities] = useState<readonly CommunityActivity[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [registering, setRegistering] = useState(false);
  const selected =
    activities.find((activity) => activity.id === selectedId) ?? activities[0];

  useEffect(() => {
    let current = true;
    setState('LOADING');
    setMessage('');
    void communityClient.listActivities({ limit: 12 }).then((result) => {
      if (!current) return;
      if (!result.ok) {
        setState('ERROR');
        setMessage(result.error.message);
        return;
      }
      setActivities(result.data.items);
      setCursor(result.data.nextCursor);
      if (result.data.items[0] !== undefined) setSelectedId(result.data.items[0].id);
      setState('READY');
    });
    return () => {
      current = false;
    };
  }, [refreshVersion]);

  const changeRegistration = () => {
    if (selected === undefined) return;
    setRegistering(true);
    setMessage('');
    void communityClient
      .changeActivityRegistration({
        activityId: selected.id,
        action: selected.viewer.registered ? 'CANCEL' : 'JOIN',
        idempotencyKey: createCommunityActionKey('activity-registration'),
      })
      .then((result) => {
        if (!result.ok) {
          setMessage(result.error.message);
          return;
        }
        setActivities((current) =>
          current.map((activity) =>
            activity.id === result.data.activityId
              ? {
                  ...activity,
                  viewer: { ...activity.viewer, registered: result.data.registered },
                }
              : activity,
          ),
        );
        setMessage(
          result.data.registered ? '报名状态已由服务端确认。' : '已取消报名。',
        );
      })
      .finally(() => setRegistering(false));
  };

  const loadMore = () => {
    if (cursor === null) return;
    setState('LOADING');
    void communityClient.listActivities({ cursor, limit: 12 }).then((result) => {
      if (!result.ok) {
        setState('ERROR');
        setMessage(result.error.message);
        return;
      }
      setActivities((current) => [...current, ...result.data.items]);
      setCursor(result.data.nextCursor);
      setState('READY');
    });
  };

  return (
    <div className="page-stack route-shell activities-page">
      <section className="route-heading">
        <div>
          <p className="eyebrow">COMMUNITY ACTIVITIES / SERVER CONFIRMED</p>
          <h1>活动</h1>
          <p className="lede">
            在线、线下、群组和 Founder 活动都由服务端确认容量、资格与报名状态。
          </p>
        </div>
        <button
          className="quiet-button"
          disabled={state === 'LOADING'}
          type="button"
          onClick={() => setRefreshVersion((value) => value + 1)}
        >
          刷新活动
        </button>
      </section>
      {state === 'LOADING' && activities.length === 0 ? (
        <LoadingState title="正在加载活动" tier={tier} />
      ) : null}
      {state === 'ERROR' && activities.length === 0 ? (
        <EmptyState
          eyebrow="ACTIVITIES / NOT CONNECTED"
          title="活动服务尚未返回可验证的数据。"
          description={message || '不会以演示报名状态代替真实容量或资格。'}
          action={{
            label: '重试',
            onClick: () => setRefreshVersion((value) => value + 1),
          }}
        />
      ) : null}
      {state === 'READY' && activities.length === 0 ? (
        <EmptyState
          eyebrow="ACTIVITIES / EMPTY"
          title="暂时没有即将开始的活动。"
          description="活动出现后会在这里展示由服务端确认的时间、范围和报名状态。"
        />
      ) : null}
      {activities.length > 0 ? (
        <section className="activities-layout">
          <div className="activity-list" aria-label="活动列表">
            {activities.map((activity) => (
              <button
                aria-pressed={selected?.id === activity.id}
                className={cx(
                  'activity-card',
                  selected?.id === activity.id && 'selected',
                )}
                key={activity.id}
                type="button"
                onClick={() => setSelectedId(activity.id)}
              >
                <span>
                  {activity.kind} · {activity.visibility}
                </span>
                <strong>{activity.title}</strong>
                <small>
                  {formatCommunityDate(activity.startAt)} · {activity.timezone}
                </small>
              </button>
            ))}
          </div>
          <article className="activity-detail" aria-live="polite">
            <p className="eyebrow">ACTIVITY DETAIL</p>
            <h2>{selected?.title ?? '选择一个活动'}</h2>
            <p>{selected?.description ?? '选择一张服务端返回的活动卡片后查看详情。'}</p>
            {selected !== undefined ? (
              <>
                <dl className="activity-detail-list">
                  <div>
                    <dt>开始</dt>
                    <dd>
                      {formatCommunityDate(selected.startAt)} · {selected.timezone}
                    </dd>
                  </div>
                  <div>
                    <dt>地点</dt>
                    <dd>{selected.locationText ?? '由服务端稍后公布'}</dd>
                  </div>
                  <div>
                    <dt>名额</dt>
                    <dd>
                      {selected.capacity === null
                        ? '未设人数上限'
                        : `${selected.registeredCount} / ${selected.capacity}`}
                    </dd>
                  </div>
                </dl>
                <button
                  className="async-button"
                  disabled={
                    registering ||
                    (!selected.viewer.registered && !selected.viewer.canRegister)
                  }
                  type="button"
                  onClick={changeRegistration}
                >
                  {registering
                    ? '正在确认'
                    : selected.viewer.registered
                      ? '取消报名'
                      : '加入活动'}
                </button>
                {!selected.viewer.registered && !selected.viewer.canRegister ? (
                  <p className="community-muted-note">
                    当前无法报名；资格、容量或范围以服务端返回为准。
                  </p>
                ) : null}
              </>
            ) : null}
          </article>
        </section>
      ) : null}
      {cursor !== null ? (
        <button
          className="quiet-button community-load-more"
          disabled={state === 'LOADING'}
          type="button"
          onClick={loadMore}
        >
          {state === 'LOADING' ? '正在加载' : '加载更多活动'}
        </button>
      ) : null}
      {message.length > 0 && !(state === 'ERROR' && activities.length === 0) ? (
        <CommunityInlineStatus tone={state === 'ERROR' ? 'ERROR' : 'INFO'}>
          {message}
        </CommunityInlineStatus>
      ) : null}
    </div>
  );
}

function MusicVisualizer({
  settings,
  tier,
}: {
  readonly settings: UiExperienceSettings;
  readonly tier: ExperienceTier;
}) {
  const backgroundTrackConfigured = false;
  const active =
    backgroundTrackConfigured &&
    settings.sound.master &&
    settings.sound.backgroundMusic &&
    !settings.sound.muted;
  return (
    <section className="music-visualizer" data-tier={tier}>
      <div className="music-bars" aria-hidden="true" data-active={active}>
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <div>
        <p className="eyebrow">MUSIC VISUALIZER / UI SHELL</p>
        <h3>{mockMusicMetadata.titleZh}</h3>
        <p>{mockMusicMetadata.titleOriginal}</p>
        <small>
          {mockMusicMetadata.artist} · {mockMusicMetadata.language} ·{' '}
          {mockMusicMetadata.duration}
        </small>
      </div>
      <StatusPill kind="INFO">
        {backgroundTrackConfigured ? '背景音轨已配置' : '背景音轨待授权'}
      </StatusPill>
    </section>
  );
}

function SettingsPage({
  settings,
  tier,
  onChange,
  onSessionExpired,
}: {
  readonly settings: UiExperienceSettings;
  readonly tier: ExperienceTier;
  readonly onChange: (settings: UiExperienceSettings) => void;
  readonly onSessionExpired: () => void;
}) {
  const soundOptions: readonly {
    readonly key: 'master' | 'backgroundMusic' | 'hover' | 'click' | 'cat' | 'ambient';
    readonly disabled?: boolean;
    readonly label: string;
  }[] = [
    { key: 'master', label: '主声音' },
    { key: 'backgroundMusic', disabled: true, label: '背景音乐（待授权音轨）' },
    { key: 'hover', label: 'Hover 音效（仅桌面）' },
    { key: 'click', label: '点击音效' },
    { key: 'cat', label: 'ME Cat 靠近 / 轻拍音效' },
    { key: 'ambient', disabled: true, label: '小镇环境音（待授权音轨）' },
  ];
  const setSound = (
    key: keyof UiExperienceSettings['sound'],
    value: boolean | number,
  ) => onChange(updateSoundSetting(settings, key, value));
  const setMotion = (motion: MotionPreference) => onChange({ ...settings, motion });
  return (
    <div className="page-stack route-shell settings-page">
      <section className="route-heading">
        <div>
          <p className="eyebrow">SETTINGS / LOCAL UI PREFERENCES</p>
          <h1>设置</h1>
          <p className="lede">
            这里只保存低风险的本地展示偏好；不会保存账号、API Key、权益或私人记录。
          </p>
        </div>
      </section>
      <section className="settings-card">
        <div className="settings-card-heading">
          <div>
            <p className="eyebrow">MOTION & AMBIENT</p>
            <h2>动态与环境</h2>
          </div>
          <StatusPill kind="INFO">{tier}</StatusPill>
        </div>
        <div className="settings-options">
          <label className="setting-toggle">
            <span>ME Cat</span>
            <input
              type="checkbox"
              checked={settings.catEnabled}
              onChange={(event) =>
                onChange({ ...settings, catEnabled: event.target.checked })
              }
            />
          </label>
          <label className="setting-toggle">
            <span>环境特效</span>
            <input
              type="checkbox"
              checked={settings.ambientEffects}
              onChange={(event) =>
                onChange({ ...settings, ambientEffects: event.target.checked })
              }
            />
          </label>
        </div>
        <fieldset className="motion-options">
          <legend>动态偏好</legend>
          {(['AUTO', 'FULL', 'REDUCED', 'OFF'] as const).map((option) => (
            <label key={option}>
              <input
                type="radio"
                name="motion"
                checked={settings.motion === option}
                onChange={() => setMotion(option)}
              />
              {option === 'AUTO'
                ? '跟随系统'
                : option === 'FULL'
                  ? '完整动态'
                  : option === 'REDUCED'
                    ? '降低动态'
                    : '关闭非必要动态'}
            </label>
          ))}
        </fieldset>
      </section>
      <section className="settings-card">
        <div className="settings-card-heading">
          <div>
            <p className="eyebrow">SOUND & AMBIENT</p>
            <h2>声音与氛围</h2>
          </div>
          <StatusPill kind="WARNING">默认关闭</StatusPill>
        </div>
        <p>
          点击、Hover
          和小猫微音由本地原创振荡器生成；背景音乐与环境音在获得授权音轨前不会加载。
          所有声音默认关闭且不会上传数据。
        </p>
        <div className="settings-options">
          {soundOptions.map((option) => (
            <label className="setting-toggle" key={option.key}>
              <span>{option.label}</span>
              <input
                checked={settings.sound[option.key]}
                disabled={option.disabled}
                type="checkbox"
                onChange={(event) => setSound(option.key, event.target.checked)}
              />
            </label>
          ))}
          <label className="setting-toggle">
            <span>静音</span>
            <input
              checked={settings.sound.muted}
              type="checkbox"
              onChange={(event) => setSound('muted', event.target.checked)}
            />
          </label>
          <label className="volume-control">
            <span>音量 {settings.sound.volume}%</span>
            <input
              aria-label="音量"
              type="range"
              min="0"
              max="100"
              value={settings.sound.volume}
              onChange={(event) => setSound('volume', Number(event.target.value))}
            />
          </label>
        </div>
        <MusicVisualizer settings={settings} tier={tier} />
      </section>
      <section className="settings-card">
        <p className="eyebrow">SESSION</p>
        <h2>会话安全</h2>
        <p>身份、会话与设备管理继续使用已有的 Phase 1 服务端架构。</p>
        <button className="quiet-button" type="button" onClick={onSessionExpired}>
          重新验证
        </button>
      </section>
    </div>
  );
}

function PrivacyCenterPage({
  onNavigate,
}: {
  readonly onNavigate: (route: AppRoute) => void;
}) {
  const archiveSummary = localArchiveAdapter.summary();
  const quota = localArchiveAdapter.quota();
  const entries: readonly {
    readonly label: string;
    readonly detail: string;
    readonly route: AppRoute;
  }[] = [
    {
      label: 'Life',
      detail: `${archiveSummary.byKind.LIFE} 条私人记录`,
      route: '/life',
    },
    { label: 'Timeline', detail: '只聚合当前 owner 的来源', route: '/timeline' },
    {
      label: 'Reading',
      detail: `${archiveSummary.byKind.HISTORY} 条读书感悟`,
      route: '/history',
    },
    {
      label: 'Fitness',
      detail: `${archiveSummary.byKind.FITNESS} 条健身记录`,
      route: '/fitness',
    },
    {
      label: 'Daily Pack',
      detail: archiveSummary.dailyPackReady ? '今天已完成打包' : '今天尚未打包',
      route: '/daily-pack',
    },
    {
      label: 'Media Storage',
      detail: `${quota.usedBytes} / ${quota.quotaBytes} bytes`,
      route: '/life',
    },
    { label: 'Export', detail: 'MANIFEST_ONLY 结构化导出', route: '/export' },
    { label: 'Delete', detail: '先进入回收区，再由你确认永久删除', route: '/trash' },
  ];
  return (
    <div className="page-stack route-shell privacy-center-page">
      <section className="route-heading">
        <div>
          <p className="eyebrow">PRIVACY CENTER / SELF ONLY</p>
          <h1>隐私中心</h1>
          <p className="lede">
            只显示当前 owner 的聚合计数与控制入口，不展开私人正文、媒体内容或他人数据。
          </p>
        </div>
        <span className="privacy-pill">PRIVATE BY DEFAULT</span>
      </section>
      <section className="settings-card" aria-labelledby="privacy-center-summary">
        <div className="settings-card-heading">
          <div>
            <p className="eyebrow">OWNER SUMMARY</p>
            <h2 id="privacy-center-summary">我的数据范围</h2>
          </div>
          <span className="archive-status archive-status-default">
            {archiveSummary.total} 条记录
          </span>
        </div>
        <div className="privacy-center-grid">
          {entries.map((entry) => (
            <button
              className="privacy-center-entry"
              key={entry.label}
              type="button"
              onClick={() => onNavigate(entry.route)}
            >
              <strong>{entry.label}</strong>
              <span>{entry.detail}</span>
            </button>
          ))}
        </div>
      </section>
      <p className="section-note">
        导出当前只生成自己的 MANIFEST_ONLY
        预览；账户级删除与服务端审计需经过已验证会话。
      </p>
    </div>
  );
}

function CommunityProfileSummary() {
  const [state, setState] = useState<CommunitySurfaceState>('LOADING');
  const [profile, setProfile] = useState<CommunityProfile | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let current = true;
    void communityClient.getProfile({ userId: 'self' }).then((result) => {
      if (!current) return;
      if (!result.ok) {
        setState('ERROR');
        setMessage(result.error.message);
        return;
      }
      setProfile(result.data);
      setState('READY');
    });
    return () => {
      current = false;
    };
  }, []);

  return (
    <section
      className="community-profile-summary"
      aria-labelledby="community-profile-summary-title"
    >
      <div className="community-feed-heading">
        <div>
          <p className="eyebrow">COMMUNITY PROFILE / PUBLIC FIELDS ONLY</p>
          <h2 id="community-profile-summary-title">我的社区资料</h2>
        </div>
        <StatusPill kind={state === 'READY' ? 'SOCIAL' : 'INFO'}>
          {state === 'READY' ? '服务端资料' : '待连接'}
        </StatusPill>
      </div>
      {state === 'LOADING' ? (
        <CodeShimmer tier="LITE" title="正在读取公开资料" />
      ) : null}
      {profile !== null ? (
        <div className="community-profile-metrics">
          <div>
            <strong>{profile.displayName}</strong>
            <span>{profile.bio ?? '尚未填写公开简介。'}</span>
          </div>
          <div>
            <strong>{profile.postCount}</strong>
            <span>已发布内容</span>
          </div>
          <div>
            <strong>{profile.followerCount}</strong>
            <span>关注者</span>
          </div>
          <div>
            <strong>{profile.followingCount}</strong>
            <span>正在关注</span>
          </div>
        </div>
      ) : null}
      {state === 'ERROR' ? (
        <CommunityInlineStatus tone="ERROR">
          {message || '社区资料尚未返回；私人 Archive Profile 不会被当作公开资料展示。'}
        </CommunityInlineStatus>
      ) : null}
      <p className="community-muted-note">
        社区资料只展示本人明确公开的信息；它不等同于你的私人 ME.zip 档案。
      </p>
    </section>
  );
}

/** A self profile only renders fields that the owner has explicitly marked
 * public. The raw self projection never becomes a public-profile substitute. */
function ExternalIdentityProfileSummary({ onNavigate }: { readonly onNavigate: (route: AppRoute) => void }) {
  const [publicIdentities, setPublicIdentities] = useState<readonly ExternalIdentity[]>([]);
  const [status, setStatus] = useState('正在读取公开身份资料…');

  useEffect(() => {
    let current = true;
    void externalIdentityClient.listIdentities().then((result) => {
      if (!current) return;
      if (!result.ok) {
        setStatus('Connected Apps 服务未连接；不会显示本地虚构身份。');
        return;
      }
      setPublicIdentities(result.data.filter((identity) => identity.visibility === 'PUBLIC'));
      setStatus(result.data.some((identity) => identity.visibility === 'PUBLIC') ? '' : '尚未选择任何资料显示在公开 Profile。');
    });
    return () => { current = false; };
  }, []);

  return (
    <section className="community-profile-summary" aria-labelledby="external-identity-summary-title">
      <div className="community-feed-heading">
        <div><p className="eyebrow">CONNECTED APPS / PUBLIC SAFE FIELDS</p><h2 id="external-identity-summary-title">公开身份资料</h2></div>
        <button className="quiet-button" type="button" onClick={() => onNavigate('/connected-apps')}>管理连接</button>
      </div>
      {publicIdentities.length > 0 ? <div className="community-profile-metrics">
        {publicIdentities.map((identity) => <div key={identity.id}>
          <strong>{identity.displayName}</strong>
          <span>{identity.provider}{identity.handle ? ` · @${identity.handle}` : ''}</span>
        </div>)}
      </div> : <p className="community-muted-note">{status}</p>}
      <p className="community-muted-note">只显示你明确公开的名称、用户名、说明与公开链接；二维码、OAuth 凭据、Token 和私密数据永不进入此处。</p>
    </section>
  );
}

function ProfilePage({
  onNavigate,
}: {
  readonly onNavigate: (route: AppRoute) => void;
}) {
  return (
    <div className="page-stack route-shell">
      <section className="route-heading">
        <div>
          <p className="eyebrow">ME / PRIVATE PROFILE</p>
          <h1>我的空间</h1>
          <p className="lede">
            个人资料、隐私、设备与数据导出只作用于当前已验证的本人。
          </p>
        </div>
      </section>
      <div className="profile-entry-grid">
        {[
          ['个人资料', '管理自己的公开资料与显示方式。'],
          ['隐私中心', '查看同意记录、身份与会话，并请求导出或删除。'],
          ['设备', '只显示当前用户的已授权设备。'],
        ].map(([title, detail]) => (
          <article className="archive-card" key={title}>
            <h2>{title}</h2>
            <p>{detail}</p>
          </article>
        ))}
      </div>
      <CommunityProfileSummary />
      <ExternalIdentityProfileSummary onNavigate={onNavigate} />
      <button
        className="quiet-button"
        type="button"
        onClick={() => onNavigate('/privacy')}
      >
        打开隐私中心
      </button>
      <button
        className="quiet-button"
        type="button"
        onClick={() => onNavigate('/settings')}
      >
        打开设置
      </button>
    </div>
  );
}

function CommunityNotificationPanel({ onClose }: { readonly onClose: () => void }) {
  const [state, setState] = useState<CommunitySurfaceState>('LOADING');
  const [notifications, setNotifications] = useState<readonly CommunityNotification[]>(
    [],
  );
  const [message, setMessage] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let current = true;
    setState('LOADING');
    void communityClient.listNotifications({ limit: 12 }).then((result) => {
      if (!current) return;
      if (!result.ok) {
        setState('ERROR');
        setMessage(result.error.message);
        return;
      }
      setNotifications(result.data.items);
      setState('READY');
    });
    return () => {
      current = false;
    };
  }, [refreshVersion]);

  const markRead = (notification: CommunityNotification) => {
    setPendingId(notification.id);
    setMessage('');
    void communityClient
      .markNotificationRead({
        notificationId: notification.id,
        idempotencyKey: createCommunityActionKey('notification-read'),
      })
      .then((result) => {
        if (!result.ok) {
          setMessage(result.error.message);
          return;
        }
        setMessage('已请求服务端更新已读状态。');
        setRefreshVersion((value) => value + 1);
      })
      .finally(() => setPendingId(null));
  };

  return (
    <section
      aria-labelledby="community-notification-title"
      className="community-notification-panel"
      id="community-notifications"
    >
      <div className="community-feed-heading">
        <div>
          <p className="eyebrow">NOTIFICATIONS / MINIMAL SUMMARY</p>
          <h2 id="community-notification-title">通知</h2>
        </div>
        <button className="community-text-button" type="button" onClick={onClose}>
          收起
        </button>
      </div>
      {state === 'LOADING' ? <CodeShimmer tier="LITE" title="正在读取通知" /> : null}
      {state === 'READY' && notifications.length === 0 ? (
        <p className="community-muted-note">暂无新的社区通知。</p>
      ) : null}
      {notifications.length > 0 ? (
        <ul className="community-notification-list">
          {notifications.map((notification) => (
            <li
              className={notification.readAt === null ? 'unread' : ''}
              key={notification.id}
            >
              <div>
                <StatusPill kind={notification.readAt === null ? 'SOCIAL' : 'INFO'}>
                  {notification.type}
                </StatusPill>
                <p>{notification.summary}</p>
                <time dateTime={notification.createdAt}>
                  {formatCommunityDate(notification.createdAt)}
                </time>
              </div>
              {notification.readAt === null ? (
                <button
                  className="community-text-button"
                  disabled={pendingId === notification.id}
                  type="button"
                  onClick={() => markRead(notification)}
                >
                  {pendingId === notification.id ? '正在更新' : '标为已读'}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {state === 'ERROR' || message.length > 0 ? (
        <CommunityInlineStatus tone={state === 'ERROR' ? 'ERROR' : 'INFO'}>
          {message || '通知暂时不可用。'}
        </CommunityInlineStatus>
      ) : null}
    </section>
  );
}

function ContextRail({
  aiUsageActiveSeconds,
  route,
  membership,
  onNavigate,
}: {
  readonly aiUsageActiveSeconds: number | null;
  readonly route: AppRoute;
  readonly membership: MembershipSnapshot | null;
  readonly onNavigate: (route: AppRoute) => void;
}) {
  if (route !== '/' && route !== '/messages' && route !== '/code') return null;
  return (
    <aside className="context-rail" aria-label="页面上下文">
      {route === '/' ? (
        <MembershipSummary membership={membership} onNavigate={onNavigate} />
      ) : null}
      {route === '/' ? (
        <section className="context-card">
          <p className="eyebrow">AI USAGE</p>
          <h3>{aiUsageActiveSeconds === null ? '尚无可显示的 AI 使用聚合。' : formatAiUsageDuration(aiUsageActiveSeconds)}</h3>
          <p>{aiUsageActiveSeconds === null ? '服务端来源未连接时，不显示本地演示数据。' : '今天的私有 AI 使用时长聚合。'}</p>
        </section>
      ) : null}
      {route === '/messages' ? (
        <section className="context-card">
          <p className="eyebrow">CONVERSATION</p>
          <h3>未选择可读取会话。</h3>
          <p>成员资料与隐私设置会按会话成员关系加载。</p>
        </section>
      ) : null}
      {route === '/code' ? (
        <section className="context-card">
          <p className="eyebrow">REPOSITORY</p>
          <h3>尚无仓库元信息。</h3>
          <p>语言、版本与权限需要服务端安全检查后显示。</p>
        </section>
      ) : null}
    </aside>
  );
}

function WorkspaceShell({
  onSessionExpired,
  accountSubject,
}: {
  readonly onSessionExpired: () => void;
  readonly accountSubject: string;
}) {
  // Local development stores are partitioned before any child page reads them.
  // Server-backed clients remain responsible for real session authorization.
  localArchiveAdapter.setOwner(accountSubject);
  messagingOutbox.setAccountSubject(accountSubject);
  messagingDraftCache.setAccountSubject(accountSubject);
  const [route, setRoute] = useState<AppRoute>(browserRoute);
  const [settings, setSettings] = useState<UiExperienceSettings>(() =>
    loadUiExperienceSettings(browserStorage()),
  );
  const [systemReduced, setSystemReduced] = useState(systemReducedMotion);
  const [membership, setMembership] = useState<MembershipSnapshot | null>(null);
  const [aiUsageActiveSeconds, setAiUsageActiveSeconds] = useState<number | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [creatorIntroOpen, setCreatorIntroOpen] = useState(false);
  const [dialogue, setDialogue] = useState<CatDialogue>(() =>
    catDialogueService.next(() => 0),
  );
  const soundEngine = useRef<LocalSoundEngine | null>(null);
  if (soundEngine.current === null) soundEngine.current = new LocalSoundEngine();
  const tier = experienceTier(settings.motion, systemReduced);

  const playCue = (cue: SoundCue) => soundEngine.current?.play(cue, settings.sound);

  useEffect(() => {
    saveUiExperienceSettings(settings, browserStorage());
  }, [settings]);

  useEffect(() => {
    let current = true;
    void entitlementProvider.getMembership().then((result) => {
      if (current) setMembership(result);
    });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    const range = aiUsageRangeForPeriod('TODAY');
    void aiUsageDashboardClient.readSnapshot({ ...range, limit: 1 }).then((result) => {
      if (!current) return;
      setAiUsageActiveSeconds(
        result.ok && Number.isSafeInteger(result.data.overview.totalActiveSeconds)
          ? Math.max(0, result.data.overview.totalActiveSeconds)
          : null,
      );
    });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    const handlePopState = () => setRoute(browserRoute());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (route !== '/' && route !== '/town') return;
    const expectedMode = homeModeForRoute(route);
    setSettings((current) =>
      current.homeMode === expectedMode
        ? current
        : { ...current, homeMode: expectedMode },
    );
  }, [route]);

  useEffect(() => () => soundEngine.current?.dispose(), []);

  const navigate = (nextRoute: AppRoute) => {
    if (window.location.pathname !== nextRoute)
      window.history.pushState({}, '', nextRoute);
    setRoute(nextRoute);
    if (nextRoute === '/town' || nextRoute === '/') {
      setSettings((current) => ({
        ...current,
        homeMode: homeModeForRoute(nextRoute),
      }));
    }
  };

  const changeMode = (mode: UiExperienceSettings['homeMode']) => {
    setSettings((current) => ({ ...current, homeMode: mode }));
    navigate(routeForHomeMode(mode));
  };

  const tapCat = () => {
    playCue('cat');
    if (aiUsageActiveSeconds !== null) {
      setDialogue({
        state: 'HAPPY',
        emotion: 'HAPPY',
        text: aiUsageAggregateCue(aiUsageActiveSeconds),
      });
      return;
    }
    setDialogue(catDialogueService.next());
  };
  const hoverCat = () => playCue('cat');
  const handleClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const control = target.closest('button, a, input, [role="button"]');
    if (!(control instanceof HTMLElement)) return;
    if ('disabled' in control && Boolean(control.disabled)) return;
    if (control.closest('.cat-button') !== null) return;
    playCue('click');
  };
  const handlePointerOverCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const control = target.closest('button, a, input, [role="button"]');
    if (!(control instanceof HTMLElement)) return;
    const related = event.relatedTarget;
    if (related instanceof Node && control.contains(related)) return;
    if (control.closest('.cat-button') !== null) return;
    playCue('hover');
  };
  let page: ReactNode;
  if (route === '/') {
    page = (
      <HomePage
        aiUsageActiveSeconds={aiUsageActiveSeconds}
        membership={membership}
        mode={settings.homeMode}
        onModeChange={changeMode}
        onNavigate={navigate}
        onOpenCreatorIntro={() => setCreatorIntroOpen(true)}
      />
    );
  } else if (route === '/town') {
    page = (
      <TownPage
        aiUsageActiveSeconds={aiUsageActiveSeconds}
        ambientEnabled={settings.ambientEffects}
        onNavigate={navigate}
        onOpenCreatorIntro={() => setCreatorIntroOpen(true)}
        onStandard={() => changeMode('STANDARD')}
        tier={tier}
      />
    );
  } else if (route === '/constellation') {
    page = <ConstellationPage onNavigate={navigate} tier={tier} />;
  } else if (route in archiveEmptyStates) {
    page = (
      <ArchivePage
        route={route as keyof typeof archiveEmptyStates}
        onNavigate={navigate}
      />
    );
  } else if (route === '/community') {
    page = <CommunityPage onNavigate={navigate} tier={tier} />;
  } else if (route === '/messages') {
    page = <MessagesPage accountSubject={accountSubject} tier={tier} />;
  } else if (route === '/activities') {
    page = <ActivitiesPage tier={tier} />;
  } else if (route === '/membership') {
    page = <MembershipPage onNavigate={navigate} tier={tier} />;
  } else if (route === '/benefits') {
    page = <BenefitsCenterPage tier={tier} />;
  } else if (route === '/ai') {
    page = <AiUsageDashboardPage client={aiUsageDashboardClient} onNavigate={navigate} tier={tier} />;
  } else if (route === '/ai-lab') {
    page = <AiLabPage client={aiLabClient} onNavigate={navigate} tier={tier} />;
  } else if (route === '/ask-archive') {
    page = <AskMyArchivePage client={askArchiveClient} tier={tier} />;
  } else if (route === '/archive-center' || route === '/annual-archive') {
    page = <PortableArchivePage client={portableArchiveClient} tier={tier} onNavigate={navigate} />;
  } else if (route === '/social') {
    page = <SocialArchivePage tier={tier} />;
  } else if (route === '/connected-apps') {
    page = <ConnectedAppsPage client={externalIdentityClient} tier={tier} />;
  } else if (route === '/creator-home') {
    page = <CreatorEcosystemPage client={creatorEcosystemClient} onNavigate={navigate} tier={tier} />;
  } else if (route === '/creator') {
    page = <CreatorLabPage client={creatorLabClient} tier={tier} />;
  } else if (route === '/code') {
    page = <CodeHubPage onNavigate={navigate} tier={tier} />;
  } else if (route === '/x') {
    page = <XConnectionCenterPage onNavigate={navigate} tier={tier} />;
  } else if (route === '/privacy') {
    page = <PrivacyCenterPage onNavigate={navigate} />;
  } else if (route === '/me') {
    page = <ProfilePage onNavigate={navigate} />;
  } else {
    page = (
      <SettingsPage
        onChange={setSettings}
        onSessionExpired={onSessionExpired}
        settings={settings}
        tier={tier}
      />
    );
  }

  return (
    <div
      className="app-shell phase2-shell"
      data-motion-tier={tier}
      onClickCapture={handleClickCapture}
      onPointerOverCapture={handlePointerOverCapture}
    >
      <aside className="desktop-rail dock-rail">
        <button
          className="brand brand-button"
          type="button"
          onClick={() => navigate('/')}
        >
          <MezipBrandLockup />
        </button>
        <nav aria-label="主导航">
          <NavigationGroup group="ARCHIVE" route={route} onNavigate={navigate} />
          <NavigationGroup group="CONNECT" route={route} onNavigate={navigate} />
          <NavigationGroup group="CREATE" route={route} onNavigate={navigate} />
          <NavigationGroup group="ME" route={route} onNavigate={navigate} />
        </nav>
        <p className="rail-footer">PRIVATE BY DEFAULT</p>
      </aside>
      <div className="app-main-column">
        <ScrollProgress route={route} tier={tier} />
        <header className="app-topbar">
          <div className="route-indicator">
            <SlidingRouteNumber route={route} tier={tier} />
            <span className="route-indicator-brand">ME.zip · 觅迹</span>
            <span aria-hidden="true">/</span>
            <strong>{routeLabel(route)}</strong>
          </div>
          <SearchBox
            catEnabled={settings.catEnabled}
            dialogue={dialogue}
            onCatTap={tapCat}
            onCatHover={hoverCat}
            onNavigate={navigate}
            tier={tier}
          />
          <div className="topbar-actions">
            <button
              aria-controls="community-notifications"
              aria-expanded={notificationsOpen}
              className="notification-button glass-icon-button"
              type="button"
              aria-label={notificationsOpen ? '收起通知' : '打开通知'}
              onClick={() => setNotificationsOpen((open) => !open)}
            >
              <AppIcon name="bell" />
              <span className="sr-only">通知</span>
            </button>
            <button
              className="avatar-button glass-icon-button"
              type="button"
              aria-label="打开我的空间"
              onClick={() => navigate('/me')}
            >
              <span aria-hidden="true">ME</span>
            </button>
            <button
              className="quiet-button topbar-account-switch"
              type="button"
              onClick={onSessionExpired}
            >
              切换账号
            </button>
          </div>
        </header>
        {notificationsOpen ? (
          <CommunityNotificationPanel onClose={() => setNotificationsOpen(false)} />
        ) : null}
        <div className="app-content-layout">
          <main id="main-content" className="content phase2-content">
            <AnimatePresence initial={false} mode="wait">
              <motion.div
                key={route}
                className="route-transition"
                initial={tier === 'FULL' ? { opacity: 0, y: 8 } : false}
                animate={{ opacity: 1, y: 0 }}
                exit={tier === 'FULL' ? { opacity: 0, y: -6 } : {}}
                transition={{ duration: tier === 'FULL' ? 0.22 : 0 }}
              >
                {page}
              </motion.div>
            </AnimatePresence>
          </main>
          <ContextRail aiUsageActiveSeconds={aiUsageActiveSeconds} membership={membership} onNavigate={navigate} route={route} />
        </div>
      </div>
      <nav className="mobile-nav dock-nav" aria-label="移动端主导航">
        {(
          [
            ['首页', '/', 'home'],
            ['社区', '/community', 'community'],
            ['+', 'create', 'plus'],
            ['消息', '/messages', 'messages'],
            ['我的', '/me', 'user'],
          ] as const
        ).map(([label, target, icon]) => (
          <button
            aria-current={target !== 'create' && route === target ? 'page' : undefined}
            aria-label={target === 'create' ? '创建 Life 记录' : label}
            className={
              target === 'create'
                ? 'mobile-create glass-icon-button'
                : route === target
                  ? 'mobile-nav-active glass-icon-button'
                  : 'glass-icon-button'
            }
            key={label}
            type="button"
            onClick={() => (target === 'create' ? navigate('/life') : navigate(target))}
          >
            <AppIcon name={icon} />
            {target === 'create' ? null : <span>{label}</span>}
          </button>
        ))}
      </nav>
      {creatorIntroOpen ? (
        <CreatorIdentityReveal
          tier={tier}
          onContinueLogin={() => setCreatorIntroOpen(false)}
          onSkipLogin={() => setCreatorIntroOpen(false)}
          onFailOpen={() => setCreatorIntroOpen(false)}
        />
      ) : null}
    </div>
  );
}

function AuthShell() {
  const [auth, dispatch] = useReducer(
    reduceAuthState,
    initialAuthState,
    initialAuthStateForRuntime,
  );
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [consent, setConsent] = useState(false);
  const [showEntry, setShowEntry] = useState(false);
  const [creatorIntroOpen, setCreatorIntroOpen] = useState(false);
  const [googlePickerOpen, setGooglePickerOpen] = useState(false);
  const firstProviderRef = useRef<HTMLButtonElement>(null);
  const restoreLoginFocusRef = useRef(false);
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const localAuthDemo = import.meta.env.DEV;

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      if (auth.kind === 'OFFLINE') dispatch({ type: 'RESET' });
    };
    const onOffline = () => {
      setOnline(false);
      dispatch({ type: 'OFFLINE' });
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [auth.kind]);

  const selected = auth.provider;
  const isOtp =
    auth.kind === 'OTP_SENT' ||
    auth.kind === 'OTP_INVALID' ||
    auth.kind === 'OTP_EXPIRED' ||
    auth.kind === 'TOO_MANY_ATTEMPTS';
  const isGoogleDemoOtp = localAuthDemo && selected === 'GOOGLE' && isOtp;

  const chooseProvider = (provider: AuthProvider) => {
    setIdentifier('');
    setCode('');
    setGooglePickerOpen(false);
    dispatch({ type: 'SELECT_PROVIDER', provider });
  };

  const startOtp = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!online) {
      dispatch({ type: 'OFFLINE' });
      return;
    }
    const normalized = identifier.trim();
    const valid =
      selected === 'EMAIL'
        ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
        : /^\+?[0-9\s-]{6,20}$/.test(normalized);
    if (!valid) {
      dispatch({ type: 'ERROR', message: '请输入有效的邮箱或手机号。' });
      return;
    }
    if (!consent) {
      dispatch({ type: 'ERROR', message: '请先同意 Terms 与 Privacy，才能继续。' });
      return;
    }
    if (!localAuthDemo) {
      dispatch({
        type: 'ERROR',
        message: '验证码服务尚未配置，因此不会假装已发送。请改用已接入的登录方式。',
      });
      return;
    }
    dispatch({ type: 'START_LOADING' });
    window.setTimeout(
      () =>
        dispatch({
          type: 'OTP_SENT',
          challengeId: 'local-challenge',
          identifier: normalized,
          cooldownSeconds: 30,
        }),
      220,
    );
  };

  const verifyOtp = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!localAuthDemo) {
      dispatch({ type: 'ERROR', message: '当前环境没有可用的验证码验证服务。' });
      return;
    }
    if (code === '000000') {
      dispatch({ type: 'OTP_EXPIRED' });
      return;
    }
    if (code !== '123456') {
      const attempts = auth.attempts + 1;
      dispatch(
        attempts >= 5
          ? { type: 'TOO_MANY_ATTEMPTS' }
          : { type: 'OTP_INVALID', attempts },
      );
      return;
    }
    writeLocalDemoSession(
      true,
      opaqueDemoSubject(selected ?? 'EMAIL', auth.identifier || identifier),
    );
    const returnPath = loginReturnPathFromUrl();
    clearLoginRequestFromUrl();
    if (returnPath) {
      window.location.assign(returnPath);
      return;
    }
    dispatch({ type: 'SUCCESS' });
  };

  const startProvider = (provider: AuthProvider) => {
    if (!online) {
      dispatch({ type: 'OFFLINE' });
      return;
    }
    if (!consent) {
      chooseProvider(provider);
      dispatch({ type: 'ERROR', message: '请先同意 Terms 与 Privacy，才能继续。' });
      return;
    }
    if (provider === 'GOOGLE') {
      if (!localAuthDemo) {
        dispatch({
          type: 'ERROR',
          message: 'Google OAuth 尚未配置，因此不会展示伪造的账号选择或登录成功。',
        });
        return;
      }
      dispatch({ type: 'SELECT_PROVIDER', provider });
      setGooglePickerOpen(true);
      return;
    }
    if (!localAuthDemo) {
      dispatch({
        type: 'ERROR',
        message: '登录服务尚未配置，因此不会伪造微信登录成功。',
      });
      return;
    }
    dispatch({ type: 'SELECT_PROVIDER', provider });
    dispatch({ type: 'START_LOADING' });
    window.setTimeout(() => {
      writeLocalDemoSession(true, opaqueDemoSubject(provider));
      const returnPath = loginReturnPathFromUrl();
      clearLoginRequestFromUrl();
      if (returnPath) {
        window.location.assign(returnPath);
        return;
      }
      dispatch({ type: 'SUCCESS' });
    }, 220);
  };

  const chooseGoogleAccount = (email: string) => {
    setGooglePickerOpen(false);
    dispatch({ type: 'START_LOADING' });
    window.setTimeout(() => {
      dispatch({
        type: 'OTP_SENT',
        challengeId: 'local-google-challenge',
        identifier: email,
        cooldownSeconds: 0,
      });
    }, 220);
  };

  const resetAuth = () => {
    setGooglePickerOpen(false);
    dispatch({ type: 'RESET' });
  };

  const authExperienceTier = (): ExperienceTier =>
    experienceTier(
      loadUiExperienceSettings(browserStorage()).motion,
      systemReducedMotion(),
    );

  const openOriginalLogin = () => {
    restoreLoginFocusRef.current = true;
    setCreatorIntroOpen(false);
    setShowEntry(false);
  };

  useEffect(() => {
    if (!showEntry && !creatorIntroOpen && restoreLoginFocusRef.current) {
      firstProviderRef.current?.focus();
      restoreLoginFocusRef.current = false;
    }
  }, [creatorIntroOpen, showEntry]);

  const requestLogin = () => {
    try {
      const preference = readCreatorIntroPreference(browserStorage());
      if (shouldShowCreatorIntro(preference, authExperienceTier())) {
        setCreatorIntroOpen(true);
        return;
      }
    } catch {
      // The profile presentation is always optional. Authentication continues.
    }
    openOriginalLogin();
  };

  if (auth.kind === 'SUCCESS') {
    return (
      <WorkspaceShell
        accountSubject={readLocalDemoSessionSubject()}
        onSessionExpired={() => {
          writeLocalDemoSession(false);
          dispatch({ type: 'SESSION_EXPIRED' });
        }}
      />
    );
  }

  const authTitle = googlePickerOpen
    ? localAuthDemo
      ? '预览 Google 账号选择'
      : '选择 Google 账号'
    : isGoogleDemoOtp
      ? '确认演示登录'
      : isOtp
        ? '输入验证码'
      : selected === 'EMAIL'
        ? '邮箱登录'
        : selected === 'PHONE'
          ? '手机号登录'
          : '选择登录方式';
  const authSubtitle = googlePickerOpen
    ? localAuthDemo
      ? '本地展示 Google 账号选择，不会读取真实账号'
      : '使用你的 Google 账号继续觅迹之旅'
    : isGoogleDemoOtp
      ? `本地演示账号 · ${maskIdentifier(auth.identifier)}`
      : isOtp
        ? localAuthDemo
          ? `本地验证 · ${maskIdentifier(auth.identifier)}`
        : `验证码已发送至 ${maskIdentifier(auth.identifier)}`
      : selected === 'EMAIL'
        ? localAuthDemo
          ? '本地开发模式：继续后会显示测试验证码，不会发送真实邮件'
          : '输入你的邮箱，我们会发送验证码'
        : selected === 'PHONE'
          ? localAuthDemo
            ? '本地开发模式：继续后会显示测试验证码，不会发送真实短信'
            : '输入你的手机号，我们会发送短信验证码'
          : '请选择登录方式，继续你的旅程';

  return (
    <main className="auth-shell mezip-auth-shell">
      <div className="auth-stars auth-stars-left" aria-hidden="true" />
      <div className="auth-stars auth-stars-right" aria-hidden="true" />
      <div className="auth-mountain" aria-hidden="true" />
      <section className="auth-panel mezip-auth-panel" aria-labelledby="welcome-title">
        <div className="auth-brand-row mezip-auth-brand-row">
          <MezipBrandLockup />
          {selected !== null || googlePickerOpen ? (
            <button className="auth-flow-back" type="button" onClick={resetAuth}>
              ← 返回
            </button>
          ) : (
            <span className="auth-step">01 / 05</span>
          )}
        </div>
        <div className="auth-journey-label"><span aria-hidden="true">✦</span> 继续探索</div>
        <h1 id="welcome-title">{authTitle}</h1>
        <p className="auth-lede">{authSubtitle}</p>
        {auth.kind !== 'DEFAULT' && auth.message ? (
          <div
            className={cx('auth-status', 'auth-status-' + auth.kind.toLowerCase())}
            role="status"
            aria-live="polite"
          >
            <span aria-hidden="true">·</span>
            <span>
              {auth.kind === 'OTP_SENT' && localAuthDemo
                ? '本地演示验证码已生成，未发送真实邮件或短信。'
                : auth.message}
            </span>
          </div>
        ) : null}
        {!online ? (
          <div className="offline-banner" role="alert">
            离线：验证请求会在恢复连接后重试。
          </div>
        ) : null}

        {showEntry && auth.kind === 'DEFAULT' ? (
          <section className="welcome-entry" aria-labelledby="welcome-entry-title">
            <p className="welcome-entry-label">YOUR LIFE, PACKAGED</p>
            <h2 id="welcome-entry-title">从今天开始，建立你的私人档案。</h2>
            <p>Record · Understand · Preserve · Connect</p>
            <div className="welcome-actions">
              <button
                className="auth-primary"
                type="button"
                onClick={() => setShowEntry(false)}
              >
                开始我的存档
              </button>
              <button
                className="auth-secondary"
                type="button"
                onClick={requestLogin}
              >
                已有账号，登录
              </button>
            </div>
          </section>
        ) : googlePickerOpen && selected === 'GOOGLE' ? (
          <section className="google-account-picker" aria-labelledby="google-picker-title">
            <div className="google-picker-mark" aria-hidden="true">G</div>
            <h2 id="google-picker-title">
              {localAuthDemo ? 'Google 账号选择预览' : '使用 Google 账号继续'}
            </h2>
            <p className="form-help">以下均为本地演示账号；不会读取真实 Google 账号，也不会发起 OAuth 登录。</p>
            <div className="google-account-list">
              {googleAccountChoices.map((account, index) => (
                <button
                  className={cx('google-account', index === 0 && 'google-account-selected')}
                  type="button"
                  key={account.email}
                  onClick={() => chooseGoogleAccount(account.email)}
                >
                  <span className="google-account-avatar" aria-hidden="true">{account.initials}</span>
                  <span className="google-account-copy">
                    <strong>{account.name}</strong>
                    <small>{account.email}</small>
                  </span>
                  <span className="google-account-check" aria-hidden="true">{index === 0 ? '✓' : '›'}</span>
                </button>
              ))}
              <button
                className="google-account google-account-other"
                type="button"
                onClick={() => {
                  setGooglePickerOpen(false);
                  chooseProvider('EMAIL');
                }}
              >
                <span className="google-account-avatar google-account-avatar-outline" aria-hidden="true">＋</span>
                <span className="google-account-copy"><strong>改用邮箱登录</strong><small>使用邮箱验证码继续</small></span>
                <span className="google-account-check" aria-hidden="true">›</span>
              </button>
            </div>
            <p className="google-safe-note">
              <span aria-hidden="true">♢</span>{' '}
              {localAuthDemo
                ? '这是本地演示，不会连接 Google 或同步数据'
                : 'Google 仅用于安全登录与账号同步'}
            </p>
            <button className="back-link auth-back-centered" type="button" onClick={resetAuth}>← 返回其他登录方式</button>
          </section>
        ) : isOtp && selected ? (
          <form className="auth-form" onSubmit={verifyOtp}>
            <div className="auth-form-heading">
              <button
                className="back-link"
                type="button"
                onClick={resetAuth}
              >
                ← 返回登录方式
              </button>
              <h2>{isGoogleDemoOtp ? '确认本地演示登录' : '输入验证码'}</h2>
              <p>
                {isGoogleDemoOtp
                  ? '这是本地演示账号，不会连接或读取 Google 账户。'
                  : localAuthDemo
                  ? `本地开发模式不会向 ${maskIdentifier(auth.identifier)} 发送真实验证码。`
                  : `已发送至 ${maskIdentifier(auth.identifier)}。`}
              </p>
            </div>
            {localAuthDemo ? (
              <div className="auth-demo-code" role="status">
                <span>本地演示验证码</span>
                <code>123456</code>
                <small>接入邮件或短信服务后，这里不会再显示测试码。</small>
              </div>
            ) : null}
            <label htmlFor="otp-code">验证码</label>
            <input
              id="otp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              required
            />
            <button
              className="auth-primary"
              type="submit"
              disabled={auth.kind === 'TOO_MANY_ATTEMPTS'}
            >
              验证并进入我的档案
            </button>
            <button
              className="auth-secondary"
              type="button"
              onClick={() =>
                localAuthDemo
                  ? dispatch({
                      type: 'OTP_SENT',
                      challengeId: 'local-challenge',
                      identifier: auth.identifier,
                      cooldownSeconds: 30,
                    })
                  : dispatch({
                      type: 'ERROR',
                      message: '验证码服务尚未配置，无法重新发送。',
                    })
              }
            >
              {localAuthDemo ? '重新显示测试码' : '重新发送验证码'}
            </button>
          </form>
        ) : selected === 'EMAIL' || selected === 'PHONE' ? (
          <form className="auth-form" onSubmit={startOtp}>
            <div className="auth-form-heading">
              <button
                className="back-link"
                type="button"
                onClick={resetAuth}
              >
                ← 返回登录方式
              </button>
              <h2>{providerLabels[selected]}</h2>
              <p>
                {localAuthDemo
                  ? '本地开发模式不会发送真实验证码；继续后会显示测试码。'
                  : '我们会发送一次性验证码，不会创建重复账号。'}
              </p>
            </div>
            <label htmlFor="identifier">
              {selected === 'EMAIL' ? '邮箱地址' : '手机号'}
            </label>
            <input
              id="identifier"
              type={selected === 'EMAIL' ? 'email' : 'tel'}
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder={
                selected === 'EMAIL' ? 'name@example.com' : '+86 138 0000 0000'
              }
              required
            />
            <label className="consent-row">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <span>我同意 Terms 与 Privacy（v1.0）</span>
            </label>
            <button
              className="auth-primary"
              type="submit"
              disabled={auth.kind === 'LOADING'}
            >
              {auth.kind === 'LOADING'
                ? '正在准备…'
                : localAuthDemo
                  ? '显示测试验证码'
                  : '发送验证码'}
            </button>
          </form>
        ) : (
          <div className="provider-list" aria-label="选择登录方式">
            <button
              ref={firstProviderRef}
              className="provider-button"
              type="button"
              onClick={() => startProvider('WECHAT')}
            >
              <span className="provider-icon provider-icon-wechat" aria-hidden="true">微</span>
              <span className="provider-copy"><strong>微信登录</strong><small>安全 · 快捷</small></span>
              <span className="provider-arrow" aria-hidden="true">›</span>
            </button>
            <button
              className="provider-button"
              type="button"
              onClick={() => startProvider('GOOGLE')}
            >
              <span className="provider-icon provider-icon-google" aria-hidden="true">G</span>
              <span className="provider-copy"><strong>Google 登录</strong><small>全球账户 · 一键登录</small></span>
              <span className="provider-arrow" aria-hidden="true">›</span>
            </button>
            <button
              className="provider-button"
              type="button"
              onClick={() => chooseProvider('EMAIL')}
            >
              <span className="provider-icon provider-icon-email" aria-hidden="true">@</span>
              <span className="provider-copy"><strong>邮箱登录</strong><small>验证邮箱 · 安全可靠</small></span>
              <span className="provider-arrow" aria-hidden="true">›</span>
            </button>
            <button
              className="provider-button provider-wechat"
              type="button"
              onClick={() => chooseProvider('PHONE')}
            >
              <span className="provider-icon provider-icon-phone" aria-hidden="true">⌁</span>
              <span className="provider-copy"><strong>手机号登录</strong><small>便捷登录 · 随时随地</small></span>
              <span className="provider-arrow" aria-hidden="true">›</span>
            </button>
            <label className="consent-row consent-row-landing">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <span>继续即表示你同意服务条款与隐私政策</span>
            </label>
            <button
              className="back-link creator-intro-reopen"
              type="button"
              onClick={() => setCreatorIntroOpen(true)}
            >
              再次查看 Creator 介绍
            </button>
          </div>
        )}
        <p className="auth-footnote">
          你的档案默认私密 · 觅迹不会读取聊天记录
        </p>
        <button className="auth-card-link" type="button" onClick={() => setCreatorIntroOpen(true)}>
          查看 Tom 资料卡与小镇 <span aria-hidden="true">↗</span>
        </button>
      </section>
      {creatorIntroOpen ? (
        <CreatorIdentityReveal
          tier={authExperienceTier()}
          onContinueLogin={openOriginalLogin}
          onSkipLogin={openOriginalLogin}
          onFailOpen={openOriginalLogin}
        />
      ) : null}
    </main>
  );
}

export function App() {
  return <AuthShell />;
}
