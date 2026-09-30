export const desktopNavigation = [
  '首页',
  '时间轴',
  'AI',
  '微信运动',
  '读书感悟',
  '历史案例',
  '健身',
  '生活',
] as const;

export const creatorNavigation = [
  '社区',
  '消息',
  'Creator',
  'Vibe Coding',
  'Code Hub',
] as const;
export const accountNavigation = ['统计', '设备', '会员', '设置'] as const;

export const todayMetrics = [
  {
    key: 'steps',
    label: '今日步数',
    value: '—',
    state: '尚未连接数据源',
    accent: 'movement',
  },
  {
    key: 'ai-total',
    label: 'AI 总时间',
    value: '—',
    state: '尚无 Session',
    accent: 'ai',
  },
  { key: 'ai-pc', label: '电脑 AI', value: '—', state: '等待设备接入', accent: 'ai' },
  { key: 'ai-mobile', label: '手机 AI', value: '—', state: '尚无记录', accent: 'ai' },
  {
    key: 'training',
    label: '今日训练',
    value: '—',
    state: '尚无记录',
    accent: 'fitness',
  },
  {
    key: 'history',
    label: '今日读书感悟',
    value: '—',
    state: '尚无记录',
    accent: 'history',
  },
] as const;

export const createActions = [
  '记录生活',
  '写读书感悟',
  '记录健身',
  '发动态',
  '上传图片',
  '上传视频',
  '创建案例',
] as const;

export function routeForQuickAction(action: (typeof createActions)[number]): AppRoute {
  if (action === '写读书感悟') return '/history';
  if (action === '记录健身') return '/fitness';
  if (action === '发动态') return '/community';
  return '/life';
}
import type { AppRoute } from './appModel.js';
