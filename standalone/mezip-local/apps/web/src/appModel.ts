export const appRoutes = [
  { path: '/', label: '首页', group: 'ARCHIVE' },
  { path: '/town', label: 'ME Town', group: 'ARCHIVE' },
  { path: '/life', label: '生活', group: 'ARCHIVE' },
  { path: '/timeline', label: '时间轴', group: 'ARCHIVE' },
  { path: '/history', label: '读书感悟', group: 'ARCHIVE' },
  { path: '/fitness', label: '健身', group: 'ARCHIVE' },
  { path: '/constellation', label: '星象馆', group: 'ARCHIVE' },
  { path: '/community', label: '社区', group: 'CONNECT' },
  { path: '/messages', label: '消息', group: 'CONNECT' },
  { path: '/activities', label: '活动', group: 'CONNECT' },
  { path: '/ai', label: 'AI 使用', group: 'CREATE' },
  { path: '/ai-lab', label: 'AI 实验室', group: 'CREATE' },
  { path: '/ask-archive', label: '问问档案', group: 'CREATE' },
  { path: '/social', label: '社交档案', group: 'ME' },
  { path: '/connected-apps', label: 'Connected Apps', group: 'ME' },
  { path: '/x', label: 'X 连接中心', group: 'CONNECT' },
  { path: '/creator-home', label: '创作者中心', group: 'CREATE' },
  { path: '/creator', label: 'Creator Lab', group: 'CREATE' },
  { path: '/code', label: 'Code Hub', group: 'CREATE' },
  { path: '/benefits', label: '福利', group: 'ME' },
  { path: '/membership', label: '会员', group: 'ME' },
  { path: '/me', label: '我的', group: 'ME' },
  { path: '/settings', label: '设置', group: 'ME' },
] as const;

/** Phase 3 archive utility routes are intentionally not added to the primary
 * shell navigation; they remain deep-linkable from archive surfaces. */
export const phase3ArchiveRoutes = ['/daily-pack', '/trash', '/export', '/privacy', '/archive-center', '/annual-archive'] as const;
export type AppRoute = (typeof appRoutes)[number]['path'] | (typeof phase3ArchiveRoutes)[number];
export type AppNavigationGroup = (typeof appRoutes)[number]['group'];

const knownRoutes = new Set<string>([
  ...appRoutes.map((route) => route.path),
  ...phase3ArchiveRoutes,
]);

export function normalizeRoute(pathname: string): AppRoute {
  if (pathname === '/home') return '/';
  return knownRoutes.has(pathname) ? (pathname as AppRoute) : '/';
}

/** The two home modes only change navigation expression, never business scope. */
export function routeForHomeMode(mode: 'STANDARD' | 'TOWN'): AppRoute {
  return mode === 'TOWN' ? '/town' : '/';
}

export function homeModeForRoute(route: AppRoute): 'STANDARD' | 'TOWN' {
  return route === '/town' ? 'TOWN' : 'STANDARD';
}

export function routeLabel(path: AppRoute): string {
  const phase3Labels: Readonly<Record<string, string>> = { '/daily-pack': 'Daily Pack', '/trash': '回收区', '/export': '导出', '/privacy': '隐私中心', '/archive-center': '便携档案', '/annual-archive': '年度档案' };
  return appRoutes.find((route) => route.path === path)?.label ?? phase3Labels[path] ?? '首页';
}

