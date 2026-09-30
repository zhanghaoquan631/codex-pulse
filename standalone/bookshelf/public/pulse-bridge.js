// Readiness only: never send book records, credentials, notes or files.
const pulseOrigin = 'https://codex-pulse-willow-0911.wozhe0196.chatgpt.site';
export function installPulseBridge(isReady, target = window) {
  if (target.parent === target) return () => {};
  const receive = event => {
    if (event.origin !== pulseOrigin || event.source !== target.parent || event.data?.type !== 'pulse:bookshelf:ping' || typeof event.data.requestId !== 'string' || event.data.requestId.length > 100 || !isReady()) return;
    target.parent.postMessage({type:'bookshelf:ready',requestId:event.data.requestId},pulseOrigin);
  };
  target.addEventListener('message',receive);
  return () => target.removeEventListener('message',receive);
}
