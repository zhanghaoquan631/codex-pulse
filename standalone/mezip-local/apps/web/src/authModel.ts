export const authStates = [
  'DEFAULT',
  'LOADING',
  'SUCCESS',
  'ERROR',
  'OFFLINE',
  'OTP_SENT',
  'OTP_INVALID',
  'OTP_EXPIRED',
  'TOO_MANY_ATTEMPTS',
  'PROVIDER_UNAVAILABLE',
  'SESSION_EXPIRED',
  'ACCOUNT_LINKING_REQUIRED',
] as const;

export type AuthStateKind = (typeof authStates)[number];
export type AuthProvider = 'WECHAT' | 'PHONE' | 'EMAIL' | 'GOOGLE';

export interface AuthState {
  readonly kind: AuthStateKind;
  readonly provider: AuthProvider | null;
  readonly identifier: string;
  readonly challengeId: string | null;
  readonly attempts: number;
  readonly cooldownSeconds: number;
  readonly message: string;
}

export type AuthAction =
  | { readonly type: 'SELECT_PROVIDER'; readonly provider: AuthProvider }
  | { readonly type: 'START_LOADING' }
  | {
      readonly type: 'OTP_SENT';
      readonly challengeId: string;
      readonly identifier: string;
      readonly cooldownSeconds: number;
    }
  | { readonly type: 'OTP_INVALID'; readonly attempts: number }
  | { readonly type: 'OTP_EXPIRED' }
  | { readonly type: 'TOO_MANY_ATTEMPTS' }
  | { readonly type: 'PROVIDER_UNAVAILABLE' }
  | { readonly type: 'OFFLINE' }
  | { readonly type: 'SUCCESS' }
  | { readonly type: 'SESSION_EXPIRED' }
  | { readonly type: 'ACCOUNT_LINKING_REQUIRED' }
  | { readonly type: 'ERROR'; readonly message: string }
  | { readonly type: 'RESET' };

export const initialAuthState: AuthState = {
  kind: 'DEFAULT',
  provider: null,
  identifier: '',
  challengeId: null,
  attempts: 0,
  cooldownSeconds: 0,
  message: '',
};

const messages: Record<AuthStateKind, string> = {
  DEFAULT: '',
  LOADING: '正在安全连接…',
  SUCCESS: '验证成功，正在打开你的私人档案。',
  ERROR: '暂时无法完成验证，请稍后重试。',
  OFFLINE: '当前处于离线状态。恢复连接后可以继续。',
  OTP_SENT: '验证码验证流程已准备好，请在有效期内完成验证。',
  OTP_INVALID: '验证码不正确，请检查后再试。',
  OTP_EXPIRED: '验证码已过期，请重新发送。',
  TOO_MANY_ATTEMPTS: '尝试次数过多，请稍后重新开始。',
  PROVIDER_UNAVAILABLE: '该登录方式暂时不可用，请选择其他方式。',
  SESSION_EXPIRED: '会话已过期，请重新验证。',
  ACCOUNT_LINKING_REQUIRED: '需要验证新身份，才能安全合并到同一个 User。',
};

export function reduceAuthState(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SELECT_PROVIDER':
      return {
        ...initialAuthState,
        provider: action.provider,
      };
    case 'START_LOADING':
      return { ...state, kind: 'LOADING', message: messages.LOADING };
    case 'OTP_SENT':
      return {
        ...state,
        kind: 'OTP_SENT',
        challengeId: action.challengeId,
        identifier: action.identifier,
        attempts: 0,
        cooldownSeconds: action.cooldownSeconds,
        message: messages.OTP_SENT,
      };
    case 'OTP_INVALID':
      return {
        ...state,
        kind: 'OTP_INVALID',
        attempts: action.attempts,
        message: messages.OTP_INVALID,
      };
    case 'OTP_EXPIRED':
      return { ...state, kind: 'OTP_EXPIRED', message: messages.OTP_EXPIRED };
    case 'TOO_MANY_ATTEMPTS':
      return {
        ...state,
        kind: 'TOO_MANY_ATTEMPTS',
        message: messages.TOO_MANY_ATTEMPTS,
      };
    case 'PROVIDER_UNAVAILABLE':
      return {
        ...state,
        kind: 'PROVIDER_UNAVAILABLE',
        message: messages.PROVIDER_UNAVAILABLE,
      };
    case 'OFFLINE':
      return { ...state, kind: 'OFFLINE', message: messages.OFFLINE };
    case 'SUCCESS':
      return { ...state, kind: 'SUCCESS', message: messages.SUCCESS };
    case 'SESSION_EXPIRED':
      return { ...state, kind: 'SESSION_EXPIRED', message: messages.SESSION_EXPIRED };
    case 'ACCOUNT_LINKING_REQUIRED':
      return {
        ...state,
        kind: 'ACCOUNT_LINKING_REQUIRED',
        message: messages.ACCOUNT_LINKING_REQUIRED,
      };
    case 'ERROR':
      return { ...state, kind: 'ERROR', message: action.message };
    case 'RESET':
      return initialAuthState;
    default:
      return state;
  }
}

export function maskIdentifier(identifier: string): string {
  const trimmed = identifier.trim();
  if (trimmed.includes('@')) {
    const [local = '', domain = ''] = trimmed.split('@');
    const safeLocal =
      local.length <= 2 ? `${local.slice(0, 1)}*` : `${local.slice(0, 2)}***`;
    return `${safeLocal}@${domain}`;
  }
  if (trimmed.length <= 4) return '****';
  return `${trimmed.slice(0, 3)}****${trimmed.slice(-2)}`;
}
