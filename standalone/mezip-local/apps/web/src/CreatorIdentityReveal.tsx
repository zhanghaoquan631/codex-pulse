import {
  Component,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type UIEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

import { approvedCreatorProfile, type CreatorIntroStage } from '@me-zip/shared-types';

import type { ExperienceTier } from './experienceSettings.js';
import {
  creatorIntroEntranceTimeline,
  creatorIntroReverseTimeline,
  markCreatorIntroSeen,
  readCreatorIntroPreference,
  saveCreatorIntroPreference,
  setCreatorIntroDisabled,
  transitionCreatorIntro,
} from './creatorIntroModel.js';

interface CreatorIdentityRevealProps {
  readonly tier: ExperienceTier;
  readonly onContinueLogin: () => void;
  readonly onSkipLogin: () => void;
  readonly onFailOpen: () => void;
}

interface RevealBoundaryProps extends CreatorIdentityRevealProps {
  readonly children: ReactNode;
}

interface RevealBoundaryState {
  readonly failed: boolean;
}

class CreatorIntroErrorBoundary extends Component<
  RevealBoundaryProps,
  RevealBoundaryState
> {
  public state: RevealBoundaryState = { failed: false };

  public static getDerivedStateFromError(): RevealBoundaryState {
    return { failed: true };
  }

  public componentDidCatch(): void {
    this.props.onFailOpen();
  }

  public render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

const sectionCards = [
  {
    label: 'IDENTITY',
    content: `${approvedCreatorProfile.name} · ${approvedCreatorProfile.alias}`,
  },
  { label: 'ABOUT', content: '观察行为、注意力与决策。' },
  { label: 'DESIGN', content: '探索设计与技术之间。' },
  { label: 'LIFE', content: '灵感、社区与偶尔的占星。' },
  { label: 'CONTACT', content: approvedCreatorProfile.email },
] as const;

function CreatorAvatar({ compact = false }: { readonly compact?: boolean }) {
  return (
    <span
      className={`creator-intro-avatar${compact ? '' : ' creator-intro-avatar-large'}`}
      aria-hidden="true"
    >
      <i className="creator-intro-avatar-hair" />
      <i className="creator-intro-avatar-glasses" />
      <i className="creator-intro-avatar-mouth" />
    </span>
  );
}

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((node) => !node.hasAttribute('hidden'));
}

function setInitialTilt(): { readonly x: number; readonly y: number } {
  return { x: 0, y: 0 };
}

function updateCreatorReveal(card: HTMLElement): void {
  const cardRect = card.getBoundingClientRect();
  const revealDistance = Math.max(card.clientHeight * 0.72, 1);
  const reachedBottom = card.scrollTop + card.clientHeight >= card.scrollHeight - 2;
  const revealNodes = Array.from(
    card.querySelectorAll<HTMLElement>('.creator-intro-scroll-copy'),
  );

  revealNodes.forEach((node) => {
    const nodeRect = node.getBoundingClientRect();
    const progress = Math.max(
      0,
      Math.min(
        1,
        reachedBottom ? 1 : (cardRect.bottom - nodeRect.top) / revealDistance,
      ),
    );
    node.style.setProperty('--creator-scroll-reveal', `${Math.round(progress * 100)}%`);
  });
}

function CreatorIdentityRevealStage({
  tier,
  onContinueLogin,
  onSkipLogin,
}: Omit<CreatorIdentityRevealProps, 'onFailOpen'>) {
  const [stage, setStage] = useState<CreatorIntroStage>('IDLE');
  const [disableNext, setDisableNext] = useState(false);
  const [cardDismissed, setCardDismissed] = useState(false);
  const [toast, setToast] = useState('');
  const [tilt, setTilt] = useState(setInitialTilt);
  const rootRef = useRef<HTMLElement>(null);
  const profileCardRef = useRef<HTMLElement>(null);
  const completedRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof window.setTimeout>[]>([]);

  const clearTimers = () => {
    for (const timer of timersRef.current) window.clearTimeout(timer);
    timersRef.current = [];
  };

  const finish = (kind: 'continue' | 'skip') => {
    if (completedRef.current) return;
    completedRef.current = true;
    clearTimers();
    setStage('COMPLETE');
    if (kind === 'continue') onContinueLogin();
    else onSkipLogin();
  };

  const scheduleEntrance = () => {
    let elapsed = 0;
    for (const item of creatorIntroEntranceTimeline) {
      elapsed += item.delayMs;
      timersRef.current.push(window.setTimeout(() => setStage(item.stage), elapsed));
    }
  };

  useEffect(() => {
    const storage = typeof window === 'undefined' ? undefined : window.localStorage;
    const preference = readCreatorIntroPreference(storage);
    saveCreatorIntroPreference(markCreatorIntroSeen(preference.preference), storage);
    if (profileCardRef.current !== null) {
      profileCardRef.current.scrollTop = 0;
      updateCreatorReveal(profileCardRef.current);
    }
    scheduleEntrance();
    rootRef.current?.focus();
    return clearTimers;
  }, []);

  useEffect(() => {
    const card = profileCardRef.current;
    if (card === null) return;
    const frame = window.requestAnimationFrame(() => updateCreatorReveal(card));
    return () => window.cancelAnimationFrame(frame);
  }, [stage]);

  const runReverse = (kind: 'continue' | 'skip') => {
    if (completedRef.current || stage === 'EXITING' || stage === 'COMPLETE') return;
    clearTimers();
    const storage = typeof window === 'undefined' ? undefined : window.localStorage;
    const current = readCreatorIntroPreference(storage).preference;
    const next = disableNext
      ? setCreatorIntroDisabled(current, true)
      : markCreatorIntroSeen(current);
    saveCreatorIntroPreference(next, storage);

    if (kind === 'skip') {
      setStage(transitionCreatorIntro(stage, 'SKIP'));
      timersRef.current.push(window.setTimeout(() => finish('skip'), 160));
      return;
    }

    for (const item of creatorIntroReverseTimeline) {
      timersRef.current.push(
        window.setTimeout(() => {
          setStage(item.stage);
          if (item.stage === 'COMPLETE') finish('continue');
        }, item.delayMs),
      );
    }
  };

  const dismissCard = () => {
    if (completedRef.current) return;
    clearTimers();
    setStage('READY');
    setCardDismissed(true);
  };

  const reopenCard = () => {
    setCardDismissed(false);
    setStage('READY');
    window.requestAnimationFrame(() => {
      if (profileCardRef.current === null) return;
      profileCardRef.current.scrollTop = 0;
      updateCreatorReveal(profileCardRef.current);
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      dismissCard();
      return;
    }
    if (event.key !== 'Tab' || rootRef.current === null) return;
    const items = focusables(rootRef.current);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (tier !== 'FULL') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(
      -3,
      Math.min(3, ((event.clientX - rect.left) / rect.width - 0.5) * 6),
    );
    const y = Math.max(
      -3,
      Math.min(3, (0.5 - (event.clientY - rect.top) / rect.height) * 6),
    );
    setTilt({ x, y });
  };

  const copyEmail = async () => {
    try {
      if (navigator.clipboard?.writeText !== undefined) {
        await navigator.clipboard.writeText(approvedCreatorProfile.email);
      } else {
        const temporary = document.createElement('textarea');
        temporary.value = approvedCreatorProfile.email;
        temporary.setAttribute('readonly', '');
        temporary.style.position = 'fixed';
        temporary.style.opacity = '0';
        document.body.append(temporary);
        temporary.select();
        const copied = document.execCommand('copy');
        temporary.remove();
        if (!copied) throw new Error('copy unavailable');
      }
      setToast('邮箱已复制。');
    } catch {
      setToast('暂时无法复制邮箱；你仍可使用邮件链接联系我。');
    }
  };

  const profileStyle = {
    '--creator-tilt-x': `${tilt.x}deg`,
    '--creator-tilt-y': `${tilt.y}deg`,
  } as CSSProperties;

  return (
    <section
      ref={rootRef}
      className={`creator-intro-stage${cardDismissed ? ' creator-intro-stage-card-dismissed' : ''}`}
      data-stage={stage}
      data-tier={tier}
      role="dialog"
      aria-modal="true"
      aria-label="Creator Identity Reveal"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setTilt(setInitialTilt())}
    >
      <div className="creator-intro-backdrop" aria-hidden="true" />
      <div className="creator-intro-townscape" aria-hidden="true" />
      <div className="creator-intro-scene" style={profileStyle}>
        <div
          className="creator-intro-chip"
          aria-label={`${approvedCreatorProfile.name}，${approvedCreatorProfile.title}`}
        >
          <CreatorAvatar compact />
          <span>
            <strong>{approvedCreatorProfile.alias}</strong>
            <small className="creator-font-preserve">{approvedCreatorProfile.title}</small>
          </span>
          <i aria-hidden="true" />
        </div>

        <div className="creator-intro-card-stack" aria-hidden="true">
          {sectionCards.map((card, index) => (
            <article
              className="creator-intro-stack-card"
              data-card={index}
              key={card.label}
            >
              <span>{card.label}</span>
              <small>{card.content}</small>
            </article>
          ))}
        </div>

        <article
          ref={profileCardRef}
          className="creator-intro-profile-card"
          tabIndex={0}
          onScroll={(event: UIEvent<HTMLElement>) =>
            updateCreatorReveal(event.currentTarget)
          }
        >
          <button
            className="creator-intro-close"
            type="button"
            aria-label="关闭资料卡"
            title="关闭资料卡"
            onClick={dismissCard}
          >
            <span aria-hidden="true">×</span>
          </button>
          <header className="creator-intro-profile-header creator-intro-reveal creator-intro-reveal-identity">
            <CreatorAvatar />
            <div>
              <p className="eyebrow">IDENTITY / 01</p>
              <h1>{approvedCreatorProfile.alias}</h1>
              <p className="creator-intro-scroll-copy">
                <span className="creator-font-preserve">
                  {approvedCreatorProfile.name}
                </span>{' '}
                ·{' '}
                <span className="creator-font-preserve">
                  {approvedCreatorProfile.title}
                </span>
              </p>
              <small className="creator-intro-scroll-copy">
                {approvedCreatorProfile.titleEn} · Born {approvedCreatorProfile.born}
              </small>
            </div>
          </header>
          <section className="creator-intro-profile-section creator-intro-reveal creator-intro-reveal-about">
            <p className="eyebrow">ABOUT / 02</p>
            {approvedCreatorProfile.about.map((paragraph) => (
              <p className="creator-intro-scroll-copy" key={paragraph}>
                {paragraph}
              </p>
            ))}
          </section>
          <section className="creator-intro-profile-section creator-intro-reveal creator-intro-reveal-design">
            <p className="eyebrow">DESIGN × TECHNOLOGY / 03</p>
            {approvedCreatorProfile.designTechnology.map((paragraph) => (
              <p className="creator-intro-scroll-copy" key={paragraph}>
                {paragraph}
              </p>
            ))}
          </section>
          <section className="creator-intro-profile-section creator-intro-reveal creator-intro-reveal-life">
            <p className="eyebrow">OFF HOURS / 04</p>
            <p className="creator-intro-scroll-copy">{approvedCreatorProfile.offHours}</p>
          </section>
          <section className="creator-intro-profile-section creator-intro-personal-detail creator-intro-reveal creator-intro-reveal-detail">
            <p className="eyebrow">PERSONAL DETAIL / 05</p>
            <p className="creator-intro-scroll-copy">
              {approvedCreatorProfile.personalDetail}
            </p>
          </section>
          <footer className="creator-intro-contact creator-intro-reveal creator-intro-reveal-contact">
            <p className="eyebrow">CONTACT / 06</p>
            <a className="creator-intro-scroll-copy" href={`mailto:${approvedCreatorProfile.email}`}>
              {approvedCreatorProfile.email}
            </a>
            <button
              type="button"
              className="quiet-button creator-intro-copy"
              onClick={() => void copyEmail()}
            >
              Copy Email
            </button>
          </footer>
          <footer className="creator-intro-actions creator-intro-reveal">
            <label className="creator-intro-disable">
              <input
                type="checkbox"
                checked={disableNext}
                onChange={(event) => setDisableNext(event.target.checked)}
              />
              下次不再显示
            </label>
            <button
              className="quiet-button creator-intro-skip"
              type="button"
              onClick={() => runReverse('skip')}
            >
              跳过介绍 <kbd>Esc</kbd>
            </button>
            <button
              className="create-button creator-intro-continue"
              type="button"
              onClick={() => runReverse('continue')}
            >
              继续探索 →
            </button>
          </footer>
          <p className="creator-intro-access-note creator-intro-reveal">
            这是公开 Creator 介绍；不会读取你的私人档案、消息、AI 或健康记录。
          </p>
        </article>
      </div>
      {cardDismissed ? (
        <div className="creator-intro-background-actions" role="group" aria-label="Creator 背景操作">
          <p className="eyebrow">CREATOR TOWN / BACKDROP</p>
          <h2>夜空小镇仍在这里。</h2>
          <p>资料卡已收起，背景场景不会被关闭；你可以重新打开卡片，或返回登录。</p>
          <div className="creator-intro-background-actions-row">
            <button className="quiet-button" type="button" onClick={reopenCard}>
              重新打开资料卡
            </button>
            <button className="create-button" type="button" onClick={onSkipLogin}>
              返回登录
            </button>
          </div>
        </div>
      ) : null}
      {toast !== '' ? (
        <p className="creator-intro-toast" role="status" aria-live="polite">
          {toast}
        </p>
      ) : null}
    </section>
  );
}

export function CreatorIdentityReveal(props: CreatorIdentityRevealProps) {
  return (
    <CreatorIntroErrorBoundary {...props}>
      <CreatorIdentityRevealStage {...props} />
    </CreatorIntroErrorBoundary>
  );
}
