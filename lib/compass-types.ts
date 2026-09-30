export const compassHabits = ['写日记', '运动', '阅读'] as const;
export const compassQuestions = ['今天，我尽力设定明确目标了吗？', '今天，我尽力朝目标前进了吗？', '今天，我尽力寻找意义了吗？', '今天，我尽力让自己快乐了吗？', '今天，我尽力建立积极关系了吗？', '今天，我尽力保持投入了吗？'] as const;
export const compassKinds = { Journal: '日记', Wins: '今日收获', Gratitude: '感恩' } as const;
export type CompassKind = keyof typeof compassKinds;
export type CompassEntry = { id: string; date: string; kind: CompassKind; text: string; created: number };
export type CompassTask = { id: string; text: string; due: string | null; done: boolean; version: number };
export type CompassDay = { habits: boolean[]; scores: (number | null)[]; version: number };
export type CompassState = { date: string; day: CompassDay; entries: CompassEntry[]; tasks: CompassTask[] };
export function validCompassDate(value: unknown): value is string {
  return typeof value === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10) === value;
}
export function compassToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function emptyCompassDay(): CompassDay { return { habits: [false,false,false], scores: [null,null,null,null,null,null], version: 0 }; }