export const archiveEmptyStates = {
  '/life': {
    eyebrow: 'LIFE / PRIVATE',
    title: '生活档案等待你的第一条记录。',
    description: '生活记录默认仅属于你；准备好时再新建一条。',
  },
  '/timeline': {
    eyebrow: 'TIMELINE / PRIVATE',
    title: '时间轴会从你的第一条记录开始。',
    description: '生活、读书感悟、健身与 AI 使用会以你可见的私密事件汇聚在这里。',
  },
  '/history': {
    eyebrow: 'HISTORY / PRIVATE',
    title: '读书感悟尚未开始。',
    description: '你保存的阅读片段与个人感悟只会出现在自己的档案中。',
  },
  '/fitness': {
    eyebrow: 'FITNESS / PRIVATE',
    title: '今天还没有训练记录。',
    description: '运动与步数来源将在你明确启用相应功能后接入。',
  },
  '/daily-pack': {
    eyebrow: 'DAILY PACK / PRIVATE',
    title: '今日归档包',
    description: '按当前 owner 聚合 Life、读书感悟、Fitness 与 Steps 的索引状态。',
  },
  '/trash': {
    eyebrow: 'TRASH / PRIVATE',
    title: '回收区',
    description: '软删除记录会在永久删除前保留，并支持恢复。',
  },
  '/export': {
    eyebrow: 'EXPORT / PRIVATE',
    title: '导出我的档案',
    description: '导出当前 owner 的结构化记录；媒体暂为 MANIFEST_ONLY。',
  },
} as const satisfies Partial<
  Record<
    AppRoute,
    { readonly eyebrow: string; readonly title: string; readonly description: string }
  >
>;

export interface SearchEntry {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly route: AppRoute;
  readonly kind: 'COMMAND' | 'SURFACE';
}

export const mockSearchIndex: readonly SearchEntry[] = [
  {
    id: 'command-create',
    title: '新建记录',
    detail: '快速开始一条私人记录',
    route: '/',
    kind: 'COMMAND',
  },
  {
    id: 'command-town',
    title: '打开 ME Town',
    detail: '进入空间化导航',
    route: '/town',
    kind: 'COMMAND',
  },
  {
    id: 'surface-timeline',
    title: '时间轴',
    detail: '查看自己的私密事件',
    route: '/timeline',
    kind: 'SURFACE',
  },
  {
    id: 'surface-constellation',
    title: '星象馆',
    detail: '个人时间、里程碑与年度档案入口',
    route: '/constellation',
    kind: 'SURFACE',
  },
  {
    id: 'surface-community',
    title: '公开社区',
    detail: '浏览明确公开的内容',
    route: '/community',
    kind: 'SURFACE',
  },
  {
    id: 'surface-messages',
    title: '消息',
    detail: '会话与消息请求入口',
    route: '/messages',
    kind: 'SURFACE',
  },
  {
    id: 'surface-code',
    title: 'Code Hub',
    detail: '创作与发布入口',
    route: '/code',
    kind: 'SURFACE',
  },
  {
    id: 'surface-ai-usage',
    title: 'AI 使用记录',
    detail: '查看自己的使用时长、设备与导出',
    route: '/ai',
    kind: 'SURFACE',
  },
  {
    id: 'surface-ai-lab',
    title: 'AI 实验室',
    detail: '在明确提交后使用服务端 AI Gateway',
    route: '/ai-lab',
    kind: 'SURFACE',
  },
  {
    id: 'surface-ask-archive',
    title: '问问我的档案',
    detail: '在明确范围内检索并引用自己的记录',
    route: '/ask-archive',
    kind: 'SURFACE',
  },
  {
    id: 'surface-social-archive',
    title: '外部社交档案',
    detail: 'X、Douyin 与手动链接收藏；私人默认',
    route: '/social',
    kind: 'SURFACE',
  },
  {
    id: 'surface-connected-apps',
    title: 'Connected Apps',
    detail: '管理公开链接、手动资料与官方授权连接；私密默认',
    route: '/connected-apps',
    kind: 'SURFACE',
  },
  {
    id: 'surface-x-connection-center',
    title: 'X 连接中心',
    detail: '通过官方 OAuth 私密整理自己的推文、收藏和点赞',
    route: '/x',
    kind: 'SURFACE',
  },
  {
    id: 'surface-portable-archive',
    title: '便携档案',
    detail: '创建、校验、导入与恢复 .mezip Archive',
    route: '/archive-center',
    kind: 'SURFACE',
  },
] as const;

