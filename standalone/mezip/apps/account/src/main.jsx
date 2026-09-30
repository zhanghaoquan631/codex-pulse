import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import LoginGate from './LoginGate.jsx';
import { chatGPTSignOutPath } from './chatgpt-auth.mjs';
import './styles.css';

const ProtectedApp = lazy(() => import('./ProtectedApp.jsx'));

function RootApp() {
  const [authState, setAuthState] = useState('loading');
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [showLogin, setShowLogin] = useState(() => window.location.hash === '#login');
  const reloadSession = useRef(() => {});

  useEffect(() => {
    const syncLoginRoute = () => setShowLogin(window.location.hash === '#login');
    window.addEventListener('hashchange', syncLoginRoute);
    window.addEventListener('popstate', syncLoginRoute);
    return () => {
      window.removeEventListener('hashchange', syncLoginRoute);
      window.removeEventListener('popstate', syncLoginRoute);
    };
  }, []);

  useEffect(() => {
    let cancelled = false, controller;
    const loadSession = async () => {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      try {
        const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store', signal: current.signal });
        if (!response.ok) throw new Error('登录状态暂时无法确认，请重试。');
        const payload = await response.json();
        if (cancelled || current.signal.aborted) return;
        setUser(payload.authenticated ? payload.user : null);
        setAuthState(payload.authenticated ? 'authenticated' : 'guest');
        setError('');
        const url = new URL(window.location.href);
        const changed = url.searchParams.get('auth') === 'changed';
        if (changed) {
          url.searchParams.delete('auth');
          if (payload.authenticated) url.hash = '';
          window.history.replaceState({}, '', url.pathname + url.search + url.hash);
          setShowLogin(url.hash === '#login');
        }
        if (changed && 'BroadcastChannel' in window) {
          const channel = new BroadcastChannel('mezip-auth');
          channel.postMessage('changed');
          channel.close();
        }
      } catch (failure) {
        if (cancelled || current.signal.aborted) return;
        setUser(null);
        setAuthState('guest');
        setError(failure.message || '登录状态暂时无法确认，请重试。');
      }
    };
    reloadSession.current = loadSession;
    const visible = () => { if (document.visibilityState === 'visible') loadSession(); };
    const pageshow = event => { if (event.persisted) loadSession(); };
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel('mezip-auth') : null;
    if (channel) channel.onmessage = event => { if (event.data === 'changed') loadSession(); };
    window.addEventListener('focus', loadSession);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('pageshow', pageshow);
    loadSession();
    return () => {
      cancelled = true;
      controller?.abort();
      channel?.close();
      window.removeEventListener('focus', loadSession);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('pageshow', pageshow);
    };
  }, []);

  return authState === 'authenticated' && !showLogin
    ? <Suspense fallback={<main className="auth-boot-screen" aria-label="正在加载个人空间"><span>ME·zip</span><small>Pro</small></main>}>
        <ProtectedApp signOutPath={chatGPTSignOutPath()} user={user} />
      </Suspense>
    : <LoginGate error={error} loading={authState === 'loading'} onRetry={() => reloadSession.current()} />;
}

createRoot(document.getElementById('root')).render(<RootApp />);
