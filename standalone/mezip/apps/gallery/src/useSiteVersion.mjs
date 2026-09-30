import { useCallback, useEffect, useRef, useState } from 'react';

export const SITE_VERSION = 'r6-settings-paid-lock-1';
export function useSiteVersion() {
  const [status, setStatus] = useState('checking');
  const [remoteVersion, setRemoteVersion] = useState(null);
  const mounted = useRef(false), inFlight = useRef(null);
  const check = useCallback(async () => {
    if (inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/gallery-version.json?t=' + Date.now(), { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('version unavailable');
      const data = await response.json();
      if (typeof data.version !== 'string' || !data.version) throw new Error('invalid version');
      if (mounted.current) {
        setRemoteVersion(data.version);
        setStatus(data.version === SITE_VERSION ? 'current' : 'update');
      }
    } catch {
      if (mounted.current) setStatus('error');
    } finally {
      clearTimeout(timeout);
      inFlight.current = null;
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    check();
    const interval = setInterval(check, 30000);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mounted.current = false;
      clearInterval(interval);
      inFlight.current?.abort();
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);
  return { status, remoteVersion, check };
}