export interface TownZone {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly route: AppRoute;
  readonly tone: 'life' | 'history' | 'fitness' | 'community' | 'ai' | 'neutral';
}

export const mockTownZones: readonly TownZone[] = [
  { id: 'home', name: '我的家', label: 'Life', route: '/life', tone: 'life' },
  {
    id: 'archive',
    name: '档案馆',
    label: 'Timeline · Daily Pack',
    route: '/timeline',
    tone: 'neutral',
  },
  {
    id: 'library',
    name: '图书馆',
    label: 'Reading · Insights',
    route: '/history',
    tone: 'history',
  },
  {
    id: 'park',
    name: '健身公园',
    label: 'Fitness · Steps',
    route: '/fitness',
    tone: 'fitness',
  },
  {
    id: 'square',
    name: '社区广场',
    label: 'Community · Feed',
    route: '/community',
    tone: 'community',
  },
  {
    id: 'club',
    name: '社群会所',
    label: 'Groups',
    route: '/community',
    tone: 'community',
  },
  {
    id: 'events',
    name: '活动中心',
    label: 'Activities · Calendar',
    route: '/activities',
    tone: 'neutral',
  },
  {
    id: 'post',
    name: '邮局',
    label: 'Messages · Inbox',
    route: '/messages',
    tone: 'neutral',
  },
  {
    id: 'membership',
    name: '会员中心',
    label: 'Plans · Entitlements',
    route: '/membership',
    tone: 'neutral',
  },
  {
    id: 'benefits',
    name: '福利屋',
    label: 'Coupons · Rewards',
    route: '/benefits',
    tone: 'neutral',
  },
  {
    id: 'founder',
    name: 'Founder Club',
    label: 'Published snapshots only',
    route: '/membership',
    tone: 'community',
  },
  {
    id: 'ai',
    name: 'AI 实验室',
    label: 'Models · Assistants',
    route: '/ai-lab',
    tone: 'ai',
  },
  {
    id: 'creator',
    name: 'Creator Lab',
    label: 'Vibe Coding · Code Hub',
    route: '/creator',
    tone: 'ai',
  },
  {
    id: 'stars',
    name: '星象馆',
    label: 'Calendar · Milestones',
    route: '/constellation',
    tone: 'history',
  },
  {
    id: 'space',
    name: '我的空间',
    label: 'Profile · Privacy · Settings',
    route: '/me',
    tone: 'life',
  },
] as const;

export interface MessagePreview {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly unread: number;
  readonly kind: 'SYSTEM' | 'PLACEHOLDER';
}

export const mockMessagePreviews: readonly MessagePreview[] = [
  {
    id: 'message-system',
    title: 'ME.zip · 觅迹系统',
    detail: '消息服务尚未连接；不会展示其他人的私人消息。',
    unread: 0,
    kind: 'SYSTEM',
  },
  {
    id: 'message-placeholder',
    title: '消息请求',
    detail: '未来会在这里以同意、拒绝、屏蔽与举报流程处理。',
    unread: 0,
    kind: 'PLACEHOLDER',
  },
] as const;

export const mockTownWeather = {
  label: '夜间晴朗',
  detail: 'Mock Weather · 未请求定位',
  state: 'NIGHT',
} as const;

export const mockConstellationTheme = {
  state: 'STATIC',
  stars: [1, 2, 3, 4, 5, 6, 7] as const,
  title: '你的时间会在这里连成线',
  description:
    '等待你主动添加生日、纪念日与里程碑；不会请求位置，也不会生成个性化预言。',
} as const;

export const mockMusicMetadata = {
  titleZh: '夜间漫步',
  titleOriginal: 'Midnight Stroll',
  artist: 'ME.zip Ambient · 演示元数据',
  language: 'English',
  duration: '03:24',
} as const;

export const mockBenefits = [
  {
    id: 'benefit-empty',
    title: '尚未有已发放福利',
    detail: '未来的兑换码、临时权益与奖励由服务端审计与授权。',
  },
] as const;
