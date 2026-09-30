export const catStates = [
  'IDLE',
  'WELCOME',
  'REMINDER',
  'PACKING',
  'DONE',
  'HAPPY',
  'THINKING',
  'SLEEPING',
] as const;
export type CatState = (typeof catStates)[number];

export const catEmotions = [
  'CALM',
  'HAPPY',
  'CURIOUS',
  'THINKING',
  'DONE',
  'RESTING',
] as const;
export type CatEmotion = (typeof catEmotions)[number];

export interface CatDialogue {
  readonly state: CatState;
  readonly emotion: CatEmotion;
  readonly text: string;
}

const localDialoguePool: readonly CatDialogue[] = [
  { state: 'REMINDER', emotion: 'CURIOUS', text: '今天要不要留下一点什么？' },
  { state: 'WELCOME', emotion: 'CALM', text: '我在呢，慢慢把今天放进档案。' },
  { state: 'PACKING', emotion: 'THINKING', text: '正在把今天的小片段收好。' },
  { state: 'DONE', emotion: 'DONE', text: '今天已经保存好了。' },
  { state: 'HAPPY', emotion: 'HAPPY', text: '又记录了一天。' },
  { state: 'SLEEPING', emotion: 'RESTING', text: '今天似乎很安静，也没关系。' },
] as const;

export interface CatDialogueService {
  next(random?: () => number): CatDialogue;
}

/** Local-only first version: tapping the cat never creates an AI request. */
export class LocalCatDialogueService implements CatDialogueService {
  next(random: () => number = Math.random): CatDialogue {
    const index = Math.min(
      localDialoguePool.length - 1,
      Math.max(0, Math.floor(random() * localDialoguePool.length)),
    );
    return localDialoguePool[index] ?? localDialoguePool[0]!;
  }
}

export function catStateForSearch(
  isFocused: boolean,
  query: string,
  hasResults: boolean,
): CatState {
  if (!isFocused) return 'IDLE';
  if (query.trim().length === 0) return 'WELCOME';
  return hasResults ? 'HAPPY' : 'THINKING';
}
