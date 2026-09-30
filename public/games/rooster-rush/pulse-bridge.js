let state = 'loading';
export function announceState(next) {
  state = next;
  if (window.parent !== window) window.parent.postMessage({type:'pulse-rooster-state',state}, window.location.origin);
}
window.addEventListener('message', event => {
  if (event.origin === window.location.origin && event.source === window.parent && event.data?.type === 'pulse-rooster-ping') announceState(state);
});
window.addEventListener('error', () => announceState('error'));
window.addEventListener('unhandledrejection', () => announceState('error'));
